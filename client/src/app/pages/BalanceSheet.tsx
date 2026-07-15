import { useState, useCallback, useRef } from "react";
import {
  Download, Printer, TrendingUp, TrendingDown, Scale, RefreshCw,
  CheckCircle2, AlertTriangle, BookOpen, ArrowLeftRight, FileText, X,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useApp } from "../context/AppContext";
import { FYBanner } from "../components/FYBanner";
import { BalanceSheetData } from "../api/balanceSheetApi";
import { TrialRow } from "../api/trialBalanceApi";
import { LedgerStatementModal } from "./TrialBalance";
import { exportBalanceSheetDirect } from "../api/exportApi";
import { useBalanceSheet } from "../hooks/useReportQueries";
import { BalanceSheetSkeleton, RefreshingBadge } from "../components/SkeletonLoaders";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../api/queryClient";

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
    title: "RESERVES & SURPLUS",
    groups: ["Reserve & surplus"]
  },
  {
    title: "SECURED LOANS",
    groups: ["Secured Loans", "Bank OCC a/c", "Loans (Liability)"]
  },
  {
    title: "UNSECURED LOANS",
    groups: ["Unsecured Loans"]
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
      { title: "INVENTORY", groups: ["Stock-in-hand", "Stock-in-hand", "OPENING STOCK", "Opening Stock", "opening stock"] },
      { title: "SUNDRY DEBTORS", groups: ["Sundry Debtors"] },
      { title: "CASH AND BANK", groups: ["Cash-in-hand", "Bank Accounts (Banks)", "Cash", "Bank", "Cash Ledger A/C.", "Bank Accounts"] }
    ]
  },
  {
    title: "LOANS AND ADVANCES (ASSETS)",
    groups: ["Loans & Advances (Asset)", "Deposits (Asset)"]
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

      const allLedgers = matchedGroups.flatMap((g: any) => g.ledgers).filter((l: any) => Math.abs(l.amount) >= 0.01);
      if (allLedgers.length === 0) return null;

      const total = allLedgers.reduce((sum: number, l: any) => sum + l.amount, 0);

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

        const allLedgers = matchedGroups.flatMap((g: any) => g.ledgers).filter((l: any) => Math.abs(l.amount) >= 0.01);
        if (allLedgers.length === 0) return null;

        const total = allLedgers.reduce((sum: number, l: any) => sum + l.amount, 0);
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

  // Collect any unmatched user-created custom groups, also filtering zero balance ledgers
  const unmatched = apiSection.groups.filter((g: any) =>
    !matchedGroupKeys.has(g.groupKey.toLowerCase())
  ).map((g: any) => {
    const nonZeroLedgers = g.ledgers.filter((l: any) => Math.abs(l.amount) >= 0.01);
    if (nonZeroLedgers.length === 0) return null;
    return {
      ...g,
      ledgers: nonZeroLedgers,
      total: nonZeroLedgers.reduce((sum: number, l: any) => sum + l.amount, 0)
    };
  }).filter(Boolean);

  return { structured: result, unmatched };
}

interface ReportRow {
  type: 'header' | 'subheader' | 'ledger';
  label: string;
  amount?: number;
  depth: number;
  ledgerName?: string;
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
          depth: depth,
          ledgerName: item.ledgers[0].ledgerName
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
            depth: depth + 1,
            ledgerName: l.ledgerName
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
        depth: 1,
        ledgerName: l.ledgerName
      });
    });
  });
  return rows;
}

