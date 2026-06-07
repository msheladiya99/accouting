import { useState, useEffect, useCallback } from "react";
import {
  Download, Printer, TrendingUp, TrendingDown, Scale, RefreshCw,
  CheckCircle2, AlertTriangle, BookOpen, ArrowLeftRight, FileText, X
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { FYBanner } from "../components/FYBanner";
import { computeBalanceSheet, BalanceSheetData, BSGroup, BSLedger } from "../api/balanceSheetApi";
import { computeTrialBalance, TrialRow } from "../api/trialBalanceApi";
import { getAllEntries, getAllAccounts } from "../api/bankCashBookApi";
import { getAllJournalEntries } from "../api/journalVoucherApi";
import { getAllLedgers } from "../api/ledgerApi";
import { getAllGroups } from "../api/accountGroupApi";

const SUPER_GROUP_PARENTS: Record<string, "Assets" | "Liabilities" | "Capital" | "Income" | "Expense"> = {
  "Capital Account": "Capital",
  "Profit & Loss A/c": "Capital",
  "Current Liabilities": "Liabilities",
  "Loans (Liability)": "Liabilities",
  "Fixed Assets": "Assets",
  "Investments": "Assets",
  "Current Assets": "Assets",
  "Cash Ledger A/C.": "Assets",
  "Stock-in-hand": "Assets",
  "Suspense Account": "Assets",
  "Misc. Expenses (Asset)": "Assets",
  "Sales Account": "Income",
  "Purchase Account": "Expense",
  "Income (Trading)": "Income",
  "Income": "Income",
  "Income (Other Then Sales)": "Income",
  "Expenses (Direct)": "Expense",
  "Expense Account": "Expense",
  "Partner Interest": "Expense",
  "Partner Remuneration": "Expense"
};

const fmt = (v: number) =>
  `\u20B9${Math.abs(v).toLocaleString("en-IN")}`;

const fmtReport = (v: number) => {
  const val = Math.abs(v);
  return val.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// â”€â”€ Traditional report structures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const LIABILITIES_STRUCTURE = [
  {
    title: "CAPITAL",
    groups: ["Capital Account", "Capital", "Capital & Reserves", "Profit & Loss A/c"]
  },
  {
    title: "LOAN FUNDS",
    subsections: [
      { title: "SECURED LOANS", groups: ["Secured Loans", "Bank OCC a/c", "Loans (Liability)", "Secured Loans"] },
      { title: "UNSECURED LOANS", groups: ["Unsecured Loans"] }
    ]
  },
  {
    title: "SUNDRY CREDITORS",
    groups: ["Sundry Creditors", "Sundry Creditors - Material", "Sundry Creditors - Services", "Sundry Creditors"]
  },
  {
    title: "PROVISIONS",
    groups: ["Provisions", "Duties & Taxes", "Salary Expenses Payable", "Advances From Customers"]
  }
];

const ASSETS_STRUCTURE = [
  {
    title: "FIXED ASSETS",
    groups: ["Fixed Assets", "Assets"]
  },
  {
    title: "INVESTMENTS",
    groups: ["Investments"]
  },
  {
    title: "CURRENT ASSETS",
    subsections: [
      { title: "INVENTORY", groups: ["Stock-in-hand", "Stock-in-hand"] },
      { title: "SUNDRY DEBTORS", groups: ["Sundry Debtors"] },
      { title: "CASH AND BANK", groups: ["Cash-in-hand", "Bank Accounts (Banks)", "Cash", "Bank", "Cash Ledger A/C.", "Bank Accounts"] },
      { title: "LOANS AND ADVANCES (ASSETS)", groups: ["Loans & Advances (Asset)", "Deposits (Asset)"] }
    ]
  },
  {
    title: "MISC EXPENSES (ASSETS)",
    groups: ["Misc. Expenses (Asset)", "Profit & Loss A/c", "Suspense Account"]
  }
];

// â”€â”€ Helper to build structure â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildStructuredSection(structure: any, apiSection: any) {
  const matchedGroupKeys = new Set<string>();

  const result = structure.map((item: any) => {
    if (item.groups) {
      const matchedGroups = apiSection.groups.filter((g: any) =>
        item.groups.some((name: string) => g.groupKey.toLowerCase() === name.toLowerCase())
      );
      matchedGroups.forEach((g: any) => matchedGroupKeys.add(g.groupKey.toLowerCase()));
      if (matchedGroups.length === 0) return null;

      const allLedgers = matchedGroups.flatMap((g: any) => g.ledgers);
      const total = matchedGroups.reduce((sum: number, g: any) => sum + g.total, 0);

      return {
        title: item.title,
        ledgers: allLedgers,
        total,
      };
    } else if (item.subsections) {
      const subResults = item.subsections.map((sub: any) => {
        const matchedGroups = apiSection.groups.filter((g: any) =>
          sub.groups.some((name: string) => g.groupKey.toLowerCase() === name.toLowerCase())
        );
        matchedGroups.forEach((g: any) => matchedGroupKeys.add(g.groupKey.toLowerCase()));
        if (matchedGroups.length === 0) return null;

        const allLedgers = matchedGroups.flatMap((g: any) => g.ledgers);
        const total = matchedGroups.reduce((sum: number, g: any) => sum + g.total, 0);
        return {
          title: sub.title,
          ledgers: allLedgers,
          total,
        };
      }).filter(Boolean);

      if (subResults.length === 0) return null;

      const total = subResults.reduce((sum: number, sub: any) => sum + sub.total, 0);
      return {
        title: item.title,
        subsections: subResults,
        total,
      };
    }
    return null;
  }).filter(Boolean);

  // Collect any unmatched user-created custom groups
  const unmatched = apiSection.groups.filter((g: any) =>
    !matchedGroupKeys.has(g.groupKey.toLowerCase())
  );

  return { structured: result, unmatched };
}

