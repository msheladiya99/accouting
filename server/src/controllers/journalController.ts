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
    status
  } = req.body;

  try {
    if (debitAccount && creditAccount && debitAccount.trim().toLowerCase() === creditAccount.trim().toLowerCase()) {
      res.status(400).json({ message: "Debit and Credit accounts must be different" });
      return;
    }

    if (Math.abs(debitAmount - creditAmount) > 0.001) {
      res.status(400).json({ message: "Debit amount must equal credit amount" });
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

    const voucherNo = await getNextVoucherNo(req);
    const entry = new JournalEntry({
      voucherNo,
      date,
      narration,
      debitAccount: debitAccount ? debitAccount.trim().toUpperCase() : "",
      debitGroup,
      debitAmount,
      creditAccount: creditAccount ? creditAccount.trim().toUpperCase() : "",
      creditGroup,
      creditAmount,
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
    status
  } = req.body;

  try {
    if (debitAmount !== undefined && creditAmount !== undefined && Math.abs(debitAmount - creditAmount) > 0.001) {
      res.status(400).json({ message: "Debit amount must equal credit amount" });
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

    const entry = await JournalEntry.findOne({ _id: id, companyId: req.companyId });
    if (!entry) {
      res.status(404).json({ message: "Journal entry not found" });
      return;
    }

    const nextDebit = debitAccount !== undefined ? debitAccount : entry.debitAccount;
    const nextCredit = creditAccount !== undefined ? creditAccount : entry.creditAccount;
    if (nextDebit && nextCredit && nextDebit.trim().toLowerCase() === nextCredit.trim().toLowerCase()) {
      res.status(400).json({ message: "Debit and Credit accounts must be different" });
      return;
    }

    if (date) entry.date = date;
    if (narration !== undefined) entry.narration = narration;
    if (debitAccount) entry.debitAccount = debitAccount.trim().toUpperCase();
    if (debitGroup) entry.debitGroup = debitGroup;
    if (debitAmount !== undefined) entry.debitAmount = debitAmount;
    if (creditAccount) entry.creditAccount = creditAccount.trim().toUpperCase();
    if (creditGroup) entry.creditGroup = creditGroup;
    if (creditAmount !== undefined) entry.creditAmount = creditAmount;
    if (status) entry.status = status;

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
