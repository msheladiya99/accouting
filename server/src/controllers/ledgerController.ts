import { Response } from "express";
import { Ledger } from "../models/Ledger";
import { AuthenticatedRequest } from "../middleware/auth";
import { JournalEntry } from "../models/JournalEntry";
import { BankCashEntry } from "../models/BankCashEntry";
import { AccountGroup } from "../models/AccountGroup";
import { FinancialYear } from "../models/FinancialYear";
import { BankCashAccount } from "../models/BankCashAccount";
import { ImportedTransaction } from "../models/ImportedTransaction";

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SUPER_GROUP_PARENTS: Record<string, "Assets" | "Liabilities" | "Capital" | "Income" | "Expense"> = {
  "Capital Account": "Capital",
  "Profit & Loss A/c": "Capital",
  "Current Liabilities": "Liabilities",
  "Loans (Liability)": "Liabilities",
  "Fixed Assets": "Assets",
  "Investments": "Assets",
  "Current Assets": "Assets",
  "Cash Ledger A/C.": "Assets",
  "Stock-in-hand": "Assets",
  "Suspense Account": "Assets",
  "Misc. Expenses (Asset)": "Assets",
  "Sales Account": "Income",
  "Purchase Account": "Expense",
  "Income (Trading)": "Income",
  "Income": "Income",
  "Income (Other Then Sales)": "Income",
  "Expenses (Direct)": "Expense",
  "Expense Account": "Expense",
  "Partner Interest": "Expense",
  "Partner Remuneration": "Expense"
};

async function getCalculatedLedgerBalances(
  companyId: string,
  startDate: string,
  targetLedgers: any[]
): Promise<any[]> {
  const { Types: MongoTypes } = require("mongoose");
  let companyIdFilter: any;
  try {
    companyIdFilter = { $in: [companyId, new MongoTypes.ObjectId(companyId)] };
  } catch {
    companyIdFilter = companyId;
  }

  // 1. Check if there are any financial years prior to this one
  const priorFYExists = await FinancialYear.exists({
    companyId: companyIdFilter,
    startDate: { $lt: startDate }
  });

  if (!priorFYExists) {
    return targetLedgers;
  }

  // 2. Fetch all ledgers to compute priorNetProfit
  const allLedgers = await Ledger.find({ companyId: companyIdFilter });

  // 3. Fetch all account groups to determine ledger categories
  const groups = await AccountGroup.find({ companyId: companyIdFilter });
  const groupToCategoryMap: Record<string, "Assets" | "Liabilities" | "Capital" | "Income" | "Expense"> = {};
  groups.forEach((g) => {
    groupToCategoryMap[g.groupName] = SUPER_GROUP_PARENTS[g.superGroup] || "Assets";
  });

  // 4. Fetch all prior transactions (Journal and Bank/Cash)
  const priorJournalEntries = await JournalEntry.find({
    companyId: companyIdFilter,
    date: { $lt: startDate }
  });

  const priorBankCashEntries = await BankCashEntry.find({
    companyId: companyIdFilter,
    date: { $lt: startDate }
  });

  const bankCashAccounts = await BankCashAccount.find({ companyId: companyIdFilter });
  const accountIdToNameMap = new Map<string, string>();
  bankCashAccounts.forEach((acc) => {
    accountIdToNameMap.set(acc._id.toString(), acc.name);
  });

  // 5. Sum up prior transactions for all ledgers
  const ledgerMap: Record<string, { dr: number; cr: number }> = {};
  allLedgers.forEach((l) => {
    ledgerMap[l.ledgerName] = { dr: 0, cr: 0 };
  });

  priorJournalEntries.forEach((e: any) => {
    const items = e.items && e.items.length > 0 ? e.items : [
      { type: "Db", accountName: e.debitAccount, groupName: e.debitGroup, amount: e.debitAmount },
      { type: "Cr", accountName: e.creditAccount, groupName: e.creditGroup, amount: e.creditAmount }
    ];
    items.forEach((item: any) => {
      if (ledgerMap[item.accountName]) {
        if (item.type === "Db") {
          ledgerMap[item.accountName].dr += Number(item.amount || 0);
        } else {
          ledgerMap[item.accountName].cr += Number(item.amount || 0);
        }
      }
    });
  });

  priorBankCashEntries.forEach((e) => {
    if (ledgerMap[e.contraAccountName]) {
      if (e.withdrawal > 0) {
        ledgerMap[e.contraAccountName].dr += e.withdrawal;
      }
      if (e.deposit > 0) {
        ledgerMap[e.contraAccountName].cr += e.deposit;
      }
    }
    const accName = accountIdToNameMap.get(e.accountId);
    if (accName && ledgerMap[accName]) {
      if (e.deposit > 0) {
        ledgerMap[accName].dr += e.deposit;
      }
      if (e.withdrawal > 0) {
        ledgerMap[accName].cr += e.withdrawal;
      }
    }
  });

  // 6. Calculate cumulative prior net profit/loss
  let priorRevenue = 0;
  let priorExpenses = 0;

  allLedgers.forEach((l) => {
    const category = groupToCategoryMap[l.groupName] || "Assets";
    const txns = ledgerMap[l.ledgerName] || { dr: 0, cr: 0 };
    const originalDr = l.openingDr || 0;
    const originalCr = l.openingCr || 0;

    if (category === "Income") {
      priorRevenue += (originalCr - originalDr) + txns.cr - txns.dr;
    } else if (category === "Expense") {
      priorExpenses += (originalDr - originalCr) + txns.dr - txns.cr;
    }
  });

  const priorNetProfit = priorRevenue - priorExpenses;

  // 7. Map target ledgers to their calculated opening balances
  return targetLedgers.map((l) => {
    const category = groupToCategoryMap[l.groupName] || "Assets";
    const ledgerObj = l.toObject ? l.toObject() : l;

    if (category === "Income" || category === "Expense") {
      ledgerObj.openingDr = 0;
      ledgerObj.openingCr = 0;
    } else if (l.ledgerName === "Profit & Loss A/c" || l.groupName === "Profit & Loss A/c") {
      const txns = ledgerMap[l.ledgerName] || { dr: 0, cr: 0 };
      const originalDr = l.openingDr || 0;
      const originalCr = l.openingCr || 0;

      const netPL = (originalCr - originalDr) + (txns.cr - txns.dr) + priorNetProfit;
      if (netPL > 0) {
        ledgerObj.openingCr = netPL;
        ledgerObj.openingDr = 0;
      } else {
        ledgerObj.openingDr = Math.abs(netPL);
        ledgerObj.openingCr = 0;
      }
    } else {
      const txns = ledgerMap[l.ledgerName] || { dr: 0, cr: 0 };
      const originalDr = l.openingDr || 0;
      const originalCr = l.openingCr || 0;

      const totalDr = originalDr + txns.dr;
      const totalCr = originalCr + txns.cr;

      if (totalDr > totalCr) {
        ledgerObj.openingDr = totalDr - totalCr;
        ledgerObj.openingCr = 0;
      } else {
        ledgerObj.openingCr = totalCr - totalDr;
        ledgerObj.openingDr = 0;
      }
    }
    return ledgerObj;
  });
}

