import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { computeTrialBalance } from "./trialBalanceApi";
import { getAllEntries, getAllAccounts, computeRows, type BankCashRow } from "./bankCashBookApi";
import { getAllJournalEntries } from "./journalVoucherApi";
import { computeBalanceSheet } from "./balanceSheetApi";
import type { FinancialYear } from "./financialYearApi";

// ── Palette (ARGB — "FF" prefix = fully opaque) ───────────────────────────────
const C = {
  navyFg:       "FF1E3A5F",
  indigoFg:     "FF3730A3",
  grayFg:       "FF64748B",
  lightGray:    "FF94A3B8",
  colHeaderBg:  "FF3730A3",
  colHeaderFg:  "FFFFFFFF",
  evenRowBg:    "FFF8FAFC",
  totalBg:      "FFE0E7FF",
  totalFg:      "FF1E40AF",
  greenFg:      "FF059669",
  redFg:        "FFDC2626",
  sectionBg:    "FF1E293B",
  sectionFg:    "FFFFFFFF",
  groupBg:      "FFE8F4FD",
  groupFg:      "FF1D4ED8",
  balancedBg:   "FFD1FAE5",
  balancedFg:   "FF065F46",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function fmtCurrency(v: number): string {
  return v > 0 ? `₹${v.toLocaleString("en-IN")}` : "";
}

function applyHeaderStyle(
  cell: ExcelJS.Cell,
  fontSize = 10,
  bg = C.colHeaderBg,
  fg = C.colHeaderFg,
) {
  cell.font      = { size: fontSize, bold: true, color: { argb: fg } };
  cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
  cell.border    = {
    bottom: { style: "thin", color: { argb: "FF818CF8" } },
  };
}

function applyDataRow(row: ExcelJS.Row, rowIndex: number) {
  const bg = rowIndex % 2 === 0 ? C.evenRowBg : "FFFFFFFF";
  row.eachCell({ includeEmpty: true }, (cell) => {
    if (!cell.fill || (cell.fill as any).fgColor?.argb === "00000000") {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    }
    cell.font = cell.font ?? {};
    cell.alignment = {
      ...cell.alignment,
      vertical: "middle",
    };
  });
  row.height = 18;
}

function applyTotalRow(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, color: { argb: C.totalFg } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
    cell.border = { top: { style: "medium", color: { argb: "FF818CF8" } } };
  });
  row.height = 20;
}

function autoWidth(sheet: ExcelJS.Worksheet, startRow = 6, minWidth = 10, maxWidth = 45) {
  sheet.columns.forEach((col) => {
    let max = minWidth;
    col.eachCell({ includeEmpty: false }, (cell, rowNum) => {
      if (rowNum < startRow) return;
      const v = cell.value;
      const len = v === null || v === undefined ? 0 : String(v).length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, maxWidth);
  });
}

// ── Company / report header block ─────────────────────────────────────────────
function addReportHeader(
  sheet: ExcelJS.Worksheet,
  companyName: string,
  companyAddress: string,
  fyLabel: string,
  reportTitle: string,
  period: string,
  colCount: number,
) {
  const last = colLetter(colCount);

  // Row 1: Company name
  const r1 = sheet.addRow([companyName]);
  sheet.mergeCells(`A1:${last}1`);
  const c1 = r1.getCell(1);
  c1.font      = { size: 16, bold: true, color: { argb: C.navyFg } };
  c1.alignment = { horizontal: "center", vertical: "middle" };
  c1.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F9FF" } };
  r1.height = 30;

  // Row 2: Address
  const r2 = sheet.addRow([companyAddress]);
  sheet.mergeCells(`A2:${last}2`);
  const c2 = r2.getCell(1);
  c2.font      = { size: 10, italic: true, color: { argb: C.grayFg } };
  c2.alignment = { horizontal: "center", vertical: "middle" };
  c2.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F9FF" } };
  r2.height = 16;

  // Row 3: Report title
  const r3 = sheet.addRow([reportTitle.toUpperCase()]);
  sheet.mergeCells(`A3:${last}3`);
  const c3 = r3.getCell(1);
  c3.font      = { size: 13, bold: true, color: { argb: C.indigoFg } };
  c3.alignment = { horizontal: "center", vertical: "middle" };
  c3.border    = {
    bottom: { style: "medium", color: { argb: "FF818CF8" } },
    top:    { style: "medium", color: { argb: "FF818CF8" } },
  };
  r3.height = 24;

  // Row 4: FY + Period
  const r4 = sheet.addRow([`${fyLabel}  |  Period: ${period}`]);
  sheet.mergeCells(`A4:${last}4`);
  const c4 = r4.getCell(1);
  c4.font      = { size: 10, color: { argb: C.grayFg } };
  c4.alignment = { horizontal: "center", vertical: "middle" };
  r4.height = 16;

  // Row 5: Generated on
  const r5 = sheet.addRow([`Generated on: ${new Date().toLocaleString("en-IN")}`]);
  sheet.mergeCells(`A5:${last}5`);
  const c5 = r5.getCell(1);
  c5.font      = { size: 9, italic: true, color: { argb: C.lightGray } };
  c5.alignment = { horizontal: "center", vertical: "middle" };
  r5.height = 14;

  // Row 6: spacer
  sheet.addRow([]);
}

// ── Params ────────────────────────────────────────────────────────────────────
export interface ExportParams {
  companyName:    string;
  companyAddress: string;
  fyLabel:        string;
  dateFrom:       string;
  dateTo:         string;
}

export type ExportStep =
  | "idle"
  | "trial-balance"
  | "cash-book"
  | "bank-book"
  | "journal"
  | "balance-sheet"
  | "building"
  | "done"
  | "error";

// ── Sheet builders ────────────────────────────────────────────────────────────

function buildTrialBalance(
  workbook: ExcelJS.Workbook,
  data: Awaited<ReturnType<typeof computeTrialBalance>>,
  params: ExportParams,
) {
  const sheet = workbook.addWorksheet("Trial Balance", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });
  const colCount = 8;
  const period   = `${params.dateFrom} to ${params.dateTo}`;

  addReportHeader(sheet, params.companyName, params.companyAddress, params.fyLabel, "Trial Balance", period, colCount);

  // Column headers — row 7
  const headers = ["Ledger Name", "Group", "Opening Dr", "Opening Cr", "Transaction Dr", "Transaction Cr", "Closing Dr", "Closing Cr"];
  const hRow = sheet.addRow(headers);
  hRow.height = 22;
  hRow.eachCell((cell) => applyHeaderStyle(cell));

  // Data rows
  let rowIdx = 0;
  for (const r of data.rows) {
    const dRow = sheet.addRow([
      r.ledgerName, r.group,
      r.openingDr     || null, r.openingCr     || null,
      r.transactionDr || null, r.transactionCr || null,
      r.closingDr     || null, r.closingCr     || null,
    ]);
    applyDataRow(dRow, rowIdx++);

    // Money columns: green for Dr, red for Cr
    [3, 5, 7].forEach((c) => { if ((dRow.getCell(c).value ?? 0) > 0) dRow.getCell(c).font = { color: { argb: C.greenFg } }; });
    [4, 6, 8].forEach((c) => { if ((dRow.getCell(c).value ?? 0) > 0) dRow.getCell(c).font = { color: { argb: C.redFg } }; });
  }

  // Totals row
  const totals = data.rows.reduce(
    (s, r) => ({ oDr: s.oDr + r.openingDr, oCr: s.oCr + r.openingCr, tDr: s.tDr + r.transactionDr, tCr: s.tCr + r.transactionCr, cDr: s.cDr + r.closingDr, cCr: s.cCr + r.closingCr }),
    { oDr: 0, oCr: 0, tDr: 0, tCr: 0, cDr: 0, cCr: 0 },
  );
  const tRow = sheet.addRow(["TOTALS", "", totals.oDr || null, totals.oCr || null, totals.tDr || null, totals.tCr || null, totals.cDr || null, totals.cCr || null]);
  applyTotalRow(tRow);

  // Balance check
  const diff = Math.abs(totals.cDr - totals.cCr);
  const bRow = sheet.addRow(["", "", "", "", "", `Difference:`, diff < 1 ? 0 : diff, diff < 1 ? "BALANCED ✓" : "OUT OF BALANCE ✗"]);
  bRow.getCell(7).font = { bold: true, color: { argb: diff < 1 ? C.greenFg : C.redFg } };
  bRow.getCell(8).font = { bold: true, color: { argb: diff < 1 ? C.greenFg : C.redFg } };

  // Number format for money columns
  for (let c = 3; c <= 8; c++) {
    sheet.getColumn(c).numFmt = '#,##0';
  }

  autoWidth(sheet, 7);
  sheet.getColumn(1).width = 32;
  sheet.getColumn(2).width = 18;
}

