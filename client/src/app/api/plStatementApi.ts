import { getAllEntries } from "./bankCashBookApi";
import { getAllJournalEntries } from "./journalVoucherApi";
import { FinancialYear } from "./financialYearApi";
import { getAllGroups } from "./accountGroupApi";

export interface PLEntry {
  ledgerName: string;
  amount: number;
}

export interface PLSection {
  entries: PLEntry[];
  total: number;
}

export interface PLData {
  sales:            PLSection;
  otherIncome:      PLSection;
  directExpenses:   PLSection;
  indirectExpenses: PLSection;
  totalIncome:    number;
  totalExpenses:  number;
  grossProfit:    number;  // sales - directExpenses
  netProfit:      number;  // grossProfit + otherIncome - indirectExpenses
  isProfit:       boolean;
  dateFrom:       string;
  dateTo:         string;
  bankCashTxns:   number;
  journalTxns:    number;
}

export interface DatePreset {
  label: string;
  from:  string;
  to:    string;
}

function add(map: Map<string, number>, key: string, amt: number) {
  map.set(key, (map.get(key) ?? 0) + amt);
}

function toSection(map: Map<string, number>): PLSection {
  const entries = [...map.entries()]
    .filter(([, v]) => Math.abs(v) > 0.001)
    .map(([ledgerName, amount]) => ({ ledgerName, amount }))
    .sort((a, b) => a.ledgerName.localeCompare(b.ledgerName));
  return { entries, total: entries.reduce((s, e) => s + e.amount, 0) };
}

export async function computePL(dateFrom: string, dateTo: string): Promise<PLData> {
  const groups = await getAllGroups();

  const SALES_GROUPS        = new Set<string>();
  const OTHER_INCOME_GROUPS = new Set<string>();
  const DIRECT_EXP_GROUPS   = new Set<string>();
  const INDIRECT_EXP_GROUPS = new Set<string>();

  groups.forEach((g) => {
    const sg = g.superGroup;
    if (sg === "Sales Account") {
      SALES_GROUPS.add(g.groupName);
    } else if (sg === "Income" || sg === "Income (Trading)" || sg === "Income (Other Then Sales)") {
      OTHER_INCOME_GROUPS.add(g.groupName);
    } else if (sg === "Purchase Account" || sg === "Expenses (Direct)") {
      DIRECT_EXP_GROUPS.add(g.groupName);
    } else if (sg === "Expense Account" || sg === "Partner Interest" || sg === "Partner Remuneration") {
      INDIRECT_EXP_GROUPS.add(g.groupName);
    }
  });

  const salesMap       = new Map<string, number>();
  const incomeMap      = new Map<string, number>();
  const directExpMap   = new Map<string, number>();
  const indirectExpMap = new Map<string, number>();
  let bankCashTxns = 0;
  let journalTxns  = 0;

  // 1. Bank / Cash Book entries
  const bankEntries = await getAllEntries();
  for (const e of bankEntries) {
    if (e.date < dateFrom || e.date > dateTo) continue;
    const cg = e.contraAccountGroup;
    const cn = e.contraAccountName;

    if (e.deposit > 0) {
      if (SALES_GROUPS.has(cg))        { add(salesMap,  cn, e.deposit);  bankCashTxns++; }
      else if (OTHER_INCOME_GROUPS.has(cg)) { add(incomeMap, cn, e.deposit); bankCashTxns++; }
    }
    if (e.withdrawal > 0) {
      if (DIRECT_EXP_GROUPS.has(cg))       { add(directExpMap,   cn, e.withdrawal); bankCashTxns++; }
      else if (INDIRECT_EXP_GROUPS.has(cg)) { add(indirectExpMap, cn, e.withdrawal); bankCashTxns++; }
    }
  }

  // 2. Journal Entries
  const journalEntries = await getAllJournalEntries();
  for (const e of journalEntries) {
    if (e.date < dateFrom || e.date > dateTo) continue;
    let counted = false;

    // Credit = revenue
    if (SALES_GROUPS.has(e.creditGroup))        { add(salesMap,  e.creditAccount, e.creditAmount); counted = true; }
    else if (OTHER_INCOME_GROUPS.has(e.creditGroup)) { add(incomeMap, e.creditAccount, e.creditAmount); counted = true; }

    // Debit = expense
    if (DIRECT_EXP_GROUPS.has(e.debitGroup))       { add(directExpMap,   e.debitAccount, e.debitAmount); counted = true; }
    else if (INDIRECT_EXP_GROUPS.has(e.debitGroup)) { add(indirectExpMap, e.debitAccount, e.debitAmount); counted = true; }

    // Contra / write-back: expense on credit side reduces it
    if (INDIRECT_EXP_GROUPS.has(e.creditGroup)) { add(indirectExpMap, e.creditAccount, -e.creditAmount); counted = true; }
    if (DIRECT_EXP_GROUPS.has(e.creditGroup))   { add(directExpMap,   e.creditAccount, -e.creditAmount); counted = true; }
    // Income on debit side reduces it (refund)
    if (SALES_GROUPS.has(e.debitGroup))          { add(salesMap,  e.debitAccount, -e.debitAmount); counted = true; }
    if (OTHER_INCOME_GROUPS.has(e.debitGroup))   { add(incomeMap, e.debitAccount, -e.debitAmount); counted = true; }

    if (counted) journalTxns++;
  }

  const sales            = toSection(salesMap);
  const otherIncome      = toSection(incomeMap);
  const directExpenses   = toSection(directExpMap);
  const indirectExpenses = toSection(indirectExpMap);

  const grossProfit   = sales.total - directExpenses.total;
  const netProfit     = grossProfit + otherIncome.total - indirectExpenses.total;

  return {
    sales, otherIncome, directExpenses, indirectExpenses,
    totalIncome:   sales.total + otherIncome.total,
    totalExpenses: directExpenses.total + indirectExpenses.total,
    grossProfit, netProfit,
    isProfit: netProfit >= 0,
    dateFrom, dateTo,
    bankCashTxns, journalTxns,
  };
}

function iso(d: Date) { return d.toISOString().slice(0, 10); }

export function buildPresets(fy?: FinancialYear): DatePreset[] {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const presets: DatePreset[] = [
    { label: "This Month",   from: iso(new Date(y, m, 1)),     to: iso(new Date(y, m + 1, 0)) },
    { label: "Last Month",   from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0))     },
    { label: "This Quarter", from: iso(new Date(y, Math.floor(m / 3) * 3, 1)), to: iso(new Date(y, Math.floor(m / 3) * 3 + 3, 0)) },
  ];
  if (fy) presets.push({ label: fy.label, from: fy.startDate, to: fy.endDate });
  presets.push({ label: "Custom", from: iso(new Date(y, m, 1)), to: iso(today) });
  return presets;
}
