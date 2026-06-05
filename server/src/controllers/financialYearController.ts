import { Response } from "express";
import { FinancialYear } from "../models/FinancialYear";
import { AuthenticatedRequest } from "../middleware/auth";

function computeStatus(startDate: string, endDate: string): "current" | "previous" | "future" | "closed" {
  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (today >= start && today <= end) return "current";
  if (today > end) return "previous";
  return "future";
}

function buildFY(baseYear: number, companyId = "default") {
  const label = `${baseYear}-${String(baseYear + 1).slice(-2)}`;
  const startDate = `${baseYear}-04-01`;
  const endDate = `${baseYear + 1}-03-31`;
  return {
    companyId,
    financialYear: label,
    label: `FY ${label}`,
    startDate,
    endDate,
    status: computeStatus(startDate, endDate)
  };
}

export async function getAllFYs(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const fys = await FinancialYear.find({ companyId: req.companyId }).sort({ startDate: -1 });
    res.json(fys);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve financial years" });
  }
}

export async function getCurrentFY(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const current = await FinancialYear.findOne({ status: "current", companyId: req.companyId });
    if (!current) {
      const anyFY = await FinancialYear.findOne({ companyId: req.companyId }).sort({ startDate: -1 });
      if (!anyFY) {
        res.status(404).json({ message: "No financial year configured" });
        return;
      }
      res.json(anyFY);
      return;
    }
    res.json(current);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve current financial year" });
  }
}

export async function getFYById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const fy = await FinancialYear.findOne({ _id: id, companyId: req.companyId });
    if (!fy) {
      res.status(404).json({ message: "Financial year not found" });
      return;
    }
    res.json(fy);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve financial year" });
  }
}

export async function generateFYs(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { baseYears } = req.body;
  try {
    if (!baseYears || !Array.isArray(baseYears)) {
      res.status(400).json({ message: "baseYears array is required" });
      return;
    }

    const cid = req.companyId as string;
    const added: any[] = [];

    for (const y of baseYears) {
      const fyData = buildFY(y, cid);
      const exists = await FinancialYear.findOne({ financialYear: fyData.financialYear, companyId: cid });
      if (!exists) {
        const fy = new FinancialYear(fyData);
        await fy.save();
        added.push(fy);
      }
    }

    res.status(201).json(added);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to generate financial years" });
  }
}

export async function closeFY(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const fy = await FinancialYear.findOne({ _id: id, companyId: req.companyId });
    if (!fy) {
      res.status(404).json({ message: "Financial year not found" });
      return;
    }

    if (fy.status === "current") {
      res.status(400).json({ message: "Cannot close the current active financial year" });
      return;
    }

    fy.status = "closed";
    await fy.save();
    res.json(fy);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to close financial year" });
  }
}

export async function deleteFY(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const fy = await FinancialYear.findOne({ _id: id, companyId: req.companyId });
    if (!fy) {
      res.status(404).json({ message: "Financial year not found" });
      return;
    }

    if (fy.status === "current") {
      res.status(400).json({ message: "Cannot delete the active financial year" });
      return;
    }

    await FinancialYear.deleteOne({ _id: id, companyId: req.companyId });
    res.json({ message: "Financial year deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete financial year" });
  }
}
