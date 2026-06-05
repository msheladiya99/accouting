import axiosClient from "./axiosClient";

export const SUPER_GROUPS = [
  "Capital Account",
  "Profit & Loss A/c",
  "Current Liabilities",
  "Loans (Liability)",
  "Fixed Assets",
  "Investments",
  "Current Assets",
  "Cash Ledger A/C.",
  "Stock-in-hand",
  "Suspense Account",
  "Misc. Expenses (Asset)",
  "Sales Account",
  "Purchase Account",
  "Income (Trading)",
  "Income",
  "Income (Other Then Sales)",
  "Expenses (Direct)",
  "Expense Account",
  "Partner Interest",
  "Partner Remuneration"
] as const;

export type SuperGroup = typeof SUPER_GROUPS[number];

export interface AccountGroup {
  _id: string;
  groupName: string;
  superGroup: SuperGroup;
  createdAt: string;
  updatedAt: string;
}

export interface AccountGroupPayload {
  groupName: string;
  superGroup: SuperGroup;
}

export async function getAllGroups(): Promise<AccountGroup[]> {
  const res = await axiosClient.get<AccountGroup[]>("/account-group");
  return res.data;
}

export async function createGroup(payload: AccountGroupPayload): Promise<AccountGroup> {
  const res = await axiosClient.post<AccountGroup>("/account-group", payload);
  return res.data;
}
