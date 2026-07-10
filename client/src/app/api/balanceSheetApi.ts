import { computeTrialBalance, TrialRow } from "./trialBalanceApi";
import { getAllGroups, SUPER_GROUP_PARENTS } from "./accountGroupApi";

// Display labels for each accounting group on the Balance Sheet
const GROUP_DISPLAY: Record<string, string> = {
  Assets:             "Fixed & Other Assets",
  Bank:               "Bank Accounts",
  Cash:               "Cash & Petty Cash",
  "Sundry Debtors":   "Sundry Debtors",
  Liabilities:        "Liabilities",
  "Sundry Creditors": "Sundry Creditors",
  Capital:            "Capital & Reserves",
};

// Section sort order
const ASSET_ORDER = [
  "Assets", "Bank", "Cash", "Sundry Debtors",
  "Fixed Assets", "Investments", "Deposits (Asset)", "Loans & Advances (Asset)",
  "Stock-in-hand", "Bank Accounts (Banks)", "Cash-in-hand", "Cash Ledger A/C.",
  "Misc. Expenses (Asset)", "Suspense Account"
];
const LIAB_CAP_ORDER = [
  "Capital", "Capital Account", "Current Capital Account", "Reserves & Surplus", "SUB CAPITAL", "Sub Capital", "Profit & Loss A/c",
  "Liabilities", "Sundry Creditors", "Sundry Creditors - Material", "Sundry Creditors - Services",
  "Advances From Customers", "Duties & Taxes", "Provisions", "Salary Expenses Payable",
  "Bank OCC a/c", "Loans (Liability)", "Secured Loans", "Unsecured Loans"
];

// ── Output types ───────────────────────────────────────────────────────────────
export interface BSLedger {
  ledgerName: string;
  amount: number; // always ≥ 0; sign is determined by section
}

export interface BSGroup {
  groupKey: string;    // accounting group key
  groupName: string;   // display name
  ledgers: BSLedger[];
  total: number;
}

export interface BSSection {
  sectionName: string;
  groups: BSGroup[];
  total: number;
}

export interface BalanceSheetData {
  assetsSection: BSSection;
  liabCapSection: BSSection;
  netProfit: number;   // positive = profit, negative = loss
  totalAssets: number;
  totalLiabCap: number;
  isBalanced: boolean;
  difference: number;
  generatedAt: string;
  stats: {
    openingLedgers:  number;
    bankCashEntries: number;
    journalEntries:  number;
  };
}

