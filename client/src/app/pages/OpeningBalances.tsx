import {
  useState, useCallback, useMemo, useRef,
  forwardRef, useImperativeHandle, useEffect,
} from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry, AllCommunityModule,
  type ColDef, type ICellRendererParams, type GetRowIdParams,
} from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import {
  Plus, Save, Trash2, Pencil, CheckCircle2,
  XCircle, LayoutList, AlertTriangle, Download, Upload, Loader2, FileSpreadsheet
} from "lucide-react";
import toast from "react-hot-toast";
import { useApp } from "../context/AppContext";
import { FYBanner } from "../components/FYBanner";
import * as XLSX from "xlsx";
import { getAllLedgers, saveBulkOpeningBalances } from "../api/ledgerApi";
import { getAllGroups } from "../api/accountGroupApi";

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Constants ─────────────────────────────────────────────────────────────────
const GROUP_COLORS: Record<string, string> = {
  Assets:      "bg-blue-50 text-blue-700 border-blue-200",
  Liabilities: "bg-red-50 text-red-700 border-red-200",
  Capital:     "bg-purple-50 text-purple-700 border-purple-200",
  Income:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  Expense:     "bg-orange-50 text-orange-700 border-orange-200",
  Bank:        "bg-cyan-50 text-cyan-700 border-cyan-200",
  Cash:        "bg-amber-50 text-amber-700 border-amber-200",
  "Current Assets": "bg-blue-50 text-blue-700 border-blue-200",
  "Current Liabilities": "bg-red-50 text-red-700 border-red-200",
  "Capital Account": "bg-purple-50 text-purple-700 border-purple-200",
  "Direct Expenses": "bg-orange-50 text-orange-700 border-orange-200",
  "Indirect Expenses": "bg-orange-50 text-orange-700 border-orange-200",
  "Purchase Account": "bg-orange-50 text-orange-700 border-orange-200",
  "Sales Account": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Bank Accounts (Banks)": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Cash-in-hand": "bg-amber-50 text-amber-700 border-amber-200",
};

// ── Data shape ────────────────────────────────────────────────────────────────
interface OBRow {
  id: string;
  ledgerName: string;
  group: string;
  amountDr: number;
  amountCr: number;
}

// ── Group select cell editor ──────────────────────────────────────────────────
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
      className="w-full h-full px-2 text-sm outline-none border-2 border-indigo-400 rounded bg-white"
    >
      {groupsList.map((g: string) => <option key={g} value={g}>{g}</option>)}
    </select>
  );
});

// ── Bulk Entry Modal ──────────────────────────────────────────────────────────
interface BulkRow { ledgerName: string; group: string; amountDr: string; amountCr: string; }
const emptyBulkRow = (defaultGroup: string): BulkRow => ({ ledgerName: "", group: defaultGroup, amountDr: "", amountCr: "" });

