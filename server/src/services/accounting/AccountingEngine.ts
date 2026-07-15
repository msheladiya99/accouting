/**
 * AccountingEngine.ts
 *
 * Single source of truth for all accounting calculations.
 * Every report service calls into here — nothing computes independently.
 *
 * Design principles:
 *  - MongoDB aggregation pipelines instead of pulling documents into Node
 *  - .lean() on all reads
 *  - Projection: only select fields needed
 *  - Promise.all() to parallelise independent queries
 *  - No full-collection dumps; filter at query time
 */

import mongoose from "mongoose";
import { JournalEntry } from "../../models/JournalEntry";
import { BankCashEntry } from "../../models/BankCashEntry";
import { BankCashAccount } from "../../models/BankCashAccount";
import { Ledger } from "../../models/Ledger";
import { AccountGroup } from "../../models/AccountGroup";
import { FinancialYear } from "../../models/FinancialYear";
import { ReportCacheService } from "./ReportCacheService";

// ── Shared Types ────────────────────────────────────────────────────────────────

export interface TrialRow {
  ledgerName: string;
  group: string;
  openingDr: number;
  openingCr: number;
  transactionDr: number;
  transactionCr: number;
  closingDr: number;
  closingCr: number;
}

export interface TrialSummary {
  rows: TrialRow[];
  stats: {
    openingLedgers: number;
    bankCashEntries: number;
    journalEntries: number;
    totalLedgers: number;
  };
}

export interface PLEntry { ledgerName: string; amount: number; }
export interface PLSection { entries: PLEntry[]; total: number; }

export interface PLData {
  sales: PLSection;
  otherIncome: PLSection;
  directExpenses: PLSection;
  indirectExpenses: PLSection;
  totalIncome: number;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
  isProfit: boolean;
  dateFrom: string;
  dateTo: string;
  bankCashTxns: number;
  journalTxns: number;
}

export interface BSLedger { ledgerName: string; amount: number; }
export interface BSGroup  { groupKey: string; groupName: string; ledgers: BSLedger[]; total: number; }
export interface BSSection { sectionName: string; groups: BSGroup[]; total: number; }

export interface BalanceSheetData {
  assetsSection: BSSection;
  liabCapSection: BSSection;
  netProfit: number;
  totalAssets: number;
  totalLiabCap: number;
  isBalanced: boolean;
  difference: number;
  generatedAt: string;
  stats: { openingLedgers: number; bankCashEntries: number; journalEntries: number; };
  // Trading & P&L (injected into same response so frontend needs one call)
  tradingPL: TradingPLData;
  capitalAccounts: PartnerCapitalAccount[];
}

export interface TradingPLData {
  openingStockRows: { name: string; amount: number }[];
  closingStockRows:  { name: string; amount: number }[];
  purchaseRows:      { name: string; amount: number }[];
  directExpRows:     { name: string; amount: number }[];
  salesRows:         { name: string; amount: number }[];
  indirectIncomeRows:{ name: string; amount: number }[];
  indirectExpRows:   { name: string; amount: number }[];
  depreciationRows:  { name: string; amount: number }[];
  financialExpRows:  { name: string; amount: number }[];
  totalOpeningStock: number;
  totalClosingStock: number;
  totalPurchases: number;
  totalDirectExp: number;
  totalSales: number;
  totalIndirectIncome: number;
  totalFinancialExp: number;
  totalDepreciation: number;
  totalIndirectExp: number;
  grossProfit: number;
  netProfit: number;
}

export interface CapitalTxn { particulars: string; amount?: number; }
export interface PartnerCapitalAccount {
  ledgerName: string;
  debits: CapitalTxn[];
  credits: CapitalTxn[];
  total: number;
}

export interface BookRow {
  srNo: number;
  date: string;
  accountName: string;
  accountGroup: string;
  particulars: string;
  withdrawal: number;
  deposit: number;
  balance: number;
  contraAccount: string;
  contraGroup: string;
}

export interface DashboardData {
  totalAssets: number;
  totalLiabilities: number;
  netProfit: number;
  totalIncome: number;
  totalExpenses: number;
  cashAndBankBalance: number;
  sundryDebtors: number;
  sundryCreditors: number;
  generatedAt: string;
}

// ── Super-group parent mapping (mirrors what frontend used) ────────────────────
export const SUPER_GROUP_PARENTS: Record<string, "Assets" | "Liabilities" | "Capital" | "Income" | "Expense"> = {
  "Capital Account":          "Capital",
  "Profit & Loss A/c":        "Capital",
  "Current Liabilities":      "Liabilities",
  "Loans (Liability)":        "Liabilities",
  "Fixed Assets":             "Assets",
  "Investments":              "Assets",
  "Current Assets":           "Assets",
  "Cash Ledger A/C.":         "Assets",
  "Stock-in-hand":            "Assets",
  "Suspense Account":         "Assets",
  "Misc. Expenses (Asset)":   "Assets",
  "Sales Account":            "Income",
  "Purchase Account":         "Expense",
  "Income (Trading)":         "Income",
  "Income":                   "Income",
  "Income (Other Then Sales)":"Income",
  "Expenses (Direct)":        "Expense",
  "Expense Account":          "Expense",
  "Partner Interest":         "Expense",
  "Partner Remuneration":     "Expense",
  "Trading Account":          "Income",
};

// ── Internal helpers ────────────────────────────────────────────────────────────

function companyIdFilter(companyId: string) {
  try {
    return { $in: [companyId, new mongoose.Types.ObjectId(companyId)] };
  } catch {
    return companyId;
  }
}

