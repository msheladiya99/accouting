import { QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient for the entire ERP application.
 *
 * staleTime: 5 minutes — cached report data stays "fresh" for 5 min;
 *   navigating away and back shows data instantly without a network request.
 *
 * gcTime: 10 minutes — unused cache entries are garbage-collected after 10 min
 *   to prevent unbounded memory growth.
 *
 * refetchOnWindowFocus: true — when the user switches back to the ERP tab after
 *   working elsewhere, reports silently refresh in the background.
 *
 * retry: 1 — on error, retry once before showing an error state.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,       // 5 minutes
      gcTime:    10 * 60 * 1000,      // 10 minutes
      refetchOnWindowFocus: true,
      retry: 1,
      // Keep showing previous data while a background refetch is in progress
      // This prevents the "flash to empty/skeleton" on re-navigation
      placeholderData: (previousData: any) => previousData,
    },
  },
});

/** Query key constants — centralised so invalidation is consistent. */
export const QUERY_KEYS = {
  trialBalance:  ["trial-balance"]  as const,
  balanceSheet:  ["balance-sheet"]  as const,
  profitLoss:    (from: string, to: string) => ["profit-loss", from, to] as const,
  cashBook:      (from: string, to: string) => ["cash-book",   from, to] as const,
  bankBook:      (from: string, to: string) => ["bank-book",   from, to] as const,
  dashboard:     ["dashboard"]      as const,
  ledgers:       ["ledgers"]        as const,
  ledgersRaw:    ["ledgers", "raw"] as const,
  groups:        ["groups"]         as const,
  ledgerStmt:    (name: string) => ["ledger-statement", name] as const,
  journalEntries:["journal-entries"] as const,
  bankEntries:   ["bank-entries"]   as const,
  bankAccounts:  ["bank-accounts"]  as const,
};

/**
 * Invalidate all report caches at once.
 * Call this after any mutation (voucher save / delete / update).
 * React Query will silently re-fetch in the background — no full-page spinner shown.
 */
export function invalidateAllReports() {
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.trialBalance });
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.balanceSheet });
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
  // Invalidate all profit-loss variants (different date ranges)
  queryClient.invalidateQueries({ queryKey: ["profit-loss"] });
  queryClient.invalidateQueries({ queryKey: ["cash-book"] });
  queryClient.invalidateQueries({ queryKey: ["bank-book"] });
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ledgers });
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ledgersRaw });
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.journalEntries });
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.bankEntries });
  // Notify manual fetchers (like BalanceSheetPanel) to update silently
  window.dispatchEvent(new CustomEvent("accounting-data-updated"));
}