// â”€â”€ Extra Calculations for Trading & P&L and Capital Accounts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface CapitalTxn {
  particulars: string;
  amount?: number;
  ledgerName?: string;
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

    // 1. Stock / Inventory Ledgers categorization
    const isStockGroup = 
      groupName === "stock-in-hand" || 
      groupName === "inventory" || 
      groupName === "opening stock" ||
      groupName.includes("stock") ||
      groupName.includes("inventory");

    const isStockLedger =
      ledgerName.includes("stock") ||
      ledgerName.includes("inventory");

    if (isStockGroup || isStockLedger) {
      // 1a. Opening Stock: derived from opening Dr balance, or if name contains "opening" and has a balance
      if (ledgerName.includes("opening")) {
        const amount = r.openingDr > 0 ? r.openingDr : r.closingDr;
        if (amount > 0) {
          openingStockRows.push({ name: r.ledgerName, amount });
        }
      } else {
        if (r.openingDr > 0) {
          // Check if this opening balance was transferred to a dedicated "opening" stock ledger
          const isTransferred = rows.some((other) => {
            const otherLedger = other.ledgerName.toLowerCase();
            if (!otherLedger.includes("opening")) return false;
            const otherAmount = other.openingDr > 0 ? other.openingDr : other.closingDr;
            if (otherAmount <= 0) return false;
            
            // Clean names to check relationship
            const cleanR = r.ledgerName.toLowerCase().replace("opening", "").replace(/\s+/g, "").trim();
            const cleanOther = other.ledgerName.toLowerCase().replace("opening", "").replace(/\s+/g, "").trim();
            return cleanR === cleanOther || cleanR.includes(cleanOther) || cleanOther.includes(cleanR) || Math.abs(otherAmount - r.openingDr) < 0.01;
          });
          
          if (!isTransferred) {
            openingStockRows.push({ name: r.ledgerName, amount: r.openingDr });
          }
        }
      }

      // 1b. Closing Stock:
      // Exclude any ledger representing opening stock transfers (contains "opening" in the name)
      // and exclude duplicate credit ledger if we already counted the debit side of the transfer/JV
      if (!ledgerName.includes("opening")) {
        const netClosingDr = r.closingDr - r.closingCr;
        if (netClosingDr > 0) {
          closingStockRows.push({ name: r.ledgerName, amount: netClosingDr });
        } else if (netClosingDr < 0 && ledgerName.includes("closing")) {
          const otherHasClosingDr = rows.some((other) => {
            const otherLedger = other.ledgerName.toLowerCase();
            return !otherLedger.includes("opening") && !otherLedger.includes("closing") && (other.closingDr - other.closingCr) > 0;
          });
          if (!otherHasClosingDr) {
            closingStockRows.push({ name: r.ledgerName, amount: Math.abs(netClosingDr) });
          }
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
  tbRows: TrialRow[],
  capitalLedgerNames: Set<string>
): PartnerCapitalAccount {
  const name = ledger.ledgerName;
  
  const tbRow = tbRows.find(r => r.ledgerName.toLowerCase() === name.toLowerCase());
  const openingBalance = tbRow ? (tbRow.openingCr - tbRow.openingDr) : (ledger.openingCr - ledger.openingDr);
  const closingBalance = tbRow ? (tbRow.closingCr - tbRow.closingDr) : 0;
  
  const debits: CapitalTxn[] = [];
  const credits: CapitalTxn[] = [];
  
  if (name.toLowerCase() === "opening balance" || name.toLowerCase().includes("capital")) {
    credits.push({ particulars: "BY OPENING BALANCE", amount: Math.abs(openingBalance) });
  } else {
    if (closingBalance > 0) {
      credits.push({ particulars: `BY ${name.toUpperCase()}`, amount: closingBalance });
    } else if (closingBalance < 0) {
      debits.push({ particulars: `TO ${name.toUpperCase()}`, amount: Math.abs(closingBalance) });
    }
  }

  return {
    ledgerName: name.toUpperCase(),
    debits,
    credits,
    total: Math.max(
      debits.reduce((s, d) => s + (d.amount ?? 0), 0),
      credits.reduce((s, c) => s + (c.amount ?? 0), 0)
    )
  };
}

// ── Main component ─────────────────────────────────────────────────────────
export default function BalanceSheet() {
  const { selectedFY, company } = useApp();
  const qc = useQueryClient();
  const financialYear = selectedFY?.label ?? "—";

  // React Query hook — stale-while-revalidate: previous data shown instantly,
  // fresh data loaded in background. No full-page spinner on re-navigation.
  const {
    data: rawData,
    isLoading,
    isFetching,
    isError,
    error: queryError,
    refetch,
  } = useBalanceSheet();

  const data: BalanceSheetData | null = rawData ?? null;
  const loading   = isLoading;
  const refreshing = isFetching && !isLoading;
  const error     = isError ? (queryError as any)?.message ?? "Failed to load balance sheet" : null;

  const handleReportKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLElement>,
    section: string,
    row: number,
    col: number
  ) => {
    const isArrow = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key);
    if (!isArrow) return;

    e.preventDefault();

    const elements = Array.from(
      document.querySelectorAll("[data-report-section]")
    ) as HTMLElement[];

    const sectionElements = elements.filter(
      (el) => el.getAttribute("data-report-section") === section
    );

    let target: HTMLElement | undefined;

    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const targetCol = col === 0 ? 1 : 0;
      const colElements = sectionElements.filter(
        (el) => Number(el.getAttribute("data-report-col")) === targetCol
      );
      
      if (colElements.length > 0) {
        colElements.sort((a, b) => {
          const aRow = Number(a.getAttribute("data-report-row"));
          const bRow = Number(b.getAttribute("data-report-row"));
          return Math.abs(aRow - row) - Math.abs(bRow - row);
        });
        target = colElements[0];
      }
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const colElements = sectionElements.filter(
        (el) => Number(el.getAttribute("data-report-col")) === col
      );

      colElements.sort((a, b) => {
        const aRow = Number(a.getAttribute("data-report-row"));
        const bRow = Number(b.getAttribute("data-report-row"));
        return aRow - bRow;
      });

      const currentIndex = colElements.findIndex(
        (el) => Number(el.getAttribute("data-report-row")) === row
      );

      if (currentIndex !== -1) {
        if (e.key === "ArrowUp" && currentIndex > 0) {
          target = colElements[currentIndex - 1];
        } else if (e.key === "ArrowDown" && currentIndex < colElements.length - 1) {
          target = colElements[currentIndex + 1];
        }
      }
    }

    if (target) {
      target.focus();
    }
  }, []);

  const [selectedLedger, setSelectedLedger] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const capitalAccounts = data?.capitalAccounts ?? [];
  const tradingPLData   = data?.tradingPL ?? null;

  // Manual refresh — invalidates cache then refetches
  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: [...QUERY_KEYS.balanceSheet, selectedFY?._id] });
    refetch();
  };

  const triggerExport = useCallback(async () => {
    if (!data) {
      toast.error("No data to export.");
      return;
    }
    setExporting(true);
    try {
      await exportBalanceSheetDirect(data, {
        companyName: company?.name || "Company",
        companyAddress: company?.address || "",
        fyLabel: financialYear,
        dateFrom: selectedFY?.startDate || "",
        dateTo: selectedFY?.endDate || "",
      });
      toast.success("Balance Sheet exported to Excel!");
    } catch (e: any) {
      toast.error(e?.message || "Failed to export Excel.");
    } finally {
      setExporting(false);
    }
  }, [data, company, financialYear, selectedFY]);

  // ── Print / Export PDF ────────────────────────────────────────────────────
  const triggerPrint = useCallback((saveAsPDF = false) => {
    if (!data) {
      toast.error("No data to print — please wait for the report to load.");
      return;
    }
    // Import dynamically or use imported printElement helper
    import("../utils/printUtils").then(({ printElement }) => {
      printElement(printAreaRef.current, `${company?.name || "Company"} - Balance Sheet`, saveAsPDF);
    });
  }, [data, company]);

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

  // Compute totals from DISPLAYED rows only (so manual addition matches the shown total)
  const displayedLiabTotal = leftRows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const displayedAssetsTotal = rightRows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const displayedDifference = Math.abs(displayedAssetsTotal - displayedLiabTotal);
  const displayedIsBalanced = displayedDifference < 1;

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
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={() => triggerPrint(false)}
            disabled={!data}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
          >
            <Printer size={14} /> Print
          </button>
          <button
            onClick={() => triggerPrint(true)}
            disabled={!data || loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
          >
            <Download size={14} /> Export PDF
          </button>
          <button
            onClick={triggerExport}
            disabled={!data || loading || exporting}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-40"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export Excel
          </button>
        </div>
      </div>

      {/* Skeleton shown only on first load (no previous data) */}
      {loading && <BalanceSheetSkeleton />}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Background refresh badge — subtle, non-blocking */}
      {refreshing && !loading && (
        <div className="fixed top-4 right-4 z-50">
          <RefreshingBadge visible={refreshing} />
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* ── printable report wrapper ── */}
          <div id="bs-print-area" ref={printAreaRef} className="space-y-5">

          {/* Balance banner - hidden when printing */}
          <div className={`no-print flex items-center gap-3 px-4 py-3 rounded-xl border ${
            displayedIsBalanced
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}>
            {displayedIsBalanced
              ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              : <AlertTriangle size={18} className="text-red-500 shrink-0" />}
            <div className="flex-1">
              <span className="text-sm font-medium">
                {displayedIsBalanced
                  ? "Balance Sheet is Balanced — Assets = Liabilities + Capital"
                  : `Out of Balance! Difference: \u20B9${displayedDifference.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>
            <span className="text-xs text-slate-500 hidden sm:block">
              Generated {new Date(data.generatedAt).toLocaleTimeString("en-IN")}
            </span>
          </div>

          {/* Summary cards - hidden when printing */}
          <div className="no-print grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                <TrendingUp size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Assets</p>
                <p className="font-bold text-slate-900 tabular-nums">{fmt(displayedAssetsTotal)}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0">
                <TrendingDown size={18} className="text-indigo-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Liabilities + Capital</p>
                <p className="font-bold text-slate-900 tabular-nums">{fmt(displayedLiabTotal)}</p>
              </div>
            </div>
            <div className={`rounded-xl p-4 shadow-sm border flex items-center gap-3 ${
              displayedIsBalanced ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
            }`}>
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0">
                <Scale size={18} className={displayedIsBalanced ? "text-emerald-600" : "text-red-600"} />
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

          {/* Source stats - hidden when printing */}
          <div className="no-print grid grid-cols-3 gap-3">
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
                tradingLeft.push({ label: r.name, amount: r.amount, depth: 1, ledgerName: r.name });
              });
            }
            if (tpl.totalPurchases > 0) {
              tradingLeft.push({ label: "TO PURCHASE A/C", isHeader: true, depth: 0 });
              tpl.purchaseRows.forEach((r: any) => {
                tradingLeft.push({ label: r.name, amount: r.amount, depth: 1, ledgerName: r.name });
              });
            }
            if (tpl.totalDirectExp > 0) {
              tradingLeft.push({ label: "TO DIRECT EXPENSES", isHeader: true, depth: 0 });
              tpl.directExpRows.forEach((r: any) => {
                tradingLeft.push({ label: r.name, amount: r.amount, depth: 1, ledgerName: r.name });
              });
            }
            if (tpl.grossProfit > 0) {
              tradingLeft.push({ label: "TO GROSS PROFIT", amount: tpl.grossProfit, isBold: true, depth: 0 });
            }

            // Trading Right (Credits)
            if (tpl.totalSales > 0) {
              tradingRight.push({ label: "BY SALES A/C", isHeader: true, depth: 0 });
              tpl.salesRows.forEach((r: any) => {
                tradingRight.push({ label: r.name, amount: r.amount, depth: 1, ledgerName: r.name });
              });
            }
            if (tpl.totalClosingStock > 0) {
              tradingRight.push({ label: "BY INVENTORY", isHeader: true, depth: 0 });
              tpl.closingStockRows.forEach((r: any) => {
                tradingRight.push({ label: r.name, amount: r.amount, depth: 1, ledgerName: r.name });
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
                plLeft.push({ label: r.name, amount: r.amount, depth: 1, ledgerName: r.name });
              });
            }
            if (tpl.totalIndirectExp > 0) {
              plLeft.push({ label: "TO INDIRECT EXPENSES", isHeader: true, depth: 0 });
              tpl.indirectExpRows.forEach((r: any) => {
                plLeft.push({ label: r.name, amount: r.amount, depth: 1, ledgerName: r.name });
              });
            }
            if (tpl.totalDepreciation > 0) {
              plLeft.push({ label: "TO DEPRECIATION", isHeader: true, depth: 0 });
              tpl.depreciationRows.forEach((r: any) => {
                plLeft.push({ label: r.name, amount: r.amount, depth: 1, ledgerName: r.name });
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
                plRight.push({ label: r.name, amount: r.amount, depth: 1, ledgerName: r.name });
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

            const renderPLRowHelper = (rows: any[], sectionName: string, colIdx: number) => {
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

                const isClickable = !!row.ledgerName;
                return (
                  <div
                    key={idx}
                    onClick={() => isClickable && setSelectedLedger(row.ledgerName!)}
                    onKeyDown={(e) => {
                      if (isClickable) {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedLedger(row.ledgerName!);
                        } else {
                          handleReportKeyDown(e, sectionName, idx, colIdx);
                        }
                      }
                    }}
                    tabIndex={isClickable ? 0 : undefined}
                    data-report-section={sectionName}
                    data-report-row={idx}
                    data-report-col={colIdx}
                    role={isClickable ? "button" : undefined}
                    aria-label={isClickable ? `Open ledger statement: ${row.label}` : undefined}
                    className={`flex py-0.5 items-center min-h-[22px] ${fontClass} rounded-sm outline-none group ${
                      isClickable
                        ? 'cursor-pointer focus:bg-indigo-500 focus:text-white focus:ring-0 hover:bg-indigo-50 transition-colors'
                        : ''
                    }`}
                  >
                    <div
                      className={`flex-1 pr-2 uppercase ${indentClass} ${
                        row.isHeader ? 'underline decoration-slate-300 underline-offset-2' : ''
                      } group-focus:text-white`}
                    >
                      {row.label}
                    </div>
                    <div className="w-[140px] shrink-0 text-right pr-4 font-mono text-xs tabular-nums text-slate-900 group-focus:text-white">
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
                <div className="bg-white border border-slate-800 max-w-4xl mx-auto rounded-none shadow-sm flex flex-col">
                  
                  {/* 1. TRADING ACCOUNT PART */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800 border-b border-slate-800">
                    
                    {/* LEFT SIDE (DEBITS) */}
                    <div className="relative flex flex-col justify-between h-full">
                      <div className="absolute top-0 bottom-0 right-[140px] border-l border-slate-800 pointer-events-none" />
                      <div className="flex-grow flex flex-col justify-between">
                        <div>
                          <div className="flex border-b border-slate-800 font-bold text-xs bg-slate-50/50 relative z-10">
                            <div className="flex-1 py-3 pl-4 text-slate-800 uppercase tracking-wider font-bold">PARTICULARS</div>
                            <div className="w-[140px] shrink-0 py-3 text-right pr-4 text-slate-800 uppercase tracking-wider font-bold">AMOUNT</div>
                          </div>
                          <div className="py-3 relative z-10 space-y-1">
                            {renderPLRowHelper(tradingLeft, "trading", 0)}
                          </div>
                        </div>
                        <div className="flex border-t border-slate-800 font-bold text-slate-900 text-xs bg-slate-50/50 relative z-10">
                          <div className="flex-1 py-3 pl-4 uppercase tracking-wider font-bold">TOTAL</div>
                          <div className="w-[140px] shrink-0 py-3 text-right pr-4 font-mono text-xs tabular-nums font-bold">
                            {fmtReport(tradingTotalAmount)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT SIDE (CREDITS) */}
                    <div className="relative flex flex-col justify-between h-full">
                      <div className="absolute top-0 bottom-0 right-[140px] border-l border-slate-800 pointer-events-none" />
                      <div className="flex-grow flex flex-col justify-between">
                        <div>
                          <div className="flex border-b border-slate-800 font-bold text-xs bg-slate-50/50 relative z-10">
                            <div className="flex-1 py-3 pl-4 text-slate-800 uppercase tracking-wider font-bold">PARTICULARS</div>
                            <div className="w-[140px] shrink-0 py-3 text-right pr-4 text-slate-800 uppercase tracking-wider font-bold">AMOUNT</div>
                          </div>
                          <div className="py-3 relative z-10 space-y-1">
                            {renderPLRowHelper(tradingRight, "trading", 1)}
                          </div>
                        </div>
                        <div className="flex border-t border-slate-800 font-bold text-slate-900 text-xs bg-slate-50/50 relative z-10">
                          <div className="flex-1 py-3 pl-4 uppercase tracking-wider font-bold">TOTAL</div>
                          <div className="w-[140px] shrink-0 py-3 text-right pr-4 font-mono text-xs tabular-nums font-bold">
                            {fmtReport(tradingTotalAmount)}
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* 2. PROFIT & LOSS PART */}
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
                    
                    {/* LEFT SIDE (DEBITS) */}
                    <div className="relative flex flex-col justify-between h-full">
                      <div className="absolute top-0 bottom-0 right-[140px] border-l border-slate-800 pointer-events-none" />
                      <div className="flex-grow flex flex-col justify-between">
                        <div className="py-3 relative z-10 space-y-1">
                          {renderPLRowHelper(plLeft, "pl", 0)}
                        </div>
                        <div className="flex border-t border-slate-800 font-bold text-slate-900 text-xs bg-slate-50/50 relative z-10">
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
                      <div className="flex-grow flex flex-col justify-between">
                        <div className="py-3 relative z-10 space-y-1">
                          {renderPLRowHelper(plRight, "pl", 1)}
                        </div>
                        <div className="flex border-t border-slate-800 font-bold text-slate-900 text-xs bg-slate-50/50 relative z-10">
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

          {/* 2. CAPITAL ACCOUNT (Combined single table for all capital ledgers) */}
          {capitalAccounts.length > 0 && (() => {
            // Merge all capital ledger accounts into one combined Capital Account
            const allDebits: CapitalTxn[] = [];
            const openingBalanceCredits: CapitalTxn[] = [];
            const otherCredits: CapitalTxn[] = [];
            let combinedTotal = 0;

            capitalAccounts.forEach((account: PartnerCapitalAccount) => {
              // For each capital ledger, add its opening balance with ledger name prefix
              const openingRow = account.credits.find(c => c.particulars === "BY OPENING BALANCE");
              const mainName = account.ledgerName || "Capital Account";
              if (openingRow && (openingRow.amount ?? 0) > 0) {
                if (capitalAccounts.length === 1 || account.ledgerName === "OPENING BALANCE") {
                  openingBalanceCredits.push({ particulars: "BY OPENING BALANCE", amount: openingRow.amount, ledgerName: mainName });
                } else {
                  openingBalanceCredits.push({ particulars: `BY OPENING BALANCE (${mainName})`, amount: openingRow.amount, ledgerName: mainName });
                }
              }
              // Other credits (not opening balance)
              account.credits
                .filter(c => c.particulars !== "BY OPENING BALANCE")
                .forEach(c => {
                  let cleanName = c.particulars;
                  if (cleanName.startsWith("BY ")) {
                    cleanName = cleanName.slice(3);
                  }
                  otherCredits.push({ ...c, ledgerName: cleanName });
                });
              // Debits (not closing balance)
              account.debits
                .filter(d => !d.particulars.includes("TO CLOSING BALANCE"))
                .forEach(d => {
                  let cleanName = d.particulars;
                  if (cleanName.startsWith("TO ")) {
                    cleanName = cleanName.slice(3);
                  }
                  allDebits.push({ ...d, ledgerName: cleanName });
                });
            });

            const allCredits = [...openingBalanceCredits, ...otherCredits];

            // Compute combined closing balance
            const creditsSum = allCredits.reduce((s, c) => s + (c.amount ?? 0), 0);
            const debitsSum = allDebits.reduce((s, d) => s + (d.amount ?? 0), 0);
            const closingBalance = creditsSum - debitsSum;
            const mainLedgerName = capitalAccounts[0]?.ledgerName || "Capital Account";
            allDebits.push({ particulars: "TO CLOSING BALANCE", amount: closingBalance, ledgerName: mainLedgerName });
            combinedTotal = Math.max(
              allDebits.reduce((s, d) => s + (d.amount ?? 0), 0),
              allCredits.reduce((s, c) => s + (c.amount ?? 0), 0)
            );

            const maxLen = Math.max(allDebits.length, allCredits.length);
            const paddedDebits = [...allDebits];
            const paddedCredits = [...allCredits];
            while (paddedDebits.length < maxLen) paddedDebits.push({ particulars: "", amount: undefined });
            while (paddedCredits.length < maxLen) paddedCredits.push({ particulars: "", amount: undefined });

            return (
              <div className="space-y-4">
                {/* Header Block */}
                <div className="text-center py-4 max-w-4xl mx-auto">
                  <h2 className="text-xl font-bold text-slate-900 uppercase tracking-wide">{company?.name || "XYZ COMPANY"}</h2>
                  <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide font-medium">
                    {company?.address || "ADDRESS"}
                  </p>
                  <p className="text-sm font-bold text-slate-800 mt-2 uppercase tracking-widest">
                    CAPITAL ACCOUNT FOR THE YEAR ENDING ON {selectedFY ? new Date(selectedFY.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : today}
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
                            if (row.particulars === "") return <div key={idx} className="min-h-[22px] py-0.5" />;
                            const isClickable = !!row.ledgerName;
                            const isClosing = row.particulars.includes("CLOSING BALANCE");
                            const fontClass = isClosing ? "font-bold text-slate-800 text-xs" : "font-normal text-slate-600 text-xs";
                            return (
                              <div
                                key={idx}
                                onClick={() => isClickable && setSelectedLedger(row.ledgerName!)}
                                onKeyDown={(e) => {
                                  if (isClickable) {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setSelectedLedger(row.ledgerName!);
                                    } else {
                                      handleReportKeyDown(e, "capital", idx, 0);
                                    }
                                  }
                                }}
                                tabIndex={isClickable ? 0 : undefined}
                                data-report-section="capital"
                                data-report-row={idx}
                                data-report-col={0}
                                role={isClickable ? "button" : undefined}
                                aria-label={isClickable ? `Open ledger statement: ${row.particulars}` : undefined}
                                className={`flex py-0.5 items-center min-h-[22px] ${fontClass} rounded-sm outline-none group ${
                                  isClickable
                                    ? 'cursor-pointer focus:bg-indigo-500 focus:text-white focus:ring-0 hover:bg-indigo-50 transition-colors'
                                    : ''
                                }`}
                              >
                                <div className="flex-1 pr-2 uppercase pl-4 group-focus:text-white">{row.particulars}</div>
                                <div className="w-[140px] shrink-0 text-right pr-4 font-mono text-xs tabular-nums text-slate-900 group-focus:text-white">
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
                          {fmtReport(combinedTotal)}
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
                            if (row.particulars === "") return <div key={idx} className="min-h-[22px] py-0.5" />;
                            const isClickable = !!row.ledgerName;
                            const isOpening = row.particulars.includes("OPENING BALANCE");
                            const fontClass = isOpening ? "font-bold text-slate-800 text-xs" : "font-normal text-slate-600 text-xs";
                            return (
                              <div
                                key={idx}
                                onClick={() => isClickable && setSelectedLedger(row.ledgerName!)}
                                onKeyDown={(e) => {
                                  if (isClickable) {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setSelectedLedger(row.ledgerName!);
                                    } else {
                                      handleReportKeyDown(e, "capital", idx, 1);
                                    }
                                  }
                                }}
                                tabIndex={isClickable ? 0 : undefined}
                                data-report-section="capital"
                                data-report-row={idx}
                                data-report-col={1}
                                role={isClickable ? "button" : undefined}
                                aria-label={isClickable ? `Open ledger statement: ${row.particulars}` : undefined}
                                className={`flex py-0.5 items-center min-h-[22px] ${fontClass} rounded-sm outline-none group ${
                                  isClickable
                                    ? 'cursor-pointer focus:bg-indigo-500 focus:text-white focus:ring-0 hover:bg-indigo-50 transition-colors'
                                    : ''
                                }`}
                              >
                                <div className="flex-1 pr-2 uppercase pl-4 group-focus:text-white">{row.particulars}</div>
                                <div className="w-[140px] shrink-0 text-right pr-4 font-mono text-xs tabular-nums text-slate-900 group-focus:text-white">
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
                          {fmtReport(combinedTotal)}
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
                        const isClickable = !!row.ledgerName;

                        return (
                          <div
                            key={idx}
                            onClick={() => isClickable && setSelectedLedger(row.ledgerName!)}
                            onKeyDown={(e) => {
                              if (isClickable) {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedLedger(row.ledgerName!);
                                } else {
                                  handleReportKeyDown(e, "balance-sheet", idx, 0);
                                }
                              }
                            }}
                            tabIndex={isClickable ? 0 : undefined}
                            data-report-section="balance-sheet"
                            data-report-row={idx}
                            data-report-col={0}
                            role={isClickable ? "button" : undefined}
                            aria-label={isClickable ? `Open ledger statement: ${row.label}` : undefined}
                            className={`flex py-0.5 items-center ${fontClass} rounded-sm outline-none group ${
                              isClickable
                                ? 'cursor-pointer focus:bg-indigo-500 focus:text-white focus:ring-0 hover:bg-indigo-50 transition-colors'
                                : ''
                            }`}
                          >
                            <div
                              className={`flex-1 pr-2 uppercase ${indentClass} ${
                                row.type === 'header' || row.type === 'subheader' ? 'underline decoration-slate-300 underline-offset-2' : ''
                              } group-focus:text-white`}
                            >
                              {row.label}
                            </div>
                            <div className="w-[140px] shrink-0 text-right pr-4 font-mono text-xs tabular-nums text-slate-900 group-focus:text-white">
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
                      {fmtReport(displayedLiabTotal)}
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
                        const isClickable = !!row.ledgerName;

                        return (
                          <div
                            key={idx}
                            onClick={() => isClickable && setSelectedLedger(row.ledgerName!)}
                            onKeyDown={(e) => {
                              if (isClickable) {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedLedger(row.ledgerName!);
                                } else {
                                  handleReportKeyDown(e, "balance-sheet", idx, 1);
                                }
                              }
                            }}
                            tabIndex={isClickable ? 0 : undefined}
                            data-report-section="balance-sheet"
                            data-report-row={idx}
                            data-report-col={1}
                            role={isClickable ? "button" : undefined}
                            aria-label={isClickable ? `Open ledger statement: ${row.label}` : undefined}
                            className={`flex py-0.5 items-center ${fontClass} rounded-sm outline-none group ${
                              isClickable
                                ? 'cursor-pointer focus:bg-indigo-500 focus:text-white focus:ring-0 hover:bg-indigo-50 transition-colors'
                                : ''
                            }`}
                          >
                            <div
                              className={`flex-1 pr-2 uppercase ${indentClass} ${
                                row.type === 'header' || row.type === 'subheader' ? 'underline decoration-slate-300 underline-offset-2' : ''
                              } group-focus:text-white`}
                            >
                              {row.label}
                            </div>
                            <div className="w-[140px] shrink-0 text-right pr-4 font-mono text-xs tabular-nums text-slate-900 group-focus:text-white">
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
                      {fmtReport(displayedAssetsTotal)}
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Balance equation footer */}
            <div className={`flex flex-wrap items-center justify-center gap-4 py-4 px-6 rounded-xl border-2 max-w-4xl mx-auto mt-6 ${
              displayedIsBalanced ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"
            }`}>
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Total Assets</p>
                <p className="font-bold text-blue-700 tabular-nums">{fmt(displayedAssetsTotal)}</p>
              </div>
              <span className={`text-xl font-bold ${displayedIsBalanced ? "text-emerald-600" : "text-red-500"}`}>
                {displayedIsBalanced ? "=" : "≠"}
              </span>
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Liabilities + Capital</p>
                <p className="font-bold text-indigo-700 tabular-nums">{fmt(displayedLiabTotal)}</p>
              </div>
              {!displayedIsBalanced && (
                <>
                  <div className="text-center">
                    <p className="text-xs text-red-500 uppercase tracking-wide">Difference</p>
                    <p className="font-bold text-red-600 tabular-nums">{fmt(displayedDifference)}</p>
                  </div>
                </>
              )}
              <span className={`ml-2 text-sm font-bold px-3 py-1 rounded-full ${
                displayedIsBalanced ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
              }`}>
                {displayedIsBalanced ? "Balanced ✓" : "Out of Balance ✗"}
              </span>
            </div>
          </div>
          </div>{/* end bs-print-area */}
        </>
      )}

      {selectedLedger && (
        <LedgerStatementModal
          ledgerName={selectedLedger}
          onClose={() => setSelectedLedger(null)}
        />
      )}
    </div>
  );
}

