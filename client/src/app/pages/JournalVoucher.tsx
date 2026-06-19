import {
  useState, useCallback, useMemo, useEffect, useRef,
} from "react";
import { useForm, Controller } from "react-hook-form";
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
import { SmartDateInput } from "../components/ui/SmartDateInput";
import { parseSmartDate, formatToUIDate } from "../utils/dateUtils";
import type { FinancialYear } from "../api/financialYearApi";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtAmt = (n: number) =>
  "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => formatToUIDate(d.slice(0, 10));

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
function LedgerCombobox({ ledgers, value, onChange, placeholder, hasError, compact }: {
  ledgers: Ledger[];
  value: string;
  onChange: (name: string, group: string) => void;
  placeholder?: string;
  hasError?: boolean;
  compact?: boolean;
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
      <div className={compact ? `flex items-center gap-1.5 border border-slate-400 rounded-none px-2 py-0.5 transition-all ${
        open ? "bg-white" :
        hasError ? "border-red-400 bg-red-50" :
        "bg-white"
      }` : `flex items-center gap-2 border rounded-lg px-3 py-2.5 transition-all ${
        open ? "border-indigo-400 ring-2 ring-indigo-100 bg-white" :
        hasError ? "border-red-300 bg-red-50" :
        "border-slate-200 bg-slate-50"
      }`}>
        <Search size={compact ? 11 : 13} className="text-slate-400 flex-shrink-0" />
        <input
          value={open ? query : (selected?.ledgerName ?? "")}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (open) {
                e.stopPropagation();
                setOpen(false);
                setQuery("");
              }
            }
          }}
          placeholder={open ? "Search ledger…" : (placeholder ?? "Select ledger")}
          className={`bg-transparent outline-none text-slate-800 placeholder-slate-400 w-full ${compact ? "text-xs font-sans" : "text-sm"}`}
        />
        {value && !open && (
          <button onMouseDown={(e) => { e.preventDefault(); onChange("", ""); }} className="text-slate-300 hover:text-slate-500">
            <X size={compact ? 10 : 12} />
          </button>
        )}
      </div>
      {selected && !open && !compact && <div className="mt-1"><GroupBadge group={selected.groupName} /></div>}
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

// ── Inline Voucher Entry ────────────────────────────────────────────────────────
interface MiniJVRow {
  type: "Db" | "Cr" | "";
  accountName: string;
  groupName: string;
  amount: string;
}

