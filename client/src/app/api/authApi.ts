import axiosClient from "./axiosClient";

// ── Types ──────────────────────────────────────────────────────────────────────
export type Role = "Admin" | "Accountant" | "Viewer";
export type Permission = "create" | "edit" | "delete" | "export";

export interface AuthUser {
  _id:       string;
  name:      string;
  email:     string;
  role:      Role;
  status:    "Active" | "Inactive";
  createdAt: string;
  lastLogin?: string;
  avatar?:   string;
}

export interface UserPayload {
  name:     string;
  email:    string;
  password?: string;
  role:     Role;
  status:   "Active" | "Inactive";
}

// ── Role → Permissions matrix ──────────────────────────────────────────────────
export const ROLE_PERMISSIONS: Record<Role, Record<Permission, boolean>> = {
  Admin:      { create: true,  edit: true,  delete: true,  export: true  },
  Accountant: { create: true,  edit: true,  delete: false, export: true  },
  Viewer:     { create: false, edit: false, delete: false, export: false },
};

// ── Role → visible sidebar paths ──────────────────────────────────────────────
export const ROLE_VISIBLE_PATHS: Record<Role, string[]> = {
  Admin: [
    "/", "/financial-year", "/ledger-master",
    "/opening-balances", "/bank-cash-book", "/bank-import",
    "/journal-voucher", "/balance-sheet", "/trial-balance",
    "/pl-statement", "/reports", "/export", "/user-management", "/settings",
  ],
  Accountant: [
    "/", "/ledger-master", "/bank-cash-book", "/bank-import",
    "/journal-voucher", "/balance-sheet", "/trial-balance",
    "/pl-statement", "/reports", "/export", "/settings",
  ],
  Viewer: [
    "/", "/balance-sheet", "/trial-balance", "/pl-statement", "/reports", "/settings",
  ],
};

// ── Initials helper ───────────────────────────────────────────────────────────
export function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── Client-side JWT Decoder helper ─────────────────────────────────────────────
export function verifyToken(token: string): (object & { exp: number; email: string; role: Role; name: string }) | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    // Decode base64 URL payload
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    
    const payload = JSON.parse(jsonPayload);
    if (!payload.exp || Date.now() > payload.exp * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Auth API ───────────────────────────────────────────────────────────────────
export interface LoginResult {
  token: string;
  user:  AuthUser;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await axiosClient.post<LoginResult>("/auth/login", { email, password });
  return res.data;
}

export async function logout(): Promise<void> {
  await axiosClient.post("/auth/logout");
  localStorage.removeItem("ap_token");
}

// ── User management API ───────────────────────────────────────────────────────
export async function getAllUsers(): Promise<AuthUser[]> {
  const res = await axiosClient.get<AuthUser[]>("/users");
  return res.data;
}

export async function createUser(payload: UserPayload): Promise<AuthUser> {
  const res = await axiosClient.post<AuthUser>("/users", payload);
  return res.data;
}

export async function updateUser(id: string, payload: Partial<UserPayload>): Promise<AuthUser> {
  const res = await axiosClient.put<AuthUser>(`/users/${id}`, payload);
  return res.data;
}

export async function deleteUser(id: string): Promise<void> {
  await axiosClient.delete(`/users/${id}`);
}

export async function resetPassword(id: string, newPassword: string): Promise<void> {
  await axiosClient.post(`/users/${id}/reset-password`, { newPassword });
}
