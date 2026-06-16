import {
  useState, useCallback, useMemo, useRef, useEffect,
  forwardRef, useImperativeHandle,
} from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry, AllCommunityModule,
  type ColDef, type ICellRendererParams,
} from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { useForm } from "react-hook-form";
import {
  Plus, Search, RefreshCw, Pencil, Trash2, X,
  Save, BookMarked, Layers, Filter, CheckCircle2, Loader2, GitMerge,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  type Ledger, type LedgerPayload,
  getAllLedgers, createLedger, updateLedger, deleteLedger, bulkDeleteLedgers, mergeLedgers,
} from "../api/ledgerApi";
import {
  getAllGroups, createGroup, SUPER_GROUPS, type AccountGroup
} from "../api/accountGroupApi";

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Group meta ────────────────────────────────────────────────────────────────
const GROUP_META: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "Assets":           { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500"    },
  "Liabilities":      { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",     dot: "bg-red-500"     },
  "Capital":          { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200",  dot: "bg-purple-500"  },
  "Income":           { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  "Expense":          { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200",  dot: "bg-orange-500"  },
  "Bank":             { bg: "bg-cyan-50",    text: "text-cyan-700",    border: "border-cyan-200",    dot: "bg-cyan-500"    },
  "Cash":             { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500"   },
  "Purchases":        { bg: "bg-lime-50",    text: "text-lime-700",    border: "border-lime-200",    dot: "bg-lime-500"    },
  "Sales":            { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200",    dot: "bg-teal-500"    },
  "Sundry Debtors":   { bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200",  dot: "bg-indigo-500"  },
  "Sundry Creditors": { bg: "bg-pink-50",    text: "text-pink-700",    border: "border-pink-200",    dot: "bg-pink-500"    },
};

const GROUP_META_MAP: Record<string, string> = {
  "Direct Expenses": "Expense",
  "Income (Trading)": "Income",
  "Purchase Account": "Purchases",
  "Sales Account": "Sales",
  "Expense Account": "Expense",
  "Financial Expenses": "Expense",
  "Income (Other Then Sales)": "Income",
  "Indirect Expenses": "Expense",
  "Partner Interest": "Expense",
  "Partner Remuneration": "Expense",
  "Advances From Customers": "Liabilities",
  "Bank Accounts (Banks)": "Bank",
  "Bank OCC a/c": "Liabilities",
  "Capital Account": "Capital",
  "Cash Ledger A/C.": "Cash",
  "Cash-in-hand": "Cash",
  "Current Capital Account": "Capital",
  "Current Liabilities": "Liabilities",
  "Deposits (Asset)": "Assets",
  "Duties & Taxes": "Liabilities",
  "Fixed Assets": "Assets",
  "Investments": "Assets",
  "Loans & Advances (Asset)": "Assets",
  "Loans (Liability)": "Liabilities",
  "Misc. Expenses (Asset)": "Assets",
  "Profit & Loss A/c": "Capital",
  "Provisions": "Liabilities",
  "Reserves & Surplus": "Capital",
  "Salary Expenses Payable": "Liabilities",
  "Secured Loans": "Liabilities",
  "Stock-in-hand": "Assets",
  "Sundry Creditors - Material": "Sundry Creditors",
  "Sundry Creditors - Services": "Sundry Creditors",
  "Sundry Debtors": "Sundry Debtors",
  "Suspense Account": "Assets",
  "Unsecured Loans": "Liabilities",
};

let DYNAMIC_SUPER_GROUP_MAP: Record<string, string> = {};

const getGroupMeta = (group: any) => {
  const safeGroup = (typeof group === "string" ? group : "") || "Assets";
  const superGroup = DYNAMIC_SUPER_GROUP_MAP[safeGroup] || GROUP_META_MAP[safeGroup] || safeGroup;
  const key = GROUP_META_MAP[superGroup] || superGroup;
  return GROUP_META[key] || GROUP_META["Assets"] || {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-500"
  };
};

function GroupBadge({ group }: { group: string }) {
  const m = getGroupMeta(group);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${m.bg} ${m.text} ${m.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {group}
    </span>
  );
}

// ── Inline group cell editor ──────────────────────────────────────────────────
const GroupCellEditor = forwardRef(function GroupCellEditor(props: any, ref) {
  const groupsList = props.groups || [];
  const [val, setVal] = useState<string>(props.value ?? "Assets");
  const selRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { selRef.current?.focus(); }, []);
  useImperativeHandle(ref, () => ({ getValue: () => val }));
  return (
    <select
      ref={selRef}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      className="w-full h-full px-2 text-sm outline-none border-2 border-indigo-400 rounded-md bg-white"
    >
      {groupsList.map((g: any) => <option key={g} value={g}>{g}</option>)}
    </select>
  );
});

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
interface ModalProps {
  mode: "add" | "edit";
  ledger?: Ledger;
  loading: boolean;
  groups: string[];
  onClose: () => void;
  onSubmit: (data: LedgerPayload) => void;
}

function LedgerModal({ mode, ledger, loading, groups, onClose, onSubmit }: ModalProps) {
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<LedgerPayload>({
    defaultValues: { ledgerName: ledger?.ledgerName ?? "", groupName: ledger?.groupName ?? "Assets" },
  });

  useEffect(() => {
    reset({ ledgerName: ledger?.ledgerName ?? "", groupName: ledger?.groupName ?? "Assets" });
  }, [ledger, reset]);

  const selectedGroup = watch("groupName");
  const meta = getGroupMeta(selectedGroup);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${meta.bg}`}>
              <BookMarked size={16} className={meta.text} />
            </div>
            <div>
              <h2 className="text-slate-900 text-base">
                {mode === "add" ? "Add New Ledger" : "Edit Ledger"}
              </h2>
              {ledger && <p className="text-xs text-slate-500 mt-0.5">ID: {ledger._id}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-5">
          {/* Group Name — dropdown select */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Group Name <span className="text-red-500">*</span>
            </label>
            <select
              {...register("groupName", { required: "Group name is required" })}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-slate-700 font-medium"
            >
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            {errors.groupName && <p className="mt-1 text-xs text-red-600">Please select a group</p>}
          </div>

          {/* Ledger Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Ledger Name <span className="text-red-500">*</span>
            </label>
            <input
              {...register("ledgerName", {
                required: "Ledger name is required",
                minLength: { value: 2, message: "Minimum 2 characters" },
                maxLength: { value: 100, message: "Maximum 100 characters" },
              })}
              placeholder="e.g. Cash in Hand, HDFC Bank, ABC Corp…"
              className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all border
                ${errors.ledgerName
                  ? "border-red-300 bg-red-50 focus:ring-2 focus:ring-red-100 focus:border-red-400"
                  : "border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                }`}
            />
            {errors.ledgerName && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 text-red-600">!</span>
                {errors.ledgerName.message}
              </p>
            )}
          </div>

          {/* Preview badge */}
          {selectedGroup && (
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-500">Preview:</span>
              <GroupBadge group={selectedGroup} />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {mode === "add" ? "Create Ledger" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GroupModal({ loading, onClose, onSubmit }: {
  loading: boolean;
  onClose: () => void;
  onSubmit: (data: { groupName: string; superGroup: any }) => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ groupName: string; superGroup: any }>();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-700">
              <Layers size={16} />
            </div>
            <div>
              <h2 className="text-slate-900 text-base">Create Account Group</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-5">
          {/* Group Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Group Name <span className="text-red-500">*</span>
            </label>
            <input
              {...register("groupName", { required: "Group name is required" })}
              placeholder="e.g. Indirect Income, Custom Assets..."
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400"
            />
            {errors.groupName && <p className="mt-1 text-xs text-red-600">{errors.groupName.message}</p>}
          </div>

          {/* Super Group select */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Super Group <span className="text-red-500">*</span>
            </label>
            <select
              {...register("superGroup", { required: "Super group is required" })}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all text-slate-700 font-medium"
            >
              <option value="">-- Select Super Group --</option>
              {SUPER_GROUPS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            {errors.superGroup && <p className="mt-1 text-xs text-red-600">Please select a super group</p>}
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Create Group
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Merge Modal ──────────────────────────────────────────────────────────────
function MergeModal({
  selected,
  loading,
  onClose,
  onMerge,
}: {
  selected: Ledger[];
  loading: boolean;
  onClose: () => void;
  onMerge: (sourceIds: string[], targetId: string) => void;
}) {
  const [targetId, setTargetId] = useState<string>(selected[0]?._id ?? "");
  const target = selected.find((l) => l._id === targetId);
  const sources = selected.filter((l) => l._id !== targetId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-violet-100">
              <GitMerge size={16} className="text-violet-600" />
            </div>
            <div>
              <h2 className="text-slate-900 text-base font-semibold">Merge Ledgers</h2>
              <p className="text-xs text-slate-500 mt-0.5">{selected.length} ledgers selected</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/70 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Info banner */}
          <div className="flex gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠️</span>
            <p className="text-xs text-amber-800 leading-relaxed">
              All journal entries, bank/cash transactions, and opening balances from the
              <strong> source ledgers</strong> will be transferred to the <strong>target ledger</strong>.
              Source ledgers will be <strong>permanently deleted</strong>. This cannot be undone.
            </p>
          </div>

          {/* Pick target ledger */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Keep this ledger <span className="text-violet-600">(target)</span>
            </label>
            <div className="space-y-2">
              {selected.map((l) => (
                <label
                  key={l._id}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    targetId === l._id
                      ? "border-violet-400 bg-violet-50"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="mergeTarget"
                    value={l._id}
                    checked={targetId === l._id}
                    onChange={() => setTargetId(l._id)}
                    className="accent-violet-600"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{l.ledgerName}</p>
                    <p className="text-xs text-slate-500 truncate">{l.groupName}</p>
                  </div>
                  {targetId === l._id && (
                    <span className="text-xs bg-violet-600 text-white px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                      Target ✓
                    </span>
                  )}
                  {targetId !== l._id && (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                      Will be deleted
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Summary */}
          {target && sources.length > 0 && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <p className="font-medium text-slate-700">Merge summary:</p>
              <p>• <strong>{sources.map((s) => s.ledgerName).join(", ")}</strong> → <strong>{target.ledgerName}</strong></p>
              <p>• {sources.length} ledger(s) will be permanently deleted</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onMerge(sources.map((s) => s._id), targetId)}
              disabled={loading || sources.length === 0}
              className="flex items-center gap-2 px-5 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />}
              Merge Ledgers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LedgerMaster() {
  const [rows, setRows]         = useState<Ledger[]>([]);
  const [groups, setGroups]     = useState<AccountGroup[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [search, setSearch]     = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("All");
  const [modal, setModal]       = useState<{ mode: "add" | "edit"; ledger?: Ledger } | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeSaving, setMergeSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const gridRef                 = useRef<AgGridReact<Ledger>>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setSelectedIds([]);
    try {
      const [ledgersData, groupsData] = await Promise.all([getAllLedgers(), getAllGroups()]);
      setRows(ledgersData);
      setGroups(groupsData);
      // Update dynamic map
      DYNAMIC_SUPER_GROUP_MAP = {};
      groupsData.forEach((g) => {
        DYNAMIC_SUPER_GROUP_MAP[g.groupName] = g.superGroup;
      });
    } catch {
      toast.error("Failed to load ledgers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreateGroup = useCallback(async (data: { groupName: string; superGroup: any }) => {
    setGroupSaving(true);
    try {
      const created = await createGroup(data);
      setGroups((p) => [...p, created]);
      DYNAMIC_SUPER_GROUP_MAP[created.groupName] = created.superGroup;
      toast.success(`Account group "${created.groupName}" created!`);
      setGroupModalOpen(false);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message || "Failed to create group");
    } finally {
      setGroupSaving(false);
    }
  }, []);

  // ── CRUD ────────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (data: LedgerPayload) => {
    setSaving(true);
    try {
      if (modal?.mode === "add") {
        const created = await createLedger(data);
        setRows((p) => [created, ...p]);
        toast.success(`Ledger "${created.ledgerName}" created`);
      } else if (modal?.ledger) {
        const updated = await updateLedger(modal.ledger._id, data);
        setRows((p) => p.map((r) => r._id === updated._id ? updated : r));
        toast.success(`Ledger "${updated.ledgerName}" updated`);
      }
      setModal(null);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  }, [modal]);

  const handleDelete = useCallback(async (ledger: Ledger) => {
    if (!window.confirm(`Delete "${ledger.ledgerName}"? This cannot be undone.`)) return;
    try {
      await deleteLedger(ledger._id);
      setRows((p) => p.filter((r) => r._id !== ledger._id));
      toast.success(`"${ledger.ledgerName}" deleted`);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message);
    }
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete the ${selectedIds.length} selected ledger(s)? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await bulkDeleteLedgers(selectedIds);
      setRows((p) => p.filter((r) => !selectedIds.includes(r._id)));
      toast.success(`${selectedIds.length} ledger(s) deleted`);
      setSelectedIds([]);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message || "Failed to delete selected ledgers");
    } finally {
      setLoading(false);
    }
  }, [selectedIds]);

  const handleMerge = useCallback(async (sourceIds: string[], targetId: string) => {
    setMergeSaving(true);
    try {
      const result = await mergeLedgers(sourceIds, targetId);
      toast.success(result.message);
      setMergeModalOpen(false);
      setSelectedIds([]);
      await load();
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message || "Merge failed");
    } finally {
      setMergeSaving(false);
    }
  }, [load]);

  const onSelectionChanged = useCallback(() => {
    const selectedNodes = gridRef.current?.api.getSelectedNodes() || [];
    const ids = selectedNodes.map((node) => node.data?._id).filter(Boolean) as string[];
    setSelectedIds(ids);
  }, []);

  // ── Inline edit stop ────────────────────────────────────────────────────────
  const onCellEditingStopped = useCallback(async (e: any) => {
    const { data, column, newValue, oldValue } = e;
    if (newValue === oldValue) return;
    const field = column.colId as keyof Ledger;
    const payload: LedgerPayload = {
      ledgerName: field === "ledgerName" ? (newValue ? String(newValue).trim().toUpperCase() : "") : data.ledgerName,
      groupName:  field === "groupName"  ? newValue : data.groupName,
    };
    if (!payload.ledgerName.trim()) {
      toast.error("Ledger name cannot be empty");
      setRows((p) => p.map((r) => r._id === data._id ? { ...r, [field]: oldValue } : r));
      return;
    }
    try {
      const updated = await updateLedger(data._id, payload);
      setRows((p) => p.map((r) => r._id === updated._id ? updated : r));
      toast.success("Saved");
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.message);
      setRows((p) => p.map((r) => r._id === data._id ? { ...r, [field]: oldValue } : r));
    }
  }, []);

  // ── Filtered rows ───────────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    rows.filter((r) => {
      const matchSearch =
        r.ledgerName.toLowerCase().includes(search.toLowerCase()) ||
        r.groupName.toLowerCase().includes(search.toLowerCase());
      const matchGroup = groupFilter === "All" || r.groupName === groupFilter;
      return matchSearch && matchGroup;
    }),
  [rows, search, groupFilter]);

  // ── Group counts ────────────────────────────────────────────────────────────
  const groupCounts = useMemo(() =>
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.groupName] = (acc[r.groupName] ?? 0) + 1;
      return acc;
    }, {}),
  [rows]);

  const rowSelection = useMemo(() => ({
    mode: "multiRow" as const,
    checkboxes: true,
    headerCheckbox: true,
    enableClickSelection: false,
  }), []);

  const selectionColumnDef = useMemo(() => ({
    width: 48,
    pinned: "left" as const,
    suppressHeaderMenuButton: true,
  }), []);

  // ── Column definitions ──────────────────────────────────────────────────────
  const columnDefs = useMemo<ColDef<Ledger>[]>(() => [
    {
      headerName: "#",
      width: 64,
      sortable: false,
      editable: false,
      valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
      cellStyle: { color: "#94a3b8", fontSize: "12px", textAlign: "center" } as any,
    },
    {
      field: "ledgerName",
      headerName: "Ledger Name",
      flex: 1,
      minWidth: 200,
      editable: true,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellRenderer: (p: ICellRendererParams<Ledger>) => (
        <div className="flex items-center gap-2.5 h-full">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${p.data ? getGroupMeta(p.data.groupName).bg : "bg-slate-100"}`}>
            <BookMarked size={13} className={p.data ? getGroupMeta(p.data.groupName).text : "text-slate-400"} />
          </div>
          <span className="text-sm font-medium text-slate-800">{p.value}</span>
        </div>
      ),
    },
    {
      field: "groupName",
      headerName: "Group Name",
      width: 200,
      editable: true,
      cellEditor: GroupCellEditor,
      cellEditorParams: {
        groups: groups.map((g) => g.groupName).sort()
      },
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellRenderer: (p: ICellRendererParams<Ledger>) =>
        p.value ? (
          <div className="flex items-center h-full">
            <GroupBadge group={p.value} />
          </div>
        ) : null,
    },
    {
      field: "createdAt",
      headerName: "Created",
      width: 150,
      editable: false,
      filter: "agDateColumnFilter",
      floatingFilter: true,
      valueFormatter: (p) =>
        new Date(p.value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      cellStyle: { color: "#64748b", fontSize: "12px" } as any,
    },
    {
      field: "updatedAt",
      headerName: "Last Modified",
      width: 150,
      editable: false,
      valueFormatter: (p) =>
        new Date(p.value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      cellStyle: { color: "#64748b", fontSize: "12px" } as any,
    },
    {
      headerName: "Actions",
      width: 110,
      sortable: false,
      editable: false,
      pinned: "right",
      cellRenderer: (p: ICellRendererParams<Ledger>) => {
        if (!p.data) return null;
        return (
          <div className="flex items-center gap-1 h-full">
            <button
              onClick={() => setModal({ mode: "edit", ledger: p.data! })}
              title="Edit"
              className="p-1.5 rounded-md hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => handleDelete(p.data!)}
              title="Delete"
              className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      },
    },
  ], [handleDelete, groups]);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Ledger Master</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {rows.length} ledgers across {Object.keys(groupCounts).length} groups
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            title="Refresh"
            className="p-2 border border-slate-200 bg-white rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          {selectedIds.length >= 2 && (
            <button
              onClick={() => setMergeModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 transition-colors shadow-sm animate-in fade-in slide-in-from-right-2 duration-200"
            >
              <GitMerge size={15} /> Merge ({selectedIds.length})
            </button>
          )}
          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors shadow-sm animate-in fade-in slide-in-from-right-2 duration-200"
            >
              <Trash2 size={15} /> Delete Selected ({selectedIds.length})
            </button>
          )}
          <button
            onClick={() => setGroupModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors"
          >
            <Plus size={15} /> Create Group
          </button>
          <button
            onClick={() => setModal({ mode: "add" })}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
          >
            <Plus size={15} /> Add Ledger
          </button>
        </div>
      </div>

      {/* Search + Quick Filter row */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ledger name or group…"
            className="bg-transparent text-sm outline-none text-slate-700 placeholder-slate-400 w-full"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Group Filter Dropdown */}
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-slate-400" />
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
          >
            <option value="All">All Groups ({rows.length})</option>
            {groups.map((g) => g.groupName).sort().map((groupName) => {
              const count = groupCounts[groupName] ?? 0;
              return (
                <option key={groupName} value={groupName}>
                  {groupName} ({count})
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-500 ml-auto">
          <Filter size={14} />
          <span className="font-medium text-slate-700">{filtered.length} results</span>
        </div>
        <p className="text-xs text-slate-400 hidden lg:block w-full border-t border-slate-50 pt-2 mt-1">
          Double-click a cell to edit inline · Use column filter icons for advanced search
        </p>
      </div>

      {/* AG Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-sm">Loading ledgers…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
              <BookMarked size={24} className="text-slate-400" />
            </div>
            <p className="text-slate-500 text-sm">
              {search || groupFilter !== "All"
                ? "No ledgers match your search or filter"
                : "No ledgers yet — add one to get started"}
            </p>
            {!search && groupFilter === "All" && (
              <button
                onClick={() => setModal({ mode: "add" })}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors mt-1"
              >
                <Plus size={14} /> Add First Ledger
              </button>
            )}
          </div>
        ) : (
          <div
            className="ag-theme-quartz"
            style={{ height: Math.max(400, Math.min(filtered.length * 52 + 110, 620)) }}
          >
            <AgGridReact<Ledger>
              theme="legacy"
              ref={gridRef}
              rowData={filtered}
              columnDefs={columnDefs}
              defaultColDef={{
                resizable: true,
                sortable: true,
                floatingFilterComponentParams: { suppressFilterButton: false },
              }}
              rowSelection={rowSelection}
              selectionColumnDef={selectionColumnDef}
              onSelectionChanged={onSelectionChanged}
              onCellEditingStopped={onCellEditingStopped}
              rowHeight={52}
              headerHeight={44}
              floatingFiltersHeight={40}
              animateRows
              stopEditingWhenCellsLoseFocus
              getRowId={(p) => p.data._id}
              rowClassRules={{
                "hover:bg-slate-50": () => true,
              }}
            />
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <LedgerModal
          mode={modal.mode}
          ledger={modal.ledger}
          loading={saving}
          groups={groups.map((g) => g.groupName).sort()}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
        />
      )}

      {/* Group Modal */}
      {groupModalOpen && (
        <GroupModal
          loading={groupSaving}
          onClose={() => setGroupModalOpen(false)}
          onSubmit={handleCreateGroup}
        />
      )}

      {/* Merge Modal */}
      {mergeModalOpen && selectedIds.length >= 2 && (
        <MergeModal
          selected={rows.filter((r) => selectedIds.includes(r._id))}
          loading={mergeSaving}
          onClose={() => setMergeModalOpen(false)}
          onMerge={handleMerge}
        />
      )}
    </div>
  );
}
