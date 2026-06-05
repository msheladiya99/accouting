import { getAllEntries, getAllAccounts, computeRows } from "./bankCashBookApi";
import { getAllJournalEntries } from "./journalVoucherApi";
import { computeTrialBalance } from "./trialBalanceApi";
import { computeBalanceSheet } from "./balanceSheetApi";
import { computePL } from "./plStatementApi";

export type { TrialRow, TrialSummary } from "./trialBalanceApi";
export type { BalanceSheetData }        from "./balanceSheetApi";
export type { PLData }                  from "./plStatementApi";

// ── Cash / Bank Book ───────────────────────────────────────────────────────────
export interface BookRow {
  srNo:          number;
  date:          string;
  accountName:   string;
  accountGroup:  string;
  particulars:   string;
  withdrawal:    number;
  deposit:       number;
  balance:       number;
  contraAccount: string;
  contraGroup:   string;
}

function buildBookRows(
  accounts: Awaited<ReturnType<typeof getAllAccounts>>,
  allEntries: Awaited<ReturnType<typeof getAllEntries>>,
  group: "Cash" | "Bank",
  dateFrom: string,
  dateTo: string,
): BookRow[] {
  const rows: BookRow[] = [];
  for (const acc of accounts.filter((a) => a.group === group)) {
    const acctEntries = allEntries.filter((e) => e.accountId === acc._id);
    // computeRows accepts BankCashEntry[]; BankCashRow extends it so cast is safe
    computeRows(acc, acctEntries as any)
      .filter((r) => r.date >= dateFrom && r.date <= dateTo)
      .forEach((r) => rows.push({
        srNo: 0,
        date: r.date,
        accountName: r.accountName,
        accountGroup: r.accountGroup,
        particulars: r.particulars,
        withdrawal: r.withdrawal,
        deposit: r.deposit,
        balance: r.balance,
        contraAccount: r.contraAccountName,
        contraGroup: r.contraAccountGroup,
      }));
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  rows.forEach((r, i) => (r.srNo = i + 1));
  return rows;
}

export async function getCashBook(dateFrom: string, dateTo: string): Promise<BookRow[]> {
  const [accounts, allEntries] = await Promise.all([getAllAccounts(), getAllEntries()]);
  return buildBookRows(accounts, allEntries, "Cash", dateFrom, dateTo);
}

export async function getBankBook(dateFrom: string, dateTo: string): Promise<BookRow[]> {
  const [accounts, allEntries] = await Promise.all([getAllAccounts(), getAllEntries()]);
  return buildBookRows(accounts, allEntries, "Bank", dateFrom, dateTo);
}

// ── Ledger Report ──────────────────────────────────────────────────────────────
export interface LedgerRow {
  srNo:       number;
  date:       string;
  source:     string;
  ref:        string;
  particulars: string;
  debit:      number;
  credit:     number;
  balance:    number;
}

export interface LedgerReportResult {
  ledgerName:     string;
  openingBalance: number;
  rows:           LedgerRow[];
  closingBalance: number;
  totalDebit:     number;
  totalCredit:    number;
}

export async function getLedgerReport(
  ledgerName: string,
  dateFrom: string,
  dateTo: string,
): Promise<LedgerReportResult> {
  const [bankEntries, journalEntries] = await Promise.all([
    getAllEntries(),
    getAllJournalEntries(),
  ]);

  // Compute opening balance = net of all transactions BEFORE dateFrom
  let openingBalance = 0;

  // From opening balances (hardcoded in trialBalanceApi — derive via trial balance)
  const { rows: tbRows } = await computeTrialBalance();
  const tbRow = tbRows.find((r) => r.ledgerName === ledgerName);
  if (tbRow) {
    openingBalance = tbRow.openingDr - tbRow.openingCr;
  }

  // Transactions before dateFrom from bank entries
  for (const e of bankEntries) {
    if (e.date >= dateFrom) continue;
    if (e.accountName === ledgerName) openingBalance += e.deposit - e.withdrawal;
    if (e.contraAccountName === ledgerName) openingBalance += e.withdrawal - e.deposit;
  }
  // Transactions before dateFrom from journal entries
  for (const e of journalEntries) {
    if (e.date >= dateFrom) continue;
    if (e.debitAccount  === ledgerName) openingBalance += e.debitAmount;
    if (e.creditAccount === ledgerName) openingBalance -= e.creditAmount;
  }

  // Now build ledger rows within date range
  const rawRows: { date: string; createdAt: string; source: string; ref: string; particulars: string; debit: number; credit: number }[] = [];

  for (const e of bankEntries) {
    if (e.date < dateFrom || e.date > dateTo) continue;
    if (e.accountName === ledgerName) {
      rawRows.push({ date: e.date, createdAt: e.createdAt, source: "Bank/Cash Book", ref: e._id, particulars: `${e.particulars} (${e.contraAccountName})`, debit: e.deposit, credit: e.withdrawal });
    } else if (e.contraAccountName === ledgerName) {
      rawRows.push({ date: e.date, createdAt: e.createdAt, source: "Bank/Cash Book", ref: e._id, particulars: `${e.particulars} (${e.accountName})`, debit: e.withdrawal, credit: e.deposit });
    }
  }
  for (const e of journalEntries) {
    if (e.date < dateFrom || e.date > dateTo) continue;
    if (e.debitAccount === ledgerName) {
      rawRows.push({ date: e.date, createdAt: e.createdAt, source: "Journal", ref: e.voucherNo, particulars: `${e.narration} (${e.creditAccount})`, debit: e.debitAmount, credit: 0 });
    } else if (e.creditAccount === ledgerName) {
      rawRows.push({ date: e.date, createdAt: e.createdAt, source: "Journal", ref: e.voucherNo, particulars: `${e.narration} (${e.debitAccount})`, debit: 0, credit: e.creditAmount });
    }
  }

  rawRows.sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.createdAt.localeCompare(b.createdAt));

  let running = openingBalance;
  const rows: LedgerRow[] = rawRows.map((r, i) => {
    running += r.debit - r.credit;
    return { srNo: i + 1, date: r.date, source: r.source, ref: r.ref, particulars: r.particulars, debit: r.debit, credit: r.credit, balance: running };
  });

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  return { ledgerName, openingBalance, rows, closingBalance: running, totalDebit, totalCredit };
}

