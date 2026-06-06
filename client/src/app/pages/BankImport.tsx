import { useState, useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry, AllCommunityModule,
  type ColDef, type ICellRendererParams,
} from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import {
  Upload, FileText, CheckCircle2, ChevronRight, FileSpreadsheet,
  Sparkles, AlertTriangle, RefreshCw, Trash2, Eye, Save,
  Key, X, Bot, TrendingUp, TrendingDown, Info, Image,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  parseExcel, parsePDF, parseStatementWithAI, enrichWithOpenRouter, saveImportedTransactions,
  SAMPLE_TRANSACTIONS,
  type ImportRow, type RawTransaction,
} from "../api/bankImportApi";
import { LEDGER_GROUPS } from "../api/ledgerApi";
import { getAllAccounts, type BankCashAccount } from "../api/bankCashBookApi";

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const fmt = (n: number) =>
  n === 0 ? "—" : "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GROUP_COLORS: Record<string, string> = {
  Assets: "bg-blue-50 text-blue-700", Liabilities: "bg-red-50 text-red-700",
  Capital: "bg-purple-50 text-purple-700", Income: "bg-emerald-50 text-emerald-700",
  Expense: "bg-orange-50 text-orange-700", Bank: "bg-cyan-50 text-cyan-700",
  Cash: "bg-amber-50 text-amber-700", Purchases: "bg-lime-50 text-lime-700",
  Sales: "bg-teal-50 text-teal-700", "Sundry Debtors": "bg-indigo-50 text-indigo-700",
  "Sundry Creditors": "bg-pink-50 text-pink-700",
};

function toImportRows(txns: RawTransaction[]): ImportRow[] {
  return txns.map((t) => ({ ...t, id: uid(), aiAccountName: "", aiAccountGroup: "", aiStatus: "idle" as const }));
}

