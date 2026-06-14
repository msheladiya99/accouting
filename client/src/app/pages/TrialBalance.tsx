import { useState, useMemo, useEffect, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule, type ColDef, type ColGroupDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import {
  Download, Printer, Search, CheckCircle2, AlertTriangle,
  BookOpen, ArrowLeftRight, FileText, Layers, X, ExternalLink,
  TrendingUp, TrendingDown, Minus, ChevronRight,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { FYBanner } from "../components/FYBanner";
import { computeTrialBalance, TrialRow, TrialSummary } from "../api/trialBalanceApi";
import { getLedgerStatement, LedgerStatement, LedgerStatementRow } from "../api/ledgerApi";

ModuleRegistry.registerModules([AllCommunityModule]);

const GROUP_COLORS: Record<string, { bg: string; text: string }> = {
  Assets:          { bg: "bg-blue-50",    text: "text-blue-700"    },
  Bank:            { bg: "bg-sky-50",     text: "text-sky-700"     },
  Cash:            { bg: "bg-cyan-50",    text: "text-cyan-700"    },
  Liabilities:     { bg: "bg-red-50",     text: "text-red-700"     },
  Capital:         { bg: "bg-purple-50",  text: "text-purple-700"  },
  Income:          { bg: "bg-emerald-50", text: "text-emerald-700" },
  Expense:         { bg: "bg-orange-50",  text: "text-orange-700"  },
  Purchases:       { bg: "bg-amber-50",   text: "text-amber-700"   },
  Sales:           { bg: "bg-teal-50",    text: "text-teal-700"    },
  "Sundry Debtors":   { bg: "bg-violet-50", text: "text-violet-700" },
  "Sundry Creditors": { bg: "bg-pink-50",   text: "text-pink-700"   },
};

const fmt = (v: number) =>
  v > 0 ? `₹${v.toLocaleString("en-IN")}` : "—";

const fmtSigned = (v: number) => {
  if (v === 0) return "—";
  return `₹${Math.abs(v).toLocaleString("en-IN")} ${v >= 0 ? "Dr" : "Cr"}`;
};

const fmtDate = (d: string) => {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtMiracleSigned = (v: number) => {
  if (v === 0) return "NIL";
  return `₹${Math.abs(v).toLocaleString("en-IN")} ${v >= 0 ? "DB" : "CR"}`;
};

const fmtMiracleDate = (d: string) => {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  const dt = new Date(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
};

const GroupBadge = ({ value }: { value: string }) => {
  const c = GROUP_COLORS[value] ?? { bg: "bg-slate-100", text: "text-slate-600" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {value}
    </span>
  );
};

const VoucherBadge = ({ type }: { type: string }) => {
  const map: Record<string, string> = {
    "BPmt": "bg-sky-100 text-sky-700 font-mono",
    "BRct": "bg-emerald-100 text-emerald-700 font-mono",
    "JVou": "bg-violet-100 text-violet-700 font-mono",
    "CPmt": "bg-amber-100 text-amber-700 font-mono",
    "CRct": "bg-cyan-100 text-cyan-700 font-mono",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${map[type] ?? "bg-slate-100 text-slate-600"}`}>
      {type}
    </span>
  );
};

// Module-level cache
let cachedSummary: TrialSummary | null = null;
let cachedFYId: string | null = null;

// ── Ledger Statement Modal ─────────────────────────────────────────────────────
export function LedgerStatementModal({
  ledgerName,
  onClose,
}: {
  ledgerName: string;
  onClose: () => void;
}) {
  const { selectedFY, sidebarCollapsed } = useApp();
  const [statement, setStatement] = useState<LedgerStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLedgerStatement(ledgerName)
      .then((s) => { if (!cancelled) { setStatement(s); setLoading(false); } })
      .catch((e: any) => { if (!cancelled) { setError(e?.response?.data?.message || e?.message || "Failed to load"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ledgerName]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const filtered = useMemo<LedgerStatementRow[]>(() => {
    if (!statement) return [];
    const q = search.toLowerCase();
    if (!q) return statement.rows;
    return statement.rows.filter(
      (r) =>
        (r.accountName || "").toLowerCase().includes(q) ||
        (r.particulars || "").toLowerCase().includes(q) ||
        (r.voucherNo || "").toLowerCase().includes(q) ||
        (r.voucherType || "").toLowerCase().includes(q) ||
        (r.date || "").includes(q),
    );
  }, [statement, search]);

  const totalDebit  = useMemo(() => filtered.reduce((s, r) => s + r.debit,  0), [filtered]);
  const totalCredit = useMemo(() => filtered.reduce((s, r) => s + r.credit, 0), [filtered]);
  const c = GROUP_COLORS[statement?.groupName ?? ""] ?? { bg: "bg-slate-100", text: "text-slate-600" };

  return (
    /* Overlay */
    <div
      className={`fixed inset-y-0 right-0 z-50 flex items-stretch justify-end transition-all duration-300
        ${sidebarCollapsed ? "lg:left-[72px]" : "lg:left-[240px]"} left-0`}
      style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Sliding Panel - styled like Miracle 9.0 */}
      <div
        className="relative flex flex-col bg-[#eaf2f9] w-full h-full text-slate-800"
        style={{ animation: "slideInRight 0.22s ease-out" }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-3 p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors z-50 cursor-pointer"
          title="Close (ESC)"
        >
          <X size={18} />
        </button>

        {/* ── Path Breadcrumb ── */}
        <div className="max-w-7xl mx-auto w-full px-6 pt-3 text-[11px] font-semibold text-indigo-700 tracking-wide select-none">
          Report -{'>'} Account Books -{'>'} Ledger -{'>'} Ledger
        </div>

        {/* ── Header ── */}
        <div className="max-w-7xl mx-auto w-full px-6 py-2">
          <div className="flex items-baseline justify-between border-b border-slate-300 pb-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-none">
                Ledger <span className="uppercase">{ledgerName}</span>
              </h2>
              <div className="text-xs font-semibold text-slate-600 mt-2">
                Group <span className="text-slate-800">{statement?.groupName ?? "—"}</span>
              </div>
            </div>
            <div className="text-right text-xs font-semibold text-slate-600 select-none">
              <div>
                From <span className="text-slate-800">{selectedFY ? fmtMiracleDate(selectedFY.startDate) : "—"}</span> To <span className="text-slate-800">{selectedFY ? fmtMiracleDate(selectedFY.endDate) : "—"}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1 justify-end">
                <input type="checkbox" id="audit-chk" disabled className="rounded border-slate-300" />
                <label htmlFor="audit-chk" className="cursor-not-allowed select-none">Account Audit</label>
              </div>
            </div>
          </div>
        </div>

        {/* ── Search Bar ── */}
        <div className="max-w-7xl mx-auto w-full px-6 py-1.5">
          <div className="flex items-center gap-2 bg-white rounded border border-slate-300 px-2.5 py-1.5 max-w-xs shadow-sm">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search particulars, voucher..."
              className="bg-transparent text-xs outline-none text-slate-700 placeholder-slate-400 w-full"
            />
          </div>
        </div>

        {/* ── Table Container ── */}
        <div className="flex-1 overflow-auto py-2">
          <div className="max-w-7xl mx-auto w-full px-6 pb-6">
            {loading ? (
              <div className="flex items-center justify-center h-48 gap-2 text-slate-500 text-sm">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                Loading ledger statement…
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-48 gap-2 text-red-500 text-sm">
                <AlertTriangle size={16} /> {error}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400 text-sm">
                <FileText size={32} className="opacity-30" />
                {search ? "No entries match your search" : "No transactions found for this ledger in the current financial year"}
              </div>
            ) : (
              <table className="w-full text-xs font-mono border-collapse border border-slate-400" style={{ borderSpacing: 0 }}>
                <thead>
                  <tr className="sticky top-0 z-10">
                    {["Date", "Type", "Vou/Doc No.", "Account Name", "Debit", "Credit", "Closing Balance"].map((h, i) => (
                      <th
                        key={h}
                        className="bg-[#cfe3f5] text-slate-800 font-bold border border-slate-400 px-3 py-2 text-left whitespace-nowrap"
                        style={{ textAlign: i >= 4 ? "right" : "left" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {/* Opening balance row - represented as a standard table row */}
                  {statement && (
                    <tr className="bg-slate-50 hover:bg-slate-100/70 border-b border-slate-300">
                      <td className="px-3 py-2 border border-slate-300 text-slate-400">—</td>
                      <td className="px-3 py-2 border border-slate-300 text-slate-400">—</td>
                      <td className="px-3 py-2 border border-slate-300 text-slate-400">—</td>
                      <td className="px-3 py-2 border border-slate-300 text-slate-700 font-sans font-semibold">Opening Balance</td>
                      <td className="px-3 py-2 border border-slate-300 text-right font-medium text-emerald-700">
                        {statement.openingBalance > 0 ? statement.openingBalance.toFixed(2) : "NIL"}
                      </td>
                      <td className="px-3 py-2 border border-slate-300 text-right font-medium text-red-600">
                        {statement.openingBalance < 0 ? Math.abs(statement.openingBalance).toFixed(2) : "NIL"}
                      </td>
                      <td className="px-3 py-2 border border-slate-300 text-right font-semibold text-slate-800">
                        {fmtMiracleSigned(statement.openingBalance)}
                      </td>
                    </tr>
                  )}
                  {filtered.map((row) => (
                    <tr
                      key={row.srNo}
                      className="hover:bg-slate-50 transition-colors border-b border-slate-300"
                    >
                      <td className="px-3 py-2 border border-slate-300 text-slate-600 whitespace-nowrap">{fmtMiracleDate(row.date)}</td>
                      <td className="px-3 py-2 border border-slate-300 text-slate-700 font-sans font-semibold">{row.voucherType}</td>
                      <td className="px-3 py-2 border border-slate-300 text-slate-500 font-mono">
                        {row.voucherNo || "—"}
                      </td>
                      <td className="px-3 py-2 border border-slate-300 text-slate-800 font-sans max-w-[200px]">
                        <div className="font-semibold">{row.accountName || "—"}</div>
                        {row.particulars && row.particulars !== row.accountName && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5" title={row.particulars}>
                            {row.particulars}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 border border-slate-300 text-right text-emerald-700 font-medium">
                        {row.debit > 0 ? row.debit.toFixed(2) : "NIL"}
                      </td>
                      <td className="px-3 py-2 border border-slate-300 text-right text-red-600 font-medium">
                        {row.credit > 0 ? row.credit.toFixed(2) : "NIL"}
                      </td>
                      <td className="px-3 py-2 border border-slate-300 text-right font-semibold text-slate-800">
                        {fmtMiracleSigned(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals & Closing Balance footers styled exactly like Miracle */}
                <tfoot className="bg-[#e6f0fa]">
                  <tr className="font-bold border-t border-slate-400">
                    <td colSpan={3} className="px-3 py-2 border border-slate-300 text-slate-400">—</td>
                    <td className="px-3 py-2 border border-slate-300 text-right text-slate-800 uppercase font-sans">
                      Total
                    </td>
                    <td className="px-3 py-2 border border-slate-300 text-right text-emerald-700">
                      {totalDebit > 0 ? totalDebit.toFixed(2) : "NIL"}
                    </td>
                    <td className="px-3 py-2 border border-slate-300 text-right text-red-600">
                      {totalCredit > 0 ? totalCredit.toFixed(2) : "NIL"}
                    </td>
                    <td className="px-3 py-2 border border-slate-300 text-slate-400">—</td>
                  </tr>
                  <tr className="font-bold border-t border-slate-400">
                    <td colSpan={3} className="px-3 py-2 border border-slate-300 text-slate-400">—</td>
                    <td className="px-3 py-2 border border-slate-300 text-right text-slate-800 uppercase font-sans">
                      Closing Balance
                    </td>
                    <td className="px-3 py-2 border border-slate-300 text-slate-400">—</td>
                    <td className="px-3 py-2 border border-slate-300 text-slate-400">—</td>
                    <td className="px-3 py-2 border border-slate-300 text-right text-slate-800">
                      {statement ? fmtMiracleSigned(statement.closingBalance) : "NIL"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>

      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0.5; }
          to   { transform: translateX(0);    opacity: 1;   }
        }
      `}</style>
    </div>
  );
}

// ── Main Trial Balance Page ────────────────────────────────────────────────────
export default function TrialBalance() {
  const { selectedFY } = useApp();
  const financialYear = selectedFY?.label ?? "—";

  const [summary, setSummary] = useState<TrialSummary | null>(
    cachedFYId === selectedFY?._id ? cachedSummary : null
  );
  const [loading, setLoading]  = useState(
    cachedFYId === selectedFY?._id ? !cachedSummary : true
  );
  const [error, setError]      = useState<string | null>(null);
  const [search, setSearch]    = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("All");
  const [selectedLedger, setSelectedLedger] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false, silent = false) => {
    if (isRefresh) {
      setLoading(true);
    } else if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await computeTrialBalance();
      setSummary(result);
      cachedSummary = result;
      cachedFYId = selectedFY?._id || null;
    } catch (e: any) {
      if (!silent) {
        setError(e?.message ?? "Failed to compute trial balance");
      }
    } finally {
      setLoading(false);
    }
  }, [selectedFY?._id]);

  useEffect(() => {
    if (!selectedFY?._id) return;

    const hasCache = cachedFYId === selectedFY._id && cachedSummary !== null;
    if (hasCache) {
      setSummary(cachedSummary);
      setLoading(false);
    } else {
      setLoading(true);
    }

    load(false, hasCache);
  }, [load, selectedFY?._id]);

  const allGroups = useMemo(() => {
    if (!summary) return [];
    return ["All", ...Array.from(new Set(summary.rows.map((r) => r.group)))];
  }, [summary]);

  const filtered = useMemo<TrialRow[]>(() => {
    if (!summary) return [];
    return summary.rows.filter((r) => {
      const matchGroup = groupFilter === "All" || r.group === groupFilter;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        r.ledgerName.toLowerCase().includes(q) ||
        r.group.toLowerCase().includes(q);
      return matchGroup && matchSearch;
    });
  }, [summary, search, groupFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (s, r) => ({
        openDr:  s.openDr  + r.openingDr,
        openCr:  s.openCr  + r.openingCr,
        txnDr:   s.txnDr   + r.transactionDr,
        txnCr:   s.txnCr   + r.transactionCr,
        closeDr: s.closeDr + r.closingDr,
        closeCr: s.closeCr + r.closingCr,
      }),
      { openDr: 0, openCr: 0, txnDr: 0, txnCr: 0, closeDr: 0, closeCr: 0 },
    );
  }, [filtered]);

  const globalTotals = useMemo(() => {
    if (!summary) return { closeDr: 0, closeCr: 0 };
    return summary.rows.reduce(
      (s, r) => ({ closeDr: s.closeDr + r.closingDr, closeCr: s.closeCr + r.closingCr }),
      { closeDr: 0, closeCr: 0 },
    );
  }, [summary]);

  const difference = Math.abs(globalTotals.closeDr - globalTotals.closeCr);
  const isBalanced = difference < 0.01;

  const columnDefs = useMemo<(ColDef<TrialRow> | ColGroupDef<TrialRow>)[]>(() => [
    {
      field: "ledgerName" as keyof TrialRow,
      headerName: "Ledger Name",
      flex: 1,
      minWidth: 200,
      cellRenderer: (p: any) =>
        p.node.rowPinned ? (
          <span className="font-bold text-slate-700">TOTALS</span>
        ) : (
          <button
            onClick={() => setSelectedLedger(p.value)}
            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-medium group transition-colors text-left w-full"
            title="Click to open full ledger statement"
          >
            <span className="group-hover:underline">{p.value}</span>
            <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        ),
    },
    {
      field: "group" as keyof TrialRow,
      headerName: "Group",
      width: 150,
      cellRenderer: (p: any) =>
        p.node.rowPinned ? null : <GroupBadge value={p.value} />,
    },
    {
      headerName: "Opening Balance",
      children: [
        {
          field: "openingDr" as keyof TrialRow,
          headerName: "Debit",
          width: 130,
          type: "numericColumn",
          valueFormatter: (p: any) => fmt(p.value),
          cellStyle: (p: any) => ({
            color: p.value > 0 ? "#059669" : "#94a3b8",
            fontWeight: p.node.rowPinned ? "700" : "400",
          }),
        },
        {
          field: "openingCr" as keyof TrialRow,
          headerName: "Credit",
          width: 130,
          type: "numericColumn",
          valueFormatter: (p: any) => fmt(p.value),
          cellStyle: (p: any) => ({
            color: p.value > 0 ? "#dc2626" : "#94a3b8",
            fontWeight: p.node.rowPinned ? "700" : "400",
          }),
        },
      ],
    },
    {
      headerName: "Transactions",
      children: [
        {
          field: "transactionDr" as keyof TrialRow,
          headerName: "Debit",
          width: 130,
          type: "numericColumn",
          valueFormatter: (p: any) => fmt(p.value),
          cellStyle: (p: any) => ({
            color: p.value > 0 ? "#059669" : "#94a3b8",
            fontWeight: p.node.rowPinned ? "700" : "400",
          }),
        },
        {
          field: "transactionCr" as keyof TrialRow,
          headerName: "Credit",
          width: 130,
          type: "numericColumn",
          valueFormatter: (p: any) => fmt(p.value),
          cellStyle: (p: any) => ({
            color: p.value > 0 ? "#dc2626" : "#94a3b8",
            fontWeight: p.node.rowPinned ? "700" : "400",
          }),
        },
      ],
    },
    {
      headerName: "Closing Balance",
      children: [
        {
          field: "closingDr" as keyof TrialRow,
          headerName: "Debit",
          width: 140,
          type: "numericColumn",
          valueFormatter: (p: any) => fmt(p.value),
          cellStyle: (p: any) => ({
            color: p.value > 0 ? "#059669" : "#94a3b8",
            fontWeight: "600",
          }),
        },
        {
          field: "closingCr" as keyof TrialRow,
          headerName: "Credit",
          width: 140,
          type: "numericColumn",
          valueFormatter: (p: any) => fmt(p.value),
          cellStyle: (p: any) => ({
            color: p.value > 0 ? "#dc2626" : "#94a3b8",
            fontWeight: "600",
          }),
        },
      ],
    },
  ], []);

  const pinnedBottom = useMemo(() => [{
    ledgerName: "TOTALS",
    group: "",
    openingDr:     totals.openDr,
    openingCr:     totals.openCr,
    transactionDr: totals.txnDr,
    transactionCr: totals.txnCr,
    closingDr:     totals.closeDr,
    closingCr:     totals.closeCr,
  }], [totals]);

  const getRowStyle = useCallback((params: any) => {
    if (params.node.rowPinned) {
      return { background: "#f1f5f9", fontWeight: "700", borderTop: "2px solid #cbd5e1" };
    }
    return undefined;
  }, []);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <FYBanner />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Trial Balance</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {financialYear} · As of {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <Printer size={14} /> Print
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors">
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* Balance Banner */}
      {!loading && !error && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          isBalanced
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {isBalanced ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> : <AlertTriangle size={18} className="text-red-500 shrink-0" />}
          <span className="text-sm font-medium">
            {isBalanced
              ? "Trial Balance is Balanced — Total Debit = Total Credit"
              : `Out of Balance! Difference: ₹${difference.toLocaleString("en-IN")}`}
          </span>
        </div>
      )}

      {/* Summary Cards */}
      {!loading && !error && summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Debit",   value: `₹${globalTotals.closeDr.toLocaleString("en-IN")}`, color: "text-emerald-600", sub: "Closing balance" },
            { label: "Total Credit",  value: `₹${globalTotals.closeCr.toLocaleString("en-IN")}`, color: "text-red-500",     sub: "Closing balance" },
            { label: "Difference",    value: difference < 0.01 ? "₹0" : `₹${difference.toLocaleString("en-IN")}`, color: isBalanced ? "text-emerald-600" : "text-red-600", sub: isBalanced ? "Balanced ✓" : "Out of balance!" },
            { label: "Total Ledgers", value: String(summary.stats.totalLedgers), color: "text-indigo-600", sub: `${summary.stats.openingLedgers} opening` },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`text-base font-bold mt-1 ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Source Stats */}
      {!loading && !error && summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: BookOpen,       label: "Opening Ledgers",    value: summary.stats.openingLedgers,  color: "text-blue-600",    bg: "bg-blue-50"    },
            { icon: ArrowLeftRight, label: "Bank/Cash Entries",  value: summary.stats.bankCashEntries, color: "text-sky-600",     bg: "bg-sky-50"     },
            { icon: FileText,       label: "Journal Entries",    value: summary.stats.journalEntries,  color: "text-violet-600",  bg: "bg-violet-50"  },
            { icon: Layers,         label: "Ledgers in TB",      value: summary.stats.totalLedgers,    color: "text-indigo-600",  bg: "bg-indigo-50"  },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${bg}`}>
                <Icon size={16} className={color} />
              </div>
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`font-bold ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Click hint */}
      {!loading && !error && summary && (
        <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
          <ExternalLink size={13} />
          <span>Click any <strong>Ledger Name</strong> to open its full account statement with all transactions and running balance.</span>
        </div>
      )}

      {/* Search + Group Filter */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ledger or group..."
            className="bg-transparent text-sm outline-none text-slate-700 placeholder-slate-400 w-full"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allGroups.map((g) => (
            <button
              key={g}
              onClick={() => setGroupFilter(g)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                groupFilter === g
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-slate-500 text-sm gap-2">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            Computing trial balance…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64 text-red-500 text-sm gap-2">
            <AlertTriangle size={16} />
            {error}
          </div>
        ) : (
          <div className="ag-theme-quartz" style={{ height: 560 }}>
            <AgGridReact
              theme="legacy"
              rowData={filtered}
              columnDefs={columnDefs}
              defaultColDef={{ resizable: true, sortable: true, floatingFilter: false }}
              animateRows
              groupHeaderHeight={36}
              headerHeight={40}
              rowHeight={40}
              pinnedBottomRowData={pinnedBottom}
              getRowStyle={getRowStyle}
            />
          </div>
        )}
      </div>

      {/* Ledger Statement Modal */}
      {selectedLedger && (
        <LedgerStatementModal
          ledgerName={selectedLedger}
          onClose={() => setSelectedLedger(null)}
        />
      )}
    </div>
  );
}