function toSection(map: Map<string, number>): PLSection {
  const entries: PLEntry[] = [...map.entries()]
    .filter(([, v]) => Math.abs(v) > 0.001)
    .map(([ledgerName, amount]) => ({ ledgerName, amount }))
    .sort((a, b) => a.ledgerName.localeCompare(b.ledgerName));
  return { entries, total: entries.reduce((s, e) => s + e.amount, 0) };
}

// ── 1. TRIAL BALANCE ───────────────────────────────────────────────────────────

export async function computeTrialBalance(
  companyId: string,
  fy: { id: string; startDate: string; endDate: string }
): Promise<TrialSummary> {
  const cidFilter = companyIdFilter(companyId);

  // Fetch in parallel: ledgers (opening balances) + account groups + bank accounts + date-scoped entries
  const [ledgers, groups, bankAccounts, bankEntries, journalEntries] = await Promise.all([
    Ledger.find({ companyId: cidFilter })
      .select("ledgerName groupName openingDr openingCr")
      .lean(),

    AccountGroup.find({ companyId: cidFilter })
      .select("groupName superGroup")
      .lean(),

    BankCashAccount.find({ companyId: cidFilter })
      .select("name group openingBalance")
      .lean(),

    // Fetch all bank cash entries within the FY
    BankCashEntry.find({
      companyId: cidFilter,
      date: { $gte: fy.startDate, $lte: fy.endDate },
    })
      .select("accountId deposit withdrawal contraAccountName contraAccountGroup")
      .lean(),

    // Journal entries within FY - flat fetch with lean (items are small)
    JournalEntry.find({
      companyId: cidFilter,
      date: { $gte: fy.startDate, $lte: fy.endDate },
      status: "Posted",
    })
      .select("items debitAccount debitGroup debitAmount creditAccount creditGroup creditAmount")
      .lean(),
  ]);

  // Check if we already have calculated prior-year carry-forward openings cached
  let adjustedOpenings: Map<string, { dr: number; cr: number; group: string }>;
  const cachedOpenings = ReportCacheService.get<[string, { dr: number; cr: number; group: string }][]>(
    companyId,
    fy.id,
    "prior-openings"
  );
  if (cachedOpenings) {
    adjustedOpenings = new Map(cachedOpenings);
  } else {
    adjustedOpenings = new Map<string, { dr: number; cr: number; group: string }>();

    // Compute prior-year opening balance adjustments (same logic as backend ledgerController)
    const priorFYExists = await FinancialYear.exists({
      companyId: cidFilter,
      startDate: { $lt: fy.startDate },
    });

    if (priorFYExists) {
      // For non-first FY: compute carry-forward from all prior-year transactions
      // Using high-performance MongoDB aggregations instead of full scans in Node
      const [priorJournals, contraMovements, bankMovements] = await Promise.all([
        JournalEntry.aggregate([
          {
            $match: {
              companyId: cidFilter,
              date: { $lt: fy.startDate },
              status: "Posted",
            }
          },
          {
            $project: {
              items: {
                $cond: [
                  { $and: [{ $isArray: "$items" }, { $gt: [{ $size: "$items" }, 0] }] },
                  "$items",
                  [
                    { type: "Db", accountName: "$debitAccount", amount: "$debitAmount" },
                    { type: "Cr", accountName: "$creditAccount", amount: "$creditAmount" }
                  ]
                ]
              }
            }
          },
          {
            $unwind: "$items"
          },
          {
            $group: {
              _id: "$items.accountName",
              dr: {
                $sum: {
                  $cond: [{ $eq: ["$items.type", "Db"] }, { $toDouble: "$items.amount" }, 0]
                }
              },
              cr: {
                $sum: {
                  $cond: [{ $eq: ["$items.type", "Cr"] }, { $toDouble: "$items.amount" }, 0]
                }
              }
            }
          }
        ]),
        BankCashEntry.aggregate([
          {
            $match: {
              companyId: cidFilter,
              date: { $lt: fy.startDate }
            }
          },
          {
            $group: {
              _id: "$contraAccountName",
              dr: { $sum: "$withdrawal" },
              cr: { $sum: "$deposit" }
            }
          }
        ]),
        BankCashEntry.aggregate([
          {
            $match: {
              companyId: cidFilter,
              date: { $lt: fy.startDate }
            }
          },
          {
            $group: {
              _id: "$accountId",
              dr: { $sum: "$deposit" },
              cr: { $sum: "$withdrawal" }
            }
          }
        ])
      ]);

      const priorLedgerMap = new Map<string, { dr: number; cr: number }>();
      ledgers.forEach((l) => priorLedgerMap.set(l.ledgerName, { dr: 0, cr: 0 }));

      // Load journals
      for (const res of priorJournals) {
        if (res._id) {
          priorLedgerMap.set(res._id, { dr: res.dr || 0, cr: res.cr || 0 });
        }
      }

      // Load bank entries contra
      for (const cm of contraMovements) {
        if (cm._id && priorLedgerMap.has(cm._id)) {
          const b = priorLedgerMap.get(cm._id)!;
          b.dr += cm.dr || 0;
          b.cr += cm.cr || 0;
        }
      }

      // Load bank entries bank
      const bankAccIdToName = new Map(bankAccounts.map((a) => [a._id.toString(), a.name]));
      for (const bm of bankMovements) {
        const accName = bankAccIdToName.get(bm._id?.toString());
        if (accName && priorLedgerMap.has(accName)) {
          const b = priorLedgerMap.get(accName)!;
          b.dr += bm.dr || 0;
          b.cr += bm.cr || 0;
        }
      }

      // Compute prior P&L for carry-forward
      const groupCategoryMap = new Map<string, string>();
      groups.forEach((g) => groupCategoryMap.set(g.groupName, SUPER_GROUP_PARENTS[g.superGroup] || "Assets"));

      let priorRevenue = 0;
      let priorExpenses = 0;
      for (const l of ledgers) {
        const cat = groupCategoryMap.get(l.groupName) || "Assets";
        const txns = priorLedgerMap.get(l.ledgerName) || { dr: 0, cr: 0 };
        if (cat === "Income") priorRevenue += (l.openingCr - l.openingDr) + txns.cr - txns.dr;
        else if (cat === "Expense") priorExpenses += (l.openingDr - l.openingCr) + txns.dr - txns.cr;
      }
      const priorNetProfit = priorRevenue - priorExpenses;

      // Now build adjusted opening balances
      for (const l of ledgers) {
        const cat = groupCategoryMap.get(l.groupName) || "Assets";
        const txns = priorLedgerMap.get(l.ledgerName) || { dr: 0, cr: 0 };

        let oDr = l.openingDr;
        let oCr = l.openingCr;

        if (cat === "Income" || cat === "Expense") {
          oDr = 0; oCr = 0;
        } else if (l.ledgerName.toUpperCase() === "PROFIT & LOSS A/C" || l.groupName.toUpperCase() === "PROFIT & LOSS A/C") {
          const netPL = (oCr - oDr) + (txns.cr - txns.dr) + priorNetProfit;
          oDr = netPL < 0 ? Math.abs(netPL) : 0;
          oCr = netPL >= 0 ? netPL : 0;
        } else {
          const totalDr = oDr + txns.dr;
          const totalCr = oCr + txns.cr;
          if (totalDr > totalCr) { oDr = totalDr - totalCr; oCr = 0; }
          else { oCr = totalCr - totalDr; oDr = 0; }
        }
        adjustedOpenings.set(l.ledgerName, { dr: oDr, cr: oCr, group: l.groupName });
      }

      // Cache the computed openings as array for storage
      ReportCacheService.set(companyId, fy.id, "prior-openings", [...adjustedOpenings.entries()]);
    } else {
      // First FY: use openingDr / openingCr directly
      for (const l of ledgers) {
        adjustedOpenings.set(l.ledgerName, { dr: l.openingDr, cr: l.openingCr, group: l.groupName });
      }
    }
  }

  // Also handle bank accounts not already in ledger list
  const bankAccIdToNameMap = new Map(bankAccounts.map((a) => [a._id.toString(), a.name]));
  const bankAccNameToGroup = new Map(bankAccounts.map((a) => [a.name.toLowerCase(), a.group]));

  // Bank account opening balances for TB
  const bankOpenings = new Map<string, number>();
  for (const acc of bankAccounts) {
    bankOpenings.set(acc._id.toString(), acc.openingBalance || 0);
  }

  // ── Accumulate into buckets ──────────────────────────────────────────────────
  // Map: ledgerName (lowercase) → { group, openingDr, openingCr, txnDr, txnCr }
  const bucket = new Map<string, { displayName: string; group: string; oDr: number; oCr: number; tDr: number; tCr: number }>();

  const ensureBucket = (name: string, group: string, displayName?: string) => {
    const key = name.toLowerCase();
    if (!bucket.has(key)) {
      bucket.set(key, { displayName: displayName || name, group, oDr: 0, oCr: 0, tDr: 0, tCr: 0 });
    }
    return bucket.get(key)!;
  };

  // Seed with adjusted opening balances
  for (const [name, bal] of adjustedOpenings) {
    const b = ensureBucket(name, bal.group, name);
    b.oDr = bal.dr;
    b.oCr = bal.cr;
  }

  // Seed bank accounts not in ledger list
  for (const acc of bankAccounts) {
    const key = acc.name.toLowerCase();
    if (!bucket.has(key)) {
      const opening = bankOpenings.get(acc._id.toString()) || 0;
      const b = ensureBucket(acc.name, acc.group, acc.name);
      b.oDr = opening > 0 ? opening : 0;
      b.oCr = opening < 0 ? -opening : 0;
    }
  }

  // Map bank account ID to details for fast O(1) in-memory lookup
  const bankAccountMap = new Map<string, { name: string; group: string }>();
  bankAccounts.forEach((acc) => {
    bankAccountMap.set(acc._id.toString(), { name: acc.name, group: acc.group });
  });

  // Apply bank entries (double entry: bank account side and contra account side)
  for (const e of bankEntries as any[]) {
    const accInfo = bankAccountMap.get(e.accountId);
    if (!accInfo) continue;

    if (e.deposit > 0) {
      // Money comes IN → Dr the bank/cash account, Cr the contra
      const bBank = ensureBucket(accInfo.name, accInfo.group, accInfo.name);
      bBank.tDr += e.deposit;

      const bContra = ensureBucket(e.contraAccountName, e.contraAccountGroup || "Revenue", e.contraAccountName);
      bContra.tCr += e.deposit;
    }
    if (e.withdrawal > 0) {
      // Money goes OUT → Cr the bank/cash account, Dr the contra
      const bBank = ensureBucket(accInfo.name, accInfo.group, accInfo.name);
      bBank.tCr += e.withdrawal;

      const bContra = ensureBucket(e.contraAccountName, e.contraAccountGroup || "Expense", e.contraAccountName);
      bContra.tDr += e.withdrawal;
    }
  }

  // Apply journal entries
  let journalTxns = 0;
  for (const e of journalEntries as any[]) {
    const items = e.items?.length > 0
      ? e.items
      : [
          { type: "Db", accountName: e.debitAccount, groupName: e.debitGroup, amount: e.debitAmount },
          { type: "Cr", accountName: e.creditAccount, groupName: e.creditGroup, amount: e.creditAmount },
        ];
    for (const item of items) {
      if (!item.accountName) continue;
      const b = ensureBucket(item.accountName, item.groupName || "", item.accountName);
      if (item.type === "Db") b.tDr += Number(item.amount || 0);
      else b.tCr += Number(item.amount || 0);
    }
    journalTxns++;
  }

  // ── Build rows ───────────────────────────────────────────────────────────────
  const groupOrder = groups.map((g) => g.groupName);

  const rows: TrialRow[] = [...bucket.entries()].map(([, b]) => {
    const totalDr = b.oDr + b.tDr;
    const totalCr = b.oCr + b.tCr;
    const net = totalDr - totalCr;
    return {
      ledgerName:    b.displayName,
      group:         b.group,
      openingDr:     b.oDr,
      openingCr:     b.oCr,
      transactionDr: b.tDr,
      transactionCr: b.tCr,
      closingDr:     net > 0 ? net : 0,
      closingCr:     net < 0 ? -net : 0,
    };
  });

  rows.sort((a, b) => {
    let ga = groupOrder.indexOf(a.group);
    let gb = groupOrder.indexOf(b.group);
    if (ga === -1) ga = 999;
    if (gb === -1) gb = 999;
    if (ga !== gb) return ga - gb;
    return a.ledgerName.localeCompare(b.ledgerName);
  });

  const openingLedgers = rows.filter((r) => r.openingDr > 0 || r.openingCr > 0).length;
  const totalBankCashEntries = bankEntries.length;

  return {
    rows,
    stats: {
      openingLedgers,
      bankCashEntries: totalBankCashEntries,
      journalEntries:  journalTxns,
      totalLedgers:    rows.length,
    },
  };
}

