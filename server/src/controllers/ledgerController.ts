import { Response } from "express";
import { Ledger } from "../models/Ledger";
import { AuthenticatedRequest } from "../middleware/auth";

export async function getAllLedgers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ledgers = await Ledger.find({ companyId: req.companyId }).sort({ createdAt: -1 });
    res.json(ledgers);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve ledgers" });
  }
}

export async function getLedgerById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const ledger = await Ledger.findOne({ _id: id, companyId: req.companyId });
    if (!ledger) {
      res.status(404).json({ message: "Ledger not found" });
      return;
    }
    res.json(ledger);
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

    const trimmedName = ledgerName.trim();
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

    if (ledgerName) {
      const trimmedName = ledgerName.trim();
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

    await Ledger.deleteOne({ _id: id, companyId: req.companyId });
    res.json({ message: "Ledger deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete ledger" });
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

      const trimmedName = ledgerName.trim();
      let ledger = await Ledger.findOne({
        ledgerName: { $regex: new RegExp(`^${trimmedName}$`, "i") },
        companyId: req.companyId
      });

      if (ledger) {
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
    }

    res.json({ message: "Opening balances updated successfully", count: results.length });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update bulk opening balances" });
  }
}
