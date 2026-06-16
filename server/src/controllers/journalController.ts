import { Response } from "express";
import { JournalEntry } from "../models/JournalEntry";
import { AuthenticatedRequest } from "../middleware/auth";

async function getNextVoucherNo(req: AuthenticatedRequest): Promise<string> {
  const query: any = { companyId: req.companyId };
  if (req.financialYear) {
    query.date = { $gte: req.financialYear.startDate, $lte: req.financialYear.endDate };
  }
  const entries = await JournalEntry.find(query);
  const nums = entries
    .map((e) => parseInt(e.voucherNo.split("-").pop() ?? "0", 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;

  let yearPrefix = "2026";
  if (req.financialYear) {
    const match = req.financialYear.label.match(/\d{4}/);
    if (match) yearPrefix = match[0];
  }
  return `JV-${yearPrefix}-${String(max + 1).padStart(4, "0")}`;
}

export async function getAllJournalEntries(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const query: any = { companyId: req.companyId };
    if (req.financialYear) {
      query.date = { $gte: req.financialYear.startDate, $lte: req.financialYear.endDate };
    }
    const entries = await JournalEntry.find(query).sort({ createdAt: -1 });
    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve journal entries" });
  }
}

export async function createJournalEntry(req: AuthenticatedRequest, res: Response): Promise<void> {
  const {
    date,
    narration,
    debitAccount,
    debitGroup,
    debitAmount,
    creditAccount,
    creditGroup,
    creditAmount,
    items,
    status
  } = req.body;

  try {
    let finalItems = items;
    if (!finalItems || finalItems.length === 0) {
      if (debitAccount && creditAccount) {
        finalItems = [
          { type: "Db", accountName: debitAccount, groupName: debitGroup, amount: debitAmount },
          { type: "Cr", accountName: creditAccount, groupName: creditGroup, amount: creditAmount }
        ];
      }
    }

    if (!finalItems || finalItems.length === 0) {
      res.status(400).json({ message: "Journal entry must have at least one transaction leg" });
      return;
    }

    // Validate debit vs credit sums
    let totalDb = 0;
    let totalCr = 0;
    for (const it of finalItems) {
      if (it.type === "Db") totalDb += Number(it.amount || 0);
      else if (it.type === "Cr") totalCr += Number(it.amount || 0);
    }

    if (Math.abs(totalDb - totalCr) > 0.001) {
      res.status(400).json({ message: `Debit amount (${totalDb.toFixed(2)}) must equal credit amount (${totalCr.toFixed(2)})` });
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

    const firstDb = finalItems.find((it: any) => it.type === "Db");
    const firstCr = finalItems.find((it: any) => it.type === "Cr");

    const voucherNo = await getNextVoucherNo(req);
    const entry = new JournalEntry({
      voucherNo,
      date,
      narration,
      items: finalItems.map((it: any) => ({
        type: it.type,
        accountName: it.accountName ? it.accountName.trim().toUpperCase() : "",
        groupName: it.groupName,
        amount: Number(it.amount || 0)
      })),
      debitAccount: firstDb ? firstDb.accountName.trim().toUpperCase() : "",
      debitGroup: firstDb ? firstDb.groupName : "",
      debitAmount: firstDb ? Number(firstDb.amount || 0) : 0,
      creditAccount: firstCr ? firstCr.accountName.trim().toUpperCase() : "",
      creditGroup: firstCr ? firstCr.groupName : "",
      creditAmount: firstCr ? Number(firstCr.amount || 0) : 0,
      status: status || "Draft",
      companyId: req.companyId
    });

    await entry.save();
    res.status(201).json(entry);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create journal entry" });
  }
}

export async function updateJournalEntry(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const {
    date,
    narration,
    debitAccount,
    debitGroup,
    debitAmount,
    creditAccount,
    creditGroup,
    creditAmount,
    items,
    status
  } = req.body;

  try {
    const entry = await JournalEntry.findOne({ _id: id, companyId: req.companyId });
    if (!entry) {
      res.status(404).json({ message: "Journal entry not found" });
      return;
    }

    // Validate debit vs credit sums
    const nextItems = items !== undefined ? items : entry.items;
    let totalDb = 0;
    let totalCr = 0;
    if (nextItems && nextItems.length > 0) {
      for (const it of nextItems) {
        if (it.type === "Db") totalDb += Number(it.amount || 0);
        else if (it.type === "Cr") totalCr += Number(it.amount || 0);
      }
    } else {
      const nextDebitAmount = debitAmount !== undefined ? debitAmount : entry.debitAmount;
      const nextCreditAmount = creditAmount !== undefined ? creditAmount : entry.creditAmount;
      totalDb = Number(nextDebitAmount || 0);
      totalCr = Number(nextCreditAmount || 0);
    }

    if (Math.abs(totalDb - totalCr) > 0.001) {
      res.status(400).json({ message: `Debit amount (${totalDb.toFixed(2)}) must equal credit amount (${totalCr.toFixed(2)})` });
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

    if (date) entry.date = date;
    if (narration !== undefined) entry.narration = narration;
    if (status) entry.status = status;

    if (items !== undefined) {
      entry.items = items.map((it: any) => ({
        type: it.type,
        accountName: it.accountName ? it.accountName.trim().toUpperCase() : "",
        groupName: it.groupName,
        amount: Number(it.amount || 0)
      }));
      // Populate compatibility fields
      const firstDb = items.find((it: any) => it.type === "Db");
      const firstCr = items.find((it: any) => it.type === "Cr");
      entry.debitAccount = firstDb ? firstDb.accountName.trim().toUpperCase() : "";
      entry.debitGroup = firstDb ? firstDb.groupName : "";
      entry.debitAmount = firstDb ? Number(firstDb.amount || 0) : 0;
      entry.creditAccount = firstCr ? firstCr.accountName.trim().toUpperCase() : "";
      entry.creditGroup = firstCr ? firstCr.groupName : "";
      entry.creditAmount = firstCr ? Number(firstCr.amount || 0) : 0;
    } else {
      // Old fields are updated individually
      if (debitAccount) entry.debitAccount = debitAccount.trim().toUpperCase();
      if (debitGroup) entry.debitGroup = debitGroup;
      if (debitAmount !== undefined) entry.debitAmount = debitAmount;
      if (creditAccount) entry.creditAccount = creditAccount.trim().toUpperCase();
      if (creditGroup) entry.creditGroup = creditGroup;
      if (creditAmount !== undefined) entry.creditAmount = creditAmount;

      // Sync back to items
      if (entry.items && entry.items.length > 0) {
        if (debitAccount || debitAmount !== undefined) {
          const dbIndex = entry.items.findIndex(it => it.type === "Db");
          if (dbIndex >= 0) {
            if (debitAccount) entry.items[dbIndex].accountName = debitAccount.trim().toUpperCase();
            if (debitGroup) entry.items[dbIndex].groupName = debitGroup;
            if (debitAmount !== undefined) entry.items[dbIndex].amount = debitAmount;
          }
        }
        if (creditAccount || creditAmount !== undefined) {
          const crIndex = entry.items.findIndex(it => it.type === "Cr");
          if (crIndex >= 0) {
            if (creditAccount) entry.items[crIndex].accountName = creditAccount.trim().toUpperCase();
            if (creditGroup) entry.items[crIndex].groupName = creditGroup;
            if (creditAmount !== undefined) entry.items[crIndex].amount = creditAmount;
          }
        }
      } else {
        entry.items = [
          { type: "Db", accountName: entry.debitAccount || "", groupName: entry.debitGroup || "", amount: entry.debitAmount || 0 },
          { type: "Cr", accountName: entry.creditAccount || "", groupName: entry.creditGroup || "", amount: entry.creditAmount || 0 }
        ] as any;
      }
    }

    await entry.save();
    res.json(entry);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update journal entry" });
  }
}

export async function deleteJournalEntry(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const entry = await JournalEntry.findOne({ _id: id, companyId: req.companyId });
    if (!entry) {
      res.status(404).json({ message: "Journal entry not found" });
      return;
    }

    await JournalEntry.deleteOne({ _id: id, companyId: req.companyId });
    res.json({ message: "Journal entry deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete journal entry" });
  }
}