// ── 2. PROFIT & LOSS ───────────────────────────────────────────────────────────

export async function computeProfitLoss(
  companyId: string,
  fy: { id: string; startDate: string; endDate: string },
  dateFrom: string,
  dateTo: string
): Promise<PLData> {
  const cidFilter = companyIdFilter(companyId);

  const [groups, bankEntries, journalEntries] = await Promise.all([
    AccountGroup.find({ companyId: cidFilter })
      .select("groupName superGroup")
      .lean(),

    BankCashEntry.find({
      companyId: cidFilter,
      date: { $gte: dateFrom, $lte: dateTo },
    })
      .select("deposit withdrawal contraAccountName contraAccountGroup date")
      .lean(),

    JournalEntry.find({
      companyId: cidFilter,
      date: { $gte: dateFrom, $lte: dateTo },
      status: "Posted",
    })
      .select("items debitAccount debitGroup debitAmount creditAccount creditGroup creditAmount date")
      .lean(),
  ]);

  const SALES_GROUPS        = new Set<string>();
  const OTHER_INCOME_GROUPS = new Set<string>();
  const DIRECT_EXP_GROUPS   = new Set<string>();
  const INDIRECT_EXP_GROUPS = new Set<string>();

  for (const g of groups) {
    const sg = g.superGroup;
    if (sg === "Sales Account") SALES_GROUPS.add(g.groupName);
    else if (["Income", "Income (Trading)", "Income (Other Then Sales)"].includes(sg)) OTHER_INCOME_GROUPS.add(g.groupName);
    else if (["Purchase Account", "Expenses (Direct)"].includes(sg)) DIRECT_EXP_GROUPS.add(g.groupName);
    else if (["Expense Account", "Partner Interest", "Partner Remuneration"].includes(sg)) INDIRECT_EXP_GROUPS.add(g.groupName);
  }

  const salesMap       = new Map<string, number>();
  const incomeMap      = new Map<string, number>();
  const directExpMap   = new Map<string, number>();
  const indirectExpMap = new Map<string, number>();

  const add = (map: Map<string, number>, key: string, amt: number) =>
    map.set(key, (map.get(key) ?? 0) + amt);

  let bankCashTxns = 0;
  let journalTxns  = 0;

  for (const e of bankEntries as any[]) {
    const cg = e.contraAccountGroup;
    const cn = e.contraAccountName;
    if (e.deposit > 0) {
      if (SALES_GROUPS.has(cg))             { add(salesMap,       cn, e.deposit);  bankCashTxns++; }
      else if (OTHER_INCOME_GROUPS.has(cg)) { add(incomeMap,      cn, e.deposit);  bankCashTxns++; }
    }
    if (e.withdrawal > 0) {
      if (DIRECT_EXP_GROUPS.has(cg))           { add(directExpMap,   cn, e.withdrawal); bankCashTxns++; }
      else if (INDIRECT_EXP_GROUPS.has(cg))    { add(indirectExpMap, cn, e.withdrawal); bankCashTxns++; }
    }
  }

  for (const e of journalEntries as any[]) {
    let counted = false;
    const items = e.items?.length > 0
      ? e.items
      : [
          { type: "Db", accountName: e.debitAccount, groupName: e.debitGroup, amount: e.debitAmount },
          { type: "Cr", accountName: e.creditAccount, groupName: e.creditGroup, amount: e.creditAmount },
        ];

    for (const item of items) {
      const g = item.groupName;
      const n = item.accountName;
      const a = Number(item.amount || 0);
      if (item.type === "Cr") {
        if (SALES_GROUPS.has(g))             { add(salesMap,       n,  a); counted = true; }
        else if (OTHER_INCOME_GROUPS.has(g)) { add(incomeMap,      n,  a); counted = true; }
        else if (DIRECT_EXP_GROUPS.has(g))   { add(directExpMap,   n, -a); counted = true; }
        else if (INDIRECT_EXP_GROUPS.has(g)) { add(indirectExpMap, n, -a); counted = true; }
      } else { // Db
        if (DIRECT_EXP_GROUPS.has(g))           { add(directExpMap,   n,  a); counted = true; }
        else if (INDIRECT_EXP_GROUPS.has(g))    { add(indirectExpMap, n,  a); counted = true; }
        else if (SALES_GROUPS.has(g))            { add(salesMap,       n, -a); counted = true; }
        else if (OTHER_INCOME_GROUPS.has(g))     { add(incomeMap,      n, -a); counted = true; }
      }
    }
    if (counted) journalTxns++;
  }

  const sales            = toSection(salesMap);
  const otherIncome      = toSection(incomeMap);
  const directExpenses   = toSection(directExpMap);
  const indirectExpenses = toSection(indirectExpMap);
  const grossProfit      = sales.total - directExpenses.total;
  const netProfit        = grossProfit + otherIncome.total - indirectExpenses.total;

  return {
    sales, otherIncome, directExpenses, indirectExpenses,
    totalIncome:   sales.total + otherIncome.total,
    totalExpenses: directExpenses.total + indirectExpenses.total,
    grossProfit, netProfit,
    isProfit: netProfit >= 0,
    dateFrom, dateTo,
    bankCashTxns, journalTxns,
  };
}