// ── Inline group cell editor ──────────────────────────────────────────────────
const GroupCellEditor = forwardRef(function GroupCellEditor(props: any, ref) {
  const [val, setVal] = useState<string>(props.value ?? "Expense");
  const selRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { selRef.current?.focus(); }, []);
  useImperativeHandle(ref, () => ({ getValue: () => val }));
  return (
    <select
      ref={selRef}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      className="w-full h-full px-2 text-sm outline-none border-2 border-indigo-400 bg-white"
    >
      {LEDGER_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
    </select>
  );
});

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = ["Upload File", "AI Processing", "Preview & Edit", "Import Done"];

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            step === i ? "bg-indigo-600 text-white" :
            step > i  ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
            "bg-white text-slate-400 border border-slate-200"
          }`}>
            {step > i ? <CheckCircle2 size={12} /> : <span className="w-4 text-center">{i + 1}</span>}
            {s}
          </div>
          {i < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />}
        </div>
      ))}
    </div>
  );
}



// ── Main ──────────────────────────────────────────────────────────────────────
export default function BankImport({ onClose, onImportComplete }: { onClose?: () => void; onImportComplete?: () => void } = {}) {
  const [step, setStep]         = useState(0);
  const [dragging, setDragging] = useState(false);
  const [file, setFile]         = useState<File | null>(null);
  const [rows, setRows]         = useState<ImportRow[]>([]);
  const [parsing, setParsing]   = useState(false);
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const gridRef = useRef<AgGridReact<ImportRow>>(null);
  const [accounts, setAccounts]         = useState<BankCashAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("auto-create");
  const [detectedBankName, setDetectedBankName] = useState<string>("");

  useEffect(() => {
    getAllAccounts()
      .then((accs) => {
        setAccounts(accs);
      })
      .catch(() => toast.error("Failed to load Bank/Cash accounts"));
  }, []);

  // ── Accept file ──────────────────────────────────────────────────────────
  const acceptFile = useCallback((f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["xlsx", "xls", "pdf", "png", "jpg", "jpeg", "webp"].includes(ext)) {
      toast.error("Only Excel (.xlsx/.xls), PDF, or image files (PNG, JPG, JPEG, WebP) are supported");
      return;
    }
    setFile(f);
    setParseError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, [acceptFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  };

  // ── Run AI ────────────────────────────────────────────────────────────────
  const runAI = useCallback(async (inputRows: ImportRow[]) => {
    setAiLoading(true);
    setAiProgress(0);
    setRows(inputRows.map((r) => ({ ...r, aiStatus: "loading" as const })));

    const progressInterval = setInterval(() => {
      setAiProgress((p) => Math.min(p + 3, 88));
    }, 250);

    try {
      const narrations = inputRows.map((r) => r.narration);
      const matches    = await enrichWithOpenRouter(narrations);
      clearInterval(progressInterval);
      setAiProgress(100);
      const enriched: ImportRow[] = inputRows.map((r, i) => ({
        ...r,
        aiAccountName:  matches[i]?.accountName  ?? "",
        aiAccountGroup: matches[i]?.accountGroup ?? "",
        aiStatus: "done" as const,
      }));
      setRows(enriched);
      setStep(2);
      toast.success(`AI suggested accounts for ${matches.length} transactions`);
    } catch (err: any) {
      clearInterval(progressInterval);
      setRows(inputRows.map((r) => ({ ...r, aiStatus: "error" as const })));
      setStep(2);
      toast.error(`AI error: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  }, []);

  // ── Parse file ────────────────────────────────────────────────────────────
  const parseFile = useCallback(async (f: File) => {
    setParsing(true);
    setParseError(null);
    try {
      const ext  = f.name.split(".").pop()?.toLowerCase() ?? "";
      let txns: RawTransaction[] = [];
      let parsedBankName = "";

      if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        const res = await parseStatementWithAI(f);
        txns = res.transactions;
        parsedBankName = res.bankName;
      } else if (ext === "pdf") {
        try {
          const res = await parseStatementWithAI(f);
          txns = res.transactions;
          parsedBankName = res.bankName;
        } catch (err: any) {
          console.warn("AI parsing failed, falling back to local parsing", err);
          txns = await parsePDF(f);
        }
      } else {
        txns = await parseExcel(f);
      }

      if (txns.length === 0) {
        setParseError("No transactions found. Check that the statement is clear and has valid headers.");
        return;
      }

      if (parsedBankName) {
        setDetectedBankName(parsedBankName);
        const matched = accounts.find(
          (acc) => acc.name.trim().toLowerCase() === parsedBankName.trim().toLowerCase()
        );
        if (matched) {
          setSelectedAccountId(matched._id);
          toast.success(`Detected ${parsedBankName} - Auto-selected matched account`);
        } else {
          setSelectedAccountId("auto-create");
          toast.success(`Detected ${parsedBankName} - Set to Auto-create account`);
        }
      }

      const prepared = toImportRows(txns);
      setRows(prepared);
      setStep(1);
      await runAI(prepared);
    } catch (err: any) {
      setParseError(err?.message ?? "Failed to parse file");
    } finally {
      setParsing(false);
    }
  }, [runAI, accounts]);

  // ── Load sample ───────────────────────────────────────────────────────────
  const loadSample = useCallback(async () => {
    const sampleRows = toImportRows(SAMPLE_TRANSACTIONS);
    setFile(new File([], "sample_hdfc_statement.xlsx"));
    setRows(sampleRows);
    setStep(1);
    await runAI(sampleRows);
  }, [runAI]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedAccountId) {
      toast.error("Please select a target Bank/Cash account first");
      return;
    }
    const incomplete = rows.filter((r) => !r.aiAccountName.trim() || !r.aiAccountGroup.trim());
    if (incomplete.length > 0) {
      toast.error(`${incomplete.length} rows still need Account Name and Group`);
      return;
    }
    try {
      await saveImportedTransactions(rows, selectedAccountId, detectedBankName);
      setStep(3);
      toast.success(`${rows.length} transactions saved`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save transactions");
    }
  }, [rows, selectedAccountId, detectedBankName]);

  // ── Delete row ────────────────────────────────────────────────────────────
  const deleteRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // ── Inline edit ───────────────────────────────────────────────────────────
  const onCellEditingStopped = useCallback((e: any) => {
    const { data, column, newValue } = e;
    if (!data) return;
    setRows((prev) => prev.map((r) => r.id === data.id ? { ...r, [column.colId]: newValue } : r));
  }, []);

  // ── Summary ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:       rows.length,
    aiDone:      rows.filter((r) => r.aiStatus === "done").length,
    filled:      rows.filter((r) => r.aiAccountName.trim()).length,
    deposits:    rows.reduce((s, r) => s + r.deposit,    0),
    withdrawals: rows.reduce((s, r) => s + r.withdrawal, 0),
  }), [rows]);

  // ── Column defs ───────────────────────────────────────────────────────────
  const columnDefs = useMemo<ColDef<ImportRow>[]>(() => [
    {
      headerName: "#",
      width: 56,
      sortable: false,
      valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
      cellStyle: { color: "#94a3b8", fontSize: "11px", textAlign: "center" },
    },
    {
      field: "date",
      headerName: "Date",
      width: 108,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellStyle: { fontSize: "12px", color: "#64748b" },
    },
    {
      field: "narration",
      headerName: "Narration",
      flex: 1,
      minWidth: 240,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellStyle: { fontSize: "12px", color: "#1e293b" },
    },
    {
      field: "withdrawal",
      headerName: "Withdrawal (Dr)",
      width: 145,
      type: "numericColumn",
      cellRenderer: (p: ICellRendererParams<ImportRow>) =>
        p.data?.withdrawal
          ? <span className="text-red-600 font-semibold text-xs">{fmt(p.data.withdrawal)}</span>
          : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      field: "deposit",
      headerName: "Deposit (Cr)",
      width: 145,
      type: "numericColumn",
      cellRenderer: (p: ICellRendererParams<ImportRow>) =>
        p.data?.deposit
          ? <span className="text-emerald-600 font-semibold text-xs">{fmt(p.data.deposit)}</span>
          : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      field: "aiAccountName",
      headerName: "AI Account Name",
      width: 210,
      editable: true,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellRenderer: (p: ICellRendererParams<ImportRow>) => {
        if (!p.data) return null;
        if (p.data.aiStatus === "loading")
          return <span className="flex items-center gap-1.5 text-indigo-400 text-xs"><RefreshCw size={11} className="animate-spin" /> AI thinking…</span>;
        if (!p.value)
          return <span className="text-slate-300 text-xs italic">Double-click to enter</span>;
        return (
          <div className="flex items-center gap-1.5 h-full">
            {p.data.aiStatus === "done" && <Bot size={11} className="text-indigo-400 flex-shrink-0" />}
            <span className="text-xs font-medium text-slate-800 truncate">{p.value}</span>
          </div>
        );
      },
    },
    {
      field: "aiAccountGroup",
      headerName: "AI Group",
      width: 165,
      editable: true,
      cellEditor: GroupCellEditor,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellRenderer: (p: ICellRendererParams<ImportRow>) => {
        if (!p.data) return null;
        if (p.data.aiStatus === "loading")
          return <span className="text-slate-300 text-xs">…</span>;
        if (!p.value)
          return <span className="text-slate-300 text-xs italic">Select group</span>;
        const cls = GROUP_COLORS[p.value] ?? "bg-slate-100 text-slate-600";
        return (
          <div className="flex items-center h-full">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
              {p.value}
            </span>
          </div>
        );
      },
    },
    {
      headerName: "",
      width: 60,
      sortable: false,
      pinned: "right",
      cellRenderer: (p: ICellRendererParams<ImportRow>) =>
        p.data ? (
          <div className="flex items-center h-full">
            <button
              onClick={() => deleteRow(p.data!.id)}
              className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
              title="Remove"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ) : null,
    },
  ], [deleteRow]);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-slate-900">AI Bank Statement Import</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Upload Excel, PDF, or Images · OpenRouter AI suggests account mapping automatically
        </p>
      </div>

      <StepBar step={step} />

      {/* ── Step 0: Upload ─────────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-4 max-w-2xl">

          {/* Bank/Cash Account Selector */}
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm space-y-2">
            <label className="block text-sm font-medium text-slate-700 flex items-center gap-1.5">
              <span>Select Destination Bank/Cash Account</span>
              <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm font-medium text-slate-800"
            >
              <option value="auto-create">
                {detectedBankName 
                  ? `✨ [New Bank] ${detectedBankName} (Auto-create)` 
                  : "✨ Auto-detect & Create from Statement"}
              </option>
              {accounts.map((acc) => (
                <option key={acc._id} value={acc._id}>
                  {acc.name} ({acc.group})
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400">
              All imported transactions will be saved under this account in the Bank/Cash Book.
            </p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
              dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Upload size={28} className="text-indigo-500" />
            </div>
            <h3 className="text-slate-800">Drop your bank statement here</h3>
            <p className="text-sm text-slate-500 mt-1 mb-5">
              <span className="font-medium text-emerald-700">Excel (.xlsx / .xls)</span>
              {", "}
              <span className="font-medium text-red-600">PDF</span>
              {", or "}
              <span className="font-medium text-indigo-600">Image (PNG, JPG, WebP)</span>
              {" · Max 20 MB"}
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors cursor-pointer">
                <FileSpreadsheet size={15} /> Choose Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
              </label>
              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer">
                <FileText size={15} /> Choose PDF
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
              </label>
              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors cursor-pointer">
                <Image size={15} /> Choose Image
                <input type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
              </label>
            </div>
          </div>

          {/* Format guide */}
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
              <Info size={13} className="text-slate-400" /> Expected Excel column headers
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {[
                ["Date",       "date, txn date, value date"],
                ["Narration",  "narration, description, particulars"],
                ["Withdrawal", "debit, withdrawal, dr"],
                ["Deposit",    "credit, deposit, cr"],
              ].map(([f, s]) => (
                <p key={f} className="text-xs">
                  <span className="font-medium text-slate-700">{f}</span>
                  <span className="text-slate-400"> — {s}</span>
                </p>
              ))}
            </div>
          </div>

          {/* Selected file ready bar */}
          {file && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-indigo-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText size={18} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{file.size > 0 ? `${(file.size / 1024).toFixed(1)} KB` : "Ready"}</p>
              </div>
              <button
                onClick={() => parseFile(file)}
                disabled={parsing}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {parsing ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {parsing ? "Parsing…" : "Parse & Analyse"}
              </button>
            </div>
          )}

          {parseError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{parseError}</p>
            </div>
          )}

          {/* Sample data */}
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <div className="flex-1 h-px bg-slate-200" /> or try sample <div className="flex-1 h-px bg-slate-200" />
          </div>
          <button
            onClick={loadSample}
            className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
          >
            <Eye size={15} /> Use Sample HDFC Statement (18 transactions)
          </button>
        </div>
      )}

      {/* ── Step 1: AI Processing ──────────────────────────────────────────── */}
      {step === 1 && (
        <div className="max-w-lg mx-auto space-y-6 py-8">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Bot size={36} className={`text-indigo-500 ${aiLoading ? "animate-pulse" : ""}`} />
            </div>
            <h2 className="text-slate-900">
              {aiLoading ? "AI is analysing narrations…" : "Preparing preview…"}
            </h2>
            <p className="text-sm text-slate-500 mt-2">
              Sending {rows.length} transaction narrations with the prompt:
            </p>
            <div className="mt-3 px-4 py-2.5 bg-slate-900 rounded-lg text-left">
              <p className="text-xs font-mono text-indigo-300">You are an Indian Accountant.</p>
              <p className="text-xs font-mono text-slate-400">Based on narration suggest:</p>
              <p className="text-xs font-mono text-emerald-400">{"{ accountName, accountGroup }"}</p>
            </div>
          </div>

          {/* Progress */}
          <div>
            <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${aiProgress}%` }}
              />
            </div>
            <p className="text-right text-xs text-slate-400 mt-1">{aiProgress}%</p>
          </div>

          {/* Live preview of rows */}
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm divide-y divide-slate-50">
            {rows.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <RefreshCw size={11} className="animate-spin text-indigo-400 flex-shrink-0" />
                <span className="text-xs text-slate-600 truncate flex-1">{r.narration}</span>
                {r.deposit > 0
                  ? <span className="text-emerald-600 text-xs font-semibold flex-shrink-0">{fmt(r.deposit)}</span>
                  : <span className="text-red-500 text-xs font-semibold flex-shrink-0">{fmt(r.withdrawal)}</span>
                }
              </div>
            ))}
            {rows.length > 6 && (
              <p className="px-4 py-2 text-xs text-slate-400 text-center">
                + {rows.length - 6} more transactions
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Preview & Edit ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Total Rows",      value: stats.total,                                    color: "text-slate-900"   },
              { label: "AI Mapped",       value: stats.aiDone,                                   color: "text-indigo-600"  },
              { label: "Filled",          value: stats.filled,                                   color: "text-emerald-600" },
              { label: "Total Deposits",  value: `₹${(stats.deposits / 100000).toFixed(1)}L`,    color: "text-emerald-600" },
              { label: "Total Withdrawals",value:`₹${(stats.withdrawals / 100000).toFixed(1)}L`, color: "text-red-500"     },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* AI banner */}
          <div className="flex flex-col gap-2">
            {stats.aiDone > 0 && (
              <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                <Bot size={16} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-indigo-800">
                  <span className="font-semibold">OpenRouter AI</span> suggested accounts for{" "}
                  <span className="font-semibold">{stats.aiDone} transactions</span>.{" "}
                  Double-click the <em>AI Account Name</em> or <em>AI Group</em> cell to edit any suggestion before saving.
                </p>
              </div>
            )}
            {detectedBankName && (
              <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 shadow-sm">
                <Bot size={16} className="text-emerald-600 flex-shrink-0 animate-bounce" />
                <span>
                  Detected Bank Account: <strong className="font-semibold">{detectedBankName}</strong>. 
                  {selectedAccountId === "auto-create" ? " This account will be automatically created on save." : " Matches an existing Bank/Cash account."}
                </span>
              </div>
            )}
          </div>

          {/* Incomplete warning */}
          {stats.filled < stats.total && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                <span className="font-semibold">{stats.total - stats.filled} rows</span> still need an Account Name and Group.
              </p>
            </div>
          )}

          {/* Grid */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div
              className="ag-theme-quartz"
              style={{ height: Math.max(420, Math.min(rows.length * 48 + 120, 640)) }}
            >
              <AgGridReact<ImportRow>
                theme="legacy"
                ref={gridRef}
                rowData={rows}
                columnDefs={columnDefs}
                defaultColDef={{ resizable: true, sortable: true }}
                rowHeight={48}
                headerHeight={44}
                floatingFiltersHeight={38}
                animateRows
                stopEditingWhenCellsLoseFocus
                onCellEditingStopped={onCellEditingStopped}
                getRowId={(p) => p.data.id}
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              onClick={() => { setStep(0); setRows([]); setFile(null); }}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              ← Back to Upload
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => runAI(rows)}
                disabled={aiLoading}
                title="Re-run AI"
                className="flex items-center gap-2 px-4 py-2 border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg text-sm hover:bg-indigo-100 transition-colors disabled:opacity-40"
              >
                <Sparkles size={14} /> Re-run AI
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
              >
                <Save size={14} /> Save {rows.length} Transactions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Done ──────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-100 text-center">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={40} className="text-emerald-500" />
            </div>
            <h2 className="text-slate-900">Import Successful!</h2>
            <p className="text-slate-500 text-sm mt-2">
              <span className="font-semibold text-slate-700">{rows.length} transactions</span> saved with AI-suggested account mappings.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-6 mb-6">
              <div className="bg-emerald-50 rounded-xl p-4">
                <TrendingUp size={20} className="text-emerald-600 mx-auto mb-1" />
                <p className="text-sm font-bold text-emerald-700">{fmt(stats.deposits)}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Total Deposits</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4">
                <TrendingDown size={20} className="text-red-500 mx-auto mb-1" />
                <p className="text-sm font-bold text-red-600">{fmt(stats.withdrawals)}</p>
                <p className="text-xs text-red-500 mt-0.5">Total Withdrawals</p>
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setStep(0); setRows([]); setFile(null); }}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Import Another
              </button>
              <button
                onClick={() => {
                  if (onImportComplete) {
                    onImportComplete();
                  } else {
                    window.location.href = "/bank-cash-book";
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
              >
                View Cash Book
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