function InlineVoucherEntry({ ledgers, loading, onSubmit, selectedFY }: {
  ledgers: Ledger[];
  loading: boolean;
  onSubmit: (data: JournalPayload) => Promise<boolean> | boolean | void;
  selectedFY: any;
}) {
  const { register, handleSubmit, watch, control, reset, formState: { errors } } = useForm<JournalPayload>({
    defaultValues: {
      date: selectedFY?.endDate ?? new Date().toISOString().slice(0, 10),
      narration: "",
      status: "Posted",
    },
  });

  const getDefaultRows = (): MiniJVRow[] => [
    { type: "Db", accountName: "", groupName: "", amount: "" },
    { type: "Cr", accountName: "", groupName: "", amount: "" },
    { type: "", accountName: "", groupName: "", amount: "" },
    { type: "", accountName: "", groupName: "", amount: "" },
  ];

  const [rows, setRows] = useState<MiniJVRow[]>(getDefaultRows);
  const [localSaving, setLocalSaving] = useState(false);
  const [search, setSearch] = useState<string[]>(["", "", "", ""]);
  const [dropOpen, setDropOpen] = useState<number | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const resetForm = () => {
    reset({
      date: selectedFY?.endDate ?? new Date().toISOString().slice(0, 10),
      narration: "",
      status: "Posted",
    });
    setRows(getDefaultRows());
    setSearch(["", "", "", ""]);
  };

  const updateRow = (idx: number, patch: Partial<MiniJVRow>) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      if (patch.type === "") next[idx] = { type: "", accountName: "", groupName: "", amount: "" };
      return next;
    });
  };

  const totals = useMemo(() => {
    let db = 0; let cr = 0;
    rows.forEach((r) => {
      if (r.type === "Db") db += Number(r.amount) || 0;
      if (r.type === "Cr") cr += Number(r.amount) || 0;
    });
    return { db, cr, diff: Math.abs(db - cr), balanced: db > 0 && cr > 0 && Math.abs(db - cr) < 0.001 };
  }, [rows]);

  const handleFormSubmit = async (formData: JournalPayload) => {
    const items = rows
      .filter((r) => r.type && r.accountName && Number(r.amount) > 0)
      .map((r) => ({
        type: r.type as "Db" | "Cr",
        accountName: r.accountName,
        groupName: r.groupName,
        amount: Number(r.amount)
      }));

    if (!items.some((it) => it.type === "Db")) { toast.error("At least one Debit leg required"); return; }
    if (!items.some((it) => it.type === "Cr")) { toast.error("At least one Credit leg required"); return; }
    if (!totals.balanced) { toast.error(`Unbalanced: Dr ₹${totals.db.toFixed(2)} ≠ Cr ₹${totals.cr.toFixed(2)}`); return; }

    const incompleteRow = rows.find((r) => r.type && (!r.accountName || !Number(r.amount)));
    if (incompleteRow) { toast.error("Please complete all details for active rows"); return; }

    setLocalSaving(true);
    try {
      const ok = await onSubmit({
        date: formData.date,
        narration: formData.narration || "",
        items,
        status: formData.status || "Posted"
      });
      if (ok !== false) {
        resetForm();
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setLocalSaving(false);
    }
  };

  const getDayOfWeek = (d: string) => {
    try { const dt = new Date(d); if (!isNaN(dt.getTime())) return dt.toLocaleDateString("en-US", { weekday: "short" }); } catch {}
    return "";
  };

  const isSaving = loading || localSaving;

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="bg-[#f0f6ff] border border-indigo-200 rounded-xl mb-6 overflow-hidden shadow-sm font-sans text-xs">
      <div className="bg-indigo-600 px-4 py-2 flex items-center justify-between">
        <span className="text-white font-bold text-xs tracking-wide flex items-center gap-1.5">
          <Plus size={13} /> NEW JOURNAL ENTRY
        </span>
        <button type="button" onClick={resetForm} className="text-indigo-200 hover:text-white text-[11px] font-semibold underline">
          Clear Form
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Top row: Date / Status / Narration */}
        <div className="flex flex-wrap items-center gap-4 bg-[#f8fafc] p-3 rounded-lg border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-semibold w-8">Date</span>
            <div className="w-32">
              <Controller
                name="date" control={control}
                rules={{ validate: (v) => parseSmartDate(v, selectedFY).error ?? true }}
                render={({ field }) => (
                  <SmartDateInput value={field.value ?? ""} onChange={field.onChange} selectedFY={selectedFY} hasError={!!errors.date} className="!py-1 !px-2 !text-xs !w-full" />
                )}
              />
            </div>
            <span className="text-indigo-600 font-semibold w-8">{getDayOfWeek(watch("date"))}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-semibold">Status</span>
            <select {...register("status")} className="border border-slate-300 rounded-md px-2 py-1 text-xs outline-none bg-white">
              <option value="Posted">Posted</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
          <div className="flex items-center gap-2 flex-grow min-w-[200px]">
            <span className="text-slate-600 font-semibold">Narration</span>
            <input {...register("narration")} type="text" placeholder="Entry narration..." className="flex-grow border border-slate-300 rounded-md px-2 py-1 text-xs outline-none bg-white focus:border-indigo-400" />
          </div>
        </div>

        {/* Entry rows */}
        <div ref={dropRef} className="relative">
          <table className="w-full text-xs border-collapse border border-slate-200">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                <th className="border border-slate-200 px-3 py-2 text-center w-20">Cr/Db</th>
                <th className="border border-slate-200 px-3 py-2 text-left">Account Name</th>
                <th className="border border-slate-200 px-3 py-2 text-right w-40">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isDb = row.type === "Db"; const isCr = row.type === "Cr";
                const filteredLedgers = ledgers.filter((l) =>
                  (!search[idx] || l.ledgerName.toLowerCase().includes(search[idx].toLowerCase())) &&
                  !rows.filter((_, ri) => ri !== idx).some((r) => r.accountName.toLowerCase() === l.ledgerName.toLowerCase())
                );
                return (
                  <tr key={idx} className={`border-b border-slate-200 ${row.type ? "" : "opacity-60"}`}>
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <select
                        value={row.type}
                        onChange={(e) => updateRow(idx, { type: e.target.value as any })}
                        className={`w-full bg-transparent border-0 outline-none text-center font-bold cursor-pointer ${
                          isDb ? "text-indigo-700" : isCr ? "text-emerald-700" : "text-slate-400"
                        }`}
                      >
                        <option value="">—</option>
                        <option value="Db">Db</option>
                        <option value="Cr">Cr</option>
                      </select>
                    </td>
                    <td className="border border-slate-200 px-1 py-1 relative">
                      {row.type ? (
                        <div className="relative">
                          <input
                            type="text"
                            value={dropOpen === idx ? search[idx] : row.accountName}
                            onFocus={() => { setDropOpen(idx); setSearch((s) => { const n=[...s]; n[idx]=row.accountName; return n; }); }}
                            onChange={(e) => setSearch((s) => { const n=[...s]; n[idx]=e.target.value; return n; })}
                            onBlur={() => setTimeout(() => setDropOpen(null), 150)}
                            placeholder={isDb ? "Select Debit Account" : "Select Credit Account"}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs outline-none bg-white focus:border-indigo-400"
                          />
                          {dropOpen === idx && filteredLedgers.length > 0 && (
                            <div className="absolute left-0 top-full z-50 bg-white border border-slate-200 rounded-lg shadow-xl max-h-40 overflow-y-auto w-full min-w-[200px]">
                              {filteredLedgers.slice(0, 20).map((l) => (
                                <button
                                  key={l._id}
                                  type="button"
                                  onMouseDown={() => {
                                    updateRow(idx, { accountName: l.ledgerName, groupName: l.groupName });
                                    setSearch((s) => { const n=[...s]; n[idx]=l.ledgerName; return n; });
                                    setDropOpen(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 text-slate-700"
                                >
                                  <span className="font-medium">{l.ledgerName}</span>
                                  <span className="ml-2 text-slate-400 text-[10px]">{l.groupName}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : <div className="h-6 px-2 text-slate-300 text-[11px] italic flex items-center">Select Cr/Db first</div>}
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      {row.type ? (
                        <input
                          type="number" min={0} step="0.01"
                          value={row.amount}
                          onChange={(e) => updateRow(idx, { amount: e.target.value })}
                          placeholder="0.00"
                          className={`w-full border-0 outline-none text-right px-2 py-1 font-mono font-semibold bg-transparent ${
                            isDb ? "text-indigo-700" : isCr ? "text-emerald-700" : ""
                          }`}
                        />
                      ) : <div className="h-6" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals + Save */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-4 font-mono text-xs">
            <span className="text-indigo-800">Dr: <strong>₹{totals.db.toFixed(2)}</strong></span>
            <span className="text-emerald-800">Cr: <strong>₹{totals.cr.toFixed(2)}</strong></span>
            {!totals.balanced && totals.db > 0 && totals.cr > 0 && (
              <span className="text-amber-600 font-sans bg-amber-100 px-2 py-0.5 rounded text-[11px] font-bold">
                Diff: ₹{totals.diff.toFixed(2)}
              </span>
            )}
            {totals.balanced && (
              <span className="text-emerald-600 font-sans bg-emerald-100 px-2 py-0.5 rounded text-[11px] font-bold">
                ✓ Balanced
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer"
          >
            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            SAVE VOUCHER
          </button>
        </div>
      </div>
    </form>
  );
}

// ── Journal Modal ─────────────────────────────────────────────────────────────
interface RowState {
  type: "Db" | "Cr" | "";
  accountName: string;
  groupName: string;
  debit: string;
  credit: string;
}

function JournalModal({ entry, ledgers, loading, onClose, onSubmit, selectedFY }: {
  entry?: JournalEntry;
  ledgers: Ledger[];
  loading: boolean;
  onClose: () => void;
  onSubmit: (data: JournalPayload) => Promise<boolean> | boolean | void;
  selectedFY: FinancialYear | null;
}) {
  const { register, handleSubmit, watch, setValue, control, reset, formState: { errors } } = useForm<JournalPayload>({
    defaultValues: {
      date:          entry?.date          ?? selectedFY?.endDate ?? new Date().toISOString().slice(0, 10),
      narration:     entry?.narration     ?? "",
      status:        entry?.status        ?? "Posted",
    },
  });

  const narrationRef = useRef<HTMLTextAreaElement | null>(null);
  const { ref: narrationRegisterRef, ...narrationRegister } = register("narration");

  const getDefaultRows = useCallback((): RowState[] => {
    const defaultRows: RowState[] = Array.from({ length: 12 }, () => ({
      type: "",
      accountName: "",
      groupName: "",
      debit: "",
      credit: ""
    }));
    defaultRows[0] = { type: "Db", accountName: "", groupName: "", debit: "", credit: "" };
    defaultRows[1] = { type: "Cr", accountName: "", groupName: "", debit: "", credit: "" };
    return defaultRows;
  }, []);

  const initialRows = useMemo(() => {
    const defaultRows = getDefaultRows();

    if (entry) {
      const entryItems = entry.items && entry.items.length > 0 ? entry.items : [
        { type: "Db", accountName: entry.debitAccount, groupName: entry.debitGroup, amount: entry.debitAmount },
        { type: "Cr", accountName: entry.creditAccount, groupName: entry.creditGroup, amount: entry.creditAmount }
      ];

      entryItems.forEach((item, idx) => {
        if (idx < 12) {
          defaultRows[idx] = {
            type: item.type as "Db" | "Cr" | "",
            accountName: item.accountName,
            groupName: item.groupName,
            debit: item.type === "Db" ? String(item.amount) : "",
            credit: item.type === "Cr" ? String(item.amount) : ""
          };
        }
      });
    }
    return defaultRows;
  }, [entry, getDefaultRows]);

  const [gridRows, setGridRows] = useState<RowState[]>(initialRows);

  useEffect(() => {
    setGridRows(initialRows);
  }, [initialRows]);

  const updateRow = (idx: number, patch: Partial<RowState>) => {
    setGridRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      if (patch.type === "") {
        next[idx].accountName = "";
        next[idx].groupName = "";
        next[idx].debit = "";
        next[idx].credit = "";
      }
      return next;
    });
  };

  const totals = useMemo(() => {
    let debitSum = 0;
    let creditSum = 0;
    gridRows.forEach((r) => {
      if (r.type === "Db") debitSum += Number(r.debit) || 0;
      if (r.type === "Cr") creditSum += Number(r.credit) || 0;
    });
    const diff = Math.abs(debitSum - creditSum);
    const isBalanced = debitSum > 0 && creditSum > 0 && diff < 0.001;
    return { debitSum, creditSum, diff, isBalanced };
  }, [gridRows]);

  const handleFormSubmit = async (formData: JournalPayload) => {
    const activeItems = gridRows
      .filter((r) => r.type && r.accountName)
      .map((r) => ({
        type: r.type as "Db" | "Cr",
        accountName: r.accountName,
        groupName: r.groupName,
        amount: r.type === "Db" ? Number(r.debit || 0) : Number(r.credit || 0)
      }));

    const hasDb = activeItems.some((it) => it.type === "Db" && it.amount > 0);
    const hasCr = activeItems.some((it) => it.type === "Cr" && it.amount > 0);
    if (!hasDb || !hasCr) {
      toast.error("Please add at least one Debit and one Credit transaction leg");
      return;
    }

    if (Math.abs(totals.debitSum - totals.creditSum) > 0.001) {
      toast.error(`Unbalanced: Total Debit (${totals.debitSum.toFixed(2)}) must equal Total Credit (${totals.creditSum.toFixed(2)})`);
      return;
    }

    const incompleteRow = gridRows.find(
      (r) => r.type && (!r.accountName || (r.type === "Db" && !Number(r.debit)) || (r.type === "Cr" && !Number(r.credit)))
    );
    if (incompleteRow) {
      toast.error("Please complete all details (Account Name and Amount) for active rows");
      return;
    }

    const payload: JournalPayload = {
      date: formData.date,
      narration: formData.narration || "",
      items: activeItems,
      status: formData.status || "Draft"
    };

    const success = await onSubmit(payload);
    if (success && !entry) {
      reset({
        date: watch("date") ?? selectedFY?.endDate ?? new Date().toISOString().slice(0, 10),
        narration: "",
        status: watch("status") || "Draft",
      });
      setGridRows(getDefaultRows());
      setTimeout(() => {
        narrationRef.current?.focus();
      }, 0);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const getDayName = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString("en-US", { weekday: "short" });
        }
      }
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { weekday: "short" });
      }
    } catch {}
    return "";
  };

  const dbBalanceText = totals.debitSum > 0 ? `${totals.debitSum.toFixed(2)} DB` : "—";
  const crBalanceText = totals.creditSum > 0 ? `${totals.creditSum.toFixed(2)} CR` : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-xs" onClick={onClose} />
      
      <div className="relative bg-[#eaf2f9] border border-slate-400 w-full max-w-5xl overflow-hidden max-h-[96vh] flex flex-col font-sans text-xs select-none shadow-2xl">
        <div className="bg-[#b0d2ec] px-4 py-1.5 border-b border-slate-400 flex items-center justify-between">
          <span className="font-bold text-slate-800 text-[11px] tracking-wide">
            Transaction -{">"} Journal Entry -{">"} Add Journal
          </span>
          <button
            type="button"
            onClick={onClose}
            className="bg-[#f08c5a] text-white hover:bg-red-600 px-2 py-0.5 border border-red-700 text-[10px] font-bold cursor-pointer rounded-xs flex items-center justify-center transition-colors"
            title="Close (ESC)"
          >
            X
          </button>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex-grow flex flex-col overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1.5 p-4 border-b border-slate-300 bg-[#eaf2f9] text-[11px]">
            <div className="space-y-1.5 max-w-sm">
              <div className="flex items-center">
                <span className="w-20 text-slate-700 font-semibold">Vou. Type</span>
                <input
                  type="text"
                  value="Journal"
                  disabled
                  className="w-44 bg-[#e1edf7] border border-slate-400 px-2 py-0.5 text-slate-700 outline-none text-xs"
                />
              </div>
              <div className="flex items-center">
                <span className="w-20 text-slate-700 font-semibold">Tax Type</span>
                <select
                  disabled
                  className="w-44 bg-white border border-slate-400 px-1 py-0.5 text-slate-800 outline-none text-xs cursor-not-allowed"
                >
                  <option>None</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5 max-w-sm ml-auto w-full">
              <div className="flex items-center justify-between">
                <span className="text-slate-700 font-semibold">Vou Date</span>
                <div className="flex items-center gap-2 w-44">
                  <div className="flex-grow">
                    <Controller
                      name="date"
                      control={control}
                      rules={{
                        required: "Date is required",
                        validate: (v) => {
                          const { error } = parseSmartDate(v, selectedFY);
                          return error ?? true;
                        },
                      }}
                      render={({ field }) => (
                        <SmartDateInput
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          selectedFY={selectedFY}
                          hasError={!!errors.date}
                          className="!py-0.5 !px-1.5 !text-xs !border-slate-400 !rounded-none !bg-white !w-full"
                        />
                      )}
                    />
                  </div>
                  <span className="text-slate-600 font-semibold w-10 shrink-0 text-left">
                    {getDayName(watch("date"))}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-700 font-semibold">Vou No</span>
                <input
                  type="text"
                  disabled
                  value={entry?.voucherNo ?? "(Auto)"}
                  className="w-44 bg-[#e1edf7] border border-slate-400 px-2 py-0.5 text-slate-600 outline-none text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex-grow bg-white border-b border-slate-400 overflow-y-auto px-4 py-3">
            <table className="w-full border-collapse border border-slate-400 text-xs">
              <thead>
                <tr className="bg-[#cfe3f5] font-bold border-b border-slate-400 text-slate-800">
                  <th className="border border-slate-400 px-3 py-1.5 text-center w-16">Cr/Db</th>
                  <th className="border border-slate-400 px-3 py-1.5 text-left">Account Name</th>
                  <th className="border border-slate-400 px-3 py-1.5 text-right w-36">Debit</th>
                  <th className="border border-slate-400 px-3 py-1.5 text-right w-36">Credit</th>
                </tr>
              </thead>
              <tbody>
                {gridRows.map((row, idx) => {
                  const isDb = row.type === "Db";
                  const isCr = row.type === "Cr";
                  
                  const availableLedgers = ledgers.filter((l) => {
                    const otherSelected = gridRows
                      .filter((_, rIdx) => rIdx !== idx)
                      .map((r) => r.accountName.toLowerCase());
                    return !otherSelected.includes(l.ledgerName.toLowerCase());
                  });

                  return (
                    <tr key={idx} className="hover:bg-slate-50 border-b border-slate-300 h-8">
                      <td className="border border-slate-400 p-0.5 text-center w-16">
                        <select
                          value={row.type}
                          onChange={(e) => {
                            const newType = e.target.value as "Db" | "Cr" | "";
                            updateRow(idx, { type: newType, debit: "", credit: "" });
                          }}
                          className={`w-full bg-transparent border-0 outline-none text-center font-bold text-xs cursor-pointer ${
                            isDb ? "text-indigo-700" : isCr ? "text-emerald-700" : "text-slate-400"
                          }`}
                        >
                          <option value="">—</option>
                          <option value="Db">Db</option>
                          <option value="Cr">Cr</option>
                        </select>
                      </td>
                      <td className="border border-slate-400 p-0.5">
                        {row.type ? (
                          <LedgerCombobox
                            ledgers={availableLedgers}
                            value={row.accountName}
                            onChange={(name, group) => {
                              updateRow(idx, { accountName: name, groupName: group });
                            }}
                            placeholder={isDb ? "Select Debit Ledger" : "Select Credit Ledger"}
                            compact
                          />
                        ) : (
                          <div className="h-full w-full bg-slate-50 select-none" />
                        )}
                      </td>
                      <td className="border border-slate-400 p-0.5 w-36">
                        {isDb ? (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.debit}
                            onChange={(e) => updateRow(idx, { debit: e.target.value })}
                            placeholder="0.00"
                            className="w-full border-0 outline-none text-right px-2 py-1 font-mono font-semibold text-red-700 bg-white"
                          />
                        ) : (
                          <span className="block w-full text-right px-3 py-1 text-slate-400 bg-slate-50 select-none">NIL</span>
                        )}
                      </td>
                      <td className="border border-slate-400 p-0.5 w-36">
                        {isCr ? (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.credit}
                            onChange={(e) => updateRow(idx, { credit: e.target.value })}
                            placeholder="0.00"
                            className="w-full border-0 outline-none text-right px-2 py-1 font-mono font-semibold text-emerald-700 bg-white"
                          />
                        ) : (
                          <span className="block w-full text-right px-3 py-1 text-slate-400 bg-slate-50 select-none">NIL</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-[#eaf2f9] border-b border-slate-400 flex items-center py-2 px-4 select-none">
            <span className="font-bold text-slate-700 text-right flex-1 pr-6 uppercase tracking-wider">Total</span>
            <div className="w-36 text-right pr-6 font-mono font-bold text-red-700">{totals.debitSum > 0 ? totals.debitSum.toFixed(2) : "0.00"}</div>
            <div className="w-36 text-right pr-6 font-mono font-bold text-emerald-700">{totals.creditSum > 0 ? totals.creditSum.toFixed(2) : "0.00"}</div>
          </div>

          <div className="bg-[#eaf2f9] p-4 flex flex-col md:flex-row items-stretch justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-4 text-[10px] text-slate-600 font-semibold select-none uppercase tracking-wide">
                <div>Db Balance: <span className="text-slate-800 font-mono">{dbBalanceText}</span></div>
                <div>Cr Balance: <span className="text-slate-800 font-mono">{crBalanceText}</span></div>
              </div>
              <div className="flex flex-col">
                <span className="text-slate-700 font-semibold mb-1 text-[11px]">Narration</span>
                <textarea
                  {...narrationRegister}
                  ref={(e) => {
                    narrationRegisterRef(e);
                    if (e) narrationRef.current = e as any;
                  }}
                  className="bg-white border border-slate-400 text-slate-800 text-xs px-2 py-1 outline-none w-[380px] h-14 resize-none"
                />
              </div>
            </div>
            <div className="flex items-end justify-end gap-2.5">
              <button type="submit" disabled={loading} className="bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-800 border border-slate-400 px-8 py-1 text-xs font-semibold shadow-xs cursor-pointer min-w-[80px]">
                {loading ? "Saving..." : "OK"}
              </button>
            </div>
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

const getRowSums = (row: JournalEntry) => {
  if (row.items && row.items.length > 0) {
    let dr = 0;
    let cr = 0;
    row.items.forEach((it) => {
      if (it.type === "Db") dr += it.amount;
      else if (it.type === "Cr") cr += it.amount;
    });
    return { dr, cr };
  }
  return { dr: row.debitAmount || 0, cr: row.creditAmount || 0 };
};

type EditCell = { id: string; field: string; value: string };

// ── JournalExcelTable ─────────────────────────────────────────────────────────
function JournalExcelTable({
  rows, onDelete, onOpenModal, onCellSave, selectedFY,
}: {
  rows: JournalEntry[];
  onDelete: (e: JournalEntry) => void;
  onOpenModal: (e: JournalEntry) => void;
  onCellSave: (id: string, patch: Partial<JournalPayload>) => Promise<void>;
  selectedFY: FinancialYear | null;
}) {
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [saving,   setSaving]   = useState(false);

  const totalDr = rows.reduce((s, r) => s + getRowSums(r).dr,  0);
  const totalCr = rows.reduce((s, r) => s + getRowSums(r).cr, 0);
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
    if (!orig) return;

    let patch: Partial<JournalPayload> = {};
    if (field === "date") {
      const { date: parsed, error } = parseSmartDate(value, selectedFY);
      if (error || !parsed) {
        toast.error(error ?? "Invalid date");
        return;
      }
      if (parsed === orig.date) return; // no change
      patch = { date: parsed };
    } else if (field === "narration") {
      if (value === orig.narration) return;
      patch = { narration: value };
    } else if (field === "debitAmount") {
      const num = Math.max(0, Number(value) || 0);
      if (num === orig.debitAmount) return;
      patch = { debitAmount: num };
    } else if (field === "creditAmount") {
      const num = Math.max(0, Number(value) || 0);
      if (num === orig.creditAmount) return;
      patch = { creditAmount: num };
    } else if (field === "status") {
      if (value === orig.status) return;
      patch = { status: value as any };
    }

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
            const { dr: debitAmt, cr: creditAmt } = getRowSums(row);
            const isBalancedRow = Math.abs(debitAmt - creditAmt) < 0.001;
            const isOdd = idx % 2 === 0;
            const rowBg = isOdd ? "bg-white" : "bg-[#f7f8fc]";
            const isRowEditing = editCell?.id === row._id;

            const isMultiLeg = row.items && row.items.length > 2;

            const debitAccounts = isMultiLeg 
              ? row.items!.filter((it) => it.type === "Db").map((it) => it.accountName).join(", ")
              : row.debitAccount;
            
            const creditAccounts = isMultiLeg 
              ? row.items!.filter((it) => it.type === "Cr").map((it) => it.accountName).join(", ")
              : row.creditAccount;

            const debitGroups = isMultiLeg
              ? Array.from(new Set(row.items!.filter((it) => it.type === "Db" && it.groupName).map((it) => it.groupName)))
              : [row.debitGroup].filter(Boolean);

            const creditGroups = isMultiLeg
              ? Array.from(new Set(row.items!.filter((it) => it.type === "Cr" && it.groupName).map((it) => it.groupName)))
              : [row.creditGroup].filter(Boolean);

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
                <EditableCell row={row} field="date" value={row.date ? formatToUIDate(row.date) : ""} inputType="text" mono>
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
                  title={isMultiLeg ? "Multi-leg: Click to edit full entry" : "Click to change debit account"} 
                  onClick={() => onOpenModal(row)}>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-800 truncate max-w-[150px] block" title={debitAccounts}>
                      {debitAccounts}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {debitGroups.map((dg) => (
                        <GroupBadge key={dg} group={dg} />
                      ))}
                    </div>
                  </div>
                </td>

                {/* Debit Amount */}
                {isMultiLeg ? (
                  <td className={`${COL_CELL} text-right font-mono font-semibold text-red-600 cursor-pointer hover:bg-red-50`}
                    title="Multi-leg entry: Click to edit in modal" onClick={() => onOpenModal(row)}>
                    {fmtAmt(debitAmt)}
                  </td>
                ) : (
                  <EditableCell row={row} field="debitAmount" value={debitAmt} inputType="number" align="right" mono>
                    <span className="text-red-600 font-semibold font-mono text-right block cursor-cell">{fmtAmt(debitAmt)}</span>
                  </EditableCell>
                )}

                {/* Credit Account — click to open modal */}
                <td className={`${COL_CELL} cursor-pointer hover:bg-emerald-50 transition-colors`}
                  title={isMultiLeg ? "Multi-leg: Click to edit full entry" : "Click to change credit account"} 
                  onClick={() => onOpenModal(row)}>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-800 truncate max-w-[150px] block" title={creditAccounts}>
                      {creditAccounts}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {creditGroups.map((cg) => (
                        <GroupBadge key={cg} group={cg} />
                      ))}
                    </div>
                  </div>
                </td>

                {/* Credit Amount */}
                {isMultiLeg ? (
                  <td className={`${COL_CELL} text-right font-mono font-semibold text-emerald-600 cursor-pointer hover:bg-emerald-50`}
                    title="Multi-leg entry: Click to edit in modal" onClick={() => onOpenModal(row)}>
                    {fmtAmt(creditAmt)}
                  </td>
                ) : (
                  <EditableCell row={row} field="creditAmount" value={creditAmt} inputType="number" align="right" mono>
                    <span className="text-emerald-600 font-semibold font-mono text-right block cursor-cell">{fmtAmt(creditAmt)}</span>
                  </EditableCell>
                )}

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

  const handleSubmit = useCallback(async (data: JournalPayload): Promise<boolean> => {
    if (data.items && data.items.length > 0) {
      let dr = 0;
      let cr = 0;
      data.items.forEach((it) => {
        if (it.type === "Db") dr += it.amount;
        else if (it.type === "Cr") cr += it.amount;
      });
      if (Math.abs(dr - cr) > 0.001) {
        toast.error(`Unbalanced: Total Debit (${dr.toFixed(2)}) must equal Total Credit (${cr.toFixed(2)})`);
        return false;
      }
    } else {
      const dr = Number(data.debitAmount);
      const cr = Number(data.creditAmount);
      if (Math.abs(dr - cr) > 0.001) { toast.error("Debit amount must equal credit amount"); return false; }
      if (data.debitAccount && data.creditAccount && data.debitAccount.trim().toLowerCase() === data.creditAccount.trim().toLowerCase()) {
        toast.error("Debit and Credit accounts must be different");
        return false;
      }
    }
    setSaving(true);
    try {
      if (modal?.entry) {
        const updated = await updateJournalEntry(modal.entry._id, data);
        setEntries((p) => p.map((e) => e._id === updated._id ? updated : e));
        toast.success(`${updated.voucherNo} updated`);
        setModal(null);
      } else {
        const created = await createJournalEntry(data);
        setEntries((p) => [created, ...p]);
        toast.success(`${created.voucherNo} created`);
      }
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
      return true;
    } catch (err: any) {
      toast.error(err.message);
      return false;
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
      const updated = await updateJournalEntry(id, patch as JournalPayload);
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
      const matchSearch = !q || [
        e.voucherNo,
        e.narration,
        e.debitAccount,
        e.creditAccount,
        ...(e.items ? e.items.map((it) => it.accountName) : [])
      ].some((f) => f && f.toLowerCase().includes(q));
      const matchStatus = statusFilter === "All" || e.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [entries, search, statusFilter]);

  const totals = useMemo(() => {
    const totalDr = filtered.reduce((s, e) => {
      if (e.items && e.items.length > 0) {
        return s + e.items.filter((it) => it.type === "Db").reduce((sum, it) => sum + it.amount, 0);
      }
      return s + (e.debitAmount || 0);
    }, 0);
    const totalCr = filtered.reduce((s, e) => {
      if (e.items && e.items.length > 0) {
        return s + e.items.filter((it) => it.type === "Cr").reduce((sum, it) => sum + it.amount, 0);
      }
      return s + (e.creditAmount || 0);
    }, 0);
    return { totalDr, totalCr, diff: Math.abs(totalDr - totalCr), balanced: Math.abs(totalDr - totalCr) < 0.001 };
  }, [filtered]);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <FYBanner />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <div>
          <h1 className="text-slate-900">Journal Voucher</h1>
          <p className="text-sm text-slate-500 mt-0.5">{financialYear} · Click any cell to edit inline or use the form below</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} title="Refresh"
            className="p-2 border border-slate-200 bg-white rounded-lg text-slate-500 hover:bg-slate-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
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
            selectedFY={selectedFY}
          />
        )}
      </div>

      <InlineVoucherEntry ledgers={ledgers} loading={saving} onSubmit={handleSubmit} selectedFY={selectedFY} />

      {modal !== null && (
        <JournalModal
          entry={modal.entry}
          ledgers={ledgers}
          loading={saving}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
          selectedFY={selectedFY}
        />
      )}
    </div>
  );
}