// ── 3. TRADING P&L (uses trial balance rows) ───────────────────────────────────

export function computeTradingPL(
  rows: TrialRow[],
  groupParentsMap: Record<string, string>
): TradingPLData {
  const openingStockRows: { name: string; amount: number }[] = [];
  const closingStockRows:  { name: string; amount: number }[] = [];
  const purchaseRows:      { name: string; amount: number }[] = [];
  const directExpRows:     { name: string; amount: number }[] = [];
  const salesRows:         { name: string; amount: number }[] = [];
  const indirectIncomeRows:{ name: string; amount: number }[] = [];
  const indirectExpRows:   { name: string; amount: number }[] = [];
  const depreciationRows:  { name: string; amount: number }[] = [];
  const financialExpRows:  { name: string; amount: number }[] = [];

  for (const r of rows) {
    const groupName    = r.group.toLowerCase();
    const ledgerName   = r.ledgerName.toLowerCase();
    const netDrCr      = r.closingDr - r.closingCr;
    const absVal       = Math.abs(netDrCr);
    const parentCategory = groupParentsMap[r.group.trim().toLowerCase()] || "Assets";

    const isStockGroup =
      groupName === "stock-in-hand" ||
      groupName === "inventory" ||
      groupName === "opening stock" ||
      groupName.includes("stock") ||
      groupName.includes("inventory");
    const isStockLedger = ledgerName.includes("stock") || ledgerName.includes("inventory");

    if (isStockGroup || isStockLedger) {
      if (ledgerName.includes("opening")) {
        const amount = r.openingDr > 0 ? r.openingDr : r.closingDr;
        if (amount > 0) openingStockRows.push({ name: r.ledgerName, amount });
      } else {
        if (r.openingDr > 0) {
          const isTransferred = rows.some((other) => {
            const ol = other.ledgerName.toLowerCase();
            if (!ol.includes("opening")) return false;
            const otherAmount = other.openingDr > 0 ? other.openingDr : other.closingDr;
            if (otherAmount <= 0) return false;
            const cleanR     = ledgerName.replace("opening", "").replace(/\s+/g, "").trim();
            const cleanOther = ol.replace("opening", "").replace(/\s+/g, "").trim();
            return cleanR === cleanOther || cleanR.includes(cleanOther) || cleanOther.includes(cleanR) || Math.abs(otherAmount - r.openingDr) < 0.01;
          });
          if (!isTransferred) openingStockRows.push({ name: r.ledgerName, amount: r.openingDr });
        }
      }

      if (!ledgerName.includes("opening")) {
        const netClosingDr = r.closingDr - r.closingCr;
        if (netClosingDr > 0) {
          closingStockRows.push({ name: r.ledgerName, amount: netClosingDr });
        } else if (netClosingDr < 0 && ledgerName.includes("closing")) {
          const otherHasClosingDr = rows.some((other) => {
            const ol = other.ledgerName.toLowerCase();
            return !ol.includes("opening") && !ol.includes("closing") && (other.closingDr - other.closingCr) > 0;
          });
          if (!otherHasClosingDr) closingStockRows.push({ name: r.ledgerName, amount: Math.abs(netClosingDr) });
        }
      }
      continue;
    }

    if (groupName === "purchase account" || groupName === "purchases") {
      if (absVal > 0.001) purchaseRows.push({ name: r.ledgerName, amount: absVal });
    } else if (groupName === "expenses (direct)" || groupName === "direct expenses") {
      if (absVal > 0.001) directExpRows.push({ name: r.ledgerName, amount: absVal });
    } else if (groupName === "sales account" || groupName === "sales") {
      if (absVal > 0.001) salesRows.push({ name: r.ledgerName, amount: absVal });
    } else if (parentCategory === "Income") {
      if (absVal > 0.001) indirectIncomeRows.push({ name: r.ledgerName, amount: absVal });
    } else if (parentCategory === "Expense") {
      if (absVal > 0.001) {
        if (ledgerName.includes("depreciation")) {
          depreciationRows.push({ name: r.ledgerName, amount: absVal });
        } else if (
          ledgerName.includes("bank charges") ||
          ledgerName.includes("interest") ||
          ledgerName.includes("loan a/c") ||
          ledgerName.includes("cc a/c") ||
          groupName.includes("financial")
        ) {
          financialExpRows.push({ name: r.ledgerName, amount: absVal });
        } else {
          indirectExpRows.push({ name: r.ledgerName, amount: absVal });
        }
      }
    }
  }

  const totalOpeningStock  = openingStockRows.reduce((s, x)  => s + x.amount, 0);
  const totalClosingStock  = closingStockRows.reduce((s, x)  => s + x.amount, 0);
  const totalPurchases     = purchaseRows.reduce((s, x)      => s + x.amount, 0);
  const totalDirectExp     = directExpRows.reduce((s, x)     => s + x.amount, 0);
  const totalSales         = salesRows.reduce((s, x)         => s + x.amount, 0);
  const totalIndirectIncome= indirectIncomeRows.reduce((s, x)=> s + x.amount, 0);
  const totalFinancialExp  = financialExpRows.reduce((s, x)  => s + x.amount, 0);
  const totalDepreciation  = depreciationRows.reduce((s, x)  => s + x.amount, 0);
  const totalIndirectExp   = indirectExpRows.reduce((s, x)   => s + x.amount, 0);

  const tradingDebits  = totalOpeningStock + totalPurchases + totalDirectExp;
  const tradingCredits = totalSales + totalClosingStock;
  const grossProfit    = tradingCredits - tradingDebits;

  const plCredits = (grossProfit > 0 ? grossProfit : 0) + totalIndirectIncome;
  const plDebits  = (grossProfit < 0 ? Math.abs(grossProfit) : 0) + totalFinancialExp + totalDepreciation + totalIndirectExp;
  const netProfit = plCredits - plDebits;

  return {
    openingStockRows, closingStockRows, purchaseRows, directExpRows,
    salesRows, indirectIncomeRows, indirectExpRows, depreciationRows, financialExpRows,
    totalOpeningStock, totalClosingStock, totalPurchases, totalDirectExp,
    totalSales, totalIndirectIncome, totalFinancialExp, totalDepreciation, totalIndirectExp,
    grossProfit, netProfit,
  };
}

