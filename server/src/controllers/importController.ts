import { Response } from "express";
import { ImportedTransaction } from "../models/ImportedTransaction";
import { AuthenticatedRequest } from "../middleware/auth";

export async function getImportedTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const query: any = { companyId: req.companyId };
    if (req.financialYear) {
      query.date = { $gte: req.financialYear.startDate, $lte: req.financialYear.endDate };
    }
    const txns = await ImportedTransaction.find(query).sort({ importedAt: -1 });
    res.json(txns);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve imported transactions" });
  }
}

export async function saveImportedTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { rows } = req.body;
  try {
    if (!rows || !Array.isArray(rows)) {
      res.status(400).json({ message: "rows array is required" });
      return;
    }

    const now = new Date();
    const prepared = rows.map((r: any) => ({
      date: r.date,
      narration: r.narration,
      withdrawal: r.withdrawal || 0,
      deposit: r.deposit || 0,
      accountName: r.aiAccountName,
      accountGroup: r.aiAccountGroup,
      importedAt: now,
      companyId: req.companyId
    }));

    const result = await ImportedTransaction.insertMany(prepared);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to save imported transactions" });
  }
}
