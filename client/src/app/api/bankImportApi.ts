import * as XLSX from "xlsx";
import axiosClient from "./axiosClient";

export interface RawTransaction {
  date: string;
  narration: string;
  withdrawal: number;
  deposit: number;
}

export interface ImportRow extends RawTransaction {
  id: string;
  aiAccountName: string;
  aiAccountGroup: string;
  aiStatus: "idle" | "loading" | "done" | "error";
}

export interface AIMatch {
  accountName: string;
  accountGroup: string;
}

export interface ImportedTransaction extends RawTransaction {
  _id: string;
  accountName: string;
  accountGroup: string;
  importedAt: string;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getImportedTransactions(): Promise<ImportedTransaction[]> {
  const res = await axiosClient.get<ImportedTransaction[]>("/bank-import/transactions");
  return res.data;
}

export async function saveImportedTransactions(rows: ImportRow[]): Promise<void> {
  await axiosClient.post("/bank-import/transactions", { rows });
}

// ── Excel parser ───────────────────────────────────────────────────────────────
function colIdx(headers: string[], keywords: string[]): number {
  return headers.findIndex((h) =>
    typeof h === "string" && keywords.some((k) => h.toLowerCase().includes(k))
  );
}

function parseDate(val: unknown): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  // DD/MM/YYYY or DD-MM-YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    const [, dd, mm, yy] = m1;
    const yyyy = yy.length === 2 ? "20" + yy : yy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function toNum(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = parseFloat(String(val).replace(/[₹$,\s]/g, ""));
  return isNaN(n) ? 0 : Math.abs(n);
}

function parseSheetRows(rows: unknown[][]): RawTransaction[] {
  if (rows.length < 2) return [];

  // Detect header row (first row with "date" or "narration")
  let headerIdx = 0;
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const r = (rows[i] || []) as string[];
    if (r.some((c) => typeof c === "string" && /date|narr|desc|particular/i.test(c))) {
      headerIdx = i;
      break;
    }
  }

  const headers = (rows[headerIdx] as string[]).map((h) => String(h ?? ""));
  const dateCol = colIdx(headers, ["date", "txn date", "value date", "transaction date", "posting"]);
  const narrCol = colIdx(headers, ["narration", "description", "particulars", "remarks", "details", "cheque"]);
  const drCol   = colIdx(headers, ["debit", "withdrawal", "dr amount", "withdrawl", "dr"]);
  const crCol   = colIdx(headers, ["credit", "deposit", "cr amount", "cr"]);
  const amtCol  = colIdx(headers, ["amount"]);

  const txns: RawTransaction[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = (rows[i] || []) as unknown[];

    const date = parseDate(dateCol >= 0 ? row[dateCol] : undefined);
    if (!date) continue;

    const narration = String(narrCol >= 0 ? row[narrCol] ?? "" : "").trim();
    if (!narration) continue;

    let withdrawal = drCol >= 0 ? toNum(row[drCol]) : 0;
    let deposit    = crCol >= 0 ? toNum(row[crCol]) : 0;

    if (withdrawal === 0 && deposit === 0 && amtCol >= 0) {
      const raw = parseFloat(String(row[amtCol] ?? "").replace(/[₹$,\s]/g, ""));
      if (!isNaN(raw)) {
        if (raw < 0) withdrawal = Math.abs(raw);
        else deposit = raw;
      }
    }

    if (withdrawal === 0 && deposit === 0) continue;

    txns.push({ date, narration, withdrawal, deposit });
  }

  return txns;
}

export async function parseExcel(file: File): Promise<RawTransaction[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb  = XLSX.read(buf, { type: "array", cellDates: true });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
        resolve(parseSheetRows(raw));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsArrayBuffer(file);
  });
}

// ── PDF parser (pdfjs-dist) ───────────────────────────────────────────────────
async function extractPDFText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const buf  = await file.arrayBuffer();
  const pdf  = await pdfjsLib.getDocument({ data: buf }).promise;
  let fullText = "";

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lineMap = new Map<number, { x: number; text: string }[]>();

    for (const item of content.items as any[]) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x: item.transform[4], text: item.str });
    }

    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const cells = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      fullText += cells.map((c) => c.text).join("  ") + "\n";
    }
  }

  return fullText;
}

const DATE_RE = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/;
const AMT_RE  = /[\d,]+\.\d{2}/g;