// ── 4. CAPITAL ACCOUNTS ────────────────────────────────────────────────────────

export function computePartnerCapital(
  ledger: any,
  tbRows: TrialRow[],
): PartnerCapitalAccount {
  const name = ledger.ledgerName;
  const tbRow = tbRows.find((r) => r.ledgerName.toLowerCase() === name.toLowerCase());
  const openingBalance = tbRow ? (tbRow.openingCr - tbRow.openingDr) : ((ledger.openingCr || 0) - (ledger.openingDr || 0));
  const closingBalance = tbRow ? (tbRow.closingCr - tbRow.closingDr) : 0;

  const debits:  CapitalTxn[] = [];
  const credits: CapitalTxn[] = [];

  if (name.toLowerCase() === "opening balance" || name.toLowerCase().includes("capital")) {
    credits.push({ particulars: "BY OPENING BALANCE", amount: Math.abs(openingBalance) });
  } else {
    if (closingBalance > 0)      credits.push({ particulars: `BY ${name.toUpperCase()}`, amount: closingBalance });
    else if (closingBalance < 0) debits.push({ particulars: `TO ${name.toUpperCase()}`, amount: Math.abs(closingBalance) });
  }

  return {
    ledgerName: name.toUpperCase(),
    debits,
    credits,
    total: Math.max(
      debits.reduce((s, d) => s + (d.amount ?? 0), 0),
      credits.reduce((s, c) => s + (c.amount ?? 0), 0)
    ),
  };
}

