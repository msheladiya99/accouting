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
  { groupName: "SUB CAPITAL", superGroup: "Capital Account" },
  { groupName: "SALARY EXPENSES PAYABLE", superGroup: "Current Liabilities" },
  { groupName: "SECURED LOANS", superGroup: "Loans (Liability)" },
  { groupName: "STOCK-IN-HAND", superGroup: "Stock-in-hand" },
  { groupName: "OPENING STOCK", superGroup: "Stock-in-hand" },
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

    // ── Self-healing: Check for any group names used in Ledgers that are missing from AccountGroup ──
    const { Ledger } = await import("../models/Ledger");
    const uniqueLedgerGroups = await Ledger.distinct("groupName", { companyId: req.companyId });
    const existingGroupNamesLower = new Set(groups.map((g) => g.groupName.trim().toLowerCase()));

    const missingGroupsToInsert: any[] = [];
    for (const gName of uniqueLedgerGroups) {
      if (!gName) continue;
      const gNameTrimmed = gName.trim();
      if (!existingGroupNamesLower.has(gNameTrimmed.toLowerCase())) {
        // Find if this group was a default group to reuse its superGroup, else fallback
        const seededGroup = DEFAULT_GROUPS_SEEDS.find(
          (seed) => seed.groupName.toLowerCase() === gNameTrimmed.toLowerCase()
        );
        const superGroup = seededGroup ? seededGroup.superGroup : "Capital Account"; // default fallback
        
        missingGroupsToInsert.push({
          groupName: gNameTrimmed.toUpperCase(),
          superGroup: superGroup,
          companyId: req.companyId
        });
      }
    }

    if (missingGroupsToInsert.length > 0) {
      await AccountGroup.insertMany(missingGroupsToInsert);
      // Reload groups list to include newly inserted ones
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

export async function mergeGroups(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { sourceIds, targetId } = req.body;
  try {
    if (!Array.isArray(sourceIds) || sourceIds.length === 0 || !targetId) {
      res.status(400).json({ message: "Provide sourceIds[] and targetId" });
      return;
    }

    // Load target group
    const targetGroup = await AccountGroup.findOne({ _id: targetId, companyId: req.companyId });
    if (!targetGroup) {
      res.status(404).json({ message: "Target group not found" });
      return;
    }
    const targetName = targetGroup.groupName;

    // Load source groups
    const sourceGroups = await AccountGroup.find({ _id: { $in: sourceIds }, companyId: req.companyId });
    if (sourceGroups.length === 0) {
      res.status(404).json({ message: "No source groups found" });
      return;
    }
    const sourceNames = sourceGroups.map((g) => g.groupName);

    const { Ledger } = await import("../models/Ledger");
    const { JournalEntry } = await import("../models/JournalEntry");
    const { BankCashEntry } = await import("../models/BankCashEntry");
    const { ImportedTransaction } = await import("../models/ImportedTransaction");

    const { Types: MongoTypes } = require("mongoose");
    let companyIdFilter: any;
    try {
      companyIdFilter = { $in: [req.companyId, new MongoTypes.ObjectId(req.companyId as string)] };
    } catch {
      companyIdFilter = req.companyId;
    }

    // 1. Update Ledgers belonging to the source groups
    await Ledger.updateMany(
      { companyId: req.companyId, groupName: { $in: sourceNames } },
      { $set: { groupName: targetName as any } }
    );

    // 2. Update JournalEntry debitGroup and creditGroup
    await JournalEntry.updateMany(
      { companyId: companyIdFilter, debitGroup: { $in: sourceNames } },
      { $set: { debitGroup: targetName } }
    );
    await JournalEntry.updateMany(
      { companyId: companyIdFilter, creditGroup: { $in: sourceNames } },
      { $set: { creditGroup: targetName } }
    );

    // 3. Update JournalEntry items array
    for (const srcName of sourceNames) {
      await JournalEntry.updateMany(
        { companyId: companyIdFilter, "items.groupName": srcName },
        {
          $set: {
            "items.$[elem].groupName": targetName
          }
        },
        { arrayFilters: [{ "elem.groupName": srcName }] } as any
      );
    }

    // 4. Update BankCashEntry contraAccountGroup
    for (const srcName of sourceNames) {
      const escaped = srcName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      await BankCashEntry.updateMany(
        { companyId: companyIdFilter, contraAccountGroup: { $regex: new RegExp(`^${escaped}$`, "i") } },
        { $set: { contraAccountGroup: targetName } }
      );
    }

    // 5. Update ImportedTransaction accountGroup
    try {
      for (const srcName of sourceNames) {
        await ImportedTransaction.updateMany(
          { companyId: companyIdFilter, accountGroup: srcName },
          { $set: { accountGroup: targetName } }
        );
      }
    } catch {
      // ignore safely
    }

    // 6. Delete source groups
    await AccountGroup.deleteMany({ _id: { $in: sourceIds }, companyId: req.companyId });

    res.json({
      message: `${sourceGroups.length} group(s) merged into "${targetName}" successfully`,
      targetGroup
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to merge groups" });
  }
}

export async function updateGroup(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { groupName, superGroup } = req.body;
  try {
    const group = await AccountGroup.findOne({ _id: id, companyId: req.companyId });
    if (!group) {
      res.status(404).json({ message: "Account group not found" });
      return;
    }

    const oldName = group.groupName;
    const newName = groupName ? groupName.trim().toUpperCase() : oldName;
    const newSuper = superGroup ? superGroup.trim() : group.superGroup;

    if (newName !== oldName) {
      const exists = await AccountGroup.findOne({
        _id: { $ne: id },
        groupName: { $regex: new RegExp(`^${newName}$`, "i") },
        companyId: req.companyId
      });
      if (exists) {
        res.status(400).json({ message: "An account group with this name already exists in this company" });
        return;
      }

      // Update references
      const { Ledger } = await import("../models/Ledger");
      const { JournalEntry } = await import("../models/JournalEntry");
      const { BankCashEntry } = await import("../models/BankCashEntry");
      const { ImportedTransaction } = await import("../models/ImportedTransaction");

      const { Types: MongoTypes } = require("mongoose");
      let companyIdFilter: any;
      try {
        companyIdFilter = { $in: [req.companyId, new MongoTypes.ObjectId(req.companyId as string)] };
      } catch {
        companyIdFilter = req.companyId;
      }

      // 1. Ledgers
      await Ledger.updateMany(
        { companyId: req.companyId, groupName: oldName },
        { $set: { groupName: newName as any } }
      );

      // 2. Journal debit/credit
      await JournalEntry.updateMany(
        { companyId: companyIdFilter, debitGroup: oldName },
        { $set: { debitGroup: newName } }
      );
      await JournalEntry.updateMany(
        { companyId: companyIdFilter, creditGroup: oldName },
        { $set: { creditGroup: newName } }
      );

      // 3. Journal items
      await JournalEntry.updateMany(
        { companyId: companyIdFilter, "items.groupName": oldName },
        { $set: { "items.$[elem].groupName": newName } },
        { arrayFilters: [{ "elem.groupName": oldName }] } as any
      );

      // 4. BankCashEntry
      const escaped = oldName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      await BankCashEntry.updateMany(
        { companyId: companyIdFilter, contraAccountGroup: { $regex: new RegExp(`^${escaped}$`, "i") } },
        { $set: { contraAccountGroup: newName } }
      );

      // 5. ImportedTransaction
      try {
        await ImportedTransaction.updateMany(
          { companyId: companyIdFilter, accountGroup: oldName },
          { $set: { accountGroup: newName } }
        );
      } catch {
        // ignore safely
      }
    }

    group.groupName = newName;
    group.superGroup = newSuper as any;
    await group.save();

    res.json(group);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update account group" });
  }
}

export async function deleteGroup(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const group = await AccountGroup.findOne({ _id: id, companyId: req.companyId });
    if (!group) {
      res.status(404).json({ message: "Account group not found" });
      return;
    }

    // Check if any Ledger is using this groupName
    const { Ledger } = await import("../models/Ledger");
    const count = await Ledger.countDocuments({ companyId: req.companyId, groupName: group.groupName });
    if (count > 0) {
      res.status(400).json({
        message: `Cannot delete group "${group.groupName}" because it is currently assigned to ${count} ledger(s).`
      });
      return;
    }

    await AccountGroup.deleteOne({ _id: id, companyId: req.companyId });
    res.json({ message: `Account group "${group.groupName}" deleted successfully` });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete account group" });
  }
}
