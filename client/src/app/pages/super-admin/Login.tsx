import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Calculator, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import axiosClient from "../../api/axiosClient";
import { useAuth } from "../../context/AuthContext";

export default function SuperAdminLogin() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authenticated as superadmin, redirect
  useEffect(() => {
    if (isAuthenticated && user?.role === "SUPER_ADMIN") {
      navigate("/super-admin/dashboard", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await axiosClient.post("/super-admin/login", { email, password });
      localStorage.setItem("ap_token", res.data.token);
      // Remove any client-specific company details to prevent dashboard pollution
      localStorage.removeItem("ap_company");
      localStorage.removeItem("ap_selected_fy");

      // Redirect and reload to ensure AuthContext picks up the new token
      window.location.href = "/super-admin/dashboard";
    } catch (err: any) {
      setError(err?.message || "Invalid superadmin credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-6">
        {/* Logo card */}
        <div className="text-center space-y-3">
          <div className="inline-flex w-16 h-16 bg-indigo-600 rounded-2xl items-center justify-center shadow-xl shadow-indigo-500/30">
            <Calculator size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-white text-2xl font-bold tracking-tight">AccountPro</h1>
            <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wider mt-1">Super Admin Portal</p>
          </div>
        </div>

        {/* Login form */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/10 space-y-5">
          <div>
            <h2 className="text-slate-900 text-lg font-semibold">System Administrator Sign In</h2>
            <p className="text-slate-500 text-sm mt-1">Authorized personnel only</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Admin Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="superadmin@accountpro.com"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Security Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                loading
                  ? "bg-indigo-400 text-white cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg"
              }`}
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Verifying…</> : "Authenticate"}
            </button>
          </form>
          
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[11px] text-slate-400 text-center">
              Default credentials: <span className="font-semibold text-slate-600">superadmin@accountpro.com</span> / <span className="font-semibold text-slate-600">admin123</span>
            </p>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs">
          © 2026 AccountPro SaaS System · All rights reserved
        </p>
      </div>
    </div>
  );
}
