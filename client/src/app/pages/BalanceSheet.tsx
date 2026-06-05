import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown, ChevronRight, Download, Printer, TrendingUp,
  TrendingDown, Scale, RefreshCw, CheckCircle2, AlertTriangle,
  BookOpen, ArrowLeftRight, FileText,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { FYBanner } from "../components/FYBanner";
import { computeBalanceSheet, BalanceSheetData, BSGroup, BSLedger } from "../api/balanceSheetApi";

const fmt = (v: number) =>
  `₹${Math.abs(v).toLocaleString("en-IN")}`;

// ── Group colors ──────────────────────────────────────────────────────────────
const ASSET_GROUP_COLORS: Record<string, { header: string; badge: string; ledger: string }> = {
  "Fixed & Other Assets": { header: "bg-blue-600",    badge: "bg-blue-100 text-blue-700",    ledger: "text-blue-700"   },
  "Bank Accounts":        { header: "bg-sky-600",     badge: "bg-sky-100 text-sky-700",      ledger: "text-sky-700"    },
  "Cash & Petty Cash":    { header: "bg-cyan-600",    badge: "bg-cyan-100 text-cyan-700",    ledger: "text-cyan-700"   },
  "Sundry Debtors":       { header: "bg-violet-600",  badge: "bg-violet-100 text-violet-700",ledger: "text-violet-700" },
};

const LIAB_GROUP_COLORS: Record<string, { header: string; badge: string; ledger: string }> = {
  "Capital & Reserves": { header: "bg-purple-600",  badge: "bg-purple-100 text-purple-700", ledger: "text-purple-700" },
  "Liabilities":        { header: "bg-red-600",     badge: "bg-red-100 text-red-700",       ledger: "text-red-700"    },
  "Sundry Creditors":   { header: "bg-pink-600",    badge: "bg-pink-100 text-pink-700",     ledger: "text-pink-700"   },
};

const DEFAULT_COLOR = { header: "bg-slate-600", badge: "bg-slate-100 text-slate-700", ledger: "text-slate-700" };

// ── Ledger row ────────────────────────────────────────────────────────────────
function LedgerRow({ ledger, colorClass }: { ledger: BSLedger; colorClass: string }) {
  const isNegative = ledger.amount < 0;
  return (
    <div className="flex items-center justify-between py-2 px-4 pl-12 hover:bg-slate-50/70 transition-colors border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-2">
        <span className="w-3 h-px bg-slate-200 inline-block" />
        <span className="text-sm text-slate-600">{ledger.ledgerName}</span>
        {isNegative && (
          <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-500 rounded">Loss</span>
        )}
      </div>
      <span className={`text-sm tabular-nums font-medium ${isNegative ? "text-red-500" : colorClass}`}>
        {isNegative ? `(${fmt(ledger.amount)})` : fmt(ledger.amount)}
      </span>
    </div>
  );
}

// ── Group block (expand/collapse) ─────────────────────────────────────────────
function GroupBlock({
  group,
  colors,
  defaultOpen = true,
}: {
  group: BSGroup;
  colors: { header: string; badge: string; ledger: string };
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden mb-3">
      {/* Group header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 ${colors.header} text-white hover:opacity-95 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          {open
            ? <ChevronDown size={15} className="opacity-80" />
            : <ChevronRight size={15} className="opacity-80" />}
          <span className="text-sm font-semibold">{group.groupName}</span>
          <span className="text-xs px-2 py-0.5 bg-white/20 rounded-full">
            {group.ledgers.length} {group.ledgers.length === 1 ? "ledger" : "ledgers"}
          </span>
        </div>
        <span className="text-sm font-bold tabular-nums">{fmt(group.total)}</span>
      </button>

      {/* Ledger rows */}
      {open && (
        <div className="bg-white divide-y divide-slate-50">
          {group.ledgers.map((l) => (
            <LedgerRow key={l.ledgerName} ledger={l} colorClass={colors.ledger} />
          ))}
          {/* Group subtotal */}
          <div className={`flex items-center justify-between px-4 py-2.5 ${colors.badge}`}>
            <span className="text-xs font-semibold uppercase tracking-wide">
              Total {group.groupName}
            </span>
            <span className="text-sm font-bold tabular-nums">{fmt(group.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function BalanceSheet() {
  const { selectedFY } = useApp();
  const financialYear = selectedFY?.label ?? "—";

  const [data, setData]       = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await computeBalanceSheet();
      setData(result);
    } catch (e: any) {
      setError(e?.message ?? "Failed to compute balance sheet");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedFY?._id]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });

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
            {refreshing ? "Refreshing…" : "Refresh"}
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
          Computing balance sheet from all sources…
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
                  : `Out of Balance! Difference: ₹${data.difference.toLocaleString("en-IN")}`}
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

          {/* Two-column Balance Sheet */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* ── LEFT: Assets ─────────────────────────────────────────────── */}
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Assets</h2>
                  <p className="text-xs text-slate-500">What the company owns</p>
                </div>
                <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
                  {data.assetsSection.groups.length} groups
                </span>
              </div>

              {data.assetsSection.groups.map((group) => (
                <GroupBlock
                  key={group.groupKey}
                  group={group}
                  colors={ASSET_GROUP_COLORS[group.groupName] ?? DEFAULT_COLOR}
                  defaultOpen
                />
              ))}

              {/* Assets total footer */}
              <div className="flex items-center justify-between py-3.5 px-4 bg-blue-600 text-white rounded-xl mt-2">
                <span className="text-sm font-bold uppercase tracking-wide">Total Assets</span>
                <span className="font-bold tabular-nums">{fmt(data.totalAssets)}</span>
              </div>
            </div>

            {/* ── RIGHT: Liabilities + Capital ─────────────────────────────── */}
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Liabilities & Capital</h2>
                  <p className="text-xs text-slate-500">What the company owes + net worth</p>
                </div>
                <span className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                  {data.liabCapSection.groups.length} groups
                </span>
              </div>

              {data.liabCapSection.groups.map((group) => (
                <GroupBlock
                  key={group.groupKey}
                  group={group}
                  colors={LIAB_GROUP_COLORS[group.groupName] ?? DEFAULT_COLOR}
                  defaultOpen
                />
              ))}

              {/* Liabilities + Capital total footer */}
              <div className="flex items-center justify-between py-3.5 px-4 bg-indigo-600 text-white rounded-xl mt-2">
                <span className="text-sm font-bold uppercase tracking-wide">Total Liabilities + Capital</span>
                <span className="font-bold tabular-nums">{fmt(data.totalLiabCap)}</span>
              </div>
            </div>
          </div>

          {/* Balance equation footer */}
          <div className={`flex flex-wrap items-center justify-center gap-4 py-4 px-6 rounded-xl border-2 ${
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
        </>
      )}
    </div>
  );
}
