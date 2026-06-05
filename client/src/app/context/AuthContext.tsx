import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  login as apiLogin, logout as apiLogout, verifyToken, initials,
  ROLE_PERMISSIONS, ROLE_VISIBLE_PATHS,
  type AuthUser, type Role, type Permission,
} from "../api/authApi";

interface AuthContextValue {
  user:            AuthUser | null;
  token:           string | null;
  isAuthenticated: boolean;
  isLoading:       boolean;
  login:           (email: string, password: string) => Promise<void>;
  logout:          () => Promise<void>;
  hasPermission:   (perm: Permission) => boolean;
  canView:         (path: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [token,     setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("ap_token");
    if (stored) {
      const payload = verifyToken(stored) as any;
      if (payload) {
        setToken(stored);
        setUser({
          _id:       payload.sub,
          name:      payload.name,
          email:     payload.email,
          role:      payload.role as Role,
          status:    "Active",
          createdAt: "",
          avatar:    initials(payload.name),
        });
      } else {
        localStorage.removeItem("ap_token");
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    localStorage.setItem("ap_token", result.token);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setToken(null);
    setUser(null);
  }, []);

  const hasPermission = useCallback((perm: Permission): boolean => {
    if (!user) return false;
    return ROLE_PERMISSIONS[user.role]?.[perm] ?? false;
  }, [user]);

  const canView = useCallback((path: string): boolean => {
    if (!user) return false;
    const allowed = ROLE_VISIBLE_PATHS[user.role] ?? [];
    return allowed.some((p) => p === path || (path !== "/" && p.startsWith(path)));
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user, token, isAuthenticated: !!user, isLoading,
      login, logout, hasPermission, canView,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
