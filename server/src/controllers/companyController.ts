import { Response } from "express";
import { Company } from "../models/Company";
import { Ledger } from "../models/Ledger";
import { AccountGroup } from "../models/AccountGroup";
import { BankCashAccount } from "../models/BankCashAccount";
import { AuthenticatedRequest } from "../middleware/auth";

const DEFAULT_GROUPS_SEEDS = [
  // Trading
  { groupName: "DIRECT EXPENSES", superGroup: "EXPENSES (DIRECT)" },
  { groupName: "INCOME (TRADING)", superGroup: "INCOME (TRADING)" },
  { groupName: "PURCHASE ACCOUNT", superGroup: "PURCHASE ACCOUNT" },
  { groupName: "SALES ACCOUNT", superGroup: "SALES ACCOUNT" },

  // Profit & Loss
  { groupName: "EXPENSE ACCOUNT", superGroup: "EXPENSE ACCOUNT" },
  { groupName: "FINANCIAL EXPENSES", superGroup: "EXPENSE ACCOUNT" },
  { groupName: "INCOME", superGroup: "INCOME" },
  { groupName: "INCOME (OTHER THEN SALES)", superGroup: "INCOME (OTHER THEN SALES)" },
  { groupName: "INDIRECT EXPENSES", superGroup: "EXPENSE ACCOUNT" },
  { groupName: "PARTNER INTEREST", superGroup: "PARTNER INTEREST" },
  { groupName: "PARTNER REMUNERATION", superGroup: "PARTNER REMUNERATION" },

  // Balance Sheet
  { groupName: "ADVANCES FROM CUSTOMERS", superGroup: "CURRENT LIABILITIES" },
  { groupName: "BANK ACCOUNTS (BANKS)", superGroup: "CURRENT ASSETS" },
  { groupName: "BANK OCC A/C", superGroup: "LOANS (LIABILITY)" },
  { groupName: "CAPITAL ACCOUNT", superGroup: "CAPITAL ACCOUNT" },
  { groupName: "CASH LEDGER A/C.", superGroup: "CASH LEDGER A/C." },
  { groupName: "CASH-IN-HAND", superGroup: "CURRENT ASSETS" },
  { groupName: "CURRENT CAPITAL ACCOUNT", superGroup: "CAPITAL ACCOUNT" },
  { groupName: "CURRENT LIABILITIES", superGroup: "CURRENT LIABILITIES" },
  { groupName: "DEPOSITS (ASSET)", superGroup: "CURRENT ASSETS" },
  { groupName: "DUTIES & TAXES", superGroup: "CURRENT LIABILITIES" },
  { groupName: "FIXED ASSETS", superGroup: "FIXED ASSETS" },
  { groupName: "INVESTMENTS", superGroup: "INVESTMENTS" },
  { groupName: "LOANS & ADVANCES (ASSET)", superGroup: "CURRENT ASSETS" },
  { groupName: "LOANS (LIABILITY)", superGroup: "LOANS (LIABILITY)" },
  { groupName: "MISC. EXPENSES (ASSET)", superGroup: "MISC. EXPENSES (ASSET)" },
  { groupName: "PROFIT & LOSS A/C", superGroup: "PROFIT & LOSS A/C" },
  { groupName: "PROVISIONS", superGroup: "CURRENT LIABILITIES" },
  { groupName: "RESERVES & SURPLUS", superGroup: "CAPITAL ACCOUNT" },
  { groupName: "SALARY EXPENSES PAYABLE", superGroup: "CURRENT LIABILITIES" },
  { groupName: "SECURED LOANS", superGroup: "LOANS (LIABILITY)" },
  { groupName: "STOCK-IN-HAND", superGroup: "STOCK-IN-HAND" },
  { groupName: "SUNDRY CREDITORS", superGroup: "CURRENT LIABILITIES" },
  { groupName: "SUNDRY CREDITORS - MATERIAL", superGroup: "CURRENT LIABILITIES" },
  { groupName: "SUNDRY CREDITORS - SERVICES", superGroup: "CURRENT LIABILITIES" },
  { groupName: "SUNDRY DEBTORS", superGroup: "CURRENT ASSETS" },
  { groupName: "SUSPENSE ACCOUNT", superGroup: "SUSPENSE ACCOUNT" },
  { groupName: "UNSECURED LOANS", superGroup: "LOANS (LIABILITY)" }
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
