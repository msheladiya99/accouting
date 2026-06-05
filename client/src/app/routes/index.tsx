import { createBrowserRouter } from "react-router";
import AdminLayout from "../layouts/AdminLayout";
import Dashboard from "../pages/Dashboard";
import CompanySetup from "../pages/CompanySetup";
import FinancialYear from "../pages/FinancialYear";
import OpeningBalances from "../pages/OpeningBalances";
import BankCashBook from "../pages/BankCashBook";
import BankImport from "../pages/BankImport";
import JournalVoucher from "../pages/JournalVoucher";
import BalanceSheet from "../pages/BalanceSheet";
import TrialBalance from "../pages/TrialBalance";
import PLStatement from "../pages/PLStatement";
import Reports from "../pages/Reports";
import Export from "../pages/Export";
import LedgerMaster from "../pages/LedgerMaster";
import Login from "../pages/Login";
import CompanySelect from "../pages/CompanySelect";
import UserManagement from "../pages/UserManagement";
import Settings from "../pages/Settings";

export const router = createBrowserRouter([
  { path: "/login",          Component: Login         },
  { path: "/company-select", Component: CompanySelect },
  {
    path: "/",
    Component: AdminLayout,
    children: [
      { index: true, Component: Dashboard },
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
      { path: "reports", Component: Reports },
      { path: "export", Component: Export },
      { path: "user-management", Component: UserManagement },
      { path: "settings", Component: Settings },
    ],
  },
]);
