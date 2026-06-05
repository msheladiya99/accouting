import { getAllEntries } from "./bankCashBookApi";
import { getAllJournalEntries } from "./journalVoucherApi";
import { getAllGroups } from "./accountGroupApi";
import { getAllLedgers } from "./ledgerApi";

// ── Row shape ──────────────────────────────────────────────────────────────────
export interface TrialRow {
  ledgerName: string;
  group: string;
  openingDr:     number;
  openingCr:     number;
  transactionDr: number;
  transactionCr: number;
  closingDr:     number;  // net debit balance  (0 if credit balance)
  closingCr:     number;  // net credit balance (0 if debit balance)
}

export interface TrialSummary {
  rows: TrialRow[];
  stats: {
    openingLedgers:  number;
    bankCashEntries: number;
    journalEntries:  number;
    totalLedgers:    number;
  };
}

// ── Accumulator ────────────────────────────────────────────────────────────────
type Bucket = {
  group: string;
  openingDr: number;
  openingCr: number;
  transactionDr: number;
  transactionCr: number;
};

function makeBuckets() {
  const map = new Map<string, Bucket>();

  const ensure = (name: string, group: string) => {
    if (!map.has(name)) {
      map.set(name, { group, openingDr: 0, openingCr: 0, transactionDr: 0, transactionCr: 0 });
    }
    return map.get(name)!;
  };

  const addOpeningDr = (name: string, group: string, amt: number) => {
    ensure(name, group).openingDr += amt;
  };
  const addOpeningCr = (name: string, group: string, amt: number) => {
    ensure(name, group).openingCr += amt;
  };
  const addTxnDr = (name: string, group: string, amt: number) => {
    ensure(name, group).transactionDr += amt;
  };
  const addTxnCr = (name: string, group: string, amt: number) => {
    ensure(name, group).transactionCr += amt;
  };

  return { map, addOpeningDr, addOpeningCr, addTxnDr, addTxnCr, ensure };
}

// ── Main API ───────────────────────────────────────────────────────────────────
export async function computeTrialBalance(): Promise<TrialSummary> {
  const { map, addOpeningDr, addOpeningCr, addTxnDr, addTxnCr, ensure } = makeBuckets();

  // 1. Opening Balances (fetched dynamically from the database)
  const ledgers = await getAllLedgers();
  for (const l of ledgers) {
    // Ensure the ledger exists in the buckets map even if opening balances are 0
    ensure(l.ledgerName, l.groupName);
    if (l.openingDr && l.openingDr > 0) addOpeningDr(l.ledgerName, l.groupName, l.openingDr);
    if (l.openingCr && l.openingCr > 0) addOpeningCr(l.ledgerName, l.groupName, l.openingCr);
  }
  const openingLedgers = ledgers.filter(l => (l.openingDr || 0) > 0 || (l.openingCr || 0) > 0).length;

  // 2. Bank / Cash Book (double-entry: each entry affects both account and contra)
  const bankEntries = await getAllEntries();
  for (const e of bankEntries) {
    if (e.deposit > 0) {
      // Money comes IN → Dr the bank/cash account, Cr the contra
      addTxnDr(e.accountName, e.accountGroup, e.deposit);
      addTxnCr(e.contraAccountName, e.contraAccountGroup, e.deposit);
    }
    if (e.withdrawal > 0) {
      // Money goes OUT → Cr the bank/cash account, Dr the contra
      addTxnCr(e.accountName, e.accountGroup, e.withdrawal);
      addTxnDr(e.contraAccountName, e.contraAccountGroup, e.withdrawal);
    }
  }

  // 3. Journal Entries
  const journalEntries = await getAllJournalEntries();
  for (const e of journalEntries) {
    addTxnDr(e.debitAccount,  e.debitGroup,  e.debitAmount);
    addTxnCr(e.creditAccount, e.creditGroup, e.creditAmount);
  }

  // 4. Compute closing (net) balances
  const rows: TrialRow[] = [...map.entries()].map(([ledgerName, b]) => {
    const totalDr = b.openingDr + b.transactionDr;
    const totalCr = b.openingCr + b.transactionCr;
    const net = totalDr - totalCr;
    return {
      ledgerName,
      group:         b.group,
      openingDr:     b.openingDr,
      openingCr:     b.openingCr,
      transactionDr: b.transactionDr,
      transactionCr: b.transactionCr,
      closingDr:     net > 0 ? net : 0,
      closingCr:     net < 0 ? -net : 0,
    };
  });

  // Sort: group order then ledger name
  const groups = await getAllGroups();
  const groupOrder = groups.map((g) => g.groupName);

  rows.sort((a, b) => {
    let ga = groupOrder.indexOf(a.group);
    let gb = groupOrder.indexOf(b.group);
    if (ga === -1) ga = 999;
    if (gb === -1) gb = 999;
    if (ga !== gb) return ga - gb;
    return a.ledgerName.localeCompare(b.ledgerName);
  });

  return {
    rows,
    stats: {
      openingLedgers,
      bankCashEntries: bankEntries.length,
      journalEntries:  journalEntries.length,
      totalLedgers:    rows.length,
    },
  };
}
