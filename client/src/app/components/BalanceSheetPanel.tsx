import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, RefreshCw,
  TrendingUp, TrendingDown, Scale, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import {
  computeBalanceSheet,
  type BalanceSheetData,
} from "../api/balanceSheetApi";
import { computeTrialBalance, type TrialRow } from "../api/trialBalanceApi";
import { getAllEntries } from "../api/bankCashBookApi";
import { getAllJournalEntries } from "../api/journalVoucherApi";
import { getAllLedgers } from "../api/ledgerApi";

const fmt = (v: number) =>
  `\u20B9${Math.abs(v).toLocaleString("en-IN")}`;

const fmtReport = (v: number) => {
  const val = Math.abs(v);
  return val.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// ── Traditional report structures ───────────────────────────────────────────
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

// ── Helper to build structure ────────────────────────────────────────────────
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

// ── Extra Calculations for Trading & P&L and Capital Accounts ───────────────
interface CapitalTxn {
  particulars: string;
  amount: number;
}

interface PartnerCapitalAccount {
  ledgerName: string;
  debits: CapitalTxn[];
  credits: CapitalTxn[];
  total: number;
}

function computeTradingPL(rows: TrialRow[]) {
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

    if (groupName === "stock-in-hand" || groupName === "inventory") {
      if (r.openingDr > 0) {
        openingStockRows.push({ name: r.ledgerName, amount: r.openingDr });
      }
      if (r.closingDr > 0) {
        closingStockRows.push({ name: r.ledgerName, amount: r.closingDr });
      }
    } else if (groupName === "purchase account" || groupName === "purchases") {
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
    } else if (
      groupName === "income" || 
      groupName === "income (trading)" || 
      groupName === "income (other then sales)" ||
      groupName === "indirect incomes"
    ) {
      if (absVal > 0.001) {
        indirectIncomeRows.push({ name: r.ledgerName, amount: absVal });
      }
    } else {
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

  const creditsSum = finalCredits.reduce((s, c) => s + c.amount, 0);
  const debitsSum = formattedDebits.reduce((s, d) => s + d.amount, 0);
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
      finalDebits.reduce((s, d) => s + d.amount, 0),
      finalCredits.reduce((s, c) => s + c.amount, 0)
    )
  };
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export function BalanceSheetPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { selectedFY, company } = useApp();
  const [data,    setData]    = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [capitalAccounts, setCapitalAccounts] = useState<PartnerCapitalAccount[]>([]);
  const [tradingPLData, setTradingPLData] = useState<any>(null);

  // Resizing state & logic
  const [width, setWidth] = useState(850);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 290 && newWidth < window.innerWidth - 100) {
        setWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await computeBalanceSheet();
      setData(result);
    }
    catch (e: any) { setError(e?.message ?? "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open && !data) load(); }, [open, data, load]);


  useEffect(() => {
    async function loadExtraData() {
      try {
        const [trialSummary, bEntries, jEntries, allLedgers] = await Promise.all([
          computeTrialBalance(),
          getAllEntries(),
          getAllJournalEntries(),
          getAllLedgers()
        ]);

        const tpl = computeTradingPL(trialSummary.rows);
        setTradingPLData(tpl);

        const capitalLedgerAccounts = allLedgers.filter(l => 
          l.groupName.toLowerCase() === 'capital' || 
          l.groupName.toLowerCase() === 'capital account' || 
          l.groupName.toLowerCase() === 'capital & reserves'
        );

        const accounts = await Promise.all(capitalLedgerAccounts.map(ledger => 
          computePartnerCapital(ledger, bEntries, jEntries)
        ));

        setCapitalAccounts(accounts);
      } catch (err) {
        console.error("Failed to load extra report data:", err);
      }
    }

    if (data) {
      loadExtraData();
    }
  }, [data, selectedFY?._id]);

  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

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
    <aside
      style={{
        width: open ? `${width}px` : "28px",
        transition: isResizing ? "none" : "width 0.3s ease",
      }}
      className={`flex-shrink-0 flex flex-col h-full bg-white border-l border-slate-200 shadow-md relative`}
    >
      {/* ── Drag Handle for resizing ────────────────────────────────────────── */}
      {open && (
        <div
          onMouseDown={startResizing}
          className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize hover:bg-indigo-500/50 active:bg-indigo-600 transition-colors z-30"
          title="Drag to resize Balance Sheet"
        />
      )}

      {/* ── Toggle tab ─────────────────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        title={open ? "Collapse Balance Sheet" : "Balance Sheet"}
        className="absolute top-1/2 -translate-y-1/2 -left-[18px] z-20 w-[18px] h-16 bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center rounded-l-lg shadow-lg transition-colors"
      >
        {open
          ? <ChevronRight size={11} className="text-white" />
          : <ChevronLeft  size={11} className="text-white" />}
      </button>

      {/* ── Collapsed strip ────────────────────────────────────────────────── */}
      {!open && (
        <div className="flex-1 flex items-center justify-center overflow-hidden bg-slate-50">
          <span
            className="text-[9px] font-bold tracking-[0.18em] uppercase text-slate-400 select-none whitespace-nowrap"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Balance Sheet
          </span>
        </div>
      )}

      {/* ── Expanded content ───────────────────────────────────────────────── */}
      {open && (
        <div className="flex flex-col h-full overflow-hidden w-full">

          {/* Header — matches the main page style */}
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
            <div>
              <p className="text-[14px] font-bold text-slate-800 leading-tight">Balance Sheet Reports</p>
              <p className="text-[11px] text-slate-500 leading-tight">As at {today} · {selectedFY?.label ?? "—"}</p>
            </div>
            <button
              onClick={load}
              disabled={loading}
              title="Refresh"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* ── States ───────────────────────────────────────────────────── */}
          {loading && !data && (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="flex flex-col items-center gap-2">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Computing report from all sources…</span>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="m-4 flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              <AlertTriangle size={14} className="flex-shrink-0" />
              <p className="text-xs">{error}</p>
              <button onClick={load} className="text-xs underline ml-auto">Retry</button>
            </div>
          )}

          {!loading && !error && data && (
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

              {/* Balance status banner */}
              <div className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-medium ${
                data.isBalanced
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}>
                {data.isBalanced
                  ? <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />
                  : <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />}
                <span>
                  {data.isBalanced
                    ? "Balance Sheet is Balanced — Assets = Liabilities + Capital"
                    : `Out of Balance! Difference: ${fmt(data.difference)}`}
                </span>
              </div>

              {/* Summary mini-cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-lg p-3 shadow-sm border border-slate-100 flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <TrendingUp size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 leading-tight">Total Assets</p>
                    <p className="text-xs font-bold text-slate-900 font-mono leading-tight">{fmt(data.totalAssets)}</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm border border-slate-100 flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
                    <TrendingDown size={16} className="text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 leading-tight">Total Liab + Cap</p>
                    <p className="text-xs font-bold text-slate-900 font-mono leading-tight">{fmt(data.totalLiabCap)}</p>
                  </div>
                </div>
                <div className={`rounded-lg p-3 shadow-sm border flex items-center gap-3 ${data.netProfit >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0">
                    <Scale size={16} className={data.netProfit >= 0 ? "text-emerald-600" : "text-red-500"} />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 leading-tight">Net {data.netProfit >= 0 ? "Profit" : "Loss"}</p>
                    <p className={`text-xs font-bold font-mono leading-tight ${data.netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {data.netProfit >= 0 ? "+" : "-"}{fmt(data.netProfit)}
                    </p>
                  </div>
                </div>
              </div>

              {/* 1. TRADING AND PROFIT AND LOSS ACCOUNT */}
              {(() => {
                const tpl = tradingPLData;
                if (!tpl) return null;

                const tradingLeft: any[] = [];
                const tradingRight: any[] = [];

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

                const tradingMax = Math.max(tradingLeft.length, tradingRight.length);
                while (tradingLeft.length < tradingMax) tradingLeft.push({ label: "", depth: 0 });
                while (tradingRight.length < tradingMax) tradingRight.push({ label: "", depth: 0 });

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

                const plMax = Math.max(plLeft.length, plRight.length);
                while (plLeft.length < plMax) plLeft.push({ label: "", depth: 0 });
                while (plRight.length < plMax) plRight.push({ label: "", depth: 0 });

                const tradingTotalAmount = tpl.totalOpeningStock + tpl.totalPurchases + tpl.totalDirectExp + (tpl.grossProfit > 0 ? tpl.grossProfit : 0);
                const plTotalAmount = (tpl.grossProfit < 0 ? Math.abs(tpl.grossProfit) : 0) + tpl.totalFinancialExp + tpl.totalDepreciation + tpl.totalIndirectExp + (tpl.netProfit > 0 ? tpl.netProfit : 0);

                const renderPLRowHelper = (rows: any[]) => {
                  return rows.map((row, idx) => {
                    if (row.label === "") {
                      return <div key={idx} className="min-h-[20px] py-0.5" />;
                    }
                    const indentClass = row.depth === 0 ? "pl-2" : row.depth === 1 ? "pl-5" : "pl-8";
                    const fontClass = 
                      row.isHeader
                        ? "font-bold text-slate-900 text-[10px] mt-2 first:mt-0" 
                        : row.isBold 
                          ? "font-bold text-slate-800 text-[10px]" 
                          : "font-normal text-slate-600 text-[10px]";

                    return (
                      <div key={idx} className={`flex py-0.5 items-center min-h-[20px] ${fontClass}`}>
                        <div className={`flex-1 pr-2 uppercase ${indentClass} ${row.isHeader ? 'underline decoration-slate-300 underline-offset-2' : ''}`}>
                          {row.label}
                        </div>
                        <div className="w-[100px] shrink-0 text-right pr-2 font-mono text-[10px] tabular-nums text-slate-900">
                          {row.amount !== undefined ? fmtReport(row.amount) : ""}
                        </div>
                      </div>
                    );
                  });
                };

                return (
                  <div className="space-y-2">
                    <div className="text-center py-2 border-b border-slate-100">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">{company?.name || "XYZ COMPANY"}</h3>
                      <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider">
                        TRADING AND PROFIT AND LOSS ACCOUNT
                      </p>
                    </div>

                    <div className="bg-white border border-slate-800 rounded-none shadow-sm text-[10px]">
                      <div className="grid grid-cols-2 divide-x divide-slate-800">
                        {/* LEFT SIDE (DEBITS) */}
                        <div className="relative flex flex-col justify-between h-full">
                          <div className="absolute top-0 bottom-0 right-[100px] border-l border-slate-800 pointer-events-none" />
                          <div className="flex-grow flex flex-col">
                            <div className="flex border-b border-slate-800 font-bold bg-slate-50 relative z-10">
                              <div className="flex-1 py-1.5 pl-2 text-slate-800 uppercase font-bold">PARTICULARS</div>
                              <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 text-slate-800 uppercase font-bold">AMOUNT</div>
                            </div>
                            <div className="py-2 relative z-10 space-y-0.5">
                              {renderPLRowHelper(tradingLeft)}
                            </div>
                            <div className="flex border-t border-b border-slate-800 font-bold text-slate-900 bg-slate-50 relative z-10 mt-auto">
                              <div className="flex-1 py-1.5 pl-2 uppercase font-bold">TOTAL</div>
                              <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 font-mono tabular-nums font-bold">
                                {fmtReport(tradingTotalAmount)}
                              </div>
                            </div>
                            <div className="py-2 relative z-10 space-y-0.5">
                              {renderPLRowHelper(plLeft)}
                            </div>
                            <div className="flex border-t border-slate-800 font-bold text-slate-900 bg-slate-50 relative z-10 mt-auto">
                              <div className="flex-1 py-1.5 pl-2 uppercase font-bold">TOTAL</div>
                              <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 font-mono tabular-nums font-bold">
                                {fmtReport(plTotalAmount)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* RIGHT SIDE (CREDITS) */}
                        <div className="relative flex flex-col justify-between h-full">
                          <div className="absolute top-0 bottom-0 right-[100px] border-l border-slate-800 pointer-events-none" />
                          <div className="flex-grow flex flex-col">
                            <div className="flex border-b border-slate-800 font-bold bg-slate-50 relative z-10">
                              <div className="flex-1 py-1.5 pl-2 text-slate-800 uppercase font-bold">PARTICULARS</div>
                              <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 text-slate-800 uppercase font-bold">AMOUNT</div>
                            </div>
                            <div className="py-2 relative z-10 space-y-0.5">
                              {renderPLRowHelper(tradingRight)}
                            </div>
                            <div className="flex border-t border-b border-slate-800 font-bold text-slate-900 bg-slate-50 relative z-10 mt-auto">
                              <div className="flex-1 py-1.5 pl-2 uppercase font-bold">TOTAL</div>
                              <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 font-mono tabular-nums font-bold">
                                {fmtReport(tradingTotalAmount)}
                              </div>
                            </div>
                            <div className="py-2 relative z-10 space-y-0.5">
                              {renderPLRowHelper(plRight)}
                            </div>
                            <div className="flex border-t border-slate-800 font-bold text-slate-900 bg-slate-50 relative z-10 mt-auto">
                              <div className="flex-1 py-1.5 pl-2 uppercase font-bold">TOTAL</div>
                              <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 font-mono tabular-nums font-bold">
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
              <div className="border-t border-slate-200" />

              {/* 2. PARTNER CAPITAL ACCOUNTS */}
              {capitalAccounts.length > 0 && (
                <div className="space-y-4">
                  {capitalAccounts.map((account, index) => {
                    const debits = account.debits;
                    const credits = account.credits;
                    
                    const maxLen = Math.max(debits.length, credits.length);
                    const paddedDebits = [...debits];
                    const paddedCredits = [...credits];
                    while (paddedDebits.length < maxLen) paddedDebits.push({ particulars: "", amount: undefined });
                    while (paddedCredits.length < maxLen) paddedCredits.push({ particulars: "", amount: undefined });

                    return (
                      <div key={index} className="space-y-2">
                        <div className="text-center py-2 border-b border-slate-100">
                          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">{company?.name || "XYZ COMPANY"}</h3>
                          <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider">
                            CAPITAL ACCOUNT OF {account.ledgerName}
                          </p>
                        </div>

                        <div className="bg-white border border-slate-800 rounded-none shadow-sm text-[10px]">
                          <div className="grid grid-cols-2 divide-x divide-slate-800 min-h-[100px]">
                            {/* LEFT SIDE: DEBITS */}
                            <div className="relative flex flex-col justify-between h-full">
                              <div className="absolute top-0 bottom-0 right-[100px] border-l border-slate-800 pointer-events-none" />
                              <div className="flex-grow flex flex-col">
                                <div className="flex border-b border-slate-800 font-bold bg-slate-50 relative z-10">
                                  <div className="flex-1 py-1.5 pl-2 text-slate-800 uppercase font-bold">PARTICULARS</div>
                                  <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 text-slate-800 uppercase font-bold">AMOUNT</div>
                                </div>
                                <div className="flex-grow py-2 relative z-10 space-y-0.5 pb-4">
                                  {paddedDebits.map((row, idx) => {
                                    if (row.particulars === "") return <div key={idx} className="min-h-[18px] py-0.5" />;
                                    const isClosing = row.particulars.includes("CLOSING BALANCE");
                                    return (
                                      <div key={idx} className={`flex py-0.5 items-center min-h-[18px] ${isClosing ? "font-bold text-slate-800" : "font-normal text-slate-600"}`}>
                                        <div className="flex-1 pr-2 uppercase pl-2">{row.particulars}</div>
                                        <div className="w-[100px] shrink-0 text-right pr-2 font-mono tabular-nums text-slate-900">
                                          {row.amount !== undefined ? fmtReport(row.amount) : ""}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex border-t border-slate-800 font-bold text-slate-900 bg-slate-50 relative z-10 mt-auto">
                                <div className="flex-1 py-1.5 pl-2 uppercase font-bold">TOTAL</div>
                                <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 font-mono tabular-nums font-bold">
                                  {fmtReport(account.total)}
                                </div>
                              </div>
                            </div>

                            {/* RIGHT SIDE: CREDITS */}
                            <div className="relative flex flex-col justify-between h-full">
                              <div className="absolute top-0 bottom-0 right-[100px] border-l border-slate-800 pointer-events-none" />
                              <div className="flex-grow flex flex-col">
                                <div className="flex border-b border-slate-800 font-bold bg-slate-50 relative z-10">
                                  <div className="flex-1 py-1.5 pl-2 text-slate-800 uppercase font-bold">PARTICULARS</div>
                                  <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 text-slate-800 uppercase font-bold">AMOUNT</div>
                                </div>
                                <div className="flex-grow py-2 relative z-10 space-y-0.5 pb-4">
                                  {paddedCredits.map((row, idx) => {
                                    if (row.particulars === "") return <div key={idx} className="min-h-[18px] py-0.5" />;
                                    const isOpening = row.particulars.includes("OPENING BALANCE");
                                    return (
                                      <div key={idx} className={`flex py-0.5 items-center min-h-[18px] ${isOpening ? "font-bold text-slate-800" : "font-normal text-slate-600"}`}>
                                        <div className="flex-1 pr-2 uppercase pl-2">{row.particulars}</div>
                                        <div className="w-[100px] shrink-0 text-right pr-2 font-mono tabular-nums text-slate-900">
                                          {row.amount !== undefined ? fmtReport(row.amount) : ""}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex border-t border-slate-800 font-bold text-slate-900 bg-slate-50 relative z-10 mt-auto">
                                <div className="flex-1 py-1.5 pl-2 uppercase font-bold">TOTAL</div>
                                <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 font-mono tabular-nums font-bold">
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
              <div className="border-t border-slate-200" />

              {/* 3. BALANCE SHEET */}
              <div className="space-y-2">
                <div className="text-center py-2 border-b border-slate-100">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">{company?.name || "XYZ COMPANY"}</h3>
                  <p className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider">
                    BALANCE SHEET
                  </p>
                </div>

                <div className="bg-white border border-slate-800 rounded-none shadow-sm text-[10px]">
                  <div className="grid grid-cols-2 divide-x divide-slate-800 min-h-[250px]">
                    {/* LIABILITIES COLUMN (LEFT SIDE) */}
                    <div className="relative flex flex-col justify-between h-full">
                      <div className="absolute top-0 bottom-0 right-[100px] border-l border-slate-800 pointer-events-none" />
                      <div className="flex-1 flex flex-col">
                        <div className="flex border-b border-slate-800 font-bold bg-slate-50 relative z-10">
                          <div className="flex-1 py-1.5 pl-2 text-slate-800 uppercase font-bold">LIABILITIES</div>
                          <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 text-slate-800 uppercase font-bold">AMOUNT</div>
                        </div>
                        <div className="flex-grow py-2 relative z-10 space-y-0.5 pb-4">
                          {leftRows.map((row, idx) => {
                            const indentClass = row.depth === 0 ? "pl-2" : row.depth === 1 ? "pl-5" : "pl-8";
                            const fontClass = 
                              row.type === 'header' 
                                ? "font-bold text-slate-900 text-[10px] mt-2 first:mt-0" 
                                : row.type === 'subheader' 
                                  ? "font-bold text-slate-700 text-[9px] mt-1.5" 
                                  : "font-normal text-slate-600 text-[9px]";

                            return (
                              <div key={idx} className={`flex py-0.5 items-center min-h-[18px] ${fontClass}`}>
                                <div className={`flex-1 pr-2 uppercase ${indentClass} ${row.type === 'header' || row.type === 'subheader' ? 'underline decoration-slate-300 underline-offset-2' : ''}`}>
                                  {row.label}
                                </div>
                                <div className="w-[100px] shrink-0 text-right pr-2 font-mono text-[9px] tabular-nums text-slate-900">
                                  {row.amount !== undefined ? fmtReport(row.amount) : ""}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex border-t border-slate-800 font-bold text-slate-900 bg-slate-50 relative z-10 mt-auto">
                        <div className="flex-1 py-1.5 pl-2 uppercase font-bold">TOTAL</div>
                        <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 font-mono tabular-nums font-bold">
                          {fmtReport(data.totalLiabCap)}
                        </div>
                      </div>
                    </div>

                    {/* ASSETS COLUMN (RIGHT SIDE) */}
                    <div className="relative flex flex-col justify-between h-full">
                      <div className="absolute top-0 bottom-0 right-[100px] border-l border-slate-800 pointer-events-none" />
                      <div className="flex-1 flex flex-col">
                        <div className="flex border-b border-slate-800 font-bold bg-slate-50 relative z-10">
                          <div className="flex-1 py-1.5 pl-2 text-slate-800 uppercase font-bold">ASSETS</div>
                          <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 text-slate-800 uppercase font-bold">AMOUNT</div>
                        </div>
                        <div className="flex-grow py-2 relative z-10 space-y-0.5 pb-4">
                          {rightRows.map((row, idx) => {
                            const indentClass = row.depth === 0 ? "pl-2" : row.depth === 1 ? "pl-5" : "pl-8";
                            const fontClass = 
                              row.type === 'header' 
                                ? "font-bold text-slate-900 text-[10px] mt-2 first:mt-0" 
                                : row.type === 'subheader' 
                                  ? "font-bold text-slate-700 text-[9px] mt-1.5" 
                                  : "font-normal text-slate-600 text-[9px]";

                            return (
                              <div key={idx} className={`flex py-0.5 items-center min-h-[18px] ${fontClass}`}>
                                <div className={`flex-1 pr-2 uppercase ${indentClass} ${row.type === 'header' || row.type === 'subheader' ? 'underline decoration-slate-300 underline-offset-2' : ''}`}>
                                  {row.label}
                                </div>
                                <div className="w-[100px] shrink-0 text-right pr-2 font-mono text-[9px] tabular-nums text-slate-900">
                                  {row.amount !== undefined ? fmtReport(row.amount) : ""}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex border-t border-slate-800 font-bold text-slate-900 bg-slate-50 relative z-10 mt-auto">
                        <div className="flex-1 py-1.5 pl-2 uppercase font-bold">TOTAL</div>
                        <div className="w-[100px] shrink-0 py-1.5 text-right pr-2 font-mono tabular-nums font-bold">
                          {fmtReport(data.totalAssets)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Balance Equation Footer */}
                <div className={`flex items-center justify-center gap-4 py-2.5 px-4 rounded-lg border-2 mt-4 text-[10px] ${
                  data.isBalanced ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-medium" : "border-red-300 bg-red-50 text-red-800 font-medium"
                }`}>
                  <div>
                    <span>Assets: </span>
                    <span className="font-bold font-mono">{fmt(data.totalAssets)}</span>
                  </div>
                  <span className="font-bold">=</span>
                  <div>
                    <span>Liabilities + Capital: </span>
                    <span className="font-bold font-mono">{fmt(data.totalLiabCap)}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                    data.isBalanced ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                  }`}>
                    {data.isBalanced ? "Balanced ✓" : "Out of Balance ✗"}
                  </span>
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </aside>
  );
}
