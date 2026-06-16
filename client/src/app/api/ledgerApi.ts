import axiosClient from "./axiosClient";

export const LEDGER_GROUPS = [
  "Assets",
  "Liabilities",
  "Capital",
  "Income",
  "Expense",
  "Bank",
  "Cash",
  "Purchases",
  "Sales",
  "Sundry Debtors",
  "Sundry Creditors",
  "Direct Expenses",
  "Income (Trading)",
  "Purchase Account",
  "Sales Account",
  "Expense Account",
  "Financial Expenses",
  "Income (Other Then Sales)",
  "Indirect Expenses",
  "Partner Interest",
  "Partner Remuneration",
  "Advances From Customers",
  "Bank Accounts (Banks)",
  "Bank OCC a/c",
  "Capital Account",
  "Cash Ledger A/C.",
  "Cash-in-hand",
  "Current Capital Account",
  "Current Liabilities",
  "Deposits (Asset)",
  "Duties & Taxes",
  "Fixed Assets",
  "Investments",
  "Loans & Advances (Asset)",
  "Loans (Liability)",
  "Misc. Expenses (Asset)",
  "Profit & Loss A/c",
  "Provisions",
  "Reserves & Surplus",
  "Salary Expenses Payable",
  "Secured Loans",
  "Stock-in-hand",
  "Sundry Creditors - Material",
  "Sundry Creditors - Services",
  "Suspense Account",
  "Unsecured Loans"
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