function buildBookSheet(
  workbook: ExcelJS.Workbook,
  sheetName: "Cash Book" | "Bank Book",
  group: "Cash" | "Bank",
  allEntries: Awaited<ReturnType<typeof getAllEntries>>,
  accounts: Awaited<ReturnType<typeof getAllAccounts>>,
  params: ExportParams,
) {
  const sheet = workbook.addWorksheet(sheetName, {
    pageSetup: { paperSize: 9, orientation: "landscape" },
  });
  const colCount = 9;
  const period   = `${params.dateFrom} to ${params.dateTo}`;

  addReportHeader(sheet, params.companyName, params.companyAddress, params.fyLabel, sheetName, period, colCount);

  const headers = ["Sr#", "Date", "Account Name", "Particulars", "Contra Account", "Contra Group", "Withdrawal", "Deposit", "Balance"];
  const hRow = sheet.addRow(headers);
  hRow.height = 22;
  hRow.eachCell((cell) => applyHeaderStyle(cell));

  let rowIdx = 0;
  let sr = 1;
  const accs = accounts.filter((a) => a.group === group);

  for (const acc of accs) {
    const acctEntries = allEntries.filter((e) => e.accountId === acc._id);
    const rows = computeRows(acc, acctEntries as any);
    for (const r of rows) {
      if (r.date < params.dateFrom || r.date > params.dateTo) continue;
      const dRow = sheet.addRow([
        sr++, r.date, r.accountName, r.particulars,
        r.contraAccountName, r.contraAccountGroup,
        r.withdrawal || null, r.deposit || null, r.balance,
      ]);
      applyDataRow(dRow, rowIdx++);
      if ((dRow.getCell(7).value ?? 0) > 0) dRow.getCell(7).font = { color: { argb: C.redFg } };
      if ((dRow.getCell(8).value ?? 0) > 0) dRow.getCell(8).font = { color: { argb: C.greenFg } };
      dRow.getCell(9).font = { bold: true };
    }
  }

  for (const c of [7, 8, 9]) sheet.getColumn(c).numFmt = '#,##0';

  autoWidth(sheet, 7);
  sheet.getColumn(1).width  = 6;
  sheet.getColumn(2).width  = 12;
  sheet.getColumn(3).width  = 22;
  sheet.getColumn(4).width  = 38;
  sheet.getColumn(5).width  = 24;
  sheet.getColumn(6).width  = 18;
}

function buildJournalSheet(
  workbook: ExcelJS.Workbook,
  entries: Awaited<ReturnType<typeof getAllJournalEntries>>,
  params: ExportParams,
) {
  const sheet = workbook.addWorksheet("Journal Voucher", {
    pageSetup: { paperSize: 9, orientation: "landscape" },
  });
  const colCount = 11;
  const period   = `${params.dateFrom} to ${params.dateTo}`;

  addReportHeader(sheet, params.companyName, params.companyAddress, params.fyLabel, "Journal Voucher", period, colCount);

  const headers = ["Sr#", "Voucher No.", "Date", "Narration", "Debit Account", "Debit Group", "Debit Amt", "Credit Account", "Credit Group", "Credit Amt", "Status"];
  const hRow = sheet.addRow(headers);
  hRow.height = 22;
  hRow.eachCell((cell) => applyHeaderStyle(cell));

  let rowIdx = 0;
  let sr = 1;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  for (const e of sorted) {
    const isMultiLeg = e.items && e.items.length > 0;
    const debitAccount = isMultiLeg ? e.items!.filter(it => it.type === "Db").map(it => it.accountName).join(", ") : e.debitAccount;
    const debitGroup = isMultiLeg ? e.items!.filter(it => it.type === "Db").map(it => it.groupName).join(", ") : e.debitGroup;
    const debitAmount = isMultiLeg ? e.items!.filter(it => it.type === "Db").reduce((sum, it) => sum + it.amount, 0) : e.debitAmount;
    
    const creditAccount = isMultiLeg ? e.items!.filter(it => it.type === "Cr").map(it => it.accountName).join(", ") : e.creditAccount;
    const creditGroup = isMultiLeg ? e.items!.filter(it => it.type === "Cr").map(it => it.groupName).join(", ") : e.creditGroup;
    const creditAmount = isMultiLeg ? e.items!.filter(it => it.type === "Cr").reduce((sum, it) => sum + it.amount, 0) : e.creditAmount;

    const dRow = sheet.addRow([
      sr++, e.voucherNo, e.date, e.narration,
      debitAccount, debitGroup, debitAmount,
      creditAccount, creditGroup, creditAmount,
      e.status,
    ]);
    applyDataRow(dRow, rowIdx++);
    dRow.getCell(7).font  = { color: { argb: C.greenFg } };
    dRow.getCell(10).font = { color: { argb: C.redFg } };

    const statusCell = dRow.getCell(11);
    statusCell.fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: e.status === "Posted" ? "FFD1FAE5" : "FFFEF3C7" },
    };
    statusCell.font = { bold: true, color: { argb: e.status === "Posted" ? C.greenFg : "FFB45309" } };
  }

  // Totals
  const totDr = entries.reduce((s, e) => s + (e.items && e.items.length > 0 ? e.items.filter(it => it.type === "Db").reduce((sum, it) => sum + it.amount, 0) : e.debitAmount),  0);
  const totCr = entries.reduce((s, e) => s + (e.items && e.items.length > 0 ? e.items.filter(it => it.type === "Cr").reduce((sum, it) => sum + it.amount, 0) : e.creditAmount), 0);
  const tRow  = sheet.addRow(["", "TOTALS", "", "", "", "", totDr, "", "", totCr, ""]);
  applyTotalRow(tRow);

  for (const c of [7, 10]) sheet.getColumn(c).numFmt = '#,##0';

  autoWidth(sheet, 7);
  sheet.getColumn(1).width  = 6;
  sheet.getColumn(2).width  = 16;
  sheet.getColumn(3).width  = 12;
  sheet.getColumn(4).width  = 36;
  sheet.getColumn(5).width  = 24;
  sheet.getColumn(6).width  = 18;
  sheet.getColumn(8).width  = 24;
  sheet.getColumn(9).width  = 18;
}

