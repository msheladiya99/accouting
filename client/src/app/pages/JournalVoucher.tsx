import {
  useState, useCallback, useMemo, useEffect, useRef,
} from "react";
import { useForm } from "react-hook-form";
import {
  Plus, RefreshCw, Trash2, X, Save, Search,
  FileText, CheckCircle2, AlertTriangle, Loader2, Scale,
  TrendingUp, TrendingDown, Hash, Download,
} from "lucide-react";
import toast from "react-hot-toast";
import { useApp } from "../context/AppContext";
import { FYBanner } from "../components/FYBanner";
import {
  getAllJournalEntries, createJournalEntry, updateJournalEntry, deleteJournalEntry,
  type JournalEntry, type JournalPayload,
} from "../api/journalVoucherApi";
import { getAllLedgers, type Ledger } from "../api/ledgerApi";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtAmt = (n: number) =>
  "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });

const GROUP_COLORS: Record<string, { bg: string; text: string }> = {
  Assets:            { bg: "bg-blue-50",    text: "text-blue-700"    },
  Liabilities:       { bg: "bg-red-50",     text: "text-red-700"     },
  Capital:           { bg: "bg-purple-50",  text: "text-purple-700"  },
  Income:            { bg: "bg-emerald-50", text: "text-emerald-700" },
  Expense:           { bg: "bg-orange-50",  text: "text-orange-700"  },
  Bank:              { bg: "bg-cyan-50",    text: "text-cyan-700"    },
  Cash:              { bg: "bg-amber-50",   text: "text-amber-700"   },
  Purchases:         { bg: "bg-lime-50",    text: "text-lime-700"    },
  Sales:             { bg: "bg-teal-50",    text: "text-teal-700"    },
  "Sundry Debtors":  { bg: "bg-indigo-50",  text: "text-indigo-700"  },
  "Sundry Creditors":{ bg: "bg-pink-50",    text: "text-pink-700"    },
};

