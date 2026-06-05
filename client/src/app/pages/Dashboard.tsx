import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Banknote, Landmark, RefreshCw,
  ArrowUpRight, ArrowDownRight, FileText, ArrowRight,
} from "lucide-react";
import { NavLink } from "react-router";
import { useApp } from "../context/AppContext";
import { FYBanner } from "../components/FYBanner";
import { getDashboardData, DashboardData } from "../api/dashboardApi";

const fmt = (v: number) =>
  `₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const fmtK = (v: number) => {
  const a = Math.abs(v);
  return a >= 100000 ? `₹${(a / 100000).toFixed(1)}L` : a >= 1000 ? `₹${(a / 1000).toFixed(0)}K` : `₹${a}`;
};

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-lg text-xs space-y-1 min-w-[140px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5" style={{ color: p.color }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold text-slate-800">{fmtK(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, iconBg, iconColor, trend,
}: {
  label: string; value: string; sub?: string;
  icon: any; iconBg: string; iconColor: string;
  trend?: { value: string; up: boolean };
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon size={20} className={iconColor} />
        </div>
        {trend && (
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${trend.up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            {trend.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {trend.value}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-4 tabular-nums">{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, sub, to }: { title: string; sub: string; to: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-slate-800">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </div>
      <NavLink to={to} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
        View all <ArrowRight size={12} />
      </NavLink>
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const map: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    red:     "bg-red-50 text-red-600",
    amber:   "bg-amber-50 text-amber-700",
    slate:   "bg-slate-100 text-slate-600",
    violet:  "bg-violet-50 text-violet-700",
    sky:     "bg-sky-50 text-sky-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[color] ?? map.slate}`}>
      {children}
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { selectedFY } = useApp();
  const [data, setData]         = useState<DashboardData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try { setData(await getDashboardData()); }
    catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [selectedFY?._id]);

  useEffect(() => { load(); }, [load]);

  const fy = selectedFY?.label ?? "—";
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-500 text-sm gap-2">
      <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      Loading dashboard…
    </div>
  );

  const { summary, monthly, recentTransactions, recentJournals } = data!;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <FYBanner />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">{fy} · {today}</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700 transition-colors disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* ── Summary cards (5) ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          label="Total Income"
          value={fmtK(summary.totalIncome)}
          sub={fmt(summary.totalIncome)}
          icon={TrendingUp}
          iconBg="bg-emerald-50" iconColor="text-emerald-600"
          trend={{ value: "Sales + Income", up: true }}
        />
        <StatCard
          label="Total Expense"
          value={fmtK(summary.totalExpense)}
          sub={fmt(summary.totalExpense)}
          icon={TrendingDown}
          iconBg="bg-red-50" iconColor="text-red-500"
          trend={{ value: "All costs", up: false }}
        />
        <StatCard
          label="Cash Balance"
          value={fmtK(summary.cashBalance)}
          sub="Cash in Hand + Petty Cash"
          icon={Banknote}
          iconBg="bg-amber-50" iconColor="text-amber-600"
        />
        <StatCard
          label="Bank Balance"
          value={fmtK(summary.bankBalance)}
          sub="HDFC + SBI combined"
          icon={Landmark}
          iconBg="bg-sky-50" iconColor="text-sky-600"
        />
        <StatCard
          label="Net Profit"
          value={fmtK(summary.netProfit)}
          sub={fmt(summary.netProfit)}
          icon={summary.netProfit >= 0 ? TrendingUp : TrendingDown}
          iconBg={summary.netProfit >= 0 ? "bg-indigo-50" : "bg-red-50"}
          iconColor={summary.netProfit >= 0 ? "text-indigo-600" : "text-red-600"}
          trend={{ value: summary.netProfit >= 0 ? "Profit" : "Loss", up: summary.netProfit >= 0 }}
        />
      </div>

      {/* ── Charts row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Monthly Income & Expense — Area Chart */}
        <div className="xl:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-slate-800">Monthly Income & Expenses</h3>
              <p className="text-xs text-slate-500 mt-0.5">Last 6 months · {fy}</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />Income</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Expense</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={monthly} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient key="dash-gIncome" id="dash-gIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient key="dash-gExpense" id="dash-gExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f87171" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="income"  name="Income"  stroke="#6366f1" strokeWidth={2.5} fill="url(#dash-gIncome)"  dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="expense" name="Expense" stroke="#f87171" strokeWidth={2.5} fill="url(#dash-gExpense)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Cash Flow — Bar Chart */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="mb-5">
            <h3 className="text-slate-800">Cash Flow</h3>
            <p className="text-xs text-slate-500 mt-0.5">Net monthly (Income − Expense)</p>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={monthly} margin={{ top: 4, right: 4, left: -14, bottom: 0 }} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="cashFlow"
                name="Cash Flow"
                radius={[4, 4, 0, 0]}
                fill="#6366f1"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Monthly breakdown bar charts ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Monthly Income */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="mb-4">
            <h3 className="text-slate-800">Monthly Income</h3>
            <p className="text-xs text-slate-500 mt-0.5">Sales + Other Income by month</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthly} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Expense */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="mb-4">
            <h3 className="text-slate-800">Monthly Expense</h3>
            <p className="text-xs text-slate-500 mt-0.5">Direct + Indirect Expenses by month</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthly} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="expense" name="Expense" fill="#f87171" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Recent Transactions ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <SectionHeader title="Recent Transactions" sub="Latest Bank & Cash activity" to="/bank-cash-book" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                {["Date", "Particulars", "Account", "Contra Account", "Withdrawal", "Deposit", "Balance"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(tx.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-800 max-w-[220px] truncate">{tx.particulars}</td>
                  <td className="px-4 py-3">
                    <Badge color="sky">{tx.accountName}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-slate-700">{tx.contraAccount}</span>
                      <Badge color={
                        tx.contraGroup === "Expense"  ? "red"    :
                        tx.contraGroup === "Income"   ? "emerald":
                        tx.contraGroup === "Sales"    ? "emerald":
                        tx.contraGroup === "Purchases"? "amber"  : "slate"
                      }>{tx.contraGroup}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-red-500 tabular-nums">
                    {tx.withdrawal > 0 ? fmt(tx.withdrawal) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-emerald-600 tabular-nums">
                    {tx.deposit > 0 ? fmt(tx.deposit) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800 tabular-nums">{fmt(tx.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Recent Journal Entries ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <SectionHeader title="Recent Journal Entries" sub="Latest vouchers from Journal Book" to="/journal-voucher" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                {["Voucher No.", "Date", "Narration", "Debit Account", "Dr Amount", "Credit Account", "Cr Amount", "Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentJournals.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600">{j.voucherNo}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(j.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 max-w-[200px] truncate">{j.narration}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{j.debitAccount}</td>
                  <td className="px-4 py-3 text-sm font-medium text-red-500 tabular-nums">{fmt(j.debitAmount)}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{j.creditAccount}</td>
                  <td className="px-4 py-3 text-sm font-medium text-emerald-600 tabular-nums">{fmt(j.creditAmount)}</td>
                  <td className="px-4 py-3">
                    <Badge color={j.status === "Posted" ? "emerald" : "amber"}>{j.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
