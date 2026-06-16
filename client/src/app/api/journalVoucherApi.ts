import axiosClient from "./axiosClient";

export interface JournalItem {
  type: "Db" | "Cr";
  accountName: string;
  groupName: string;
  amount: number;
}

export interface JournalEntry {
  _id: string;
  voucherNo: string;
  date: string;
  narration: string;
  items?: JournalItem[];
  debitAccount: string;
  debitGroup: string;
  debitAmount: number;
  creditAccount: string;
  creditGroup: string;
  creditAmount: number;
  status: "Draft" | "Posted";
  createdAt: string;
}

export interface JournalPayload {
  date: string;
  narration: string;
  items?: JournalItem[];
  debitAccount?: string;
  debitGroup?: string;
  debitAmount?: number;
  creditAccount?: string;
  creditGroup?: string;
  creditAmount?: number;
  status: "Draft" | "Posted";
}

// ── CRUD ───────────────────────────────────────────────────────────────────────
export async function getAllJournalEntries(): Promise<JournalEntry[]> {
  const res = await axiosClient.get<JournalEntry[]>("/journal-voucher");
  return res.data;
}

export async function createJournalEntry(payload: JournalPayload): Promise<JournalEntry> {
  const res = await axiosClient.post<JournalEntry>("/journal-voucher", payload);
  return res.data;
}

export async function updateJournalEntry(id: string, payload: JournalPayload): Promise<JournalEntry> {
  const res = await axiosClient.put<JournalEntry>(`/journal-voucher/${id}`, payload);
  return res.data;
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await axiosClient.delete(`/journal-voucher/${id}`);
}