async function getPriorMovement(
  companyId: string,
  startDate: string,
  ledgerName: string,
  groupName: string
): Promise<{ dr: number; cr: number }> {
  const { Types: MongoTypes } = require("mongoose");
  let companyIdFilter: any;
  try {
    companyIdFilter = { $in: [companyId, new MongoTypes.ObjectId(companyId)] };
  } catch {
    companyIdFilter = companyId;
  }

  const escName = escapeRegExp(ledgerName.trim());
  const namePattern = new RegExp(`^${escName}$`, "i");

  let dr = 0;
  let cr = 0;

  // 1. Journal entries
  const journalEntries = await JournalEntry.find({
    companyId: companyIdFilter,
    date: { $lt: startDate },
    $or: [
      { debitAccount: namePattern },
      { creditAccount: namePattern },
      { "items.accountName": namePattern }
    ]
  });

  journalEntries.forEach((e: any) => {
    const items = e.items && e.items.length > 0 ? e.items : [
      { type: "Db", accountName: e.debitAccount, amount: e.debitAmount },
      { type: "Cr", accountName: e.creditAccount, amount: e.creditAmount }
    ];
    items.forEach((item: any) => {
      if (item.accountName && item.accountName.toLowerCase() === ledgerName.toLowerCase()) {
        if (item.type === "Db") {
          dr += Number(item.amount || 0);
        } else {
          cr += Number(item.amount || 0);
        }
      }
    });
  });

  // 2. Bank/Cash entries as contra
  const bankCashContra = await BankCashEntry.find({
    companyId: companyIdFilter,
    date: { $lt: startDate },
    contraAccountName: namePattern
  });

  bankCashContra.forEach((e) => {
    if (e.withdrawal > 0) {
      dr += e.withdrawal;
    }
    if (e.deposit > 0) {
      cr += e.deposit;
    }
  });

  // 3. Bank/Cash entries as account
  const bankAccount = await BankCashAccount.findOne({
    name: namePattern,
    companyId
  });

  if (bankAccount) {
    const bankCashAccEntries = await BankCashEntry.find({
      companyId: companyIdFilter,
      date: { $lt: startDate },
      accountId: bankAccount._id.toString()
    });
    bankCashAccEntries.forEach((e) => {
      if (e.deposit > 0) {
        dr += e.deposit;
      }
      if (e.withdrawal > 0) {
        cr += e.withdrawal;
      }
    });
  }

  return { dr, cr };
}

