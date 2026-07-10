/**
 * reportsApi.ts — Backend-served report fetchers (replaces ALL client-side compute)
 *
 * Each function is a thin axiosClient.get() wrapper.
 * Response shapes match what the pages already use — zero component-template changes needed.
 */
import axiosClient from "./axiosClient";

// ── Re-export types so existing import sites still compile ─────────────────────
export type { TrialRow, TrialSummary }    from "./trialBalanceApi";
export type { BalanceSheetData }          from "./balanceSheetApi";
export type { PLData }                    from "./plStatementApi";

// ── Cash / Bank Book Row (kept for pages that use this type) ───────────────────
export interface BookRow {
  srNo:          number;
  date:          string;
  accountName:   string;
  accountGroup:  string;
  particulars:   string;
  withdrawal:    number;
  deposit:       number;
  balance:       number;
  contraAccount: string;
  contraGroup:   string;
}

// ── Ledger Report (kept for compatibility — modal still uses ledger/statement/:name) ──
export interface LedgerRow {
  srNo:        number;
  date:        string;
  source:      string;
  ref:         string;
  particulars: string;
  debit:       number;
  credit:      number;
  balance:     number;
}

export interface LedgerReportResult {
  ledgerName:     string;
  openingBalance: number;
  rows:           LedgerRow[];
  closingBalance: number;
  totalDebit:     number;
  totalCredit:    number;
}

// ── Day Book Row ───────────────────────────────────────────────────────────────
export interface DayBookRow {
  srNo:        number;
  date:        string;
  source:      string;
  ref:         string;
  particulars: string;
  drAccount:   string;
  drGroup:     string;
  crAccount:   string;
  crGroup:     string;
  amount:      number;
}

// ── Backend-served report fetchers ─────────────────────────────────────────────

export async function getCashBook(dateFrom?: string, dateTo?: string): Promise<BookRow[]> {
  const res = await axiosClient.get<BookRow[]>("/reports/cash-book", {
    params: { dateFrom, dateTo },
  });
  return res.data;
}

export async function getBankBook(dateFrom?: string, dateTo?: string): Promise<BookRow[]> {
  const res = await axiosClient.get<BookRow[]>("/reports/bank-book", {
    params: { dateFrom, dateTo },
  });
  return res.data;
}

export async function fetchTrialBalance() {
  const res = await axiosClient.get("/reports/trial-balance");
  return res.data;
}

export async function fetchBalanceSheet() {
  const res = await axiosClient.get("/reports/balance-sheet");
  return res.data;
}

export async function fetchProfitLoss(dateFrom: string, dateTo: string) {
  const res = await axiosClient.get("/reports/profit-loss", {
    params: { dateFrom, dateTo },
  });
  return res.data;
}

export async function fetchDashboard() {
  const res = await axiosClient.get("/reports/dashboard");
  return res.data;
}
