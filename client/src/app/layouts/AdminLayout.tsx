import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard, Building2, BookOpen, Landmark, Upload,
  FileText, BarChart3, TrendingUp, PieChart, Download, LineChart,
  ChevronLeft, ChevronRight, Bell, Search, ChevronDown,
  LogOut, Settings, User, Menu, X, Calculator, CalendarRange,
  CheckCircle2, BookMarked, Users, Cog,
} from "lucide-react";
import type { FinancialYear } from "../api/financialYearApi";
import { BalanceSheetPanel } from "../components/BalanceSheetPanel";

const BS_PANEL_PATHS = new Set([
  "/bank-cash-book", "/journal-voucher",
  "/ledger-master", "/trial-balance", "/financial-year",
]);

const ALL_NAV_ITEMS = [
  { path: "/",               icon: LayoutDashboard, label: "Dashboard"        },
  { path: "/financial-year", icon: CalendarRange,   label: "Financial Year"   },
  { path: "/ledger-master",  icon: BookMarked,      label: "Ledger Master"    },
  { path: "/opening-balances",icon: BookOpen,       label: "Opening Balances" },
  { path: "/bank-cash-book", icon: Landmark,        label: "Bank / Cash Book" },
  { path: "/journal-voucher",icon: FileText,        label: "Journal Voucher"  },
  { path: "/balance-sheet",  icon: BarChart3,       label: "Balance Sheet"    },
  { path: "/trial-balance",  icon: TrendingUp,      label: "Trial Balance"    },
  { path: "/export",         icon: Download,        label: "Export"           },
  { path: "/user-management",icon: Users,            label: "User Management"  },
  { path: "/settings",       icon: Cog,              label: "Settings"         },
];

const statusColors: Record<string, string> = {
  current:  "bg-emerald-500",
  previous: "bg-slate-400",
  future:   "bg-indigo-400",
  closed:   "bg-red-400",
};

