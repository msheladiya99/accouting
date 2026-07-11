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

// ── Stale-While-Revalidate helper ──────────────────────────────────────────────
// Returns cached data immediately, then silently recomputes and updates the cache
// in the background. This means the FIRST request after a cache-miss waits for
// compute, but ALL subsequent requests get instant cached responses while fresh
// data loads in the background. Accounting logic is unchanged.
async function respondWithCache<T>(
  res: Response,
  cacheKey: { companyId: string; fyId: string; report: string; extra?: string },
  compute: () => Promise<T>
): Promise<void> {
  const { companyId, fyId, report, extra = "" } = cacheKey;
  const cached = ReportCacheService.get<T>(companyId, fyId, report, extra);

  if (cached) {
    // Serve stale data immediately — user sees instant response
    res.json(cached);
    // Silently refresh in background (non-blocking — does NOT delay the response)
    setImmediate(async () => {
      try {
        const fresh = await compute();
        ReportCacheService.set(companyId, fyId, report, fresh, extra);
      } catch {
        // Ignore background refresh errors — stale data remains available
      }
    });
    return;
  }

  // Cache miss — compute synchronously (only happens once per report per server start)
  try {
    const data = await compute();
    ReportCacheService.set(companyId, fyId, report, data, extra);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: err.message || "Failed to compute report" });
  }
}

// ── GET /api/reports/trial-balance ─────────────────────────────────────────────
export async function getTrialBalance(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyId, fy } = getContext(req);
  if (!fy) { res.status(400).json({ message: "No active financial year" }); return; }

  await respondWithCache(
    res,
    { companyId, fyId: fy.id, report: "trial-balance" },
    () => computeTrialBalance(companyId, fy)
  );
}

// ── GET /api/reports/balance-sheet ─────────────────────────────────────────────
export async function getBalanceSheet(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyId, fy } = getContext(req);
  if (!fy) { res.status(400).json({ message: "No active financial year" }); return; }

  await respondWithCache(
    res,
    { companyId, fyId: fy.id, report: "balance-sheet" },
    () => computeBalanceSheet(companyId, fy)
  );
}

// ── GET /api/reports/profit-loss?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD ─────────
export async function getProfitLoss(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyId, fy } = getContext(req);
  if (!fy) { res.status(400).json({ message: "No active financial year" }); return; }

  const dateFrom = (req.query.dateFrom as string) || fy.startDate;
  const dateTo   = (req.query.dateTo   as string) || fy.endDate;
  const extra    = `${dateFrom}:${dateTo}`;

  await respondWithCache(
    res,
    { companyId, fyId: fy.id, report: "profit-loss", extra },
    () => computeProfitLoss(companyId, fy, dateFrom, dateTo)
  );
}

// ── GET /api/reports/cash-book?dateFrom=...&dateTo=... ─────────────────────────
export async function getCashBook(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyId, fy } = getContext(req);
  if (!fy) { res.status(400).json({ message: "No active financial year" }); return; }

  const dateFrom = (req.query.dateFrom as string) || fy.startDate;
  const dateTo   = (req.query.dateTo   as string) || fy.endDate;
  const extra    = `cash:${dateFrom}:${dateTo}`;

  await respondWithCache(
    res,
    { companyId, fyId: fy.id, report: "book", extra },
    () => computeBookReport(companyId, fy, "Cash", dateFrom, dateTo)
  );
}

// ── GET /api/reports/bank-book?dateFrom=...&dateTo=... ─────────────────────────
export async function getBankBook(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyId, fy } = getContext(req);
  if (!fy) { res.status(400).json({ message: "No active financial year" }); return; }

  const dateFrom = (req.query.dateFrom as string) || fy.startDate;
  const dateTo   = (req.query.dateTo   as string) || fy.endDate;
  const extra    = `bank:${dateFrom}:${dateTo}`;

  await respondWithCache(
    res,
    { companyId, fyId: fy.id, report: "book", extra },
    () => computeBookReport(companyId, fy, "Bank", dateFrom, dateTo)
  );
}

// ── GET /api/reports/dashboard ─────────────────────────────────────────────────
export async function getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { companyId, fy } = getContext(req);
  if (!fy) { res.status(400).json({ message: "No active financial year" }); return; }

  await respondWithCache(
    res,
    { companyId, fyId: fy.id, report: "dashboard" },
    () => computeDashboard(companyId, fy)
  );
}
