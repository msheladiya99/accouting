import { Router } from "express";
import { authMiddleware, companyRequired } from "../middleware/auth";
import * as authController from "../controllers/authController";
import * as userController from "../controllers/userController";
import * as companyController from "../controllers/companyController";
import * as financialYearController from "../controllers/financialYearController";
import * as ledgerController from "../controllers/ledgerController";
import * as bankCashController from "../controllers/bankCashController";
import * as journalController from "../controllers/journalController";
import * as importController from "../controllers/importController";
import * as accountGroupController from "../controllers/accountGroupController";
import superAdminRouter from "./super-admin";

export const apiRouter = Router();

// Public routes
apiRouter.post("/auth/login", authController.login);
apiRouter.post("/auth/logout", authController.logout);
apiRouter.get("/company/current", companyController.getCurrentCompany);

// Super Admin routes
apiRouter.use("/super-admin", superAdminRouter);

// Protected routes (require auth token verification)
apiRouter.use(authMiddleware as any);

// User routes
apiRouter.get("/users", userController.getAllUsers);
apiRouter.post("/users", userController.createUser);
apiRouter.put("/users/:id", userController.updateUser);
apiRouter.delete("/users/:id", userController.deleteUser);
apiRouter.post("/users/:id/reset-password", userController.resetPassword);

// Company routes (Tenant-level management)
apiRouter.get("/company", companyController.getAllCompanies);
apiRouter.get("/company/:id", companyController.getCompanyById);
apiRouter.post("/company/create", companyController.createCompany);
apiRouter.put("/company/:id", companyController.updateCompany);
apiRouter.delete("/company/:id", companyController.deleteCompany);

// Enforce company scoping for data routes
apiRouter.use([
  "/financial-year",
  "/ledger",
  "/bank-cash-book",
  "/journal-voucher",
  "/bank-import",
  "/account-group"
], companyRequired as any);

// Financial Year routes
apiRouter.get("/financial-year", financialYearController.getAllFYs);
apiRouter.get("/financial-year/current", financialYearController.getCurrentFY);
apiRouter.get("/financial-year/:id", financialYearController.getFYById);
apiRouter.post("/financial-year", financialYearController.createFY);
apiRouter.post("/financial-year/generate", financialYearController.generateFYs);
apiRouter.put("/financial-year/:id/close", financialYearController.closeFY);
apiRouter.delete("/financial-year/:id", financialYearController.deleteFY);

// Ledger routes
apiRouter.get("/ledger", ledgerController.getAllLedgers);
apiRouter.post("/ledger/bulk-opening-balances", ledgerController.updateBulkOpeningBalances);
apiRouter.post("/ledger/bulk-delete", ledgerController.bulkDeleteLedgers);
apiRouter.get("/ledger/:id", ledgerController.getLedgerById);
apiRouter.post("/ledger", ledgerController.createLedger);
apiRouter.put("/ledger/:id", ledgerController.updateLedger);
apiRouter.delete("/ledger/:id", ledgerController.deleteLedger);

// Account Group routes
apiRouter.get("/account-group", accountGroupController.getAllGroups);
apiRouter.post("/account-group", accountGroupController.createGroup);

// Bank Cash Book routes
apiRouter.get("/bank-cash-book/accounts", bankCashController.getAllAccounts);
apiRouter.get("/bank-cash-book/accounts/:id", bankCashController.getAccountById);
apiRouter.post("/bank-cash-book/accounts", bankCashController.createAccount);
apiRouter.put("/bank-cash-book/accounts/:id", bankCashController.updateAccount);
apiRouter.delete("/bank-cash-book/accounts/:id", bankCashController.deleteAccount);

apiRouter.get("/bank-cash-book/entries", bankCashController.getAllEntries);
apiRouter.post("/bank-cash-book/entries", bankCashController.createEntry);
apiRouter.put("/bank-cash-book/entries/:id", bankCashController.updateEntry);
apiRouter.delete("/bank-cash-book/entries/:id", bankCashController.deleteEntry);
apiRouter.post("/bank-cash-book/entries/bulk-delete", bankCashController.bulkDeleteEntries);
apiRouter.delete("/bank-cash-book/accounts/:id/entries", bankCashController.clearEntriesForAccount);


// Journal Voucher routes
apiRouter.get("/journal-voucher", journalController.getAllJournalEntries);
apiRouter.post("/journal-voucher", journalController.createJournalEntry);
apiRouter.put("/journal-voucher/:id", journalController.updateJournalEntry);
apiRouter.delete("/journal-voucher/:id", journalController.deleteJournalEntry);

// Bank statement imports routes
apiRouter.get("/bank-import/transactions", importController.getImportedTransactions);
apiRouter.post("/bank-import/transactions", importController.saveImportedTransactions);
apiRouter.post("/bank-import/parse", importController.parseStatementWithAI as any);
apiRouter.post("/bank-import/enrich", importController.enrichWithOpenRouter as any);
