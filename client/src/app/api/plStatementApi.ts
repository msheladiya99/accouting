import { FinancialYear } from "./financialYearApi";

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
