import ExcelJS from "exceljs";
import { computeTrialBalance } from "./trialBalanceApi";
import { getAllEntries, getAllAccounts, computeRows } from "./bankCashBookApi";
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
    const dRow = sheet.addRow([
      sr++, e.voucherNo, e.date, e.narration,
      e.debitAccount, e.debitGroup, e.debitAmount,
      e.creditAccount, e.creditGroup, e.creditAmount,
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
  const totDr = entries.reduce((s, e) => s + e.debitAmount,  0);
  const totCr = entries.reduce((s, e) => s + e.creditAmount, 0);
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
