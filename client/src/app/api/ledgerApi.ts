import axiosClient from "./axiosClient";

export const LEDGER_GROUPS = [
  "DIRECT EXPENSES",
  "INCOME (TRADING)",
  "PURCHASE ACCOUNT",
  "SALES ACCOUNT",
  "EXPENSE ACCOUNT",
  "FINANCIAL EXPENSES",
  "INCOME",
  "INCOME (OTHER THEN SALES)",
  "INDIRECT EXPENSES",
  "PARTNER INTEREST",
  "PARTNER REMUNERATION",
  "ADVANCES FROM CUSTOMERS",
  "BANK ACCOUNTS (BANKS)",
  "BANK OCC A/C",
  "CAPITAL ACCOUNT",
  "CASH LEDGER A/C.",
  "CASH-IN-HAND",
  "CURRENT CAPITAL ACCOUNT",
  "CURRENT LIABILITIES",
  "DEPOSITS (ASSET)",
  "DUTIES & TAXES",
  "FIXED ASSETS",
  "INVESTMENTS",
  "LOANS & ADVANCES (ASSET)",
  "LOANS (LIABILITY)",
  "MISC. EXPENSES (ASSET)",
  "PROFIT & LOSS A/C",
  "PROVISIONS",
  "RESERVES & SURPLUS",
  "SALARY EXPENSES PAYABLE",
  "SECURED LOANS",
  "STOCK-IN-HAND",
  "SUNDRY CREDITORS",
  "SUNDRY CREDITORS - MATERIAL",
  "SUNDRY CREDITORS - SERVICES",
  "SUNDRY DEBTORS",
  "SUSPENSE ACCOUNT",
  "UNSECURED LOANS"
] as const;

export type LedgerGroup = typeof LEDGER_GROUPS[number];

export interface Ledger {
  _id: string;
  ledgerName: string;
  groupName: LedgerGroup;
  openingDr?: number;
  openingCr?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerPayload {
  ledgerName: string;
  groupName: LedgerGroup;
  openingDr?: number;
  openingCr?: number;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function createLedger(payload: LedgerPayload): Promise<Ledger> {
  const res = await axiosClient.post<Ledger>("/ledger", payload);
  return res.data;
}

export async function getAllLedgers(params?: { raw?: boolean }): Promise<Ledger[]> {
  const res = await axiosClient.get<Ledger[]>("/ledger", { params });
  return res.data;
}

export async function getLedgerById(id: string, params?: { raw?: boolean }): Promise<Ledger> {
  const res = await axiosClient.get<Ledger>(`/ledger/${id}`, { params });
  return res.data;
}

export async function updateLedger(id: string, payload: LedgerPayload): Promise<Ledger> {
  const res = await axiosClient.put<Ledger>(`/ledger/${id}`, payload);
  return res.data;
}

export async function deleteLedger(id: string): Promise<void> {
  await axiosClient.delete(`/ledger/${id}`);
}

export async function bulkDeleteLedgers(ids: string[]): Promise<{ message: string; count: number; blocked?: string[] }> {
  const res = await axiosClient.post<{ message: string; count: number; blocked?: string[] }>("/ledger/bulk-delete", { ids });
  return res.data;
}

export async function mergeLedgers(sourceIds: string[], targetId: string): Promise<{ message: string; targetLedger: Ledger }> {
  const res = await axiosClient.post<{ message: string; targetLedger: Ledger }>("/ledger/merge", { sourceIds, targetId });
  return res.data;
}

export async function saveBulkOpeningBalances(
  payload: Array<{ ledgerName: string; groupName: string; openingDr: number; openingCr: number }>
): Promise<{ message: string; count: number }> {
  const res = await axiosClient.post<{ message: string; count: number }>("/ledger/bulk-opening-balances", payload);
  return res.data;
}

// ── Ledger Statement ──────────────────────────────────────────────────────────

export interface LedgerStatementRow {
  srNo: number;
  date: string;
  accountName: string;
  particulars: string;
  voucherNo: string;
  voucherType: string;
  debit: number;
  credit: number;
  balance: number;
}


export interface LedgerStatement {
  ledgerName: string;
  groupName: string;
  openingBalance: number;
  closingBalance: number;
  rows: LedgerStatementRow[];
}

export async function getLedgerStatement(ledgerName: string): Promise<LedgerStatement> {
  const encoded = encodeURIComponent(ledgerName);
  const res = await axiosClient.get<LedgerStatement>(`/ledger/statement/${encoded}`);
  return res.data;
}