async function getAdjustedOpeningBalance(
  companyId: string,
  startDate: string,
  ledgerName: string,
  groupName: string,
  inputDr: number,
  inputCr: number
): Promise<{ openingDr: number; openingCr: number }> {
  const { Types: MongoTypes } = require("mongoose");
  let companyIdFilter: any;
  try {
    companyIdFilter = { $in: [companyId, new MongoTypes.ObjectId(companyId)] };
  } catch {
    companyIdFilter = companyId;
  }

  const priorFYExists = await FinancialYear.exists({
    companyId: companyIdFilter,
    startDate: { $lt: startDate }
  });

  if (!priorFYExists) {
    return { openingDr: inputDr, openingCr: inputCr };
  }

  const isPL = ledgerName.trim().toUpperCase() === "PROFIT & LOSS A/C" || groupName.trim().toUpperCase() === "PROFIT & LOSS A/C";

  if (isPL) {
    const allLedgers = await Ledger.find({ companyId: companyIdFilter });
    const groups = await AccountGroup.find({ companyId: companyIdFilter });
    const groupToCategoryMap: Record<string, string> = {};
    groups.forEach((g) => {
      groupToCategoryMap[g.groupName] = SUPER_GROUP_PARENTS[g.superGroup] || "Assets";
    });

    const priorJournalEntries = await JournalEntry.find({
      companyId: companyIdFilter,
      date: { $lt: startDate }
    });

    const priorBankCashEntries = await BankCashEntry.find({
      companyId: companyIdFilter,
      date: { $lt: startDate }
    });

    const bankCashAccounts = await BankCashAccount.find({ companyId: companyIdFilter });
    const accountIdToNameMap = new Map<string, string>();
    bankCashAccounts.forEach((acc) => {
      accountIdToNameMap.set(acc._id.toString(), acc.name);
    });

    const ledgerMap: Record<string, { dr: number; cr: number }> = {};
    allLedgers.forEach((l) => {
      ledgerMap[l.ledgerName] = { dr: 0, cr: 0 };
    });

    priorJournalEntries.forEach((e: any) => {
      const items = e.items && e.items.length > 0 ? e.items : [
        { type: "Db", accountName: e.debitAccount, amount: e.debitAmount },
        { type: "Cr", accountName: e.creditAccount, amount: e.creditAmount }
      ];
      items.forEach((item: any) => {
        if (ledgerMap[item.accountName]) {
          if (item.type === "Db") {
            ledgerMap[item.accountName].dr += Number(item.amount || 0);
          } else {
            ledgerMap[item.accountName].cr += Number(item.amount || 0);
          }
        }
      });
    });

    priorBankCashEntries.forEach((e) => {
      if (ledgerMap[e.contraAccountName]) {
        if (e.withdrawal > 0) {
          ledgerMap[e.contraAccountName].dr += e.withdrawal;
        }
        if (e.deposit > 0) {
          ledgerMap[e.contraAccountName].cr += e.deposit;
        }
      }
      const accName = accountIdToNameMap.get(e.accountId);
      if (accName && ledgerMap[accName]) {
        if (e.deposit > 0) {
          ledgerMap[accName].dr += e.deposit;
        }
        if (e.withdrawal > 0) {
          ledgerMap[accName].cr += e.withdrawal;
        }
      }
    });

    let priorRevenue = 0;
    let priorExpenses = 0;

    allLedgers.forEach((l) => {
      const category = groupToCategoryMap[l.groupName] || "Assets";
      const txns = ledgerMap[l.ledgerName] || { dr: 0, cr: 0 };
      const originalDr = l.openingDr || 0;
      const originalCr = l.openingCr || 0;

      if (category === "Income") {
        priorRevenue += (originalCr - originalDr) + txns.cr - txns.dr;
      } else if (category === "Expense") {
        priorExpenses += (originalDr - originalCr) + txns.dr - txns.cr;
      }
    });

    const priorNetProfit = priorRevenue - priorExpenses;
    const txns = ledgerMap[ledgerName] || { dr: 0, cr: 0 };
    const targetNet = (inputCr - inputDr) - (txns.cr - txns.dr) - priorNetProfit;
    if (targetNet >= 0) {
      return { openingDr: 0, openingCr: targetNet };
    } else {
      return { openingDr: Math.abs(targetNet), openingCr: 0 };
    }
  } else {
    const movement = await getPriorMovement(companyId, startDate, ledgerName, groupName);
    const targetNet = (inputDr - inputCr) - (movement.dr - movement.cr);
    if (targetNet >= 0) {
      return { openingDr: targetNet, openingCr: 0 };
    } else {
      return { openingDr: 0, openingCr: Math.abs(targetNet) };
    }
  }
}

export async function syncBankCashAccountFromLedger(ledger: any, oldName?: string): Promise<void> {
  const { ledgerName, groupName, openingDr, openingCr, companyId } = ledger;
  if (!ledgerName || !groupName) return;

  const nameUpper = ledgerName.trim().toUpperCase();
  const excludedNames = [
    "BANK ACCOUNTS (BANKS)",
    "BANK OCC A/C",
    "CASH-IN-HAND",
    "CASH LEDGER A/C.",
    "BANK",
    "CASH",
    "ASSETS",
    "LIABILITIES",
    "CAPITAL",
    "EXPENSE",
    "EXPENSE ACCOUNT",
    "INCOME"
  ];

  const isBank = /bank/i.test(groupName);
  const isCash = /cash/i.test(groupName);

  if ((isBank || isCash) && !excludedNames.includes(nameUpper)) {
    const group = isBank ? "Bank" : "Cash";
    const openingBalance = (openingDr || 0) - (openingCr || 0);
    const finalName = ledgerName.trim();
    const nameToSearch = oldName ? oldName.trim() : finalName;

    let acc = await BankCashAccount.findOne({
      name: { $regex: new RegExp(`^${escapeRegExp(nameToSearch)}$`, "i") },
      companyId
    });

    if (acc) {
      acc.name = finalName;
      acc.group = group;
      acc.openingBalance = openingBalance;
      await acc.save();
    } else {
      acc = new BankCashAccount({
        name: finalName,
        group,
        openingBalance,
        companyId
      });
      await acc.save();
    }
  } else {
    const nameToSearch = oldName ? oldName.trim() : ledgerName.trim();
    await BankCashAccount.deleteOne({
      name: { $regex: new RegExp(`^${escapeRegExp(nameToSearch)}$`, "i") },
      companyId
    });
  }
}

