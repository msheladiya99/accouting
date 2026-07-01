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
let activeFetchPromise: Promise<AccountingRawData> | null = null;

export function clearAccountingDataCache() {
  cachedRawData = null;
  cachedFYId = null;
  activeFetchPromise = null;
}

export async function fetchAccountingRawData(fyId: string, force = false): Promise<AccountingRawData> {
  if (!force && cachedFYId === fyId && cachedRawData) {
    return cachedRawData;
  }

  if (activeFetchPromise && cachedFYId === fyId && !force) {
    return activeFetchPromise;
  }

  cachedFYId = fyId;
  activeFetchPromise = (async () => {
    try {
      const [ledgers, bankAccounts, bankEntries, journalEntries, groups] = await Promise.all([
        getAllLedgers(),
        getAllAccounts(),
        getAllEntries(),
        getAllJournalEntries(),
        getAllGroups()
      ]);

      const data = { ledgers, bankAccounts, bankEntries, journalEntries, groups };
      cachedRawData = data;
      return data;
    } catch (error) {
      // Clear promise and cache on failure so subsequent attempts can retry
      cachedRawData = null;
      activeFetchPromise = null;
      throw error;
    } finally {
      activeFetchPromise = null;
    }
  })();

  return activeFetchPromise;
}

if (typeof window !== "undefined") {
  window.addEventListener("accounting-data-updated", () => {
    clearAccountingDataCache();
  });
}
