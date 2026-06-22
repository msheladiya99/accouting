import { Response } from "express";
import { BankCashAccount } from "../models/BankCashAccount";
import { BankCashEntry } from "../models/BankCashEntry";
import { AuthenticatedRequest } from "../middleware/auth";
import { Ledger } from "../models/Ledger";
import { syncBankCashAccountFromLedger } from "./ledgerController";

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── BankCashAccount Controller Handlers ───────────────────────────────────────
export async function syncLedgerFromBankCashAccount(account: any, oldName?: string): Promise<void> {
  const { name, group, openingBalance, companyId } = account;
  if (!name || !group) return;

  const isBank = group === "Bank";
  const groupName = isBank ? "Bank Accounts (Banks)" : "Cash-in-hand";
  const openingDr = openingBalance >= 0 ? openingBalance : 0;
  const openingCr = openingBalance < 0 ? Math.abs(openingBalance) : 0;
  const finalName = name.trim().toUpperCase();
  const nameToSearch = oldName ? oldName.trim() : finalName;

  let ledger = await Ledger.findOne({
    ledgerName: { $regex: new RegExp(`^${escapeRegExp(nameToSearch)}$`, "i") },
    companyId
  });

  if (ledger) {
    ledger.ledgerName = finalName;
    ledger.groupName = groupName;
    ledger.openingDr = openingDr;
    ledger.openingCr = openingCr;
    await ledger.save();
  } else {
    ledger = new Ledger({
      ledgerName: finalName,
      groupName,
      openingDr,
      openingCr,
      companyId
    });
    await ledger.save();
  }
}

