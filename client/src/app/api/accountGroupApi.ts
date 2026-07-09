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
  "Partner Remuneration",
  "Trading Account"
] as const;

export type SuperGroup = typeof SUPER_GROUPS[number];

export type BalanceSheetSide = "Assets" | "Liabilities" | "Capital" | "Income" | "Expense";

export const SUPER_GROUP_PARENTS: Record<SuperGroup, BalanceSheetSide> = {
  "Capital Account":          "Capital",
  "Profit & Loss A/c":        "Capital",
  "Current Liabilities":      "Liabilities",
  "Loans (Liability)":        "Liabilities",
  "Fixed Assets":             "Assets",
  "Investments":              "Assets",
  "Current Assets":           "Assets",
  "Cash Ledger A/C.":         "Assets",
  "Stock-in-hand":            "Assets",
  "Suspense Account":         "Assets",
  "Misc. Expenses (Asset)":   "Assets",
  "Sales Account":            "Income",
  "Purchase Account":         "Expense",
  "Income (Trading)":         "Income",
  "Income":                   "Income",
  "Income (Other Then Sales)": "Income",
  "Expenses (Direct)":        "Expense",
  "Expense Account":          "Expense",
  "Partner Interest":         "Expense",
  "Partner Remuneration":     "Expense",
  "Trading Account":          "Income",
};

export type StatementType = "Trading A/c" | "P&L A/c" | "Balance Sheet";

/** Which financial statement each supergroup flows into */
export const SUPER_GROUP_STATEMENT: Record<SuperGroup, StatementType> = {
  // ── Trading Account (Gross profit / loss) ──────────────────────────────────
  "Sales Account":            "Trading A/c",
  "Purchase Account":         "Trading A/c",
  "Income (Trading)":         "Trading A/c",
  "Expenses (Direct)":        "Trading A/c",
  "Stock-in-hand":            "Trading A/c",
  "Trading Account":          "Trading A/c",
  // ── Profit & Loss Account (Net profit / loss) ───────────────────────────────
  "Income":                   "P&L A/c",
  "Income (Other Then Sales)": "P&L A/c",
  "Expense Account":          "P&L A/c",
  "Partner Interest":         "P&L A/c",
  "Partner Remuneration":     "P&L A/c",
  "Misc. Expenses (Asset)":   "P&L A/c",
  // ── Balance Sheet (Assets & Liabilities) ───────────────────────────────────
  "Capital Account":          "Balance Sheet",
  "Profit & Loss A/c":        "Balance Sheet",
  "Current Liabilities":      "Balance Sheet",
  "Loans (Liability)":        "Balance Sheet",
  "Fixed Assets":             "Balance Sheet",
  "Investments":              "Balance Sheet",
  "Current Assets":           "Balance Sheet",
  "Cash Ledger A/C.":         "Balance Sheet",
  "Suspense Account":         "Balance Sheet",
};

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

export async function mergeGroups(sourceIds: string[], targetId: string): Promise<{ message: string; targetGroup: AccountGroup }> {
  const res = await axiosClient.post<{ message: string; targetGroup: AccountGroup }>("/account-group/merge", { sourceIds, targetId });
  return res.data;
}

export async function updateGroup(id: string, payload: AccountGroupPayload): Promise<AccountGroup> {
  const res = await axiosClient.put<AccountGroup>(`/account-group/${id}`, payload);
  return res.data;
}

export async function deleteGroup(id: string): Promise<{ message: string }> {
  const res = await axiosClient.delete<{ message: string }>(`/account-group/${id}`);
  return res.data;
}