interface ReportRow {
  type: 'header' | 'subheader' | 'ledger';
  label: string;
  amount?: number;
  depth: number;
}

function flattenSection(structuredItems: any[]): ReportRow[] {
  const rows: ReportRow[] = [];

  function recurse(item: any, depth: number) {
    if (!item) return;

    if (item.subsections) {
      rows.push({
        type: 'header',
        label: item.title,
        depth: depth
      });
      item.subsections.forEach((sub: any) => {
        recurse(sub, depth + 1);
      });
    } else if (item.ledgers) {
      const hasSingleMatchingLedger = item.ledgers.length === 1 &&
        (item.ledgers[0].ledgerName.toLowerCase() === item.title.toLowerCase() ||
         item.title.toLowerCase() === 'capital');

      if (hasSingleMatchingLedger) {
        rows.push({
          type: depth === 0 ? 'header' : 'subheader',
          label: item.title,
          amount: item.ledgers[0].amount,
          depth: depth
        });
      } else {
        rows.push({
          type: depth === 0 ? 'header' : 'subheader',
          label: item.title,
          depth: depth
        });
        item.ledgers.forEach((l: any) => {
          rows.push({
            type: 'ledger',
            label: l.ledgerName,
            amount: l.amount,
            depth: depth + 1
          });
        });
      }
    }
  }

  structuredItems.forEach((item) => recurse(item, 0));
  return rows;
}

function flattenUnmatched(unmatchedGroups: any[]): ReportRow[] {
  const rows: ReportRow[] = [];
  unmatchedGroups.forEach((g: any) => {
    rows.push({
      type: 'header',
      label: g.groupName,
      depth: 0
    });
    g.ledgers.forEach((l: any) => {
      rows.push({
        type: 'ledger',
        label: l.ledgerName,
        amount: l.amount,
        depth: 1
      });
    });
  });
  return rows;
}

// â”€â”€ Extra Calculations for Trading & P&L and Capital Accounts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface CapitalTxn {
  particulars: string;
  amount?: number;
}

interface PartnerCapitalAccount {
  ledgerName: string;
  debits: CapitalTxn[];
  credits: CapitalTxn[];
  total: number;
}

