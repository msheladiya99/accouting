import { getAllLedgers } from "./ledgerApi";
import { getAllAccounts, getAllEntries } from "./bankCashBookApi";
import { getAllJournalEntries } from "./journalVoucherApi";
import { getAllGroups } from "./accountGroupApi";

export interface AccountingRawData {
  ledgers: any[];
  bankAccounts: any[];
  bankEntries: any[];
  journalEntries: any[];
  groups: any[];
}

let cachedFYId: string | null = null;
let cachedRawData: AccountingRawData | null = null;

export function invalidateCache() {
  cachedFYId = null;
  cachedRawData = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("accounting-data-updated", () => {
    invalidateCache();
  });
}

export async function fetchAccountingRawData(fyId: string, force = false): Promise<AccountingRawData> {
  if (!force && cachedFYId === fyId && cachedRawData) {
    return cachedRawData;
  }

  const [ledgers, bankAccounts, bankEntries, journalEntries, groups] = await Promise.all([
    getAllLedgers(),
    getAllAccounts(),
    getAllEntries(),
    getAllJournalEntries(),
    getAllGroups()
  ]);

  cachedFYId = fyId;
  cachedRawData = { ledgers, bankAccounts, bankEntries, journalEntries, groups };
  return cachedRawData;
}
