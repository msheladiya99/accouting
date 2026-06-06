import { Response } from "express";
import { BankCashAccount } from "../models/BankCashAccount";
import { BankCashEntry } from "../models/BankCashEntry";
import { AuthenticatedRequest } from "../middleware/auth";

// ── BankCashAccount Controller Handlers ───────────────────────────────────────
export async function getAllAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const accounts = await BankCashAccount.find({ companyId: req.companyId }).sort({ name: 1 });
    const results = [];
    for (const acc of accounts) {
      const initialBalance = req.financialYear
        ? await getOpeningBalanceAt(acc, req.financialYear.startDate, req.companyId as string)
        : acc.openingBalance;
      
      const accObj = acc.toObject();
      accObj.openingBalance = initialBalance;
      results.push(accObj);
    }
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve accounts" });
  }
}

export async function getAccountById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const account = await BankCashAccount.findOne({ _id: id, companyId: req.companyId });
    if (!account) {
      res.status(404).json({ message: "Account not found" });
      return;
    }
    const initialBalance = req.financialYear
      ? await getOpeningBalanceAt(account, req.financialYear.startDate, req.companyId as string)
      : account.openingBalance;
    const accObj = account.toObject();
    accObj.openingBalance = initialBalance;
    res.json(accObj);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve account" });
  }
}

export async function createAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { name, group, openingBalance } = req.body;
  try {
    if (!name || !group) {
      res.status(400).json({ message: "Account name and group are required" });
      return;
    }

    const exists = await BankCashAccount.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
      companyId: req.companyId
    });
    if (exists) {
      res.status(400).json({ message: "An account with this name already exists in this company" });
      return;
    }

    const account = new BankCashAccount({
      name: name.trim(),
      group,
      openingBalance: openingBalance || 0,
      companyId: req.companyId
    });

    await account.save();
    res.status(201).json(account);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create account" });
  }
}

export async function updateAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { name, group, openingBalance } = req.body;
  try {
    const account = await BankCashAccount.findOne({ _id: id, companyId: req.companyId });
    if (!account) {
      res.status(404).json({ message: "Account not found" });
      return;
    }

    if (name) {
      const duplicate = await BankCashAccount.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
        companyId: req.companyId,
        _id: { $ne: id }
      });
      if (duplicate) {
        res.status(400).json({ message: "Another account with this name already exists in this company" });
        return;
      }
      account.name = name.trim();
    }
    if (group) account.group = group;
    if (openingBalance !== undefined) account.openingBalance = openingBalance;

    await account.save();
    res.json(account);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update account" });
  }
}

export async function deleteAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const account = await BankCashAccount.findOne({ _id: id, companyId: req.companyId });
    if (!account) {
      res.status(404).json({ message: "Account not found" });
      return;
    }

    // Delete associated entries
    await BankCashEntry.deleteMany({ accountId: id, companyId: req.companyId });
    await BankCashAccount.deleteOne({ _id: id, companyId: req.companyId });

    res.json({ message: "Account and associated entries deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete account" });
  }
}

// ── BankCashEntry Controller Handlers ─────────────────────────────────────────

// Running balance calculation helper
function computeRows(account: any, accountEntries: any[]) {
  const sorted = [...accountEntries].sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : a.createdAt.toISOString().localeCompare(b.createdAt.toISOString())
  );
  let running = account.openingBalance;
  return sorted.map((e: any, i: number) => {
    running = running + e.deposit - e.withdrawal;
    const obj = e.toObject ? e.toObject() : e;
    return {
      ...obj,
      srNo: i + 1,
      balance: running,
      accountName: account.name,
      accountGroup: account.group
    };
  });
}

// Helper to sum all historical movements prior to the active financial year's start date
async function getOpeningBalanceAt(account: any, startDate: string, companyId: string): Promise<number> {
  const { Types: MongoTypes } = require("mongoose");
  let companyIdFilter: any;
  try {
    companyIdFilter = { $in: [companyId, new MongoTypes.ObjectId(companyId)] };
  } catch {
    companyIdFilter = companyId;
  }
  const priorEntries = await BankCashEntry.find({
    accountId: account._id.toString(),
    companyId: companyIdFilter,
    date: { $lt: startDate }
  });
  const movement = priorEntries.reduce((sum, e) => sum + e.deposit - e.withdrawal, 0);
  return account.openingBalance + movement;
}