function computeTradingPL(rows: TrialRow[], groupParentsMap: Record<string, string>) {
  const openingStockRows: any[] = [];
  const closingStockRows: any[] = [];
  const purchaseRows: any[] = [];
  const directExpRows: any[] = [];
  const salesRows: any[] = [];
  const indirectIncomeRows: any[] = [];
  const indirectExpRows: any[] = [];
  const depreciationRows: any[] = [];
  const financialExpRows: any[] = [];

  rows.forEach((r) => {
    const groupName = r.group.toLowerCase();
    const ledgerName = r.ledgerName.toLowerCase();
    
    const netDrCr = r.closingDr - r.closingCr;
    const absVal = Math.abs(netDrCr);

    const parentCategory = groupParentsMap[r.group.trim().toLowerCase()] || "Assets";

    if (parentCategory !== "Income" && parentCategory !== "Expense") {
      // Stock-in-hand (Asset) opening/closing stock is an exception needed for Trading account!
      if (groupName === "stock-in-hand" || groupName === "inventory") {
        if (r.openingDr > 0) {
          openingStockRows.push({ name: r.ledgerName, amount: r.openingDr });
        }
        if (r.closingDr > 0) {
          closingStockRows.push({ name: r.ledgerName, amount: r.closingDr });
        }
      }
      return;
    }

    if (groupName === "purchase account" || groupName === "purchases") {
      if (absVal > 0.001) {
        purchaseRows.push({ name: r.ledgerName, amount: absVal });
      }
    } else if (groupName === "expenses (direct)" || groupName === "direct expenses") {
      if (absVal > 0.001) {
        directExpRows.push({ name: r.ledgerName, amount: absVal });
      }
    } else if (groupName === "sales account" || groupName === "sales") {
      if (absVal > 0.001) {
        salesRows.push({ name: r.ledgerName, amount: absVal });
      }
    } else if (parentCategory === "Income") {
      if (absVal > 0.001) {
        indirectIncomeRows.push({ name: r.ledgerName, amount: absVal });
      }
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
  });

  const totalOpeningStock = openingStockRows.reduce((s, x) => s + x.amount, 0);
  const totalClosingStock = closingStockRows.reduce((s, x) => s + x.amount, 0);
  const totalPurchases = purchaseRows.reduce((s, x) => s + x.amount, 0);
  const totalDirectExp = directExpRows.reduce((s, x) => s + x.amount, 0);
  const totalSales = salesRows.reduce((s, x) => s + x.amount, 0);
  const totalIndirectIncome = indirectIncomeRows.reduce((s, x) => s + x.amount, 0);
  const totalFinancialExp = financialExpRows.reduce((s, x) => s + x.amount, 0);
  const totalDepreciation = depreciationRows.reduce((s, x) => s + x.amount, 0);
  const totalIndirectExp = indirectExpRows.reduce((s, x) => s + x.amount, 0);

  const tradingDebits = totalOpeningStock + totalPurchases + totalDirectExp;
  const tradingCredits = totalSales + totalClosingStock;
  const grossProfit = tradingCredits - tradingDebits;

  const plCredits = (grossProfit > 0 ? grossProfit : 0) + totalIndirectIncome;
  const plDebits = (grossProfit < 0 ? Math.abs(grossProfit) : 0) + totalFinancialExp + totalDepreciation + totalIndirectExp;
  const netProfit = plCredits - plDebits;

  return {
    openingStockRows,
    closingStockRows,
    purchaseRows,
    directExpRows,
    salesRows,
    indirectIncomeRows,
    indirectExpRows,
    depreciationRows,
    financialExpRows,
    totalOpeningStock,
    totalClosingStock,
    totalPurchases,
    totalDirectExp,
    totalSales,
    totalIndirectIncome,
    totalFinancialExp,
    totalDepreciation,
    totalIndirectExp,
    grossProfit,
    netProfit
  };
}

function computePartnerCapital(
  ledger: any,
  bankEntries: any[],
  journalEntries: any[]
): PartnerCapitalAccount {
  const name = ledger.ledgerName;
  const openingBalance = ledger.openingCr - ledger.openingDr;

  const debits: CapitalTxn[] = [];
  const credits: CapitalTxn[] = [];

  bankEntries.forEach((e) => {
    if (e.contraAccountName === name) {
      if (e.withdrawal > 0) {
        debits.push({ particulars: e.particulars || "WITHDRAWAL", amount: e.withdrawal });
      }
      if (e.deposit > 0) {
        credits.push({ particulars: e.particulars || "CAPITAL INTRODUCED", amount: e.deposit });
      }
    }
  });

  journalEntries.forEach((e) => {
    if (e.debitAccount === name) {
      debits.push({ particulars: e.narration || "WITHDRAWAL", amount: e.debitAmount });
    }
    if (e.creditAccount === name) {
      credits.push({ particulars: e.narration || "CREDIT", amount: e.creditAmount });
    }
  });

  const formattedDebits = debits.map((t) => {
    let p = t.particulars.toUpperCase();
    if (!p.startsWith("TO ")) p = "TO " + p;
    return { particulars: p, amount: t.amount };
  });

  const formattedCredits = credits.map((t) => {
    let p = t.particulars.toUpperCase();
    if (!p.startsWith("BY ")) p = "BY " + p;
    return { particulars: p, amount: t.amount };
  });

  const finalCredits = [
    { particulars: "BY OPENING BALANCE", amount: Math.abs(openingBalance) },
    ...formattedCredits
  ]; 

  const creditsSum = finalCredits.reduce((s, c) => s + (c.amount ?? 0), 0);
  const debitsSum = formattedDebits.reduce((s, d) => s + (d.amount ?? 0), 0);
  const closingBalance = creditsSum - debitsSum;

  const finalDebits = [
    ...formattedDebits,
    { particulars: "TO CLOSING BALANCE", amount: closingBalance }
  ];

  return {
    ledgerName: name.toUpperCase(),
    debits: finalDebits,
    credits: finalCredits,
    total: Math.max(
      finalDebits.reduce((s, d) => s + (d.amount ?? 0), 0),
      finalCredits.reduce((s, c) => s + (c.amount ?? 0), 0)
    )
  };
}

// ── Module-level cache for instant SWR loading ─────────────────────────────
let cachedData: BalanceSheetData | null = null;
let cachedCapitalAccounts: PartnerCapitalAccount[] = [];
let cachedTradingPLData: any = null;
let cachedFYId: string | null = null;

// ── Main component ─────────────────────────────────────────────────────────
export default function BalanceSheet() {
  const { selectedFY, company } = useApp();
  const financialYear = selectedFY?.label ?? "—";

  const [data, setData]       = useState<BalanceSheetData | null>(cachedFYId === selectedFY?._id ? cachedData : null);
  const [loading, setLoading] = useState(cachedFYId === selectedFY?._id ? !cachedData : true);
  const [error, setError]     = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [capitalAccounts, setCapitalAccounts] = useState<PartnerCapitalAccount[]>(
    cachedFYId === selectedFY?._id ? cachedCapitalAccounts : []
  );
  const [tradingPLData, setTradingPLData] = useState<any>(
    cachedFYId === selectedFY?._id ? cachedTradingPLData : null
  );

  const load = useCallback(async (isRefresh = false, silent = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);
    setError(null);
    try {
      const [ledgers, bankAccounts, bankEntries, journalEntries, groups] = await Promise.all([
        getAllLedgers(),
        getAllAccounts(),
        getAllEntries(),
        getAllJournalEntries(),
        getAllGroups()
      ]);

      const cache = { ledgers, bankAccounts, bankEntries, journalEntries, groups };

      // Compute balance sheet using cache
      const result = await computeBalanceSheet(cache);

      const groupParentsMap: Record<string, string> = {};
      groups.forEach((g) => {
        groupParentsMap[g.groupName.trim().toLowerCase()] = SUPER_GROUP_PARENTS[g.superGroup] || "Assets";
      });

      const trialSummary = await computeTrialBalance(cache);
      const tpl = computeTradingPL(trialSummary.rows, groupParentsMap);

      const capitalLedgerAccounts = ledgers.filter(l => 
        l.groupName.toLowerCase() === 'capital' || 
        l.groupName.toLowerCase() === 'capital account' || 
        l.groupName.toLowerCase() === 'capital & reserves'
      );

      const accounts = await Promise.all(capitalLedgerAccounts.map(ledger => 
        computePartnerCapital(ledger, bankEntries, journalEntries)
      ));

      setTradingPLData(tpl);
      setCapitalAccounts(accounts);
      setData(result);

      // Save to module cache
      cachedData = result;
      cachedCapitalAccounts = accounts;
      cachedTradingPLData = tpl;
      cachedFYId = selectedFY?._id || null;
    } catch (e: any) {
      if (!silent) {
        setError(e?.message ?? "Failed to compute balance sheet");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedFY?._id]);

  useEffect(() => {
    const hasCache = cachedFYId === selectedFY?._id && cachedData !== null;
    load(false, hasCache);
  }, [load]);

  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });

  // Compile structured sections
  const liabStructured = data ? buildStructuredSection(LIABILITIES_STRUCTURE, data.liabCapSection) : null;
  const assetsStructured = data ? buildStructuredSection(ASSETS_STRUCTURE, data.assetsSection) : null;

  const leftRows = liabStructured
    ? [
        ...flattenSection(liabStructured.structured),
        ...flattenUnmatched(liabStructured.unmatched)
      ]
    : [];

  const rightRows = assetsStructured
    ? [
        ...flattenSection(assetsStructured.structured),
        ...flattenUnmatched(assetsStructured.unmatched)
      ]
    : [];

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <FYBanner />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Balance Sheet</h1>
          <p className="text-sm text-slate-500 mt-0.5">As at {today} · {financialYear}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <Printer size={14} /> Print
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors">
            <Download size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64 text-slate-500 text-sm gap-2">
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          Computing balance sheet from all sources...
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Balance banner */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
            data.isBalanced
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}>
            {data.isBalanced
              ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              : <AlertTriangle size={18} className="text-red-500 shrink-0" />}
            <div className="flex-1">
              <span className="text-sm font-medium">
                {data.isBalanced
                  ? "Balance Sheet is Balanced — Assets = Liabilities + Capital"
                  : `Out of Balance! Difference: \u20B9${data.difference.toLocaleString("en-IN")}`}
              </span>
            </div>
            <span className="text-xs text-slate-500 hidden sm:block">
              Generated {new Date(data.generatedAt).toLocaleTimeString("en-IN")}
            </span>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                <TrendingUp size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Assets</p>
                <p className="font-bold text-slate-900 tabular-nums">{fmt(data.totalAssets)}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
                <TrendingDown size={18} className="text-indigo-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Liabilities + Capital</p>
                <p className="font-bold text-slate-900 tabular-nums">{fmt(data.totalLiabCap)}</p>
              </div>
            </div>
            <div className={`rounded-xl p-4 shadow-sm border flex items-center gap-3 ${
              data.isBalanced ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
            }`}>
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0">
                <Scale size={18} className={data.isBalanced ? "text-emerald-600" : "text-red-600"} />
              </div>
              <div>
                <p className="text-xs text-slate-500">
                  {data.netProfit >= 0 ? "Net Profit" : "Net Loss"} (Current Year)
                </p>
                <p className={`font-bold tabular-nums ${data.netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {data.netProfit >= 0 ? "+" : "-"}{fmt(data.netProfit)}
                </p>
              </div>
            </div>
          </div>

          {/* Source stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: BookOpen,       label: "Opening Ledgers",   value: data.stats.openingLedgers,  color: "text-blue-600",   bg: "bg-blue-50"   },
              { icon: ArrowLeftRight, label: "Bank/Cash Entries", value: data.stats.bankCashEntries, color: "text-sky-600",    bg: "bg-sky-50"    },
              { icon: FileText,       label: "Journal Entries",   value: data.stats.journalEntries,  color: "text-violet-600", bg: "bg-violet-50" },
            ].map(({ icon: Icon, label, value, color, bg }) => (
              <div key={label} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${bg} shrink-0`}>
                  <Icon size={15} className={color} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className={`font-bold ${color}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 1. TRADING AND PROFIT AND LOSS ACCOUNT */}
          {(() => {
            const tpl = tradingPLData;
            if (!tpl) {
              return (
                <div className="text-center py-12 text-slate-500 text-sm">
                  No Trading & P&L data available or still computing...
                </div>
              );
            }

            const tradingLeft: any[] = [];
            const tradingRight: any[] = [];

            // Trading Left (Debits)
            if (tpl.totalOpeningStock > 0) {
              tradingLeft.push({ label: "TO OPENING STOCK", isHeader: true, depth: 0 });
              tpl.openingStockRows.forEach((r: any) => {
                tradingLeft.push({ label: r.name, amount: r.amount, depth: 1 });
              });
            }
            if (tpl.totalPurchases > 0) {
              tradingLeft.push({ label: "TO PURCHASE A/C", isHeader: true, depth: 0 });
              tpl.purchaseRows.forEach((r: any) => {
                tradingLeft.push({ label: r.name, amount: r.amount, depth: 1 });
              });
            }
            if (tpl.totalDirectExp > 0) {
              tradingLeft.push({ label: "TO DIRECT EXPENSES", isHeader: true, depth: 0 });
              tpl.directExpRows.forEach((r: any) => {
                tradingLeft.push({ label: r.name, amount: r.amount, depth: 1 });
              });
            }
            if (tpl.grossProfit > 0) {
              tradingLeft.push({ label: "TO GROSS PROFIT", amount: tpl.grossProfit, isBold: true, depth: 0 });
            }

            // Trading Right (Credits)
            if (tpl.totalSales > 0) {
              tradingRight.push({ label: "BY SALES A/C", isHeader: true, depth: 0 });
              tpl.salesRows.forEach((r: any) => {
                tradingRight.push({ label: r.name, amount: r.amount, depth: 1 });
              });
            }
            if (tpl.totalClosingStock > 0) {
              tradingRight.push({ label: "BY INVENTORY", isHeader: true, depth: 0 });
              tpl.closingStockRows.forEach((r: any) => {
                tradingRight.push({ label: "STOCK IN TRADE", amount: r.amount, depth: 1 });
              });
            }
            if (tpl.grossProfit < 0) {
              tradingRight.push({ label: "BY GROSS LOSS", amount: Math.abs(tpl.grossProfit), isBold: true, depth: 0 });
            }

            // Pad Trading rows to match
            const tradingMax = Math.max(tradingLeft.length, tradingRight.length);
            while (tradingLeft.length < tradingMax) {
              tradingLeft.push({ label: "", depth: 0 });
            }
            while (tradingRight.length < tradingMax) {
              tradingRight.push({ label: "", depth: 0 });
            }

            // P&L Left (Debits)
            const plLeft: any[] = [];
            const plRight: any[] = [];

            if (tpl.grossProfit < 0) {
              plLeft.push({ label: "TO GROSS LOSS", amount: Math.abs(tpl.grossProfit), isBold: true, depth: 0 });
            }
            if (tpl.totalFinancialExp > 0) {
              plLeft.push({ label: "TO FINANCIAL EXPENSES", isHeader: true, depth: 0 });
              tpl.financialExpRows.forEach((r: any) => {
                plLeft.push({ label: r.name, amount: r.amount, depth: 1 });
              });
            }
            if (tpl.totalIndirectExp > 0) {
              plLeft.push({ label: "TO INDIRECT EXPENSES", isHeader: true, depth: 0 });
              tpl.indirectExpRows.forEach((r: any) => {
                plLeft.push({ label: r.name, amount: r.amount, depth: 1 });
              });
            }
            if (tpl.totalDepreciation > 0) {
              plLeft.push({ label: "TO DEPRECIATION", isHeader: true, depth: 0 });
              tpl.depreciationRows.forEach((r: any) => {
                plLeft.push({ label: r.name, amount: r.amount, depth: 1 });
              });
            }
            if (tpl.netProfit > 0) {
              plLeft.push({ label: "TO NET PROFIT", amount: tpl.netProfit, isBold: true, depth: 0 });
            }

            // P&L Right (Credits)
            if (tpl.grossProfit > 0) {
              plRight.push({ label: "BY GROSS PROFIT", amount: tpl.grossProfit, isBold: true, depth: 0 });
            }
            if (tpl.totalIndirectIncome > 0) {
              plRight.push({ label: "BY INDIRECT INCOMES", isHeader: true, depth: 0 });
              tpl.indirectIncomeRows.forEach((r: any) => {
                plRight.push({ label: r.name, amount: r.amount, depth: 1 });
              });
            }
            if (tpl.netProfit < 0) {
              plRight.push({ label: "BY NET LOSS", amount: Math.abs(tpl.netProfit), isBold: true, depth: 0 });
            }

            // Pad P&L rows to match
            const plMax = Math.max(plLeft.length, plRight.length);
            while (plLeft.length < plMax) {
              plLeft.push({ label: "", depth: 0 });
            }
            while (plRight.length < plMax) {
              plRight.push({ label: "", depth: 0 });
            }

            const tradingTotalAmount = tpl.totalOpeningStock + tpl.totalPurchases + tpl.totalDirectExp + (tpl.grossProfit > 0 ? tpl.grossProfit : 0);
            const plTotalAmount = (tpl.grossProfit < 0 ? Math.abs(tpl.grossProfit) : 0) + tpl.totalFinancialExp + tpl.totalDepreciation + tpl.totalIndirectExp + (tpl.netProfit > 0 ? tpl.netProfit : 0);

            const renderPLRowHelper = (rows: any[]) => {
              return rows.map((row, idx) => {
                if (row.label === "") {
                  return <div key={idx} className="min-h-[22px] py-0.5" />;
                }
                const indentClass = row.depth === 0 ? "pl-4" : row.depth === 1 ? "pl-8" : "pl-12";
                const fontClass = 
                  row.isHeader
                    ? "font-bold text-slate-900 text-xs mt-3 first:mt-0" 
                    : row.isBold 
                      ? "font-bold text-slate-800 text-xs" 
                      : "font-normal text-slate-600 text-xs";

                return (
                  <div key={idx} className={`flex py-0.5 items-center min-h-[22px] ${fontClass}`}>
                    <div className={`flex-1 pr-2 uppercase ${indentClass} ${row.isHeader ? 'underline decoration-slate-300 underline-offset-2' : ''}`}>
                      {row.label}
                    </div>
                    <div className="w-[140px] shrink-0 text-right pr-4 font-mono text-xs tabular-nums text-slate-900">
                      {row.amount !== undefined ? fmtReport(row.amount) : ""}
                    </div>
                  </div>
                );
              });
            };

            return (
              <div className="pt-6">
                {/* Company Details (Header Block) */}
                <div className="text-center py-4 max-w-4xl mx-auto">
                  <h2 className="text-xl font-bold text-slate-900 uppercase tracking-wide">{company?.name || "XYZ COMPANY"}</h2>
                  <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide font-medium">
                    {company?.address || "ADDRESS"}
                  </p>
                  <p className="text-sm font-bold text-slate-800 mt-2 uppercase tracking-widest font-bold">
                    TRADING AND PROFIT AND LOSS ACCOUNT FOR THE YEAR ENDING ON {selectedFY ? new Date(selectedFY.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : today}
                  </p>
                </div>

                {/* Table Box */}
                <div className="bg-white border border-slate-800 max-w-4xl mx-auto rounded-none shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
                    
                    {/* LEFT SIDE (DEBITS) */}
                    <div className="relative flex flex-col justify-between h-full">
                      <div className="absolute top-0 bottom-0 right-[140px] border-l border-slate-800 pointer-events-none" />
                      <div className="flex-grow flex flex-col">
                        <div className="flex border-b border-slate-800 font-bold text-xs bg-slate-50/50 relative z-10">
                          <div className="flex-1 py-3 pl-4 text-slate-800 uppercase tracking-wider font-bold">PARTICULARS</div>
                          <div className="w-[140px] shrink-0 py-3 text-right pr-4 text-slate-800 uppercase tracking-wider font-bold">AMOUNT</div>
                        </div>

                        <div className="py-3 relative z-10 space-y-1">
                          {renderPLRowHelper(tradingLeft)}
                        </div>

                        <div className="flex border-t border-b border-slate-800 font-bold text-slate-900 text-xs bg-slate-50/50 relative z-10 mt-auto">
                          <div className="flex-1 py-3 pl-4 uppercase tracking-wider font-bold">TOTAL</div>
                          <div className="w-[140px] shrink-0 py-3 text-right pr-4 font-mono text-xs tabular-nums font-bold">
                            {fmtReport(tradingTotalAmount)}
                          </div>
                        </div>

                        <div className="py-3 relative z-10 space-y-1">
                          {renderPLRowHelper(plLeft)}
                        </div>

                        <div className="flex border-t border-slate-800 font-bold text-slate-900 text-xs bg-slate-50/50 relative z-10 mt-auto">
                          <div className="flex-1 py-3 pl-4 uppercase tracking-wider font-bold">TOTAL</div>
                          <div className="w-[140px] shrink-0 py-3 text-right pr-4 font-mono text-xs tabular-nums font-bold">
                            {fmtReport(plTotalAmount)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT SIDE (CREDITS) */}
                    <div className="relative flex flex-col justify-between h-full">
                      <div className="absolute top-0 bottom-0 right-[140px] border-l border-slate-800 pointer-events-none" />
                      <div className="flex-grow flex flex-col">
                        <div className="flex border-b border-slate-800 font-bold text-xs bg-slate-50/50 relative z-10">
                          <div className="flex-1 py-3 pl-4 text-slate-800 uppercase tracking-wider font-bold">PARTICULARS</div>
                          <div className="w-[140px] shrink-0 py-3 text-right pr-4 text-slate-800 uppercase tracking-wider font-bold">AMOUNT</div>
                        </div>

                        <div className="py-3 relative z-10 space-y-1">
                          {renderPLRowHelper(tradingRight)}
                        </div>

                        <div className="flex border-t border-b border-slate-800 font-bold text-slate-900 text-xs bg-slate-50/50 relative z-10 mt-auto">
                          <div className="flex-1 py-3 pl-4 uppercase tracking-wider font-bold">TOTAL</div>
                          <div className="w-[140px] shrink-0 py-3 text-right pr-4 font-mono text-xs tabular-nums font-bold">
                            {fmtReport(tradingTotalAmount)}
                          </div>
                        </div>

                        <div className="py-3 relative z-10 space-y-1">
                          {renderPLRowHelper(plRight)}
                        </div>

                        <div className="flex border-t border-slate-800 font-bold text-slate-900 text-xs bg-slate-50/50 relative z-10 mt-auto">
                          <div className="flex-1 py-3 pl-4 uppercase tracking-wider font-bold">TOTAL</div>
                          <div className="w-[140px] shrink-0 py-3 text-right pr-4 font-mono text-xs tabular-nums font-bold">
                            {fmtReport(plTotalAmount)}
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            );
          })()}

          {/* Divider */}
          <div className="border-t border-slate-200 my-8 max-w-4xl mx-auto" />

          {/* 2. PARTNER CAPITAL ACCOUNTS */}
          {capitalAccounts.length > 0 && (
            <div className="space-y-8">
              {capitalAccounts.map((account: PartnerCapitalAccount, index: number) => {
                const debits = account.debits;
                const credits = account.credits;
                
                const maxLen = Math.max(debits.length, credits.length);
                const paddedDebits = [...debits];
                const paddedCredits = [...credits];
                while (paddedDebits.length < maxLen) {
                  paddedDebits.push({ particulars: "", amount: undefined });
                }
                while (paddedCredits.length < maxLen) {
                  paddedCredits.push({ particulars: "", amount: undefined });
                }

                return (
                  <div key={index} className="space-y-4">
                    {/* Header Block */}
                    <div className="text-center py-4 max-w-4xl mx-auto">
                      <h2 className="text-xl font-bold text-slate-900 uppercase tracking-wide">{company?.name || "XYZ COMPANY"}</h2>
                      <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide font-medium">
                        {company?.address || "ADDRESS"}
                      </p>
                      <p className="text-sm font-bold text-slate-800 mt-2 uppercase tracking-widest font-bold">
                        CAPITAL ACCOUNT OF {account.ledgerName}
                      </p>
                    </div>

                    {/* Box Table */}
                    <div className="bg-white border border-slate-800 max-w-4xl mx-auto rounded-none shadow-sm">
                      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800 min-h-[200px]">
                        
                        {/* LEFT SIDE: DEBITS */}
                        <div className="relative flex flex-col justify-between h-full">
                          <div className="absolute top-0 bottom-0 right-[140px] border-l border-slate-800 pointer-events-none" />
                          <div className="flex-grow flex flex-col">
                            <div className="flex border-b border-slate-800 font-bold text-xs bg-slate-50/50 relative z-10">
                              <div className="flex-1 py-3 pl-4 text-slate-800 uppercase tracking-wider font-bold">PARTICULARS</div>
                              <div className="w-[140px] shrink-0 py-3 text-right pr-4 text-slate-800 uppercase tracking-wider font-bold">AMOUNT</div>
                            </div>
                            <div className="flex-grow py-3 relative z-10 space-y-1 pb-6">
                              {paddedDebits.map((row, idx) => {
                                if (row.particulars === "") {
                                  return <div key={idx} className="min-h-[22px] py-0.5" />;
                                }
                                const isClosing = row.particulars.includes("CLOSING BALANCE");
                                return (
                                  <div key={idx} className={`flex py-0.5 items-center min-h-[22px] text-xs ${isClosing ? "font-bold text-slate-800" : "font-normal text-slate-600"}`}>
                                    <div className="flex-1 pr-2 uppercase pl-4">
                                      {row.particulars}
                                    </div>
                                    <div className="w-[140px] shrink-0 text-right pr-4 font-mono text-xs tabular-nums text-slate-900">
                                      {row.amount !== undefined ? fmtReport(row.amount) : ""}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex border-t border-slate-800 font-bold text-slate-900 text-xs bg-slate-50/50 relative z-10 mt-auto">
                            <div className="flex-1 py-3 pl-4 uppercase tracking-wider font-bold">TOTAL</div>
                            <div className="w-[140px] shrink-0 py-3 text-right pr-4 font-mono text-xs tabular-nums font-bold">
                              {fmtReport(account.total)}
                            </div>
                          </div>
                        </div>

                        {/* RIGHT SIDE: CREDITS */}
                        <div className="relative flex flex-col justify-between h-full">
                          <div className="absolute top-0 bottom-0 right-[140px] border-l border-slate-800 pointer-events-none" />
                          <div className="flex-grow flex flex-col">
                            <div className="flex border-b border-slate-800 font-bold text-xs bg-slate-50/50 relative z-10">
                              <div className="flex-1 py-3 pl-4 text-slate-800 uppercase tracking-wider font-bold">PARTICULARS</div>
                              <div className="w-[140px] shrink-0 py-3 text-right pr-4 text-slate-800 uppercase tracking-wider font-bold">AMOUNT</div>
                            </div>
                            <div className="flex-grow py-3 relative z-10 space-y-1 pb-6">
                              {paddedCredits.map((row, idx) => {
                                if (row.particulars === "") {
                                  return <div key={idx} className="min-h-[22px] py-0.5" />;
                                }
                                const isOpening = row.particulars.includes("OPENING BALANCE");
                                return (
                                  <div key={idx} className={`flex py-0.5 items-center min-h-[22px] text-xs ${isOpening ? "font-bold text-slate-800" : "font-normal text-slate-600"}`}>
                                    <div className="flex-1 pr-2 uppercase pl-4">
                                      {row.particulars}
                                    </div>
                                    <div className="w-[140px] shrink-0 text-right pr-4 font-mono text-xs tabular-nums text-slate-900">
                                      {row.amount !== undefined ? fmtReport(row.amount) : ""}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex border-t border-slate-800 font-bold text-slate-900 text-xs bg-slate-50/50 relative z-10 mt-auto">
                            <div className="flex-1 py-3 pl-4 uppercase tracking-wider font-bold">TOTAL</div>
                            <div className="w-[140px] shrink-0 py-3 text-right pr-4 font-mono text-xs tabular-nums font-bold">
                              {fmtReport(account.total)}
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-slate-200 my-8 max-w-4xl mx-auto" />

          {/* 3. BALANCE SHEET */}
          <div>
            {/* Company Details (Header Block) */}
            <div className="text-center py-4 max-w-4xl mx-auto">
              <h2 className="text-xl font-bold text-slate-900 uppercase tracking-wide">{company?.name || "XYZ COMPANY"}</h2>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide font-medium">
                {company?.address || "ADDRESS"}
              </p>
              <p className="text-sm font-bold text-slate-800 mt-2 uppercase tracking-widest">
                BALANCE SHEET AS AT {selectedFY ? new Date(selectedFY.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : today}
              </p>
            </div>

            {/* Side-by-Side Paper Balance Sheet Table */}
            <div className="bg-white border border-slate-800 max-w-4xl mx-auto rounded-none shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800 min-h-[500px]">
                
                {/* LIABILITIES & CAPITAL COLUMN (LEFT SIDE) */}
                <div className="relative flex flex-col justify-between h-full">
                  <div className="absolute top-0 bottom-0 right-[140px] border-l border-slate-800 pointer-events-none" />
                  <div className="flex-1 flex flex-col">
                    <div className="flex border-b border-slate-800 font-bold text-xs bg-slate-50/50 relative z-10">
                      <div className="flex-1 py-3 pl-4 text-slate-800 uppercase tracking-wider font-bold">LIABILITIES</div>
                      <div className="w-[140px] shrink-0 py-3 text-right pr-4 text-slate-800 uppercase tracking-wider font-bold">AMOUNT</div>
                    </div>
                    <div className="flex-grow py-3 relative z-10 space-y-1 pb-6">
                      {leftRows.map((row, idx) => {
                        const indentClass = row.depth === 0 ? "pl-4" : row.depth === 1 ? "pl-8" : "pl-12";
                        const fontClass = 
                          row.type === 'header' 
                            ? "font-bold text-slate-900 text-xs mt-3 first:mt-0" 
                            : row.type === 'subheader' 
                              ? "font-bold text-slate-700 text-[11px] mt-2" 
                              : "font-normal text-slate-600 text-xs";

                        return (
                          <div key={idx} className={`flex py-0.5 items-center ${fontClass}`}>
                            <div className={`flex-1 pr-2 uppercase ${indentClass} ${row.type === 'header' || row.type === 'subheader' ? 'underline decoration-slate-300 underline-offset-2' : ''}`}>
                              {row.label}
                            </div>
                            <div className="w-[140px] shrink-0 text-right pr-4 font-mono text-xs tabular-nums text-slate-900">
                              {row.amount !== undefined ? fmtReport(row.amount) : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex border-t border-slate-800 font-bold text-slate-900 text-xs bg-slate-50/50 relative z-10 mt-auto">
                    <div className="flex-1 py-3 pl-4 uppercase tracking-wider font-bold">TOTAL</div>
                    <div className="w-[140px] shrink-0 py-3 text-right pr-4 font-mono text-xs tabular-nums font-bold">
                      {fmtReport(data.totalLiabCap)}
                    </div>
                  </div>
                </div>

                {/* ASSETS COLUMN (RIGHT SIDE) */}
                <div className="relative flex flex-col justify-between h-full">
                  <div className="absolute top-0 bottom-0 right-[140px] border-l border-slate-800 pointer-events-none" />
                  <div className="flex-1 flex flex-col">
                    <div className="flex border-b border-slate-800 font-bold text-xs bg-slate-50/50 relative z-10">
                      <div className="flex-1 py-3 pl-4 text-slate-800 uppercase tracking-wider font-bold">ASSETS</div>
                      <div className="w-[140px] shrink-0 py-3 text-right pr-4 text-slate-800 uppercase tracking-wider font-bold">AMOUNT</div>
                    </div>
                    <div className="flex-grow py-3 relative z-10 space-y-1 pb-6">
                      {rightRows.map((row, idx) => {
                        const indentClass = row.depth === 0 ? "pl-4" : row.depth === 1 ? "pl-8" : "pl-12";
                        const fontClass = 
                          row.type === 'header' 
                            ? "font-bold text-slate-900 text-xs mt-3 first:mt-0" 
                            : row.type === 'subheader' 
                              ? "font-bold text-slate-700 text-[11px] mt-2" 
                              : "font-normal text-slate-600 text-xs";

                        return (
                          <div key={idx} className={`flex py-0.5 items-center ${fontClass}`}>
                            <div className={`flex-1 pr-2 uppercase ${indentClass} ${row.type === 'header' || row.type === 'subheader' ? 'underline decoration-slate-300 underline-offset-2' : ''}`}>
                              {row.label}
                            </div>
                            <div className="w-[140px] shrink-0 text-right pr-4 font-mono text-xs tabular-nums text-slate-900">
                              {row.amount !== undefined ? fmtReport(row.amount) : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex border-t border-slate-800 font-bold text-slate-900 text-xs bg-slate-50/50 relative z-10 mt-auto">
                    <div className="flex-1 py-3 pl-4 uppercase tracking-wider font-bold">TOTAL</div>
                    <div className="w-[140px] shrink-0 py-3 text-right pr-4 font-mono text-xs tabular-nums font-bold">
                      {fmtReport(data.totalAssets)}
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Balance equation footer */}
            <div className={`flex flex-wrap items-center justify-center gap-4 py-4 px-6 rounded-xl border-2 max-w-4xl mx-auto mt-6 ${
              data.isBalanced ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"
            }`}>
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Total Assets</p>
                <p className="font-bold text-blue-700 tabular-nums">{fmt(data.totalAssets)}</p>
              </div>
              <span className={`text-xl font-bold ${data.isBalanced ? "text-emerald-600" : "text-red-500"}`}>=</span>
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Liabilities + Capital</p>
                <p className="font-bold text-indigo-700 tabular-nums">{fmt(data.totalLiabCap)}</p>
              </div>
              {!data.isBalanced && (
                <>
                  <span className="text-red-500 font-bold">≠</span>
                  <div className="text-center">
                    <p className="text-xs text-red-500 uppercase tracking-wide">Difference</p>
                    <p className="font-bold text-red-600 tabular-nums">{fmt(data.difference)}</p>
                  </div>
                </>
              )}
              <span className={`ml-2 text-sm font-bold px-3 py-1 rounded-full ${
                data.isBalanced ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
              }`}>
                {data.isBalanced ? "Balanced ✓" : "Out of Balance ✗"}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

