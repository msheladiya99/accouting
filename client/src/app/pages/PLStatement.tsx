import { useState, useEffect, useCallback, useMemo } from "react";
import {
  TrendingUp, TrendingDown, RefreshCw, Download, Printer,
  ChevronDown, ChevronRight, CheckCircle2, AlertTriangle,
  ArrowLeftRight, FileText, Calendar, Banknote,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { FYBanner } from "../components/FYBanner";
import { computePL, buildPresets, PLData, PLSection, DatePreset } from "../api/plStatementApi";
import type { FinancialYear } from "../api/financialYearApi";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  `₹${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;

const fmtSigned = (v: number) =>
  `${v < 0 ? "(" : ""}${fmt(v)}${v < 0 ? ")" : ""}`;

// ── Expandable section block ──────────────────────────────────────────────────
function SectionBlock({
  title,
  subtitle,
  section,
  headerColor,
  amountColor,
  totalLabel,
  defaultOpen = true,
}: {
  title: string;
  subtitle: string;
  section: PLSection;
  headerColor: string;
  amountColor: string;
  totalLabel?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-5 py-3.5 ${headerColor} text-white hover:opacity-95 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={15} className="opacity-80" /> : <ChevronRight size={15} className="opacity-80" />}
          <div className="text-left">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs opacity-70">{subtitle}</p>
          </div>
        </div>
        <span className="text-base font-bold tabular-nums">{fmt(section.total)}</span>
      </button>

      {open && (
        <div className="bg-white">
          {section.entries.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-400 italic">No entries in this period</p>
          ) : (
            section.entries.map((entry) => (
              <div
                key={entry.ledgerName}
                className="flex items-center justify-between px-5 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="w-3 h-px bg-slate-200 inline-block" />
                  <span className="text-sm text-slate-700">{entry.ledgerName}</span>
                </div>
                <span className={`text-sm font-medium tabular-nums ${entry.amount < 0 ? "text-red-500" : amountColor}`}>
                  {entry.amount < 0 ? `(${fmt(entry.amount)})` : fmt(entry.amount)}
                </span>
              </div>
            ))
          )}
          {/* Section total */}
          <div className="flex items-center justify-between px-5 py-2.5 bg-slate-50 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {totalLabel ?? `Total ${title}`}
            </span>
            <span className={`text-sm font-bold tabular-nums ${amountColor}`}>{fmt(section.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Profit / GP line ──────────────────────────────────────────────────────────
function ProfitLine({
  label,
  amount,
  isProfit,
  size = "normal",
}: {
  label: string;
  amount: number;
  isProfit: boolean;
  size?: "normal" | "large";
}) {
  const bg    = isProfit ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200";
  const color = isProfit ? "text-emerald-700" : "text-red-600";
  const badge = isProfit ? "bg-emerald-600 text-white" : "bg-red-600 text-white";

  return (
    <div className={`flex items-center justify-between px-5 py-3.5 rounded-xl border-2 ${bg}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge}`}>
          {isProfit ? "▲" : "▼"}
        </span>
        <span className={`font-bold ${size === "large" ? "text-base" : "text-sm"} ${color}`}>
          {label}
        </span>
      </div>
      <span className={`font-bold tabular-nums ${size === "large" ? "text-lg" : "text-sm"} ${color}`}>
        {fmtSigned(amount)}
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PLStatement() {
  const { selectedFY, setSelectedFY, availableFYs } = useApp();

  const [activeFY, setActiveFY]   = useState<FinancialYear | undefined>(undefined);
  const [presets, setPresets]     = useState<DatePreset[]>([]);
  const [activePreset, setActivePreset] = useState<string>("This Month");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");
  const [isCustom, setIsCustom]   = useState(false);

  const [data, setData]           = useState<PLData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Synchronize activeFY with global selectedFY
  useEffect(() => {
    if (selectedFY) {
      setActiveFY(selectedFY);
    }
  }, [selectedFY]);

  // Build presets whenever FY changes
  useEffect(() => {
    const ps = buildPresets(activeFY);
    setPresets(ps);
    // Default to FY preset if available, else "This Month"
    const fyPreset = ps.find((p) => p.label === activeFY?.label);
    const chosen   = fyPreset ?? ps[0];
    if (chosen) {
      setActivePreset(chosen.label);
      setDateFrom(chosen.from);
      setDateTo(chosen.to);
    }
    setIsCustom(false);
  }, [activeFY]);

  const applyPreset = (preset: DatePreset) => {
    setActivePreset(preset.label);
    setDateFrom(preset.from);
    setDateTo(preset.to);
    setIsCustom(preset.label === "Custom");
  };

  const handleFYChange = (id: string) => {
    const fy = availableFYs.find((f) => f._id === id);
    if (fy) {
      setSelectedFY(fy);
    }
  };

  const load = useCallback(
    async (isRefresh = false) => {
      if (!dateFrom || !dateTo) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await computePL(dateFrom, dateTo);
        setData(result);
      } catch (e: any) {
        setError(e?.message ?? "Computation failed");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateFrom, dateTo],
  );

  useEffect(() => {
    if (dateFrom && dateTo) load();
  }, [load]);

  const periodLabel = useMemo(() => {
    if (!dateFrom || !dateTo) return "";
    const f = new Date(dateFrom).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const t = new Date(dateTo  ).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    return `${f} — ${t}`;
  }, [dateFrom, dateTo]);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <FYBanner />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Profit & Loss Statement</h1>
          <p className="text-sm text-slate-500 mt-0.5">{periodLabel || "Select a period"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <Printer size={14} /> Print
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 space-y-4">
        {/* Row 1: FY selector + quick presets */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Financial Year dropdown */}
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-slate-400 shrink-0" />
            <label className="text-xs font-medium text-slate-500 whitespace-nowrap">Financial Year</label>
            <select
              value={activeFY?._id ?? ""}
              onChange={(e) => handleFYChange(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {availableFYs.map((fy) => (
                <option key={fy._id} value={fy._id}>{fy.label}</option>
              ))}
            </select>
          </div>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          {/* Period presets */}
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activePreset === p.label && !isCustom
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Custom date range (always visible for fine-tuning) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500 whitespace-nowrap">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setIsCustom(true); setActivePreset("Custom"); }}
              className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500 whitespace-nowrap">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setIsCustom(true); setActivePreset("Custom"); }}
              className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <button
            onClick={() => load()}
            disabled={loading || !dateFrom || !dateTo}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 font-medium"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-56 text-slate-500 text-sm gap-2">
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          Computing Profit & Loss…
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Profit / Loss banner */}
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border ${
            data.isProfit
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}>
            {data.isProfit
              ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              : <AlertTriangle size={18} className="text-red-500 shrink-0" />}
            <span className="text-sm font-medium flex-1">
              {data.isProfit
                ? `Net Profit of ${fmt(data.netProfit)} for the period ${periodLabel}`
                : `Net Loss of ${fmt(data.netProfit)} for the period ${periodLabel}`}
            </span>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Revenue",    value: data.totalIncome,   color: "text-emerald-700", bg: "bg-emerald-50", icon: TrendingUp   },
              { label: "Total Expenses",   value: data.totalExpenses, color: "text-red-600",     bg: "bg-red-50",     icon: TrendingDown },
              { label: "Gross Profit",     value: data.grossProfit,   color: data.grossProfit  >= 0 ? "text-emerald-700" : "text-red-600", bg: data.grossProfit  >= 0 ? "bg-emerald-50" : "bg-red-50",  icon: Banknote  },
              { label: "Net Profit / Loss",value: data.netProfit,     color: data.isProfit      ? "text-emerald-700" : "text-red-600",     bg: data.isProfit     ? "bg-emerald-50" : "bg-red-50",        icon: data.isProfit ? TrendingUp : TrendingDown },
            ].map(({ label, value, color, bg, icon: Icon }) => (
              <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
                <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center shrink-0`}>
                  <Icon size={16} className={color} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className={`font-bold tabular-nums ${color}`}>{fmtSigned(value)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Source stats */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: ArrowLeftRight, label: "Bank/Cash Transactions", value: data.bankCashTxns, color: "text-sky-600",    bg: "bg-sky-50"    },
              { icon: FileText,       label: "Journal Entries",         value: data.journalTxns,  color: "text-violet-600", bg: "bg-violet-50" },
            ].map(({ icon: Icon, label, value, color, bg }) => (
              <div key={label} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${bg} shrink-0`}><Icon size={15} className={color} /></div>
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className={`font-bold ${color}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── P&L Statement body ── */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Statement header */}
            <div className="bg-slate-800 text-white px-5 py-4 text-center">
              <p className="text-xs text-slate-400 uppercase tracking-widest">Profit & Loss Statement</p>
              <p className="text-sm font-semibold mt-0.5">{periodLabel}</p>
            </div>

            <div className="p-5 space-y-3">

              {/* ── INCOME ── */}
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Income</p>

              <SectionBlock
                title="Sales Revenue"
                subtitle="Direct sales income"
                section={data.sales}
                headerColor="bg-emerald-600"
                amountColor="text-emerald-700"
                totalLabel="Total Sales"
              />

              <SectionBlock
                title="Other Income"
                subtitle="Interest, consulting & misc income"
                section={data.otherIncome}
                headerColor="bg-teal-600"
                amountColor="text-teal-700"
                totalLabel="Total Other Income"
              />

              {/* Total Revenue line */}
              <div className="flex items-center justify-between px-5 py-3 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
                <span className="text-sm font-bold text-emerald-800">Total Revenue (A)</span>
                <span className="font-bold text-emerald-700 tabular-nums">{fmt(data.totalIncome)}</span>
              </div>

              <div className="border-t border-dashed border-slate-200 pt-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1 mb-3">Expenses</p>

                <SectionBlock
                  title="Direct Expenses"
                  subtitle="Cost of goods sold · raw material purchases"
                  section={data.directExpenses}
                  headerColor="bg-amber-600"
                  amountColor="text-amber-700"
                  totalLabel="Total Direct Expenses"
                />
              </div>

              {/* Gross Profit line */}
              <ProfitLine
                label="Gross Profit  (Sales − Direct Expenses)"
                amount={data.grossProfit}
                isProfit={data.grossProfit >= 0}
              />

              <SectionBlock
                title="Indirect Expenses"
                subtitle="Salaries, rent, marketing, utilities & admin"
                section={data.indirectExpenses}
                headerColor="bg-red-600"
                amountColor="text-red-600"
                totalLabel="Total Indirect Expenses"
              />

              {/* Total Expenses line */}
              <div className="flex items-center justify-between px-5 py-3 bg-red-50 border-2 border-red-200 rounded-xl">
                <span className="text-sm font-bold text-red-800">Total Expenses (B)</span>
                <span className="font-bold text-red-700 tabular-nums">{fmt(data.totalExpenses)}</span>
              </div>

              {/* Net Profit / Loss */}
              <ProfitLine
                label={data.isProfit ? "Net Profit  (A − B + Other Income)" : "Net Loss  (A − B + Other Income)"}
                amount={data.netProfit}
                isProfit={data.isProfit}
                size="large"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