// ── 5. BALANCE SHEET (wraps trial balance + classification) ────────────────────

const ASSET_ORDER = [
  "Assets", "Bank", "Cash", "Sundry Debtors",
  "Fixed Assets", "Investments", "Deposits (Asset)", "Loans & Advances (Asset)",
  "Stock-in-hand", "Bank Accounts (Banks)", "Cash-in-hand", "Cash Ledger A/C.",
  "Misc. Expenses (Asset)", "Suspense Account",
];
const LIAB_CAP_ORDER = [
  "Capital", "Capital Account", "Current Capital Account", "Reserves & Surplus", "SUB CAPITAL", "Sub Capital", "Profit & Loss A/c",
  "Liabilities", "Sundry Creditors", "Sundry Creditors - Material", "Sundry Creditors - Services",
  "Advances From Customers", "Duties & Taxes", "Provisions", "Salary Expenses Payable",
  "Bank OCC a/c", "Loans (Liability)", "Secured Loans", "Unsecured Loans",
];

export async function computeBalanceSheet(
  companyId: string,
  fy: { id: string; startDate: string; endDate: string }
): Promise<BalanceSheetData> {
  const cidFilter = companyIdFilter(companyId);

  // Reuse cached trial balance if available to avoid triple calculations
  let trialSummary = ReportCacheService.get<TrialSummary>(companyId, fy.id, "trial-balance");
  if (!trialSummary) {
    trialSummary = await computeTrialBalance(companyId, fy);
    ReportCacheService.set(companyId, fy.id, "trial-balance", trialSummary);
  }

  const [groups, ledgers] = await Promise.all([
    AccountGroup.find({ companyId: cidFilter }).select("groupName superGroup").lean(),
    Ledger.find({ companyId: cidFilter }).select("ledgerName groupName openingDr openingCr").lean(),
  ]);

  const { rows, stats } = trialSummary;

  // Build parent category map
  const groupParentsMap: Record<string, string> = {};
  groups.forEach((g) => {
    groupParentsMap[g.groupName.trim().toLowerCase()] = SUPER_GROUP_PARENTS[g.superGroup] || "Assets";
  });

  const assetMap:   Map<string, BSLedger[]> = new Map();
  const liabMap:    Map<string, BSLedger[]> = new Map();
  const capitalMap: Map<string, BSLedger[]> = new Map();

  let totalRevenue        = 0;
  let totalExpense        = 0;
  let totalCapitalBalance = 0;

  for (const row of rows) {
    const netDr   = row.closingDr;
    const netCr   = row.closingCr;
    const gLower  = row.group.trim().toLowerCase();
    const parentCategory = groupParentsMap[gLower] || "Assets";

    if (parentCategory === "Income")   { totalRevenue += netCr - netDr; continue; }
    if (parentCategory === "Expense")  { totalExpense += netDr - netCr; continue; }

    // Exclude stock adjustment ledgers
    const lLower = row.ledgerName.toLowerCase();
    const isStockGroup = gLower.includes("stock") || gLower.includes("inventory");
    if (isStockGroup && (lLower.includes("opening") || lLower.includes("closing"))) continue;

    if (parentCategory === "Capital" && gLower !== "profit & loss a/c" && gLower !== "reserve & surplus" && gLower !== "reserves & surplus") {
      totalCapitalBalance += (netCr - netDr);
      continue;
    }

    const netCredit = netCr - netDr;
    if (Math.abs(netCredit) < 0.001) continue;

    if (netCredit > 0) {
      if (parentCategory === "Capital") {
        if (!capitalMap.has(row.group)) capitalMap.set(row.group, []);
        capitalMap.get(row.group)!.push({ ledgerName: row.ledgerName, amount: netCredit });
      } else {
        if (!liabMap.has(row.group)) liabMap.set(row.group, []);
        liabMap.get(row.group)!.push({ ledgerName: row.ledgerName, amount: netCredit });
      }
    } else {
      const amount = -netCredit;
      if (!assetMap.has(row.group)) assetMap.set(row.group, []);
      assetMap.get(row.group)!.push({ ledgerName: row.ledgerName, amount });
    }
  }

  const netProfit = totalRevenue - totalExpense;

  // Inject combined capital balance (adjusted with netProfit)
  const adjustedCapitalBalance = totalCapitalBalance + netProfit;
  if (Math.abs(adjustedCapitalBalance) > 0.001) {
    const tg = "Capital Account";
    if (adjustedCapitalBalance > 0) {
      if (!capitalMap.has(tg)) capitalMap.set(tg, []);
      capitalMap.get(tg)!.push({ ledgerName: "Capital Account", amount: adjustedCapitalBalance });
    } else {
      if (!assetMap.has(tg)) assetMap.set(tg, []);
      assetMap.get(tg)!.push({ ledgerName: "Capital Account", amount: -adjustedCapitalBalance });
    }
  }

  // Build asset section
  const dynamicAssetOrder = [...ASSET_ORDER];
  for (const g of assetMap.keys()) {
    if (!dynamicAssetOrder.includes(g)) dynamicAssetOrder.push(g);
  }

  const assetGroups: BSGroup[] = dynamicAssetOrder
    .filter((g) => assetMap.has(g))
    .map((g) => {
      const ls = assetMap.get(g)!.sort((a, b) => a.ledgerName.localeCompare(b.ledgerName));
      return { groupKey: g, groupName: g, ledgers: ls, total: ls.reduce((s, l) => s + l.amount, 0) };
    });

  const totalAssets = assetGroups.reduce((s, g) => s + g.total, 0);

  // Build liabilities + capital section
  const dynamicLiabCapOrder = [...LIAB_CAP_ORDER];
  for (const g of capitalMap.keys()) {
    if (!dynamicLiabCapOrder.includes(g)) dynamicLiabCapOrder.unshift(g);
  }
  for (const g of liabMap.keys()) {
    if (!dynamicLiabCapOrder.includes(g)) dynamicLiabCapOrder.push(g);
  }

  const liabCapGroups: BSGroup[] = [];
  for (const g of dynamicLiabCapOrder) {
    if (capitalMap.has(g)) {
      const ls = capitalMap.get(g)!.sort((a, b) => a.ledgerName.localeCompare(b.ledgerName));
      liabCapGroups.push({ groupKey: g, groupName: g, ledgers: ls, total: ls.reduce((s, l) => s + l.amount, 0) });
    } else if (liabMap.has(g)) {
      const ls = liabMap.get(g)!.sort((a, b) => a.ledgerName.localeCompare(b.ledgerName));
      liabCapGroups.push({ groupKey: g, groupName: g, ledgers: ls, total: ls.reduce((s, l) => s + l.amount, 0) });
    }
  }

  const totalLiabCap = liabCapGroups.reduce((s, g) => s + g.total, 0);
  const difference   = Math.abs(totalAssets - totalLiabCap);

  // Capital accounts for the detail section
  const groupCategoryMap = new Map<string, string>();
  groups.forEach((g) => groupCategoryMap.set(g.groupName.trim().toLowerCase(), SUPER_GROUP_PARENTS[g.superGroup] || "Assets"));

  const allCapitalLedgers = ledgers.filter((l) => {
    const gn = l.groupName.trim().toLowerCase();
    const cat = groupCategoryMap.get(gn);
    if (cat === "Capital" && gn !== "profit & loss a/c" && gn !== "reserve & surplus" && gn !== "reserves & surplus") return true;
    return ["capital", "capital account", "capital & reserves", "current capital account", "sub capital", "sub-capital"].includes(gn);
  });

  const capitalLedgerAccounts = allCapitalLedgers.filter((l) => {
    const tbRow = rows.find((r) => r.ledgerName.toLowerCase() === l.ledgerName.toLowerCase());
    if (tbRow) return (tbRow.closingDr + tbRow.closingCr) > 0;
    return true;
  });

  const capitalAccounts = capitalLedgerAccounts.map((ledger) => computePartnerCapital(ledger, rows));
  const tradingPL = computeTradingPL(rows, groupParentsMap);

  return {
    assetsSection: { sectionName: "Assets", groups: assetGroups, total: totalAssets },
    liabCapSection: { sectionName: "Liabilities & Capital", groups: liabCapGroups, total: totalLiabCap },
    netProfit,
    totalAssets,
    totalLiabCap,
    isBalanced: difference < 1,
    difference,
    generatedAt: new Date().toISOString(),
    stats: { openingLedgers: stats.openingLedgers, bankCashEntries: stats.bankCashEntries, journalEntries: stats.journalEntries },
    tradingPL,
    capitalAccounts,
  };
}