// ── Day Book ───────────────────────────────────────────────────────────────────
export interface DayBookRow {
  srNo:      number;
  date:      string;
  source:    string;
  ref:       string;
  particulars: string;
  drAccount: string;
  drGroup:   string;
  crAccount: string;
  crGroup:   string;
  amount:    number;
}

export async function getDayBook(
  dateFrom: string,
  dateTo: string,
  groupFilter?: string,
): Promise<DayBookRow[]> {
  const [bankEntries, journalEntries] = await Promise.all([
    getAllEntries(),
    getAllJournalEntries(),
  ]);

  const raw: { date: string; createdAt: string; source: string; ref: string; particulars: string; drAccount: string; drGroup: string; crAccount: string; crGroup: string; amount: number }[] = [];

  for (const e of bankEntries) {
    if (e.date < dateFrom || e.date > dateTo) continue;
    const drAccount = e.deposit > 0 ? e.accountName      : e.contraAccountName;
    const drGroup   = e.deposit > 0 ? e.accountGroup     : e.contraAccountGroup;
    const crAccount = e.deposit > 0 ? e.contraAccountName: e.accountName;
    const crGroup   = e.deposit > 0 ? e.contraAccountGroup: e.accountGroup;
    const amount    = e.deposit > 0 ? e.deposit : e.withdrawal;

    if (groupFilter && groupFilter !== "All" && drGroup !== groupFilter && crGroup !== groupFilter) continue;

    raw.push({ date: e.date, createdAt: e.createdAt, source: "Bank/Cash", ref: e._id, particulars: e.particulars, drAccount, drGroup, crAccount, crGroup, amount });
  }

  for (const e of journalEntries) {
    if (e.date < dateFrom || e.date > dateTo) continue;
    if (groupFilter && groupFilter !== "All" && e.debitGroup !== groupFilter && e.creditGroup !== groupFilter) continue;
    raw.push({ date: e.date, createdAt: e.createdAt, source: "Journal", ref: e.voucherNo, particulars: e.narration, drAccount: e.debitAccount, drGroup: e.debitGroup, crAccount: e.creditAccount, crGroup: e.creditGroup, amount: e.debitAmount });
  }

  raw.sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.createdAt.localeCompare(b.createdAt));

  return raw.map((r, i) => ({ srNo: i + 1, ...r }));
}

// ── All ledger names (for dropdown) ───────────────────────────────────────────
export async function getAllLedgerNames(): Promise<string[]> {
  const [bankEntries, journalEntries] = await Promise.all([
    getAllEntries(),
    getAllJournalEntries(),
  ]);
  const names = new Set<string>();
  for (const e of bankEntries) { names.add(e.accountName); names.add(e.contraAccountName); }
  for (const e of journalEntries) { names.add(e.debitAccount); names.add(e.creditAccount); }
  return [...names].sort();
}

// Re-export existing compute functions for use in Reports page
export { computeTrialBalance, computeBalanceSheet, computePL };
