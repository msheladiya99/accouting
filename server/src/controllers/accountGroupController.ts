import { Response } from "express";
import { AccountGroup } from "../models/AccountGroup";
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
  { groupName: "CASH LEDGER A/C.", superGroup: "CASH LEDGER A/C." },
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

export async function getAllGroups(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    let groups = await AccountGroup.find({ companyId: req.companyId }).sort({ groupName: 1 });
    
    // Automatically seed groups if none exist for this company
    if (groups.length === 0) {
      const defaultGroups = DEFAULT_GROUPS_SEEDS.map((g) => ({
        groupName: g.groupName,
        superGroup: g.superGroup,
        companyId: req.companyId
      }));
      await AccountGroup.insertMany(defaultGroups);
      groups = await AccountGroup.find({ companyId: req.companyId }).sort({ groupName: 1 });
    }

    res.json(groups);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve account groups" });
  }
}

export async function createGroup(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { groupName, superGroup } = req.body;
  try {
    if (!groupName || !superGroup) {
      res.status(400).json({ message: "Group name and super group are required" });
      return;
    }

    const trimmedName = groupName.trim().toUpperCase();
    const exists = await AccountGroup.findOne({
      groupName: { $regex: new RegExp(`^${trimmedName}$`, "i") },
      companyId: req.companyId
    });

    if (exists) {
      res.status(400).json({ message: "An account group with this name already exists in this company" });
      return;
    }

    const newGroup = new AccountGroup({
      groupName: trimmedName,
      superGroup: superGroup.trim(),
      companyId: req.companyId
    });

    await newGroup.save();
    res.status(201).json(newGroup);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create account group" });
  }
}