// ── 6. CASH BOOK / BANK BOOK ───────────────────────────────────────────────────

export async function computeBookReport(
  companyId: string,
  fy: { id: string; startDate: string; endDate: string },
  group: "Cash" | "Bank",
  dateFrom: string,
  dateTo: string
): Promise<BookRow[]> {
  const cidFilter = companyIdFilter(companyId);

  const [accounts, allEntries] = await Promise.all([
    BankCashAccount.find({ companyId: cidFilter, group })
      .select("name group openingBalance")
      .lean(),
    // Fetch only within the requested display range (prior-year aggregate handles opening balance).
    // This avoids pulling the entire FY worth of entries when the user filters to a single month.
    BankCashEntry.find({
      companyId: cidFilter,
      date: { $gte: dateFrom, $lte: dateTo },
    })
      .select("accountId date particulars withdrawal deposit contraAccountName contraAccountGroup createdAt")
      .lean(),
  ]);

  // Compute running balance up to (but not including) dateFrom so opening balance is correct
  // for the displayed date range. This covers both prior-year entries and intra-FY entries
  // that precede the display window.
  const priorEntries = await BankCashEntry.aggregate([
    {
      $match: {
        companyId: { $in: [new mongoose.Types.ObjectId(companyId), companyId] },
        accountId: { $in: accounts.map((a) => a._id.toString()) },
        date: { $lt: dateFrom },
      },
    },
    {
      $group: {
        _id: "$accountId",
        totalDeposit:    { $sum: "$deposit" },
        totalWithdrawal: { $sum: "$withdrawal" },
      },
    },
  ]);

  const priorMovements = new Map<string, number>();
  for (const p of priorEntries) {
    priorMovements.set(p._id.toString(), p.totalDeposit - p.totalWithdrawal);
  }

  const rows: BookRow[] = [];

  for (const acc of accounts) {
    const id = acc._id.toString();
    const priorMovement = priorMovements.get(id) || 0;
    const openingBalance = (acc.openingBalance || 0) + priorMovement;
    const acctEntries = (allEntries as any[]).filter((e) => e.accountId === id);

    const sorted = [...acctEntries].sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.createdAt.toISOString().localeCompare(b.createdAt.toISOString())
    );

    let running = openingBalance;
    for (const e of sorted) {
      // All entries are already within dateFrom–dateTo (query is now pre-filtered)
      running += e.deposit - e.withdrawal;
      rows.push({
        srNo: 0,
        date: e.date,
        accountName: acc.name,
        accountGroup: acc.group,
        particulars: e.particulars,
        withdrawal: e.withdrawal,
        deposit: e.deposit,
        balance: running,
        contraAccount: e.contraAccountName,
        contraGroup: e.contraAccountGroup,
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  rows.forEach((r, i) => (r.srNo = i + 1));
  return rows;
}

// ── 7. DASHBOARD ───────────────────────────────────────────────────────────────

export async function computeDashboard(
  companyId: string,
  fy: { id: string; startDate: string; endDate: string }
): Promise<DashboardData> {
  // Dashboard reuses trial balance data — retrieve from cache if available
  let trialSummary = ReportCacheService.get<TrialSummary>(companyId, fy.id, "trial-balance");
  if (!trialSummary) {
    trialSummary = await computeTrialBalance(companyId, fy);
    ReportCacheService.set(companyId, fy.id, "trial-balance", trialSummary);
  }
  const { rows } = trialSummary;

  const cidFilter = companyIdFilter(companyId);
  const groups = await AccountGroup.find({ companyId: cidFilter })
    .select("groupName superGroup")
    .lean();

  const groupCategoryMap = new Map<string, string>();
  groups.forEach((g) => groupCategoryMap.set(g.groupName.trim().toLowerCase(), SUPER_GROUP_PARENTS[g.superGroup] || "Assets"));

  let totalAssets      = 0;
  let totalLiabilities = 0;
  let totalRevenue     = 0;
  let totalExpense     = 0;
  let cashAndBank      = 0;
  let sundryDebtors    = 0;
  let sundryCreditors  = 0;

  for (const r of rows) {
    const gLower = r.group.trim().toLowerCase();
    const cat = groupCategoryMap.get(gLower) || "Assets";
    const net = r.closingDr - r.closingCr; // positive = debit balance

    if (cat === "Income")  { totalRevenue  += r.closingCr - r.closingDr; continue; }
    if (cat === "Expense") { totalExpense  += r.closingDr - r.closingCr; continue; }

    if (cat === "Assets" || gLower === "bank" || gLower === "cash") {
      if (net > 0) totalAssets += net;
      if (gLower === "bank" || gLower === "cash" || gLower === "bank accounts (banks)" || gLower === "cash-in-hand") {
        cashAndBank += Math.max(net, 0);
      }
      if (gLower === "sundry debtors") sundryDebtors += Math.max(net, 0);
    } else if (cat === "Liabilities") {
      if (net < 0) totalLiabilities += -net;
      if (gLower === "sundry creditors") sundryCreditors += Math.max(-net, 0);
    } else if (cat === "Capital") {
      if (net < 0) totalLiabilities += -net;
    }
  }

  const netProfit = totalRevenue - totalExpense;

  return {
    totalAssets,
    totalLiabilities,
    netProfit,
    totalIncome:       totalRevenue,
    totalExpenses:     totalExpense,
    cashAndBankBalance: cashAndBank,
    sundryDebtors,
    sundryCreditors,
    generatedAt: new Date().toISOString(),
  };
}
