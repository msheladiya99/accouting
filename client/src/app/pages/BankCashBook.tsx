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
  createEntry, updateEntry, deleteEntry, bulkDeleteEntries, clearEntriesForAccount, deleteAccount, updateAccount,
  createAccount,
  CONTRA_GROUPS,
  type BankCashAccount, type BankCashRow, type EntryPayload, type AccountGroup,
} from "../api/bankCashBookApi";

import BankImport from "./BankImport";
import { getAllGroups } from "../api/accountGroupApi";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtFull = (n: number) =>
  "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (dateStr: string): string => {
  if (!dateStr) return "";
  try {
    const [year, month, day] = dateStr.split("T")[0].split("-");
    if (year && month && day) {
      return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
    }
  } catch (e) {}
  try {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return dateStr;
  }
};

const matchNumericFilter = (value: number, filterText: string): boolean => {
  const text = filterText.trim();
  if (!text) return true;

  // Split by whitespace or commas/and/&& to support multiple conditions, e.g. ">100 <500"
  const tokens = text.split(/\s+(?:and|&&)\s+|\s*,\s*|\s+/i).filter(Boolean);
  if (tokens.length === 0) return true;

  // All tokens must match (AND condition)
  for (const token of tokens) {
    const match = token.match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/);
    if (match) {
      const op = match[1];
      const target = parseFloat(match[2]);
      if (isNaN(target)) return false;

      if (op) {
        let tokenMatch = false;
        switch (op) {
          case ">": tokenMatch = value > target; break;
          case "<": tokenMatch = value < target; break;
          case ">=": tokenMatch = value >= target; break;
          case "<=": tokenMatch = value <= target; break;
          case "=": tokenMatch = value === target; break;
        }
        if (!tokenMatch) return false;
      } else {
        // No operator explicitly provided (e.g. "100")
        // Match either exact value or substring of value/formatted value
        const valStr = String(value);
        const fmtVal = fmt(value).toLowerCase();
        const tokenLower = token.toLowerCase();
        const exactMatch = value === target;
        const substringMatch = valStr.includes(tokenLower) || fmtVal.includes(tokenLower);
        if (!exactMatch && !substringMatch) return false;
      }
    } else {
      // If token doesn't match operator structure, do substring matching
      const valStr = String(value);
      const fmtVal = fmt(value).toLowerCase();
      const tokenLower = token.toLowerCase();
      if (!valStr.includes(tokenLower) && !fmtVal.includes(tokenLower)) {
        return false;
      }
    }
  }

  return true;
};

