import { useState, useEffect, useCallback } from "react";
import {
  Users, Plus, Pencil, Trash2, Key, Search, ShieldCheck,
  CheckCircle2, XCircle, Loader2, AlertTriangle, X, Eye, EyeOff,
  UserCheck, UserX, Shield, Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import {
  getAllUsers, createUser, updateUser, deleteUser, resetPassword,
  ROLE_PERMISSIONS,
  type AuthUser, type UserPayload, type Role, type Permission,
} from "../api/authApi";

const ROLES: Role[] = ["Admin", "Accountant", "Viewer"];
const PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "create", label: "Create" },
  { key: "edit",   label: "Edit" },
  { key: "delete", label: "Delete" },
  { key: "export", label: "Export" },
];

const ROLE_COLORS: Record<Role, string> = {
  Admin:      "bg-indigo-100 text-indigo-700 border-indigo-200",
  Accountant: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Viewer:     "bg-amber-100 text-amber-700 border-amber-200",
};

const ROLE_ICONS: Record<Role, typeof Shield> = {
  Admin:      Shield,
  Accountant: UserCheck,
  Viewer:     Eye as any,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(dateStr?: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const colors = ["from-indigo-500 to-purple-600", "from-emerald-500 to-teal-600", "from-amber-500 to-orange-600", "from-sky-500 to-blue-600", "from-pink-500 to-rose-600"];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <div
      className={`flex-shrink-0 rounded-full bg-gradient-to-br ${colors[idx]} flex items-center justify-center text-white font-semibold`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

// ── User Form Modal ───────────────────────────────────────────────────────────
interface UserFormProps {
  mode:      "create" | "edit";
  existing?: AuthUser;
  onSave:    () => void;
  onClose:   () => void;
}

function UserFormModal({ mode, existing, onSave, onClose }: UserFormProps) {
  const [name,     setName]     = useState(existing?.name     ?? "");
  const [email,    setEmail]    = useState(existing?.email    ?? "");
  const [role,     setRole]     = useState<Role>(existing?.role ?? "Viewer");
  const [status,   setStatus]   = useState<"Active"|"Inactive">(existing?.status ?? "Active");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string|null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "create" && !password.trim()) { setError("Password is required"); return; }
    setError(null);
    setSaving(true);
    try {
      const payload: UserPayload = { name: name.trim(), email: email.trim(), password: password || "changeme123", role, status };
      if (mode === "create") {
        await createUser(payload);
        toast.success("User created successfully");
      } else {
        const partial: Partial<UserPayload> = { name: name.trim(), email: email.trim(), role, status };
        if (password.trim()) partial.password = password;
        await updateUser(existing!._id, partial);
        toast.success("User updated successfully");
      }
      onSave();
    } catch (err: any) {
      setError(err?.message ?? "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-slate-900 font-semibold">{mode === "create" ? "Add New User" : "Edit User"}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{mode === "create" ? "Create a new team member" : `Editing ${existing?.name}`}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              <AlertTriangle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Full Name</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Aryan Sharma"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Email Address</label>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@acmecorp.com"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as "Active"|"Inactive")}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-slate-600">
                Password {mode === "edit" && <span className="text-slate-400">(leave blank to keep current)</span>}
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "create" ? "Min. 6 characters" : "••••••••"}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 pr-10 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Role permissions preview */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-xs font-medium text-slate-600 mb-2">Permissions for {role}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {PERMISSIONS.map(({ key, label }) => {
                const allowed = ROLE_PERMISSIONS[role][key];
                return (
                  <div key={key} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${
                    allowed ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200"
                  }`}>
                    {allowed ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {label}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors font-medium">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : mode === "create" ? "Create User" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string|null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6)       { setError("Password must be at least 6 characters"); return; }
    if (password !== confirm)       { setError("Passwords do not match"); return; }
    setError(null);
    setSaving(true);
    try {
      await resetPassword(user._id, password);
      toast.success(`Password reset for ${user.name}`);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Reset failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-slate-900 font-semibold">Reset Password</h2>
            <p className="text-xs text-slate-500 mt-0.5">{user.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3"><AlertTriangle size={15} />{error}</div>}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">New Password</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Confirm Password</label>
            <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Reset Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({ user, onConfirm, onClose }: { user: AuthUser; onConfirm: () => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-slate-900 font-semibold">Delete User</h2>
            <p className="text-xs text-slate-500">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <strong>{user.name}</strong>? All their access will be revoked immediately.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
          <button
            disabled={loading}
            onClick={async () => { setLoading(true); await onConfirm(); setLoading(false); }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Deleting…</> : "Delete User"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Role Permissions Matrix ───────────────────────────────────────────────────
function PermissionsMatrix() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck size={16} className="text-indigo-500" />
        <p className="text-sm font-semibold text-slate-700">Role Permissions Matrix</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 w-32">Permission</th>
              {ROLES.map((r) => (
                <th key={r} className="text-center py-2 px-3 text-xs font-semibold text-slate-500">{r}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {PERMISSIONS.map(({ key, label }) => (
              <tr key={key}>
                <td className="py-3 pr-4 text-xs font-medium text-slate-700 capitalize">{label}</td>
                {ROLES.map((r) => {
                  const allowed = ROLE_PERMISSIONS[r][key];
                  return (
                    <td key={r} className="py-3 px-3 text-center">
                      {allowed
                        ? <CheckCircle2 size={16} className="text-emerald-500 mx-auto" />
                        : <XCircle size={16} className="text-slate-300 mx-auto" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function UserManagement() {
  const { user: currentUser, hasPermission } = useAuth();
  const [users,      setUsers]      = useState<AuthUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [roleFilter, setRoleFilter] = useState<"All" | Role>("All");

  const [modal,      setModal]      = useState<"create"|"edit"|"reset"|"delete"|null>(null);
  const [target,     setTarget]     = useState<AuthUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await getAllUsers()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const canCreate = hasPermission("create");
  const canEdit   = hasPermission("edit");
  const canDelete = hasPermission("delete");

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole   = roleFilter === "All" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const handleDelete = async () => {
    if (!target) return;
    try {
      await deleteUser(target._id);
      toast.success(`${target.name} deleted`);
      setModal(null);
      setTarget(null);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    }
  };

  const stats = {
    total:    users.length,
    active:   users.filter((u) => u.status === "Active").length,
    inactive: users.filter((u) => u.status === "Inactive").length,
    admins:   users.filter((u) => u.role === "Admin").length,
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage team members, roles, and permissions</p>
        </div>
        {canCreate && (
          <button
            onClick={() => { setTarget(null); setModal("create"); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus size={16} /> Add User
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Users",    value: stats.total,    icon: Users,    color: "bg-indigo-50 text-indigo-600" },
          { label: "Active",         value: stats.active,   icon: UserCheck, color: "bg-emerald-50 text-emerald-600" },
          { label: "Inactive",       value: stats.inactive, icon: UserX,    color: "bg-slate-50 text-slate-500" },
          { label: "Administrators", value: stats.admins,   icon: Shield,   color: "bg-purple-50 text-purple-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Permissions matrix */}
      <PermissionsMatrix />

      {/* User list */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-1 min-w-48 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <Search size={14} className="text-slate-400 flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
              className="bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none flex-1"
            />
          </div>
          <div className="flex gap-1.5">
            {(["All", ...ROLES] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  roleFilter === r
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 ml-auto">{filtered.length} of {users.length} users</p>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
            <Loader2 size={20} className="animate-spin" /> Loading users…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
            <Users size={32} className="opacity-30" />
            <p className="text-sm">No users found</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map((u) => {
              const RoleIcon = ROLE_ICONS[u.role];
              const isCurrentUser = u._id === currentUser?._id;
              return (
                <div key={u._id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors">
                  {/* Avatar */}
                  <Avatar name={u.name} size={40} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900 truncate">{u.name}</p>
                      {isCurrentUser && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full font-medium">You</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{u.email}</p>
                  </div>

                  {/* Role badge */}
                  <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                    <RoleIcon size={12} />
                    {u.role}
                  </div>

                  {/* Status */}
                  <div className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${
                    u.status === "Active"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-slate-100 text-slate-500 border border-slate-200"
                  }`}>
                    {u.status === "Active" ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                    {u.status}
                  </div>

                  {/* Dates */}
                  <div className="hidden lg:block text-right space-y-0.5">
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Clock size={10} />
                      {u.lastLogin ? `Last: ${fmt(u.lastLogin)}` : "Never logged in"}
                    </div>
                    <p className="text-[11px] text-slate-300">Joined {fmt(u.createdAt)}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {canEdit && (
                      <button
                        onClick={() => { setTarget(u); setModal("edit"); }}
                        className="p-2 rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                        title="Edit user"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => { setTarget(u); setModal("reset"); }}
                        className="p-2 rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                        title="Reset password"
                      >
                        <Key size={15} />
                      </button>
                    )}
                    {canDelete && !isCurrentUser && (
                      <button
                        onClick={() => { setTarget(u); setModal("delete"); }}
                        className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Delete user"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === "create" && (
        <UserFormModal mode="create" onSave={() => { setModal(null); load(); }} onClose={() => setModal(null)} />
      )}
      {modal === "edit" && target && (
        <UserFormModal mode="edit" existing={target} onSave={() => { setModal(null); load(); }} onClose={() => setModal(null)} />
      )}
      {modal === "reset" && target && (
        <ResetPasswordModal user={target} onClose={() => setModal(null)} />
      )}
      {modal === "delete" && target && (
        <DeleteModal user={target} onConfirm={handleDelete} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
