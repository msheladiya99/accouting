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
  Download, Upload, FileSpreadsheet, Lock as LockIcon, Unlock as UnlockIcon,
} from "lucide-react";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import {
  type Ledger, type LedgerPayload, LEDGER_GROUPS,
  createLedger, updateLedger, deleteLedger, bulkDeleteLedgers, mergeLedgers,
  saveBulkOpeningBalances,
} from "../api/ledgerApi";
import {
  createGroup, SUPER_GROUPS, type AccountGroup, mergeGroups,
  updateGroup, deleteGroup, SUPER_GROUP_PARENTS, SUPER_GROUP_STATEMENT,
  bulkLockGroups
} from "../api/accountGroupApi";
import { useLedgersRaw, useGroups as useQueryGroups } from "../hooks/useReportQueries";
import { LedgerMasterSkeleton, RefreshingBadge } from "../components/SkeletonLoaders";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS, invalidateAllReports } from "../api/queryClient";

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
  "Sub Capital": "Capital",
  "SUB CAPITAL": "Capital",
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

// Levenshtein distance
function getLevenshteinDistance(a: string, b: string): number {
  const tmp = [];
  let i, j;
  for (i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (j = 1; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1, // deletion
        tmp[i][j - 1] + 1, // insertion
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      );
    }
  }
  return tmp[a.length][b.length];
}

// Dice's coefficient
function getDiceCoefficient(str1: string, str2: string): number {
  const s1 = str1.trim().toLowerCase().replace(/\s+/g, "");
  const s2 = str2.trim().toLowerCase().replace(/\s+/g, "");
  
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0.0;

  const getBigrams = (str: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  };

  const bigrams1 = getBigrams(s1);
  const bigrams2 = getBigrams(s2);
  
  let intersection = 0;
  for (const bigram of bigrams1) {
    if (bigrams2.has(bigram)) {
      intersection++;
    }
  }

  return (2.0 * intersection) / (bigrams1.size + bigrams2.size);
}

// Combined similarity score
function getLedgerSimilarity(name1: string, name2: string): number {
  const n1 = name1.trim().toLowerCase();
  const n2 = name2.trim().toLowerCase();
  
  if (n1 === n2) return 1.0;
  
  const distance = getLevenshteinDistance(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);
  const levSimilarity = maxLen > 0 ? 1.0 - distance / maxLen : 0.0;
  
  const diceSimilarity = getDiceCoefficient(n1, n2);
  
  return Math.max(levSimilarity, diceSimilarity);
}

// Cluster duplicate grouping (max 4 per group)
function findDuplicateGroups(ledgers: Ledger[], threshold: number): Ledger[][] {
  const groups: Ledger[][] = [];
  const visited = new Set<string>();

  const sortedLedgers = [...ledgers].sort((a, b) => a.ledgerName.localeCompare(b.ledgerName));

  for (let i = 0; i < sortedLedgers.length; i++) {
    const l1 = sortedLedgers[i];
    if (visited.has(l1._id)) continue;

    const group: Ledger[] = [l1];
    
    for (let j = 0; j < sortedLedgers.length; j++) {
      if (i === j) continue;
      const l2 = sortedLedgers[j];
      if (visited.has(l2._id)) continue;

      const sim = getLedgerSimilarity(l1.ledgerName, l2.ledgerName);
      if (sim >= threshold) {
        group.push(l2);
        if (group.length === 4) break; // Limit group size to max 4
      }
    }

    if (group.length > 1) {
      group.forEach((l) => visited.add(l._id));
      groups.push(group);
    }
  }

  return groups;
}

// Cluster duplicate account groups grouping (max 4 per group)
function findDuplicateAccountGroups(groups: AccountGroup[], threshold: number): AccountGroup[][] {
  const clusters: AccountGroup[][] = [];
  const visited = new Set<string>();

  const sortedGroups = [...groups].sort((a, b) => a.groupName.localeCompare(b.groupName));

  for (let i = 0; i < sortedGroups.length; i++) {
    const g1 = sortedGroups[i];
    if (visited.has(g1._id)) continue;

    const cluster: AccountGroup[] = [g1];
    
    for (let j = 0; j < sortedGroups.length; j++) {
      if (i === j) continue;
      const g2 = sortedGroups[j];
      if (visited.has(g2._id)) continue;

      const sim = getLedgerSimilarity(g1.groupName, g2.groupName);
      if (sim >= threshold) {
        cluster.push(g2);
        if (cluster.length === 4) break; // Limit group size to max 4
      }
    }

    if (cluster.length > 1) {
      cluster.forEach((g) => visited.add(g._id));
      clusters.push(cluster);
    }
  }

  return clusters;
}

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
      {/* If the current group is not in the standard list, show it as a selectable option */}
      {val && !groupsList.includes(val) && (
        <option value={val}>{val}</option>
      )}
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
    defaultValues: { ledgerName: ledger?.ledgerName ?? "", groupName: ledger?.groupName ?? "" },
  });

  useEffect(() => {
    // Always reset to the ledger's actual current group — never fall back to a different group
    reset({
      ledgerName: ledger?.ledgerName ?? "",
      groupName: ledger?.groupName ?? (groups[0] ?? ""),
    });
  }, [ledger, groups, reset]);

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
              <option value="" disabled>-- Select Group --</option>
              {/* If the ledger's current group is not in the standard list, show it as a selectable option */}
              {ledger?.groupName && !groups.includes(ledger.groupName) && (
                <option value={ledger.groupName}>{ledger.groupName}</option>
              )}
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
                onChange: (e) => {
                  e.target.value = e.target.value.toUpperCase();
                }
              })}
              placeholder="e.g. CASH IN HAND, HDFC BANK, ABC CORP…"
              className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all border uppercase
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