export async function getAllAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    let accounts = await BankCashAccount.find({ companyId: req.companyId }).sort({ name: 1 });

    // Sync any missing BankCashAccount records from Ledger master
    const bankCashLedgers = await Ledger.find({
      companyId: req.companyId,
      groupName: { $regex: /bank/i }
    });

    let needsRefetch = false;
    for (const l of bankCashLedgers) {
      const nameClean = l.ledgerName.trim();
      const exists = accounts.some(acc => acc.name.trim().toLowerCase() === nameClean.toLowerCase());
      if (!exists) {
        const group = "Bank";
        const openingBalance = (l.openingDr || 0) - (l.openingCr || 0);

        const newAcc = new BankCashAccount({
          name: nameClean,
          group,
          openingBalance,
          companyId: req.companyId
        });
        await newAcc.save();
        needsRefetch = true;
      }
    }

    if (needsRefetch) {
      accounts = await BankCashAccount.find({ companyId: req.companyId }).sort({ name: 1 });
    }
    
    // Auto-create default Cash Account if none exists
    const hasCash = accounts.some(acc => acc.group === "Cash");
    if (!hasCash) {
      const defaultCash = new BankCashAccount({
        name: "Cash Account",
        group: "Cash",
        openingBalance: 0,
        companyId: req.companyId
      });
      await defaultCash.save();
      // Re-fetch accounts
      accounts = await BankCashAccount.find({ companyId: req.companyId }).sort({ name: 1 });
    }

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
      name: { $regex: new RegExp(`^${escapeRegExp(name.trim())}$`, "i") },
      companyId: req.companyId
    });
    if (exists) {
      res.status(400).json({ message: "An account with this name already exists in this company" });
      return;
    }

    const account = new BankCashAccount({
      name: name.trim().toUpperCase(),
      group,
      openingBalance: openingBalance || 0,
      companyId: req.companyId
    });

    await account.save();
    await syncLedgerFromBankCashAccount(account);
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

    const oldName = account.name;

    if (name) {
      const duplicate = await BankCashAccount.findOne({
        name: { $regex: new RegExp(`^${escapeRegExp(name.trim())}$`, "i") },
        companyId: req.companyId,
        _id: { $ne: id }
      });
      if (duplicate) {
        res.status(400).json({ message: "Another account with this name already exists in this company" });
        return;
      }
      account.name = name.trim().toUpperCase();
    }
    if (group) account.group = group;
    if (openingBalance !== undefined) {
      let finalOpeningBalance = openingBalance;
      if (req.financialYear) {
        const { Types: MongoTypes } = require("mongoose");
        let companyIdFilter: any;
        try {
          companyIdFilter = { $in: [req.companyId, new MongoTypes.ObjectId(req.companyId as string)] };
        } catch {
          companyIdFilter = req.companyId;
        }

        const priorEntries = await BankCashEntry.find({
          accountId: account._id.toString(),
          companyId: companyIdFilter,
          date: { $lt: req.financialYear.startDate }
        });
        const movement = priorEntries.reduce((sum, e) => sum + e.deposit - e.withdrawal, 0);
        finalOpeningBalance = openingBalance - movement;
      }
      account.openingBalance = finalOpeningBalance;
    }

    await account.save();
    await syncLedgerFromBankCashAccount(account, oldName);

    const initialBalance = req.financialYear
      ? await getOpeningBalanceAt(account, req.financialYear.startDate, req.companyId as string)
      : account.openingBalance;
      
    const accObj = account.toObject();
    accObj.openingBalance = initialBalance;
    res.json(accObj);
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

    // Delete corresponding ledger (only for Bank accounts)
    if (account.group === "Bank") {
      await Ledger.deleteOne({
        ledgerName: { $regex: new RegExp(`^${escapeRegExp(account.name.trim())}$`, "i") },
        companyId: req.companyId
      });
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

// Optimized helper to retrieve opening balances for multiple accounts in a single batch query
async function getOpeningBalancesForAccountsAt(
  accounts: any[],
  startDate: string,
  companyId: string
): Promise<Map<string, number>> {
  const { Types: MongoTypes } = require("mongoose");
  let companyIdFilter: any;
  try {
    companyIdFilter = { $in: [companyId, new MongoTypes.ObjectId(companyId)] };
  } catch {
    companyIdFilter = companyId;
  }

  const accountIds = accounts.map((acc) => acc._id.toString());
  
  const priorEntries = await BankCashEntry.find({
    accountId: { $in: accountIds },
    companyId: companyIdFilter,
    date: { $lt: startDate }
  });

  const movements = new Map<string, number>();
  accountIds.forEach((id) => movements.set(id, 0));

  priorEntries.forEach((e) => {
    const current = movements.get(e.accountId) || 0;
    movements.set(e.accountId, current + e.deposit - e.withdrawal);
  });

  const results = new Map<string, number>();
  accounts.forEach((acc) => {
    const id = acc._id.toString();
    const movement = movements.get(id) || 0;
    results.set(id, acc.openingBalance + movement);
  });

  return results;
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

    // Fetch opening balances for all accounts in a single optimized database call
    const initialBalancesMap = req.financialYear
      ? await getOpeningBalancesForAccountsAt(accounts, req.financialYear.startDate, req.companyId as string)
      : new Map<string, number>(accounts.map((acc) => [acc._id.toString(), acc.openingBalance]));

    for (const acc of accounts) {
      const initialBalance = initialBalancesMap.get(acc._id.toString()) ?? acc.openingBalance;
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

    // Validate date is within the active financial year
    if (date && req.financialYear) {
      const d = date.slice(0, 10);
      if (d < req.financialYear.startDate || d > req.financialYear.endDate) {
        res.status(400).json({
          message: `Date ${d} is outside the active financial year (${req.financialYear.label}: ${req.financialYear.startDate} – ${req.financialYear.endDate}).`,
        });
        return;
      }
    }

    const cleanContraName = contraAccountName.trim().toUpperCase();

    const account = await BankCashAccount.findOne({ _id: accountId, companyId: req.companyId });
    if (!account) {
      res.status(404).json({ message: "Bank/Cash account not found" });
      return;
    }
    if (account.name.trim().toLowerCase() === cleanContraName.toLowerCase()) {
      res.status(400).json({ message: "Contra account cannot be the same as the Bank/Cash account" });
      return;
    }

    // Auto-create ledger if it doesn't exist in Ledger master
    const exists = await Ledger.findOne({
      ledgerName: { $regex: new RegExp(`^${escapeRegExp(cleanContraName)}$`, "i") },
      companyId: req.companyId
    });

    if (!exists) {
      const newLedger = new Ledger({
        ledgerName: cleanContraName,
        groupName: contraAccountGroup,
        openingDr: 0,
        openingCr: 0,
        companyId: req.companyId
      });
      await newLedger.save();
      await syncBankCashAccountFromLedger(newLedger);
    }

    const entry = new BankCashEntry({
      accountId,
      date,
      particulars,
      withdrawal: withdrawal || 0,
      deposit: deposit || 0,
      contraAccountName: cleanContraName,
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

    // Validate date is within the active financial year
    if (date && req.financialYear) {
      const d = date.slice(0, 10);
      if (d < req.financialYear.startDate || d > req.financialYear.endDate) {
        res.status(400).json({
          message: `Date ${d} is outside the active financial year (${req.financialYear.label}: ${req.financialYear.startDate} – ${req.financialYear.endDate}).`,
        });
        return;
      }
    }

    const checkAccountId = accountId || entry.accountId;
    const checkContraName = contraAccountName !== undefined ? contraAccountName.trim() : entry.contraAccountName;
    if (checkAccountId) {
      const account = await BankCashAccount.findOne({ _id: checkAccountId, companyId: req.companyId });
      if (!account) {
        res.status(404).json({ message: "Bank/Cash account not found" });
        return;
      }
      if (checkContraName && account.name.trim().toLowerCase() === checkContraName.toLowerCase()) {
        res.status(400).json({ message: "Contra account cannot be the same as the Bank/Cash account" });
        return;
      }
    }

    if (accountId) entry.accountId = accountId;
    if (date) entry.date = date;
    if (particulars) entry.particulars = particulars;
    if (withdrawal !== undefined) entry.withdrawal = withdrawal;
    if (deposit !== undefined) entry.deposit = deposit;
    
    if (contraAccountName) {
      const cleanContraName = contraAccountName.trim().toUpperCase();
      entry.contraAccountName = cleanContraName;

      // Auto-create ledger if it doesn't exist in Ledger master
      const group = contraAccountGroup || entry.contraAccountGroup || "Expense";
      const exists = await Ledger.findOne({
        ledgerName: { $regex: new RegExp(`^${escapeRegExp(cleanContraName)}$`, "i") },
        companyId: req.companyId
      });

      if (!exists) {
        const newLedger = new Ledger({
          ledgerName: cleanContraName,
          groupName: group,
          openingDr: 0,
          openingCr: 0,
          companyId: req.companyId
        });
        await newLedger.save();
        await syncBankCashAccountFromLedger(newLedger);
      }
    }
    
    if (contraAccountGroup) {
      entry.contraAccountGroup = contraAccountGroup;

      const ledgerName = entry.contraAccountName;
      if (ledgerName) {
        // Also update the Ledger master group name for this account
        await Ledger.updateOne(
          { ledgerName: { $regex: new RegExp(`^${escapeRegExp(ledgerName)}$`, "i") }, companyId: req.companyId },
          { $set: { groupName: contraAccountGroup } }
        );

        // Update all other BankCashEntry records with the same account name in the same company
        await BankCashEntry.updateMany(
          { 
            contraAccountName: { $regex: new RegExp(`^${escapeRegExp(ledgerName)}$`, "i") }, 
            companyId: req.companyId 
          },
          { $set: { contraAccountGroup } }
        );
      }
    }

    // Persist modification status (checkmark)
    (entry as any).isChanged = true;

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

export async function bulkDeleteEntries(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { ids } = req.body;
  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ message: "No entry IDs provided" });
      return;
    }
    const result = await BankCashEntry.deleteMany({
      _id: { $in: ids },
      companyId: req.companyId
    });
    res.json({ message: `Successfully deleted ${result.deletedCount} entries`, deletedCount: result.deletedCount });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to bulk delete entries" });
  }
}

export async function bulkApproveEntries(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { ids } = req.body;
  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ message: "No entry IDs provided" });
      return;
    }
    const result = await BankCashEntry.updateMany(
      { _id: { $in: ids }, companyId: req.companyId },
      { $set: { isChanged: true } }
    );
    res.json({ message: `Successfully approved ${result.modifiedCount} entries`, approvedCount: result.modifiedCount });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to bulk approve entries" });
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
