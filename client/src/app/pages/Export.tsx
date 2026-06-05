import { useState, useEffect } from "react";
import {
  Download, FileSpreadsheet, CheckCircle2, Loader2,
  AlertTriangle, Scale, Layers, TrendingUp, Wallet,
  Landmark, FileText, Building2, Calendar, ChevronRight,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { FYBanner } from "../components/FYBanner";
import { getAllFYs } from "../api/financialYearApi";
import type { FinancialYear } from "../api/financialYearApi";
import { generateExcelExport, type ExportStep } from "../api/exportApi";

// ── Sheet meta ─────────────────────────────────────────────────────────────────
const SHEETS = [
  { step: "trial-balance" as ExportStep, icon: Scale,         color: "bg-indigo-50 text-indigo-600",  label: "Sheet 1 — Trial Balance",  desc: "All ledgers · Opening, Transaction & Closing balances · Dr / Cr totals" },
  { step: "cash-book"     as ExportStep, icon: Wallet,        color: "bg-amber-50 text-amber-600",    label: "Sheet 2 — Cash Book",       desc: "Cash in Hand & Petty Cash entries · Running balance · Contra accounts" },
  { step: "bank-book"     as ExportStep, icon: Landmark,      color: "bg-sky-50 text-sky-600",        label: "Sheet 3 — Bank Book",       desc: "HDFC & SBI bank entries · Running balance · Contra accounts" },
  { step: "journal"       as ExportStep, icon: FileText,      color: "bg-violet-50 text-violet-600",  label: "Sheet 4 — Journal Voucher", desc: "All journal entries · Debit / Credit ledgers · Status (Posted / Draft)" },
  { step: "balance-sheet" as ExportStep, icon: Layers,        color: "bg-blue-50 text-blue-600",      label: "Sheet 5 — Balance Sheet",   desc: "Assets vs Liabilities & Capital · Group-wise breakdown · Balance check" },
];

const STEP_LABELS: Record<ExportStep, string> = {
  idle:           "Waiting…",
  "trial-balance":"Fetching Trial Balance…",
  "cash-book":    "Fetching Cash Book…",
  "bank-book":    "Fetching Bank Book…",
  journal:        "Fetching Journal Vouchers…",
  "balance-sheet":"Fetching Balance Sheet…",
  building:       "Building Excel workbook…",
  done:           "Export complete!",
  error:          "Export failed.",
};

const STEP_ORDER: ExportStep[] = ["trial-balance","cash-book","bank-book","journal","balance-sheet","building","done"];

export default function Export() {
  const { company, selectedFY, setSelectedFY } = useApp();

  const [allFYs, setAllFYs]       = useState<FinancialYear[]>([]);
  const [activeFY, setActiveFY]   = useState<FinancialYear | undefined>(undefined);
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");

  const [step, setStep]           = useState<ExportStep>("idle");
  const [error, setError]         = useState<string | null>(null);

  const isRunning = !["idle","done","error"].includes(step);
  const isDone    = step === "done";
  const isError   = step === "error";

  useEffect(() => {
    getAllFYs().then((fys) => {
      setAllFYs(fys);
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

  const handleExport = async () => {
    setError(null);
    setStep("idle");
    try {
      await generateExcelExport(
        {
          companyName:    company.name,
          companyAddress: company.address,
          fyLabel:        activeFY?.label ?? selectedFY?.label ?? "FY 2025-26",
          dateFrom,
          dateTo,
        },
        (s) => setStep(s),
      );
    } catch (e: any) {
      setError(e?.message ?? "Export failed. Please try again.");
      setStep("error");
    }
  };

  const completedIdx = STEP_ORDER.indexOf(step);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto">
      <FYBanner />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Export to Excel</h1>
          <p className="text-sm text-slate-500 mt-0.5">Generate a multi-sheet Excel workbook with your financial data</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-medium">
          <FileSpreadsheet size={14} />
          5-Sheet Workbook · .xlsx
        </div>
      </div>

      {/* ── Company & FY info ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
        <p className="text-sm font-semibold text-slate-700">Company & Period</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Company preview */}
          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{company.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{company.address}</p>
              <p className="text-xs text-slate-400 mt-0.5">{company.taxId}</p>
            </div>
          </div>

          {/* FY + Date range */}
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <Calendar size={11} /> Financial Year
              </label>
              <select
                value={activeFY?._id ?? ""}
                onChange={(e) => handleFYChange(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {allFYs.map((fy) => <option key={fy._id} value={fy._id}>{fy.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">From</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">To</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sheets included ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <p className="text-sm font-semibold text-slate-700 mb-4">Sheets included in workbook</p>
        <div className="space-y-2">
          {SHEETS.map(({ step: s, icon: Icon, color, label, desc }) => {
            const sheetIdx = STEP_ORDER.indexOf(s);
            const done     = isDone || (isRunning && sheetIdx < completedIdx);
            const active   = step === s;
            return (
              <div
                key={s}
                className={`flex items-center gap-4 p-3.5 rounded-xl border transition-all ${
                  active  ? "border-indigo-300 bg-indigo-50" :
                  done    ? "border-emerald-200 bg-emerald-50/40" :
                            "border-slate-100 bg-slate-50/50"
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${done ? "bg-emerald-100" : color}`}>
                  {done
                    ? <CheckCircle2 size={16} className="text-emerald-600" />
                    : active
                    ? <Loader2 size={16} className="animate-spin text-indigo-600" />
                    : <Icon size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${done ? "text-emerald-700" : active ? "text-indigo-700" : "text-slate-700"}`}>{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{desc}</p>
                </div>
                {done   && <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />}
                {!done && !active && <ChevronRight size={14} className="text-slate-300 shrink-0" />}
              </div>
            );
          })}
        </div>

        {/* Extra features note */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            "Company & Address Header",
            "Financial Year Label",
            "Auto Column Width",
            "Color-coded Rows",
            "Dr / Cr Highlighted",
            "Balance Validation",
          ].map((f) => (
            <div key={f} className="flex items-center gap-1.5 text-xs text-slate-500">
              <CheckCircle2 size={11} className="text-indigo-400 shrink-0" />
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      {(isRunning || isDone || isError) && (
        <div className={`rounded-2xl border p-5 space-y-3 ${
          isDone  ? "bg-emerald-50 border-emerald-200" :
          isError ? "bg-red-50 border-red-200"         :
                    "bg-indigo-50 border-indigo-200"
        }`}>
          <div className="flex items-center gap-3">
            {isDone  ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> :
             isError ? <AlertTriangle size={18} className="text-red-500 shrink-0" /> :
                       <Loader2 size={18} className="animate-spin text-indigo-600 shrink-0" />}
            <p className={`text-sm font-semibold ${isDone ? "text-emerald-800" : isError ? "text-red-700" : "text-indigo-800"}`}>
              {STEP_LABELS[step]}
            </p>
          </div>

          {/* Progress bar */}
          {!isError && (
            <div className="h-2 bg-white/60 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isDone ? "bg-emerald-500" : "bg-indigo-500"}`}
                style={{ width: `${isDone ? 100 : Math.round((Math.max(0, completedIdx) / STEP_ORDER.length) * 100)}%` }}
              />
            </div>
          )}

          {isError && error && <p className="text-sm text-red-600">{error}</p>}

          {isDone && (
            <p className="text-xs text-emerald-700">
              Your Excel file has been downloaded. Check your downloads folder for <strong>{company.name.replace(/\s+/g, "_")}_Financial_Report.xlsx</strong>
            </p>
          )}
        </div>
      )}

      {/* ── Export button ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between flex-wrap gap-5">
          <div>
            <p className="font-bold text-lg">Ready to Export</p>
            <p className="text-indigo-200 text-sm mt-1">
              {activeFY?.label ?? "—"} · {dateFrom} to {dateTo}
            </p>
            <p className="text-indigo-300 text-xs mt-0.5">5 sheets · Company header · Auto column width · Color-coded</p>
          </div>
          <button
            onClick={isDone || isError ? () => { setStep("idle"); setError(null); } : handleExport}
            disabled={isRunning}
            className={`flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg ${
              isRunning
                ? "bg-white/20 text-white/60 cursor-not-allowed"
                : "bg-white text-indigo-700 hover:bg-indigo-50 hover:shadow-xl"
            }`}
          >
            {isRunning
              ? <><Loader2 size={16} className="animate-spin" /> Exporting…</>
              : isDone
              ? <><Download size={16} /> Export Again</>
              : <><Download size={16} /> Export to Excel</>}
          </button>
        </div>
      </div>
    </div>
  );
}
