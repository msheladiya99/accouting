import { Response } from "express";
import { AccountGroup } from "../models/AccountGroup";
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

    const trimmedName = groupName.trim();
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
      superGroup,
      companyId: req.companyId
    });

    await newGroup.save();
    res.status(201).json(newGroup);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create account group" });
  }
}
