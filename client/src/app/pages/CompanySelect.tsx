import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Calculator, Search, Plus, Building2, LogOut, Loader2,
  ChevronRight, Calendar, Hash, CheckCircle2, X, AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useApp } from "../context/AppContext";
import { getAllCompanies, createCompany, type Company } from "../api/companyApi";
import UserManagement from "./UserManagement";

// ── Helpers ───────────────────────────────────────────────────────────────────
function companyInitials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

const BG_COLORS = [
  "from-indigo-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-sky-500 to-blue-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-violet-500 to-indigo-600",
];

function companyColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return BG_COLORS[h % BG_COLORS.length];
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Add Company Modal ─────────────────────────────────────────────────────────
function AddCompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Company) => void }) {
  const [name,    setName]    = useState("");
  const [pan,     setPan]     = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
      setError("Invalid PAN format — must be like AABCA1234C");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const c = await createCompany({ companyName: name.trim(), panNumber: pan });
      toast.success(`${c.companyName} created`);
      onCreated(c);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create company");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-slate-900 font-semibold">Add New Company</h2>
            <p className="text-xs text-slate-500 mt-0.5">Create a new company account</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              <AlertTriangle size={15} className="flex-shrink-0" /> {error}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Company Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp Ltd."
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">PAN Number</label>
            <input
              required
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              placeholder="AABCA1234C"
              maxLength={10}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 uppercase"
            />
            <p className="text-[11px] text-slate-400">Format: 5 letters · 4 digits · 1 letter (e.g. AABCA1234C)</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : "Create Company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CompanySelect() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { setCompany } = useApp();
  const navigate = useNavigate();

  const [companies,   setCompanies]   = useState<Company[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [showAdd,     setShowAdd]     = useState(false);
  const [selecting,   setSelecting]   = useState<string | null>(null);
  const [view,        setView]        = useState<"companies" | "users">("companies");

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    getAllCompanies().then((data) => { setCompanies(data); setLoading(false); });
  }, []);

  const handleSelect = async (c: Company) => {
    setSelecting(c._id);
    await new Promise((r) => setTimeout(r, 300));
    setCompany({
      id:       c._id,
      name:     c.companyName,
      address:  "—",
      phone:    "—",
      email:    "—",
      taxId:    c.panNumber,
      currency: "INR",
    });
    navigate("/", { replace: true });
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const filtered = companies.filter((c) =>
    c.companyName.toLowerCase().includes(search.toLowerCase()) ||
    c.panNumber.toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
              <Calculator size={18} className="text-white" />
            </div>
            <div className="hidden sm:block">
              <p className="text-slate-900 text-sm font-bold leading-tight">AccountPro</p>
              <p className="text-indigo-500 text-[11px] leading-tight">Professional Suite</p>
            </div>
          </div>

          {/* Navigation Tabs (only for Admin users) */}
          {user?.role === "Admin" && (
            <div className="flex items-center gap-6 h-full">
              <button
                onClick={() => setView("companies")}
                className={`h-full border-b-2 text-sm font-semibold transition-all px-1 ${
                  view === "companies"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                Companies / Firms
              </button>
              <button
                onClick={() => setView("users")}
                className={`h-full border-b-2 text-sm font-semibold transition-all px-1 ${
                  view === "users"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                User Management
              </button>
            </div>
          )}

          {/* User + logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-semibold">
                {user?.avatar ?? "?"}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800 leading-tight">{user?.name}</p>
                <p className="text-[10px] text-slate-400 leading-tight">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 border border-slate-200 hover:border-red-200 transition-all text-xs font-medium"
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {view === "companies" ? (
          <>
            {/* Hero text */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold mb-2">
                <CheckCircle2 size={13} />
                Signed in as {user?.name}
              </div>
              <h1 className="text-slate-900 text-2xl font-bold">Select a Company</h1>
              <p className="text-slate-500 text-sm">Choose the company you want to work with, or add a new one</p>
            </div>

            {/* Search + Add */}
            <div className="flex gap-3 items-center">
              <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
                <Search size={15} className="text-slate-400 flex-shrink-0" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by company name or PAN…"
                  className="bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none flex-1"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm flex-shrink-0"
              >
                <Plus size={16} /> Add Company
              </button>
            </div>

            {/* Companies grid */}
            {loading ? (
              <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
                <Loader2 size={22} className="animate-spin" /> Loading companies…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                <Building2 size={40} className="opacity-25" />
                <p className="text-sm font-medium">{search ? "No companies match your search" : "No companies yet"}</p>
                {!search && (
                  <button
                    onClick={() => setShowAdd(true)}
                    className="mt-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    Add First Company
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((c) => {
                  const isSelecting = selecting === c._id;
                  return (
                    <button
                      key={c._id}
                      onClick={() => handleSelect(c)}
                      disabled={!!selecting}
                      className="group relative text-left bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-200 overflow-hidden disabled:opacity-60"
                    >
                      {/* Top color strip */}
                      <div className={`h-1.5 bg-gradient-to-r ${companyColor(c._id)} w-full`} />

                      <div className="p-5 space-y-4">
                        {/* Avatar + name */}
                        <div className="flex items-start gap-4">
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${companyColor(c._id)} flex items-center justify-center text-white text-lg font-bold flex-shrink-0 shadow-sm`}>
                            {companyInitials(c.companyName)}
                          </div>
                          <div className="flex-1 min-w-0 pt-1">
                            <p className="text-sm font-bold text-slate-900 leading-tight line-clamp-2 group-hover:text-indigo-700 transition-colors">
                              {c.companyName}
                            </p>
                          </div>
                        </div>

                        {/* Meta */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Hash size={11} className="text-slate-400 flex-shrink-0" />
                            <span className="font-mono tracking-wide">{c.panNumber}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <Calendar size={11} className="flex-shrink-0" />
                            Added {fmt(c.createdAt)}
                          </div>
                        </div>

                        {/* CTA */}
                        <div className={`flex items-center justify-between pt-3 border-t border-slate-100 ${isSelecting ? "text-indigo-600" : "text-slate-400 group-hover:text-indigo-600"} transition-colors`}>
                          <span className="text-xs font-semibold">
                            {isSelecting ? "Opening…" : "Open Company"}
                          </span>
                          {isSelecting
                            ? <Loader2 size={15} className="animate-spin" />
                            : <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Count */}
            {!loading && filtered.length > 0 && (
              <p className="text-center text-xs text-slate-400">
                {filtered.length} {filtered.length === 1 ? "company" : "companies"}
                {search && ` matching "${search}"`}
              </p>
            )}
          </>
        ) : (
          <UserManagement />
        )}
      </main>

      {showAdd && (
        <AddCompanyModal
          onClose={() => setShowAdd(false)}
          onCreated={(c) => {
            setCompanies((prev) => [c, ...prev]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}
