import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Eye, EyeOff, Loader2, AlertCircle, ShieldCheck,
  Building2, Users, BarChart3
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getSubdomain } from "../utils/subdomain";
import axiosClient from "../api/axiosClient";

const DEMO_CREDENTIALS = [
  { role: "Admin",      email: "admin@acmecorp.com", password: "admin123",  color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { role: "Accountant", email: "priya@acmecorp.com", password: "acc123",    color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { role: "Viewer",     email: "sneha@acmecorp.com", password: "view123",   color: "bg-amber-100 text-amber-700 border-amber-200" },
];

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tenant / Subdomain validation
  const [company, setCompany] = useState<any>(null);
  const [subdomainError, setSubdomainError] = useState(false);
  const subdomain = getSubdomain();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/company-select", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (subdomain) {
      axiosClient.get("/company/current")
        .then(res => {
          setCompany(res.data);
          setSubdomainError(false);
        })
        .catch(err => {
          console.error("Failed to load company details for subdomain:", err);
          setSubdomainError(true);
        });
    }
  }, [subdomain]);

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

  const companyName = company?.companyName || subdomain || "AccountPro";
  const displayBrand = companyName.toUpperCase().replace(/\s+/g, "-");

  return (
    <div className="min-h-screen flex bg-white font-sans">
      {/* Left Pane - Dark Navy Column */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0f253e] text-white p-16 flex-col justify-between relative overflow-hidden">
        {/* Background Subtle Gradient Blobs */}
        <div className="absolute inset-0 pointer-events-none opacity-30">
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-3xl" />
        </div>

        {/* Top Brand Logo */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="flex-shrink-0">
            <Building2 className="w-8 h-8 text-white stroke-[1.8]" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-wider leading-none">{displayBrand}</h2>
            <span className="text-xs text-slate-400 font-semibold tracking-wider mt-1.5 block">Chartered Accountants</span>
          </div>
        </div>

        {/* Center Tagline and Features */}
        <div className="relative z-10 max-w-md my-auto space-y-12">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white">
            Trusted Financial Excellence Since 1995
          </h1>
          <div className="space-y-6">
            <div className="flex items-center gap-4 text-slate-200 text-sm font-semibold">
              <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-indigo-300" />
              </div>
              <span>Secure & Compliant Platform</span>
            </div>
            <div className="flex items-center gap-4 text-slate-200 text-sm font-semibold">
              <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-300" />
              </div>
              <span>Manage Clients Effortlessly</span>
            </div>
            <div className="flex items-center gap-4 text-slate-200 text-sm font-semibold">
              <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-indigo-300" />
              </div>
              <span>Real-time Financial Insights</span>
            </div>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="relative z-10 text-xs text-slate-500 font-medium">
          &copy; 2026 {company?.companyName || "Kumar & Associates"}. All rights reserved.
        </div>
      </div>

      {/* Right Pane - White Login Form Column */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 lg:p-16 relative">
        <div className="w-full max-w-md space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Welcome Back</h1>
            <p className="text-slate-500 text-sm font-medium">Sign in to your account to continue</p>
          </div>

          {/* Subdomain Error Banner */}
          {subdomainError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3.5 shadow-sm">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="font-semibold text-red-800">This firm does not exist. Please check the URL.</div>
            </div>
          )}

          {/* Regular Form Errors */}
          {error && !subdomainError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Email Address</label>
              <input
                type="email"
                autoComplete="email"
                required
                disabled={subdomainError || loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  disabled={subdomainError || loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-10 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all disabled:bg-slate-50 disabled:text-slate-400"
                />
                <button
                  type="button"
                  disabled={subdomainError || loading}
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember & Forgot Row */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-600 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  disabled={subdomainError || loading}
                  className="rounded border-slate-300 text-slate-800 focus:ring-slate-500"
                />
                <span>Remember me</span>
              </label>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-slate-400 hover:text-slate-600 font-medium"
              >
                Forgot password?
              </a>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={subdomainError || loading}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all shadow-md ${
                subdomainError
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  : loading
                    ? "bg-slate-400 text-white cursor-not-allowed shadow-none"
                    : "bg-[#132c4d] hover:bg-[#0f253e] text-white hover:shadow-lg"
              }`}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Signing in…</span>
                </div>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Contact Admin */}
          <div className="text-center pt-2 text-sm text-slate-500 font-medium">
            Don't have an account? <span className="text-[#132c4d] font-bold cursor-pointer hover:underline">Contact Admin</span>
          </div>

          {/* Demo credentials (collapsible for developer check) */}
          {!subdomainError && (
            <div className="pt-6 border-t border-slate-100 space-y-3">
              <details className="group cursor-pointer">
                <summary className="flex items-center gap-2 text-xs font-bold text-slate-500 list-none select-none">
                  <ShieldCheck size={14} className="text-indigo-500" />
                  <span>Developer Demo Logins</span>
                  <span className="text-[10px] text-slate-400 font-normal group-open:hidden">(Click to expand)</span>
                </summary>
                <div className="space-y-2 mt-3 cursor-default">
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
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
