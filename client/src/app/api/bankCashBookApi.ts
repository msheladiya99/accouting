import axiosClient from "./axiosClient";

export const ACCOUNT_GROUPS = ["Bank", "Cash"] as const;
export type AccountGroup = typeof ACCOUNT_GROUPS[number];

export const CONTRA_GROUPS = [
  "Assets", "Liabilities", "Capital", "Income", "Expense",
  "Bank", "Cash", "Purchases", "Sales", "Sundry Debtors", "Sundry Creditors",
] as const;
export type ContraGroup = typeof CONTRA_GROUPS[number];

// ── Accounts ──────────────────────────────────────────────────────────────────
export interface BankCashAccount {
  _id: string;
  name: string;
  group: AccountGroup;
  openingBalance: number;
}

// ── Entry (stored) ────────────────────────────────────────────────────────────
export interface BankCashEntry {
  _id: string;
  accountId: string;
  date: string;           // "YYYY-MM-DD"
  particulars: string;
  withdrawal: number;
  deposit: number;
  contraAccountName: string;
  contraAccountGroup: ContraGroup;
  createdAt: string;
  isChanged?: boolean;
}

// ── Entry with computed fields (display) ──────────────────────────────────────
export interface BankCashRow extends BankCashEntry {
  srNo: number;
  balance: number;
  accountName: string;
  accountGroup: AccountGroup;
}

export interface EntryPayload {
  accountId: string;
  date: string;
  particulars: string;
  withdrawal: number;
  deposit: number;
  contraAccountName: string;
  contraAccountGroup: ContraGroup;
}

// ── Helper: compute running balance for a set of entries under one account ────
export function computeRows(
  account: BankCashAccount,
  accountEntries: BankCashEntry[],
): BankCashRow[] {
  const sorted = [...accountEntries].sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : a.createdAt.localeCompare(b.createdAt),
  );
  let running = account.openingBalance;
  return sorted.map((e, i) => {
    running = running + e.deposit - e.withdrawal;
    return {
      ...e,
      srNo: i + 1,
      balance: running,
      accountName: account.name,
      accountGroup: account.group,
    };
  });
}

// ── API functions ─────────────────────────────────────────────────────────────
export async function getAllAccounts(): Promise<BankCashAccount[]> {
  const res = await axiosClient.get<BankCashAccount[]>("/bank-cash-book/accounts");
  return res.data;
}

export async function getEntriesForAccount(accountId: string): Promise<BankCashRow[]> {
  const res = await axiosClient.get<BankCashRow[]>(`/bank-cash-book/entries?accountId=${accountId}`);
  return res.data;
}

export async function getAllEntries(): Promise<BankCashRow[]> {
  const res = await axiosClient.get<BankCashRow[]>("/bank-cash-book/entries");
  return res.data;
}

export async function createEntry(payload: EntryPayload): Promise<void> {
  await axiosClient.post("/bank-cash-book/entries", payload);
}

export async function updateEntry(id: string, payload: Partial<EntryPayload>): Promise<void> {
  await axiosClient.put(`/bank-cash-book/entries/${id}`, payload);
}

export async function deleteEntry(id: string): Promise<void> {
  await axiosClient.delete(`/bank-cash-book/entries/${id}`);
}

export async function bulkDeleteEntries(ids: string[]): Promise<void> {
  await axiosClient.post("/bank-cash-book/entries/bulk-delete", { ids });
}


export async function createAccount(payload: { name: string; group: "Bank" | "Cash"; openingBalance?: number }): Promise<BankCashAccount> {
  const res = await axiosClient.post<BankCashAccount>("/bank-cash-book/accounts", payload);
  return res.data;
}

export async function updateAccount(
  id: string,
  payload: { name?: string; group?: string; openingBalance?: number },
): Promise<BankCashAccount> {
  const res = await axiosClient.put<BankCashAccount>(`/bank-cash-book/accounts/${id}`, payload);
  return res.data;
}

export async function clearEntriesForAccount(accountId: string): Promise<{ deletedCount: number; message: string }> {
  const res = await axiosClient.delete<{ deletedCount: number; message: string }>(`/bank-cash-book/accounts/${accountId}/entries`);
  return res.data;
}

export async function deleteAccount(accountId: string): Promise<void> {
  await axiosClient.delete(`/bank-cash-book/accounts/${accountId}`);
}
