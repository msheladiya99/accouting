import { Response } from "express";
import { Ledger } from "../models/Ledger";
import { AuthenticatedRequest } from "../middleware/auth";
import { JournalEntry } from "../models/JournalEntry";
import { BankCashEntry } from "../models/BankCashEntry";
import { AccountGroup } from "../models/AccountGroup";
import { FinancialYear } from "../models/FinancialYear";
import { BankCashAccount } from "../models/BankCashAccount";
import { ImportedTransaction } from "../models/ImportedTransaction";

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

  // 5. Sum up prior transactions for all ledgers
  const ledgerMap: Record<string, { dr: number; cr: number }> = {};
  allLedgers.forEach((l) => {
    ledgerMap[l.ledgerName] = { dr: 0, cr: 0 };
  });

  priorJournalEntries.forEach((e) => {
    if (ledgerMap[e.debitAccount]) {
      ledgerMap[e.debitAccount].dr += e.debitAmount;
    }
    if (ledgerMap[e.creditAccount]) {
      ledgerMap[e.creditAccount].cr += e.creditAmount;
    }
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

export async function syncBankCashAccountFromLedger(ledger: any, oldName?: string): Promise<void> {
  const { ledgerName, groupName, openingDr, openingCr, companyId } = ledger;
  if (!ledgerName || !groupName) return;

  const isBank = /bank/i.test(groupName);

  if (isBank) {
    const group = "Bank";
    const openingBalance = (openingDr || 0) - (openingCr || 0);
    const finalName = ledgerName.trim();
    const nameToSearch = oldName ? oldName.trim() : finalName;

    let acc = await BankCashAccount.findOne({
      name: { $regex: new RegExp(`^${nameToSearch}$`, "i") },
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
      name: { $regex: new RegExp(`^${nameToSearch}$`, "i") },
      group: "Bank",
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
      ledgerName: { $regex: new RegExp(`^${trimmedName}$`, "i") },
      companyId: req.companyId
    });

    if (exists) {
      res.status(400).json({ message: "A ledger with this name already exists in this company" });
      return;
    }

    const ledger = new Ledger({
      ledgerName: trimmedName,
      groupName,
      openingDr: openingDr || 0,
      openingCr: openingCr || 0,
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
        ledgerName: { $regex: new RegExp(`^${trimmedName}$`, "i") },
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
    if (openingDr !== undefined) ledger.openingDr = openingDr;
    if (openingCr !== undefined) ledger.openingCr = openingCr;

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

    const account = await BankCashAccount.findOne({
      name: { $regex: new RegExp(`^${ledger.ledgerName.trim()}$`, "i") },
      companyId: req.companyId
    });

    if (account) {
      const { Types: MongoTypes } = require("mongoose");
      let companyIdFilter: any;
      try {
        companyIdFilter = { $in: [req.companyId, new MongoTypes.ObjectId(req.companyId as string)] };
      } catch {
        companyIdFilter = req.companyId;
      }
      await BankCashEntry.deleteMany({ accountId: account._id.toString(), companyId: companyIdFilter });
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
    const ledgerNames = ledgers.map(l => l.ledgerName.trim());

    const accounts = await BankCashAccount.find({
      name: { $in: ledgerNames.map(name => new RegExp(`^${name}$`, "i")) },
      companyId: req.companyId
    });
    const accountIds = accounts.map(a => a._id.toString());

    if (accountIds.length > 0) {
      const { Types: MongoTypes } = require("mongoose");
      let companyIdFilter: any;
      try {
        companyIdFilter = { $in: [req.companyId, new MongoTypes.ObjectId(req.companyId as string)] };
      } catch {
        companyIdFilter = req.companyId;
      }
      await BankCashEntry.deleteMany({ accountId: { $in: accountIds }, companyId: companyIdFilter });
      await BankCashAccount.deleteMany({ _id: { $in: accounts.map(a => a._id) } });
    }

    const result = await Ledger.deleteMany({ _id: { $in: ids }, companyId: req.companyId });
    res.json({ message: `${result.deletedCount} ledgers deleted successfully`, count: result.deletedCount });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to bulk delete ledgers" });
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
        ledgerName: { $regex: new RegExp(`^${trimmedName}$`, "i") },
        companyId: req.companyId
      });

      if (ledger) {
        ledger.ledgerName = trimmedName;
        ledger.groupName = groupName;
        ledger.openingDr = openingDr || 0;
        ledger.openingCr = openingCr || 0;
        await ledger.save();
        results.push(ledger);
      } else {
        ledger = new Ledger({
          ledgerName: trimmedName,
          groupName,
          openingDr: openingDr || 0,
          openingCr: openingCr || 0,
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
      ledgerName: { $regex: new RegExp(`^${ledgerName}$`, "i") },
      companyId
    });

    // Also check if it is a BankCashAccount (Bank/Cash)
    const bankAccount = await BankCashAccount.findOne({
      name: { $regex: new RegExp(`^${ledgerName}$`, "i") },
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
      contraAccountName: { $regex: new RegExp(`^${ledgerName}$`, "i") },
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

    // 3. Journal entries – debit side
    const jDebitQuery: any = {
      debitAccount: { $regex: new RegExp(`^${ledgerName}$`, "i") },
      companyId
    };
    if (fyStart && fyEnd) jDebitQuery.date = { $gte: fyStart, $lte: fyEnd };
    const jDebitEntries = await JournalEntry.find(jDebitQuery).sort({ date: 1, createdAt: 1 });
    for (const e of jDebitEntries) {
      lines.push({
        date: e.date.slice(0, 10),
        accountName: e.creditAccount,
        particulars: e.narration || `By ${e.creditAccount}`,
        voucherNo: e.voucherNo,
        voucherType: "JVou",
        debit: e.debitAmount,
        credit: 0,
      });
    }

    // 4. Journal entries – credit side
    const jCreditQuery: any = {
      creditAccount: { $regex: new RegExp(`^${ledgerName}$`, "i") },
      companyId
    };
    if (fyStart && fyEnd) jCreditQuery.date = { $gte: fyStart, $lte: fyEnd };
    const jCreditEntries = await JournalEntry.find(jCreditQuery).sort({ date: 1, createdAt: 1 });
    for (const e of jCreditEntries) {
      lines.push({
        date: e.date.slice(0, 10),
        accountName: e.debitAccount,
        particulars: e.narration || `To ${e.debitAccount}`,
        voucherNo: e.voucherNo,
        voucherType: "JVou",
        debit: 0,
        credit: e.creditAmount,
      });
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