function GroupModal({
  loading,
  onClose,
  onSubmit,
  group,
}: {
  loading: boolean;
  onClose: () => void;
  onSubmit: (data: { groupName: string; superGroup: any }) => void;
  group?: AccountGroup;
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<{ groupName: string; superGroup: any }>({
    defaultValues: {
      groupName: group?.groupName ?? "",
      superGroup: group?.superGroup ?? "",
    }
  });

  const [selectedSide, setSelectedSide] = useState<string | null>(
    group?.superGroup ? SUPER_GROUP_PARENTS[group.superGroup] : null
  );
  const [selectedStmt, setSelectedStmt] = useState<string | null>(
    group?.superGroup ? SUPER_GROUP_STATEMENT[group.superGroup] : null
  );

  const currentSuperGroup = watch("superGroup") as string;

  // If superGroup changes from the dropdown, sync the side and statement
  const handleSuperGroupSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setValue("superGroup", val);
    if (val) {
      setSelectedSide(SUPER_GROUP_PARENTS[val as SuperGroup]);
      setSelectedStmt(SUPER_GROUP_STATEMENT[val as SuperGroup]);
    }
  };

  const handleSideClick = (sideOpt: string) => {
    const nextSide = selectedSide === sideOpt ? null : sideOpt;
    setSelectedSide(nextSide);
    
    if (nextSide) {
      // Find the first supergroup that matches nextSide and selectedStmt
      const match = SUPER_GROUPS.find((g) => {
        const matchesSide = SUPER_GROUP_PARENTS[g] === nextSide;
        const matchesStmt = !selectedStmt || SUPER_GROUP_STATEMENT[g] === selectedStmt;
        return matchesSide && matchesStmt;
      });
      if (match) {
        setValue("superGroup", match);
        setSelectedStmt(SUPER_GROUP_STATEMENT[match]);
      } else {
        // Fallback to find any match with just nextSide
        const fallbackMatch = SUPER_GROUPS.find((g) => SUPER_GROUP_PARENTS[g] === nextSide);
        if (fallbackMatch) {
          setValue("superGroup", fallbackMatch);
          setSelectedStmt(SUPER_GROUP_STATEMENT[fallbackMatch]);
        }
      }
    } else {
      setValue("superGroup", "");
      setSelectedStmt(null);
    }
  };

  const handleStmtClick = (stmtOpt: string) => {
    const nextStmt = selectedStmt === stmtOpt ? null : stmtOpt;
    setSelectedStmt(nextStmt);
    
    if (nextStmt) {
      // Find the first supergroup that matches selectedSide and nextStmt
      const match = SUPER_GROUPS.find((g) => {
        const matchesSide = !selectedSide || SUPER_GROUP_PARENTS[g] === selectedSide;
        const matchesStmt = SUPER_GROUP_STATEMENT[g] === nextStmt;
        return matchesSide && matchesStmt;
      });
      if (match) {
        setValue("superGroup", match);
        setSelectedSide(SUPER_GROUP_PARENTS[match]);
      } else {
        // Fallback to find any match with just nextStmt
        const fallbackMatch = SUPER_GROUPS.find((g) => SUPER_GROUP_STATEMENT[g] === nextStmt);
        if (fallbackMatch) {
          setValue("superGroup", fallbackMatch);
          setSelectedSide(SUPER_GROUP_PARENTS[fallbackMatch]);
        }
      }
    } else {
      setValue("superGroup", "");
      setSelectedSide(null);
    }
  };

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
              <h2 className="text-slate-900 text-base">{group ? "Edit Account Group" : "Create Account Group"}</h2>
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

          {/* B/S Side selector */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-slate-700">
                1. Select B/S Side <span className="text-red-500">*</span>
              </label>
              {selectedSide && (
                <button
                  type="button"
                  onClick={() => handleSideClick(selectedSide)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 underline font-medium"
                >
                  Clear filter
                </button>
              )}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {(["Assets","Liabilities","Capital","Income","Expense"] as const).map((opt) => {
                const active = selectedSide === opt;
                const colors: Record<string, { act: string; idle: string; dot: string }> = {
                  "Assets":      { act: "bg-teal-600 text-white border-teal-600",   idle: "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300", dot: "bg-teal-400" },
                  "Liabilities": { act: "bg-violet-600 text-white border-violet-600", idle: "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300", dot: "bg-violet-400" },
                  "Capital":     { act: "bg-amber-500 text-white border-amber-500",   idle: "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300", dot: "bg-amber-400" },
                  "Income":      { act: "bg-emerald-600 text-white border-emerald-600", idle: "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300", dot: "bg-emerald-400" },
                  "Expense":     { act: "bg-rose-600 text-white border-rose-600",    idle: "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300", dot: "bg-rose-400" },
                };
                const c = colors[opt];
                return (
                  <button
                    type="button"
                    key={opt}
                    onClick={() => handleSideClick(opt)}
                    className={`flex flex-col items-center gap-1 px-1 py-2.5 rounded-lg border text-center transition-all text-[11px] font-bold ${active ? c.act : c.idle} ${active ? "shadow-md scale-[1.03]" : "opacity-75"}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${active ? "bg-white/70" : c.dot}`} />
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Affects Statement selector */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-slate-700">
                2. Select Statement Affect <span className="text-red-500">*</span>
              </label>
              {selectedStmt && (
                <button
                  type="button"
                  onClick={() => handleStmtClick(selectedStmt)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 underline font-medium"
                >
                  Clear filter
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: "Trading A/c",   label: "Trading A/c",   sub: "Gross profit / loss", act: "bg-teal-700 border-teal-800 text-white",    idle: "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300" },
                { key: "P&L A/c",       label: "P&L A/c",       sub: "Net profit / loss",   act: "bg-[#7a2e1a] border-[#5a1e0e] text-white",  idle: "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300" },
                { key: "Balance Sheet", label: "B/S",           sub: "Assets & liabilities",act: "bg-indigo-800 border-indigo-900 text-white", idle: "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300" },
              ] as const).map((opt) => {
                const active = selectedStmt === opt.key;
                return (
                  <button
                    type="button"
                    key={opt.key}
                    onClick={() => handleStmtClick(opt.key)}
                    className={`flex flex-col items-center text-center px-2 py-3 rounded-xl border transition-all ${active ? opt.act + " shadow-md scale-[1.02]" : opt.idle + " opacity-75"}`}
                  >
                    <span className={`text-xs font-bold leading-tight ${active ? "text-white" : "text-slate-700"}`}>{opt.label}</span>
                    <span className={`text-[10px] mt-0.5 leading-tight ${active ? "text-white/80" : "text-slate-400"}`}>{opt.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Super Group select */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              3. Super Group <span className="text-red-500">*</span>
            </label>
            <select
              {...register("superGroup", { required: "Super group is required" })}
              onChange={handleSuperGroupSelectChange}
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
              {group ? "Save Changes" : "Create Group"}
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

// ── Merge Groups Modal ────────────────────────────────────────────────────────
function MergeGroupsModal({
  groups,
  loading,
  onClose,
  onMerge,
  defaultSourceIds = [],
  defaultTargetId = "",
}: {
  groups: AccountGroup[];
  loading: boolean;
  onClose: () => void;
  onMerge: (sourceIds: string[], targetId: string) => void;
  defaultSourceIds?: string[];
  defaultTargetId?: string;
}) {
  const [sourceSearch, setSourceSearch] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(defaultSourceIds);
  const [targetId, setTargetId] = useState<string>(defaultTargetId);

  // Sort groups alphabetically by name
  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => a.groupName.localeCompare(b.groupName));
  }, [groups]);

  // Filter groups for source selection based on search input
  const filteredSourceGroups = useMemo(() => {
    return sortedGroups.filter((g) =>
      g.groupName.toLowerCase().includes(sourceSearch.toLowerCase())
    );
  }, [sortedGroups, sourceSearch]);

  // Target groups list: show all groups on both sides as requested
  const availableTargetGroups = useMemo(() => {
    return sortedGroups.filter((g) =>
      g.groupName.toLowerCase().includes(targetSearch.toLowerCase())
    );
  }, [sortedGroups, targetSearch]);

  const hasOverlap = selectedSourceIds.includes(targetId);

  // Toggle source selection
  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) => {
      const isSelected = prev.includes(id);
      return isSelected ? prev.filter((item) => item !== id) : [...prev, id];
    });
  };

  const handleConfirmMerge = () => {
    if (selectedSourceIds.length === 0 || !targetId || hasOverlap) return;
    const targetGroup = groups.find((g) => g._id === targetId);
    const sourceNames = groups
      .filter((g) => selectedSourceIds.includes(g._id))
      .map((g) => g.groupName)
      .join(", ");
    
    if (
      window.confirm(
        `Are you sure you want to merge these group(s):\n"${sourceNames}"\n\ninto the target group:\n"${targetGroup?.groupName}"?\n\nThis will reassign all ledgers and transaction references, and delete the source group(s) permanently.`
      )
    ) {
      onMerge(selectedSourceIds, targetId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-purple-50 to-indigo-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-purple-100 text-purple-700">
              <GitMerge size={16} />
            </div>
            <div>
              <h2 className="text-slate-900 text-base font-semibold">Merge Account Groups</h2>
              <p className="text-xs text-slate-500 mt-0.5">Combine groups and reassign all their ledgers</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/70 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-grow">
          {/* Warning banner */}
          <div className="flex gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-amber-500 mt-0.5 flex-shrink-0 text-sm">⚠️</span>
            <p className="text-xs text-amber-800 leading-relaxed">
              All ledgers belonging to the <strong>source groups</strong> will be moved to the <strong>target group</strong>.
              All existing transaction references (debitGroup, creditGroup, etc.) will be rewritten.
              Source groups will be <strong>permanently deleted</strong>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column: Select Sources */}
            <div className="flex flex-col h-[280px]">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                1. Select Source Group(s) ({selectedSourceIds.length} chosen)
              </label>
              {/* Search source groups */}
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-200 mb-2 flex-shrink-0">
                <Search size={13} className="text-slate-400" />
                <input
                  value={sourceSearch}
                  onChange={(e) => setSourceSearch(e.target.value)}
                  placeholder="Filter source groups..."
                  className="bg-transparent text-xs outline-none text-slate-700 w-full placeholder-slate-400"
                />
              </div>
              <div className="border border-slate-200 rounded-xl overflow-y-auto flex-grow divide-y divide-slate-100 bg-slate-50/30">
                {filteredSourceGroups.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">No groups match search</div>
                ) : (
                  filteredSourceGroups.map((g) => {
                    const isChecked = selectedSourceIds.includes(g._id);
                    return (
                      <label
                        key={g._id}
                        onClick={() => toggleSource(g._id)}
                        className={`flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer select-none transition-colors ${
                          isChecked ? "bg-purple-50 text-purple-900" : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="rounded text-purple-600 focus:ring-purple-400"
                        />
                        <span className="font-medium truncate">{g.groupName}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Select Target */}
            <div className="flex flex-col h-[280px]">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                2. Select Target Group
              </label>
              {/* Search target groups */}
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-200 mb-2 flex-shrink-0">
                <Search size={13} className="text-slate-400" />
                <input
                  value={targetSearch}
                  onChange={(e) => setTargetSearch(e.target.value)}
                  placeholder="Filter target groups..."
                  className="bg-transparent text-xs outline-none text-slate-700 w-full placeholder-slate-400"
                />
              </div>
              <div className="border border-slate-200 rounded-xl overflow-y-auto flex-grow divide-y divide-slate-100 bg-slate-50/30">
                {availableTargetGroups.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">No target groups available</div>
                ) : (
                  availableTargetGroups.map((g) => {
                    const isChecked = targetId === g._id;
                    return (
                      <label
                        key={g._id}
                        onClick={() => setTargetId(g._id)}
                        className={`flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer select-none transition-colors ${
                          isChecked ? "bg-indigo-50 text-indigo-900" : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name="groupMergeTarget"
                          checked={isChecked}
                          readOnly
                          className="text-indigo-600 focus:ring-indigo-400"
                        />
                        <span className="font-medium truncate">{g.groupName}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Overlap Error Banner */}
          {hasOverlap && (
            <div className="flex gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl animate-in fade-in duration-200">
              <span className="text-red-500 mt-0.5 flex-shrink-0 text-sm">❌</span>
              <p className="text-xs text-red-800 leading-relaxed font-semibold">
                Invalid Merge Selection: The target group cannot also be selected as a source group. Please deselect it from either column.
              </p>
            </div>
          )}

          {/* Merge summary */}
          {!hasOverlap && selectedSourceIds.length > 0 && targetId && (() => {
            const targetGroup = groups.find((g) => g._id === targetId);
            const sourceGroupsText = groups
              .filter((g) => selectedSourceIds.includes(g._id))
              .map((g) => g.groupName)
              .join(", ");
            return (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1 animate-in fade-in duration-200">
                <p className="font-semibold text-slate-700">Merge configuration:</p>
                <p>• Merge: <strong className="text-purple-700">{sourceGroupsText}</strong></p>
                <p>• Into: <strong className="text-indigo-700">{targetGroup?.groupName}</strong></p>
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmMerge}
            disabled={loading || selectedSourceIds.length === 0 || !targetId || hasOverlap}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors disabled:opacity-50 font-medium"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />}
            Merge Groups
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LedgerMaster() {
  const qc = useQueryClient();

  // React Query hooks — raw ledgers and groups list (cached and fast)
  const { data: qLedgers, refetch: refetchLedgers, isLoading: isLoadingLedgers, isFetching: isFetchingLedgers } = useLedgersRaw();
  const { data: qGroups, refetch: refetchGroups, isLoading: isLoadingGroups, isFetching: isFetchingGroups } = useQueryGroups();

  const [rows, setRows]         = useState<Ledger[]>([]);
  const [groups, setGroups]     = useState<AccountGroup[]>([]);
  const [saving, setSaving]     = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [search, setSearch]     = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("All");
  const [modal, setModal]       = useState<{ mode: "add" | "edit"; ledger?: Ledger } | null>(null);
  const [activeTab, setActiveTab] = useState<"ledgers" | "groups">("ledgers");
  const [groupEditModal, setGroupEditModal] = useState<{ mode: "add" | "edit"; group?: AccountGroup } | null>(null);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeSaving, setMergeSaving] = useState(false);
  const [mergeGroupsModalOpen, setMergeGroupsModalOpen] = useState(false);
  const [mergeGroupsSaving, setMergeGroupsSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState("");

  const filteredGroups = useMemo(() => {
    const q = groupSearch.toLowerCase().trim();
    if (!q) return groups;
    return groups.filter(
      (g) => g.groupName.toLowerCase().includes(q) || g.superGroup.toLowerCase().includes(q)
    );
  }, [groups, groupSearch]);
  const gridRef                 = useRef<AgGridReact<Ledger>>(null);

  // Duplicate Matching States
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(0.5); // Default 50%
  const [suggestionsExpanded, setSuggestionsExpanded] = useState<boolean>(false);
  const [ignoredGroups, setIgnoredGroups] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("ap_ignored_duplicates");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleIgnoreGroup = useCallback((groupIds: string[]) => {
    const key = [...groupIds].sort().join(",");
    const updated = [...ignoredGroups, key];
    setIgnoredGroups(updated);
    localStorage.setItem("ap_ignored_duplicates", JSON.stringify(updated));
    toast.success("Suggestion ignored");
  }, [ignoredGroups]);

  // Compute duplicate groups dynamically (excluding ignored groups)
  // OPTIMIZATION: Only run O(n^2) duplicate search when suggestions panel is expanded.
  const duplicateGroups = useMemo(() => {
    if (!suggestionsExpanded) return [];
    const allGroups = findDuplicateGroups(rows, similarityThreshold);
    return allGroups.filter((group) => {
      const key = group.map((l) => l._id).sort().join(",");
      return !ignoredGroups.includes(key);
    });
  }, [rows, similarityThreshold, ignoredGroups, suggestionsExpanded]);

  // Duplicate Groups Matching States
  const [groupSimilarityThreshold, setGroupSimilarityThreshold] = useState<number>(0.5); // Default 50%
  const [groupSuggestionsExpanded, setGroupSuggestionsExpanded] = useState<boolean>(false);
  const [ignoredGroupSuggestions, setIgnoredGroupSuggestions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("ap_ignored_group_duplicates");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Pre-selected groups for the merge modal
  const [preSelectedSourceIds, setPreSelectedSourceIds] = useState<string[]>([]);
  const [preSelectedTargetId, setPreSelectedTargetId] = useState<string>("");

  const handleIgnoreGroupSuggestion = useCallback((groupIds: string[]) => {
    const key = [...groupIds].sort().join(",");
    const updated = [...ignoredGroupSuggestions, key];
    setIgnoredGroupSuggestions(updated);
    localStorage.setItem("ap_ignored_group_duplicates", JSON.stringify(updated));
    toast.success("Suggestion ignored");
  }, [ignoredGroupSuggestions]);

  // Compute duplicate account groups dynamically (excluding ignored suggestions)
  // OPTIMIZATION: Only run O(n^2) duplicate search when group suggestions panel is expanded.
  const duplicateAccountGroups = useMemo(() => {
    if (!groupSuggestionsExpanded) return [];
    const clusters = findDuplicateAccountGroups(groups, groupSimilarityThreshold);
    return clusters.filter((cluster) => {
      const key = cluster.map((g) => g._id).sort().join(",");
      return !ignoredGroupSuggestions.includes(key);
    });
  }, [groups, groupSimilarityThreshold, ignoredGroupSuggestions, groupSuggestionsExpanded]);

  // Synchronize local states with React Query cache
  useEffect(() => {
    if (qLedgers) {
      setRows(qLedgers);
    }
  }, [qLedgers]);

  useEffect(() => {
    if (qGroups) {
      setGroups(qGroups);
      // Update dynamic map
      DYNAMIC_SUPER_GROUP_MAP = {};
      qGroups.forEach((g) => {
        DYNAMIC_SUPER_GROUP_MAP[g.groupName] = g.superGroup;
      });
    }
  }, [qGroups]);

  const load = useCallback(async () => {
    setSelectedIds([]);
    await Promise.all([refetchLedgers(), refetchGroups()]);
  }, [refetchLedgers, refetchGroups]);

  const loading = (isLoadingLedgers && !rows.length) || (isLoadingGroups && !groups.length);
  const refreshing = isFetchingLedgers || isFetchingGroups;

  useEffect(() => {
    // Initial sync
    if (qLedgers) setRows(qLedgers);
    if (qGroups) setGroups(qGroups);
  }, []);

  const handleSaveGroup = useCallback(async (data: { groupName: string; superGroup: any }) => {
    setGroupSaving(true);
    try {
      const payload = {
        groupName: data.groupName.trim().toUpperCase(),
        superGroup: data.superGroup.trim() as any
      };
      if (groupEditModal?.mode === "add") {
        const created = await createGroup(payload);
        setGroups((p) => [...p, created]);
        DYNAMIC_SUPER_GROUP_MAP[created.groupName] = created.superGroup;
        toast.success(`Account group "${created.groupName}" created!`);
      } else if (groupEditModal?.group) {
        const updated = await updateGroup(groupEditModal.group._id, payload);
        setGroups((p) => p.map((g) => g._id === updated._id ? updated : g));
        DYNAMIC_SUPER_GROUP_MAP[updated.groupName] = updated.superGroup;
        toast.success(`Account group "${updated.groupName}" updated!`);
      }
      setGroupEditModal(null);
      await load(); // Reload to refresh grid row mappings & group select lists
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message || "Failed to save group");
    } finally {
      setGroupSaving(false);
    }
  }, [groupEditModal, load]);

  const handleDeleteGroup = useCallback(async (group: AccountGroup) => {
    if (!window.confirm(`Delete account group "${group.groupName}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      const res = await deleteGroup(group._id);
      setGroups((p) => p.filter((g) => g._id !== group._id));
      toast.success(res.message || `Account group "${group.groupName}" deleted`);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message || "Failed to delete account group");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBulkLockGroups = useCallback(async (lock: boolean) => {
    if (selectedGroupIds.length === 0) return;
    const actionStr = lock ? "lock" : "unlock";
    if (!window.confirm(`Are you sure you want to ${actionStr} the ${selectedGroupIds.length} selected group(s)?`)) return;
    setSaving(true);
    try {
      await bulkLockGroups(selectedGroupIds, lock);
      toast.success(`Selected group(s) ${lock ? "locked" : "unlocked"} successfully`);
      setSelectedGroupIds([]);
      await load();
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message || "Failed to update lock status");
    } finally {
      setSaving(false);
    }
  }, [selectedGroupIds, load]);

  const handleToggleSingleGroupLock = useCallback(async (group: AccountGroup) => {
    const nextState = !group.isLocked;
    try {
      await bulkLockGroups([group._id], nextState);
      setGroups((p) => p.map((g) => g._id === group._id ? { ...g, isLocked: nextState } : g));
      toast.success(`Group "${group.groupName}" ${nextState ? "locked" : "unlocked"}`);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message || "Failed to update lock status");
    }
  }, []);

  // ── CRUD ────────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (data: LedgerPayload) => {
    setSaving(true);
    try {
      const payload: LedgerPayload = {
        ledgerName: data.ledgerName.trim().toUpperCase(),
        groupName: data.groupName.trim().toUpperCase() as any
      };
      if (modal?.mode === "add") {
        const created = await createLedger(payload);
        setRows((p) => [created, ...p]);
        toast.success(`Ledger "${created.ledgerName}" created`);
      } else if (modal?.ledger) {
        const updated = await updateLedger(modal.ledger._id, payload);
        setRows((p) => p.map((r) => r._id === updated._id ? updated : r));
        toast.success(`Ledger "${updated.ledgerName}" updated`);
      }
      setModal(null);
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message || "Operation failed");
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
      toast.error(e.response?.data?.message || e.message || "Failed to delete ledger");
    }
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete the ${selectedIds.length} selected ledger(s)? This cannot be undone.`)) return;
    setLoading(true);
    try {
      const result = await bulkDeleteLedgers(selectedIds);
      if (result.blocked && result.blocked.length > 0) {
        // Partial delete — some ledgers were blocked because they have entries
        toast.success(result.message, { duration: 6000 });
      } else {
        toast.success(result.message || `${result.count} ledger(s) deleted`);
      }
      setSelectedIds([]);
      await load();
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message || "Failed to delete selected ledgers", { duration: 6000 });
    } finally {
      setLoading(false);
    }
  }, [selectedIds, load]);

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

  const handleMergeGroups = useCallback(async (sourceIds: string[], targetId: string) => {
    setMergeGroupsSaving(true);
    try {
      const result = await mergeGroups(sourceIds, targetId);
      toast.success(result.message);
      setMergeGroupsModalOpen(false);
      await load();
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message || "Merge groups failed");
    } finally {
      setMergeGroupsSaving(false);
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
      groupName:  field === "groupName"  ? (newValue ? String(newValue).trim().toUpperCase() : "") : data.groupName,
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
      toast.error(e.response?.data?.message || e.message || "Failed to update ledger");
      setRows((p) => p.map((r) => r._id === data._id ? { ...r, [field]: oldValue } : r));
    }
  }, []);

  // ── File Import ─────────────────────────────────────────────────────────────
  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buf = new Uint8Array(evt.target!.result as ArrayBuffer);
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

        if (raw.length < 2) {
          toast.error("No valid rows found in sheet.");
          return;
        }

        // Find header index
        let headerIdx = 0;
        for (let i = 0; i < Math.min(8, raw.length); i++) {
          const r = (raw[i] || []) as string[];
          if (r.some((c) => typeof c === "string" && /ledger|account|group|debit|credit|dr|cr/i.test(c))) {
            headerIdx = i;
            break;
          }
        }

        const headers = (raw[headerIdx] as string[]).map((h) => String(h ?? "").trim().toLowerCase());
        const findColIdx = (keywords: string[]) =>
          headers.findIndex((h) => keywords.some((k) => h.includes(k)));

        const ledgerCol = findColIdx(["ledger", "account", "name"]);
        const groupCol  = findColIdx(["group", "type"]);
        const drCol     = findColIdx(["debit", "dr", "amount dr", "debit amount"]);
        const crCol     = findColIdx(["credit", "cr", "amount cr", "credit amount"]);

        if (ledgerCol < 0 || groupCol < 0) {
          toast.error("Invalid template headers. Make sure headers contain: Ledger Name, Group Name");
          return;
        }

        const groupsList = groups.map((g) => g.groupName);
        const findBestGroupMatchLocal = (excelGroup: string) => {
          const clean = (s: string) => s.toLowerCase().trim();
          const excelClean = clean(excelGroup);
          if (!excelClean) return groupsList[0] || "Assets";

          let match = groupsList.find((g) => clean(g) === excelClean);
          if (match) return match;

          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/s$/, "");
          const excelNorm = norm(excelGroup);

          match = groupsList.find((g) => norm(g) === excelNorm);
          if (match) return match;

          match = groupsList.find((g) => {
            const gNorm = norm(g);
            return gNorm.includes(excelNorm) || excelNorm.includes(gNorm);
          });
          if (match) return match;

          return groupsList[0] || "Assets";
        };

        const toNum = (val: unknown) => {
          if (val === null || val === undefined || val === "") return 0;
          const n = parseFloat(String(val).replace(/[₹$,\s]/g, ""));
          return isNaN(n) ? 0 : Math.abs(n);
        };

        const payload: any[] = [];
        for (let i = headerIdx + 1; i < raw.length; i++) {
          const row = (raw[i] || []) as unknown[];
          if (row.length === 0) continue;

          const ledgerName = String(row[ledgerCol] ?? "").trim().toUpperCase();
          if (!ledgerName) continue;

          const excelGroup = String(row[groupCol] ?? "").trim().toUpperCase();
          const finalGroup = findBestGroupMatchLocal(excelGroup);

          const amountDr = drCol >= 0 ? toNum(row[drCol]) : 0;
          const amountCr = crCol >= 0 ? toNum(row[crCol]) : 0;

          payload.push({
            ledgerName,
            groupName: finalGroup,
            openingDr: amountDr,
            openingCr: amountCr,
          });
        }

        if (payload.length === 0) {
          toast.error("No valid ledger rows parsed.");
          return;
        }

        setLoading(true);
        const result = await saveBulkOpeningBalances(payload);
        toast.success(`Imported ${result.count} ledgers successfully!`);
        await load();
        window.dispatchEvent(new CustomEvent("accounting-data-updated"));
      } catch (err: any) {
        toast.error("Failed to parse/import file: " + (err.response?.data?.message || err.message));
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }, [groups, load]);

  // ── Template & Data Export ──────────────────────────────────────────────────
  const handleExportTemplate = useCallback(() => {
    const headers = [["Sr No", "Ledger Name", "Group Name", "Amount Dr", "Amount Cr"]];
    const templateData = [
      [1, "WAGON R CNG", "CAPITAL ACCOUNT", 0, 0],
      [2, "RAJUBHAI RABARI", "LOANS & ADVANCES (ASSET)", 0, 0],
      [3, "INSURANCE EXPENSE", "EXPENSE ACCOUNT", 0, 0],
      [4, "HDFC BANK A/C", "BANK ACCOUNTS (BANKS)", 0, 0],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...templateData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger Master Template");
    XLSX.writeFile(wb, "Ledger_Master_Template.xlsx");
    toast.success("Ledger import template downloaded!");
  }, []);

  const handleExportData = useCallback(() => {
    const headers = [["Sr No", "Ledger Name", "Group Name", "Amount Dr", "Amount Cr", "Created", "Last Modified"]];
    const data = rows.map((r, i) => [
      i + 1,
      r.ledgerName,
      r.groupName,
      r.openingDr || 0,
      r.openingCr || 0,
      new Date(r.createdAt).toLocaleDateString("en-IN"),
      new Date(r.updatedAt).toLocaleDateString("en-IN"),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger Master Data");
    XLSX.writeFile(wb, "Ledgers_Export.xlsx");
    toast.success("Ledger master data exported!");
  }, [rows]);

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
        groups: [...LEDGER_GROUPS].sort()
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

  if (loading && !rows.length) {
    return <LedgerMasterSkeleton />;
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Background refresh badge — subtle, non-blocking */}
      {refreshing && !loading && (
        <div className="fixed top-4 right-4 z-50">
          <RefreshingBadge visible={refreshing} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">{activeTab === "ledgers" ? "Ledger Master" : "Group Master"}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeTab === "ledgers" 
              ? `${rows.length} ledgers across ${Object.keys(groupCounts).length} groups`
              : `${groups.length} account groups defined`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={refreshing}
            title="Refresh"
            className="p-2 border border-slate-200 bg-white rounded-lg text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
          
          {activeTab === "ledgers" ? (
            <>
              {selectedIds.length >= 2 && (
                <button
                  onClick={() => {
                    if (selectedIds.length > 4) {
                      toast.error("You can merge a maximum of 4 accounts at once.");
                      return;
                    }
                    setMergeModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 transition-colors shadow-sm"
                >
                  <GitMerge size={15} /> Merge ({selectedIds.length})
                </button>
              )}
              {selectedIds.length > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors shadow-sm"
                >
                  <Trash2 size={15} /> Delete Selected ({selectedIds.length})
                </button>
              )}
              <label className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer shadow-sm">
                <Upload size={15} /> Import Excel / CSV
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleImportFile}
                />
              </label>
              <button
                onClick={handleExportTemplate}
                title="Download Excel Template"
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <FileSpreadsheet size={15} /> Template
              </button>
              <button
                onClick={handleExportData}
                title="Export Current Ledgers"
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <Download size={15} /> Export
              </button>
              <button
                onClick={() => setMergeGroupsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors shadow-sm"
              >
                <GitMerge size={15} /> Merge Groups
              </button>
              <button
                onClick={() => setGroupEditModal({ mode: "add" })}
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
            </>
          ) : (
            <>
              <button
                onClick={() => setMergeGroupsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors shadow-sm"
              >
                <GitMerge size={15} /> Merge Groups
              </button>
              <button
                onClick={() => setGroupEditModal({ mode: "add" })}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors"
              >
                <Plus size={15} /> Create Group
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("ledgers")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "ledgers"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <BookMarked size={16} /> Ledgers
        </button>
        <button
          onClick={() => setActiveTab("groups")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "groups"
              ? "border-indigo-600 text-indigo-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Layers size={16} /> Account Groups
        </button>
      </div>

      {/* Duplicate Suggestions Panel */}
      {/* Tab content */}
      {activeTab === "ledgers" ? (
        <>
          {/* Duplicate Suggestions Panel */}
          {duplicateGroups.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between px-5 py-4 bg-amber-50/50 border-b border-amber-100 flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                    <GitMerge size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Potential Duplicate Ledgers Detected
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Found {duplicateGroups.length} group{duplicateGroups.length > 1 ? "s" : ""} of similar ledger names (match similarity &ge; {Math.round(similarityThreshold * 100)}%)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Threshold Slider */}
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                    <span>Match Threshold:</span>
                    <input
                      type="range"
                      min="0.5"
                      max="0.9"
                      step="0.05"
                      value={similarityThreshold}
                      onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                      className="w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <span className="w-8 text-right font-semibold text-indigo-600">
                      {Math.round(similarityThreshold * 100)}%
                    </span>
                  </div>
                  <button
                    onClick={() => setSuggestionsExpanded(!suggestionsExpanded)}
                    className="px-3.5 py-1.5 bg-amber-100 text-amber-800 hover:bg-amber-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {suggestionsExpanded ? "Hide Suggestions" : "Review Suggestions"}
                  </button>
                </div>
              </div>

              {suggestionsExpanded && (
                <div className="p-5 space-y-4 max-h-[350px] overflow-y-auto bg-slate-50/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {duplicateGroups.map((group, groupIdx) => {
                      return (
                        <div
                          key={groupIdx}
                          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between gap-3 hover:shadow-md transition-shadow"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Duplicate Group #{groupIdx + 1}
                              </span>
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                                {group.length} Accounts (Max 4)
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {group.map((ledger, idx) => {
                                const similarity = idx === 0 
                                  ? 1.0 
                                  : getLedgerSimilarity(group[0].ledgerName, ledger.ledgerName);
                                return (
                                  <div
                                    key={ledger._id}
                                    className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-100"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="font-semibold text-slate-700 truncate">
                                        {ledger.ledgerName}
                                      </span>
                                      <GroupBadge group={ledger.groupName} />
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                                      {idx === 0 ? "Base" : `${Math.round(similarity * 100)}% match`}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setSelectedIds(group.map((l) => l._id));
                                setMergeModalOpen(true);
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-semibold text-xs rounded-lg transition-colors border border-indigo-100"
                            >
                              <GitMerge size={13} />
                              Merge Group ({group.length})
                            </button>
                            <button
                              onClick={() => handleIgnoreGroup(group.map((l) => l._id))}
                              className="px-3 py-2 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 font-semibold text-xs rounded-lg transition-colors border border-slate-200 flex-shrink-0"
                              title="Ignore this suggestion"
                            >
                              Ignore
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

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
            {filtered.length === 0 ? (
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
        </>
      ) : (
        <>
          {/* Duplicate Account Groups Suggestions Panel */}
          {duplicateAccountGroups.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-purple-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between px-5 py-4 bg-purple-50/30 border-b border-purple-100 flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700">
                    <Layers size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Potential Duplicate Groups Detected
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Found {duplicateAccountGroups.length} group{duplicateAccountGroups.length > 1 ? "s" : ""} of similar group names (match similarity &ge; {Math.round(groupSimilarityThreshold * 100)}%)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Threshold Slider */}
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                    <span>Match Threshold:</span>
                    <input
                      type="range"
                      min="0.5"
                      max="0.9"
                      step="0.05"
                      value={groupSimilarityThreshold}
                      onChange={(e) => setGroupSimilarityThreshold(parseFloat(e.target.value))}
                      className="w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                    />
                    <span className="w-8 text-right font-semibold text-purple-600">
                      {Math.round(groupSimilarityThreshold * 100)}%
                    </span>
                  </div>
                  <button
                    onClick={() => setGroupSuggestionsExpanded(!groupSuggestionsExpanded)}
                    className="px-3.5 py-1.5 bg-purple-100 text-purple-800 hover:bg-purple-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {groupSuggestionsExpanded ? "Hide Suggestions" : "Review Suggestions"}
                  </button>
                </div>
              </div>

              {groupSuggestionsExpanded && (
                <div className="p-5 space-y-4 max-h-[350px] overflow-y-auto bg-slate-50/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {duplicateAccountGroups.map((cluster, clusterIdx) => {
                      return (
                        <div
                          key={clusterIdx}
                          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between gap-3 hover:shadow-md transition-shadow"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Duplicate Group #{clusterIdx + 1}
                              </span>
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                                {cluster.length} Groups (Max 4)
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {cluster.map((g, idx) => {
                                const similarity = idx === 0 
                                  ? 1.0 
                                  : getLedgerSimilarity(cluster[0].groupName, g.groupName);
                                return (
                                  <div
                                    key={g._id}
                                    className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-100"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="font-semibold text-slate-700 truncate">
                                        {g.groupName}
                                      </span>
                                      <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded font-mono">
                                        {g.superGroup}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                                      {idx === 0 ? "Base" : `${Math.round(similarity * 100)}% match`}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setPreSelectedSourceIds(cluster.slice(1).map(g => g._id));
                                setPreSelectedTargetId(cluster[0]._id);
                                setMergeGroupsModalOpen(true);
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-purple-50 text-purple-600 hover:bg-purple-100 font-semibold text-xs rounded-lg transition-colors border border-purple-100"
                            >
                              <GitMerge size={13} />
                              Merge Groups ({cluster.length})
                            </button>
                            <button
                              onClick={() => handleIgnoreGroupSuggestion(cluster.map((g) => g._id))}
                              className="px-3 py-2 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 font-semibold text-xs rounded-lg transition-colors border border-slate-200 flex-shrink-0"
                              title="Ignore this suggestion"
                            >
                              Ignore
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Group Search Row */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 flex-1 min-w-[220px] max-w-sm">
              <Search size={14} className="text-slate-400 flex-shrink-0" />
              <input
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Search group name or supergroup…"
                className="bg-transparent text-sm outline-none text-slate-700 placeholder-slate-400 w-full"
              />
              {groupSearch && (
                <button onClick={() => setGroupSearch("")} className="text-slate-400 hover:text-slate-600">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-500 ml-auto">
              <Filter size={14} />
              <span className="font-medium text-slate-700">{filteredGroups.length} results</span>
            </div>
          </div>

          {/* Groups Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            {filteredGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <Layers size={24} className="text-slate-400" />
                </div>
                <p className="text-slate-500 text-sm">
                  {groupSearch
                    ? "No groups match your search"
                    : "No groups found"}
                </p>
                {!groupSearch && (
                  <button
                    onClick={() => setGroupEditModal({ mode: "add" })}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors mt-1"
                  >
                    <Plus size={14} /> Create First Group
                  </button>
                )}
              </div>
            ) : (
              <>
                {selectedGroupIds.length > 0 && (
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl mb-4 transition-all duration-200">
                  <span className="text-sm font-semibold text-slate-600">
                    {selectedGroupIds.length} group(s) selected
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={() => handleBulkLockGroups(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      <LockIcon size={13} />
                      Lock Selected
                    </button>
                    <button
                      onClick={() => handleBulkLockGroups(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <UnlockIcon size={13} />
                      Unlock Selected
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm text-slate-700">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="px-6 py-4 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={filteredGroups.length > 0 && selectedGroupIds.length === filteredGroups.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedGroupIds(filteredGroups.map(g => g._id));
                            } else {
                              setSelectedGroupIds([]);
                            }
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </th>
                      <th className="px-6 py-4 w-16">#</th>
                      <th className="px-6 py-4">Group Name</th>
                      <th className="px-6 py-4">Supergroup Name</th>
                      <th className="px-6 py-4">B/S Side</th>
                      <th className="px-6 py-4">Affects Statement</th>
                      <th className="px-6 py-4 text-right w-44">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredGroups.map((g, idx) => {
                      const side = SUPER_GROUP_PARENTS[g.superGroup as keyof typeof SUPER_GROUP_PARENTS];
                      const stmt = SUPER_GROUP_STATEMENT[g.superGroup as keyof typeof SUPER_GROUP_STATEMENT];
                      const sideBadge: Record<string, { bg: string; text: string; dot: string; label: string }> = {
                        "Assets":      { bg: "bg-teal-50",   text: "text-teal-700",   dot: "bg-teal-500",    label: "Assets" },
                        "Liabilities": { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500",  label: "Liabilities" },
                        "Capital":     { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-500",   label: "Capital" },
                        "Income":      { bg: "bg-emerald-50",text: "text-emerald-700",dot: "bg-emerald-500", label: "Income" },
                        "Expense":     { bg: "bg-rose-50",   text: "text-rose-700",   dot: "bg-rose-500",    label: "Expense" },
                      };
                      const stmtBadge: Record<string, { bg: string; text: string; border: string; label: string; sub: string }> = {
                        "Trading A/c":   { bg: "bg-teal-700",   text: "text-white", border: "border-teal-800",   label: "Trading A/c",   sub: "Gross profit / loss" },
                        "P&L A/c":       { bg: "bg-[#7a2e1a]",  text: "text-white", border: "border-[#5a1e0e]",  label: "P&L A/c",       sub: "Net profit / loss" },
                        "Balance Sheet": { bg: "bg-indigo-800", text: "text-white", border: "border-indigo-900", label: "B/S",           sub: "Assets & liabilities" },
                      };
                      const badge = side ? sideBadge[side] : { bg: "bg-slate-100", text: "text-slate-500", dot: "bg-slate-400", label: "—" };
                      const sb = stmt ? stmtBadge[stmt] : null;
                      return (
                        <tr key={g._id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={selectedGroupIds.includes(g._id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedGroupIds(prev => [...prev, g._id]);
                                } else {
                                  setSelectedGroupIds(prev => prev.filter(id => id !== g._id));
                                }
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-6 py-4 text-slate-400 font-medium">{idx + 1}</td>
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            <span className="flex items-center gap-1.5">
                              {g.groupName}
                              {g.isLocked && (
                                <LockIcon size={12} className="text-amber-500" title="Locked" />
                              )}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                              {g.superGroup}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${badge.bg} ${badge.text}`}>
                              <span className={`w-2 h-2 rounded-full inline-block ${badge.dot}`} />
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {sb ? (
                              <span className={`inline-flex flex-col items-start px-3 py-1.5 rounded-lg text-xs font-bold border ${sb.bg} ${sb.text} ${sb.border}`}>
                                <span>{sb.label}</span>
                                <span className="font-normal opacity-80 text-[10px]">{sb.sub}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleToggleSingleGroupLock(g)}
                                title={g.isLocked ? "Unlock Group" : "Lock Group"}
                                className={`p-1.5 rounded-md transition-colors ${
                                  g.isLocked
                                    ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
                                    : "hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                                }`}
                              >
                                {g.isLocked ? <LockIcon size={14} /> : <UnlockIcon size={14} />}
                              </button>
                              <button
                                disabled={g.isLocked}
                                onClick={() => setGroupEditModal({ mode: "edit", group: g })}
                                title={g.isLocked ? "Group is locked" : "Edit Group"}
                                className={`p-1.5 rounded-md transition-colors ${
                                  g.isLocked
                                    ? "opacity-40 cursor-not-allowed text-slate-300"
                                    : "hover:bg-indigo-50 text-slate-400 hover:text-indigo-600"
                                }`}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                disabled={g.isLocked}
                                onClick={() => {
                                  setPreSelectedTargetId(g._id);
                                  setMergeGroupsModalOpen(true);
                                }}
                                title={g.isLocked ? "Group is locked" : "Merge Group"}
                                className={`p-1.5 rounded-md transition-colors ${
                                  g.isLocked
                                    ? "opacity-40 cursor-not-allowed text-slate-300"
                                    : "hover:bg-purple-50 text-slate-400 hover:text-purple-600"
                                }`}
                              >
                                <GitMerge size={14} />
                              </button>
                              <button
                                disabled={g.isLocked}
                                onClick={() => handleDeleteGroup(g)}
                                title={g.isLocked ? "Group is locked" : "Delete Group"}
                                className={`p-1.5 rounded-md transition-colors ${
                                  g.isLocked
                                    ? "opacity-40 cursor-not-allowed text-slate-300"
                                    : "hover:bg-red-50 text-slate-400 hover:text-red-500"
                                }`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
            )}
          </div>
        </>
      )}

      {/* Modal */}
      {modal && (
        <LedgerModal
          mode={modal.mode}
          ledger={modal.ledger}
          loading={saving}
          groups={[...LEDGER_GROUPS].sort()}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
        />
      )}

      {/* Group Modal */}
      {groupEditModal && (
        <GroupModal
          loading={groupSaving}
          group={groupEditModal.group}
          onClose={() => setGroupEditModal(null)}
          onSubmit={handleSaveGroup}
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

      {/* Merge Groups Modal */}
      {mergeGroupsModalOpen && (
        <MergeGroupsModal
          groups={groups}
          loading={mergeGroupsSaving}
          defaultSourceIds={preSelectedSourceIds}
          defaultTargetId={preSelectedTargetId}
          onClose={() => {
            setMergeGroupsModalOpen(false);
            setPreSelectedSourceIds([]);
            setPreSelectedTargetId("");
          }}
          onMerge={handleMergeGroups}
        />
      )}
    </div>
  );
}