function BulkEntryModal({ groups, onClose, onCommit }: { groups: string[]; onClose: () => void; onCommit: (rows: OBRow[]) => void }) {
  const defaultGroup = groups[0] || "Assets";
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyBulkRow(defaultGroup), emptyBulkRow(defaultGroup), emptyBulkRow(defaultGroup)]);

  const update = (i: number, field: keyof BulkRow, val: string) =>
    setBulkRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const addBulkRow = () => setBulkRows((p) => [...p, emptyBulkRow(defaultGroup)]);
  const removeBulkRow = (i: number) => setBulkRows((p) => p.filter((_, idx) => idx !== i));

  const handleCommit = () => {
    const filled = bulkRows.filter((r) => r.ledgerName.trim());
    if (filled.length === 0) return toast.error("Enter at least one ledger name");
    const parsed: OBRow[] = filled.map((r) => ({
      id: `bulk-${Date.now()}-${Math.random()}`,
      ledgerName: r.ledgerName.trim(),
      group: r.group,
      amountDr: parseFloat(r.amountDr) || 0,
      amountCr: parseFloat(r.amountCr) || 0,
    }));
    onCommit(parsed);
    toast.success(`${parsed.length} entries added`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
              <LayoutList size={17} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-slate-900 text-base">Bulk Entry</h2>
              <p className="text-xs text-slate-500 mt-0.5">Add multiple ledger balances at once</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors">
            <XCircle size={18} />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 p-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ledger Name <span className="text-red-500">*</span></th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Group</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Amount Dr</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Amount Cr</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bulkRows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      value={row.ledgerName}
                      onChange={(e) => update(i, "ledgerName", e.target.value)}
                      placeholder="e.g. Cash in Hand"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.group}
                      onChange={(e) => update(i, "group", e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all"
                    >
                      {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={row.amountDr}
                      onChange={(e) => update(i, "amountDr", e.target.value)}
                      placeholder="0.00"
                      min="0"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-right text-emerald-700 font-medium outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={row.amountCr}
                      onChange={(e) => update(i, "amountCr", e.target.value)}
                      placeholder="0.00"
                      min="0"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-right text-red-600 font-medium outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-all"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeBulkRow(i)} className="p-1 rounded-md hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={addBulkRow}
            className="mt-3 flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium px-3"
          >
            <Plus size={14} /> Add Row
          </button>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex justify-end gap-3 bg-slate-50 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button onClick={handleCommit} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors">
            <Plus size={14} /> Add {bulkRows.filter((r) => r.ledgerName.trim()).length} Entries
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Row Modal ────────────────────────────────────────────────────────────
function EditRowModal({ row, groups, onClose, onSave }: { row: OBRow; groups: string[]; onClose: () => void; onSave: (r: OBRow) => void }) {
  const [form, setForm] = useState({ ...row });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.ledgerName.trim()) e.ledgerName = "Ledger name is required";
    if (form.amountDr < 0) e.amountDr = "Cannot be negative";
    if (form.amountCr < 0) e.amountCr = "Cannot be negative";
    if (form.amountDr > 0 && form.amountCr > 0) e.amountCr = "A ledger can have either Dr or Cr, not both";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Pencil size={15} className="text-indigo-600" />
            </div>
            <h2 className="text-slate-900 text-base">Edit Ledger Entry</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors">
            <XCircle size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Ledger Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Ledger Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.ledgerName}
              onChange={(e) => setForm({ ...form, ledgerName: e.target.value })}
              className={`w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all border
                ${errors.ledgerName ? "border-red-300 bg-red-50 focus:ring-2 focus:ring-red-100" : "border-slate-200 bg-slate-50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"}`}
              placeholder="e.g. Cash in Hand"
            />
            {errors.ledgerName && <p className="mt-1 text-xs text-red-600">{errors.ledgerName}</p>}
          </div>

          {/* Group */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Group</label>
            <select
              value={form.group}
              onChange={(e) => setForm({ ...form, group: e.target.value })}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            >
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount Dr</label>
              <input
                type="number"
                min="0"
                value={form.amountDr || ""}
                onChange={(e) => setForm({ ...form, amountDr: parseFloat(e.target.value) || 0 })}
                className={`w-full px-3 py-2.5 rounded-lg text-sm text-emerald-700 font-medium outline-none transition-all border text-right
                  ${errors.amountDr ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"}`}
                placeholder="0.00"
              />
              {errors.amountDr && <p className="mt-1 text-xs text-red-600">{errors.amountDr}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount Cr</label>
              <input
                type="number"
                min="0"
                value={form.amountCr || ""}
                onChange={(e) => setForm({ ...form, amountCr: parseFloat(e.target.value) || 0 })}
                className={`w-full px-3 py-2.5 rounded-lg text-sm text-red-600 font-medium outline-none transition-all border text-right
                  ${errors.amountCr ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"}`}
                placeholder="0.00"
              />
              {errors.amountCr && <p className="mt-1 text-xs text-red-600">{errors.amountCr}</p>}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors">
            <Save size={14} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function findBestGroupMatch(excelGroup: string, groupsList: string[]): string {
  const clean = (s: string) => s.toLowerCase().trim();
  const excelClean = clean(excelGroup);
  if (!excelClean) return groupsList[0] || "Assets";

  // 1. Exact match (case insensitive)
  let match = groupsList.find((g) => clean(g) === excelClean);
  if (match) return match;

  // 2. Normalize and check exact match (remove non-alphanumeric and plural 's' at the end)
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/s$/, "");
  const excelNorm = norm(excelGroup);

  match = groupsList.find((g) => norm(g) === excelNorm);
  if (match) return match;

  // 3. Substring match (either excel group contains system group or system group contains excel group)
  match = groupsList.find((g) => {
    const gNorm = norm(g);
    return gNorm.includes(excelNorm) || excelNorm.includes(gNorm);
  });
  if (match) return match;

  // 4. Fallback to starts-with or ends-with check
  match = groupsList.find((g) => {
    const gClean = clean(g);
    return gClean.startsWith(excelClean) || excelClean.startsWith(gClean);
  });
  if (match) return match;

  // 5. Default
  return groupsList[0] || "Assets";
}

// ── Helpers for parsing Excel / CSV ───────────────────────────────────────────
function parseOpeningBalancesSheetRows(
  rows: unknown[][],
  groupsList: string[],
  existingLedgers: OBRow[]
): OBRow[] {
  if (rows.length < 2) return [];

  let headerIdx = 0;
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const r = (rows[i] || []) as string[];
    if (r.some((c) => typeof c === "string" && /ledger|account|group|debit|credit|dr|cr/i.test(c))) {
      headerIdx = i;
      break;
    }
  }

  const headers = (rows[headerIdx] as string[]).map((h) => String(h ?? "").trim().toLowerCase());

  const findColIdx = (keywords: string[]) =>
    headers.findIndex((h) => keywords.some((k) => h.includes(k)));

  const ledgerCol = findColIdx(["ledger", "account", "name"]);
  const groupCol  = findColIdx(["group", "type"]);
  const drCol     = findColIdx(["debit", "dr", "amount dr", "debit amount"]);
  const crCol     = findColIdx(["credit", "cr", "amount cr", "credit amount"]);

  const parsed: OBRow[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = (rows[i] || []) as unknown[];
    if (row.length === 0) continue;

    const ledgerName = ledgerCol >= 0 ? String(row[ledgerCol] ?? "").trim() : "";
    if (!ledgerName) continue;

    // Try to match against existing database ledgers to map to the correct ID
    const existing = existingLedgers.find(
      (el) => el.ledgerName.trim().toLowerCase() === ledgerName.toLowerCase()
    );

    const group = groupCol >= 0 ? String(row[groupCol] ?? "").trim() : "";
    const finalGroup = group || "Assets"; // Use Excel's group exactly, default to "Assets" only if empty
    
    let finalId = `imported-${Date.now()}-${Math.random()}-${i}`;
    if (existing) {
      finalId = existing.id;
    }

    const toNum = (val: unknown) => {
      if (val === null || val === undefined || val === "") return 0;
      const n = parseFloat(String(val).replace(/[₹$,\s]/g, ""));
      return isNaN(n) ? 0 : Math.abs(n);
    };

    const amountDr = drCol >= 0 ? toNum(row[drCol]) : 0;
    const amountCr = crCol >= 0 ? toNum(row[crCol]) : 0;

    parsed.push({
      id: finalId,
      ledgerName: ledgerName,
      group: finalGroup,
      amountDr,
      amountCr,
    });
  }

  return parsed;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OpeningBalances() {
  const { selectedFY } = useApp();
  const [rows, setRows] = useState<OBRow[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editRow, setEditRow] = useState<OBRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const gridRef = useRef<AgGridReact<OBRow>>(null);

  // ── Load data ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setSelectedIds([]);
    try {
      const [ledgers, groupsData] = await Promise.all([
        getAllLedgers({ raw: true }),
        getAllGroups()
      ]);
      const mappedRows: OBRow[] = ledgers.map((l) => ({
        id: l._id,
        ledgerName: l.ledgerName,
        group: l.groupName,
        amountDr: l.openingDr || 0,
        amountCr: l.openingCr || 0,
      }));
      setRows(mappedRows);
      setGroups(groupsData.map((g) => g.groupName).sort());
    } catch (err: any) {
      toast.error(err.message || "Failed to load opening balances");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Computed totals ─────────────────────────────────────────────────────────
  const totalDr   = rows.reduce((s, r) => s + r.amountDr, 0);
  const totalCr   = rows.reduce((s, r) => s + r.amountCr, 0);
  const diff      = totalDr - totalCr;
  const balanced  = Math.abs(diff) < 0.01 && totalDr > 0;

  // ── Row operations ──────────────────────────────────────────────────────────
  const addRow = () => {
    const newRow: OBRow = {
      id: `row-${Date.now()}`,
      ledgerName: "",
      group: groups[0] || "Assets",
      amountDr: 0,
      amountCr: 0,
    };
    setRows((prev) => [...prev, newRow]);
    setTimeout(() => {
      const api = gridRef.current?.api;
      if (!api) return;
      api.ensureIndexVisible(rows.length);
      api.startEditingCell({ rowIndex: rows.length, colKey: "ledgerName" });
    }, 50);
  };

  const deleteRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success("Row deleted locally");
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete the ${selectedIds.length} selected row(s) locally? You must click 'Save Balances' to commit these changes.`)) return;
    setRows((prev) => prev.filter((r) => !selectedIds.includes(r.id)));
    setSelectedIds([]);
    toast.success(`Deleted ${selectedIds.length} row(s) locally`);
  }, [selectedIds]);

  const onSelectionChanged = useCallback(() => {
    const selectedNodes = gridRef.current?.api.getSelectedNodes() || [];
    const ids = selectedNodes.map((node) => node.data?.id).filter(Boolean) as string[];
    setSelectedIds(ids);
  }, []);

  const saveEditRow = useCallback((updated: OBRow) => {
    setRows((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    toast.success("Entry updated locally");
  }, []);

  const saveBalancesDirect = useCallback(async (targetRows: OBRow[]) => {
    if (targetRows.some((r) => !r.ledgerName.trim())) {
      return toast.error("All rows must have a ledger name");
    }
    
    setSaving(true);
    try {
      const payload = targetRows.map((r) => ({
        ledgerName: r.ledgerName,
        groupName: r.group,
        openingDr: r.amountDr,
        openingCr: r.amountCr
      }));
      await saveBulkOpeningBalances(payload);
      
      const localTotalDr = targetRows.reduce((s, r) => s + r.amountDr, 0);
      const localTotalCr = targetRows.reduce((s, r) => s + r.amountCr, 0);
      const localDiff = localTotalDr - localTotalCr;
      const localBalanced = Math.abs(localDiff) < 0.01 && localTotalDr > 0;

      if (!localBalanced) {
        toast.success(`Opening balances saved with a difference of ₹${Math.abs(localDiff).toLocaleString("en-IN")}!`, {
          icon: "⚠️",
          duration: 5000,
        });
      } else {
        toast.success("Opening balances saved successfully to database!");
      }
      await load();
      window.dispatchEvent(new CustomEvent("accounting-data-updated"));
    } catch (err: any) {
      toast.error(err.message || "Failed to save opening balances");
    } finally {
      setSaving(false);
    }
  }, [load]);

  const bulkCommit = useCallback((newRows: OBRow[]) => {
    const nextRows = [...rows, ...newRows];
    setRows(nextRows);
    saveBalancesDirect(nextRows);
  }, [rows, saveBalancesDirect]);

  // ── File Import ─────────────────────────────────────────────────────────────
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buf = new Uint8Array(evt.target!.result as ArrayBuffer);
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
        
        const parsed = parseOpeningBalancesSheetRows(raw, groups, rows);
        if (parsed.length === 0) {
          toast.error("No valid rows found in sheet. Make sure headers are: Ledger Name, Group, Amount Dr, Amount Cr");
          return;
        }

        setRows(parsed);
        saveBalancesDirect(parsed);
      } catch (err: any) {
        toast.error("Failed to parse file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; // clear file input
  };

  // ── Template & Data Export ──────────────────────────────────────────────────
  const handleExportTemplate = () => {
    const headers = [["Sr No", "Ledger Name", "Group", "Amount Dr", "Amount Cr"]];
    let templateData: any[] = [];
    if (rows.length > 0) {
      templateData = rows.map((r, i) => [
        i + 1,
        r.ledgerName,
        r.group,
        r.amountDr || "",
        r.amountCr || "",
      ]);
    } else {
      templateData = [
        [1, "HDFC Current Account", "Bank Accounts (Banks)", 2850000, 0],
        [2, "Share Capital", "Capital Account", 0, 5000000],
        [3, "Fixed Assets", "Fixed Assets", 3830000, 0],
        [4, "GST / Tax Payable", "Duties & Taxes", 0, 125000]
      ];
    }
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...templateData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Opening Balances Template");
    XLSX.writeFile(wb, "Opening_Balances_Template.xlsx");
    toast.success("Template downloaded!");
  };

  const handleExportData = () => {
    const headers = [["Sr No", "Ledger Name", "Group", "Amount Dr", "Amount Cr"]];
    const data = rows.map((r, i) => [i + 1, r.ledgerName, r.group, r.amountDr, r.amountCr]);
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Opening Balances");
    XLSX.writeFile(wb, "Opening_Balances_Export.xlsx");
    toast.success("Opening balances data exported!");
  };

  // ── Database Save ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    await saveBalancesDirect(rows);
  };

  // ── Inline cell edit ────────────────────────────────────────────────────────
  const onCellEditingStopped = useCallback((e: any) => {
    const { data, column, newValue } = e;
    const field = column.colId as keyof OBRow;
    setRows((prev) =>
      prev.map((r) => r.id === data.id ? { ...r, [field]: newValue } : r)
    );
  }, []);

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
  const columnDefs = useMemo<ColDef<OBRow>[]>(() => [
    {
      headerName: "Sr No",
      width: 72,
      sortable: false,
      editable: false,
      valueGetter: (p) => p.node?.rowPinned ? "" : (p.node?.rowIndex ?? 0) + 1,
      cellStyle: { color: "#94a3b8", fontSize: "12px", textAlign: "center" },
      cellRenderer: (p: ICellRendererParams) =>
        p.node?.rowPinned ? null : (
          <span className="text-xs text-slate-400">{(p.node?.rowIndex ?? 0) + 1}</span>
        ),
    },
    {
      field: "ledgerName",
      headerName: "Ledger Name",
      flex: 1,
      minWidth: 200,
      editable: true,
      cellRenderer: (p: ICellRendererParams<OBRow>) => {
        if (p.node?.rowPinned) {
          return (
            <span className="text-sm font-bold text-slate-900">{p.value}</span>
          );
        }
        return (
          <span className={`text-sm ${p.value ? "text-slate-800" : "text-slate-400 italic"}`}>
            {p.value || "Click to enter ledger name…"}
          </span>
        );
      },
    },
    {
      field: "group",
      headerName: "Group",
      width: 180,
      editable: true,
      cellEditor: GroupCellEditor,
      cellEditorParams: {
        groups: groups
      },
      cellRenderer: (p: ICellRendererParams<OBRow>) => {
        if (p.node?.rowPinned || !p.value) return null;
        const cls = GROUP_COLORS[p.value] ?? "bg-slate-100 text-slate-600 border-slate-200";
        return (
          <div className="flex items-center h-full">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border truncate max-w-full ${cls}`}>
              {p.value}
            </span>
          </div>
        );
      },
    },
    {
      field: "amountDr",
      headerName: "Amount Dr",
      width: 150,
      editable: true,
      type: "numericColumn",
      valueFormatter: (p) => {
        if (p.node?.rowPinned) return p.value > 0 ? `₹${Number(p.value).toLocaleString("en-IN")}` : "—";
        return p.value > 0 ? `₹${Number(p.value).toLocaleString("en-IN")}` : "—";
      },
      cellStyle: (p) => ({
        color: p.node?.rowPinned ? "#0f172a" : "#059669",
        fontWeight: p.node?.rowPinned ? "700" : "500",
        textAlign: "right",
      }),
    },
    {
      field: "amountCr",
      headerName: "Amount Cr",
      width: 150,
      editable: true,
      type: "numericColumn",
      valueFormatter: (p) => {
        if (p.node?.rowPinned) return p.value > 0 ? `₹${Number(p.value).toLocaleString("en-IN")}` : "—";
        return p.value > 0 ? `₹${Number(p.value).toLocaleString("en-IN")}` : "—";
      },
      cellStyle: (p) => ({
        color: p.node?.rowPinned ? "#0f172a" : "#dc2626",
        fontWeight: p.node?.rowPinned ? "700" : "500",
        textAlign: "right",
      }),
    },
    {
      headerName: "Actions",
      width: 110,
      sortable: false,
      editable: false,
      cellRenderer: (p: ICellRendererParams<OBRow>) => {
        if (p.node?.rowPinned || !p.data) return null;
        return (
          <div className="flex items-center gap-1 h-full">
            <button
              onClick={() => setEditRow(p.data!)}
              title="Edit"
              className="p-1.5 rounded-md hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => deleteRow(p.data!.id)}
              title="Delete"
              className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      },
    },
  ], [deleteRow, groups]);

  // ── Pinned footer rows ──────────────────────────────────────────────────────
  const pinnedBottom = useMemo<OBRow[]>(() => [
    { id: "__total_dr", ledgerName: "Total Debit (Dr)", group: "", amountDr: totalDr, amountCr: 0 },
    { id: "__total_cr", ledgerName: "Total Credit (Cr)", group: "", amountDr: 0, amountCr: totalCr },
    { id: "__diff",     ledgerName: diff === 0 ? "Difference  ✓  Balanced" : `Difference  ✗  ₹${Math.abs(diff).toLocaleString("en-IN")}`, group: "", amountDr: diff > 0 ? diff : 0, amountCr: diff < 0 ? Math.abs(diff) : 0 },
  ], [totalDr, totalCr, diff]);

  // Group by for summary
  const groupSummary = useMemo(() => {
    const map: Record<string, { dr: number; cr: number; count: number }> = {};
    for (const r of rows) {
      if (!map[r.group]) map[r.group] = { dr: 0, cr: 0, count: 0 };
      map[r.group].dr += r.amountDr;
      map[r.group].cr += r.amountCr;
      map[r.group].count += 1;
    }
    return map;
  }, [rows]);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <FYBanner />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Opening Balances</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {selectedFY?.label ?? "—"} · {rows.length} ledger entries
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Import Excel */}
          <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer shadow-sm">
            <Upload size={14} /> Import Excel / CSV
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportFile}
            />
          </label>
          {/* Download Template */}
          <button
            onClick={handleExportTemplate}
            title="Download Excel Template"
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <FileSpreadsheet size={14} /> Template
          </button>
          {/* Export Data */}
          <button
            onClick={handleExportData}
            title="Export Current Opening Balances"
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Download size={14} /> Export
          </button>
          {/* Bulk Entry */}
          <button
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <LayoutList size={14} /> Bulk Entry
          </button>
          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors shadow-sm animate-in fade-in slide-in-from-right-2 duration-200"
            >
              <Trash2 size={14} /> Delete Selected ({selectedIds.length})
            </button>
          )}
          {/* Add Manual Row */}
          <button
            onClick={addRow}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Plus size={14} /> Add Row
          </button>
          {/* Save Balances to DB */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Balances
          </button>
        </div>
      </div>

      {/* Validation banner */}
      {!balanced && totalDr > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl shadow-sm">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">
            <strong>Not Balanced —</strong> Total Dr and Total Cr must be equal. Current difference:{" "}
            <strong>₹{Math.abs(diff).toLocaleString("en-IN")}</strong>. Adjust entries before saving.
          </p>
        </div>
      )}
      {balanced && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl shadow-sm">
          <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-emerald-700">
            <strong>Balanced —</strong> Total Debit equals Total Credit. Ready to save.
          </p>
        </div>
      )}

      {/* Group summary chips */}
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const s = groupSummary[g];
          if (!s) return null;
          const cls = GROUP_COLORS[g] ?? "bg-slate-100 text-slate-600 border-slate-200";
          return (
            <div key={g} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${cls}`}>
              <span>{g}</span>
              <span className="opacity-60">·</span>
              <span>{s.count} entries</span>
              {s.dr > 0 && <span className="text-emerald-700 bg-emerald-100 px-1.5 rounded">Dr ₹{(s.dr / 1000).toFixed(0)}k</span>}
              {s.cr > 0 && <span className="text-red-600 bg-red-100 px-1.5 rounded">Cr ₹{(s.cr / 1000).toFixed(0)}k</span>}
            </div>
          );
        })}
      </div>

      {/* AG Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-500">Double-click any cell to edit inline · Use action buttons for full form edit</p>
          <p className="text-xs text-slate-400">{rows.length} rows</p>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
            <Loader2 size={18} className="animate-spin" /> Loading balances...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <FileSpreadsheet size={40} className="opacity-30" />
            <p className="text-sm font-medium">No opening balances found</p>
            <p className="text-xs">Import an Excel sheet or add rows manually to get started</p>
          </div>
        ) : (
          <div className="ag-theme-quartz" style={{ height: Math.max(360, Math.min(rows.length * 48 + 150, 560)) }}>
            <AgGridReact<OBRow>
              theme="legacy"
              ref={gridRef}
              rowData={rows}
              columnDefs={columnDefs}
              defaultColDef={{ resizable: true, sortable: true }}
              rowSelection={rowSelection}
              selectionColumnDef={selectionColumnDef}
              onSelectionChanged={onSelectionChanged}
              onCellEditingStopped={onCellEditingStopped}
              pinnedBottomRowData={pinnedBottom}
              rowHeight={48}
              headerHeight={44}
              animateRows
              stopEditingWhenCellsLoseFocus
              getRowId={(p: GetRowIdParams<OBRow>) => p.data.id}
              getRowStyle={(p) => {
                if (p.node.rowPinned) {
                  const id = (p.data as OBRow)?.id;
                  if (id === "__diff") {
                    return {
                      background: diff === 0 ? "#f0fdf4" : "#fef2f2",
                      fontWeight: "700",
                      borderTop: "2px solid " + (diff === 0 ? "#bbf7d0" : "#fecaca"),
                    };
                  }
                  return { background: "#f8fafc", fontWeight: "700", borderTop: "1px solid #e2e8f0" };
                }
                return undefined;
              }}
            />
          </div>
        )}
      </div>

      {/* Footer totals card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Debit (Dr)</p>
          <p className="text-xl font-bold text-emerald-600 mt-1.5 tabular-nums">
            ₹{totalDr.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-slate-400 mt-1">{rows.filter((r) => r.amountDr > 0).length} debit entries</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Credit (Cr)</p>
          <p className="text-xl font-bold text-red-500 mt-1.5 tabular-nums">
            ₹{totalCr.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-slate-400 mt-1">{rows.filter((r) => r.amountCr > 0).length} credit entries</p>
        </div>
        <div className={`rounded-xl p-4 shadow-sm border ${balanced ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Difference</p>
          <p className={`text-xl font-bold mt-1.5 tabular-nums ${balanced ? "text-emerald-700" : "text-red-600"}`}>
            ₹{Math.abs(diff).toLocaleString("en-IN")}
          </p>
          <div className={`flex items-center gap-1.5 mt-1 text-xs font-medium ${balanced ? "text-emerald-700" : "text-red-600"}`}>
            {balanced
              ? <><CheckCircle2 size={12} /> Balanced — ready to save</>
              : <><AlertTriangle size={12} /> Must be zero to save</>
            }
          </div>
        </div>
      </div>

      {/* Modals */}
      {showBulk && <BulkEntryModal groups={groups} onClose={() => setShowBulk(false)} onCommit={bulkCommit} />}
      {editRow  && <EditRowModal row={editRow} groups={groups} onClose={() => setEditRow(null)} onSave={saveEditRow} />}
    </div>
  );
}
