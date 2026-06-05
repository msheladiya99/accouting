import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import {
  Scale, Layers, TrendingUp, Wallet, Landmark, BookOpen,
  CalendarDays, Download, Printer, RefreshCw, ChevronRight,
  AlertTriangle, CheckCircle2, Search,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { FYBanner } from "../components/FYBanner";
import { getAllFYs } from "../api/financialYearApi";
import type { FinancialYear } from "../api/financialYearApi";
import {
  getCashBook, getBankBook, getLedgerReport, getDayBook,
  getAllLedgerNames,
  computeTrialBalance, computeBalanceSheet, computePL,
  type BookRow, type LedgerRow, type DayBookRow,
} from "../api/reportsApi";
import type { TrialRow } from "../api/trialBalanceApi";
import type { BalanceSheetData } from "../api/balanceSheetApi";
import type { PLData } from "../api/plStatementApi";

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Constants ─────────────────────────────────────────────────────────────────
const ALL_GROUPS = ["All","Assets","Bank","Cash","Liabilities","Capital","Income","Expense","Purchases","Sales","Sundry Debtors","Sundry Creditors"];

const REPORT_TYPES = [
  { id: "trial-balance", label: "Trial Balance",  icon: Scale,       color: "indigo", desc: "All ledgers with Dr/Cr" },
  { id: "balance-sheet", label: "Balance Sheet",  icon: Layers,      color: "blue",   desc: "Assets vs Liabilities" },
  { id: "profit-loss",   label: "Profit & Loss",  icon: TrendingUp,  color: "emerald",desc: "Income & Expenses" },
  { id: "cash-book",     label: "Cash Book",      icon: Wallet,      color: "amber",  desc: "Cash account entries" },
  { id: "bank-book",     label: "Bank Book",      icon: Landmark,    color: "sky",    desc: "Bank account entries" },
  { id: "ledger-report", label: "Ledger Report",  icon: BookOpen,    color: "violet", desc: "Single ledger history" },
  { id: "day-book",      label: "Day Book",       icon: CalendarDays,color: "slate",  desc: "All daily transactions" },
] as const;

type ReportId = typeof REPORT_TYPES[number]["id"];

const COLOR_MAP: Record<string, { active: string; icon: string }> = {
  indigo:  { active: "bg-indigo-600 text-white border-indigo-600",  icon: "text-indigo-500"  },
  blue:    { active: "bg-blue-600 text-white border-blue-600",      icon: "text-blue-500"    },
  emerald: { active: "bg-emerald-600 text-white border-emerald-600",icon: "text-emerald-500" },
  amber:   { active: "bg-amber-500 text-white border-amber-500",    icon: "text-amber-500"   },
  sky:     { active: "bg-sky-600 text-white border-sky-600",        icon: "text-sky-500"     },
  violet:  { active: "bg-violet-600 text-white border-violet-600",  icon: "text-violet-500"  },
  slate:   { active: "bg-slate-700 text-white border-slate-700",    icon: "text-slate-500"   },
};

const GROUP_BADGE_COLORS: Record<string, string> = {
  Assets: "bg-blue-50 text-blue-700", Bank: "bg-sky-50 text-sky-700", Cash: "bg-cyan-50 text-cyan-700",
  Liabilities: "bg-red-50 text-red-700", Capital: "bg-purple-50 text-purple-700",
  Income: "bg-emerald-50 text-emerald-700", Expense: "bg-orange-50 text-orange-700",
  Purchases: "bg-amber-50 text-amber-700", Sales: "bg-teal-50 text-teal-700",
  "Sundry Debtors": "bg-violet-50 text-violet-700", "Sundry Creditors": "bg-pink-50 text-pink-700",
  "Bank/Cash": "bg-sky-50 text-sky-700", Journal: "bg-indigo-50 text-indigo-700",
};

const fmt = (v: number) => v !== 0 ? `₹${Math.abs(v).toLocaleString("en-IN")}` : "—";
const fmtSigned = (v: number) => v < 0 ? `(₹${Math.abs(v).toLocaleString("en-IN")})` : `₹${v.toLocaleString("en-IN")}`;

function GroupBadge({ value }: { value: string }) {
  const cls = GROUP_BADGE_COLORS[value] ?? "bg-slate-100 text-slate-600";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{value}</span>;
}

// ── Balance Sheet formatted view ──────────────────────────────────────────────
function BSReport({ data }: { data: BalanceSheetData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[data.assetsSection, data.liabCapSection].map((section) => (
        <div key={section.sectionName} className="border border-slate-100 rounded-xl overflow-hidden">
          <div className={`px-4 py-3 ${section.sectionName === "Assets" ? "bg-blue-600" : "bg-indigo-600"} text-white`}>
            <p className="font-semibold text-sm">{section.sectionName}</p>
          </div>
          {section.groups.map((g) => (
            <div key={g.groupKey}>
              <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{g.groupName}</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{fmt(g.total)}</span>
              </div>
              {g.ledgers.map((l) => (
                <div key={l.ledgerName} className="flex items-center justify-between px-4 py-2.5 pl-8 border-b border-slate-50 hover:bg-slate-50/50">
                  <span className="text-sm text-slate-600">{l.ledgerName}</span>
                  <span className="text-sm font-medium text-slate-800 tabular-nums">{fmtSigned(l.amount)}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white">
            <span className="text-sm font-bold">Total {section.sectionName}</span>
            <span className="font-bold tabular-nums">{fmt(section.total)}</span>
          </div>
        </div>
      ))}
      <div className={`lg:col-span-2 flex items-center justify-center gap-6 py-3.5 rounded-xl border-2 font-semibold text-sm ${data.isBalanced ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-700"}`}>
        {data.isBalanced ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-red-500" />}
        Assets {fmt(data.totalAssets)} = Liabilities + Capital {fmt(data.totalLiabCap)} · {data.isBalanced ? "Balanced ✓" : `Diff ₹${data.difference.toLocaleString("en-IN")}`}
      </div>
    </div>
  );
}

// ── P&L formatted view ────────────────────────────────────────────────────────
function PLReport({ data }: { data: PLData }) {
  const sections = [
    { title: "Sales Revenue",    sub: "Direct sales", section: data.sales,            color: "emerald" },
    { title: "Other Income",     sub: "Misc income",  section: data.otherIncome,      color: "teal"    },
    { title: "Direct Expenses",  sub: "COGS",         section: data.directExpenses,   color: "amber"   },
    { title: "Indirect Expenses",sub: "Operating",    section: data.indirectExpenses, color: "red"     },
  ];
  const bgMap: Record<string, string> = { emerald:"bg-emerald-600", teal:"bg-teal-600", amber:"bg-amber-600", red:"bg-red-600" };
  const colMap: Record<string, string> = { emerald:"text-emerald-700", teal:"text-teal-700", amber:"text-amber-700", red:"text-red-600" };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {sections.map(({ title, sub, section, color }) => (
          <div key={title} className="border border-slate-100 rounded-xl overflow-hidden">
            <div className={`flex items-center justify-between px-4 py-3 ${bgMap[color]} text-white`}>
              <div><p className="text-sm font-semibold">{title}</p><p className="text-xs opacity-70">{sub}</p></div>
              <span className="font-bold tabular-nums">{fmt(section.total)}</span>
            </div>
            {section.entries.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400 italic">No entries in period</p>
            ) : section.entries.map((e) => (
              <div key={e.ledgerName} className="flex items-center justify-between px-4 py-2.5 pl-8 border-b border-slate-50 hover:bg-slate-50/50">
                <span className="text-sm text-slate-600">{e.ledgerName}</span>
                <span className={`text-sm font-medium tabular-nums ${colMap[color]}`}>{fmt(e.amount)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={`flex items-center justify-between px-5 py-3.5 rounded-xl border-2 font-semibold ${data.grossProfit >= 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          <span>Gross Profit</span>
          <span className="tabular-nums">{fmtSigned(data.grossProfit)}</span>
        </div>
        <div className={`flex items-center justify-between px-5 py-3.5 rounded-xl border-2 font-bold text-base ${data.isProfit ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-700"}`}>
          <span>{data.isProfit ? "Net Profit" : "Net Loss"}</span>
          <span className="tabular-nums">{fmtSigned(data.netProfit)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Reports() {
  const { selectedFY, setSelectedFY } = useApp();

  const [activeReport, setActiveReport] = useState<ReportId>("trial-balance");
  const [allFYs, setAllFYs]   = useState<FinancialYear[]>([]);
  const [activeFY, setActiveFY] = useState<FinancialYear | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [ledgerNames, setLedgerNames] = useState<string[]>([]);
  const [selectedLedger, setSelectedLedger] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [groupFilter,  setGroupFilter]  = useState("All");

  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const gridRef = useRef<AgGridReact>(null);

  // Load FYs + ledger names once
  useEffect(() => {
    getAllFYs().then((fys) => {
      setAllFYs(fys);
    });
    getAllLedgerNames().then((names) => {
      setLedgerNames(names);
      setSelectedLedger(names[0] ?? "");
    });
  }, []);

  // Synchronize activeFY with global selectedFY
  useEffect(() => {
    if (selectedFY) {
      setActiveFY(selectedFY);
      setDateFrom(selectedFY.startDate);
      setDateTo(selectedFY.endDate);
    }
  }, [selectedFY]);

  const handleFYChange = (id: string) => {
    const fy = allFYs.find((f) => f._id === id);
    if (fy) {
      setSelectedFY(fy);
    }
  };

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReportData(null);
    try {
      let data: any;
      switch (activeReport) {
        case "trial-balance":  data = await computeTrialBalance(); break;
        case "balance-sheet":  data = await computeBalanceSheet(); break;
        case "profit-loss":    data = await computePL(dateFrom, dateTo); break;
        case "cash-book":      data = await getCashBook(dateFrom, dateTo); break;
        case "bank-book":      data = await getBankBook(dateFrom, dateTo); break;
        case "ledger-report":  data = await getLedgerReport(selectedLedger, dateFrom, dateTo); break;
        case "day-book":       data = await getDayBook(dateFrom, dateTo, groupFilter); break;
      }
      setReportData(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate report");
    } finally {
      setLoading(false);
    }
  }, [activeReport, dateFrom, dateTo, selectedLedger, groupFilter]);

  // Auto-run when report type or date changes
  useEffect(() => { run(); }, [run]);

  // ── AG Grid column definitions per report ────────────────────────────────
  const colDefs = useMemo(() => {
    const moneyStyle = (red = false) => ({
      type: "numericColumn",
      valueFormatter: ({ value }: any) => fmt(value),
      cellStyle: ({ value }: any) => ({ color: value > 0 ? (red ? "#dc2626" : "#059669") : "#94a3b8", fontWeight: value > 0 ? "500" : "normal" }),
    });

    switch (activeReport) {
      case "trial-balance": return [
        { field: "ledgerName",    headerName: "Ledger Name",   flex: 1, minWidth: 180 },
        { field: "group",         headerName: "Group",         width: 145, cellRenderer: ({ value }: any) => <GroupBadge value={value} /> },
        { headerName: "Opening Balance", children: [
          { field: "openingDr",  headerName: "Dr", width: 120, ...moneyStyle() },
          { field: "openingCr",  headerName: "Cr", width: 120, ...moneyStyle(true) },
        ]},
        { headerName: "Transactions", children: [
          { field: "transactionDr", headerName: "Dr", width: 120, ...moneyStyle() },
          { field: "transactionCr", headerName: "Cr", width: 120, ...moneyStyle(true) },
        ]},
        { headerName: "Closing Balance", children: [
          { field: "closingDr",  headerName: "Dr", width: 130, ...moneyStyle(), cellStyle: ({ value }: any) => ({ color: value > 0 ? "#059669" : "#94a3b8", fontWeight: "600" }) },
          { field: "closingCr",  headerName: "Cr", width: 130, ...moneyStyle(true), cellStyle: ({ value }: any) => ({ color: value > 0 ? "#dc2626" : "#94a3b8", fontWeight: "600" }) },
        ]},
      ];
      case "cash-book":
      case "bank-book": return [
        { field: "srNo",          headerName: "#",            width: 60 },
        { field: "date",          headerName: "Date",         width: 110 },
        { field: "accountName",   headerName: "Account",      width: 160 },
        { field: "particulars",   headerName: "Particulars",  flex: 1, minWidth: 180 },
        { field: "contraAccount", headerName: "Contra A/C",   width: 180 },
        { field: "contraGroup",   headerName: "Group",        width: 140, cellRenderer: ({ value }: any) => <GroupBadge value={value} /> },
        { field: "withdrawal",    headerName: "Withdrawal",   width: 130, ...moneyStyle(true) },
        { field: "deposit",       headerName: "Deposit",      width: 130, ...moneyStyle() },
        { field: "balance",       headerName: "Balance",      width: 140, type: "numericColumn", valueFormatter: ({ value }: any) => `₹${value.toLocaleString("en-IN")}`, cellStyle: { fontWeight: "600", color: "#1e293b" } },
      ];
      case "ledger-report": return [
        { field: "srNo",        headerName: "#",          width: 60 },
        { field: "date",        headerName: "Date",       width: 110 },
        { field: "source",      headerName: "Source",     width: 130, cellRenderer: ({ value }: any) => <GroupBadge value={value} /> },
        { field: "ref",         headerName: "Ref",        width: 150, cellStyle: { fontFamily: "monospace", fontSize: "12px", color: "#6366f1" } },
        { field: "particulars", headerName: "Particulars",flex: 1, minWidth: 200 },
        { field: "debit",       headerName: "Debit",      width: 130, ...moneyStyle() },
        { field: "credit",      headerName: "Credit",     width: 130, ...moneyStyle(true) },
        { field: "balance",     headerName: "Balance",    width: 140, type: "numericColumn", valueFormatter: ({ value }: any) => fmtSigned(value), cellStyle: ({ value }: any) => ({ fontWeight: "600", color: value >= 0 ? "#059669" : "#dc2626" }) },
      ];
      case "day-book": return [
        { field: "srNo",        headerName: "#",          width: 60 },
        { field: "date",        headerName: "Date",       width: 110 },
        { field: "source",      headerName: "Source",     width: 120, cellRenderer: ({ value }: any) => <GroupBadge value={value} /> },
        { field: "ref",         headerName: "Ref",        width: 150, cellStyle: { fontFamily: "monospace", fontSize: "12px", color: "#6366f1" } },
        { field: "particulars", headerName: "Particulars",flex: 1, minWidth: 200 },
        { field: "drAccount",   headerName: "Dr Account", width: 180 },
        { field: "drGroup",     headerName: "Dr Group",   width: 130, cellRenderer: ({ value }: any) => <GroupBadge value={value} /> },
        { field: "crAccount",   headerName: "Cr Account", width: 180 },
        { field: "crGroup",     headerName: "Cr Group",   width: 130, cellRenderer: ({ value }: any) => <GroupBadge value={value} /> },
        { field: "amount",      headerName: "Amount",     width: 130, ...moneyStyle(), cellStyle: { fontWeight: "600", color: "#1e293b" } },
      ];
      default: return [];
    }
  }, [activeReport]);

  const gridRowData = useMemo(() => {
    if (!reportData) return [];
    if (activeReport === "trial-balance") return reportData.rows ?? [];
    if (activeReport === "ledger-report") return reportData.rows ?? [];
    if (Array.isArray(reportData)) return reportData;
    return [];
  }, [reportData, activeReport]);

  const needsGrid     = !["balance-sheet","profit-loss"].includes(activeReport);
  const needsLedger   = activeReport === "ledger-report";
  const needsGroup    = activeReport === "day-book";
  const needsDate     = !["trial-balance","balance-sheet"].includes(activeReport);

  const activeReportMeta = REPORT_TYPES.find((r) => r.id === activeReport)!;
  const colors = COLOR_MAP[activeReportMeta.color];

  const filteredLedgers = useMemo(() =>
    ledgerNames.filter((n) => n.toLowerCase().includes(ledgerSearch.toLowerCase())),
    [ledgerNames, ledgerSearch],
  );

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left Sidebar: Report Selector ─────────────────────────────────── */}
      <aside className="w-[220px] flex-shrink-0 bg-white border-r border-slate-100 overflow-y-auto flex flex-col">
        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reports</p>
        </div>
        <nav className="flex-1 py-2 px-2 space-y-1">
          {REPORT_TYPES.map(({ id, label, icon: Icon, color, desc }) => {
            const isActive = activeReport === id;
            const c = COLOR_MAP[color];
            return (
              <button
                key={id}
                onClick={() => setActiveReport(id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${isActive ? c.active : "text-slate-600 hover:bg-slate-50"}`}
              >
                <Icon size={16} className={isActive ? "opacity-90" : c.icon} />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{label}</p>
                  <p className={`text-[10px] leading-tight mt-0.5 ${isActive ? "opacity-70" : "text-slate-400"}`}>{desc}</p>
                </div>
                {isActive && <ChevronRight size={14} className="ml-auto opacity-70 shrink-0" />}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Main Area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-4 lg:p-5 space-y-4">
          <FYBanner />

          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-slate-900">{activeReportMeta.label}</h1>
              <p className="text-sm text-slate-500 mt-0.5">{selectedFY?.label ?? "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={run} disabled={loading} className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> {loading ? "Running…" : "Run Report"}
              </button>
              <button className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                <Printer size={13} /> Print
              </button>
              <button
                onClick={() => gridRef.current?.api?.exportDataAsCsv({ fileName: `${activeReport}-report.csv` })}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
              >
                <Download size={13} /> Export CSV
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="flex flex-wrap items-end gap-4">
              {/* FY Selector */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">Financial Year</label>
                <select
                  value={activeFY?._id ?? ""}
                  onChange={(e) => handleFYChange(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  {allFYs.map((fy) => <option key={fy._id} value={fy._id}>{fy.label}</option>)}
                </select>
              </div>

              {/* Date Range */}
              {needsDate && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">From Date</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                      className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">To Date</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                      className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                </>
              )}

              {/* Ledger Selector */}
              {needsLedger && (
                <div className="flex flex-col gap-1 min-w-[200px]">
                  <label className="text-xs font-medium text-slate-500">Ledger</label>
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                      placeholder="Search ledger…"
                      className="text-sm border border-slate-200 rounded-lg pl-7 pr-2.5 py-1.5 text-slate-700 w-full focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <select
                    value={selectedLedger}
                    onChange={(e) => setSelectedLedger(e.target.value)}
                    size={4}
                    className="text-sm border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 max-h-24"
                  >
                    {filteredLedgers.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}

              {/* Group Filter */}
              {needsGroup && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Group</label>
                  <select
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    {ALL_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              )}

              <button onClick={run} disabled={loading}
                className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 font-medium self-end"
              >
                Apply
              </button>
            </div>

            {/* Ledger Report: opening + closing summary */}
            {activeReport === "ledger-report" && reportData && !loading && (
              <div className="mt-3 flex flex-wrap gap-3 pt-3 border-t border-slate-100">
                {[
                  { label: "Selected Ledger",   value: reportData.ledgerName,    color: "text-indigo-700"  },
                  { label: "Opening Balance",    value: fmtSigned(reportData.openingBalance), color: reportData.openingBalance >= 0 ? "text-emerald-700" : "text-red-600" },
                  { label: "Total Debit",        value: fmt(reportData.totalDebit),   color: "text-emerald-700" },
                  { label: "Total Credit",       value: fmt(reportData.totalCredit),  color: "text-red-600"     },
                  { label: "Closing Balance",    value: fmtSigned(reportData.closingBalance), color: reportData.closingBalance >= 0 ? "text-emerald-700" : "text-red-600" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className={`text-sm font-bold ${color} tabular-nums`}>{value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Trial Balance: balance status */}
            {activeReport === "trial-balance" && reportData && !loading && (() => {
              const totalDr = reportData.rows?.reduce((s: number, r: TrialRow) => s + r.closingDr, 0) ?? 0;
              const totalCr = reportData.rows?.reduce((s: number, r: TrialRow) => s + r.closingCr, 0) ?? 0;
              const diff = Math.abs(totalDr - totalCr);
              return (
                <div className="mt-3 flex flex-wrap gap-3 pt-3 border-t border-slate-100">
                  {[
                    { label: "Total Ledgers",    value: String(reportData.stats?.totalLedgers ?? 0), color: "text-indigo-700" },
                    { label: "Closing Debit",    value: fmt(totalDr), color: "text-emerald-700" },
                    { label: "Closing Credit",   value: fmt(totalCr), color: "text-red-600"     },
                    { label: "Difference",       value: diff < 1 ? "₹0  ✓" : `₹${diff.toLocaleString("en-IN")}`, color: diff < 1 ? "text-emerald-700" : "text-red-600" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className={`text-sm font-bold ${color} tabular-nums`}>{value}</p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Error */}
          {error && !loading && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertTriangle size={15} className="shrink-0" /> {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center h-48 text-slate-500 text-sm gap-2">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              Generating {activeReportMeta.label}…
            </div>
          )}

          {/* ── Report Output ───────────────────────────────────────────────── */}
          {!loading && !error && reportData && (
            <>
              {activeReport === "balance-sheet" && <BSReport data={reportData as BalanceSheetData} />}
              {activeReport === "profit-loss"   && <PLReport data={reportData as PLData} />}

              {needsGrid && gridRowData.length === 0 && (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm gap-2">
                  <Search size={28} className="opacity-30" />
                  No entries found for the selected period
                </div>
              )}

              {needsGrid && gridRowData.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">{activeReportMeta.label}</p>
                    <span className="text-xs text-slate-400">{gridRowData.length} records</span>
                  </div>
                  <div className="ag-theme-quartz" style={{ height: 480 }}>
                    <AgGridReact
                      ref={gridRef}
                      theme="legacy"
                      rowData={gridRowData}
                      columnDefs={colDefs}
                      defaultColDef={{ resizable: true, sortable: true, floatingFilter: false }}
                      animateRows
                      groupHeaderHeight={36}
                      headerHeight={40}
                      rowHeight={40}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