export async function getAllLedgers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { raw } = req.query;
    const ledgers = await Ledger.find({ companyId: req.companyId }).sort({ createdAt: -1 });
    if (raw === "true" || !req.financialYear) {
      res.json(ledgers);
      return;
    }
    const calculated = await getCalculatedLedgerBalances(
      req.companyId as string,
      req.financialYear.startDate,
      ledgers
    );
    res.json(calculated);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve ledgers" });
  }
}

export async function getLedgerById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { raw } = req.query;
  try {
    const ledger = await Ledger.findOne({ _id: id, companyId: req.companyId });
    if (!ledger) {
      res.status(404).json({ message: "Ledger not found" });
      return;
    }
    if (raw === "true" || !req.financialYear) {
      res.json(ledger);
      return;
    }
    const calculated = await getCalculatedLedgerBalances(
      req.companyId as string,
      req.financialYear.startDate,
      [ledger]
    );
    res.json(calculated[0]);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve ledger" });
  }
}

export async function createLedger(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { ledgerName, groupName, openingDr, openingCr } = req.body;
  try {
    if (!ledgerName || !groupName) {
      res.status(400).json({ message: "Ledger name and group name are required" });
      return;
    }

    const trimmedName = ledgerName.trim().toUpperCase();
    const exists = await Ledger.findOne({
      ledgerName: { $regex: new RegExp(`^${escapeRegExp(trimmedName)}$`, "i") },
      companyId: req.companyId
    });

    if (exists) {
      res.status(400).json({ message: "A ledger with this name already exists in this company" });
      return;
    }

    const adjusted = req.financialYear
      ? await getAdjustedOpeningBalance(
          req.companyId as string,
          req.financialYear.startDate,
          trimmedName,
          groupName,
          openingDr || 0,
          openingCr || 0
        )
      : { openingDr: openingDr || 0, openingCr: openingCr || 0 };

    const ledger = new Ledger({
      ledgerName: trimmedName,
      groupName,
      openingDr: adjusted.openingDr,
      openingCr: adjusted.openingCr,
      companyId: req.companyId
    });

    await ledger.save();
    await syncBankCashAccountFromLedger(ledger);
    res.status(201).json(ledger);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create ledger" });
  }
}

export async function updateLedger(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { ledgerName, groupName, openingDr, openingCr } = req.body;
  try {
    const ledger = await Ledger.findOne({ _id: id, companyId: req.companyId });
    if (!ledger) {
      res.status(404).json({ message: "Ledger not found" });
      return;
    }

    const oldName = ledger.ledgerName;

    if (ledgerName) {
      const trimmedName = ledgerName.trim().toUpperCase();
      const duplicate = await Ledger.findOne({
        ledgerName: { $regex: new RegExp(`^${escapeRegExp(trimmedName)}$`, "i") },
        companyId: req.companyId,
        _id: { $ne: id }
      });
      if (duplicate) {
        res.status(400).json({ message: "Another ledger with this name already exists in this company" });
        return;
      }
      ledger.ledgerName = trimmedName;
    }

    if (groupName) ledger.groupName = groupName;
    if (openingDr !== undefined || openingCr !== undefined) {
      const inputDr = openingDr !== undefined ? openingDr : ledger.openingDr;
      const inputCr = openingCr !== undefined ? openingCr : ledger.openingCr;
      const adjusted = req.financialYear
        ? await getAdjustedOpeningBalance(
            req.companyId as string,
            req.financialYear.startDate,
            ledger.ledgerName,
            ledger.groupName,
            inputDr,
            inputCr
          )
        : { openingDr: inputDr, openingCr: inputCr };
      ledger.openingDr = adjusted.openingDr;
      ledger.openingCr = adjusted.openingCr;
    }

    await ledger.save();
    await syncBankCashAccountFromLedger(ledger, oldName);
    res.json(ledger);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update ledger" });
  }
}

