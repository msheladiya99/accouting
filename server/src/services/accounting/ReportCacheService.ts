import NodeCache from "node-cache";

// TTL: 24 hours. Cache is invalidated on mutation, not by timer.
// On server restart the cache warms up on first request per report.
const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600, useClones: false });

// ── Key builder ────────────────────────────────────────────────────────────────
function makeKey(companyId: string, fyId: string, report: string, extra = ""): string {
  return `${companyId}:${fyId}:${report}${extra ? ":" + extra : ""}`;
}

// ── Public API ─────────────────────────────────────────────────────────────────
export const ReportCacheService = {
  get<T>(companyId: string, fyId: string, report: string, extra = ""): T | undefined {
    return cache.get<T>(makeKey(companyId, fyId, report, extra));
  },

  set<T>(companyId: string, fyId: string, report: string, data: T, extra = ""): void {
    cache.set(makeKey(companyId, fyId, report, extra), data);
  },

  /** Invalidate ALL cached reports for a company+FY (call after any voucher mutation). */
  invalidate(companyId: string, fyId: string): void {
    const prefix = `${companyId}:${fyId}:`;
    const keys = cache.keys().filter((k) => k.startsWith(prefix) && !k.includes(":prior-openings"));
    if (keys.length > 0) cache.del(keys);
  },

  /** Invalidate across ALL financial years for a company (e.g. opening balance change). */
  invalidateCompany(companyId: string): void {
    const keys = cache.keys().filter((k) => k.startsWith(`${companyId}:`));
    if (keys.length > 0) cache.del(keys);
  },

  /** Warm up key reports in the background using deferred dynamic import */
  warmup(companyId: string, fy: { id: string; startDate: string; endDate: string }): void {
    setImmediate(async () => {
      try {
        const { computeTrialBalance, computeBalanceSheet, computeDashboard } = await import("./AccountingEngine");

        // 1. Warm Trial Balance (updates prior-openings cache as well)
        const tb = await computeTrialBalance(companyId, fy);
        this.set(companyId, fy.id, "trial-balance", tb);

        // 2. Warm Balance Sheet (reuses cached TB, fast)
        const bs = await computeBalanceSheet(companyId, fy);
        this.set(companyId, fy.id, "balance-sheet", bs);

        // 3. Warm Dashboard (reuses cached TB, fast)
        const db = await computeDashboard(companyId, fy);
        this.set(companyId, fy.id, "dashboard", db);
      } catch (err) {
        console.error("Background cache warming failed:", err);
      }
    });
  },

  stats() {
    return cache.getStats();
  },
};
