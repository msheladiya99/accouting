import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Calculator, Eye, EyeOff, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const DEMO_CREDENTIALS = [
  { role: "Admin",      email: "admin@acmecorp.com", password: "admin123",  color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { role: "Accountant", email: "priya@acmecorp.com", password: "acc123",    color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { role: "Viewer",     email: "sneha@acmecorp.com", password: "view123",   color: "bg-amber-100 text-amber-700 border-amber-200" },
];

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) navigate("/company-select", { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/company-select", { replace: true });
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (d: typeof DEMO_CREDENTIALS[number]) => {
    setEmail(d.email);
    setPassword(d.password);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center p-4">
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
            <p className="text-indigo-300 text-sm mt-1">Professional Accounting Suite</p>
          </div>
        </div>

        {/* Login form */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-5">
          <div>
            <h2 className="text-slate-900 text-lg font-semibold">Sign in to your account</h2>
            <p className="text-slate-500 text-sm mt-1">Enter your credentials to continue</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Email address</label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@acmecorp.com"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
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
              {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : "Sign in"}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck size={13} className="text-indigo-400" />
              Demo credentials — click to fill
            </div>
            <div className="space-y-2">
              {DEMO_CREDENTIALS.map((d) => (
                <button
                  key={d.role}
                  onClick={() => fillDemo(d)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-all hover:shadow-sm ${d.color}`}
                >
                  <span className="font-semibold">{d.role}</span>
                  <span className="font-mono opacity-80">{d.email} · {d.password}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs">
          © 2026 AccountPro · All rights reserved
        </p>
      </div>
    </div>
  );
}
