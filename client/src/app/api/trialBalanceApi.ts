// ── Row shape ──────────────────────────────────────────────────────────────────
export interface TrialRow {
  ledgerName: string;
  group: string;
  openingDr:     number;
  openingCr:     number;
  transactionDr: number;
  transactionCr: number;
  closingDr:     number;  // net debit balance  (0 if credit balance)
  closingCr:     number;  // net credit balance (0 if debit balance)
}

export interface TrialSummary {
  rows: TrialRow[];
  stats: {
    openingLedgers:  number;
    bankCashEntries: number;
    journalEntries:  number;
    totalLedgers:    number;
  };
}
