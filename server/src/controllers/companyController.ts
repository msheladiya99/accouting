import { Response } from "express";
import { Company } from "../models/Company";
import { Ledger } from "../models/Ledger";
import { AccountGroup } from "../models/AccountGroup";
import { BankCashAccount } from "../models/BankCashAccount";
import { AuthenticatedRequest } from "../middleware/auth";

const DEFAULT_GROUPS_SEEDS = [
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

export async function getAllCompanies(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const companies = await Company.find({}).sort({ createdAt: -1 });
    res.json(companies);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve companies" });
  }
}

export async function getCompanyById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const company = await Company.findById(id);
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }
    res.json(company);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve company" });
  }
}

export async function createCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyName, panNumber } = req.body;
  try {
    if (!companyName || !panNumber) {
      res.status(400).json({ message: "Company name and PAN number are required" });
      return;
    }

    const company = new Company({
      companyName,
      panNumber: panNumber.toUpperCase()
    });

    await company.save();

    // Automatically create default account groups
    const defaultGroups = DEFAULT_GROUPS_SEEDS.map((g) => ({
      groupName: g.groupName,
      superGroup: g.superGroup,
      companyId: company._id
    }));
    await AccountGroup.insertMany(defaultGroups);

    // Automatically create default ledgers for all 46 groups
    const defaultLedgers = DEFAULT_GROUPS_SEEDS.map((g) => ({
      ledgerName: g.groupName,
      groupName: g.groupName,
      companyId: company._id
    }));
    await Ledger.insertMany(defaultLedgers);

    // Automatically create default Cash account
    const defaultCash = new BankCashAccount({
      name: "Cash Account",
      group: "Cash",
      openingBalance: 0,
      companyId: company._id
    });
    await defaultCash.save();

    res.status(201).json(company);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create company" });
  }
}

export async function updateCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { companyName, panNumber } = req.body;
  try {
    const company = await Company.findById(id);
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    if (companyName) company.companyName = companyName;
    if (panNumber) company.panNumber = panNumber.toUpperCase();

    await company.save();
    res.json(company);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update company" });
  }
}

export async function deleteCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const company = await Company.findById(id);
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    await Company.findByIdAndDelete(id);
    res.json({ message: "Company deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete company" });
  }
}

export async function getCurrentCompany(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const companyId = (req as any).companyId || req.headers["x-company-id"];
    if (!companyId) {
      res.status(400).json({ message: "No company context found" });
      return;
    }
    const company = await Company.findById(companyId);
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }
    res.json(company);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve current company details" });
  }
}