export async function deleteLedger(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const ledger = await Ledger.findOne({ _id: id, companyId: req.companyId });
    if (!ledger) {
      res.status(404).json({ message: "Ledger not found" });
      return;
    }

    const { Types: MongoTypes } = require("mongoose");
    let companyIdFilter: any;
    try {
      companyIdFilter = { $in: [req.companyId, new MongoTypes.ObjectId(req.companyId as string)] };
    } catch {
      companyIdFilter = req.companyId;
    }

    // ── Guard: block deletion if the ledger has any journal or bank/cash entries ──
    const escapedName = escapeRegExp(ledger.ledgerName.trim());
    const ledgerNamePattern = new RegExp(`^${escapedName}$`, "i");

    const journalEntryCount = await JournalEntry.countDocuments({
      companyId: companyIdFilter,
      $or: [
        { debitAccount:  { $regex: ledgerNamePattern } },
        { creditAccount: { $regex: ledgerNamePattern } },
        { "items.accountName": { $regex: ledgerNamePattern } }
      ]
    });

    if (journalEntryCount > 0) {
      res.status(400).json({
        message: `Cannot delete "${ledger.ledgerName}" — it has ${journalEntryCount} journal entr${journalEntryCount === 1 ? "y" : "ies"}. Remove all entries before deleting.`
      });
      return;
    }

    const bankCashEntryCount = await BankCashEntry.countDocuments({
      companyId: companyIdFilter,
      $or: [
        { contraAccountName: { $regex: ledgerNamePattern } }
      ]
    });

    if (bankCashEntryCount > 0) {
      res.status(400).json({
        message: `Cannot delete "${ledger.ledgerName}" — it has ${bankCashEntryCount} bank/cash entr${bankCashEntryCount === 1 ? "y" : "ies"}. Remove all entries before deleting.`
      });
      return;
    }

    const account = await BankCashAccount.findOne({
      name: { $regex: ledgerNamePattern },
      companyId: req.companyId
    });

    if (account) {
      const accountEntryCount = await BankCashEntry.countDocuments({
        accountId: account._id.toString(),
        companyId: companyIdFilter
      });
      if (accountEntryCount > 0) {
        res.status(400).json({
          message: `Cannot delete "${ledger.ledgerName}" — it has ${accountEntryCount} bank/cash entr${accountEntryCount === 1 ? "y" : "ies"}. Remove all entries before deleting.`
        });
        return;
      }
      await BankCashAccount.deleteOne({ _id: account._id });
    }

    await Ledger.deleteOne({ _id: id, companyId: req.companyId });
    res.json({ message: "Ledger deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete ledger" });
  }
}

export async function bulkDeleteLedgers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { ids } = req.body;
  try {
    if (!Array.isArray(ids)) {
      res.status(400).json({ message: "Request body must contain an array of ledger IDs under 'ids'" });
      return;
    }

    const ledgers = await Ledger.find({ _id: { $in: ids }, companyId: req.companyId });

    const { Types: MongoTypes } = require("mongoose");
    let companyIdFilter: any;
    try {
      companyIdFilter = { $in: [req.companyId, new MongoTypes.ObjectId(req.companyId as string)] };
    } catch {
      companyIdFilter = req.companyId;
    }

    // ── Guard: skip ledgers that have any journal or bank/cash entries ────────
    const blockedLedgers: string[] = [];
    const deletableLedgers: typeof ledgers = [];

    for (const ledger of ledgers) {
      const escapedName = escapeRegExp(ledger.ledgerName.trim());
      const namePattern = new RegExp(`^${escapedName}$`, "i");

      const jCount = await JournalEntry.countDocuments({
        companyId: companyIdFilter,
        $or: [
          { debitAccount:  { $regex: namePattern } },
          { creditAccount: { $regex: namePattern } },
          { "items.accountName": { $regex: namePattern } }
        ]
      });

      if (jCount > 0) {
        blockedLedgers.push(ledger.ledgerName);
        continue;
      }

      const contraCount = await BankCashEntry.countDocuments({
        companyId: companyIdFilter,
        contraAccountName: { $regex: namePattern }
      });

      if (contraCount > 0) {
        blockedLedgers.push(ledger.ledgerName);
        continue;
      }

      // Check if it is a bank/cash account and has account-side entries
      const account = await BankCashAccount.findOne({
        name: { $regex: namePattern },
        companyId: req.companyId
      });
      if (account) {
        const accCount = await BankCashEntry.countDocuments({
          accountId: account._id.toString(),
          companyId: companyIdFilter
        });
        if (accCount > 0) {
          blockedLedgers.push(ledger.ledgerName);
          continue;
        }
      }

      deletableLedgers.push(ledger);
    }

    if (deletableLedgers.length === 0 && blockedLedgers.length > 0) {
      res.status(400).json({
        message: `Cannot delete the selected ledger(s) — they all have existing entries: ${blockedLedgers.slice(0, 5).join(", ")}${blockedLedgers.length > 5 ? " and more" : ""}.`,
        blocked: blockedLedgers
      });
      return;
    }

    const deletableIds = deletableLedgers.map(l => (l._id as any).toString());
    const deletableNames = deletableLedgers.map(l => l.ledgerName.trim());

    // Clean up associated BankCashAccounts for deletable ledgers only
    const accounts = await BankCashAccount.find({
      name: { $in: deletableNames.map(name => new RegExp(`^${escapeRegExp(name)}$`, "i")) },
      companyId: req.companyId
    });
    if (accounts.length > 0) {
      await BankCashAccount.deleteMany({ _id: { $in: accounts.map(a => a._id) } });
    }

    const result = await Ledger.deleteMany({ _id: { $in: deletableIds }, companyId: req.companyId });

    const msg = blockedLedgers.length > 0
      ? `${result.deletedCount} ledger(s) deleted. ${blockedLedgers.length} ledger(s) skipped (have existing entries): ${blockedLedgers.slice(0, 5).join(", ")}${blockedLedgers.length > 5 ? " and more" : ""}.`
      : `${result.deletedCount} ledger(s) deleted successfully`;

    res.json({ message: msg, count: result.deletedCount, blocked: blockedLedgers });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to bulk delete ledgers" });
  }
}