// ── Main API ───────────────────────────────────────────────────────────────────
export async function computeBalanceSheet(cache?: {
  ledgers?: any[];
  bankAccounts?: any[];
  bankEntries?: any[];
  journalEntries?: any[];
  groups?: any[];
}): Promise<BalanceSheetData> {
  const [trialSummary, groups] = await Promise.all([
    computeTrialBalance(cache),
    cache?.groups ?? getAllGroups()
  ]);
  const { rows, stats } = trialSummary;

  // Build dynamic mapping of groupName -> parentCategory
  const groupParentsMap: Record<string, string> = {};
  groups.forEach((g) => {
    groupParentsMap[g.groupName.trim().toLowerCase()] = SUPER_GROUP_PARENTS[g.superGroup] || "Assets";
  });

  // Accumulate net values by group
  const assetMap:   Map<string, BSLedger[]> = new Map();
  const liabMap:    Map<string, BSLedger[]> = new Map();
  const capitalMap: Map<string, BSLedger[]> = new Map();

  let totalRevenue  = 0; // sum of Income + Sales net credit
  let totalExpense  = 0; // sum of Expense + Purchases net debit
  let totalCapitalBalance = 0;

  for (const row of rows) {
    const netDr = row.closingDr;
    const netCr = row.closingCr;
    const gNameLower = row.group.trim().toLowerCase();
    let parentCategory = groupParentsMap[gNameLower] || "Assets";

    // Skip Income/Expense groups — they go to P&L, not Balance Sheet
    if (parentCategory === "Income") {
      totalRevenue += netCr - netDr;
      continue;
    }
    if (parentCategory === "Expense") {
      totalExpense += netDr - netCr;
      continue;
    }

    // Exclude nominal/closing stock transfer ledgers from the Balance Sheet
    const ledgerNameLower = row.ledgerName.toLowerCase();
    const isStockGroup = gNameLower.includes("stock") || gNameLower.includes("inventory");
    if (isStockGroup && (ledgerNameLower.includes("opening") || ledgerNameLower.includes("closing"))) {
      continue;
    }

    // Accumulate all partner capital account balances into a single totalCapitalBalance
    // and skip listing them individually on the Balance Sheet table.
    // Note: Profit & Loss A/c represents Net Profit/Loss and is handled separately.
    if (parentCategory === "Capital" && gNameLower !== "profit & loss a/c" && gNameLower !== "reserve & surplus" && gNameLower !== "reserves & surplus") {
      totalCapitalBalance += (netCr - netDr);
      continue;
    }

    // ── CORE RULE: classify by ACTUAL balance direction ──────────────────────
    // Credit balance (Cr > Dr) → Liabilities/Capital side
    // Debit balance  (Dr > Cr) → Assets side
    const netCredit = netCr - netDr; // positive = credit balance, negative = debit balance

    if (Math.abs(netCredit) < 0.001) continue; // zero balance — skip

    if (netCredit > 0) {
      // ── Credit balance → Liabilities/Capital side ────────────────────────
      if (parentCategory === "Capital") {
        // Capital ledger with credit balance → Capital section (fallback)
        const amount = netCredit;
        if (!capitalMap.has(row.group)) capitalMap.set(row.group, []);
        capitalMap.get(row.group)!.push({ ledgerName: row.ledgerName, amount });
      } else {
        // Asset or Liability ledger with credit balance → Liabilities section
        // (e.g. bank overdraft, advance received from customer, etc.)
        const amount = netCredit;
        if (!liabMap.has(row.group)) liabMap.set(row.group, []);
        liabMap.get(row.group)!.push({ ledgerName: row.ledgerName, amount });
      }
    } else {
      // ── Debit balance → Assets side ───────────────────────────────────────
      // Applies to all groups: normal assets, but also liabilities/capital that
      // have gone into debit (e.g. prepaid to creditor, drawings > capital, etc.)
      const amount = -netCredit; // convert to positive
      if (!assetMap.has(row.group)) assetMap.set(row.group, []);
      assetMap.get(row.group)!.push({ ledgerName: row.ledgerName, amount });
    }
  }

  // Inject the combined partner capital balance as a single line on the Balance Sheet
  if (Math.abs(totalCapitalBalance) > 0.001) {
    const targetGroup = "Capital Account";
    if (totalCapitalBalance > 0) {
      if (!capitalMap.has(targetGroup)) capitalMap.set(targetGroup, []);
      capitalMap.get(targetGroup)!.push({
        ledgerName: "Capital Account",
        amount: totalCapitalBalance
      });
    } else {
      if (!assetMap.has(targetGroup)) assetMap.set(targetGroup, []);
      assetMap.get(targetGroup)!.push({
        ledgerName: "Capital Account",
        amount: -totalCapitalBalance
      });
    }
  }

  const netProfit = totalRevenue - totalExpense;

  // Inject current-year Net Profit (Liabilities/Capital side) or Net Loss (Assets side)
  if (netProfit > 0.001) {
    const targetGroup = "Capital";
    if (!capitalMap.has(targetGroup)) {
      capitalMap.set(targetGroup, []);
    }
    capitalMap.get(targetGroup)!.push({
      ledgerName: "Net Profit (Current Year)",
      amount: netProfit,
    });
  } else if (netProfit < -0.001) {
    const targetGroup = "Profit & Loss A/c";
    if (!assetMap.has(targetGroup)) {
      assetMap.set(targetGroup, []);
    }
    assetMap.get(targetGroup)!.push({
      ledgerName: "Net Loss (Current Year)",
      amount: Math.abs(netProfit),
    });
  }

  // Dynamically add any missing groups to order arrays
  const dynamicAssetOrder = [...ASSET_ORDER];
  for (const g of assetMap.keys()) {
    if (!dynamicAssetOrder.includes(g)) {
      dynamicAssetOrder.push(g);
    }
  }

  const dynamicLiabCapOrder = [...LIAB_CAP_ORDER];
  for (const g of capitalMap.keys()) {
    if (!dynamicLiabCapOrder.includes(g)) {
      dynamicLiabCapOrder.unshift(g);
    }
  }
  for (const g of liabMap.keys()) {
    if (!dynamicLiabCapOrder.includes(g)) {
      dynamicLiabCapOrder.push(g);
    }
  }

  // ── Build Asset Section ────────────────────────────────────────────────────
  const assetGroups: BSGroup[] = dynamicAssetOrder
    .filter((g) => assetMap.has(g))
    .map((g) => {
      const ledgers = assetMap.get(g)!.sort((a, b) => a.ledgerName.localeCompare(b.ledgerName));
      const total = ledgers.reduce((s, l) => s + l.amount, 0);
      return { groupKey: g, groupName: GROUP_DISPLAY[g] ?? g, ledgers, total };
    });

  const totalAssets = assetGroups.reduce((s, g) => s + g.total, 0);

  const assetsSection: BSSection = {
    sectionName: "Assets",
    groups: assetGroups,
    total: totalAssets,
  };

  // ── Build Liabilities + Capital Section ───────────────────────────────────
  const liabCapGroups: BSGroup[] = [];

  for (const g of dynamicLiabCapOrder) {
    if (capitalMap.has(g)) {
      const ledgers = capitalMap.get(g)!.sort((a, b) => a.ledgerName.localeCompare(b.ledgerName));
      const total = ledgers.reduce((s, l) => s + l.amount, 0);
      liabCapGroups.push({ groupKey: g, groupName: GROUP_DISPLAY[g] ?? g, ledgers, total });
    } else if (liabMap.has(g)) {
      const ledgers = liabMap.get(g)!.sort((a, b) => a.ledgerName.localeCompare(b.ledgerName));
      const total = ledgers.reduce((s, l) => s + l.amount, 0);
      liabCapGroups.push({ groupKey: g, groupName: GROUP_DISPLAY[g] ?? g, ledgers, total });
    }
  }

  const totalLiabCap = liabCapGroups.reduce((s, g) => s + g.total, 0);

  const liabCapSection: BSSection = {
    sectionName: "Liabilities & Capital",
    groups: liabCapGroups,
    total: totalLiabCap,
  };

  const difference = Math.abs(totalAssets - totalLiabCap);

  return {
    assetsSection,
    liabCapSection,
    netProfit,
    totalAssets,
    totalLiabCap,
    isBalanced: difference < 1,
    difference,
    generatedAt: new Date().toISOString(),
    stats: {
      openingLedgers:  stats.openingLedgers,
      bankCashEntries: stats.bankCashEntries,
      journalEntries:  stats.journalEntries,
    },
  };
}
