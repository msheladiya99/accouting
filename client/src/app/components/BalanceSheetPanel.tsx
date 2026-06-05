import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown, ChevronRight, ChevronLeft, RefreshCw,
  TrendingUp, TrendingDown, Scale, CheckCircle2, AlertTriangle,
} from "lucide-react";
import {
  computeBalanceSheet,
  type BalanceSheetData, type BSGroup, type BSLedger,
} from "../api/balanceSheetApi";

// ── Same color maps as BalanceSheet.tsx ───────────────────────────────────────
const ASSET_COLORS: Record<string, { header: string; badge: string; ledger: string }> = {
  "Fixed & Other Assets": { header: "bg-blue-600",   badge: "bg-blue-100 text-blue-700",    ledger: "text-blue-700"   },
  "Bank Accounts":        { header: "bg-sky-600",    badge: "bg-sky-100 text-sky-700",      ledger: "text-sky-700"    },
  "Cash & Petty Cash":    { header: "bg-cyan-600",   badge: "bg-cyan-100 text-cyan-700",    ledger: "text-cyan-700"   },
  "Sundry Debtors":       { header: "bg-violet-600", badge: "bg-violet-100 text-violet-700",ledger: "text-violet-700" },
};
const LIAB_COLORS: Record<string, { header: string; badge: string; ledger: string }> = {
  "Capital & Reserves": { header: "bg-purple-600", badge: "bg-purple-100 text-purple-700", ledger: "text-purple-700" },
  "Liabilities":        { header: "bg-red-600",    badge: "bg-red-100 text-red-700",       ledger: "text-red-700"    },
  "Sundry Creditors":   { header: "bg-pink-600",   badge: "bg-pink-100 text-pink-700",     ledger: "text-pink-700"   },
};
const DEFAULT_COLOR = { header: "bg-slate-500", badge: "bg-slate-100 text-slate-700", ledger: "text-slate-700" };