function GroupBadge({ group }: { group: string }) {
  const c = GROUP_COLORS[group] ?? { bg: "bg-slate-100", text: "text-slate-600" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text}`}>
      {group}
    </span>
  );
}

// ── LedgerCombobox ────────────────────────────────────────────────────────────
function LedgerCombobox({ ledgers, value, onChange, placeholder, hasError }: {
  ledgers: Ledger[];
  value: string;
  onChange: (name: string, group: string) => void;
  placeholder?: string;
  hasError?: boolean;
}) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? ledgers.filter((l) => l.ledgerName.toLowerCase().includes(q) || l.groupName.toLowerCase().includes(q)) : ledgers;
  }, [ledgers, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Ledger[]>();
    for (const l of filtered) {
      if (!map.has(l.groupName)) map.set(l.groupName, []);
      map.get(l.groupName)!.push(l);
    }
    return map;
  }, [filtered]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = ledgers.find((l) => l.ledgerName === value);

  return (
    <div ref={ref} className="relative">
      <div className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 transition-all ${
        open ? "border-indigo-400 ring-2 ring-indigo-100 bg-white" :
        hasError ? "border-red-300 bg-red-50" :
        "border-slate-200 bg-slate-50"
      }`}>
        <Search size={13} className="text-slate-400 flex-shrink-0" />
        <input
          value={open ? query : (selected?.ledgerName ?? "")}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={open ? "Search ledger…" : (placeholder ?? "Select ledger")}
          className="bg-transparent text-sm outline-none text-slate-800 placeholder-slate-400 w-full"
        />
        {value && !open && (
          <button onMouseDown={(e) => { e.preventDefault(); onChange("", ""); }} className="text-slate-300 hover:text-slate-500">
            <X size={12} />
          </button>
        )}
      </div>
      {selected && !open && <div className="mt-1"><GroupBadge group={selected.groupName} /></div>}
      {open && (
        <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400 text-center">No ledgers match "{query}"</p>
          ) : (
            [...grouped.entries()].map(([group, items]) => (
              <div key={group}>
                <p className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider sticky top-0 ${GROUP_COLORS[group]?.bg ?? "bg-slate-50"} ${GROUP_COLORS[group]?.text ?? "text-slate-600"}`}>
                  {group}
                </p>
                {items.map((l) => (
                  <button
                    key={l._id}
                    onMouseDown={(e) => { e.preventDefault(); onChange(l.ledgerName, l.groupName); setOpen(false); setQuery(""); }}
                    className={`w-full flex items-center justify-between px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors ${l.ledgerName === value ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-700"}`}
                  >
                    <span>{l.ledgerName}</span>
                    {l.ledgerName === value && <CheckCircle2 size={12} className="text-indigo-500" />}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Journal Modal ─────────────────────────────────────────────────────────────
function JournalModal({ entry, ledgers, loading, onClose, onSubmit }: {
  entry?: JournalEntry;
  ledgers: Ledger[];
  loading: boolean;
  onClose: () => void;
  onSubmit: (data: JournalPayload) => void;
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<JournalPayload>({
    defaultValues: {
      date:          entry?.date          ?? new Date().toISOString().slice(0, 10),
      narration:     entry?.narration     ?? "",
      debitAccount:  entry?.debitAccount  ?? "",
      debitGroup:    entry?.debitGroup    ?? "",
      debitAmount:   entry?.debitAmount   ?? 0,
      creditAccount: entry?.creditAccount ?? "",
      creditGroup:   entry?.creditGroup   ?? "",
      creditAmount:  entry?.creditAmount  ?? 0,
      status:        entry?.status        ?? "Draft",
    },
  });

  const debitAccount  = watch("debitAccount");
  const creditAccount = watch("creditAccount");
  const debitAmount   = Number(watch("debitAmount")  ?? 0);
  const creditAmount  = Number(watch("creditAmount") ?? 0);
  const diff          = Math.abs(debitAmount - creditAmount);
  const isBalanced    = debitAmount > 0 && creditAmount > 0 && diff < 0.001;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
              <FileText size={16} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-slate-900 text-base">{entry ? "Edit Journal Entry" : "New Journal Entry"}</h2>
              {entry && <p className="text-xs font-mono text-slate-500 mt-0.5">{entry.voucherNo}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Date <span className="text-red-500">*</span></label>
              <input type="date" {...register("date", { required: "Date is required" })}
                className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${errors.date ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"}`} />
              {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
              <div className="flex gap-2">
                {(["Draft", "Posted"] as const).map((s) => {
                  const isSel = watch("status") === s;
                  return (
                    <label key={s} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border cursor-pointer text-xs font-medium transition-all ${
                      isSel ? (s === "Posted" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-amber-50 border-amber-300 text-amber-700")
                             : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                    }`}>
                      <input type="radio" value={s} className="sr-only" {...register("status")} />
                      {s === "Posted" ? <CheckCircle2 size={12} /> : <FileText size={12} />}
                      {s}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Narration <span className="text-red-500">*</span></label>
            <input {...register("narration", { required: "Narration is required" })}
              placeholder="Brief description of the journal entry…"
              className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${errors.narration ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"}`} />
            {errors.narration && <p className="mt-1 text-xs text-red-600">{errors.narration.message}</p>}
          </div>

          {/* Debit */}
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5 uppercase tracking-wide">
              <TrendingDown size={13} /> Debit (Dr)
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Debit Account <span className="text-red-500">*</span></label>
              <LedgerCombobox ledgers={ledgers} value={debitAccount}
                onChange={(name, group) => { setValue("debitAccount", name); setValue("debitGroup", group); }}
                placeholder="Select debit ledger" hasError={!!errors.debitAccount} />
              <input type="hidden" {...register("debitAccount", { required: "Debit account is required" })} />
              <input type="hidden" {...register("debitGroup")} />
              {errors.debitAccount && <p className="mt-1 text-xs text-red-600">{errors.debitAccount.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Debit Amount <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                <input type="number" min={0.01} step="0.01"
                  {...register("debitAmount", { required: "Amount is required", min: { value: 0.01, message: "Must be > 0" } })}
                  placeholder="0.00"
                  className={`w-full pl-7 pr-3 py-2.5 rounded-lg text-sm outline-none border font-semibold text-red-700 transition-all ${errors.debitAmount ? "border-red-300 bg-red-100" : "border-slate-200 bg-white focus:ring-2 focus:ring-red-100 focus:border-red-400"}`} />
              </div>
              {errors.debitAmount && <p className="mt-1 text-xs text-red-600">{errors.debitAmount.message}</p>}
            </div>
          </div>

          {/* Credit */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5 uppercase tracking-wide">
              <TrendingUp size={13} /> Credit (Cr)
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Credit Account <span className="text-red-500">*</span></label>
              <LedgerCombobox ledgers={ledgers} value={creditAccount}
                onChange={(name, group) => { setValue("creditAccount", name); setValue("creditGroup", group); }}
                placeholder="Select credit ledger" hasError={!!errors.creditAccount} />
              <input type="hidden" {...register("creditAccount", { required: "Credit account is required" })} />
              <input type="hidden" {...register("creditGroup")} />
              {errors.creditAccount && <p className="mt-1 text-xs text-red-600">{errors.creditAccount.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Credit Amount <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                <input type="number" min={0.01} step="0.01"
                  {...register("creditAmount", { required: "Amount is required", min: { value: 0.01, message: "Must be > 0" } })}
                  placeholder="0.00"
                  className={`w-full pl-7 pr-3 py-2.5 rounded-lg text-sm outline-none border font-semibold text-emerald-700 transition-all ${errors.creditAmount ? "border-red-300 bg-red-50" : "border-slate-200 bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400"}`} />
              </div>
              {errors.creditAmount && <p className="mt-1 text-xs text-red-600">{errors.creditAmount.message}</p>}
            </div>
          </div>

          {(debitAmount > 0 || creditAmount > 0) && (
            <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium ${isBalanced ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
              {isBalanced
                ? <><CheckCircle2 size={15} /> Entry is balanced — Debit = Credit = {fmtAmt(debitAmount)}</>
                : <><AlertTriangle size={15} /> Difference: {fmtAmt(diff)} — Debit and Credit must be equal</>}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {entry ? "Save Changes" : "Create Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Excel Table constants ─────────────────────────────────────────────────────
const COL_HEADER = "border border-slate-300 bg-[#d0d7e3] text-slate-700 text-[11px] font-bold uppercase tracking-wide px-2.5 py-2 select-none whitespace-nowrap";
const COL_CELL   = "border border-slate-300 px-2.5 py-1.5 text-[12px] text-slate-700 whitespace-nowrap";
const COL_NUM    = "border border-slate-300 px-2 py-1.5 text-[11px] text-slate-400 text-center select-none whitespace-nowrap bg-[#f0f3f8]";
const CELL_INPUT = "w-full border-2 border-indigo-500 outline-none px-1.5 py-0.5 bg-[#fffde7] text-[12px] rounded-sm font-[inherit]";

type EditCell = { id: string; field: string; value: string };

// ── JournalExcelTable ─────────────────────────────────────────────────────────
function JournalExcelTable({
  rows, onDelete, onOpenModal, onCellSave,
}: {
  rows: JournalEntry[];
  onDelete: (e: JournalEntry) => void;
  onOpenModal: (e: JournalEntry) => void;
  onCellSave: (id: string, patch: Partial<JournalPayload>) => Promise<void>;
}) {
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [saving,   setSaving]   = useState(false);

  const totalDr = rows.reduce((s, r) => s + r.debitAmount,  0);
  const totalCr = rows.reduce((s, r) => s + r.creditAmount, 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.001;

  function startEdit(id: string, field: string, value: string | number) {
    if (saving) return;
    setEditCell({ id, field, value: String(value) });
  }

  async function commitEdit(row: JournalEntry) {
    if (!editCell || editCell.id !== row._id) return;
    const { field, value } = editCell;
    setEditCell(null);

    const orig = rows.find((r) => r._id === row._id);
    if (!orig || String((orig as any)[field] ?? "") === value) return;

    let patch: Partial<JournalPayload> = {};
    if (field === "date")         patch = { date: value };
    else if (field === "narration")    patch = { narration: value };
    else if (field === "debitAmount")  patch = { debitAmount: Math.max(0, Number(value) || 0) };
    else if (field === "creditAmount") patch = { creditAmount: Math.max(0, Number(value) || 0) };
    else if (field === "status")       patch = { status: value as any };

    setSaving(true);
    try {
      await onCellSave(row._id, patch);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, row: JournalEntry) {
    if (e.key === "Enter")  { e.preventDefault(); commitEdit(row); }
    if (e.key === "Escape") { e.preventDefault(); setEditCell(null); }
    if (e.key === "Tab")    { e.preventDefault(); commitEdit(row); }
  }

  function EditableCell({ row, field, value, align = "left", mono = false, inputType = "text", isSelect = false, className = "", children }: {
    row: JournalEntry; field: string; value: string | number;
    align?: "left" | "right"; mono?: boolean; inputType?: "text" | "number" | "date";
    isSelect?: boolean; className?: string; children?: React.ReactNode;
  }) {
    const isEditing = editCell?.id === row._id && editCell?.field === field;

    if (isEditing) {
      if (isSelect) {
        return (
          <td className={`${COL_CELL} ${className} p-0.5`}>
            <select autoFocus value={editCell!.value}
              onChange={(e) => setEditCell({ ...editCell!, value: e.target.value })}
              onBlur={() => commitEdit(row)}
              onKeyDown={(e) => handleKeyDown(e, row)}
              className="w-full border-2 border-indigo-500 outline-none px-1 py-0.5 bg-[#fffde7] text-[12px] rounded-sm">
              <option value="Draft">Draft</option>
              <option value="Posted">Posted</option>
            </select>
          </td>
        );
      }
      return (
        <td className={`${COL_CELL} ${className} p-0.5`}>
          <input autoFocus type={inputType} value={editCell!.value}
            onChange={(e) => setEditCell({ ...editCell!, value: e.target.value })}
            onBlur={() => commitEdit(row)}
            onKeyDown={(e) => handleKeyDown(e, row)}
            className={`${CELL_INPUT} ${mono ? "font-mono" : ""} ${align === "right" ? "text-right" : ""}`}
            step={inputType === "number" ? "0.01" : undefined}
            min={inputType === "number" ? "0" : undefined}
          />
        </td>
      );
    }

    return (
      <td className={`${COL_CELL} ${className} cursor-cell hover:bg-[#fffde7] transition-colors`}
        title="Click to edit" onClick={() => startEdit(row._id, field, value)}>
        {children ?? (
          <span className={`block w-full ${align === "right" ? "text-right" : ""} ${mono ? "font-mono" : ""}`}>
            {String(value)}
          </span>
        )}
      </td>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400 bg-white">
        <FileText size={32} className="opacity-25" />
        <p className="text-sm">No journal entries — add one to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto" style={{ maxHeight: 620 }}>
      <table className="border-collapse w-full text-left" style={{ minWidth: 1100 }}>
        <thead className="sticky top-0 z-10">
          {/* Column letters */}
          <tr>
            {["", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].map((l, i) => (
              <th key={i} className="border border-slate-300 bg-[#bdc5d5] text-slate-500 text-[10px] font-semibold text-center py-0.5 px-1 select-none w-8">{l}</th>
            ))}
          </tr>
          {/* Header */}
          <tr>
            <th className={`${COL_HEADER} text-center w-10`}>#</th>
            <th className={`${COL_HEADER} w-28`}>Voucher No</th>
            <th className={`${COL_HEADER} w-24`}>Date</th>
            <th className={`${COL_HEADER} w-24`}>Status</th>
            <th className={`${COL_HEADER} min-w-[180px]`}>Narration</th>
            <th className={`${COL_HEADER} min-w-[160px]`}>Debit Account</th>
            <th className={`${COL_HEADER} text-right w-32`}>Debit (Dr)</th>
            <th className={`${COL_HEADER} min-w-[160px]`}>Credit Account</th>
            <th className={`${COL_HEADER} text-right w-32`}>Credit (Cr)</th>
            <th className={`${COL_HEADER} text-center w-12`}>
              {saving ? <Loader2 size={11} className="animate-spin inline" /> : "✓"}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isBalancedRow = Math.abs(row.debitAmount - row.creditAmount) < 0.001;
            const isOdd = idx % 2 === 0;
            const rowBg = isOdd ? "bg-white" : "bg-[#f7f8fc]";
            const isRowEditing = editCell?.id === row._id;

            return (
              <tr key={row._id} className={`${isRowEditing ? "bg-[#fffde7]" : rowBg} hover:bg-[#eef2ff] group transition-colors`}>
                <td className={COL_NUM}>{idx + 1}</td>

                {/* Voucher No — click to open modal */}
                <td className={`${COL_CELL} cursor-pointer hover:bg-indigo-50 transition-colors`}
                  title="Click to edit full entry" onClick={() => onOpenModal(row)}>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[11px] font-semibold text-indigo-700">{row.voucherNo}</span>
                    {!isBalancedRow && <span className="text-[9px] text-amber-600 font-medium">Unbalanced</span>}
                  </div>
                </td>

                {/* Date — inline */}
                <EditableCell row={row} field="date" value={row.date} inputType="date" mono>
                  <span className="font-mono text-slate-600 cursor-cell">{row.date ? fmtDate(row.date) : "—"}</span>
                </EditableCell>

                {/* Status — inline select */}
                <EditableCell row={row} field="status" value={row.status} isSelect>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-cell ${
                    row.status === "Posted" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {row.status === "Posted" ? <CheckCircle2 size={9} /> : <FileText size={9} />}
                    {row.status}
                  </span>
                </EditableCell>

                {/* Narration — inline */}
                <EditableCell row={row} field="narration" value={row.narration} className="max-w-[200px]">
                  <span className="block truncate text-slate-800 cursor-cell">{row.narration}</span>
                </EditableCell>

                {/* Debit Account — click to open modal (complex combobox) */}
                <td className={`${COL_CELL} cursor-pointer hover:bg-red-50 transition-colors`}
                  title="Click to change debit account" onClick={() => onOpenModal(row)}>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-800 truncate max-w-[150px] block">{row.debitAccount}</span>
                    {row.debitGroup && <GroupBadge group={row.debitGroup} />}
                  </div>
                </td>

                {/* Debit Amount — inline */}
                <EditableCell row={row} field="debitAmount" value={row.debitAmount} inputType="number" align="right" mono>
                  <span className="text-red-600 font-semibold font-mono text-right block cursor-cell">{fmtAmt(row.debitAmount)}</span>
                </EditableCell>

                {/* Credit Account — click to open modal */}
                <td className={`${COL_CELL} cursor-pointer hover:bg-emerald-50 transition-colors`}
                  title="Click to change credit account" onClick={() => onOpenModal(row)}>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-800 truncate max-w-[150px] block">{row.creditAccount}</span>
                    {row.creditGroup && <GroupBadge group={row.creditGroup} />}
                  </div>
                </td>

                {/* Credit Amount — inline */}
                <EditableCell row={row} field="creditAmount" value={row.creditAmount} inputType="number" align="right" mono>
                  <span className="text-emerald-600 font-semibold font-mono text-right block cursor-cell">{fmtAmt(row.creditAmount)}</span>
                </EditableCell>

                {/* Delete */}
                <td className={`${COL_CELL} text-center`}>
                  <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onDelete(row)} title="Delete"
                      className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}

          {/* Totals row */}
          <tr className={`sticky bottom-0 font-bold ${balanced ? "bg-[#d1fae5]" : "bg-[#fef3c7]"}`}>
            <td className={`${COL_NUM} font-bold text-slate-600`}>Σ</td>
            <td className={`${COL_CELL} font-bold text-slate-700`} colSpan={4}>
              Total ({rows.length} entries)
              {balanced
                ? <span className="ml-2 text-[10px] text-emerald-600 font-semibold">✓ Balanced</span>
                : <span className="ml-2 text-[10px] text-amber-600 font-semibold">⚠ Unbalanced</span>}
            </td>
            <td className={COL_CELL} />
            <td className={`${COL_CELL} text-right font-mono font-bold text-red-700`}>{fmtAmt(totalDr)}</td>
            <td className={COL_CELL} />
            <td className={`${COL_CELL} text-right font-mono font-bold text-emerald-700`}>{fmtAmt(totalCr)}</td>
            <td className={COL_CELL} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function JournalVoucher() {
  const { selectedFY } = useApp();
  const financialYear  = selectedFY?.label ?? "—";

  const [entries,      setEntries]      = useState<JournalEntry[]>([]);
  const [ledgers,      setLedgers]      = useState<Ledger[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Draft" | "Posted">("All");
  const [modal,        setModal]        = useState<{ entry?: JournalEntry } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, l] = await Promise.all([getAllJournalEntries(), getAllLedgers()]);
      setEntries(e);
      setLedgers(l);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [selectedFY?._id]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = useCallback(async (data: JournalPayload) => {
    const dr = Number(data.debitAmount);
    const cr = Number(data.creditAmount);
    if (Math.abs(dr - cr) > 0.001) { toast.error("Debit amount must equal credit amount"); return; }
    setSaving(true);
    try {
      if (modal?.entry) {
        const updated = await updateJournalEntry(modal.entry._id, data);
        setEntries((p) => p.map((e) => e._id === updated._id ? updated : e));
        toast.success(`${updated.voucherNo} updated`);
      } else {
        const created = await createJournalEntry(data);
        setEntries((p) => [created, ...p]);
        toast.success(`${created.voucherNo} created`);
      }
      setModal(null);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }, [modal]);

  const handleDelete = useCallback(async (entry: JournalEntry) => {
    if (!window.confirm(`Delete ${entry.voucherNo}? This cannot be undone.`)) return;
    try {
      await deleteJournalEntry(entry._id);
      setEntries((p) => p.filter((e) => e._id !== entry._id));
      toast.success(`${entry.voucherNo} deleted`);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (err: any) {
      toast.error(err.message);
    }
  }, []);

  const handleCellSave = useCallback(async (id: string, patch: Partial<JournalPayload>) => {
    try {
      const updated = await updateJournalEntry(id, patch);
      setEntries((p) => p.map((e) => e._id === id ? updated : e));
      toast.success("Saved", { duration: 1200, icon: "✓" });
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
      await load();
    }
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => {
      const matchSearch = !q || [e.voucherNo, e.narration, e.debitAccount, e.creditAccount].some((f) => f.toLowerCase().includes(q));
      const matchStatus = statusFilter === "All" || e.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [entries, search, statusFilter]);

  const totals = useMemo(() => {
    const totalDr = filtered.reduce((s, e) => s + e.debitAmount,  0);
    const totalCr = filtered.reduce((s, e) => s + e.creditAmount, 0);
    return { totalDr, totalCr, diff: Math.abs(totalDr - totalCr), balanced: Math.abs(totalDr - totalCr) < 0.001 };
  }, [filtered]);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <FYBanner />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Journal Voucher</h1>
          <p className="text-sm text-slate-500 mt-0.5">{financialYear} · Click any cell to edit inline</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} title="Refresh"
            className="p-2 border border-slate-200 bg-white rounded-lg text-slate-500 hover:bg-slate-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setModal({})}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> Add Entry
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Hash size={18} className="text-slate-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Vouchers</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">{filtered.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
            <TrendingDown size={18} className="text-red-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Debit</p>
            <p className="text-base font-bold text-red-600 mt-0.5">{fmtAmt(totals.totalDr)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={18} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Credit</p>
            <p className="text-base font-bold text-emerald-600 mt-0.5">{fmtAmt(totals.totalCr)}</p>
          </div>
        </div>
        <div className={`rounded-xl p-4 shadow-sm border flex items-start gap-3 ${totals.balanced ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${totals.balanced ? "bg-emerald-100" : "bg-amber-100"}`}>
            <Scale size={18} className={totals.balanced ? "text-emerald-600" : "text-amber-600"} />
          </div>
          <div>
            <p className={`text-xs font-medium ${totals.balanced ? "text-emerald-700" : "text-amber-700"}`}>Balance Status</p>
            <p className={`text-sm font-bold mt-0.5 ${totals.balanced ? "text-emerald-700" : "text-amber-700"}`}>
              {totals.balanced ? "Balanced ✓" : `Diff: ${fmtAmt(totals.diff)}`}
            </p>
          </div>
        </div>
      </div>

      {/* Balance banners */}
      {filtered.length > 0 && (
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${totals.balanced ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          {totals.balanced
            ? <><CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" /><p className="text-sm text-emerald-800">All entries balanced — Total Debit = Total Credit = <strong>{fmtAmt(totals.totalDr)}</strong></p></>
            : <><AlertTriangle size={16} className="text-amber-600 flex-shrink-0" /><p className="text-sm text-amber-800">Total Debit <strong>{fmtAmt(totals.totalDr)}</strong> ≠ Total Credit <strong>{fmtAmt(totals.totalCr)}</strong> — difference of <strong>{fmtAmt(totals.diff)}</strong></p></>}
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 flex-1 min-w-[220px]">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voucher, narration, account…"
            className="bg-transparent text-sm outline-none text-slate-700 placeholder-slate-400 w-full" />
          {search && <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>}
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(["All", "Draft", "Posted"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${statusFilter === s ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {s}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-400 ml-auto">{filtered.length} entries</span>
      </div>

      {/* Excel Table */}
      <div className="rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="bg-[#217346] text-white px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Download size={14} />
            Journal Voucher Register
            <span className="text-green-300 text-xs font-normal ml-2">{financialYear}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-green-200">
            <span>{filtered.length} rows</span>
            <span className="text-green-400">· Click cell to edit</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-slate-400 bg-white">
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-sm">Loading journal entries…</span>
          </div>
        ) : (
          <JournalExcelTable
            rows={filtered}
            onDelete={handleDelete}
            onOpenModal={(entry) => setModal({ entry })}
            onCellSave={handleCellSave}
          />
        )}
      </div>

      {modal !== null && (
        <JournalModal
          entry={modal.entry}
          ledgers={ledgers}
          loading={saving}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