// ── Merge Ledgers ───────────────────────────────────────────────────────────────
// POST /ledger/merge  { sourceIds: string[], targetId: string }
// All transactions referencing source ledgers get repointed to the target ledger.
// Source ledger records (and their bank/cash accounts) are then deleted.
export async function mergeLedgers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { sourceIds, targetId } = req.body;
  try {
    if (!Array.isArray(sourceIds) || sourceIds.length === 0 || !targetId) {
      res.status(400).json({ message: "Provide sourceIds[] and targetId" });
      return;
    }

    // Load target ledger
    const targetLedger = await Ledger.findOne({ _id: targetId, companyId: req.companyId });
    if (!targetLedger) {
      res.status(404).json({ message: "Target ledger not found" });
      return;
    }
    const targetName = targetLedger.ledgerName;
    const targetGroup = targetLedger.groupName;

    // Load source ledgers
    const sourceLedgers = await Ledger.find({ _id: { $in: sourceIds }, companyId: req.companyId });
    if (sourceLedgers.length === 0) {
      res.status(404).json({ message: "No source ledgers found" });
      return;
    }
    const sourceNames = sourceLedgers.map((l) => l.ledgerName);

    const { Types: MongoTypes } = require("mongoose");
    let companyIdFilter: any;
    try {
      companyIdFilter = { $in: [req.companyId, new MongoTypes.ObjectId(req.companyId as string)] };
    } catch {
      companyIdFilter = req.companyId;
    }

    // ── 1. Rewrite JournalEntry references ────────────────────────────────────
    // Legacy single-leg fields
    await JournalEntry.updateMany(
      { companyId: companyIdFilter, debitAccount: { $in: sourceNames } },
      { $set: { debitAccount: targetName, debitGroup: targetGroup } }
    );
    await JournalEntry.updateMany(
      { companyId: companyIdFilter, creditAccount: { $in: sourceNames } },
      { $set: { creditAccount: targetName, creditGroup: targetGroup } }
    );

    // Multi-leg items array – use arrayFilters
    for (const srcName of sourceNames) {
      await JournalEntry.updateMany(
        { companyId: companyIdFilter, "items.accountName": srcName },
        {
          $set: {
            "items.$[elem].accountName": targetName,
            "items.$[elem].groupName": targetGroup,
          },
        },
        { arrayFilters: [{ "elem.accountName": srcName }] } as any
      );
    }

    // ── 2. Rewrite BankCashEntry references ───────────────────────────────────
    for (const srcName of sourceNames) {
      await BankCashEntry.updateMany(
        { companyId: companyIdFilter, contraAccountName: { $regex: new RegExp(`^${escapeRegExp(srcName.trim())}$`, "i") } },
        { $set: { contraAccountName: targetName, contraAccountGroup: targetGroup } }
      );
    }

    // ── 3. Rewrite ImportedTransaction references ─────────────────────────────
    try {
      for (const srcName of sourceNames) {
        await ImportedTransaction.updateMany(
          { companyId: companyIdFilter, ledgerName: srcName },
          { $set: { ledgerName: targetName } }
        );
      }
    } catch {
      // ImportedTransaction may not have a ledgerName field – ignore safely
    }

    // ── 4. Transfer opening balances (sum up) ─────────────────────────────────
    let totalOpeningDr = targetLedger.openingDr || 0;
    let totalOpeningCr = targetLedger.openingCr || 0;
    for (const src of sourceLedgers) {
      totalOpeningDr += src.openingDr || 0;
      totalOpeningCr += src.openingCr || 0;
    }
    targetLedger.openingDr = totalOpeningDr;
    targetLedger.openingCr = totalOpeningCr;
    await targetLedger.save();

    // ── 5. Delete source bank/cash accounts (and move their transactions) ─────
    const sourceAccounts = await BankCashAccount.find({
      name: { $in: sourceNames.map((n) => new RegExp(`^${n}$`, "i")) },
      companyId: req.companyId,
    });
    if (sourceAccounts.length > 0) {
      const sourceAccountIds = sourceAccounts.map((a) => a._id.toString());
      const targetAccount = await BankCashAccount.findOne({
        name: { $regex: new RegExp(`^${escapeRegExp(targetName.trim())}$`, "i") },
        companyId: req.companyId,
      });

      if (targetAccount) {
        // Move entries to the target account
        await BankCashEntry.updateMany(
          { accountId: { $in: sourceAccountIds }, companyId: companyIdFilter },
          { $set: { accountId: targetAccount._id.toString() } }
        );
      } else {
        // Delete entries if no target bank/cash account exists
        await BankCashEntry.deleteMany({ accountId: { $in: sourceAccountIds }, companyId: companyIdFilter });
      }
      await BankCashAccount.deleteMany({ _id: { $in: sourceAccounts.map((a) => a._id) } });
    }

    // ── 6. Delete source ledgers ──────────────────────────────────────────────
    await Ledger.deleteMany({ _id: { $in: sourceIds }, companyId: req.companyId });

    res.json({
      message: `${sourceLedgers.length} ledger(s) merged into "${targetName}" successfully`,
      targetLedger,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to merge ledgers" });
  }
}

export async function updateBulkOpeningBalances(req: AuthenticatedRequest, res: Response): Promise<void> {
  const balances = req.body; // Array of { ledgerName, groupName, openingDr, openingCr }
  try {
    if (!Array.isArray(balances)) {
      res.status(400).json({ message: "Request body must be an array of opening balances" });
      return;
    }

    const results = [];
    for (const b of balances) {
      const { ledgerName, groupName, openingDr, openingCr } = b;
      if (!ledgerName || !groupName) continue;

      const trimmedName = ledgerName.trim().toUpperCase();
      let ledger = await Ledger.findOne({
        ledgerName: { $regex: new RegExp(`^${escapeRegExp(trimmedName)}$`, "i") },
        companyId: req.companyId
      });

      const inputDr = openingDr || 0;
      const inputCr = openingCr || 0;
      const adjusted = req.financialYear
        ? await getAdjustedOpeningBalance(
            req.companyId as string,
            req.financialYear.startDate,
            trimmedName,
            groupName,
            inputDr,
            inputCr
          )
        : { openingDr: inputDr, openingCr: inputCr };

      if (ledger) {
        ledger.ledgerName = trimmedName;
        ledger.groupName = groupName;
        ledger.openingDr = adjusted.openingDr;
        ledger.openingCr = adjusted.openingCr;
        await ledger.save();
        results.push(ledger);
      } else {
        ledger = new Ledger({
          ledgerName: trimmedName,
          groupName,
          openingDr: adjusted.openingDr,
          openingCr: adjusted.openingCr,
          companyId: req.companyId
        });
        await ledger.save();
        results.push(ledger);
      }

      await syncBankCashAccountFromLedger(ledger);
    }

    res.json({ message: "Opening balances updated successfully", count: results.length });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update bulk opening balances" });
  }
}

// ── Ledger Statement ────────────────────────────────────────────────────────────
export async function getLedgerStatement(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { name } = req.params;
  try {
    const ledgerName = decodeURIComponent(name).trim();
    const companyId = req.companyId;
    const fyStart = req.financialYear?.startDate;
    const fyEnd   = req.financialYear?.endDate;

    // Find the ledger for opening balance and group info
    const ledger = await Ledger.findOne({
      ledgerName: { $regex: new RegExp(`^${escapeRegExp(ledgerName)}$`, "i") },
      companyId
    });

    // Also check if it is a BankCashAccount (Bank/Cash)
    const bankAccount = await BankCashAccount.findOne({
      name: { $regex: new RegExp(`^${escapeRegExp(ledgerName)}$`, "i") },
      companyId
    });

    // Determine opening balance
    let openingBalance = 0;
    let groupName = ledger?.groupName ?? (bankAccount?.group ?? "Unknown");
    if (ledger) {
      openingBalance = (ledger.openingDr || 0) - (ledger.openingCr || 0);
    } else if (bankAccount) {
      openingBalance = bankAccount.openingBalance || 0;
    }

    // ── Collect all transactions ──────────────────────────────────────────────
    interface LedgerLine {
      date: string;
      accountName: string;
      particulars: string;
      voucherNo: string;
      voucherType: string;
      debit: number;
      credit: number;
    }

    const lines: LedgerLine[] = [];

    // Load all BankCashAccounts to resolve contra account names for Bank/Cash entries
    const bankAccounts = await BankCashAccount.find({ companyId });
    const bankAccountMap = new Map<string, { name: string; group: string }>();
    bankAccounts.forEach((a) => {
      bankAccountMap.set(a._id.toString(), { name: a.name, group: a.group });
    });

    // 1. Bank/Cash entries where this ledger is the ACCOUNT (bank/cash side)
    if (bankAccount) {
      const bankEntriesQuery: any = { accountId: bankAccount._id.toString(), companyId };
      if (fyStart && fyEnd) bankEntriesQuery.date = { $gte: fyStart, $lte: fyEnd };
      const bankEntries = await BankCashEntry.find(bankEntriesQuery).sort({ date: 1, createdAt: 1 });
      for (const e of bankEntries) {
        const isBank = bankAccount.group === "Bank";
        const vType = isBank
          ? (e.deposit > 0 ? "BRct" : "BPmt")
          : (e.deposit > 0 ? "CRct" : "CPmt");

        if (e.deposit > 0) {
          lines.push({
            date: e.date.slice(0, 10),
            accountName: e.contraAccountName,
            particulars: e.particulars || e.contraAccountName,
            voucherNo: "",
            voucherType: vType,
            debit: e.deposit,
            credit: 0,
          });
        }
        if (e.withdrawal > 0) {
          lines.push({
            date: e.date.slice(0, 10),
            accountName: e.contraAccountName,
            particulars: e.particulars || e.contraAccountName,
            voucherNo: "",
            voucherType: vType,
            debit: 0,
            credit: e.withdrawal,
          });
        }
      }
    }

    // 2. Bank/Cash entries where this ledger is the CONTRA ACCOUNT
    const contraQuery: any = {
      contraAccountName: { $regex: new RegExp(`^${escapeRegExp(ledgerName)}$`, "i") },
      companyId
    };
    if (fyStart && fyEnd) contraQuery.date = { $gte: fyStart, $lte: fyEnd };
    const contraEntries = await BankCashEntry.find(contraQuery).sort({ date: 1, createdAt: 1 });
    for (const e of contraEntries) {
      const accInfo = bankAccountMap.get(e.accountId);
      const isBank = accInfo?.group === "Bank";
      const vType = isBank
        ? (e.deposit > 0 ? "BRct" : "BPmt")
        : (e.deposit > 0 ? "CRct" : "CPmt");
      const bankName = accInfo?.name || "Bank/Cash";

      if (e.deposit > 0) {
        // Bank got money IN → contra ledger is credited
        lines.push({
          date: e.date.slice(0, 10),
          accountName: bankName,
          particulars: e.particulars || bankName,
          voucherNo: "",
          voucherType: vType,
          debit: 0,
          credit: e.deposit,
        });
      }
      if (e.withdrawal > 0) {
        // Bank paid OUT → contra ledger is debited
        lines.push({
          date: e.date.slice(0, 10),
          accountName: bankName,
          particulars: e.particulars || bankName,
          voucherNo: "",
          voucherType: vType,
          debit: e.withdrawal,
          credit: 0,
        });
      }
    }

    // 3. Journal entries
    const jEntriesQuery: any = {
      companyId,
      $or: [
        { debitAccount: { $regex: new RegExp(`^${escapeRegExp(ledgerName)}$`, "i") } },
        { creditAccount: { $regex: new RegExp(`^${escapeRegExp(ledgerName)}$`, "i") } },
        { "items.accountName": { $regex: new RegExp(`^${escapeRegExp(ledgerName)}$`, "i") } }
      ]
    };
    if (fyStart && fyEnd) jEntriesQuery.date = { $gte: fyStart, $lte: fyEnd };
    const journalEntries = await JournalEntry.find(jEntriesQuery).sort({ date: 1, createdAt: 1 });
    
    for (const e of journalEntries) {
      const items = e.items && e.items.length > 0 ? e.items : [
        { type: "Db", accountName: e.debitAccount, groupName: e.debitGroup, amount: e.debitAmount },
        { type: "Cr", accountName: e.creditAccount, groupName: e.creditGroup, amount: e.creditAmount }
      ];

      const matchedLegs = items.filter(
        (it: any) => it.accountName && it.accountName.toLowerCase() === ledgerName.toLowerCase()
      );

      for (const leg of matchedLegs) {
        if (leg.type === "Db") {
          const contras = items
            .filter((it: any) => it.type === "Cr")
            .map((it: any) => it.accountName);
          const contraStr = contras.length > 0 ? contras.join(", ") : "";
          lines.push({
            date: e.date.slice(0, 10),
            accountName: contraStr,
            particulars: e.narration || `By ${contraStr}`,
            voucherNo: e.voucherNo,
            voucherType: "JVou",
            debit: Number(leg.amount || 0),
            credit: 0,
          });
        } else {
          const contras = items
            .filter((it: any) => it.type === "Db")
            .map((it: any) => it.accountName);
          const contraStr = contras.length > 0 ? contras.join(", ") : "";
          lines.push({
            date: e.date.slice(0, 10),
            accountName: contraStr,
            particulars: e.narration || `To ${contraStr}`,
            voucherNo: e.voucherNo,
            voucherType: "JVou",
            debit: 0,
            credit: Number(leg.amount || 0),
          });
        }
      }
    }

    // ── Sort by date, then voucherNo ─────────────────────────────────────────
    lines.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.voucherNo.localeCompare(b.voucherNo);
    });

    // ── Compute running balance ───────────────────────────────────────────────
    let running = openingBalance;
    const rows = lines.map((l, i) => {
      running += l.debit - l.credit;
      return {
        srNo: i + 1,
        date: l.date,
        accountName: l.accountName,
        particulars: l.particulars,
        voucherNo: l.voucherNo,
        voucherType: l.voucherType,
        debit: l.debit,
        credit: l.credit,
        balance: running,
      };
    });

    res.json({
      ledgerName,
      groupName,
      openingBalance,
      closingBalance: running,
      rows,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve ledger statement" });
  }
}
