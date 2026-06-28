import { Response } from "express";
import { Company } from "../models/Company";
import { Ledger } from "../models/Ledger";
import { AccountGroup } from "../models/AccountGroup";
import { BankCashAccount } from "../models/BankCashAccount";
import { AuthenticatedRequest } from "../middleware/auth";

const DEFAULT_GROUPS_SEEDS = [
  // Trading
  { groupName: "DIRECT EXPENSES", superGroup: "Expenses (Direct)" },
  { groupName: "INCOME (TRADING)", superGroup: "Income (Trading)" },
  { groupName: "PURCHASE ACCOUNT", superGroup: "Purchase Account" },
  { groupName: "SALES ACCOUNT", superGroup: "Sales Account" },

  // Profit & Loss
  { groupName: "EXPENSE ACCOUNT", superGroup: "Expense Account" },
  { groupName: "FINANCIAL EXPENSES", superGroup: "Expense Account" },
  { groupName: "INCOME", superGroup: "Income" },
  { groupName: "INCOME (OTHER THEN SALES)", superGroup: "Income (Other Then Sales)" },
  { groupName: "INDIRECT EXPENSES", superGroup: "Expense Account" },
  { groupName: "PARTNER INTEREST", superGroup: "Partner Interest" },
  { groupName: "PARTNER REMUNERATION", superGroup: "Partner Remuneration" },

  // Balance Sheet
  { groupName: "ADVANCES FROM CUSTOMERS", superGroup: "Current Liabilities" },
  { groupName: "BANK ACCOUNTS (BANKS)", superGroup: "Current Assets" },
  { groupName: "BANK OCC A/C", superGroup: "Loans (Liability)" },
  { groupName: "CAPITAL ACCOUNT", superGroup: "Capital Account" },
  { groupName: "CASH LEDGER A/C.", superGroup: "Cash Ledger A/C." },
  { groupName: "CASH-IN-HAND", superGroup: "Current Assets" },
  { groupName: "CURRENT CAPITAL ACCOUNT", superGroup: "Capital Account" },
  { groupName: "CURRENT LIABILITIES", superGroup: "Current Liabilities" },
  { groupName: "DEPOSITS (ASSET)", superGroup: "Current Assets" },
  { groupName: "DUTIES & TAXES", superGroup: "Current Liabilities" },
  { groupName: "FIXED ASSETS", superGroup: "Fixed Assets" },
  { groupName: "INVESTMENTS", superGroup: "Investments" },
  { groupName: "LOANS & ADVANCES (ASSET)", superGroup: "Current Assets" },
  { groupName: "LOANS (LIABILITY)", superGroup: "Loans (Liability)" },
  { groupName: "MISC. EXPENSES (ASSET)", superGroup: "Misc. Expenses (Asset)" },
  { groupName: "PROFIT & LOSS A/C", superGroup: "Profit & Loss A/c" },
  { groupName: "PROVISIONS", superGroup: "Current Liabilities" },
  { groupName: "RESERVES & SURPLUS", superGroup: "Capital Account" },
  { groupName: "SALARY EXPENSES PAYABLE", superGroup: "Current Liabilities" },
  { groupName: "SECURED LOANS", superGroup: "Loans (Liability)" },
  { groupName: "STOCK-IN-HAND", superGroup: "Stock-in-hand" },
  { groupName: "SUNDRY CREDITORS", superGroup: "Current Liabilities" },
  { groupName: "SUNDRY CREDITORS - MATERIAL", superGroup: "Current Liabilities" },
  { groupName: "SUNDRY CREDITORS - SERVICES", superGroup: "Current Liabilities" },
  { groupName: "SUNDRY DEBTORS", superGroup: "Current Assets" },
  { groupName: "SUSPENSE ACCOUNT", superGroup: "Suspense Account" },
  { groupName: "UNSECURED LOANS", superGroup: "Loans (Liability)" }
];

export async function getAllCompanies(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const companies = await Company.find({ parentCompanyId: req.companyId }).sort({ createdAt: -1 });
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
      panNumber: panNumber.toUpperCase(),
      parentCompanyId: req.companyId
    });

    await company.save();

    // Automatically create default account groups
    const defaultGroups = DEFAULT_GROUPS_SEEDS.map((g) => ({
      groupName: g.groupName,
      superGroup: g.superGroup,
      companyId: company._id
    }));
    await AccountGroup.insertMany(defaultGroups);

    // Automatically create default ledgers (excluding categories/super-categories from having active ledger accounts)
    const excludedLedgerGroups = [
      "EXPENSE ACCOUNT",
      "INCOME",
      "CURRENT LIABILITIES",
      "CURRENT CAPITAL ACCOUNT",
    ];
    const defaultLedgers = DEFAULT_GROUPS_SEEDS
      .filter((g) => !excludedLedgerGroups.includes(g.groupName))
      .map((g) => ({
        ledgerName: g.groupName,
        groupName: g.groupName,
        companyId: company._id
      }));
    await Ledger.insertMany(defaultLedgers);

    // Automatically create default Cash account
    const defaultCash = new BankCashAccount({
      name: "CASH ACCOUNT",
      group: "CASH-IN-HAND",
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