export default function AdminLayout() {
  const {
    company, selectedFY, setSelectedFY, availableFYs, fyLoading,
    sidebarCollapsed, setSidebarCollapsed,
  } = useApp();
  const { user, isAuthenticated, isLoading: authLoading, logout, canView } = useAuth();
  const navigate = useNavigate();

  const location   = useLocation();
  const showBSPanel = BS_PANEL_PATHS.has(location.pathname);

  const [profileOpen, setProfileOpen] = useState(false);
  const [fyOpen,      setFyOpen]      = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [bsOpen,      setBsOpen]      = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    } else if (!authLoading && isAuthenticated && !company.id) {
      navigate("/company-select", { replace: true });
    }
  }, [authLoading, isAuthenticated, company.id, navigate]);

  const handleFYSelect = (fy: FinancialYear) => {
    setSelectedFY(fy);
    setFyOpen(false);
  };

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
    navigate("/login", { replace: true });
  };

  // Filter nav items by role visibility
  const navItems = ALL_NAV_ITEMS.filter((item) => canView(item.path));

  // Show nothing while auth state loads
  if (authLoading) return null;

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed lg:relative z-50 flex flex-col h-full bg-[#0f172a]
          transition-all duration-300 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${sidebarCollapsed ? "lg:w-[72px]" : "lg:w-[240px]"}
          w-[240px]
        `}
      >
        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/10 ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""}`}>
          <div className="flex-shrink-0 w-9 h-9 bg-indigo-500 rounded-lg flex items-center justify-center">
            <Calculator size={18} className="text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="lg:block hidden min-w-0 flex-1">
              <p className="text-white text-sm font-semibold leading-tight truncate" title={company.name}>{company.name}</p>
              <p className="text-indigo-300 text-[10px] mt-0.5">Basic Accounting</p>
            </div>
          )}
          <div className="lg:hidden block min-w-0 flex-1">
            <p className="text-white text-sm font-semibold leading-tight truncate" title={company.name}>{company.name}</p>
            <p className="text-indigo-300 text-[10px] mt-0.5">Basic Accounting</p>
          </div>
        </div>

        {/* Active FY pill (visible when sidebar is expanded) */}
        {!sidebarCollapsed && selectedFY && (
          <div className="mx-3 mt-3 mb-1 px-3 py-2 bg-white/5 rounded-lg border border-white/10 lg:block hidden">
            <p className="text-indigo-300 text-[10px] font-medium uppercase tracking-wider">Active Period</p>
            <p className="text-white text-xs font-semibold mt-0.5">{selectedFY.label}</p>
            <p className="text-slate-400 text-[10px]">
              {new Date(selectedFY.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
              {" – "}
              {new Date(selectedFY.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative
                ${isActive ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-white/10 hover:text-white"}
                ${sidebarCollapsed ? "lg:justify-center lg:px-2" : ""}`
              }
            >
              <Icon size={18} className="flex-shrink-0" />
              <span className={`text-sm whitespace-nowrap lg:${sidebarCollapsed ? "hidden" : "block"}`}>
                {label}
              </span>
              {sidebarCollapsed && (
                <div className="hidden lg:block absolute left-full ml-2 px-2 py-1 bg-slate-700 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  {label}
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Collapse button */}
        <div className="hidden lg:flex p-3 border-t border-white/10">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-all w-full"
          >
            {sidebarCollapsed
              ? <ChevronRight size={16} />
              : <><ChevronLeft size={16} /><span className="text-xs">Collapse</span></>
            }
          </button>
        </div>
      </aside>

      {/* ── Main + right panel ───────────────────────────────────────────────── */}
      <div className="flex-1 flex min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="flex-shrink-0 h-16 bg-white border-b border-slate-200 flex items-center px-4 lg:px-6 gap-4 shadow-sm">
          {/* Mobile menu */}
          <button
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Company name */}
          <NavLink
            to="/company-select"
            className="flex items-center gap-2 min-w-0 rounded-lg px-2 py-1 hover:bg-slate-100 transition-colors group"
          >
            <div className="w-7 h-7 bg-indigo-100 rounded-md flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-200 transition-colors">
              <Building2 size={14} className="text-indigo-600" />
            </div>
            <span className="text-sm font-semibold text-slate-800 truncate hidden sm:block">
              {company.name}
            </span>
          </NavLink>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-sm mx-4 items-center gap-2 bg-slate-100 rounded-lg px-3 py-2">
            <Search size={15} className="text-slate-400 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search transactions, accounts..."
              className="bg-transparent text-sm text-slate-600 placeholder-slate-400 outline-none w-full"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* ── Financial Year Switcher ──────────────────────────────────── */}
            <div className="relative">
              <button
                onClick={() => { setFyOpen(!fyOpen); setProfileOpen(false); }}
                disabled={fyLoading}
                className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm"
              >
                {/* status dot */}
                {selectedFY && (
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[selectedFY.status]}`} />
                )}
                <span className="text-slate-800 font-semibold hidden sm:block">
                  {selectedFY ? selectedFY.label : "Loading…"}
                </span>
                <span className="text-slate-800 font-semibold sm:hidden">
                  {selectedFY ? selectedFY.financialYear : "…"}
                </span>
                <ChevronDown size={13} className={`text-slate-400 transition-transform ${fyOpen ? "rotate-180" : ""}`} />
              </button>

              {fyOpen && (
                <div className="absolute right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 w-64 z-50 overflow-hidden">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Switch Financial Year</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">April 1 — March 31</p>
                  </div>

                  <div className="py-1 max-h-64 overflow-y-auto">
                    {availableFYs.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-slate-400">No financial years found</p>
                    ) : (
                      availableFYs.map((fy: FinancialYear) => {
                        const isSelected = fy._id === selectedFY?._id;
                        return (
                          <button
                            key={fy._id}
                            onClick={() => handleFYSelect(fy)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                              ${isSelected ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[fy.status]}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${isSelected ? "text-indigo-700" : "text-slate-800"}`}>
                                {fy.label}
                              </p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {new Date(fy.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                                {" – "}
                                {new Date(fy.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {isSelected && <CheckCircle2 size={14} className="text-indigo-600" />}
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize
                                ${fy.status === "current"  ? "bg-emerald-50 text-emerald-700" :
                                  fy.status === "previous" ? "bg-slate-100 text-slate-600" :
                                  fy.status === "future"   ? "bg-indigo-50 text-indigo-600" :
                                                             "bg-red-50 text-red-600"}`}>
                                {fy.status}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Footer link */}
                  <div className="border-t border-slate-100 px-4 py-2.5">
                    <NavLink
                      to="/financial-year"
                      onClick={() => setFyOpen(false)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                    >
                      <CalendarRange size={12} /> Manage Financial Years
                    </NavLink>
                  </div>
                </div>
              )}
            </div>

            {/* Notifications */}
            <button className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            {/* User Profile */}
            <div className="relative">
              <button
                onClick={() => { setProfileOpen(!profileOpen); setFyOpen(false); }}
                className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                  {user?.avatar ?? user?.name?.slice(0, 2).toUpperCase() ?? "?"}
                </div>
                <ChevronDown size={14} className="text-slate-400 hidden sm:block" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 w-56 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    <span className={`inline-block mt-1.5 px-2 py-0.5 text-xs rounded-full font-medium ${
                      user?.role === "Admin"      ? "bg-indigo-100 text-indigo-700" :
                      user?.role === "Accountant" ? "bg-emerald-100 text-emerald-700" :
                                                    "bg-amber-100 text-amber-700"
                    }`}>{user?.role}</span>
                  </div>
                  <div className="py-1">
                    <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                      <User size={15} className="text-slate-400" /> My Profile
                    </button>
                    <NavLink
                      to="/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Settings size={15} className="text-slate-400" /> Settings
                    </NavLink>
                  </div>
                  <div className="border-t border-slate-100 py-1">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={15} /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* ── Balance Sheet right panel ─────────────────────────────────────── */}
      {showBSPanel && (
        <BalanceSheetPanel open={bsOpen} onToggle={() => setBsOpen(!bsOpen)} />
      )}
      </div>
    </div>
  );
}
