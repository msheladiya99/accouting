import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Company } from "../models/Company";
import { FinancialYear } from "../models/FinancialYear";
import { Ledger } from "../models/Ledger";
import { BankCashAccount } from "../models/BankCashAccount";
import { BankCashEntry } from "../models/BankCashEntry";
import { JournalEntry } from "../models/JournalEntry";
import { AccountGroup } from "../models/AccountGroup";
import { SuperAdmin } from "../models/SuperAdmin";
import path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function computeStatus(startDate: string, endDate: string): "current" | "previous" | "future" | "closed" {
  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (today >= start && today <= end) return "current";
  if (today > end) return "previous";
  return "future";
}

function buildFY(baseYear: number, companyId = "default") {
  const label = `${baseYear}-${String(baseYear + 1).slice(-2)}`;
  const startDate = `${baseYear}-04-01`;
  const endDate = `${baseYear + 1}-03-31`;
  return {
    companyId,
    financialYear: label,
    label: `FY ${label}`,
    startDate,
    endDate,
    status: computeStatus(startDate, endDate)
  };
}

async function seed() {
  console.log("Connecting to database for seeding...");
  await connectDB();

  try {
    // 1. Clear existing data
    console.log("Clearing existing collections...");
    if (mongoose.connection.db) {
      const collections = await mongoose.connection.db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      const collectionsToDrop = ["users", "companies", "financialyears", "ledgers", "bankcashaccounts", "bankcashentries", "journalentries", "accountgroups", "superadmins"];
      for (const name of collectionsToDrop) {
        if (collectionNames.includes(name)) {
          console.log(`Dropping collection ${name} to clear legacy indexes...`);
          await mongoose.connection.db.dropCollection(name);
        }
      }
    } else {
      await User.deleteMany({});
      await Company.deleteMany({});
      await FinancialYear.deleteMany({});
      await Ledger.deleteMany({});
      await BankCashAccount.deleteMany({});
      await BankCashEntry.deleteMany({});
      await JournalEntry.deleteMany({});
      await AccountGroup.deleteMany({});
      await SuperAdmin.deleteMany({});
    }

    // 2. Seed Super Admin
    console.log("Seeding super admin...");
    const superAdminPasswordHash = await bcrypt.hash("admin123", 10);
    const superAdmin = new SuperAdmin({
      name: "System Super Admin",
      email: "superadmin@accountpro.com",
      passwordHash: superAdminPasswordHash,
      role: "SUPER_ADMIN"
    });
    await superAdmin.save();
    console.log("Seeded Super Admin user.");

    // 3. Seed Companies
    console.log("Seeding companies...");
    const companiesData = [
      { companyName: "Acme Corp Ltd.", panNumber: "AABCA1234C", subdomain: "acme", status: "active" },
      { companyName: "XYZ Technologies Pvt. Ltd.", panNumber: "BBBXT5678D", subdomain: "xyz", status: "active" },
      { companyName: "Global Traders Inc.", panNumber: "CCGTI9012E", subdomain: "global", status: "active" }
    ];

    const seededCompanies: any[] = [];
    for (const c of companiesData) {
      const company = new Company(c);
      await company.save();
      seededCompanies.push(company);
    }
    console.log(`Seeded ${seededCompanies.length} companies.`);

    const defaultCompanyId = seededCompanies[0]._id.toString();
    const xyzCompanyId = seededCompanies[1]._id.toString();
    const globalCompanyId = seededCompanies[2]._id.toString();

    // 4. Seed Users
    console.log("Seeding users scoped to companies...");
    const usersData = [
      // Acme Corp Ltd.
      { name: "Aryan Sharma", email: "admin@acmecorp.com", password: "admin123", role: "Admin", status: "Active", avatar: "AS", companyId: defaultCompanyId },
      { name: "Priya Mehta", email: "priya@acmecorp.com", password: "acc123", role: "Accountant", status: "Active", avatar: "PM", companyId: defaultCompanyId },
      { name: "Ravi Kumar", email: "ravi@acmecorp.com", password: "acc123", role: "Accountant", status: "Active", avatar: "RK", companyId: defaultCompanyId },
      { name: "Sneha Patel", email: "sneha@acmecorp.com", password: "view123", role: "Viewer", status: "Active", avatar: "SP", companyId: defaultCompanyId },
      { name: "Vikram Rao", email: "vikram@acmecorp.com", password: "view123", role: "Viewer", status: "Inactive", avatar: "VR", companyId: defaultCompanyId },
      
      // XYZ Technologies
      { name: "XYZ Admin", email: "admin@xyzcorp.com", password: "admin123", role: "Admin", status: "Active", avatar: "XY", companyId: xyzCompanyId },
      
      // Global Traders
      { name: "Global Admin", email: "admin@global.com", password: "admin123", role: "Admin", status: "Active", avatar: "GL", companyId: globalCompanyId }
    ];

    const seededUsers: any[] = [];
    for (const u of usersData) {
      const hashedPassword = await bcrypt.hash(u.password, 10);
      const user = new User({ ...u, password: hashedPassword });
      await user.save();
      seededUsers.push(user);
    }
    console.log(`Seeded ${seededUsers.length} users.`);

    // Seed default account groups for all seeded companies
    console.log("Seeding default account groups for all companies...");
    const defaultGroupsSeeds = [
      { groupName: "Direct Expenses", superGroup: "Expenses (Direct)" },
      { groupName: "Income (Trading)", superGroup: "Income (Trading)" },
      { groupName: "Purchase Account", superGroup: "Purchase Account" },
      { groupName: "Sales Account", superGroup: "Sales Account" },
      { groupName: "Expense Account", superGroup: "Expense Account" },
      { groupName: "Financial Expenses", superGroup: "Expense Account" },
      { groupName: "Income", superGroup: "Income" },
      { groupName: "Income (Other Then Sales)", superGroup: "Income (Other Then Sales)" },
      { groupName: "Indirect Expenses", superGroup: "Expense Account" },
      { groupName: "Partner Interest", superGroup: "Partner Interest" },
      { groupName: "Partner Remuneration", superGroup: "Partner Remuneration" },
      { groupName: "Advances From Customers", superGroup: "Current Liabilities" },
      { groupName: "Bank Accounts (Banks)", superGroup: "Current Assets" },
      { groupName: "Bank OCC a/c", superGroup: "Loans (Liability)" },
      { groupName: "Capital Account", superGroup: "Capital Account" },
      { groupName: "Cash Ledger A/C.", superGroup: "Cash Ledger A/C." },
      { groupName: "Cash-in-hand", superGroup: "Current Assets" },
      { groupName: "Current Capital Account", superGroup: "Capital Account" },
      { groupName: "Current Liabilities", superGroup: "Current Liabilities" },
      { groupName: "Deposits (Asset)", superGroup: "Current Assets" },
      { groupName: "Duties & Taxes", superGroup: "Current Liabilities" },
      { groupName: "Fixed Assets", superGroup: "Fixed Assets" },
      { groupName: "Investments", superGroup: "Investments" },
      { groupName: "Loans & Advances (Asset)", superGroup: "Current Assets" },
      { groupName: "Loans (Liability)", superGroup: "Loans (Liability)" },
      { groupName: "Misc. Expenses (Asset)", superGroup: "Misc. Expenses (Asset)" },
      { groupName: "Profit & Loss A/c", superGroup: "Profit & Loss A/c" },
      { groupName: "Provisions", superGroup: "Current Liabilities" },
      { groupName: "Reserves & Surplus", superGroup: "Capital Account" },
      { groupName: "Salary Expenses Payable", superGroup: "Current Liabilities" },
      { groupName: "Secured Loans", superGroup: "Loans (Liability)" },
      { groupName: "Stock-in-hand", superGroup: "Stock-in-hand" },
      { groupName: "Sundry Creditors", superGroup: "Current Liabilities" },
      { groupName: "Sundry Creditors - Material", superGroup: "Current Liabilities" },
      { groupName: "Sundry Creditors - Services", superGroup: "Current Liabilities" },
      { groupName: "Sundry Debtors", superGroup: "Current Assets" },
      { groupName: "Suspense Account", superGroup: "Suspense Account" },
      { groupName: "Unsecured Loans", superGroup: "Loans (Liability)" },
      { groupName: "Assets", superGroup: "Current Assets" },
      { groupName: "Liabilities", superGroup: "Current Liabilities" },
      { groupName: "Capital", superGroup: "Capital Account" },
      { groupName: "Income", superGroup: "Income" },
      { groupName: "Expense", superGroup: "Expense Account" },
      { groupName: "Bank", superGroup: "Current Assets" },
      { groupName: "Cash", superGroup: "Current Assets" },
      { groupName: "Purchases", superGroup: "Purchase Account" },
      { groupName: "Sales", superGroup: "Sales Account" }
    ];

    for (const company of seededCompanies) {
      const groups = defaultGroupsSeeds.map((g) => ({
        groupName: g.groupName,
        superGroup: g.superGroup,
        companyId: company._id
      }));
      await AccountGroup.insertMany(groups);
    }

    // 4. Seed Financial Years
    console.log("Seeding financial years...");
    const currentAprilYear =
      new Date().getMonth() >= 3
        ? new Date().getFullYear()
        : new Date().getFullYear() - 1;

    const fysData = [
      buildFY(currentAprilYear - 2, defaultCompanyId),
      buildFY(currentAprilYear - 1, defaultCompanyId),
      buildFY(currentAprilYear, defaultCompanyId),
      buildFY(currentAprilYear + 1, defaultCompanyId),
      buildFY(currentAprilYear + 2, defaultCompanyId)
    ];

    const seededFYs: any[] = [];
    for (const fy of fysData) {
      const financialYear = new FinancialYear(fy);
      await financialYear.save();
      seededFYs.push(financialYear);
    }
    console.log(`Seeded ${seededFYs.length} financial years.`);

    // 5. Seed Ledgers
    console.log("Seeding ledgers...");
    const ledgersData = [
      { ledgerName: "Cash in Hand", groupName: "Cash", openingDr: 75000, openingCr: 0 },
      { ledgerName: "Petty Cash", groupName: "Cash", openingDr: 15000, openingCr: 0 },
      { ledgerName: "HDFC Current Account", groupName: "Bank", openingDr: 2850000, openingCr: 0 },
      { ledgerName: "SBI Savings Account", groupName: "Bank", openingDr: 640000, openingCr: 0 },
      { ledgerName: "Accounts Receivable", groupName: "Assets", openingDr: 480000, openingCr: 0 },
      { ledgerName: "Inventory / Stock", groupName: "Assets", openingDr: 950000, openingCr: 0 },
      { ledgerName: "Prepaid Expenses", groupName: "Assets", openingDr: 85000, openingCr: 0 },
      { ledgerName: "Fixed Assets", groupName: "Assets", openingDr: 3830000, openingCr: 0 },
      { ledgerName: "Accounts Payable", groupName: "Liabilities", openingDr: 0, openingCr: 620000 },
      { ledgerName: "Short-term Bank Loan", groupName: "Liabilities", openingDr: 0, openingCr: 500000 },
      { ledgerName: "GST / Tax Payable", groupName: "Liabilities", openingDr: 0, openingCr: 125000 },
      { ledgerName: "Share Capital", groupName: "Capital", openingDr: 0, openingCr: 5000000 },
      { ledgerName: "Retained Earnings", groupName: "Capital", openingDr: 0, openingCr: 2680000 },
      { ledgerName: "Sales Revenue", groupName: "Sales", openingDr: 0, openingCr: 0 },
      { ledgerName: "Sales Returns", groupName: "Sales", openingDr: 0, openingCr: 0 },
      { ledgerName: "Raw Material Purchases", groupName: "Purchases", openingDr: 0, openingCr: 0 },
      { ledgerName: "Purchase Returns", groupName: "Purchases", openingDr: 0, openingCr: 0 },
      { ledgerName: "Interest Income", groupName: "Income", openingDr: 0, openingCr: 0 },
      { ledgerName: "Consulting Revenue", groupName: "Income", openingDr: 0, openingCr: 0 },
      { ledgerName: "Salary Expense", groupName: "Expense", openingDr: 0, openingCr: 0 },
      { ledgerName: "Rent Expense", groupName: "Expense", openingDr: 0, openingCr: 0 },
      { ledgerName: "Marketing Expense", groupName: "Expense", openingDr: 0, openingCr: 0 },
      { ledgerName: "Utilities Expense", groupName: "Expense", openingDr: 0, openingCr: 0 },
      { ledgerName: "ABC Corp Ltd.", groupName: "Sundry Debtors", openingDr: 0, openingCr: 0 },
      { ledgerName: "XYZ Technologies Pvt Ltd", groupName: "Sundry Debtors", openingDr: 0, openingCr: 0 },
      { ledgerName: "Prestige Holdings", groupName: "Sundry Debtors", openingDr: 0, openingCr: 0 },
      { ledgerName: "Sigma Supplies Co.", groupName: "Sundry Creditors", openingDr: 0, openingCr: 0 },
      { ledgerName: "Metro Raw Materials", groupName: "Sundry Creditors", openingDr: 0, openingCr: 0 }
    ].map((l) => ({ ...l, companyId: defaultCompanyId }));

    const seededLedgers = await Ledger.insertMany(ledgersData);
    console.log(`Seeded ${seededLedgers.length} ledgers.`);

    // 6. Seed Bank/Cash Accounts
    console.log("Seeding Bank/Cash Accounts...");
    const accountsData = [
      { name: "HDFC Current Account", group: "Bank", openingBalance: 2850000 },
      { name: "SBI Savings Account", group: "Bank", openingBalance: 640000 },
      { name: "Cash in Hand", group: "Cash", openingBalance: 75000 },
      { name: "Petty Cash", group: "Cash", openingBalance: 15000 }
    ].map((a) => ({ ...a, companyId: defaultCompanyId }));

    const seededAccounts: any[] = [];
    for (const a of accountsData) {
      const acc = new BankCashAccount(a);
      await acc.save();
      seededAccounts.push(acc);
    }
    console.log(`Seeded ${seededAccounts.length} accounts.`);

    const getAccountId = (name: string) => {
      const acc = seededAccounts.find((a) => a.name === name);
      return acc ? acc._id.toString() : "";
    };

    // 7. Seed Bank/Cash Entries
    console.log("Seeding Bank/Cash Entries...");
    const entriesData = [
      // HDFC Current Account
      { accountId: getAccountId("HDFC Current Account"), date: "2026-05-03", particulars: "Client Payment - ABC Corp Invoice #1001", withdrawal: 0, deposit: 185000, contraAccountName: "ABC Corp Ltd.", contraAccountGroup: "Sundry Debtors" },
      { accountId: getAccountId("HDFC Current Account"), date: "2026-05-05", particulars: "Office Rent - May 2026", withdrawal: 120000, deposit: 0, contraAccountName: "Rent Expense", contraAccountGroup: "Expense" },
      { accountId: getAccountId("HDFC Current Account"), date: "2026-05-08", particulars: "Supplier Invoice - Sigma Supplies Co.", withdrawal: 245000, deposit: 0, contraAccountName: "Sigma Supplies Co.", contraAccountGroup: "Sundry Creditors" },
      { accountId: getAccountId("HDFC Current Account"), date: "2026-05-10", particulars: "Salary Transfer - April Arrears", withdrawal: 850000, deposit: 0, contraAccountName: "Salary Expense", contraAccountGroup: "Expense" },
      { accountId: getAccountId("HDFC Current Account"), date: "2026-05-12", particulars: "Sales Income - Online Orders Batch", withdrawal: 0, deposit: 320000, contraAccountName: "Sales Revenue", contraAccountGroup: "Sales" },
      { accountId: getAccountId("HDFC Current Account"), date: "2026-05-15", particulars: "GST Payment Q4 FY 2025-26", withdrawal: 95000, deposit: 0, contraAccountName: "GST / Tax Payable", contraAccountGroup: "Liabilities" },
      { accountId: getAccountId("HDFC Current Account"), date: "2026-05-18", particulars: "Interest FD Proceeds", withdrawal: 0, deposit: 500000, contraAccountName: "Interest Income", contraAccountGroup: "Income" },
      { accountId: getAccountId("HDFC Current Account"), date: "2026-05-20", particulars: "Equipment Purchase - Laptops x5", withdrawal: 185000, deposit: 0, contraAccountName: "Fixed Assets", contraAccountGroup: "Assets" },
      { accountId: getAccountId("HDFC Current Account"), date: "2026-05-22", particulars: "Consulting Revenue - May 2026", withdrawal: 0, deposit: 450000, contraAccountName: "Consulting Revenue", contraAccountGroup: "Income" },
      { accountId: getAccountId("HDFC Current Account"), date: "2026-05-25", particulars: "Marketing Campaign Budget Q1", withdrawal: 80000, deposit: 0, contraAccountName: "Marketing Expense", contraAccountGroup: "Expense" },
      { accountId: getAccountId("HDFC Current Account"), date: "2026-05-28", particulars: "Bank Service Charges - May 2026", withdrawal: 1200, deposit: 0, contraAccountName: "Utilities Expense", contraAccountGroup: "Expense" },
      // SBI Savings Account
      { accountId: getAccountId("SBI Savings Account"), date: "2026-05-02", particulars: "Online Sales Collection", withdrawal: 0, deposit: 95000, contraAccountName: "Sales Revenue", contraAccountGroup: "Sales" },
      { accountId: getAccountId("SBI Savings Account"), date: "2026-05-06", particulars: "XYZ Technologies Payment", withdrawal: 0, deposit: 92500, contraAccountName: "XYZ Technologies Pvt Ltd", contraAccountGroup: "Sundry Debtors" },
      { accountId: getAccountId("SBI Savings Account"), date: "2026-05-12", particulars: "Loan Repayment - SBI Term Loan", withdrawal: 120000, deposit: 0, contraAccountName: "Short-term Bank Loan", contraAccountGroup: "Liabilities" },
      { accountId: getAccountId("SBI Savings Account"), date: "2026-05-18", particulars: "Metro Raw Materials Invoice", withdrawal: 68000, deposit: 0, contraAccountName: "Metro Raw Materials", contraAccountGroup: "Sundry Creditors" },
      { accountId: getAccountId("SBI Savings Account"), date: "2026-05-24", particulars: "Prestige Holdings Receipt", withdrawal: 0, deposit: 340000, contraAccountName: "Prestige Holdings", contraAccountGroup: "Sundry Debtors" },
      // Cash in Hand
      { accountId: getAccountId("Cash in Hand"), date: "2026-05-01", particulars: "Cash Sales - Walk-in Customers", withdrawal: 0, deposit: 12500, contraAccountName: "Sales Revenue", contraAccountGroup: "Sales" },
      { accountId: getAccountId("Cash in Hand"), date: "2026-05-04", particulars: "Office Supplies Purchase", withdrawal: 3200, deposit: 0, contraAccountName: "Utilities Expense", contraAccountGroup: "Expense" },
      { accountId: getAccountId("Cash in Hand"), date: "2026-05-08", particulars: "Cash Sales - Weekend", withdrawal: 0, deposit: 18000, contraAccountName: "Sales Revenue", contraAccountGroup: "Sales" },
      { accountId: getAccountId("Cash in Hand"), date: "2026-05-14", particulars: "Petty Expenses - Staff Tea & Travel", withdrawal: 4500, deposit: 0, contraAccountName: "Utilities Expense", contraAccountGroup: "Expense" },
      { accountId: getAccountId("Cash in Hand"), date: "2026-05-20", particulars: "Cash Deposited to HDFC Bank", withdrawal: 30000, deposit: 0, contraAccountName: "HDFC Current Account", contraAccountGroup: "Bank" },
      // Petty Cash
      { accountId: getAccountId("Petty Cash"), date: "2026-05-02", particulars: "Petty Cash Replenishment", withdrawal: 0, deposit: 10000, contraAccountName: "HDFC Current Account", contraAccountGroup: "Bank" },
      { accountId: getAccountId("Petty Cash"), date: "2026-05-05", particulars: "Courier & Postage", withdrawal: 850, deposit: 0, contraAccountName: "Utilities Expense", contraAccountGroup: "Expense" },
      { accountId: getAccountId("Petty Cash"), date: "2026-05-10", particulars: "Printing & Stationery", withdrawal: 1200, deposit: 0, contraAccountName: "Utilities Expense", contraAccountGroup: "Expense" },
      { accountId: getAccountId("Petty Cash"), date: "2026-05-16", particulars: "Staff Refreshments", withdrawal: 680, deposit: 0, contraAccountName: "Utilities Expense", contraAccountGroup: "Expense" }
    ].map((e) => ({ ...e, companyId: defaultCompanyId }));

    const seededEntries = await BankCashEntry.insertMany(entriesData);
    console.log(`Seeded ${seededEntries.length} bank/cash book entries.`);

    // 8. Seed Journal Entries
    console.log("Seeding Journal Entries...");
    const journalsData = [
      { voucherNo: "JV-2026-0001", date: "2026-05-28", narration: "May salary provision entry", debitAccount: "Salary Expense", debitGroup: "Expense", debitAmount: 850000, creditAccount: "HDFC Current Account", creditGroup: "Bank", creditAmount: 850000, status: "Posted" },
      { voucherNo: "JV-2026-0002", date: "2026-05-25", narration: "Depreciation charge Q4 FY2025-26", debitAccount: "Utilities Expense", debitGroup: "Expense", debitAmount: 45000, creditAccount: "Fixed Assets", creditGroup: "Assets", creditAmount: 45000, status: "Posted" },
      { voucherNo: "JV-2026-0003", date: "2026-05-22", narration: "Adjustment for prepaid insurance", debitAccount: "Prepaid Expenses", debitGroup: "Assets", debitAmount: 12000, creditAccount: "Utilities Expense", creditGroup: "Expense", creditAmount: 12000, status: "Draft" },
      { voucherNo: "JV-2026-0004", date: "2026-05-20", narration: "Inter-bank fund transfer HDFC to SBI", debitAccount: "SBI Savings Account", debitGroup: "Bank", debitAmount: 500000, creditAccount: "HDFC Current Account", creditGroup: "Bank", creditAmount: 500000, status: "Posted" },
      { voucherNo: "JV-2026-0005", date: "2026-05-18", narration: "GST input credit adjustment Q4", debitAccount: "GST / Tax Payable", debitGroup: "Liabilities", debitAmount: 18500, creditAccount: "Cash in Hand", creditGroup: "Cash", creditAmount: 18500, status: "Posted" },
      { voucherNo: "JV-2026-0006", date: "2026-05-15", narration: "Purchase of raw materials on credit", debitAccount: "Raw Material Purchases", debitGroup: "Purchases", debitAmount: 245000, creditAccount: "Sigma Supplies Co.", creditGroup: "Sundry Creditors", creditAmount: 245000, status: "Posted" },
      { voucherNo: "JV-2026-0007", date: "2026-05-12", narration: "Sales invoice raised - ABC Corp Ltd.", debitAccount: "ABC Corp Ltd.", debitGroup: "Sundry Debtors", debitAmount: 185000, creditAccount: "Sales Revenue", creditGroup: "Sales", creditAmount: 185000, status: "Posted" },
      { voucherNo: "JV-2026-0008", date: "2026-05-10", narration: "Office rent payment May 2026", debitAccount: "Rent Expense", debitGroup: "Expense", debitAmount: 120000, creditAccount: "HDFC Current Account", creditGroup: "Bank", creditAmount: 120000, status: "Posted" }
    ].map((j) => ({ ...j, companyId: defaultCompanyId }));

    const seededJournals = await JournalEntry.insertMany(journalsData);
    console.log(`Seeded ${seededJournals.length} journal entries.`);

    console.log("Database seeded successfully!");
  } catch (error) {
    console.error("Database seeding failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
  }
}

seed();
