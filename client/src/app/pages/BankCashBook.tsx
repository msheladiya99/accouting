import {
  useState, useCallback, useMemo, useEffect, useRef,
} from "react";
import { useForm } from "react-hook-form";
import {
  Plus, Search, RefreshCw, Pencil, Trash2, X, Save,
  Landmark, Wallet, TrendingDown, TrendingUp, DollarSign,
  CreditCard, Loader2, Filter, Download, Check, Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import { useApp } from "../context/AppContext";
import { FYBanner } from "../components/FYBanner";
import {
  getAllAccounts, getEntriesForAccount, getAllEntries,
  createEntry, updateEntry, deleteEntry,
  CONTRA_GROUPS,
  type BankCashAccount, type BankCashRow, type EntryPayload, type AccountGroup,
} from "../api/bankCashBookApi";
import BankImport from "./BankImport";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtFull = (n: number) =>
  "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GROUP_COLORS: Record<AccountGroup, { bg: string; text: string; icon: React.ElementType; dot: string; badge: string }> = {
  Bank: { bg: "bg-blue-50",  text: "text-blue-700",  icon: Landmark, dot: "bg-blue-500",  badge: "bg-blue-100 text-blue-700"  },
  Cash: { bg: "bg-amber-50", text: "text-amber-700", icon: Wallet,   dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700" },
};

// ── Entry Modal ───────────────────────────────────────────────────────────────
function EntryModal({
  accounts, entry, loading, onClose, onSubmit,
}: {
  accounts: BankCashAccount[];
  entry?: BankCashRow;
  loading: boolean;
  onClose: () => void;
  onSubmit: (data: EntryPayload) => void;
}) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<EntryPayload>({
    defaultValues: {
      accountId:          entry?.accountId          ?? accounts[0]?._id ?? "",
      date:               entry?.date               ?? new Date().toISOString().slice(0, 10),
      particulars:        entry?.particulars         ?? "",
      withdrawal:         entry?.withdrawal          ?? 0,
      deposit:            entry?.deposit             ?? 0,
      contraAccountName:  entry?.contraAccountName   ?? "",
      contraAccountGroup: entry?.contraAccountGroup  ?? "Expense",
    },
  });

  const selectedAccountId = watch("accountId");
  const selectedAccount   = accounts.find((a) => a._id === selectedAccountId);
  const withdrawal        = Number(watch("withdrawal") ?? 0);
  const deposit           = Number(watch("deposit")    ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
              <CreditCard size={16} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-slate-900 text-base">{entry ? "Edit Entry" : "Add New Entry"}</h2>
              {entry && <p className="text-xs text-slate-500 mt-0.5">ID: {entry._id}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Bank / Cash Account <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {accounts.map((acc) => {
                const m = GROUP_COLORS[acc.group];
                const Icon = m.icon;
                const isSelected = selectedAccountId === acc._id;
                return (
                  <label
                    key={acc._id}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-all text-sm
                      ${isSelected ? `${m.bg} border-2 ${m.text} font-medium` : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                  >
                    <input type="radio" value={acc._id} className="sr-only" {...register("accountId", { required: true })} />
                    <Icon size={14} className="flex-shrink-0" />
                    <span className="truncate text-xs">{acc.name}</span>
                  </label>
                );
              })}
            </div>
            {selectedAccount && (
              <p className="mt-1.5 text-xs text-slate-500">
                Opening Balance: <span className="font-semibold text-slate-700">{fmtFull(selectedAccount.openingBalance)}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Date <span className="text-red-500">*</span></label>
              <input type="date" {...register("date", { required: "Date is required" })}
                className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${errors.date ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"}`} />
              {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Account Group <span className="text-red-500">*</span></label>
              <select {...register("contraAccountGroup", { required: true })}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400">
                {CONTRA_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Particulars / Narration <span className="text-red-500">*</span></label>
            <textarea rows={2} {...register("particulars", { required: "Narration is required", minLength: { value: 3, message: "Too short" } })}
              placeholder="Describe the transaction…"
              className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all resize-none ${errors.particulars ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"}`} />
            {errors.particulars && <p className="mt-1 text-xs text-red-600">{errors.particulars.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Account Name (Contra) <span className="text-red-500">*</span></label>
            <input {...register("contraAccountName", { required: "Account name is required" })}
              placeholder="e.g. ABC Corp Ltd., Salary Expense…"
              className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${errors.contraAccountName ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"}`} />
            {errors.contraAccountName && <p className="mt-1 text-xs text-red-600">{errors.contraAccountName.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                <TrendingDown size={13} className="text-red-500" /> Withdrawal (Dr)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                <input type="number" min={0} step="0.01"
                  {...register("withdrawal", { min: { value: 0, message: "Cannot be negative" }, validate: (v) => Number(v) > 0 && Number(watch("deposit")) > 0 ? "Enter either withdrawal or deposit, not both" : true })}
                  placeholder="0.00"
                  className={`w-full pl-7 pr-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${errors.withdrawal ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 focus:ring-2 focus:ring-red-100 focus:border-red-400"}`} />
              </div>
              {errors.withdrawal && <p className="mt-1 text-xs text-red-600">{errors.withdrawal.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                <TrendingUp size={13} className="text-emerald-600" /> Deposit (Cr)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                <input type="number" min={0} step="0.01"
                  {...register("deposit", { min: { value: 0, message: "Cannot be negative" }, validate: (v) => Number(v) > 0 && Number(watch("withdrawal")) > 0 ? "Enter either withdrawal or deposit, not both" : true })}
                  placeholder="0.00"
                  className={`w-full pl-7 pr-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${errors.deposit ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400"}`} />
              </div>
              {errors.deposit && <p className="mt-1 text-xs text-red-600">{errors.deposit.message}</p>}
            </div>
          </div>

          {(withdrawal > 0 || deposit > 0) && !(withdrawal > 0 && deposit > 0) && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${deposit > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {deposit > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {deposit > 0 ? "Deposit" : "Withdrawal"}: <strong>{fmtFull(deposit > 0 ? deposit : withdrawal)}</strong>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {entry ? "Save Changes" : "Add Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Excel Cell Input styles ───────────────────────────────────────────────────
const COL_HEADER = "border border-slate-300 bg-[#d0d7e3] text-slate-700 text-[11px] font-bold uppercase tracking-wide px-2.5 py-2 select-none whitespace-nowrap";
const COL_CELL   = "border border-slate-300 px-2.5 py-1.5 text-[12px] text-slate-700 whitespace-nowrap";
const COL_NUM    = "border border-slate-300 px-2 py-1.5 text-[11px] text-slate-400 text-center select-none whitespace-nowrap bg-[#f0f3f8]";
const CELL_INPUT = "w-full border-2 border-indigo-500 outline-none px-1.5 py-0.5 bg-[#fffde7] text-[12px] rounded-sm font-[inherit]";
const CELL_SELECT = "w-full border-2 border-indigo-500 outline-none px-1 py-0.5 bg-[#fffde7] text-[12px] rounded-sm";

type EditCell = { id: string; field: string; value: string };

// ── Excel-style Table ─────────────────────────────────────────────────────────
function ExcelTable({
  rows, openingBalance, onDelete, onCellSave,
}: {
  rows: BankCashRow[];
  openingBalance: number;
  onDelete: (r: BankCashRow) => void;
  onCellSave: (id: string, patch: Partial<EntryPayload>) => Promise<void>;
}) {
  const [editCell, setEditCell]   = useState<EditCell | null>(null);
  const [saving,   setSaving]     = useState(false);
  const commitRef = useRef<(() => void) | null>(null);

  const totalWithdrawal = rows.reduce((s, r) => s + r.withdrawal, 0);
  const totalDeposit    = rows.reduce((s, r) => s + r.deposit, 0);
  const closingBalance  = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance;

  function startEdit(id: string, field: string, value: string | number) {
    if (saving) return;
    setEditCell({ id, field, value: String(value) });
  }

  async function commitEdit(row: BankCashRow) {
    if (!editCell || editCell.id !== row._id) return;
    const { field, value } = editCell;
    setEditCell(null);

    let patch: Partial<EntryPayload> = {};
    if (field === "date")               patch = { date: value };
    else if (field === "particulars")   patch = { particulars: value };
    else if (field === "withdrawal")    patch = { withdrawal: Math.max(0, Number(value) || 0), deposit: 0 };
    else if (field === "deposit")       patch = { deposit: Math.max(0, Number(value) || 0), withdrawal: 0 };
    else if (field === "contraAccountName")  patch = { contraAccountName: value };
    else if (field === "contraAccountGroup") patch = { contraAccountGroup: value as any };

    // Skip save if nothing actually changed
    const orig = rows.find((r) => r._id === row._id);
    if (!orig) return;
    const origValue = String((orig as any)[field] ?? "");
    if (origValue === value) return;

    setSaving(true);
    try {
      await onCellSave(row._id, patch);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, row: BankCashRow) {
    if (e.key === "Enter")  { e.preventDefault(); commitEdit(row); }
    if (e.key === "Escape") { e.preventDefault(); setEditCell(null); }
    if (e.key === "Tab")    { e.preventDefault(); commitEdit(row); }
  }

  function EditableCell({
    row, field, value, align = "left", mono = false,
    className = "", inputType = "text", children,
  }: {
    row: BankCashRow; field: string; value: string | number;
    align?: "left" | "right"; mono?: boolean; className?: string;
    inputType?: "text" | "number" | "date" | "select"; children?: React.ReactNode;
  }) {
    const isEditing = editCell?.id === row._id && editCell?.field === field;
    const tdClass = `${COL_CELL} ${className} cursor-cell hover:bg-[#fffde7] transition-colors`;

    if (isEditing) {
      if (inputType === "select") {
        return (
          <td className={`${COL_CELL} ${className} p-0.5`} onClick={(e) => e.stopPropagation()}>
            <select
              autoFocus
              value={editCell!.value}
              onChange={(e) => setEditCell({ ...editCell!, value: e.target.value })}
              onBlur={() => commitEdit(row)}
              onKeyDown={(e) => handleKeyDown(e, row)}
              className={CELL_SELECT}
            >
              {CONTRA_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </td>
        );
      }
      return (
        <td className={`${COL_CELL} ${className} p-0.5`} onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            type={inputType}
            value={editCell!.value}
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
      <td
        className={tdClass}
        title="Click to edit"
        onClick={() => startEdit(row._id, field, value)}
      >
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
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400 bg-white border border-slate-200">
        <CreditCard size={32} className="opacity-25" />
        <p className="text-sm">No entries — add one to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto" style={{ maxHeight: 600 }}>
      <table className="border-collapse w-full text-left" style={{ minWidth: 980 }}>
        <thead className="sticky top-0 z-10">
          {/* Column-letter row (Excel A B C style) */}
          <tr>
            {["", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map((l, i) => (
              <th key={i} className="border border-slate-300 bg-[#bdc5d5] text-slate-500 text-[10px] font-semibold text-center py-0.5 px-1 select-none w-8">
                {l}
              </th>
            ))}
          </tr>
          {/* Header row */}
          <tr>
            <th className={`${COL_HEADER} text-center w-10`}>Sr. No.</th>
            <th className={`${COL_HEADER}`}>Bank/cash name</th>
            <th className={`${COL_HEADER}`}>Date</th>
            <th className={`${COL_HEADER} min-w-[220px]`}>Particulars/Narrations</th>
            <th className={`${COL_HEADER} text-right`}>Withdrawals/Payment</th>
            <th className={`${COL_HEADER} text-right`}>Deposit/Receipt</th>
            <th className={`${COL_HEADER} text-right`}>Balance</th>
            <th className={`${COL_HEADER}`}>Account name</th>
            <th className={`${COL_HEADER}`}>Account group name</th>
            <th className={`${COL_HEADER} text-center w-16`}>
              {saving ? <Loader2 size={11} className="animate-spin inline" /> : "✓"}
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Opening Balance row */}
          <tr className="bg-[#eaf4fb]">
            <td className={COL_NUM}>—</td>
            <td className={`${COL_CELL} text-slate-400 italic`} colSpan={5}>Opening Balance (brought forward)</td>
            <td className={`${COL_CELL} text-right font-bold text-slate-800 font-mono`}>
              ₹{fmt(openingBalance)}
            </td>
            <td className={COL_CELL} colSpan={3} />
          </tr>

          {rows.map((row, idx) => {
            const isWithdrawal = row.withdrawal > 0;
            const isDeposit    = row.deposit    > 0;
            const isOdd        = idx % 2 === 0;
            const rowBg        = isOdd ? "bg-white" : "bg-[#f7f8fc]";
            const isRowEditing = editCell?.id === row._id;

            return (
              <tr
                key={row._id}
                className={`${isRowEditing ? "bg-[#fffde7]" : rowBg} hover:bg-[#eef2ff] group transition-colors`}
              >
                {/* Row number */}
                <td className={COL_NUM}>{idx + 1}</td>

                {/* Bank/cash name — read-only */}
                <td className={`${COL_CELL} font-medium text-slate-800`}>
                  {row.accountName}
                </td>

                {/* Date — editable */}
                <EditableCell row={row} field="date" value={row.date} inputType="date" mono>
                  <span className="font-mono text-slate-600 cursor-cell block">
                    {new Date(row.date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                  </span>
                </EditableCell>

                {/* Particulars/Narrations — editable */}
                <EditableCell row={row} field="particulars" value={row.particulars} className="max-w-[260px]">
                  <span className="block truncate text-slate-800 cursor-cell">{row.particulars}</span>
                </EditableCell>

                {/* Withdrawals/Payment — editable */}
                <EditableCell row={row} field="withdrawal" value={row.withdrawal} inputType="number" align="right"
                  className={isWithdrawal ? "bg-red-50" : ""}>
                  {isWithdrawal ? (
                    <span className="text-red-600 font-semibold font-mono text-right block cursor-cell">₹{fmt(row.withdrawal)}</span>
                  ) : (
                    <span className="text-slate-300 text-right block cursor-cell">—</span>
                  )}
                </EditableCell>

                {/* Deposit/Receipt — editable */}
                <EditableCell row={row} field="deposit" value={row.deposit} inputType="number" align="right"
                  className={isDeposit ? "bg-emerald-50" : ""}>
                  {isDeposit ? (
                    <span className="text-emerald-600 font-semibold font-mono text-right block cursor-cell">₹{fmt(row.deposit)}</span>
                  ) : (
                    <span className="text-slate-300 text-right block cursor-cell">—</span>
                  )}
                </EditableCell>

                {/* Balance — computed, read-only */}
                <td className={`${COL_CELL} text-right font-mono font-bold ${row.balance < 0 ? "text-red-700 bg-red-50" : "text-slate-900"}`}>
                  ₹{fmt(row.balance)}
                  {row.balance < 0 && <span className="text-[10px] font-normal ml-1 text-red-400">(Cr)</span>}
                </td>

                {/* Account name — editable */}
                <EditableCell row={row} field="contraAccountName" value={row.contraAccountName} className="text-slate-600">
                  <span className="block truncate max-w-[160px] cursor-cell">{row.contraAccountName}</span>
                </EditableCell>

                {/* Account group name — editable select */}
                <EditableCell row={row} field="contraAccountGroup" value={row.contraAccountGroup} inputType="select">
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium cursor-cell">
                    {row.contraAccountGroup}
                  </span>
                </EditableCell>

                {/* Delete button */}
                <td className={`${COL_CELL} text-center`}>
                  <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onDelete(row)} title="Delete row"
                      className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}

          {/* Totals row */}
          <tr className="bg-[#d0d7e3] font-bold sticky bottom-0">
            <td className={`${COL_NUM} font-bold text-slate-600`}>Σ</td>
            <td className={`${COL_CELL} font-bold text-slate-700`} colSpan={3}>
              Total ({rows.length} entries)
            </td>
            <td className={`${COL_CELL} text-right font-mono font-bold text-red-700`}>
              ₹{fmt(totalWithdrawal)}
            </td>
            <td className={`${COL_CELL} text-right font-mono font-bold text-emerald-700`}>
              ₹{fmt(totalDeposit)}
            </td>
            <td className={`${COL_CELL} text-right font-mono font-bold ${closingBalance < 0 ? "text-red-700" : "text-slate-900"}`}>
              ₹{fmt(closingBalance)}
            </td>
            <td className={COL_CELL} colSpan={3} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BankCashBook() {
  const { selectedFY } = useApp();
  const financialYear  = selectedFY?.label ?? "—";

  const [accounts,        setAccounts]        = useState<BankCashAccount[]>([]);
  const [rows,            setRows]            = useState<BankCashRow[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [accountFilter,   setAccountFilter]   = useState<string>("all");
  const [groupTypeFilter, setGroupTypeFilter] = useState<"all" | "Bank" | "Cash">("all");
  const [search,          setSearch]          = useState("");
  const [modal,           setModal]           = useState<{ entry?: BankCashRow } | null>(null);
  const [showImport,      setShowImport]      = useState(false);

  const loadRows = useCallback(async (accId: string) => {
    setLoading(true);
    try {
      const data = accId === "all" ? await getAllEntries() : await getEntriesForAccount(accId);
      setRows(data);
    } catch {
      toast.error("Failed to load entries");
    } finally {
      setLoading(false);
    }
  }, [selectedFY?._id]);

  useEffect(() => {
    getAllAccounts().then(setAccounts).catch(() => toast.error("Failed to load accounts"));
  }, [selectedFY?._id]);

  useEffect(() => { loadRows(accountFilter); }, [accountFilter, loadRows]);

  const handleSubmit = useCallback(async (data: EntryPayload) => {
    const w = Number(data.withdrawal ?? 0);
    const d = Number(data.deposit    ?? 0);
    if (w === 0 && d === 0) { toast.error("Enter either a withdrawal or deposit amount"); return; }
    setSaving(true);
    try {
      if (modal?.entry) {
        await updateEntry(modal.entry._id, { ...data, withdrawal: w, deposit: d });
        toast.success("Entry updated");
      } else {
        await createEntry({ ...data, withdrawal: w, deposit: d });
        toast.success("Entry added");
      }
      setModal(null);
      await loadRows(accountFilter);
    } catch (e: any) {
      toast.error(e.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  }, [modal, accountFilter, loadRows]);

  const handleDelete = useCallback(async (row: BankCashRow) => {
    if (!window.confirm(`Delete entry: "${row.particulars.slice(0, 50)}"?`)) return;
    try {
      await deleteEntry(row._id);
      toast.success("Entry deleted");
      await loadRows(accountFilter);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [accountFilter, loadRows]);

  // Called by ExcelTable when user edits a cell inline
  const handleCellSave = useCallback(async (id: string, patch: Partial<EntryPayload>) => {
    try {
      await updateEntry(id, patch);
      toast.success("Saved", { duration: 1200, icon: "✓" });
      await loadRows(accountFilter);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
  }, [accountFilter, loadRows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const matchSearch = !q ||
        r.particulars.toLowerCase().includes(q) ||
        r.contraAccountName.toLowerCase().includes(q) ||
        r.accountName.toLowerCase().includes(q);
      const matchType = groupTypeFilter === "all" || r.accountGroup === groupTypeFilter;
      return matchSearch && matchType;
    });
  }, [rows, search, groupTypeFilter]);

  const summary = useMemo(() => {
    const openingBalance  = accountFilter === "all"
      ? accounts.reduce((s, a) => s + a.openingBalance, 0)
      : (accounts.find((a) => a._id === accountFilter)?.openingBalance ?? 0);
    const totalDeposit    = filtered.reduce((s, r) => s + r.deposit,    0);
    const totalWithdrawal = filtered.reduce((s, r) => s + r.withdrawal, 0);
    const closingBalance  = filtered.length > 0 ? filtered[filtered.length - 1].balance : openingBalance;
    return { openingBalance, totalDeposit, totalWithdrawal, closingBalance };
  }, [filtered, accounts, accountFilter]);

  const bankAccounts = accounts.filter((a) => a.group === "Bank");
  const cashAccounts = accounts.filter((a) => a.group === "Cash");
  const activeAccount = accounts.find((a) => a._id === accountFilter);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <FYBanner />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Bank / Cash Book</h1>
          <p className="text-sm text-slate-500 mt-0.5">{financialYear} · Click any cell to edit inline</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadRows(accountFilter)} title="Refresh"
            className="p-2 border border-slate-200 bg-white rounded-lg text-slate-500 hover:bg-slate-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm">
            <Upload size={14} /> Bank Import
          </button>
          <button onClick={() => setModal({})}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> Add Entry
          </button>
        </div>
      </div>

      {/* ── Account Tabs ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => { setAccountFilter("all"); setGroupTypeFilter("all"); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
              accountFilter === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
          >
            <DollarSign size={13} /> All Accounts
          </button>

          {bankAccounts.length > 0 && (
            <>
              <span className="text-xs text-slate-400 px-1 flex items-center gap-1"><Landmark size={11} /> Bank</span>
              {bankAccounts.map((acc) => (
                <button key={acc._id}
                  onClick={() => { setAccountFilter(acc._id); setGroupTypeFilter("all"); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                    accountFilter === acc._id ? "bg-blue-600 text-white border-blue-600" : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                  }`}
                >
                  <Landmark size={13} /> {acc.name}
                </button>
              ))}
            </>
          )}

          {cashAccounts.length > 0 && (
            <>
              <span className="text-xs text-slate-400 px-1 flex items-center gap-1"><Wallet size={11} /> Cash</span>
              {cashAccounts.map((acc) => (
                <button key={acc._id}
                  onClick={() => { setAccountFilter(acc._id); setGroupTypeFilter("all"); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                    accountFilter === acc._id ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                  }`}
                >
                  <Wallet size={13} /> {acc.name}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Summary Bar ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Opening Balance", value: fmtFull(summary.openingBalance), color: "border-l-slate-400",   textColor: "text-slate-800",    bg: "bg-white"      },
          { label: "Total Deposit",   value: fmtFull(summary.totalDeposit),   color: "border-l-emerald-500", textColor: "text-emerald-700",  bg: "bg-emerald-50" },
          { label: "Total Withdrawal",value: fmtFull(summary.totalWithdrawal),color: "border-l-red-400",     textColor: "text-red-700",      bg: "bg-red-50"     },
          { label: "Closing Balance", value: fmtFull(summary.closingBalance), color: summary.closingBalance >= 0 ? "border-l-indigo-500" : "border-l-red-500", textColor: summary.closingBalance >= 0 ? "text-indigo-700" : "text-red-700", bg: "bg-white" },
        ].map(({ label, value, color, textColor, bg }) => (
          <div key={label} className={`${bg} rounded-xl border border-slate-200 border-l-4 ${color} px-4 py-3 shadow-sm`}>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
            <p className={`text-base font-bold font-mono mt-1 ${textColor}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-[200px] shadow-sm">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search narration, account…"
            className="bg-transparent text-sm outline-none text-slate-700 placeholder-slate-400 w-full" />
          {search && <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>}
        </div>

        {accountFilter === "all" && (
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {(["all", "Bank", "Cash"] as const).map((t) => (
              <button key={t} onClick={() => setGroupTypeFilter(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  groupTypeFilter === t ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}>
                {t === "all" ? "All" : t}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-slate-500 ml-auto">
          <Filter size={14} />
          <span className="font-medium text-slate-700">{filtered.length} entries</span>
        </div>
      </div>

      {/* ── Excel-style Table ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        {/* Workbook title bar */}
        <div className="bg-[#217346] text-white px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Download size={14} />
            {activeAccount
              ? `${activeAccount.name} — ${activeAccount.group} Book`
              : "Bank / Cash Book — All Accounts"}
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
            <span className="text-sm">Loading transactions…</span>
          </div>
        ) : (
          <ExcelTable
            rows={filtered}
            openingBalance={summary.openingBalance}
            onDelete={handleDelete}
            onCellSave={handleCellSave}
          />
        )}
      </div>

      {modal !== null && (
        <EntryModal
          accounts={accounts}
          entry={modal.entry}
          loading={saving}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
        />
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowImport(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Close Button */}
            <button
              onClick={() => setShowImport(false)}
              className="absolute right-4 top-4 z-50 p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              title="Close Import Modal"
            >
              <X size={18} />
            </button>
            <div className="overflow-y-auto flex-1 pb-6">
              <BankImport
                onClose={() => setShowImport(false)}
                onImportComplete={async () => {
                  setShowImport(false);
                  // Reload accounts first (new account may have been auto-created)
                  const freshAccounts = await getAllAccounts().catch(() => []);
                  setAccounts(freshAccounts);
                  // Reset filter to "all" so newly imported entries are visible
                  setAccountFilter("all");
                  setGroupTypeFilter("all");
                  // Reload entries
                  await loadRows("all");
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