function buildBalanceSheetSheet(
  workbook: ExcelJS.Workbook,
  data: Awaited<ReturnType<typeof computeBalanceSheet>>,
  params: ExportParams,
) {
  const sheet = workbook.addWorksheet("Balance Sheet", {
    pageSetup: { paperSize: 9, orientation: "portrait" },
  });
  const colCount = 4;
  const period   = `As at ${params.dateTo}`;

  addReportHeader(sheet, params.companyName, params.companyAddress, params.fyLabel, "Balance Sheet", period, colCount);

  const INDENT = "      ";  // visual indent for ledger rows

  const addSectionHeader = (label: string, bg: string, fg: string) => {
    const r = sheet.addRow([label, "", "", ""]);
    sheet.mergeCells(`A${r.number}:D${r.number}`);
    r.getCell(1).font = { size: 11, bold: true, color: { argb: fg } };
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    r.getCell(1).alignment = { horizontal: "left", indent: 1 };
    r.height = 20;
  };

  const addGroupHeader = (label: string, total: number) => {
    const r = sheet.addRow([label, "", "", `₹${total.toLocaleString("en-IN")}`]);
    sheet.mergeCells(`A${r.number}:C${r.number}`);
    r.getCell(1).font = { bold: true, color: { argb: C.groupFg } };
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.groupBg } };
    r.getCell(1).alignment = { horizontal: "left", indent: 1 };
    r.getCell(4).font = { bold: true, color: { argb: C.groupFg } };
    r.getCell(4).alignment = { horizontal: "right" };
    r.height = 18;
  };

  const addLedgerRow = (ledgerName: string, amount: number, idx: number) => {
    const bg = idx % 2 === 0 ? C.evenRowBg : "FFFFFFFF";
    const r  = sheet.addRow([INDENT + ledgerName, "", "", amount > 0 ? `₹${amount.toLocaleString("en-IN")}` : `(₹${Math.abs(amount).toLocaleString("en-IN")})`]);
    sheet.mergeCells(`A${r.number}:C${r.number}`);
    r.getCell(1).font  = { color: { argb: "FF475569" } };
    r.getCell(1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    r.getCell(4).font  = { color: { argb: amount >= 0 ? C.greenFg : C.redFg } };
    r.getCell(4).alignment = { horizontal: "right" };
    r.height = 16;
  };

  const addTotalRow = (label: string, amount: number, fg: string) => {
    const r = sheet.addRow([label, "", "", `₹${amount.toLocaleString("en-IN")}`]);
    sheet.mergeCells(`A${r.number}:C${r.number}`);
    r.getCell(1).font = { bold: true, size: 11, color: { argb: fg } };
    r.getCell(1).fill = r.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
    r.getCell(4).font = { bold: true, size: 11, color: { argb: fg } };
    r.getCell(4).alignment = { horizontal: "right" };
    r.getCell(1).border = r.getCell(4).border = { top: { style: "medium", color: { argb: "FF818CF8" } } };
    r.height = 22;
  };

  // Assets
  addSectionHeader("ASSETS", C.sectionBg, C.sectionFg);
  for (const g of data.assetsSection.groups) {
    addGroupHeader(g.groupName, g.total);
    g.ledgers.forEach((l, i) => addLedgerRow(l.ledgerName, l.amount, i));
  }
  addTotalRow("TOTAL ASSETS", data.totalAssets, "FF1D4ED8");
  sheet.addRow([]);

  // Liabilities + Capital
  addSectionHeader("LIABILITIES & CAPITAL", C.sectionBg, C.sectionFg);
  for (const g of data.liabCapSection.groups) {
    addGroupHeader(g.groupName, g.total);
    g.ledgers.forEach((l, i) => addLedgerRow(l.ledgerName, l.amount, i));
  }
  addTotalRow("TOTAL LIABILITIES & CAPITAL", data.totalLiabCap, "FF6D28D9");
  sheet.addRow([]);

  // Balance equation
  const diff = data.isBalanced ? 0 : data.difference;
  const eqRow = sheet.addRow([
    data.isBalanced ? "✓  Balance Sheet is BALANCED" : "✗  OUT OF BALANCE",
    "", "",
    data.isBalanced ? "₹0 difference" : `Diff: ₹${diff.toLocaleString("en-IN")}`,
  ]);
  sheet.mergeCells(`A${eqRow.number}:C${eqRow.number}`);
  eqRow.getCell(1).font = { bold: true, size: 11, color: { argb: data.isBalanced ? C.greenFg : C.redFg } };
  eqRow.getCell(1).fill = eqRow.getCell(4).fill = {
    type: "pattern", pattern: "solid",
    fgColor: { argb: data.isBalanced ? C.balancedBg : "FFFEE2E2" },
  };
  eqRow.getCell(4).font = { bold: true, color: { argb: data.isBalanced ? C.greenFg : C.redFg } };
  eqRow.height = 22;

  sheet.getColumn(1).width = 36;
  sheet.getColumn(2).width = 8;
  sheet.getColumn(3).width = 8;
  sheet.getColumn(4).width = 20;
}

