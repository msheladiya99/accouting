import { useState, useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry,
  AllCommunityModule,
  type ColDef,
  type GridApi,
  type ICellRendererParams,
} from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import {
  Plus, Search, RefreshCw, Eye, Pencil, Trash2,
  Building2, CheckCircle2, XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  type Company,
  type CreateCompanyPayload,
  getAllCompanies,
  createCompany,
  getCompanyById,
  updateCompany,
  deleteCompany,
} from "../api/companyApi";
import { CompanyModal } from "../components/company/CompanyModal";

ModuleRegistry.registerModules([AllCommunityModule]);

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

// ── Inline PAN cell editor (forwardRef so AG Grid can call getValue) ──────────
const PanCellEditor = forwardRef(function PanCellEditor(props: any, ref) {
  const [val, setVal] = useState<string>((props.value ?? "").toUpperCase());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  useImperativeHandle(ref, () => ({ getValue: () => val.toUpperCase() }));

  return (
    <input
      ref={inputRef}
      value={val}
      maxLength={10}
      onChange={(e) => setVal(e.target.value.toUpperCase())}
      className="w-full h-full px-3 font-mono tracking-widest text-sm outline-none border-2 border-indigo-400 rounded bg-white"
    />
  );
});

export default function CompanySetup() {
  const [rows, setRows] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ mode: "create" | "edit" | "view"; company?: Company } | null>(null);
  const gridRef = useRef<AgGridReact>(null);

  // ── Load data ───────────────────────────────────────────────────────────────
  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllCompanies();
      setRows(data);
    } catch {
      toast.error("Failed to load companies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  // ── Modal handlers ──────────────────────────────────────────────────────────
  const openCreate = () => setModal({ mode: "create" });

  const openView = useCallback(async (id: string) => {
    try {
      const company = await getCompanyById(id);
      setModal({ mode: "view", company });
    } catch { toast.error("Failed to load company details"); }
  }, []);

  const openEdit = useCallback(async (id: string) => {
    try {
      const company = await getCompanyById(id);
      setModal({ mode: "edit", company });
    } catch { toast.error("Failed to load company"); }
  }, []);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This action cannot be undone.`)) return;
    try {
      await deleteCompany(id);
      setRows((prev) => prev.filter((r) => r._id !== id));
      toast.success(`"${name}" deleted`);
    } catch { toast.error("Failed to delete company"); }
  }, []);

  const handleModalSubmit = useCallback(async (data: CreateCompanyPayload) => {
    setSaving(true);
    try {
      if (modal?.mode === "create") {
        const created = await createCompany(data);
        setRows((prev) => [created, ...prev]);
        toast.success(`Company "${created.companyName}" created!`);
      } else if (modal?.mode === "edit" && modal.company) {
        const updated = await updateCompany(modal.company._id, data);
        setRows((prev) => prev.map((r) => (r._id === updated._id ? updated : r)));
        toast.success(`Company "${updated.companyName}" updated!`);
      }
      setModal(null);
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  }, [modal]);

  // ── Inline cell edit (PAN validation) ──────────────────────────────────────
  const onCellEditingStopped = useCallback(async (e: any) => {
    const { data, colDef, newValue, oldValue } = e;
    if (newValue === oldValue || !newValue) return;

    const field = colDef.field as keyof Company;

    if (field === "panNumber" && !PAN_REGEX.test(newValue)) {
      toast.error("Invalid PAN — format must be AAAAA9999A");
      setRows((prev) => prev.map((r) => (r._id === data._id ? { ...r, panNumber: oldValue } : r)));
      return;
    }
    if (field === "companyName" && newValue.trim().length < 2) {
      toast.error("Company name must be at least 2 characters");
      setRows((prev) => prev.map((r) => (r._id === data._id ? { ...r, companyName: oldValue } : r)));
      return;
    }

    try {
      const updated = await updateCompany(data._id, { [field]: newValue } as Partial<CreateCompanyPayload>);
      setRows((prev) => prev.map((r) => (r._id === updated._id ? updated : r)));
      toast.success("Saved inline");
    } catch {
      toast.error("Failed to save");
      setRows((prev) => prev.map((r) => (r._id === data._id ? { ...r, [field]: oldValue } : r)));
    }
  }, []);

  // ── Column definitions ──────────────────────────────────────────────────────
  const columnDefs = useMemo<ColDef<Company>[]>(() => [
    {
      headerName: "#",
      valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
      width: 60,
      sortable: false,
      cellStyle: { color: "#94a3b8", fontSize: "12px" },
    },
    {
      field: "companyName",
      headerName: "Company Name",
      flex: 1,
      minWidth: 200,
      editable: true,
      cellRenderer: (p: ICellRendererParams<Company>) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-100 rounded-md flex items-center justify-center flex-shrink-0">
            <Building2 size={13} className="text-indigo-600" />
          </div>
          <span className="text-sm text-slate-800 font-medium">{p.value}</span>
        </div>
      ),
    },
    {
      field: "panNumber",
      headerName: "PAN Number",
      width: 170,
      editable: true,
      cellEditor: PanCellEditor,
      cellRenderer: (p: ICellRendererParams<Company>) => {
        const valid = PAN_REGEX.test(p.value ?? "");
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm tracking-widest text-slate-700">{p.value}</span>
            {valid
              ? <CheckCircle2 size={13} className="text-emerald-500" />
              : <XCircle size={13} className="text-red-400" />}
          </div>
        );
      },
    },
    {
      field: "createdAt",
      headerName: "Created Date",
      width: 180,
      editable: false,
      valueFormatter: (p) =>
        p.value
          ? new Date(p.value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
          : "—",
      cellStyle: { color: "#64748b", fontSize: "12px" },
    },
    {
      headerName: "Actions",
      width: 130,
      sortable: false,
      editable: false,
      cellRenderer: (p: ICellRendererParams<Company>) => {
        if (!p.data) return null;
        const { _id, companyName } = p.data;
        return (
          <div className="flex items-center gap-1 h-full">
            <button
              onClick={() => openView(_id)}
              title="View"
              className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
            >
              <Eye size={14} />
            </button>
            <button
              onClick={() => openEdit(_id)}
              title="Edit"
              className="p-1.5 rounded-md hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => handleDelete(_id, companyName)}
              title="Delete"
              className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      },
    },
  ], [openView, openEdit, handleDelete]);

  // ── Filtered rows ───────────────────────────────────────────────────────────
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.companyName.toLowerCase().includes(search.toLowerCase()) ||
          r.panNumber.toLowerCase().includes(search.toLowerCase()),
      ),
    [rows, search],
  );

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">Company Setup</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage registered companies · {rows.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCompanies}
            title="Refresh"
            className="p-2 border border-slate-200 bg-white rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
          >
            <Plus size={15} /> Create Company
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-xs text-slate-500">Total Companies</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{rows.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <p className="text-xs text-slate-500">Valid PAN</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {rows.filter((r) => PAN_REGEX.test(r.panNumber)).length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 sm:block hidden">
          <p className="text-xs text-slate-500">Added This Month</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">
            {rows.filter((r) => {
              const d = new Date(r.createdAt);
              const now = new Date();
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }).length}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company name or PAN..."
            className="bg-transparent text-sm outline-none text-slate-700 placeholder-slate-400 w-full"
          />
        </div>
        <p className="text-xs text-slate-400 whitespace-nowrap">
          Click a cell to edit inline · Use action buttons for full form
        </p>
      </div>

      {/* AG Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-sm">Loading companies…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
              <Building2 size={24} className="text-slate-400" />
            </div>
            <p className="text-slate-500 text-sm">
              {search ? "No companies match your search" : "No companies yet — create one to get started"}
            </p>
            {!search && (
              <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors mt-1">
                <Plus size={14} /> Create Company
              </button>
            )}
          </div>
        ) : (
          <div className="ag-theme-quartz" style={{ height: Math.max(300, Math.min(filtered.length * 52 + 100, 520)) }}>
            <AgGridReact<Company>
              theme="legacy"
              ref={gridRef}
              rowData={filtered}
              columnDefs={columnDefs}
              defaultColDef={{ resizable: true, sortable: true }}
              onCellEditingStopped={onCellEditingStopped}
              rowHeight={52}
              headerHeight={44}
              animateRows
              stopEditingWhenCellsLoseFocus
              singleClickEdit={false}
              getRowId={(p) => p.data._id}
            />
          </div>
        )}
      </div>

      {/* Inline edit hint */}
      <p className="text-xs text-slate-400 text-center">
        Double-click any <strong>Company Name</strong> or <strong>PAN Number</strong> cell to edit inline.
        Changes are saved automatically after validation.
      </p>

      {/* Modal */}
      {modal && (
        <CompanyModal
          mode={modal.mode}
          company={modal.company}
          loading={saving}
          onClose={() => setModal(null)}
          onSubmit={handleModalSubmit}
        />
      )}
    </div>
  );
}
