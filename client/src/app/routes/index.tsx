import { createBrowserRouter, Navigate } from "react-router";
import AdminLayout from "../layouts/AdminLayout";
import CompanySetup from "../pages/CompanySetup";
import FinancialYear from "../pages/FinancialYear";
import OpeningBalances from "../pages/OpeningBalances";
import BankCashBook from "../pages/BankCashBook";
import BankImport from "../pages/BankImport";
import JournalVoucher from "../pages/JournalVoucher";
import BalanceSheet from "../pages/BalanceSheet";
import TrialBalance from "../pages/TrialBalance";
import PLStatement from "../pages/PLStatement";
import Export from "../pages/Export";
import LedgerMaster from "../pages/LedgerMaster";
import Login from "../pages/Login";
import CompanySelect from "../pages/CompanySelect";
import UserManagement from "../pages/UserManagement";
import Settings from "../pages/Settings";

// Superadmin Pages
import { SuperAdminLayout } from "../layouts/SuperAdminLayout";
import SuperAdminLogin from "../pages/super-admin/Login";
import SuperAdminDashboard from "../pages/super-admin/Dashboard";
import CompanyManagement from "../pages/super-admin/CompanyManagement";
import CreateCompany from "../pages/super-admin/CreateCompany";
import CompanyDetails from "../pages/super-admin/CompanyDetails";

export const router = createBrowserRouter([
  { path: "/login",          Component: Login         },
  { path: "/company-select", Component: CompanySelect },
  { path: "/superadmin",     Component: SuperAdminLogin },
  {
    path: "/super-admin",
    Component: SuperAdminLayout,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: "dashboard", Component: SuperAdminDashboard },
      { path: "firms", Component: CompanyManagement },
      { path: "create-firm", Component: CreateCompany },
      { path: "firms/:id", Component: CompanyDetails },
      { path: "*", element: <Navigate to="dashboard" replace /> }
    ]
  },
  {
    path: "/",
    Component: AdminLayout,
    children: [
      { index: true, element: <Navigate to="financial-year" replace /> },
      { path: "company-setup", Component: CompanySetup },
      { path: "financial-year", Component: FinancialYear },
      { path: "ledger-master", Component: LedgerMaster },
      { path: "opening-balances", Component: OpeningBalances },
      { path: "bank-cash-book", Component: BankCashBook },
      { path: "bank-import", Component: BankImport },
      { path: "journal-voucher", Component: JournalVoucher },
      { path: "balance-sheet", Component: BalanceSheet },
      { path: "trial-balance", Component: TrialBalance },
      { path: "pl-statement", Component: PLStatement },
      { path: "export", Component: Export },
      { path: "settings", Component: Settings },
      // Catch-all: redirect any unknown path to dashboard
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
  // Top-level catch-all
  { path: "*", element: <Navigate to="/" replace /> },
]);
