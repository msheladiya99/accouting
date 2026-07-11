/**
 * useReportQueries.ts
 *
 * Typed React Query hooks for every ERP report.
 * All hooks use stale-while-revalidate — cached data is shown instantly
 * while fresh data loads silently in the background.
 *
 * Accounting logic is entirely on the server. These hooks are pure transport.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../api/queryClient";
import {
  fetchTrialBalance,
  fetchBalanceSheet,
  fetchProfitLoss,
  fetchDashboard,
  getCashBook,
  getBankBook,
} from "../api/reportsApi";
import {
  getAllLedgers,
  getLedgerStatement,
  getAllLedgers as getAllLedgersRaw,
} from "../api/ledgerApi";
import { getAllGroups } from "../api/accountGroupApi";
import { getAllJournalEntries } from "../api/journalVoucherApi";
import { getAllEntries, getAllAccounts } from "../api/bankCashBookApi";
import { useApp } from "../context/AppContext";

// ── Report hooks ───────────────────────────────────────────────────────────────

export function useTrialBalance() {
  const { selectedFY } = useApp();
  return useQuery({
    queryKey: [...QUERY_KEYS.trialBalance, selectedFY?._id],
    queryFn:  fetchTrialBalance,
    enabled:  !!selectedFY,
  });
}

export function useBalanceSheet() {
  const { selectedFY } = useApp();
  return useQuery({
    queryKey: [...QUERY_KEYS.balanceSheet, selectedFY?._id],
    queryFn:  fetchBalanceSheet,
    enabled:  !!selectedFY,
  });
}

export function useProfitLoss(dateFrom: string, dateTo: string) {
  const { selectedFY } = useApp();
  return useQuery({
    queryKey: QUERY_KEYS.profitLoss(dateFrom, dateTo),
    queryFn:  () => fetchProfitLoss(dateFrom, dateTo),
    enabled:  !!selectedFY && !!dateFrom && !!dateTo,
  });
}

export function useDashboard() {
  const { selectedFY } = useApp();
  return useQuery({
    queryKey: [...QUERY_KEYS.dashboard, selectedFY?._id],
    queryFn:  fetchDashboard,
    enabled:  !!selectedFY,
  });
}

export function useCashBook(dateFrom: string, dateTo: string) {
  const { selectedFY } = useApp();
  return useQuery({
    queryKey: QUERY_KEYS.cashBook(dateFrom, dateTo),
    queryFn:  () => getCashBook(dateFrom, dateTo),
    enabled:  !!selectedFY && !!dateFrom && !!dateTo,
  });
}

export function useBankBook(dateFrom: string, dateTo: string) {
  const { selectedFY } = useApp();
  return useQuery({
    queryKey: QUERY_KEYS.bankBook(dateFrom, dateTo),
    queryFn:  () => getBankBook(dateFrom, dateTo),
    enabled:  !!selectedFY && !!dateFrom && !!dateTo,
  });
}

// ── Master data hooks ──────────────────────────────────────────────────────────

/** Ledger list WITH prior-year opening balance computation (for Opening Balances page). */
export function useLedgers() {
  const { selectedFY } = useApp();
  return useQuery({
    queryKey: [...QUERY_KEYS.ledgers, selectedFY?._id],
    queryFn:  getAllLedgers,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Ledger list WITHOUT prior-year computation — raw DB records.
 * Used for LedgerMaster list view (6x faster than useLedgers).
 */
export function useLedgersRaw() {
  return useQuery({
    queryKey: QUERY_KEYS.ledgersRaw,
    queryFn:  () => getAllLedgersRaw({ raw: true }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useGroups() {
  return useQuery({
    queryKey: QUERY_KEYS.groups,
    queryFn:  getAllGroups,
    staleTime: 10 * 60 * 1000,
  });
}

export function useLedgerStatement(ledgerName: string) {
  const { selectedFY } = useApp();
  return useQuery({
    queryKey: [...QUERY_KEYS.ledgerStmt(ledgerName), selectedFY?._id],
    queryFn:  () => getLedgerStatement(ledgerName),
    enabled:  !!ledgerName && !!selectedFY,
  });
}

export function useJournalEntries() {
  const { selectedFY } = useApp();
  return useQuery({
    queryKey: [...QUERY_KEYS.journalEntries, selectedFY?._id],
    queryFn:  getAllJournalEntries,
    staleTime: 2 * 60 * 1000,
  });
}

export function useBankEntries() {
  const { selectedFY } = useApp();
  return useQuery({
    queryKey: [...QUERY_KEYS.bankEntries, selectedFY?._id],
    queryFn:  getAllEntries,
    staleTime: 2 * 60 * 1000,
  });
}

export function useBankAccounts() {
  return useQuery({
    queryKey: QUERY_KEYS.bankAccounts,
    queryFn:  getAllAccounts,
    staleTime: 10 * 60 * 1000,
  });
}

// ── Prefetch helpers ───────────────────────────────────────────────────────────

/**
 * Prefetches a report query on sidebar link hover so it's ready before navigation.
 * Usage: onMouseEnter={() => prefetchReport('balance-sheet')}
 */
export function usePrefetch() {
  const qc = useQueryClient();
  const { selectedFY } = useApp();

  return {
    prefetchBalanceSheet: () => {
      if (!selectedFY) return;
      qc.prefetchQuery({
        queryKey: [...QUERY_KEYS.balanceSheet, selectedFY._id],
        queryFn:  fetchBalanceSheet,
        staleTime: 5 * 60 * 1000,
      });
    },
    prefetchTrialBalance: () => {
      if (!selectedFY) return;
      qc.prefetchQuery({
        queryKey: [...QUERY_KEYS.trialBalance, selectedFY._id],
        queryFn:  fetchTrialBalance,
        staleTime: 5 * 60 * 1000,
      });
    },
    prefetchDashboard: () => {
      if (!selectedFY) return;
      qc.prefetchQuery({
        queryKey: [...QUERY_KEYS.dashboard, selectedFY._id],
        queryFn:  fetchDashboard,
        staleTime: 5 * 60 * 1000,
      });
    },
  };
}
