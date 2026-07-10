import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import {
  computeTrialBalance,
  computeBalanceSheet,
  computeProfitLoss,
  computeBookReport,
  computeDashboard,
} from "../services/accounting/AccountingEngine";
import { ReportCacheService } from "../services/accounting/ReportCacheService";

// ── Helper: extract companyId and fy from request ──────────────────────────────
function getContext(req: AuthenticatedRequest) {
  const companyId = req.companyId as string;
  const fy = req.financialYear;
  return { companyId, fy };
}

// ── GET /api/reports/trial-balance ─────────────────────────────────────────────
export async function getTrialBalance(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyId, fy } = getContext(req);
  if (!fy) { res.status(400).json({ message: "No active financial year" }); return; }

  const cached = ReportCacheService.get<any>(companyId, fy.id, "trial-balance");
  if (cached) { res.json(cached); return; }

  try {
    const data = await computeTrialBalance(companyId, fy);
    ReportCacheService.set(companyId, fy.id, "trial-balance", data);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to compute trial balance" });
  }
}

// ── GET /api/reports/balance-sheet ─────────────────────────────────────────────
export async function getBalanceSheet(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyId, fy } = getContext(req);
  if (!fy) { res.status(400).json({ message: "No active financial year" }); return; }

  const cached = ReportCacheService.get<any>(companyId, fy.id, "balance-sheet");
  if (cached) { res.json(cached); return; }

  try {
    const data = await computeBalanceSheet(companyId, fy);
    ReportCacheService.set(companyId, fy.id, "balance-sheet", data);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to compute balance sheet" });
  }
}

// ── GET /api/reports/profit-loss?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD ─────────
export async function getProfitLoss(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyId, fy } = getContext(req);
  if (!fy) { res.status(400).json({ message: "No active financial year" }); return; }

  const dateFrom = (req.query.dateFrom as string) || fy.startDate;
  const dateTo   = (req.query.dateTo   as string) || fy.endDate;

  const cacheKey = `${dateFrom}:${dateTo}`;
  const cached = ReportCacheService.get<any>(companyId, fy.id, "profit-loss", cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const data = await computeProfitLoss(companyId, fy, dateFrom, dateTo);
    ReportCacheService.set(companyId, fy.id, "profit-loss", data, cacheKey);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to compute P&L" });
  }
}

// ── GET /api/reports/cash-book?dateFrom=...&dateTo=... ─────────────────────────
export async function getCashBook(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyId, fy } = getContext(req);
  if (!fy) { res.status(400).json({ message: "No active financial year" }); return; }

  const dateFrom = (req.query.dateFrom as string) || fy.startDate;
  const dateTo   = (req.query.dateTo   as string) || fy.endDate;
  const cacheKey = `cash:${dateFrom}:${dateTo}`;
  const cached = ReportCacheService.get<any>(companyId, fy.id, "book", cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const data = await computeBookReport(companyId, fy, "Cash", dateFrom, dateTo);
    ReportCacheService.set(companyId, fy.id, "book", data, cacheKey);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to compute cash book" });
  }
}

// ── GET /api/reports/bank-book?dateFrom=...&dateTo=... ─────────────────────────
export async function getBankBook(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyId, fy } = getContext(req);
  if (!fy) { res.status(400).json({ message: "No active financial year" }); return; }

  const dateFrom = (req.query.dateFrom as string) || fy.startDate;
  const dateTo   = (req.query.dateTo   as string) || fy.endDate;
  const cacheKey = `bank:${dateFrom}:${dateTo}`;
  const cached = ReportCacheService.get<any>(companyId, fy.id, "book", cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const data = await computeBookReport(companyId, fy, "Bank", dateFrom, dateTo);
    ReportCacheService.set(companyId, fy.id, "book", data, cacheKey);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to compute bank book" });
  }
}

// ── GET /api/reports/dashboard ─────────────────────────────────────────────────
export async function getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyId, fy } = getContext(req);
  if (!fy) { res.status(400).json({ message: "No active financial year" }); return; }

  const cached = ReportCacheService.get<any>(companyId, fy.id, "dashboard");
  if (cached) { res.json(cached); return; }

  try {
    const data = await computeDashboard(companyId, fy);
    ReportCacheService.set(companyId, fy.id, "dashboard", data);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to compute dashboard" });
  }
}