export async function getAllEntries(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { accountId } = req.query;
  try {
    const accounts = await BankCashAccount.find({ companyId: req.companyId });

    // Set up filter query scoped by companyId and active financial year
    // Use $in to match both ObjectId and string forms of companyId (handles legacy imports)
    const { Types: MongoTypes } = require("mongoose");
    let companyIdFilter: any;
    try {
      companyIdFilter = { $in: [req.companyId, new MongoTypes.ObjectId(req.companyId as string)] };
    } catch {
      companyIdFilter = req.companyId;
    }
    const filterQuery: any = { companyId: companyIdFilter };
    if (req.financialYear) {
      filterQuery.date = { $gte: req.financialYear.startDate, $lte: req.financialYear.endDate };
    }

    if (accountId) {
      const acc = accounts.find((a) => a._id.toString() === accountId.toString());
      if (!acc) {
        res.status(404).json({ message: "Account not found" });
        return;
      }
      
      const initialBalance = req.financialYear
        ? await getOpeningBalanceAt(acc, req.financialYear.startDate, req.companyId as string)
        : acc.openingBalance;

      const entries = await BankCashEntry.find({ ...filterQuery, accountId });
      const rows = computeRows({ ...acc.toObject(), openingBalance: initialBalance }, entries);
      res.json(rows);
      return;
    }

    // Fetch all entries for all accounts
    const allEntries = await BankCashEntry.find(filterQuery);
    const rows: any[] = [];
    for (const acc of accounts) {
      const initialBalance = req.financialYear
        ? await getOpeningBalanceAt(acc, req.financialYear.startDate, req.companyId as string)
        : acc.openingBalance;

      const acctEntries = allEntries.filter((e) => e.accountId === acc._id.toString());
      rows.push(...computeRows({ ...acc.toObject(), openingBalance: initialBalance }, acctEntries));
    }

    // Sort by date, then by creation date
    rows.sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.createdAt.toISOString().localeCompare(b.createdAt.toISOString())
    );

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve entries" });
  }
}

export async function createEntry(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { accountId, date, particulars, withdrawal, deposit, contraAccountName, contraAccountGroup } = req.body;
  try {
    if (!accountId || !date || !particulars || !contraAccountName || !contraAccountGroup) {
      res.status(400).json({ message: "Required fields missing" });
      return;
    }

    const entry = new BankCashEntry({
      accountId,
      date,
      particulars,
      withdrawal: withdrawal || 0,
      deposit: deposit || 0,
      contraAccountName,
      contraAccountGroup,
      companyId: req.companyId
    });

    await entry.save();
    res.status(201).json(entry);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create entry" });
  }
}

// Check and verify entry updates
export async function updateEntry(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { accountId, date, particulars, withdrawal, deposit, contraAccountName, contraAccountGroup } = req.body;
  try {
    const entry = await BankCashEntry.findOne({ _id: id, companyId: req.companyId });
    if (!entry) {
      res.status(404).json({ message: "Entry not found" });
      return;
    }

    if (accountId) entry.accountId = accountId;
    if (date) entry.date = date;
    if (particulars) entry.particulars = particulars;
    if (withdrawal !== undefined) entry.withdrawal = withdrawal;
    if (deposit !== undefined) entry.deposit = deposit;
    if (contraAccountName) entry.contraAccountName = contraAccountName;
    if (contraAccountGroup) entry.contraAccountGroup = contraAccountGroup;

    await entry.save();
    res.json(entry);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update entry" });
  }
}

export async function deleteEntry(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const entry = await BankCashEntry.findOne({ _id: id, companyId: req.companyId });
    if (!entry) {
      res.status(404).json({ message: "Entry not found" });
      return;
    }

    await BankCashEntry.deleteOne({ _id: id, companyId: req.companyId });
    res.json({ message: "Entry deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete entry" });
  }
}

// Clear ALL entries for a specific account (used to fix duplicate imports)
export async function clearEntriesForAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const account = await BankCashAccount.findOne({ _id: id, companyId: req.companyId });
    if (!account) {
      res.status(404).json({ message: "Account not found" });
      return;
    }
    const { Types: MongoTypes } = require("mongoose");
    let companyIdFilter: any;
    try {
      companyIdFilter = { $in: [req.companyId, new MongoTypes.ObjectId(req.companyId as string)] };
    } catch {
      companyIdFilter = req.companyId;
    }
    const result = await BankCashEntry.deleteMany({ accountId: id, companyId: companyIdFilter });
    res.json({ message: `Deleted ${result.deletedCount} entries for account "${account.name}"`, deletedCount: result.deletedCount });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to clear entries" });
  }
}
