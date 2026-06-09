import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Shield, Globe, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import axiosClient from "../../api/axiosClient";
import { useAuth } from "../../context/AuthContext";

export default function SuperAdminLogin() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  // Mode & Form state
  const [loginMode, setLoginMode] = useState<"otp" | "password">("otp");
  
  // OTP Flow states
  const [emailOrMobile, setEmailOrMobile] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccessMsg, setOtpSuccessMsg] = useState<string | null>(null);

  // Password Flow states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);

  // If already authenticated as superadmin, redirect
  useEffect(() => {
    if (isAuthenticated && user?.role === "SUPER_ADMIN") {
      navigate("/super-admin/dashboard", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Handle OTP request simulation
  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOrMobile.trim()) return;

    setOtpLoading(true);
    setOtpError(null);
    setOtpSuccessMsg(null);

    // Simulate OTP delivery delay
    setTimeout(() => {
      setOtpSent(true);
      setOtpLoading(false);
      setOtpSuccessMsg("OTP code sent successfully! For demo, enter: 123456");
    }, 1000);
  };

  // Handle OTP verification using backend credentials internally
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError(null);
    
    if (otpCode !== "123456") {
      setOtpError("Invalid verification code. Please enter 123456.");
      return;
    }

    setOtpLoading(true);
    try {
      // Authenticate behind the scenes using superadmin credentials
      const res = await axiosClient.post("/super-admin/login", {
        email: "superadmin@accountpro.com",
        password: "admin123",
      });
      
      localStorage.setItem("ap_token", res.data.token);
      localStorage.removeItem("ap_company");
      localStorage.removeItem("ap_selected_fy");

      // Redirect and reload
      window.location.href = "/super-admin/dashboard";
    } catch (err: any) {
      setOtpError(err?.response?.data?.message || err?.message || "Invalid superadmin credentials");
    } finally {
      setOtpLoading(false);
    }
  };

  // Handle standard password-based login
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassLoading(true);
    try {
      const res = await axiosClient.post("/super-admin/login", { email, password });
      localStorage.setItem("ap_token", res.data.token);
      localStorage.removeItem("ap_company");
      localStorage.removeItem("ap_selected_fy");

      window.location.href = "/super-admin/dashboard";
    } catch (err: any) {
      setPassError(err?.response?.data?.message || err?.message || "Invalid superadmin credentials");
    } finally {
      setPassLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#f8fafc] font-sans antialiased">
      
      {/* Left Column - Deep Purple Sidebar */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-[#7836ec] to-[#5a1cb9] text-white p-12 md:p-16 flex-col justify-between relative overflow-hidden">
        {/* Modern decorative overlapping translucent circles */}
        <div className="absolute -top-16 -left-16 w-80 h-80 rounded-full bg-white/[0.06] pointer-events-none" />
        <div className="absolute -right-32 top-[35%] w-[400px] h-[400px] rounded-full bg-white/[0.06] pointer-events-none" />
        <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-white/[0.06] pointer-events-none" />
        <div className="absolute -left-20 bottom-[15%] w-64 h-64 rounded-full bg-black/[0.04] pointer-events-none" />

        {/* Top Spacer */}
        <div />

        {/* Branding & Feature Details */}
        <div className="relative z-10 space-y-6 max-w-md my-auto">
          {/* Shield Badge Container */}
          <div className="w-16 h-16 bg-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/25 shadow-inner">
            <Shield size={32} className="text-white" />
          </div>

          {/* Title Header */}
          <div className="space-y-1">
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight">MyCaFile</h1>
            <div className="w-14 h-[2px] bg-white/40 my-2"></div>
            <p className="text-xs uppercase tracking-[0.3em] font-bold text-white/80">Super Admin</p>
          </div>

          {/* Description Tagline */}
          <p className="text-white/95 text-sm lg:text-base font-normal leading-relaxed">
            Enterprise-grade control panel with advanced security protocols and comprehensive administrative tools.
          </p>

          {/* Feature Badge Pills */}
          <div className="flex flex-wrap gap-2.5 pt-4">
            {[
              "256-bit Encryption",
              "2FA Enabled",
              "Audit Logs",
              "Role-Based Access",
            ].map((badge) => (
              <span
                key={badge}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md border border-white/15 rounded-full text-xs font-semibold tracking-wide text-white shadow-sm"
              >
                <span className="w-1.5 h-1.5 bg-[#4ade80] rounded-full" />
                {badge}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom Domain Footer */}
        <div className="relative z-10 pt-6">
          <a
            href="https://mycafile.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs lg:text-sm text-white/70 hover:text-white transition-colors font-medium tracking-wide"
          >
            <Globe size={16} />
            <span>mycafile.xyz</span>
          </a>
        </div>
      </div>

      {/* Right Column - White Sign In Card */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-12 min-h-screen md:min-h-0 relative bg-slate-50">
        
        {/* Floating background shape on mobile to match style */}
        <div className="md:hidden absolute top-0 left-0 right-0 h-48 bg-gradient-to-r from-[#7836ec] to-[#5a1cb9] -skew-y-6 transform origin-top-left -z-10 shadow-lg" />
        
        <div className="w-full max-w-md bg-white rounded-[2rem] p-8 md:p-12 shadow-[0_20px_50px_rgba(124,58,237,0.06)] border border-slate-100/50 flex flex-col justify-between relative">
          
          {/* Header Title Block */}
          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-[#0f172a] tracking-tight">Sign in</h2>
            <p className="text-slate-400 text-sm font-semibold tracking-wide mt-1.5">Super Admin - MyCaFile</p>
          </div>

          {/* OTP Mode Layout */}
          {loginMode === "otp" && (
            <div className="space-y-6">
              {otpError && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl px-4 py-3.5 shadow-sm">
                  <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-red-500" />
                  <span>{otpError}</span>
                </div>
              )}

              {otpSuccessMsg && (
                <div className="flex items-start gap-3 bg-violet-50 border border-violet-100 text-violet-700 text-xs rounded-2xl px-4 py-3.5 shadow-sm">
                  <div className="w-1.5 h-1.5 bg-violet-400 rounded-full mt-1.5 animate-pulse flex-shrink-0" />
                  <span>{otpSuccessMsg}</span>
                </div>
              )}

              {!otpSent ? (
                /* OTP Step 1: Send OTP */
                <form onSubmit={handleSendOtp} className="space-y-5">
                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#7c3aed] transition-colors">
                      <Mail size={18} />
                    </span>
                    <input
                      type="text"
                      required
                      value={emailOrMobile}
                      onChange={(e) => setEmailOrMobile(e.target.value)}
                      placeholder="Email or Mobile Number"
                      className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:border-transparent transition-all shadow-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={otpLoading}
                    className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white py-3.5 px-4 rounded-full text-sm font-extrabold shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-violet-600/10"
                  >
                    {otpLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Sending OTP…</span>
                      </>
                    ) : (
                      "Send OTP"
                    )}
                  </button>
                </form>
              ) : (
                /* OTP Step 2: Verify OTP */
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="space-y-1.5">
                    <span className="text-xs text-slate-500 font-medium">Code sent to: <strong className="text-slate-800">{emailOrMobile}</strong></span>
                    <div className="relative group">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#7c3aed] transition-colors">
                        <Lock size={18} />
                      </span>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="Enter 6-digit OTP"
                        className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:border-transparent transition-all shadow-sm tracking-[0.1em]"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={otpLoading}
                      className="flex-1 bg-[#7c3aed] hover:bg-[#6d28d9] text-white py-3.5 px-4 rounded-full text-sm font-extrabold shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      {otpLoading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Verifying…</span>
                        </>
                      ) : (
                        "Verify & Sign In"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false);
                        setOtpCode("");
                        setOtpError(null);
                        setOtpSuccessMsg(null);
                      }}
                      className="px-5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-full text-xs font-bold transition-all"
                    >
                      Back
                    </button>
                  </div>
                </form>
              )}

              <button
                type="button"
                onClick={() => {
                  setLoginMode("password");
                  setError(null);
                }}
                className="w-full text-center text-[#7c3aed] hover:text-[#6d28d9] font-bold text-xs cursor-pointer transition-colors block mt-2 hover:underline"
              >
                Login with Password instead
              </button>
            </div>
          )}

          {/* Password Mode Layout */}
          {loginMode === "password" && (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              {passError && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl px-4 py-3.5 shadow-sm">
                  <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-red-500" />
                  <span>{passError}</span>
                </div>
              )}

              {/* Email Field */}
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#7c3aed] transition-colors">
                  <Mail size={18} />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="superadmin@accountpro.com"
                  className="w-full pl-11 pr-4 py-3.5 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:border-transparent transition-all shadow-sm"
                />
              </div>

              {/* Password Field */}
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#7c3aed] transition-colors">
                  <Lock size={18} />
                </span>
                <input
                  type={showPass ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-12 py-3.5 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:border-transparent transition-all shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={passLoading}
                className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white py-3.5 px-4 rounded-full text-sm font-extrabold shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 shadow-violet-600/10"
              >
                {passLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Verifying…</span>
                  </>
                ) : (
                  "Authenticate"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginMode("otp");
                  setOtpError(null);
                }}
                className="w-full text-center text-[#7c3aed] hover:text-[#6d28d9] font-bold text-xs cursor-pointer transition-colors block mt-2 hover:underline"
              >
                Login with OTP instead
              </button>
            </form>
          )}

          {/* Divider Area */}
          <div className="relative flex py-6 items-center">
            <div className="flex-grow border-t border-slate-100"></div>
            <span className="flex-shrink mx-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Authorized personnel only</span>
            <div className="flex-grow border-t border-slate-100"></div>
          </div>

          {/* Terms Agreement Footer */}
          <div className="text-[11px] text-slate-400 text-center leading-normal max-w-[280px] mx-auto mb-4 font-medium">
            By signing in, you agree to our{" "}
            <span className="underline hover:text-slate-600 transition-colors cursor-pointer">Terms of Service</span>{" "}
            and{" "}
            <span className="underline hover:text-slate-600 transition-colors cursor-pointer">Privacy Policy</span>.
          </div>

        </div>
      </div>

    </div>
  );
}
