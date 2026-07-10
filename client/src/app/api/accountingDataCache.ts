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

/** Pure utility fetcher to get all raw data dumps (used for backups only). */
export async function fetchAccountingRawData(fyId: string, force = false): Promise<AccountingRawData> {
  const [ledgers, bankAccounts, bankEntries, journalEntries, groups] = await Promise.all([
    getAllLedgers(),
    getAllAccounts(),
    getAllEntries(),
    getAllJournalEntries(),
    getAllGroups()
  ]);

  return { ledgers, bankAccounts, bankEntries, journalEntries, groups };
}