// ── Main export function ───────────────────────────────────────────────────────
export async function generateExcelExport(
  params: ExportParams,
  onStep: (step: ExportStep) => void,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator  = params.companyName;
  workbook.company  = params.companyName;
  workbook.created  = new Date();
  workbook.modified = new Date();

  // 1. Trial Balance
  onStep("trial-balance");
  const trialData = await computeTrialBalance();
  buildTrialBalance(workbook, trialData, params);

  // 2. Cash Book
  onStep("cash-book");
  const [accounts, allEntries] = await Promise.all([getAllAccounts(), getAllEntries()]);
  buildBookSheet(workbook, "Cash Book", "Cash", allEntries, accounts, params);

  // 3. Bank Book
  onStep("bank-book");
  buildBookSheet(workbook, "Bank Book", "Bank", allEntries, accounts, params);

  // 4. Journal Voucher
  onStep("journal");
  const journalEntries = await getAllJournalEntries();
  buildJournalSheet(workbook, journalEntries, params);

  // 5. Balance Sheet
  onStep("balance-sheet");
  const bsData = await computeBalanceSheet();
  buildBalanceSheetSheet(workbook, bsData, params);

  // Build & download
  onStep("building");
  const buffer = await workbook.xlsx.writeBuffer();
  const blob   = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href     = url;
  link.download = `${params.companyName.replace(/\s+/g, "_")}_Financial_Report_${date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  onStep("done");
}

// ── Export Bank/Cash Book Entries ─────────────────────────────────────────────
export async function exportBankCashBookFiltered(
  rows: BankCashRow[],
  openingBalance: number,
  params: {
    companyName: string;
    companyAddress: string;
    fyLabel: string;
    accountLabel: string;
  }
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator  = params.companyName;
  workbook.company  = params.companyName;
  workbook.created  = new Date();
  workbook.modified = new Date();

  const sheetName = params.accountLabel.length > 30 ? params.accountLabel.slice(0, 30) : params.accountLabel;
  const sheet = workbook.addWorksheet(sheetName, {
    pageSetup: { paperSize: 9, orientation: "landscape" },
  });

  const colCount = 9;
  const period = `FY ${params.fyLabel}`;
  const title = `Bank / Cash Book — ${params.accountLabel}`;

  addReportHeader(sheet, params.companyName, params.companyAddress, params.fyLabel, title, period, colCount);

  // Column headers
  const headers = [
    "Sr. No.",
    "Bank/Cash Name",
    "Date",
    "Particulars/Narrations",
    "Withdrawals/Payment",
    "Deposit/Receipt",
    "Balance",
    "Account Name",
    "Account Group Name"
  ];
  const hRow = sheet.addRow(headers);
  hRow.height = 22;
  hRow.eachCell((cell) => applyHeaderStyle(cell));

  // Helper date formatter
  const fmtDateLocal = (dateStr: string): string => {
    if (!dateStr) return "";
    try {
      const [year, month, day] = dateStr.split("T")[0].split("-");
      if (year && month && day) {
        return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
      }
    } catch (e) {}
    return dateStr;
  };

  // Add Opening Balance Row
  const obRow = sheet.addRow([
    "—",
    "Opening Balance",
    "",
    "",
    openingBalance < 0 ? Math.abs(openingBalance) : null,
    openingBalance >= 0 ? openingBalance : null,
    openingBalance,
    "",
    ""
  ]);

  obRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4FB" } };
    cell.font = { italic: colNum <= 4, bold: colNum === 7, color: { argb: "FF334155" } };
    if (colNum === 5 && openingBalance < 0) {
      cell.font = { bold: true, color: { argb: C.redFg } };
    }
    if (colNum === 6 && openingBalance >= 0) {
      cell.font = { bold: true, color: { argb: C.greenFg } };
    }
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      top: { style: "thin", color: { argb: "FFCBD5E1" } }
    };
  });
  obRow.height = 18;

  // Add Data Rows
  let rowIdx = 0;
  for (const r of rows) {
    const isWithdrawal = r.withdrawal > 0;
    const isDeposit = r.deposit > 0;
    const dRow = sheet.addRow([
      rowIdx + 1,
      r.accountName,
      fmtDateLocal(r.date),
      r.particulars,
      isWithdrawal ? r.withdrawal : null,
      isDeposit ? r.deposit : null,
      r.balance,
      r.contraAccountName || "",
      r.contraAccountGroup || ""
    ]);
    applyDataRow(dRow, rowIdx);

    if (isWithdrawal) dRow.getCell(5).font = { color: { argb: C.redFg } };
    if (isDeposit) dRow.getCell(6).font = { color: { argb: C.greenFg } };
    dRow.getCell(7).font = { bold: true, color: { argb: r.balance < 0 ? C.redFg : "FF000000" } };

    rowIdx++;
  } 

  // Totals Row
  const totalWithdrawal = rows.reduce((s, r) => s + r.withdrawal, 0);
  const totalDeposit = rows.reduce((s, r) => s + r.deposit, 0);
  const closingBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance;

  const tRow = sheet.addRow([
    "Σ",
    `Total (${rows.length} entries)`,
    "",
    "",
    totalWithdrawal || null,
    totalDeposit || null,
    closingBalance,
    "",
    ""
  ]);
  applyTotalRow(tRow);
  if (totalWithdrawal > 0) tRow.getCell(5).font = { bold: true, color: { argb: C.redFg } };
  if (totalDeposit > 0) tRow.getCell(6).font = { bold: true, color: { argb: C.greenFg } };
  tRow.getCell(7).font = { bold: true, color: { argb: closingBalance < 0 ? C.redFg : C.totalFg } };

  for (const c of [5, 6, 7]) {
    sheet.getColumn(c).numFmt = '#,##0.00';
  }

  autoWidth(sheet, 7);
  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 12;
  sheet.getColumn(4).width = 38;
  sheet.getColumn(5).width = 18;
  sheet.getColumn(6).width = 18;
  sheet.getColumn(7).width = 20;
  sheet.getColumn(8).width = 24;
  sheet.getColumn(9).width = 18;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  link.href = url;
  const safeAccountName = params.accountLabel.replace(/\s+/g, "_");
  const safeCompanyName = params.companyName.replace(/\s+/g, "_");
  link.download = `${safeCompanyName}_${safeAccountName}_Book_${dateStr}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── JV Export ─────────────────────────────────────────────────────────────────
export async function exportJVEntriesToExcel(
  entries: Awaited<ReturnType<typeof getAllJournalEntries>>,
  params: {
    companyName: string;
    companyAddress: string;
    fyLabel: string;
  }
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator  = params.companyName;
  workbook.company  = params.companyName;
  workbook.created  = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Journal Voucher", {
    pageSetup: { paperSize: 9, orientation: "landscape" },
  });

  const colCount = 11;
  const period   = `FY ${params.fyLabel}`;

  addReportHeader(sheet, params.companyName, params.companyAddress, params.fyLabel, "Journal Voucher Register", period, colCount);

  const headers = ["Sr#", "Voucher No.", "Date", "Status", "Narration", "Debit Account", "Debit Group", "Debit (Dr)", "Credit Account", "Credit Group", "Credit (Cr)"];
  const hRow = sheet.addRow(headers);
  hRow.height = 22;
  hRow.eachCell((cell) => applyHeaderStyle(cell));

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let rowIdx = 0;
  let sr = 1;

  const fmtDateLocal = (d: string) => {
    if (!d) return "";
    try {
      const p = d.slice(0, 10).split("-");
      if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
    } catch {}
    return d;
  };

  for (const e of sorted) {
    const isMultiLeg = e.items && e.items.length > 0;
    const debitAccount  = isMultiLeg ? e.items!.filter(it => it.type === "Db").map(it => it.accountName).join(", ") : e.debitAccount;
    const debitGroup    = isMultiLeg ? e.items!.filter(it => it.type === "Db").map(it => it.groupName).join(", ") : e.debitGroup;
    const debitAmount   = isMultiLeg ? e.items!.filter(it => it.type === "Db").reduce((s, it) => s + it.amount, 0) : e.debitAmount;
    const creditAccount = isMultiLeg ? e.items!.filter(it => it.type === "Cr").map(it => it.accountName).join(", ") : e.creditAccount;
    const creditGroup   = isMultiLeg ? e.items!.filter(it => it.type === "Cr").map(it => it.groupName).join(", ") : e.creditGroup;
    const creditAmount  = isMultiLeg ? e.items!.filter(it => it.type === "Cr").reduce((s, it) => s + it.amount, 0) : e.creditAmount;

    const dRow = sheet.addRow([
      sr++, e.voucherNo, fmtDateLocal(e.date), e.status, e.narration,
      debitAccount, debitGroup, debitAmount || null,
      creditAccount, creditGroup, creditAmount || null,
    ]);
    applyDataRow(dRow, rowIdx++);
    if ((dRow.getCell(8).value ?? 0) > 0) dRow.getCell(8).font  = { color: { argb: C.redFg   } };
    if ((dRow.getCell(11).value ?? 0) > 0) dRow.getCell(11).font = { color: { argb: C.greenFg } };

    const statusCell = dRow.getCell(4);
    statusCell.fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: e.status === "Posted" ? "FFD1FAE5" : "FFFEF3C7" },
    };
    statusCell.font = { bold: true, color: { argb: e.status === "Posted" ? C.greenFg : "FFB45309" } };
  }

  // Totals row
  const totDr = entries.reduce((s, e) => s + (e.items && e.items.length > 0 ? e.items.filter(it => it.type === "Db").reduce((sum, it) => sum + it.amount, 0) : e.debitAmount),  0);
  const totCr = entries.reduce((s, e) => s + (e.items && e.items.length > 0 ? e.items.filter(it => it.type === "Cr").reduce((sum, it) => sum + it.amount, 0) : e.creditAmount), 0);
  const tRow  = sheet.addRow(["", `TOTALS (${entries.length})`, "", "", "", "", "", totDr || null, "", "", totCr || null]);
  applyTotalRow(tRow);
  if (totDr > 0) { tRow.getCell(8).font  = { bold: true, color: { argb: C.redFg } }; }
  if (totCr > 0) { tRow.getCell(11).font = { bold: true, color: { argb: C.greenFg } }; }

  for (const c of [8, 11]) sheet.getColumn(c).numFmt = '#,##0.00';

  autoWidth(sheet, 7);
  sheet.getColumn(1).width  = 6;
  sheet.getColumn(2).width  = 16;
  sheet.getColumn(3).width  = 13;
  sheet.getColumn(4).width  = 10;
  sheet.getColumn(5).width  = 36;
  sheet.getColumn(6).width  = 26;
  sheet.getColumn(7).width  = 20;
  sheet.getColumn(9).width  = 26;
  sheet.getColumn(10).width = 20;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url    = URL.createObjectURL(blob);
  const link   = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  link.href     = url;
  link.download = `${params.companyName.replace(/\s+/g, "_")}_JV_Register_${params.fyLabel.replace(/\s+/g, "_")}_${dateStr}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── JV Import Template ────────────────────────────────────────────────────────
export async function downloadJVImportTemplate(): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  // ── Data sheet ──────────────────────────────────────────────────────────────
  const sheet = workbook.addWorksheet("JV Import");

  // Headers
  const headers = ["Date", "Narration", "Status", "Cr/Db", "Account Name", "Group Name", "Amount"];
  const hRow = sheet.addRow(headers);
  hRow.height = 22;
  hRow.eachCell((cell) => {
    cell.font  = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C.colHeaderBg } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "medium", color: { argb: "FF818CF8" } } };
  });

  // Sample data rows (one voucher = two rows)
  const sample1 = sheet.addRow(["01/04/2025", "Purchase from ABC", "Posted", "Db", "PURCHASE ACCOUNT", "PURCHASE ACCOUNT", 5000]);
  const sample2 = sheet.addRow(["01/04/2025", "Purchase from ABC", "Posted", "Cr", "SUNDRY CREDITORS", "SUNDRY CREDITORS", 5000]);

  [sample1, sample2].forEach((r, i) => {
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i === 0 ? "FFFFFDE7" : "FFF0FFF4" } };
      cell.font = { italic: true, color: { argb: "FF475569" } };
    });
    r.height = 18;
  });

  // Add 30 blank data rows
  for (let i = 0; i < 30; i++) {
    const r = sheet.addRow([]);
    r.height = 18;
  }

  // Column widths
  sheet.getColumn(1).width = 14;  // Date
  sheet.getColumn(2).width = 36;  // Narration
  sheet.getColumn(3).width = 10;  // Status
  sheet.getColumn(4).width = 8;   // Cr/Db
  sheet.getColumn(5).width = 28;  // Account Name
  sheet.getColumn(6).width = 28;  // Group Name
  sheet.getColumn(7).width = 14;  // Amount

  // ── Instructions sheet ──────────────────────────────────────────────────────
  const instructions = workbook.addWorksheet("Instructions");
  const instData = [
    ["Column",       "Required", "Format / Accepted Values", "Notes"],
    ["Date",         "Yes",      "DD/MM/YYYY  or  YYYY-MM-DD", "Must be within the active financial year"],
    ["Narration",    "No",       "Free text",                 "Rows with same Date+Narration+Status = one voucher"],
    ["Status",       "Yes",      "Posted  or  Draft",          ""],
    ["Cr/Db",        "Yes",      "Db  or  Cr",                 "Db = Debit leg, Cr = Credit leg"],
    ["Account Name", "Yes",      "Exact ledger name (UPPERCASE)", "Must exist in Ledger Master"],
    ["Group Name",   "Yes",      "Exact group name",           "Must match the ledger's group"],
    ["Amount",       "Yes",      "Positive number",            "Sum of Db must = Sum of Cr per voucher"],
    ["", "", "", ""],
    ["RULES", "", "", ""],
    ["1. Each voucher occupies one or more rows. Group rows for the same entry by matching Date + Narration + Status.", "", "", ""],
    ["2. Every voucher must balance: total Debit amount must equal total Credit amount.", "", "", ""],
    ["3. Delete the two sample rows before importing.", "", "", ""],
    ["4. Do NOT modify the header row.", "", "", ""],
  ];

  instData.forEach((row, i) => {
    const r = instructions.addRow(row);
    r.height = i === 0 ? 22 : 20;
    if (i === 0) {
      r.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.colHeaderBg } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
    } else if (i === 9) {
      r.getCell(1).font = { bold: true, color: { argb: C.navyFg } };
    } else if (i >= 10) {
      r.getCell(1).font = { color: { argb: C.grayFg } };
    } else {
      r.eachCell({ includeEmpty: true }, (cell, ci) => {
        const bg = i % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF";
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        if (ci === 1) cell.font = { bold: true, color: { argb: C.indigoFg } };
      });
    }
  });

  instructions.getColumn(1).width = 70;
  instructions.getColumn(2).width = 10;
  instructions.getColumn(3).width = 32;
  instructions.getColumn(4).width = 44;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url    = URL.createObjectURL(blob);
  const link   = document.createElement("a");
  link.href     = url;
  link.download = "JV_Import_Template.xlsx";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── JV Import Parser ──────────────────────────────────────────────────────────
export interface JVImportRow {
  date: string;
  narration: string;
  status: "Posted" | "Draft";
  type: "Db" | "Cr";
  accountName: string;
  groupName: string;
  amount: number;
}

export interface JVImportVoucher {
  date: string;
  narration: string;
  status: "Posted" | "Draft";
  items: { type: "Db" | "Cr"; accountName: string; groupName: string; amount: number }[];
  totalDr: number;
  totalCr: number;
  balanced: boolean;
  errors: string[];
}

export async function parseJVImportFile(file: File): Promise<JVImportVoucher[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });

  // Try "JV Import" sheet first, then fall back to first sheet
  const sheetName = wb.SheetNames.includes("JV Import") ? "JV Import" : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (raw.length < 2) throw new Error("No data rows found in the file.");

  // Find header row (first row that contains "Date")
  const headerIdx = raw.findIndex((row) => row.some((cell: any) => String(cell).trim().toLowerCase() === "date"));
  if (headerIdx < 0) throw new Error("Could not find header row. Make sure the file has 'Date' in the header.");

  const headers = raw[headerIdx].map((h: any) => String(h).trim().toLowerCase());
  const col = {
    date:        headers.indexOf("date"),
    narration:   headers.indexOf("narration"),
    status:      headers.indexOf("status"),
    type:        Math.max(headers.indexOf("cr/db"), headers.indexOf("crdb"), headers.indexOf("type")),
    accountName: Math.max(headers.indexOf("account name"), headers.indexOf("accountname")),
    groupName:   Math.max(headers.indexOf("group name"), headers.indexOf("groupname")),
    amount:      headers.indexOf("amount"),
  };

  const missingCols = Object.entries(col).filter(([, v]) => v < 0).map(([k]) => k);
  if (missingCols.length > 0) throw new Error(`Missing required columns: ${missingCols.join(", ")}`);

  // Parse rows
  const dataRows: JVImportRow[] = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i];
    const dateRaw   = String(row[col.date]   ?? "").trim();
    const accName   = String(row[col.accountName] ?? "").trim();
    const amtRaw    = row[col.amount];
    if (!dateRaw && !accName) continue;  // skip blank rows

    // Normalise date: accept DD/MM/YYYY, YYYY-MM-DD, or serial number
    let date = "";
    if (typeof amtRaw === "number" && dateRaw === "") continue;
    if (/^\d{5,}$/.test(dateRaw)) {
      // Excel serial date
      const jsDate = XLSX.SSF.parse_date_code(Number(dateRaw));
      date = `${jsDate.y}-${String(jsDate.m).padStart(2, "0")}-${String(jsDate.d).padStart(2, "0")}`;
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateRaw)) {
      const [d, m, y] = dateRaw.split("/");
      date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(dateRaw)) {
      date = dateRaw.slice(0, 10);
    } else {
      date = dateRaw;
    }

    const narration  = String(row[col.narration]  ?? "").trim();
    const statusRaw  = String(row[col.status]     ?? "Posted").trim();
    const status: "Posted" | "Draft" = statusRaw.toLowerCase() === "draft" ? "Draft" : "Posted";
    const typeRaw    = String(row[col.type]       ?? "").trim();
    const type: "Db" | "Cr" = typeRaw.toLowerCase() === "cr" ? "Cr" : "Db";
    const groupName  = String(row[col.groupName]  ?? "").trim();
    const amount     = parseFloat(String(amtRaw ?? "0").replace(/,/g, "")) || 0;

    dataRows.push({ date, narration, status, type, accountName: accName.toUpperCase(), groupName: groupName.toUpperCase(), amount });
  }

  if (dataRows.length === 0) throw new Error("No valid data rows found. Make sure the template is filled in correctly.");

  // Group rows into vouchers by Date + Narration + Status
  const voucherMap = new Map<string, JVImportRow[]>();
  for (const r of dataRows) {
    const key = `${r.date}||${r.narration}||${r.status}`;
    if (!voucherMap.has(key)) voucherMap.set(key, []);
    voucherMap.get(key)!.push(r);
  }

  const vouchers: JVImportVoucher[] = [];
  for (const [key, rows] of voucherMap) {
    const [date, narration, status] = key.split("||");
    let totalDr = 0;
    let totalCr = 0;
    const errors: string[] = [];
    const items = rows.map((r) => {
      if (r.type === "Db") totalDr += r.amount;
      else totalCr += r.amount;
      if (!r.accountName) errors.push(`Row missing Account Name`);
      if (r.amount <= 0) errors.push(`Amount must be > 0 for '${r.accountName || "?"}'`);
      return { type: r.type, accountName: r.accountName, groupName: r.groupName, amount: r.amount };
    });
    const balanced = Math.abs(totalDr - totalCr) < 0.01;
    if (!balanced) errors.push(`Unbalanced: Dr ${totalDr.toFixed(2)} ≠ Cr ${totalCr.toFixed(2)}`);
    if (!items.some(it => it.type === "Db")) errors.push("No Debit leg found");
    if (!items.some(it => it.type === "Cr")) errors.push("No Credit leg found");
    if (!date || date === "undefined") errors.push("Invalid date");

    vouchers.push({ date: date ?? "", narration: narration ?? "", status: (status as "Posted" | "Draft") ?? "Posted", items, totalDr, totalCr, balanced, errors });
  }

  return vouchers;
}

export async function exportTrialBalanceDirect(
  data: Awaited<ReturnType<typeof computeTrialBalance>>,
  params: ExportParams
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator  = params.companyName;
  workbook.company  = params.companyName;
  workbook.created  = new Date();
  workbook.modified = new Date();

  buildTrialBalance(workbook, data, params);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url    = URL.createObjectURL(blob);
  const link   = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  link.href     = url;
  link.download = `${params.companyName.replace(/\s+/g, "_")}_Trial_Balance_${params.fyLabel.replace(/\s+/g, "_")}_${dateStr}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportBalanceSheetDirect(
  data: Awaited<ReturnType<typeof computeBalanceSheet>>,
  params: ExportParams
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator  = params.companyName;
  workbook.company  = params.companyName;
  workbook.created  = new Date();
  workbook.modified = new Date();

  buildBalanceSheetSheet(workbook, data, params);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url    = URL.createObjectURL(blob);
  const link   = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  link.href     = url;
  link.download = `${params.companyName.replace(/\s+/g, "_")}_Balance_Sheet_${params.fyLabel.replace(/\s+/g, "_")}_${dateStr}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildPLSheet(
  workbook: ExcelJS.Workbook,
  data: any,
  params: ExportParams
) {
  const sheet = workbook.addWorksheet("Profit & Loss", {
    pageSetup: { paperSize: 9, orientation: "portrait" },
  });
  const colCount = 3;
  const period = `${params.dateFrom} to ${params.dateTo}`;

  addReportHeader(sheet, params.companyName, params.companyAddress, params.fyLabel, "Profit & Loss Statement", period, colCount);

  const addHeader = (label: string, bg = C.sectionBg, fg = C.sectionFg) => {
    const r = sheet.addRow([label, "", ""]);
    sheet.mergeCells(`A${r.number}:C${r.number}`);
    r.getCell(1).font = { bold: true, size: 11, color: { argb: fg } };
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    r.height = 22;
  };

  const addRow = (ledgerName: string, amount: number, isSubtotal = false) => {
    const r = sheet.addRow([ledgerName, "", amount]);
    sheet.mergeCells(`A${r.number}:B${r.number}`);
    if (isSubtotal) {
      r.getCell(1).font = { bold: true, color: { argb: "FF374151" } };
      r.getCell(3).font = { bold: true, color: { argb: "FF374151" } };
      r.getCell(1).fill = r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    } else {
      r.getCell(1).font = { color: { argb: "FF475569" } };
      r.getCell(3).font = { color: { argb: amount >= 0 ? C.greenFg : C.redFg } };
    }
    r.getCell(3).alignment = { horizontal: "right" };
    r.height = 18;
  };

  const addTotalLine = (label: string, amount: number, bg = C.totalBg, fg = C.totalFg) => {
    const r = sheet.addRow([label, "", amount]);
    sheet.mergeCells(`A${r.number}:B${r.number}`);
    r.getCell(1).font = { bold: true, color: { argb: fg } };
    r.getCell(3).font = { bold: true, color: { argb: fg } };
    r.getCell(1).fill = r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    r.getCell(3).alignment = { horizontal: "right" };
    r.getCell(1).border = r.getCell(3).border = { top: { style: "medium", color: { argb: "FF818CF8" } } };
    r.height = 24;
  };

  // 1. Income Section
  addHeader("INCOME", "FF065F46", "FFFFFFFF");
  sheet.addRow(["Sales Revenue (Direct)", "", ""]).getCell(1).font = { italic: true, color: { argb: C.grayFg } };
  data.sales.entries.forEach((e: any) => addRow(e.ledgerName, e.amount));
  addRow("Total Sales Revenue", data.sales.total, true);

  sheet.addRow([]);

  sheet.addRow(["Other Income (Indirect)", "", ""]).getCell(1).font = { italic: true, color: { argb: C.grayFg } };
  data.otherIncome.entries.forEach((e: any) => addRow(e.ledgerName, e.amount));
  addRow("Total Other Income", data.otherIncome.total, true);

  sheet.addRow([]);
  addTotalLine("TOTAL REVENUE (A)", data.totalIncome, "FFE6F4EA", "FF137333");

  sheet.addRow([]);

  // 2. Expenses Section
  addHeader("EXPENSES", "FFB06000", "FFFFFFFF");
  sheet.addRow(["Direct Expenses (Cost of Goods Sold)", "", ""]).getCell(1).font = { italic: true, color: { argb: C.grayFg } };
  data.directExpenses.entries.forEach((e: any) => addRow(e.ledgerName, e.amount));
  addRow("Total Direct Expenses", data.directExpenses.total, true);

  sheet.addRow([]);
  addTotalLine("GROSS PROFIT / LOSS (Sales - Direct Expenses)", data.grossProfit, data.grossProfit >= 0 ? "FFE6F4EA" : "FCE8E6", data.grossProfit >= 0 ? "FF137333" : "FFC5221F");

  sheet.addRow([]);
  sheet.addRow(["Indirect Expenses (Salaries, Rent & Admin)", "", ""]).getCell(1).font = { italic: true, color: { argb: C.grayFg } };
  data.indirectExpenses.entries.forEach((e: any) => addRow(e.ledgerName, e.amount));
  addRow("Total Indirect Expenses", data.indirectExpenses.total, true);

  sheet.addRow([]);
  addTotalLine("TOTAL EXPENSES (B)", data.totalExpenses, "FCE8E6", "FFC5221F");

  sheet.addRow([]);
  addTotalLine(data.isProfit ? "NET PROFIT (A - B + Other Income)" : "NET LOSS (A - B + Other Income)", data.netProfit, data.isProfit ? "FFD1FAE5" : "FFFEE2E2", data.isProfit ? C.greenFg : C.redFg);

  sheet.getColumn(1).width = 45;
  sheet.getColumn(2).width = 12;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(3).numFmt = '₹#,##0.00';
}

export async function exportPLDirect(
  data: any,
  params: ExportParams
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator  = params.companyName;
  workbook.company  = params.companyName;
  workbook.created  = new Date();
  workbook.modified = new Date();

  buildPLSheet(workbook, data, params);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url    = URL.createObjectURL(blob);
  const link   = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  link.href     = url;
  link.download = `${params.companyName.replace(/\s+/g, "_")}_PL_Statement_${params.fyLabel.replace(/\s+/g, "_")}_${dateStr}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportLedgerStatementDirect(
  ledgerName: string,
  groupName: string,
  openingBalance: number,
  rows: any[],
  params: ExportParams
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator  = params.companyName;
  workbook.company  = params.companyName;
  workbook.created  = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Ledger Statement", {
    pageSetup: { paperSize: 9, orientation: "portrait" },
  });
  const colCount = 7;
  const period = `${params.dateFrom} to ${params.dateTo}`;

  addReportHeader(sheet, params.companyName, params.companyAddress, params.fyLabel, `Ledger Statement - ${ledgerName.toUpperCase()}`, `Group: ${groupName} · Period: ${period}`, colCount);

  // Column headers
  const headers = ["Date", "Type", "Vou/Doc No.", "Account Name / Particulars", "Debit", "Credit", "Closing Balance"];
  const hRow = sheet.addRow(headers);
  hRow.height = 22;
  hRow.eachCell((cell) => applyHeaderStyle(cell));

  // 1. Opening Balance Row
  const opRow = sheet.addRow([
    "—", "—", "—", "Opening Balance",
    openingBalance > 0 ? openingBalance : "",
    openingBalance < 0 ? Math.abs(openingBalance) : "",
    openingBalance === 0 ? "NIL" : `${Math.abs(openingBalance).toLocaleString("en-IN")} ${openingBalance >= 0 ? "DB" : "CR"}`
  ]);
  opRow.getCell(4).font = { bold: true, color: { argb: "FF374151" } };
  opRow.getCell(7).font = { bold: true };
  opRow.getCell(5).alignment = { horizontal: "right" };
  opRow.getCell(6).alignment = { horizontal: "right" };
  opRow.getCell(7).alignment = { horizontal: "right" };
  opRow.height = 18;

  // 2. Transaction Rows
  let totalDebit = 0;
  let totalCredit = 0;
  
  rows.forEach((r, idx) => {
    totalDebit += r.debit;
    totalCredit += r.credit;
    
    let dateStr = r.date;
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    const row = sheet.addRow([
      dateStr,
      r.voucherType,
      r.voucherNo || "—",
      r.accountName || "—",
      r.debit > 0 ? r.debit : "",
      r.credit > 0 ? r.credit : "",
      r.balance === 0 ? "NIL" : `${Math.abs(r.balance).toLocaleString("en-IN")} ${r.balance >= 0 ? "DB" : "CR"}`
    ]);
    
    const bg = idx % 2 === 0 ? C.evenRowBg : "FFFFFFFF";
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    });

    row.getCell(5).font = { color: { argb: r.debit > 0 ? C.greenFg : "FF475569" } };
    row.getCell(6).font = { color: { argb: r.credit > 0 ? C.redFg : "FF475569" } };
    row.getCell(7).font = { bold: true };

    row.getCell(5).alignment = { horizontal: "right" };
    row.getCell(6).alignment = { horizontal: "right" };
    row.getCell(7).alignment = { horizontal: "right" };
    row.height = 18;
  });

  // 3. Totals Row
  const totRow = sheet.addRow([
    "TOTAL", "", "", "",
    totalDebit > 0 ? totalDebit : "",
    totalCredit > 0 ? totalCredit : "",
    ""
  ]);
  totRow.getCell(1).font = { bold: true, color: { argb: C.totalFg } };
  totRow.getCell(5).font = { bold: true, color: { argb: C.greenFg } };
  totRow.getCell(6).font = { bold: true, color: { argb: C.redFg } };
  totRow.getCell(1).fill = totRow.getCell(2).fill = totRow.getCell(3).fill = totRow.getCell(4).fill = totRow.getCell(5).fill = totRow.getCell(6).fill = totRow.getCell(7).fill = {
    type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg }
  };
  totRow.getCell(5).alignment = { horizontal: "right" };
  totRow.getCell(6).alignment = { horizontal: "right" };
  totRow.height = 22;

  // 4. Closing Balance Row
  const finalBal = openingBalance + totalDebit - totalCredit;
  const closRow = sheet.addRow([
    "CLOSING BALANCE", "", "", "",
    "", "",
    finalBal === 0 ? "NIL" : `${Math.abs(finalBal).toLocaleString("en-IN")} ${finalBal >= 0 ? "DB" : "CR"}`
  ]);
  closRow.getCell(1).font = { bold: true, color: { argb: C.totalFg } };
  closRow.getCell(7).font = { bold: true, color: { argb: finalBal >= 0 ? C.greenFg : C.redFg } };
  closRow.getCell(1).fill = closRow.getCell(2).fill = closRow.getCell(3).fill = closRow.getCell(4).fill = closRow.getCell(5).fill = closRow.getCell(6).fill = closRow.getCell(7).fill = {
    type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg }
  };
  closRow.getCell(7).alignment = { horizontal: "right" };
  closRow.height = 22;

  // Set widths
  sheet.getColumn(1).width = 13;
  sheet.getColumn(2).width = 8;
  sheet.getColumn(3).width = 15;
  sheet.getColumn(4).width = 32;
  sheet.getColumn(5).width = 15;
  sheet.getColumn(6).width = 15;
  sheet.getColumn(7).width = 20;

  sheet.getColumn(5).numFmt = '₹#,##0.00';
  sheet.getColumn(6).numFmt = '₹#,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url    = URL.createObjectURL(blob);
  const link   = document.createElement("a");
  const dStr   = new Date().toISOString().slice(0, 10);
  link.href     = url;
  link.download = `Ledger_${ledgerName.replace(/\s+/g, "_")}_Statement_${params.fyLabel.replace(/\s+/g, "_")}_${dStr}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
