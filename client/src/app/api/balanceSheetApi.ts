// ── Output types ───────────────────────────────────────────────────────────────
export interface BSLedger {
  ledgerName: string;
  amount: number; // always ≥ 0; sign is determined by section
}

export interface BSGroup {
  groupKey: string;    // accounting group key
  groupName: string;   // display name
  ledgers: BSLedger[];
  total: number;
}

export interface BSSection {
  sectionName: string;
  groups: BSGroup[];
  total: number;
}

export interface BalanceSheetData {
  assetsSection: BSSection;
  liabCapSection: BSSection;
  netProfit: number;   // positive = profit, negative = loss
  totalAssets: number;
  totalLiabCap: number;
  isBalanced: boolean;
  difference: number;
  generatedAt: string;
  stats: {
    openingLedgers:  number;
    bankCashEntries: number;
    journalEntries:  number;
  };
  // Extended fields returned by the backend report endpoint
  tradingPL?: any;
  capitalAccounts?: any[];
}