const GROUP_COLORS: Record<AccountGroup, { bg: string; text: string; icon: React.ElementType; dot: string; badge: string }> = {
  Bank: { bg: "bg-blue-50",  text: "text-blue-700",  icon: Landmark, dot: "bg-blue-500",  badge: "bg-blue-100 text-blue-700"  },
  Cash: { bg: "bg-amber-50", text: "text-amber-700", icon: Wallet,   dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700" },
};

// ── Entry Modal ───────────────────────────────────────────────────────────────
function EntryModal({
  accounts, entry, loading, onClose, onSubmit, contraGroups,
}: {
  accounts: BankCashAccount[];
  entry?: BankCashRow;
  loading: boolean;
  onClose: () => void;
  onSubmit: (data: EntryPayload) => void;
  contraGroups: string[];
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
            <select
              {...register("accountId", { required: "Bank/Cash account is required" })}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 font-medium text-slate-800"
            >
              {accounts.map((acc) => (
                <option key={acc._id} value={acc._id}>
                  {acc.name} ({acc.group})
                </option>
              ))}
            </select>
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
                {contraGroups.map((g) => <option key={g} value={g}>{g}</option>)}
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

// ── Create Account Modal ──────────────────────────────────────────────────────
function CreateAccountModal({
  loading,
  onClose,
  onSubmit,
}: {
  loading: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; group: "Bank" | "Cash"; openingBalance: number }) => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<{
    name: string;
    group: "Bank" | "Cash";
    openingBalance: number;
  }>({
    defaultValues: {
      name: "",
      group: "Bank",
      openingBalance: 0,
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Landmark size={16} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-slate-900 text-base font-semibold">Create Bank/Cash Account</h2>
              <p className="text-xs text-slate-500 mt-0.5">Add a new bank or cash ledger account</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Account Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. HDFC Bank, Cash Ledger..."
              {...register("name", { required: "Account name is required" })}
              className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all ${
                errors.name
                  ? "border-red-300 bg-red-50"
                  : "border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
              }`}
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Account Type / Group <span className="text-red-500">*</span>
            </label>
            <select
              {...register("group", { required: true })}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
            >
              <option value="Bank">Bank Account</option>
              <option value="Cash">Cash Account</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Opening Balance
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register("openingBalance", { valueAsNumber: true })}
                className="w-full pl-7 pr-3 py-2.5 rounded-lg text-sm outline-none border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Use positive for debit balance (normal), negative for credit balance (e.g. bank overdraft).
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 font-semibold"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Create Account
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
  rows, openingBalance, onDelete, onCellSave, contraGroups,
  colFilters, onFilterChange, onOpeningBalanceChange,
  selectedIds, onSelectionChange,
  isAllView, accounts,
}: {
  rows: BankCashRow[];
  openingBalance: number;
  onDelete: (r: BankCashRow) => void;
  onCellSave: (id: string, patch: Partial<EntryPayload>) => Promise<void>;
  contraGroups: string[];
  colFilters: {
    srNo: string;
    accountName: string;
    date: string;
    particulars: string;
    withdrawal: string;
    deposit: string;
    balance: string;
    contraAccountName: string;
    contraAccountGroup: string;
    modified: string;
  };
  onFilterChange: (filters: any) => void;
  onOpeningBalanceChange?: (newBalance: number, accountId?: string) => void;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  isAllView?: boolean;
  accounts?: BankCashAccount[];
}) {
  const [editCell, setEditCell]         = useState<EditCell | null>(null);
  const [saving,   setSaving]           = useState(false);
  const [editingOB, setEditingOB]       = useState<"withdrawal" | "deposit" | null>(null);
  const [obInput,   setObInput]         = useState("");
  const [selectedObAccId, setSelectedObAccId] = useState("");
  const commitRef = useRef<(() => void) | null>(null);


  function handleObSave(type: "withdrawal" | "deposit") {
    setEditingOB(null);
    let newVal = parseFloat(obInput);
    if (isNaN(newVal)) return;
    if (type === "withdrawal") {
      newVal = -Math.abs(newVal);
    } else {
      newVal = Math.abs(newVal);
    }
    if (newVal !== openingBalance && onOpeningBalanceChange) {
      onOpeningBalanceChange(newVal);
    }
  }

  function handleObSaveCombined() {
    if (!selectedObAccId) {
      toast.error("Please select an account");
      return;
    }
    setEditingOB(null);
    let newVal = parseFloat(obInput);
    if (isNaN(newVal)) return;
    if (editingOB === "withdrawal") {
      newVal = -Math.abs(newVal);
    } else {
      newVal = Math.abs(newVal);
    }
    if (onOpeningBalanceChange) {
      onOpeningBalanceChange(newVal, selectedObAccId);
    }
  }



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

  const fields = ["date", "particulars", "withdrawal", "deposit", "contraAccountName", "contraAccountGroup"];

  function navigateCell(rowId: string, currentField: string, direction: "next" | "prev" | "down" | "up") {
    const rowIndex = rows.findIndex(r => r._id === rowId);
    if (rowIndex === -1) return;
    const fieldIndex = fields.indexOf(currentField);
    if (fieldIndex === -1) return;

    let nextRowIndex = rowIndex;
    let nextFieldIndex = fieldIndex;

    if (direction === "next") {
      if (fieldIndex < fields.length - 1) {
        nextFieldIndex = fieldIndex + 1;
      } else if (rowIndex < rows.length - 1) {
        nextRowIndex = rowIndex + 1;
        nextFieldIndex = 0;
      }
    } else if (direction === "prev") {
      if (fieldIndex > 0) {
        nextFieldIndex = fieldIndex - 1;
      } else if (rowIndex > 0) {
        nextRowIndex = rowIndex - 1;
        nextFieldIndex = fields.length - 1;
      }
    } else if (direction === "down") {
      if (rowIndex < rows.length - 1) {
        nextRowIndex = rowIndex + 1;
      }
    } else if (direction === "up") {
      if (rowIndex > 0) {
        nextRowIndex = rowIndex - 1;
      }
    }

    const nextRow = rows[nextRowIndex];
    const nextField = fields[nextFieldIndex];
    const nextValue = nextRow ? (nextRow as any)[nextField] : "";

    // Commit current edit asynchronously (non-blocking for UI responsiveness)
    commitEdit(rows[rowIndex]);

    // Start editing the next cell instantly
    if (nextRow) {
      startEdit(nextRow._id, nextField, nextValue);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, row: BankCashRow, field: string, inputType?: string) {
    if (e.key === "Enter")  { e.preventDefault(); navigateCell(row._id, field, "down"); }
    if (e.key === "Escape") { e.preventDefault(); setEditCell(null); }
    if (e.key === "Tab")    {
      e.preventDefault();
      navigateCell(row._id, field, e.shiftKey ? "prev" : "next");
    }
    if (inputType !== "select") {
      if (e.key === "ArrowUp")    { e.preventDefault(); navigateCell(row._id, field, "up"); }
      if (e.key === "ArrowDown")  { e.preventDefault(); navigateCell(row._id, field, "down"); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); navigateCell(row._id, field, "prev"); }
      if (e.key === "ArrowRight") { e.preventDefault(); navigateCell(row._id, field, "next"); }
    }
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
              onKeyDown={(e) => handleKeyDown(e, row, field, "select")}
              className={CELL_SELECT}
            >
              {contraGroups.map((g) => <option key={g} value={g}>{g}</option>)}
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
            onKeyDown={(e) => handleKeyDown(e, row, field, inputType)}
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

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r._id));
  const someSelected = rows.some((r) => selectedIds.has(r._id));

  function toggleSelectAll() {
    if (allSelected) {
      const next = new Set(selectedIds);
      rows.forEach((r) => next.delete(r._id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      rows.forEach((r) => next.add(r._id));
      onSelectionChange(next);
    }
  }

  function toggleRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  return (
    <div className="overflow-auto" style={{ maxHeight: 600 }}>
      <table className="border-collapse w-full text-left" style={{ minWidth: 1020 }}>
        <thead className="sticky top-0 z-10">
          {/* Column-letter row (Excel A B C style) */}
          <tr>
            {["", "", "A", "B", "C", "D", "E", "F", "G", "H", "", ""].map((l, i) => (
              <th key={i} className="border border-slate-300 bg-[#bdc5d5] text-slate-500 text-[10px] font-semibold text-center py-0.5 px-1 select-none w-8">
                {l}
              </th>
            ))}
          </tr>
          {/* Header row */}
          <tr>
            {/* Select-All checkbox */}
            <th className={`${COL_HEADER} text-center w-10`}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 cursor-pointer accent-indigo-600"
                title="Select / Deselect all"
              />
            </th>
            <th className={`${COL_HEADER} text-center w-10`}>Sr. No.</th>
            <th className={`${COL_HEADER}`}>Bank/cash name</th>
            <th className={`${COL_HEADER}`}>Date</th>
            <th className={`${COL_HEADER} min-w-[220px]`}>Particulars/Narrations</th>
            <th className={`${COL_HEADER} text-right`}>Withdrawals/Payment</th>
            <th className={`${COL_HEADER} text-right`}>Deposit/Receipt</th>
            <th className={`${COL_HEADER} text-right`}>Balance</th>
            <th className={`${COL_HEADER}`}>Account name</th>
            <th className={`${COL_HEADER}`}>Account group name</th>
            <th className={`${COL_HEADER} text-center w-10`}>✓</th>
            <th className={`${COL_HEADER} text-center w-12`}>
              {saving ? <Loader2 size={11} className="animate-spin inline" /> : ""}
            </th>
          </tr>
          {/* Column filter row */}
          <tr className="bg-[#f1f5f9]">
            {/* Checkbox filter spacer */}
            <td className="border border-slate-300 p-1 bg-[#f1f5f9] w-10" />
            {/* Sr. No. filter */}
            <td className="border border-slate-300 p-1 bg-[#f1f5f9] text-center w-10">
              <input
                type="text"
                placeholder="Filter..."
                value={colFilters.srNo}
                onChange={(e) => onFilterChange({ ...colFilters, srNo: e.target.value })}
                className="w-full border border-slate-300 rounded px-1 py-0.5 text-[11px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-center font-mono"
              />
            </td>
            {/* Bank/cash name filter */}
            <td className="border border-slate-300 p-1 bg-[#f1f5f9]">
              <input
                type="text"
                placeholder="Filter..."
                value={colFilters.accountName}
                onChange={(e) => onFilterChange({ ...colFilters, accountName: e.target.value })}
                className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </td>
            {/* Date filter */}
            <td className="border border-slate-300 p-1 bg-[#f1f5f9]">
              <input
                type="text"
                placeholder="Filter..."
                value={colFilters.date}
                onChange={(e) => onFilterChange({ ...colFilters, date: e.target.value })}
                className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </td>
            {/* Particulars filter */}
            <td className="border border-slate-300 p-1 bg-[#f1f5f9] min-w-[220px]">
              <input
                type="text"
                placeholder="Filter..."
                value={colFilters.particulars}
                onChange={(e) => onFilterChange({ ...colFilters, particulars: e.target.value })}
                className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </td>
            {/* Withdrawals filter */}
            <td className="border border-slate-300 p-1 bg-[#f1f5f9]">
              <input
                type="text"
                placeholder="Filter..."
                value={colFilters.withdrawal}
                onChange={(e) => onFilterChange({ ...colFilters, withdrawal: e.target.value })}
                className="w-full text-right border border-slate-300 rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </td>
            {/* Deposits filter */}
            <td className="border border-slate-300 p-1 bg-[#f1f5f9]">
              <input
                type="text"
                placeholder="Filter..."
                value={colFilters.deposit}
                onChange={(e) => onFilterChange({ ...colFilters, deposit: e.target.value })}
                className="w-full text-right border border-slate-300 rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </td>
            {/* Balance filter */}
            <td className="border border-slate-300 p-1 bg-[#f1f5f9]">
              <input
                type="text"
                placeholder="Filter..."
                value={colFilters.balance}
                onChange={(e) => onFilterChange({ ...colFilters, balance: e.target.value })}
                className="w-full text-right border border-slate-300 rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </td>
            {/* Account name filter */}
            <td className="border border-slate-300 p-1 bg-[#f1f5f9]">
              <input
                type="text"
                placeholder="Filter..."
                value={colFilters.contraAccountName}
                onChange={(e) => onFilterChange({ ...colFilters, contraAccountName: e.target.value })}
                className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </td>
            {/* Account group name filter */}
            <td className="border border-slate-300 p-1 bg-[#f1f5f9]">
              <input
                type="text"
                placeholder="Filter..."
                value={colFilters.contraAccountGroup}
                onChange={(e) => onFilterChange({ ...colFilters, contraAccountGroup: e.target.value })}
                className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </td>
            {/* Checkmark filter */}
            <td className="border border-slate-300 p-0.5 bg-[#f1f5f9] w-10 text-center">
              <select
                value={colFilters.modified}
                onChange={(e) => onFilterChange({ ...colFilters, modified: e.target.value })}
                className="w-full border border-slate-300 rounded px-0.5 py-0.5 text-[10px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white font-semibold text-slate-700 cursor-pointer"
                style={{ appearance: "none", textAlign: "center", textAlignLast: "center" }}
              >
                <option value="">All</option>
                <option value="edited">✓</option>
                <option value="blank">Blank</option>
              </select>
            </td>
            {/* Clear filters cell */}
            <td className="border border-slate-300 p-1 bg-[#f1f5f9] text-center w-12">
              {Object.values(colFilters).some(v => v !== "") && (
                <button
                  onClick={() => onFilterChange({
                    srNo: "",
                    accountName: "",
                    date: "",
                    particulars: "",
                    withdrawal: "",
                    deposit: "",
                    balance: "",
                    contraAccountName: "",
                    contraAccountGroup: "",
                    modified: "",
                  })}
                  className="px-1.5 py-0.5 text-[10px] text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors font-semibold shadow-sm"
                >
                  Clear
                </button>
              )}
            </td>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-[#eaf4fb] group/ob">
            <td className={COL_NUM}>—</td>
            <td className={`${COL_CELL} text-slate-500 italic`} colSpan={4}>
              Opening Balance
              {onOpeningBalanceChange && (
                <span className="text-[10px] ml-1.5 text-indigo-400 opacity-0 group-hover/ob:opacity-100 transition-opacity">
                  · click deposit/withdrawal to edit
                </span>
              )}
            </td>
            
            {/* Withdrawals / Payment Cell */}
            <td
              className={`${COL_CELL} text-right font-mono p-0.5 relative ${
                onOpeningBalanceChange ? "cursor-cell hover:bg-[#fffde7] transition-colors" : ""
              } ${openingBalance < 0 ? "bg-red-50" : ""}`}
              onClick={(e) => {
                if (!onOpeningBalanceChange) return;
                if (editingOB === "withdrawal") return;
                setEditingOB("withdrawal");
                if (isAllView) {
                  setSelectedObAccId("");
                  setObInput("");
                } else {
                  setObInput(openingBalance < 0 ? String(Math.abs(openingBalance)) : "");
                }
              }}
              title={onOpeningBalanceChange ? "Click to edit opening balance (Withdrawal / Overdraft)" : undefined}
            >
              {editingOB === "withdrawal" ? (
                isAllView ? (
                  <div className="absolute z-20 flex flex-col gap-1 bg-white p-2 border border-slate-300 rounded shadow-lg min-w-[220px]" onClick={e => e.stopPropagation()}>
                    <select
                      value={selectedObAccId}
                      onChange={(e) => {
                        const accId = e.target.value;
                        setSelectedObAccId(accId);
                        const acc = accounts?.find(a => a._id === accId);
                        if (acc) {
                          const bal = acc.openingBalance;
                          setObInput(bal < 0 ? String(Math.abs(bal)) : "0");
                        }
                      }}
                      className="text-[11px] border border-slate-300 p-1.5 rounded w-full outline-none focus:border-indigo-500 bg-white"
                    >
                      <option value="">-- Select Account --</option>
                      {accounts?.map(acc => (
                        <option key={acc._id} value={acc._id}>
                          {acc.name} (Current: ₹{fmt(acc.openingBalance)})
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        type="number"
                        value={obInput}
                        onChange={(e) => setObInput(e.target.value)}
                        className={`${CELL_INPUT} text-right font-mono font-bold flex-1`}
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); handleObSaveCombined(); }
                          if (e.key === "Escape") { e.preventDefault(); setEditingOB(null); }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleObSaveCombined}
                        className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] rounded font-semibold"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingOB(null)}
                        className="px-2 py-1 border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <input
                    autoFocus
                    type="number"
                    value={obInput}
                    onChange={(e) => setObInput(e.target.value)}
                    onBlur={() => handleObSave("withdrawal")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")  { e.preventDefault(); handleObSave("withdrawal"); }
                      if (e.key === "Escape") { e.preventDefault(); setEditingOB(null); }
                    }}
                    className={`${CELL_INPUT} text-right font-mono font-bold w-full`}
                    step="0.01"
                    min="0"
                  />
                )
              ) : (
                <span className="flex items-center justify-end gap-1">
                  {openingBalance < 0 ? (
                    <span className="text-red-600 font-semibold">₹{fmt(Math.abs(openingBalance))}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                  {onOpeningBalanceChange && (
                    <Pencil size={10} className="text-indigo-400 opacity-0 group-hover/ob:opacity-100 transition-opacity flex-shrink-0" />
                  )}
                </span>
              )}
            </td>

            {/* Deposit / Receipt Cell */}
            <td
              className={`${COL_CELL} text-right font-mono p-0.5 relative ${
                onOpeningBalanceChange ? "cursor-cell hover:bg-[#fffde7] transition-colors" : ""
              } ${openingBalance >= 0 && openingBalance !== 0 ? "bg-emerald-50" : ""}`}
              onClick={(e) => {
                if (!onOpeningBalanceChange) return;
                if (editingOB === "deposit") return;
                setEditingOB("deposit");
                if (isAllView) {
                  setSelectedObAccId("");
                  setObInput("");
                } else {
                  setObInput(openingBalance >= 0 ? String(openingBalance) : "");
                }
              }}
              title={onOpeningBalanceChange ? "Click to edit opening balance (Deposit)" : undefined}
            >
              {editingOB === "deposit" ? (
                isAllView ? (
                  <div className="absolute z-20 right-0 flex flex-col gap-1 bg-white p-2 border border-slate-300 rounded shadow-lg min-w-[220px]" onClick={e => e.stopPropagation()}>
                    <select
                      value={selectedObAccId}
                      onChange={(e) => {
                        const accId = e.target.value;
                        setSelectedObAccId(accId);
                        const acc = accounts?.find(a => a._id === accId);
                        if (acc) {
                          const bal = acc.openingBalance;
                          setObInput(bal >= 0 ? String(bal) : "0");
                        }
                      }}
                      className="text-[11px] border border-slate-300 p-1.5 rounded w-full outline-none focus:border-indigo-500 bg-white"
                    >
                      <option value="">-- Select Account --</option>
                      {accounts?.map(acc => (
                        <option key={acc._id} value={acc._id}>
                          {acc.name} (Current: ₹{fmt(acc.openingBalance)})
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        type="number"
                        value={obInput}
                        onChange={(e) => setObInput(e.target.value)}
                        className={`${CELL_INPUT} text-right font-mono font-bold flex-1`}
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); handleObSaveCombined(); }
                          if (e.key === "Escape") { e.preventDefault(); setEditingOB(null); }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleObSaveCombined}
                        className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] rounded font-semibold"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingOB(null)}
                        className="px-2 py-1 border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <input
                    autoFocus
                    type="number"
                    value={obInput}
                    onChange={(e) => setObInput(e.target.value)}
                    onBlur={() => handleObSave("deposit")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")  { e.preventDefault(); handleObSave("deposit"); }
                      if (e.key === "Escape") { e.preventDefault(); setEditingOB(null); }
                    }}
                    className={`${CELL_INPUT} text-right font-mono font-bold w-full`}
                    step="0.01"
                    min="0"
                  />
                )
              ) : (
                <span className="flex items-center justify-end gap-1">
                  {openingBalance >= 0 ? (
                    <span className="text-emerald-600 font-semibold">₹{fmt(openingBalance)}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                  {onOpeningBalanceChange && (
                    <Pencil size={10} className="text-indigo-400 opacity-0 group-hover/ob:opacity-100 transition-opacity flex-shrink-0" />
                  )}
                </span>
              )}
            </td>

            {/* Balance Cell */}
            <td className={`${COL_CELL} text-right font-bold text-slate-800 font-mono`}>
              ₹{fmt(openingBalance)}
              {openingBalance < 0 && <span className="text-[10px] font-normal ml-1 text-red-400">(Cr)</span>}
            </td>
            <td className={COL_CELL} colSpan={4} />
          </tr>



          {rows.length === 0 ? (
            <tr>
              <td colSpan={12} className="text-center py-8 text-slate-400 italic bg-white border border-slate-300">
                No matching records found
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => {
              const isWithdrawal = row.withdrawal > 0;
              const isDeposit    = row.deposit    > 0;
              const isOdd        = idx % 2 === 0;
              const isChecked    = selectedIds.has(row._id);
              const rowBg        = isChecked ? "bg-indigo-50" : isOdd ? "bg-white" : "bg-[#f7f8fc]";
              const isRowEditing = editCell?.id === row._id;

              return (
              <tr
                key={row._id}
                className={`${isRowEditing ? "bg-[#fffde7]" : rowBg} hover:bg-[#eef2ff] group transition-colors`}
              >
                {/* Checkbox */}
                <td className={`${COL_NUM} text-center`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleRow(row._id)}
                    className="w-3.5 h-3.5 cursor-pointer accent-indigo-600"
                  />
                </td>

                {/* Sr. No. */}
                <td className={`${COL_NUM} text-slate-400 font-mono text-center`}>
                  {idx + 1}
                </td>

                {/* Bank/cash name — read-only */}
                <td className={`${COL_CELL} font-medium text-slate-800`}>
                  {row.accountName}
                </td>

                {/* Date — editable */}
                <EditableCell row={row} field="date" value={row.date} inputType="date" mono>
                  <span className="font-mono text-slate-600 cursor-cell block">
                    {fmtDate(row.date)}
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

                {/* Permanent Checkmark (Only shown if modified) */}
                <td className={`${COL_CELL} text-center w-10 bg-emerald-50/10`}>
                  {row.isChanged && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 border border-emerald-100 animate-in zoom-in-50 duration-200">
                      <Check size={12} className="text-emerald-600 stroke-[3]" />
                    </span>
                  )}
                </td>

                {/* Delete button */}
                <td className={`${COL_CELL} text-center w-12`}>
                  <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onDelete(row)} title="Delete row"
                      className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          }))}

          {/* Totals row */}
          <tr className="bg-[#f8fafc] font-semibold border-t-2 border-slate-300">
            <td className={COL_NUM}>Σ</td>
            <td className={`${COL_CELL} text-slate-500`} colSpan={4}>
              Total ({rows.length} entries)
            </td>
            <td className={`${COL_CELL} text-right font-mono font-bold text-red-600`}>
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
  const [showCreateAccModal, setShowCreateAccModal] = useState(false);
  const [creatingAcc, setCreatingAcc]               = useState(false);
  const [groupNames,      setGroupNames]      = useState<string[]>([]);
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [bulkAccName,     setBulkAccName]     = useState("");
  const [bulkAccGroup,    setBulkAccGroup]    = useState("");
  const [bulkSaving,      setBulkSaving]      = useState(false);
  const [colFilters,      setColFilters]      = useState({
    srNo: "",
    accountName: "",
    date: "",
    particulars: "",
    withdrawal: "",
    deposit: "",
    balance: "",
    contraAccountName: "",
    contraAccountGroup: "",
    modified: "",
  });

  useEffect(() => {
    setColFilters({
      srNo: "",
      accountName: "",
      date: "",
      particulars: "",
      withdrawal: "",
      deposit: "",
      balance: "",
      contraAccountName: "",
      contraAccountGroup: "",
      modified: "",
    });
  }, [accountFilter, groupTypeFilter]);

  useEffect(() => {
    getAllGroups()
      .then((grps) => {
        const names = grps.map((g) => g.groupName);
        const uniqueNames = Array.from(new Set([...names, ...CONTRA_GROUPS])).sort();
        setGroupNames(uniqueNames);
      })
      .catch(() => setGroupNames(Array.from(CONTRA_GROUPS)));
  }, [selectedFY?._id]);

  const loadRows = useCallback(async (accId: string) => {
    setLoading(true);
    try {
      const [entriesData, accountsData] = await Promise.all([
        accId === "all" ? getAllEntries() : getEntriesForAccount(accId),
        getAllAccounts()
      ]);
      setRows(entriesData);
      setAccounts(accountsData);
    } catch {
      toast.error("Failed to load entries");
    } finally {
      setLoading(false);
    }
  }, [selectedFY?._id]);

  useEffect(() => {
    getAllAccounts().then(setAccounts).catch(() => toast.error("Failed to load accounts"));
  }, [selectedFY?._id]);

  useEffect(() => {
    loadRows(accountFilter);
  }, [accountFilter, loadRows]);

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
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  }, [modal, accountFilter, loadRows]);

  const handleCreateAccountSubmit = useCallback(async (data: { name: string; group: "Bank" | "Cash"; openingBalance: number }) => {
    if (!data.name.trim()) {
      toast.error("Please enter an account name");
      return;
    }
    setCreatingAcc(true);
    try {
      const newAcc = await createAccount({
        name: data.name.trim(),
        group: data.group,
        openingBalance: data.openingBalance || 0
      });
      toast.success(`Account "${newAcc.name}" created successfully!`);
      const freshAccounts = await getAllAccounts();
      setAccounts(freshAccounts);
      setAccountFilter(newAcc._id);
      setGroupTypeFilter("all");
      setShowCreateAccModal(false);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message || "Failed to create account");
    } finally {
      setCreatingAcc(false);
    }
  }, []);

  const handleDelete = useCallback(async (row: BankCashRow) => {
    if (!window.confirm(`Delete entry: "${row.particulars.slice(0, 50)}"?`)) return;
    try {
      await deleteEntry(row._id);
      toast.success("Entry deleted");
      await loadRows(accountFilter);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [accountFilter, loadRows]);

  const handleClearEntries = useCallback(async (acc: BankCashAccount) => {
    if (!window.confirm(
      `⚠️ This will permanently delete ALL entries for "${acc.name}".\n\nThis cannot be undone. Are you sure?`
    )) return;
    try {
      const res = await clearEntriesForAccount(acc._id);
      toast.success(res.message || `Cleared all entries for ${acc.name}`);
      if (accountFilter === acc._id) {
        await loadRows(acc._id);
      } else {
        await loadRows(accountFilter);
      }
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message || "Failed to clear entries");
    }
  }, [accountFilter, loadRows]);

  const handleDeleteAccount = useCallback(async (acc: BankCashAccount) => {
    if (!window.confirm(
      `⚠️ WARNING: This will permanently delete the account "${acc.name}" AND ALL its associated entries.\n\nThis cannot be undone. Are you sure?`
    )) return;
    try {
      await deleteAccount(acc._id);
      toast.success(`Deleted account "${acc.name}"`);
      setAccountFilter("all");
      setGroupTypeFilter("all");
      const [entriesData, accountsData] = await Promise.all([
        getAllEntries(),
        getAllAccounts()
      ]);
      setRows(entriesData);
      setAccounts(accountsData);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message || "Failed to delete account");
    }
  }, [loadRows]);

  // Called by ExcelTable when user edits a cell inline
  const handleCellSave = useCallback(async (id: string, patch: Partial<EntryPayload>) => {
    try {
      await updateEntry(id, patch);
      toast.success("Saved", { duration: 1200, icon: "✓" });
      await loadRows(accountFilter);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
  }, [accountFilter, loadRows]);

  // Called when user edits the Opening Balance row
  const handleOpeningBalanceChange = useCallback(async (newBalance: number, targetAccountId?: string) => {
    const activeId = targetAccountId || accountFilter;
    if (activeId === "all") return;
    try {
      await updateAccount(activeId, { openingBalance: newBalance });
      toast.success("Opening balance updated", { duration: 1500, icon: "✓" });
      // Reload accounts (to update the summary card) and entries (to recompute running balances)
      const [freshAccounts] = await Promise.all([getAllAccounts()]);
      setAccounts(freshAccounts);
      await loadRows(accountFilter);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message || "Failed to update opening balance");
    }
  }, [accountFilter, loadRows]);


  const handleBulkEdit = useCallback(async () => {
    if (!bulkAccName.trim() && !bulkAccGroup) {
      toast.error("Enter an Account Name or select a Group to apply");
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkSaving(true);
    try {
      await Promise.all(ids.map((id) => {
        const patch: Partial<EntryPayload> = {};
        if (bulkAccName.trim())  patch.contraAccountName  = bulkAccName.trim();
        if (bulkAccGroup)        patch.contraAccountGroup = bulkAccGroup as any;
        return updateEntry(id, patch);
      }));
      toast.success(`Updated ${ids.length} entries`);
      setSelectedIds(new Set());
      setBulkAccName("");
      setBulkAccGroup("");
      await loadRows(accountFilter);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message || "Bulk update failed");
    } finally {
      setBulkSaving(false);
    }
  }, [selectedIds, bulkAccName, bulkAccGroup, accountFilter, loadRows]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`⚠️ Are you sure you want to delete the ${ids.length} selected entries? This cannot be undone.`)) return;
    setBulkSaving(true);
    try {
      await bulkDeleteEntries(ids);
      toast.success(`Successfully deleted ${ids.length} entries`);
      setSelectedIds(new Set());
      await loadRows(accountFilter);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message || "Bulk deletion failed");
    } finally {
      setBulkSaving(false);
    }
  }, [selectedIds, accountFilter, loadRows]);


  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    
    // First apply global search and type filter
    const temp = rows.filter((r) => {
      const matchSearch = !q ||
        r.particulars.toLowerCase().includes(q) ||
        r.contraAccountName.toLowerCase().includes(q) ||
        r.accountName.toLowerCase().includes(q);
      const matchType = groupTypeFilter === "all" || r.accountGroup === groupTypeFilter;
      return matchSearch && matchType;
    });

    // Add temporary 1-based Sr. No. to each item based on its position in the list
    const mapped = temp.map((row, idx) => ({ row, srNo: String(idx + 1) }));

    // Apply column-specific filters
    const filteredMapped = mapped.filter(({ row, srNo }) => {
      if (colFilters.srNo && !srNo.includes(colFilters.srNo)) return false;
      
      if (colFilters.accountName && !row.accountName.toLowerCase().includes(colFilters.accountName.toLowerCase())) return false;
      
      if (colFilters.date) {
        const displayDate = fmtDate(row.date).toLowerCase();
        const rawDate = row.date.toLowerCase();
        if (!displayDate.includes(colFilters.date.toLowerCase()) && !rawDate.includes(colFilters.date.toLowerCase())) return false;
      }
      
      if (colFilters.particulars && !row.particulars.toLowerCase().includes(colFilters.particulars.toLowerCase())) return false;
      
      if (colFilters.withdrawal && !matchNumericFilter(row.withdrawal, colFilters.withdrawal)) return false;
      
      if (colFilters.deposit && !matchNumericFilter(row.deposit, colFilters.deposit)) return false;
      
      if (colFilters.balance && !matchNumericFilter(row.balance, colFilters.balance)) return false;
      
      if (colFilters.contraAccountName && !row.contraAccountName.toLowerCase().includes(colFilters.contraAccountName.toLowerCase())) return false;
      
      if (colFilters.contraAccountGroup && !row.contraAccountGroup.toLowerCase().includes(colFilters.contraAccountGroup.toLowerCase())) return false;
      
      if (colFilters.modified) {
        const isModified = !!row.isChanged;
        if (colFilters.modified === "edited" && !isModified) return false;
        if (colFilters.modified === "blank" && isModified) return false;
      }

      return true;
    });

    return filteredMapped.map(item => item.row);
  }, [rows, search, groupTypeFilter, colFilters]);

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
          <button onClick={() => setShowCreateAccModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm">
            <Plus size={14} /> Create Account
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
                <div key={acc._id} className="flex items-center gap-0.5">
                  <button
                    onClick={() => { setAccountFilter(acc._id); setGroupTypeFilter("all"); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-l-lg text-sm font-medium transition-all border ${
                      accountFilter === acc._id ? "bg-blue-600 text-white border-blue-600" : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                    }`}
                  >
                    <Landmark size={13} /> {acc.name}
                  </button>
                  <button
                    onClick={() => handleClearEntries(acc)}
                    title={`Clear all entries for ${acc.name}`}
                    className="flex items-center px-2.5 py-2 border border-l-0 border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  >
                    <RefreshCw size={12} />
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(acc)}
                    title={`Delete account "${acc.name}" and all entries`}
                    className="flex items-center px-2 py-2 rounded-r-lg border border-l-0 border-red-200 bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </>
          )}

          {cashAccounts.length > 0 && (
            <>
              <span className="text-xs text-slate-400 px-1 flex items-center gap-1"><Wallet size={11} /> Cash</span>
              {cashAccounts.map((acc) => (
                <div key={acc._id} className="flex items-center gap-0.5">
                  <button
                    onClick={() => { setAccountFilter(acc._id); setGroupTypeFilter("all"); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-l-lg text-sm font-medium transition-all border ${
                      accountFilter === acc._id ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                    }`}
                  >
                    <Wallet size={13} /> {acc.name}
                  </button>
                  <button
                    onClick={() => handleClearEntries(acc)}
                    title={`Clear all entries for ${acc.name}`}
                    className="flex items-center px-2.5 py-2 border border-l-0 border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  >
                    <RefreshCw size={12} />
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(acc)}
                    title={`Delete account "${acc.name}" and all entries`}
                    className="flex items-center px-2 py-2 rounded-r-lg border border-l-0 border-red-200 bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </>
          )}

          <button
            onClick={() => setShowCreateAccModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 transition-all border border-indigo-200/50 shadow-sm ml-auto"
          >
            <Plus size={13} /> Create Account
          </button>
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

      {/* ── Bulk Edit Toolbar ────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Check size={15} className="text-indigo-600" />
            <span className="text-sm font-semibold text-indigo-900">
              {selectedIds.size} row{selectedIds.size > 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 flex-wrap min-w-0">
            <input
              type="text"
              placeholder="Set Account Name..."
              value={bulkAccName}
              onChange={(e) => setBulkAccName(e.target.value)}
              className="flex-1 min-w-[160px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-xs text-slate-800 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 font-medium"
            />
            <select
              value={bulkAccGroup}
              onChange={(e) => setBulkAccGroup(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-xs text-slate-800 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 font-medium"
            >
              <option value="">-- Set Account Group --</option>
              {groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <button
              type="button"
              onClick={handleBulkEdit}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 shadow-sm"
            >
              {bulkSaving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
              Apply to {selectedIds.size} rows
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 shadow-sm"
            >
              {bulkSaving ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors"
            >
              <X size={12} /> Deselect All
            </button>

          </div>
        </div>
      )}

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
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400 bg-white border border-slate-200">
            <CreditCard size={32} className="opacity-25" />
            <p className="text-sm">No entries — add one to get started</p>
          </div>
        ) : (
          <ExcelTable
            rows={filtered}
            openingBalance={summary.openingBalance}
            onDelete={handleDelete}
            onCellSave={handleCellSave}
            contraGroups={groupNames}
            colFilters={colFilters}
            onFilterChange={setColFilters}
            onOpeningBalanceChange={handleOpeningBalanceChange}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            isAllView={accountFilter === "all"}
            accounts={accounts}
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
          contraGroups={groupNames}
        />
      )}

      {showCreateAccModal && (
        <CreateAccountModal
          loading={creatingAcc}
          onClose={() => setShowCreateAccModal(false)}
          onSubmit={handleCreateAccountSubmit}
        />
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-hidden">
          {/* Close Button */}
          <button
            onClick={() => setShowImport(false)}
            className="absolute right-6 top-6 z-50 p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
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
                window.dispatchEvent(new CustomEvent("accounting-data-updated"));
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