function parsePDFText(text: string): RawTransaction[] {
  const lines  = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const txns: RawTransaction[] = [];

  for (const line of lines) {
    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;

    const date = parseDate(dateMatch[1]);
    if (!date) continue;

    const amounts = [...line.matchAll(AMT_RE)].map((m) =>
      parseFloat(m[0].replace(/,/g, ""))
    );
    if (amounts.length < 2) continue;

    const afterDate  = line.slice(line.indexOf(dateMatch[1]) + dateMatch[1].length);
    const narrMatch  = afterDate.match(/^[\s\-\/]*([\w\s\/\-\.#@&(),]+?)\s+[\d,]+\.\d{2}/);
    const narration  = (narrMatch?.[1] ?? afterDate.replace(AMT_RE, "").replace(/\s+/g, " ")).trim();

    if (!narration || narration.length < 3) continue;

    let withdrawal = 0, deposit = 0;

    if (amounts.length >= 3) {
      const [a, b] = amounts;
      const drFirst = /dr|debit|withdrawal/i.test(line.slice(0, line.search(AMT_RE) + 10));
      if (drFirst) { withdrawal = a; deposit = b; }
      else          { deposit = a; withdrawal = b; }
      if (withdrawal === deposit) { deposit = a; withdrawal = 0; }
    } else if (amounts.length === 2) {
      const isCr = /cr|credit|deposit/i.test(line);
      if (isCr) deposit = amounts[0];
      else      withdrawal = amounts[0];
    }

    if (withdrawal === 0 && deposit === 0) continue;

    txns.push({ date, narration, withdrawal, deposit });
  }

  return txns;
}

export async function parsePDF(file: File): Promise<RawTransaction[]> {
  const text = await extractPDFText(file);
  return parsePDFText(text);
}

// ── Claude AI enrichment ──────────────────────────────────────────────────────
export async function enrichWithClaude(
  narrations: string[],
  apiKey: string,
): Promise<AIMatch[]> {
  const prompt = `You are an Indian Accountant.

Based on these bank transaction narrations, suggest the accounting ledger account name and group for each.

Available Groups (use exactly one of these): Assets, Liabilities, Capital, Income, Expense, Bank, Cash, Purchases, Sales, Sundry Debtors, Sundry Creditors

Rules:
- UPI/NEFT/RTGS payments to vendors → Sundry Creditors
- UPI/NEFT receipts from customers → Sundry Debtors
- Salary, rent, marketing, utilities → Expense (with descriptive name)
- Sales, online orders → Sales
- GST, TDS, tax → Liabilities
- Bank charges, interest paid → Expense
- Interest received, FD proceeds → Income
- Loan disbursement/repayment → Liabilities
- Purchase of goods/materials → Purchases
- Asset purchase (equipment, laptop) → Assets

Return ONLY a valid JSON array with exactly ${narrations.length} objects, one per narration in the same order:
[{"accountName":"...","accountGroup":"..."}, ...]

Narrations:
${narrations.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":                          "application/json",
      "x-api-key":                             apiKey,
      "anthropic-version":                     "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message ?? `API error ${res.status}`);
  }

  const data = await res.json();
  const text = (data.content[0] as any).text as string;

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Could not parse AI response as JSON");

  const parsed: AIMatch[] = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || parsed.length !== narrations.length) {
    throw new Error("AI returned unexpected number of results");
  }
  return parsed;
}

// ── Sample demo data ──────────────────────────────────────────────────────────
export const SAMPLE_TRANSACTIONS: RawTransaction[] = [
  { date: "2026-05-01", narration: "NEFT-INWARD-ABC CORP LTD-INV1001",             withdrawal: 0,      deposit: 185000 },
  { date: "2026-05-02", narration: "UPI/DR/SWIGGY INDIA PVT LTD",                  withdrawal: 850,    deposit: 0      },
  { date: "2026-05-05", narration: "RENT PMT-PRESTIGE ESTATES-MAY2026",             withdrawal: 120000, deposit: 0      },
  { date: "2026-05-07", narration: "NEFT-SIGMA SUPPLIES CO-INVOICE#4521",           withdrawal: 245000, deposit: 0      },
  { date: "2026-05-10", narration: "SALARY CR-HDFC PAYROLL-APR ARREARS",            withdrawal: 850000, deposit: 0      },
  { date: "2026-05-12", narration: "ONLINE SALES-AMAZON PAY SETTLEMENT",            withdrawal: 0,      deposit: 320000 },
  { date: "2026-05-13", narration: "UPI-ZOMATO BUSINESS-MARKETING",                 withdrawal: 15000,  deposit: 0      },
  { date: "2026-05-15", narration: "GST TDS PAYMENT Q4 FY2025-26",                  withdrawal: 95000,  deposit: 0      },
  { date: "2026-05-16", narration: "NEFT-INWARD-XYZ TECH PVT LTD-INV2002",         withdrawal: 0,      deposit: 92500  },
  { date: "2026-05-18", narration: "FD MATURITY PROCEEDS-HDFC BANK",               withdrawal: 0,      deposit: 500000 },
  { date: "2026-05-20", narration: "RTGS-METRO RAW MATERIALS-PO#3311",              withdrawal: 68000,  deposit: 0      },
  { date: "2026-05-22", narration: "CONSULTING REVENUE-PRESTIGE HOLDINGS",          withdrawal: 0,      deposit: 450000 },
  { date: "2026-05-24", narration: "LAPTOP PURCHASE-DELL INDIA PVT LTD x5",        withdrawal: 185000, deposit: 0      },
  { date: "2026-05-25", narration: "BANK CHARGES-SERVICE FEE MAY2026",              withdrawal: 1200,   deposit: 0      },
  { date: "2026-05-28", narration: "ELECTRICITY BILL-BESCOM PAYMENT",               withdrawal: 8500,   deposit: 0      },
  { date: "2026-05-29", narration: "NEFT-INWARD-GLOBAL TRADERS INC",               withdrawal: 0,      deposit: 67000  },
  { date: "2026-05-30", narration: "SBI LOAN EMI-TERM LOAN REPAYMENT",              withdrawal: 120000, deposit: 0      },
  { date: "2026-05-30", narration: "INTEREST INCOME-SAVINGS ACCOUNT APR",           withdrawal: 0,      deposit: 3200   },
];
