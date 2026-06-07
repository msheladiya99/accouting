import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry, AllCommunityModule,
  type ColDef, type ICellRendererParams,
} from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import {
  CalendarRange, RefreshCw, CheckCircle2, Lock,
  Trash2, TrendingUp, Clock, Calendar, Plus,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  type FinancialYear,
  getAllFYs, generateFYs, closeFY, deleteFY, createFY,
} from "../api/financialYearApi";
import { useApp } from "../context/AppContext";

ModuleRegistry.registerModules([AllCommunityModule]);

const statusMeta: Record<string, { label: string; bg: string; dot: string; text: string }> = {
  current: { label: "Current", bg: "bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-700" },
  previous: { label: "Previous", bg: "bg-slate-100", dot: "bg-slate-400", text: "text-slate-600" },
  future: { label: "Future", bg: "bg-indigo-50", dot: "bg-indigo-400", text: "text-indigo-700" },
  closed: { label: "Closed", bg: "bg-red-50", dot: "bg-red-400", text: "text-red-600" },
};

export default function FinancialYear() {
  const { selectedFY, setSelectedFY, availableFYs, setAvailableFYs } = useApp();
  const [loading, setLoading] = useState(true);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customCreating, setCustomCreating] = useState(false);
  const gridRef = useRef<AgGridReact>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllFYs();
      setAvailableFYs(data);
    } catch {
      toast.error("Failed to load financial years");
    } finally {
      setLoading(false);
    }
  }, [setAvailableFYs]);

  useEffect(() => { reload(); }, [reload]);

  // ── Set Active ──────────────────────────────────────────────────────────────
  const handleSetActive = useCallback((fy: FinancialYear) => {
    setSelectedFY(fy);
    toast.success(`Switched to ${fy.label}`);
  }, [setSelectedFY]);

  // ── Close FY ────────────────────────────────────────────────────────────────
  const handleClose = useCallback(async (fy: FinancialYear) => {
    if (!window.confirm(`Close "${fy.label}"? This marks it as closed and cannot be undone easily.`)) return;
    try {
      await closeFY(fy._id);
      toast.success(`${fy.label} closed`);
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [reload]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (fy: FinancialYear) => {
    if (!window.confirm(`Delete "${fy.label}"? This cannot be undone.`)) return;
    try {
      await deleteFY(fy._id);
      setAvailableFYs(availableFYs.filter((f) => f._id !== fy._id));
      toast.success(`${fy.label} deleted`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [availableFYs, setAvailableFYs]);

  // ── Create Custom FY ────────────────────────────────────────────────────────
  const handleCreateCustom = useCallback(async () => {
    if (!customStart || !customEnd) return toast.error("Please enter both start and end dates");
    if (new Date(customStart) >= new Date(customEnd)) return toast.error("End date must be after start date");
    setCustomCreating(true);
    try {
      await createFY(customStart, customEnd);
      toast.success("Financial Year created successfully");
      setCustomStart("");
      setCustomEnd("");
      await reload();
    } catch (e: any) {
      toast.error(e.message || "Failed to create financial year");
    } finally {
      setCustomCreating(false);
    }
  }, [customStart, customEnd, reload]);

  const previewLabel = useMemo(() => {
    if (!customStart || !customEnd) return "—";
    const startYear = new Date(customStart).getFullYear();
    const endYear = new Date(customEnd).getFullYear();
    if (isNaN(startYear) || isNaN(endYear)) return "Invalid Date";
    return `FY ${startYear}-${String(endYear).slice(-2)}`;
  }, [customStart, customEnd]);

  // ── Toggle year selection ───────────────────────────────────────────────────
  const toggleYear = (y: number) =>
    setSelectedYears((prev) => prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y]);

  // ── AG Grid columns ─────────────────────────────────────────────────────────
  const columnDefs = useMemo<ColDef<FinancialYear>[]>(() => [
    {
      headerName: "#",
      valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
      width: 56,
      sortable: false,
      cellStyle: { color: "#94a3b8", fontSize: "12px" },
    },
    {
      field: "label",
      headerName: "Financial Year",
      flex: 1,
      minWidth: 170,
      cellRenderer: (p: ICellRendererParams<FinancialYear>) => {
        if (!p.data) return null;
        const isActive = p.data._id === selectedFY?._id;
        return (
          <div className="flex items-center gap-2.5 h-full">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? "bg-indigo-100" : "bg-slate-100"}`}>
              <CalendarRange size={14} className={isActive ? "text-indigo-600" : "text-slate-500"} />
            </div>
            <div>
              <p className={`text-sm font-semibold ${isActive ? "text-indigo-700" : "text-slate-800"}`}>
                {p.data.label}
              </p>
              {isActive && (
                <p className="text-[10px] text-indigo-500 font-medium">Active in navbar</p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      field: "startDate",
      headerName: "Start Date",
      width: 140,
      valueFormatter: (p) =>
        new Date(p.value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      cellStyle: { fontSize: "12px", color: "#475569" },
    },
    {
      field: "endDate",
      headerName: "End Date",
      width: 140,
      valueFormatter: (p) =>
        new Date(p.value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      cellStyle: { fontSize: "12px", color: "#475569" },
    },
    {
      field: "status",
      headerName: "Status",
      width: 120,
      cellRenderer: (p: ICellRendererParams<FinancialYear>) => {
        const meta = statusMeta[p.value] ?? statusMeta.previous;
        return (
          <div className="flex items-center h-full">
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          </div>
        );
      },
    },
    {
      headerName: "Duration",
      width: 100,
      valueGetter: () => "365 days",
      cellStyle: { fontSize: "12px", color: "#94a3b8" },
    },
    {
      headerName: "Actions",
      width: 160,
      sortable: false,
      cellRenderer: (p: ICellRendererParams<FinancialYear>) => {
        if (!p.data) return null;
        const fy = p.data;
        const isActive = fy._id === selectedFY?._id;
        const isCurrent = fy.status === "current";
        return (
          <div className="flex items-center gap-1 h-full">
            {/* Switch to this FY */}
            <button
              onClick={() => handleSetActive(fy)}
              disabled={isActive}
              title={isActive ? "Already active" : `Switch to ${fy.label}`}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${isActive
                  ? "bg-indigo-100 text-indigo-400 cursor-default"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
            >
              {isActive ? <CheckCircle2 size={11} /> : <TrendingUp size={11} />}
              {isActive ? "Active" : "Switch"}
            </button>
            {/* Close */}
            {!isCurrent && fy.status !== "closed" && (
              <button
                onClick={() => handleClose(fy)}
                title="Close FY"
                className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
              >
                <Lock size={13} />
              </button>
            )}
            {/* Delete */}
            {!isCurrent && (
              <button
                onClick={() => handleDelete(fy)}
                title="Delete FY"
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        );
      },
    },
  ], [selectedFY, handleSetActive, handleClose, handleDelete]);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const current = availableFYs.find((f) => f.status === "current");
  const previous = availableFYs.find((f) => f.status === "previous");

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Financial Year</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage fiscal periods · April 1 – March 31 · {availableFYs.length} configured
          </p>
        </div>
        <button
          onClick={reload}
          className="p-2 border border-slate-200 bg-white rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Current & Previous FY highlight cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current FY */}
        <div className={`rounded-xl p-5 shadow-sm border col-span-1 sm:col-span-1
          ${current ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100"}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 size={16} className="text-emerald-600" />
            </div>
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Current FY</span>
          </div>
          <p className="text-xl font-bold text-slate-900">{current?.label ?? "—"}</p>
          {current && (
            <p className="text-xs text-emerald-700 mt-1">
              {new Date(current.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
              {" – "}
              {new Date(current.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          )}
        </div>

        {/* Previous FY */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <Clock size={16} className="text-slate-500" />
            </div>
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Previous FY</span>
          </div>
          <p className="text-xl font-bold text-slate-900">{previous?.label ?? "—"}</p>
          {previous && (
            <p className="text-xs text-slate-500 mt-1">
              {new Date(previous.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
              {" – "}
              {new Date(previous.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          )}
        </div>

        {/* Active in navbar */}
        <div className={`rounded-xl p-5 shadow-sm border col-span-1 sm:col-span-1
          ${selectedFY ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-100"}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <TrendingUp size={16} className="text-indigo-600" />
            </div>
            <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Reports Loading For</span>
          </div>
          <p className="text-xl font-bold text-slate-900">{selectedFY?.label ?? "—"}</p>
          <p className="text-xs text-indigo-600 mt-1 capitalize">{selectedFY?.status} year</p>
        </div>

        {/* Total configured */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <Calendar size={16} className="text-purple-600" />
            </div>
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Total FYs</span>
          </div>
          <p className="text-xl font-bold text-slate-900">{availableFYs.length}</p>
          <p className="text-xs text-slate-500 mt-1">
            {availableFYs.filter((f) => f.status === "future").length} upcoming ·{" "}
            {availableFYs.filter((f) => f.status === "closed").length} closed
          </p>
        </div>
      </div>

      {/* Custom Creation Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
            <CalendarRange size={15} className="text-indigo-600" />
          </div>
          <div>
            <h3 className="text-slate-900">Create Custom Financial Year</h3>
            <p className="text-xs text-slate-500 mt-0.5">Enter start & end dates to define a custom period</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Start Date</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">End Date</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Auto-generated Label</p>
              <p className="text-sm font-bold text-slate-700 mt-0.5">{previewLabel}</p>
            </div>
            {customStart && customEnd && (
              <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 font-semibold rounded-full border border-indigo-100">
                {Math.round((new Date(customEnd).getTime() - new Date(customStart).getTime()) / (1000 * 60 * 60 * 24)) + 1} days
              </span>
            )}
          </div>
          <div className="pt-2 flex justify-start">
            <button
              onClick={handleCreateCustom}
              disabled={customCreating || !customStart || !customEnd}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {customCreating
                ? <><RefreshCw size={14} className="animate-spin" /> Creating…</>
                : <><Plus size={14} /> Create Custom FY</>}
            </button>
          </div>
        </div>
      </div>

      {/* AG Grid listing */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-slate-900">All Financial Years</h3>
          <p className="text-xs text-slate-400">Click <strong>Switch</strong> to load reports for that FY</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : (
          <div className="ag-theme-quartz" style={{ height: Math.max(280, Math.min(availableFYs.length * 56 + 56, 480)) }}>
            <AgGridReact<FinancialYear>
              theme="legacy"
              ref={gridRef}
              rowData={availableFYs}
              columnDefs={columnDefs}
              defaultColDef={{ resizable: true, sortable: true }}
              rowHeight={56}
              headerHeight={44}
              animateRows
              getRowId={(p) => p.data._id}
              rowClassRules={{
                "bg-indigo-50/40": (p) => p.data?._id === selectedFY?._id,
              }}
            />
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex items-start gap-3">
        <CalendarRange size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-500 space-y-1">
          <p><strong className="text-slate-700">Indian Financial Year</strong> runs from <strong>April 1 to March 31</strong> of the following calendar year.</p>
          <p>Switching the active FY in the navbar instantly filters all reports (Dashboard, Balance Sheet, Trial Balance, P&amp;L, Bank Book) to that period.</p>
          <p>The <strong className="text-emerald-700">Current</strong> status is determined automatically by today's date. A <strong className="text-red-600">Closed</strong> FY is locked for new entries.</p>
        </div>
      </div>
    </div>
  );
}
