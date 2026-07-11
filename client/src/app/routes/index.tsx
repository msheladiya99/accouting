import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { PageSkeleton, ReportSkeleton } from "../components/PageSkeleton";

// ── Lazy-loaded pages ─────────────────────────────────────────────────────────
// Each page is a separate JS chunk — only downloaded when first navigated to.
// This eliminates the large initial bundle parse time and makes first paint instant.
const AdminLayout      = lazy(() => import("../layouts/AdminLayout"));
const CompanySetup     = lazy(() => import("../pages/CompanySetup"));
const FinancialYear    = lazy(() => import("../pages/FinancialYear"));
const OpeningBalances  = lazy(() => import("../pages/OpeningBalances"));
const BankCashBook     = lazy(() => import("../pages/BankCashBook"));
const BankImport       = lazy(() => import("../pages/BankImport"));
const JournalVoucher   = lazy(() => import("../pages/JournalVoucher"));
const BalanceSheet     = lazy(() => import("../pages/BalanceSheet"));
const TrialBalance     = lazy(() => import("../pages/TrialBalance"));
const PLStatement      = lazy(() => import("../pages/PLStatement"));
const Export           = lazy(() => import("../pages/Export"));
const LedgerMaster     = lazy(() => import("../pages/LedgerMaster"));
const Login            = lazy(() => import("../pages/Login"));
const CompanySelect    = lazy(() => import("../pages/CompanySelect"));
const UserManagement   = lazy(() => import("../pages/UserManagement"));
const Settings         = lazy(() => import("../pages/Settings"));

// Superadmin Pages
const SuperAdminLayout    = lazy(() => import("../layouts/SuperAdminLayout").then(m => ({ default: m.SuperAdminLayout })));
const SuperAdminLogin     = lazy(() => import("../pages/super-admin/Login"));
const SuperAdminDashboard = lazy(() => import("../pages/super-admin/Dashboard"));
const CompanyManagement   = lazy(() => import("../pages/super-admin/CompanyManagement"));
const CreateCompany       = lazy(() => import("../pages/super-admin/CreateCompany"));
const CompanyDetails      = lazy(() => import("../pages/super-admin/CompanyDetails"));

// ── Suspense wrappers ──────────────────────────────────────────────────────────
/** Standard page skeleton — for list/form pages */
function withSkeleton(Component: React.ComponentType) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Component />
    </Suspense>
  );
}

/** Report skeleton — for financial report pages (two-column layout shimmer) */
function withReportSkeleton(Component: React.ComponentType) {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}>
        <Login />
      </Suspense>
    ),
  },
  {
    path: "/company-select",
    element: (
      <Suspense fallback={<PageSkeleton />}>
        <CompanySelect />
      </Suspense>
    ),
  },
  {
    path: "/superadmin",
    element: (
      <Suspense fallback={<PageSkeleton />}>
        <SuperAdminLogin />
      </Suspense>
    ),
  },
  {
    path: "/super-admin",
    element: (
      <Suspense fallback={<PageSkeleton />}>
        <SuperAdminLayout />
      </Suspense>
    ),
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: "dashboard",   element: withSkeleton(SuperAdminDashboard) },
      { path: "firms",       element: withSkeleton(CompanyManagement)   },
      { path: "create-firm", element: withSkeleton(CreateCompany)       },
      { path: "firms/:id",   element: withSkeleton(CompanyDetails)      },
      { path: "*",           element: <Navigate to="dashboard" replace />},
    ],
  },
  {
    path: "/",
    element: (
      <Suspense fallback={<PageSkeleton />}>
        <AdminLayout />
      </Suspense>
    ),
    children: [
      { index: true,               element: <Navigate to="financial-year" replace /> },
      { path: "company-setup",     element: withSkeleton(CompanySetup)        },
      { path: "financial-year",    element: withSkeleton(FinancialYear)       },
      { path: "ledger-master",     element: withSkeleton(LedgerMaster)        },
      { path: "opening-balances",  element: withSkeleton(OpeningBalances)     },
      { path: "bank-cash-book",    element: withSkeleton(BankCashBook)        },
      { path: "bank-import",       element: withSkeleton(BankImport)          },
      { path: "journal-voucher",   element: withSkeleton(JournalVoucher)      },
      { path: "balance-sheet",     element: withReportSkeleton(BalanceSheet)  },
      { path: "trial-balance",     element: withReportSkeleton(TrialBalance)  },
      { path: "pl-statement",      element: withReportSkeleton(PLStatement)   },
      { path: "export",            element: withSkeleton(Export)              },
      { path: "settings",          element: withSkeleton(Settings)            },
      { path: "*",                 element: <Navigate to="/" replace />       },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