const fmt = (v: number) =>
  `₹${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Compact ledger row ────────────────────────────────────────────────────────
function LedgerRow({ ledger, colorClass }: { ledger: BSLedger; colorClass: string }) {
  const neg = ledger.amount < 0;
  return (
    <div className="flex items-center justify-between py-1.5 px-3 pl-6 border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-2 h-px bg-slate-300 flex-shrink-0" />
        <span className="text-[11px] text-slate-600 truncate">{ledger.ledgerName}</span>
        {neg && <span className="text-[9px] px-1 bg-red-50 text-red-400 rounded flex-shrink-0">Cr</span>}
      </div>
      <span className={`text-[11px] font-mono font-medium flex-shrink-0 ml-2 ${neg ? "text-red-500" : colorClass}`}>
        {neg ? `(${fmt(ledger.amount)})` : fmt(ledger.amount)}
      </span>
    </div>
  );
}

// ── Compact group block — same style as BalanceSheet.tsx ─────────────────────
function GroupBlock({ group, colors }: {
  group: BSGroup;
  colors: { header: string; badge: string; ledger: string };
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 ${colors.header} text-white hover:opacity-95 transition-opacity`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {open
            ? <ChevronDown size={11} className="opacity-80 flex-shrink-0" />
            : <ChevronRight size={11} className="opacity-80 flex-shrink-0" />}
          <span className="text-[11px] font-semibold truncate">{group.groupName}</span>
          <span className="text-[9px] px-1.5 py-0.5 bg-white/20 rounded-full flex-shrink-0">
            {group.ledgers.length}
          </span>
        </div>
        <span className="text-[11px] font-bold font-mono flex-shrink-0 ml-2">{fmt(group.total)}</span>
      </button>
      {open && (
        <div className="bg-white divide-y divide-slate-50">
          {group.ledgers.map((l) => (
            <LedgerRow key={l.ledgerName} ledger={l} colorClass={colors.ledger} />
          ))}
          <div className={`flex items-center justify-between px-3 py-1.5 ${colors.badge}`}>
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              Total {group.groupName}
            </span>
            <span className="text-[11px] font-bold font-mono">{fmt(group.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export function BalanceSheetPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [data,    setData]    = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await computeBalanceSheet()); }
    catch (e: any) { setError(e?.message ?? "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open && !data) load(); }, [open, data, load]);

  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <aside
      style={{ transition: "width 0.3s ease" }}
      className={`flex-shrink-0 flex flex-col h-full bg-white border-l border-slate-200 shadow-md relative ${open ? "w-[290px]" : "w-[28px]"}`}
    >
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
          <div className="flex items-center justify-between px-3 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
            <div>
              <p className="text-[12px] font-bold text-slate-800 leading-tight">Balance Sheet</p>
              <p className="text-[10px] text-slate-500 leading-tight">As at {today}</p>
            </div>
            <button
              onClick={load}
              disabled={loading}
              title="Refresh"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* ── States ───────────────────────────────────────────────────── */}
          {loading && !data && (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <div className="flex flex-col items-center gap-2">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px]">Computing…</span>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="m-3 flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              <AlertTriangle size={13} className="flex-shrink-0" />
              <p className="text-[10px]">{error}</p>
              <button onClick={load} className="text-[10px] underline ml-auto">Retry</button>
            </div>
          )}

          {!loading && !error && data && (
            <div className="flex-1 overflow-y-auto">

              {/* Balance status banner */}
              <div className={`mx-2.5 mt-2.5 mb-2 flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[10px] font-medium ${
                data.isBalanced
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}>
                {data.isBalanced
                  ? <CheckCircle2 size={12} className="text-emerald-600 flex-shrink-0" />
                  : <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
                <span>
                  {data.isBalanced
                    ? "Balanced — Assets = Liabilities + Capital"
                    : `Out of Balance! Diff: ${fmt(data.difference)}`}
                </span>
              </div>

              {/* Summary mini-cards */}
              <div className="px-2.5 grid grid-cols-3 gap-1.5 mb-3">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-center">
                  <TrendingUp size={12} className="text-blue-600 mx-auto mb-0.5" />
                  <p className="text-[8px] text-slate-500 leading-tight">Assets</p>
                  <p className="text-[10px] font-bold text-blue-700 font-mono leading-tight">{fmt(data.totalAssets)}</p>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2 text-center">
                  <TrendingDown size={12} className="text-indigo-500 mx-auto mb-0.5" />
                  <p className="text-[8px] text-slate-500 leading-tight">Liab+Cap</p>
                  <p className="text-[10px] font-bold text-indigo-700 font-mono leading-tight">{fmt(data.totalLiabCap)}</p>
                </div>
                <div className={`border rounded-lg p-2 text-center ${data.netProfit >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                  <Scale size={12} className={`mx-auto mb-0.5 ${data.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`} />
                  <p className="text-[8px] text-slate-500 leading-tight">Net {data.netProfit >= 0 ? "Profit" : "Loss"}</p>
                  <p className={`text-[10px] font-bold font-mono leading-tight ${data.netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {data.netProfit >= 0 ? "+" : "-"}{fmt(data.netProfit)}
                  </p>
                </div>
              </div>

              {/* ── ASSETS section ───────────────────────────────────────── */}
              <div className="px-2.5 mb-1">
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <p className="text-[11px] font-bold text-slate-800">Assets</p>
                    <p className="text-[9px] text-slate-400">What the company owns</p>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">
                    {data.assetsSection.groups.length} groups
                  </span>
                </div>
                {data.assetsSection.groups.map((g) => (
                  <GroupBlock key={g.groupKey} group={g} colors={ASSET_COLORS[g.groupName] ?? DEFAULT_COLOR} />
                ))}
                {/* Assets total footer */}
                <div className="flex items-center justify-between py-2 px-3 bg-blue-600 text-white rounded-lg mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide">Total Assets</span>
                  <span className="text-[11px] font-bold font-mono">{fmt(data.totalAssets)}</span>
                </div>
              </div>

              {/* Divider */}
              <div className="mx-2.5 my-2 border-t-2 border-dashed border-slate-200" />

              {/* ── LIABILITIES & CAPITAL section ──────────────────────── */}
              <div className="px-2.5 mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <p className="text-[11px] font-bold text-slate-800">Liabilities &amp; Capital</p>
                    <p className="text-[9px] text-slate-400">What the company owes + net worth</p>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                    {data.liabCapSection.groups.length} groups
                  </span>
                </div>
                {data.liabCapSection.groups.map((g) => (
                  <GroupBlock key={g.groupKey} group={g} colors={LIAB_COLORS[g.groupName] ?? DEFAULT_COLOR} />
                ))}
                {/* Liabilities total footer */}
                <div className="flex items-center justify-between py-2 px-3 bg-indigo-600 text-white rounded-lg mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide">Total Liab + Capital</span>
                  <span className="text-[11px] font-bold font-mono">{fmt(data.totalLiabCap)}</span>
                </div>
              </div>

              {/* Balance equation footer */}
              <div className={`mx-2.5 mb-4 py-2.5 px-3 rounded-lg border-2 flex flex-col items-center gap-1 ${
                data.isBalanced ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"
              }`}>
                <div className="flex items-center gap-2 w-full justify-between">
                  <div className="text-center">
                    <p className="text-[8px] text-slate-500 uppercase tracking-wide">Assets</p>
                    <p className="text-[10px] font-bold text-blue-700 font-mono">{fmt(data.totalAssets)}</p>
                  </div>
                  <span className={`text-sm font-bold ${data.isBalanced ? "text-emerald-600" : "text-red-500"}`}>=</span>
                  <div className="text-center">
                    <p className="text-[8px] text-slate-500 uppercase tracking-wide">Liab + Cap</p>
                    <p className="text-[10px] font-bold text-indigo-700 font-mono">{fmt(data.totalLiabCap)}</p>
                  </div>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${
                  data.isBalanced ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                }`}>
                  {data.isBalanced ? "Balanced ✓" : "Out of Balance ✗"}
                </span>
              </div>

            </div>
          )}
        </div>
      )}
    </aside>
  );
}
