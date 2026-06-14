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
  balance?: number;
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

export async function saveImportedTransactions(
  rows: ImportRow[],
  accountId: string,
  bankName?: string,
  statementOpeningBalance?: number
): Promise<void> {
  await axiosClient.post("/bank-import/transactions", { rows, accountId, bankName, statementOpeningBalance });
}

// ── Excel parser ───────────────────────────────────────────────────────────────
function colIdx(headers: string[], keywords: string[]): number {
  return headers.findIndex((h) =>
    typeof h === "string" && keywords.some((k) => h.toLowerCase().includes(k))
  );
}

const MONTHS_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  january: "01", february: "02", march: "03", april: "04", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12"
};

function parseDate(val: unknown): string {
  if (!val) return "";
  
  // ── 1. Handle JavaScript Date objects (extract local components to avoid timezone shift) ──
  if (val instanceof Date) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, "0");
    const dd = String(val.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  
  // ── 2. Handle Numeric Excel date serial numbers (typically 30000 to 60000) ──
  if (typeof val === "number") {
    if (val > 30000 && val < 60000) {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }
    }
  }

  const s = String(val).trim();
  
  // Handle stringified Excel serial date number
  if (/^\d{5}$/.test(s)) {
    const num = parseInt(s, 10);
    if (num > 30000 && num < 60000) {
      const d = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }
    }
  }

  // ── 3. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY ──
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m1) {
    const [, dd, mm, yy] = m1;
    const yyyy = yy.length === 2 ? "20" + yy : yy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  
  // ── 4. YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD ──
  const m2 = s.match(/^(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})$/);
  if (m2) {
    const [, yyyy, mm, dd] = m2;
    return `${yyyy}-${mm}-${dd}`;
  }

  // ── 5. DD-MMM-YYYY or DD MMM YYYY or DD-MMM-YY (accepting dot separator) ──
  const m3 = s.match(/^(\d{1,2})[\s\/\-\.]([a-zA-Z]{3,9})[\s\/\-\.](\d{2,4})$/);
  if (m3) {
    const [, dd, monthName, yy] = m3;
    const mm = MONTHS_MAP[monthName.toLowerCase()];
    if (mm) {
      const yyyy = yy.length === 2 ? "20" + yy : yy;
      return `${yyyy}-${mm}-${dd.padStart(2, "0")}`;
    }
  }

  // ── 6. MMM-DD-YYYY or MMM DD, YYYY (accepting dot separator) ──
  const m4 = s.match(/^([a-zA-Z]{3,9})[\s\/\-\.](\d{1,2})(?:,\s*|[\s\/\-\.])(\d{2,4})$/);
  if (m4) {
    const [, monthName, dd, yy] = m4;
    const mm = MONTHS_MAP[monthName.toLowerCase()];
    if (mm) {
      const yyyy = yy.length === 2 ? "20" + yy : yy;
      return `${yyyy}-${mm}-${dd.padStart(2, "0")}`;
    }
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
  }
  return "";
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
  const narrCol = colIdx(headers, ["narration", "description", "particulars", "particular", "remarks", "details", "cheque", "chq", "transaction narration", "narration/description"]);
  const drCol   = colIdx(headers, ["debit", "withdrawal", "dr amount", "withdrawl", "dr", "debit amount", "withdrawal amount", "paid out"]);
  const crCol   = colIdx(headers, ["credit", "deposit", "cr amount", "cr", "credit amount", "deposit amount", "paid in"]);
  const amtCol  = colIdx(headers, ["amount", "transaction amount"]);

  const txns: RawTransaction[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = (rows[i] || []) as unknown[];

    const date = parseDate(dateCol >= 0 ? row[dateCol] : undefined);
    if (!date) continue;

    // Try primary narration column, then fallback to scanning all cells for longest text value
    let narration = String(narrCol >= 0 ? row[narrCol] ?? "" : "").trim();
    if (!narration && narrCol < 0) {
      // No narration column detected — pick the longest non-numeric string in the row
      narration = row
        .map(c => String(c ?? "").trim())
        .filter(c => c.length > 3 && isNaN(Number(c.replace(/[,₹$\s]/g, ""))))
        .sort((a, b) => b.length - a.length)[0] ?? "";
    }
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

    // Last resort: scan every cell for a non-zero numeric value if we still have 0/0
    // (handles banks that put a single amount in an unlabelled column)
    if (withdrawal === 0 && deposit === 0) {
      const skipCols = new Set([dateCol, narrCol, amtCol, drCol, crCol].filter(c => c >= 0));
      for (let ci = 0; ci < row.length; ci++) {
        if (skipCols.has(ci)) continue;
        const raw = parseFloat(String(row[ci] ?? "").replace(/[₹$,\s]/g, ""));
        if (!isNaN(raw) && raw !== 0) {
          if (raw < 0) withdrawal = Math.abs(raw);
          else deposit = raw;
          break;
        }
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
export async function extractPDFText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  // Collect ALL lines from ALL pages first, then deduplicate.
  // Bank statements often render as many PDF sub-pages (e.g. 74 PDF pages for a
  // 15-page statement), repeating the same transaction rows on every sub-page.
  const allLines: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Group text items on the same visual line (within 4 units of y-coordinate)
    const linesArray: { y: number; cells: { x: number; text: string }[] }[] = [];

    for (const item of content.items as any[]) {
      if (!item.str?.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];

      let matchedLine = linesArray.find((l) => Math.abs(l.y - y) <= 6);
      if (matchedLine) {
        matchedLine.cells.push({ x, text: item.str });
      } else {
        linesArray.push({ y, cells: [{ x, text: item.str }] });
      }
    }

    // Sort lines from top of page to bottom, then left-to-right within each line
    linesArray.sort((a, b) => b.y - a.y);
    for (const lineObj of linesArray) {
      const sortedCells = lineObj.cells.sort((a, b) => a.x - b.x);
      // Use 4 spaces to clearly separate columns (helps narration extraction)
      allLines.push(sortedCells.map((c) => c.text).join("    "));
    }
  }

  // ── Deduplicate lines across pages ────────────────────────────────────────
  // Bank statements often repeat header rows on each page. We deduplicate
  // ONLY header/footer type lines (those without decimal amounts) to avoid
  // removing genuine duplicate transactions (same narration + same amount).
  // Strategy: lines that contain a decimal amount (\d+\.\d{2}) are kept always;
  // purely text lines (headers, footers, labels) are deduplicated.
  const seenTextLines = new Set<string>();
  const uniqueLines: string[] = [];

  for (const line of allLines) {
    const normalized = line.replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalized) continue;
    
    // Check if this line contains a decimal amount (likely a transaction or balance line)
    const hasAmount = /\d[,\d]*\.\d{2}/.test(line);
    if (hasAmount) {
      // Always include transaction lines (even if repeated text — diff amounts)
      uniqueLines.push(line);
    } else {
      // Text-only lines (headers, footers) — deduplicate
      if (seenTextLines.has(normalized)) continue;
      seenTextLines.add(normalized);
      uniqueLines.push(line);
    }
  }

  return uniqueLines.join("\n");
}

const DATE_4_RE = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}-\d{2}-\d{2})/;
const DATE_2_RE = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2})/;
const DATE_TEXT_1_RE = /(\d{1,2}[\s\-\/][a-zA-Z]{3,9}[\s\-\/]\d{2,4})/;
const DATE_TEXT_2_RE = /([a-zA-Z]{3,9}[\s\-\/]\d{1,2},?\s*\d{2,4})/;
const AMT_RE  = /[\d,]+\.\d{2}/g;

function isDepositNarration(narration: string): boolean {
  const text = narration.toLowerCase();
  if (/\bby\b|inward|receipt|rcvd|received|credit|cr\b|deposit|salary|refund|interest|dividend|cash-in/i.test(text)) {
    if (/\bto\b|payment|withdrawal|debit|dr\b|charge|fee|commission|purchase|payment|wdwl/i.test(text)) {
      if (/reversal|refund/i.test(text)) return true;
      return false;
    }
    return true;
  }
  return false;
}

interface TempTxn {
  date: string;
  rawDateStr: string;
  narration: string;
  amounts: number[];
  line: string;
}

// ── Pre-process: merge split transaction lines ────────────────────────────────
// Federal Bank (and some other banks) render PDFs where the date+narration is
// on line N, and the withdrawal/deposit amounts are on line N+1 or N+2.
// Because isMainLine() requires BOTH a date AND amounts on the same line,
// such transactions would be entirely missed.
// This function detects date-only lines and merges the following amount line(s)
// into them so the main parser sees a single combined line.
function mergeTransactionLines(lines: string[]): string[] {
  // Non-global versions for safe use with .test()
  const HAS_DATE = /^.{0,15}(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\s\-\/][a-zA-Z]{3,9}[\s\-\/]\d{2,4}|[a-zA-Z]{3,9}[\s\-\/]\d{1,2},?\s*\d{2,4})/;
  const HAS_AMT  = /\d[\d,]*\.\d{2}/;
  const IS_BALANCE_SUMMARY = /closing\s*balance|opening\s*balance|balance\s*[bc][\/.]?f|brought\s*forward|carried\s*forward|page\s*total|grand\s*total/i;

  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineHasDate = HAS_DATE.test(line);
    const lineHasAmt  = HAS_AMT.test(line);

    if (lineHasDate && !lineHasAmt && !IS_BALANCE_SUMMARY.test(line)) {
      // Date-only transaction line — look ahead up to 3 lines for amounts
      let merged = line;
      let j = i + 1;
      let foundAmt = false;

      while (j < lines.length && j <= i + 3) {
        const nl = lines[j].trim();
        if (!nl) { j++; continue; }

        // Stop if next line starts a new transaction or is a balance summary
        if (HAS_DATE.test(nl) || IS_BALANCE_SUMMARY.test(nl)) break;

        merged = merged + "    " + nl;

        if (HAS_AMT.test(nl)) {
          i = j;   // Skip absorbed lines
          foundAmt = true;
          break;
        }
        j++;
        i = j - 1;
      }

      result.push(merged);
    } else {
      result.push(line);
    }
    i++;
  }

  return result;
}

function parsePDFText(text: string): RawTransaction[] {
  let lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // Pre-process: merge split transaction lines (date on one line, amounts on next)
  lines = mergeTransactionLines(lines);
  const tempTxns: TempTxn[] = [];
  let openingBalRow: RawTransaction | null = null;
  let preNarrationForNext = "";

  const isMainLine = (l: string): boolean => {
    const isOpBal = /opening\s*balance|bal\s*b\/f|balance\s*b\/f|brought\s*forward|opening\s*bal/i.test(l);
    if (!isOpBal && /closing\s*balance|balance\s*c\/f|carried\s*forward|page\s+(\d+|total)|statement\s*of|generated\s*on|period|interest\s*rate|limit\s*amount|drawing\s*power|overdraft|page\s*total/i.test(l)) {
      return false;
    }
    const dateMatch = l.match(DATE_4_RE) || 
                      l.match(DATE_2_RE) || 
                      l.match(DATE_TEXT_1_RE) || 
                      l.match(DATE_TEXT_2_RE);
    if (!dateMatch) return false;
    const matchIndex = l.indexOf(dateMatch[0]);
    if (matchIndex > 15) return false;
    const hasAmounts = l.match(AMT_RE) !== null;
    return hasAmounts;
  };

  let isTableInProgress = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const isOpBal = /opening\s*balance|bal\s*b\/f|balance\s*b\/f|brought\s*forward|opening\s*bal/i.test(line);

    if (!isOpBal && /closing\s*balance|balance\s*c\/f|carried\s*forward|page\s+(\d+|total)|statement\s*of|generated\s*on|period|interest\s*rate|limit\s*amount|drawing\s*power|overdraft|page\s*total/i.test(line)) {
      isTableInProgress = false;
      continue;
    }

    const isMain = isMainLine(line);

    if (isMain || isOpBal) {
      isTableInProgress = true;
    }

    if (!isMain) {
      if (!isTableInProgress) {
        continue;
      }
      const cleanLine = line.replace(/\s+/g, " ").trim();
      // Skip header-like single-word lines
      if (cleanLine.length <= 1 || /^(particulars|narration|description|date|amount|balance|sr\.?\s*no|debit|credit|withdrawal|deposit|chq|ref|utr|txn|transaction)$/i.test(cleanLine)) {
        continue;
      }
      // ── Critical fix: skip balance-summary lines (Closing Balance, Opening Balance, etc.)
      // These appear as continuation lines in many PDFs and must NOT be appended to narrations.
      if (/closing\s*balance|opening\s*balance|balance\s*[bc][\/.\\]?f|brought\s*forward|carried\s*forward|balance\s*brought|balance\s*carried|page\s*total|sub[\s\-]*total|grand\s*total|total\s*transactions/i.test(cleanLine)) {
        isTableInProgress = false;
        continue;
      }
      const nextLine = lines[idx + 1];
      const nextIsMain = nextLine && isMainLine(nextLine);
      if (nextIsMain) {
        // This line is narration for the NEXT main transaction line
        preNarrationForNext = preNarrationForNext ? preNarrationForNext + " " + cleanLine : cleanLine;
      } else if (tempTxns.length > 0) {
        const last = tempTxns[tempTxns.length - 1];
        const isJustDate = last.narration.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$|^\d{4}-\d{2}-\d{2}$/);
        if (!last.narration || isJustDate) {
          last.narration = cleanLine;
        } else {
          // Only append if it looks like a continuation (not a number-only line)
          const isNumberOnly = /^[\d,\.\s₹$]+$/.test(cleanLine);
          if (!isNumberOnly) {
            last.narration += " " + cleanLine;
          }
        }
      }
      continue;
    }

    const dateMatch = line.match(DATE_4_RE) || 
                      line.match(DATE_2_RE) || 
                      line.match(DATE_TEXT_1_RE) || 
                      line.match(DATE_TEXT_2_RE);
    const date = parseDate(dateMatch![1]);
    if (!date) continue;

    const amounts = [...line.matchAll(AMT_RE)].map((m) =>
      parseFloat(m[0].replace(/,/g, ""))
    );
    if (amounts.length === 0) continue;

    const afterDate  = line.slice(line.indexOf(dateMatch![1]) + dateMatch![1].length);
    // Match narration: text between the date and the first decimal amount
    const narrMatch  = afterDate.match(/^[\s\-\/]*([\s\S]+?)(?:\s{2,}|\t)[\d,]+\.\d{2}/) ||
                       afterDate.match(/^[\s\-\/]*([\s\S]+?)\s+[\d,]+\.\d{2}/);
    let narration    = (narrMatch?.[1] ?? afterDate.replace(AMT_RE, "").replace(/\s+/g, " ")).trim();

    while (true) {
      const dateStartMatch = narration.match(/^(?:[\s\-\/]*)(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\s\-\/][a-zA-Z]{3,9}[\s\-\/]\d{2,4}|[a-zA-Z]{3,9}[\s\-\/]\d{1,2},?\s*\d{2,4})/);
      if (dateStartMatch) {
        narration = narration.slice(dateStartMatch[0].length).trim();
      } else {
        break;
      }
    }
    narration = narration.replace(/^[\s\-\/]+|[\s\-\/]+$/g, "").trim();

    if (isOpBal) {
      const opAmt = amounts[0] || 0;
      openingBalRow = {
        date,
        narration: "Opening Balance",
        withdrawal: 0,
        deposit: opAmt
      };
      continue;
    }

    if (preNarrationForNext) {
      narration = preNarrationForNext + " " + narration;
      preNarrationForNext = "";
    }

    tempTxns.push({ date, rawDateStr: dateMatch![1], narration, amounts, line });
  }

  const txns: RawTransaction[] = [];
  if (openingBalRow) {
    txns.push(openingBalRow);
  }

  for (let i = 0; i < tempTxns.length; i++) {
    let { date, rawDateStr, narration, amounts, line } = tempTxns[i];
    let withdrawal = 0, deposit = 0;

    narration = narration.trim();
    if (!narration || narration.length < 2) {
      continue;
    }

    if (amounts.length >= 3) {
      const [a, b, bal] = amounts;
      let solved = false;

      // 1. Try reverse chronological order (current is newer, next is older)
      if (i < tempTxns.length - 1 && tempTxns[i + 1].amounts.length >= 2) {
        const nextBal = tempTxns[i + 1].amounts[tempTxns[i + 1].amounts.length - 1];
        const diff = bal - nextBal;
        if (Math.abs(diff - a) < 0.05) {
          deposit = a; withdrawal = b; solved = true;
        } else if (Math.abs(diff - b) < 0.05) {
          deposit = b; withdrawal = a; solved = true;
        } else if (Math.abs(diff + a) < 0.05) {
          withdrawal = a; deposit = b; solved = true;
        } else if (Math.abs(diff + b) < 0.05) {
          withdrawal = b; deposit = a; solved = true;
        }
      }

      // 2. Try chronological order (current is older, next is newer)
      if (!solved && i > 0 && tempTxns[i - 1].amounts.length >= 2) {
        const prevBal = tempTxns[i - 1].amounts[tempTxns[i - 1].amounts.length - 1];
        const diff = bal - prevBal;
        if (Math.abs(diff - a) < 0.05) {
          deposit = a; withdrawal = b; solved = true;
        } else if (Math.abs(diff - b) < 0.05) {
          deposit = b; withdrawal = a; solved = true;
        } else if (Math.abs(diff + a) < 0.05) {
          withdrawal = a; deposit = b; solved = true;
        } else if (Math.abs(diff + b) < 0.05) {
          withdrawal = b; deposit = a; solved = true;
        }
      }

      // 3. Fallback to keyword / text coordinate match
      if (!solved) {
        const drFirst = /dr|debit|withdrawal/i.test(line.slice(0, line.search(AMT_RE) + 10));
        if (drFirst) { withdrawal = a; deposit = b; }
        else          { deposit = a; withdrawal = b; }
        if (withdrawal === deposit) { deposit = a; withdrawal = 0; }
      }
    } else if (amounts.length === 2) {
      const [amt, bal] = amounts;
      let solved = false;

      // 1. Try reverse chronological order
      if (i < tempTxns.length - 1 && tempTxns[i + 1].amounts.length >= 2) {
        const nextBal = tempTxns[i + 1].amounts[tempTxns[i + 1].amounts.length - 1];
        const diff = bal - nextBal;
        if (Math.abs(diff - amt) < 0.05) {
          deposit = amt; withdrawal = 0; solved = true;
        } else if (Math.abs(diff + amt) < 0.05) {
          withdrawal = amt; deposit = 0; solved = true;
        }
      }

      // 2. Try chronological order
      if (!solved && i > 0 && tempTxns[i - 1].amounts.length >= 2) {
        const prevBal = tempTxns[i - 1].amounts[tempTxns[i - 1].amounts.length - 1];
        const diff = bal - prevBal;
        if (Math.abs(diff - amt) < 0.05) {
          deposit = amt; withdrawal = 0; solved = true;
        } else if (Math.abs(diff + amt) < 0.05) {
          withdrawal = amt; deposit = 0; solved = true;
        }
      }

      // 3. Fallback to keywords
      if (!solved) {
        const isDep = isDepositNarration(narration) || /cr|credit|deposit/i.test(line);
        if (isDep) {
          deposit = amt; withdrawal = 0;
        } else {
          withdrawal = amt; deposit = 0;
        }
      }
    } else if (amounts.length === 1) {
      const amt = amounts[0];
      const isDep = isDepositNarration(narration) || /cr|credit|deposit/i.test(line);
      if (isDep) {
        deposit = amt; withdrawal = 0;
      } else {
        withdrawal = amt; deposit = 0;
      }
    }

    if (withdrawal === 0 && deposit === 0) continue;

    // Clean narration: remove date string prefix and trailing decimal amount numbers
    // Only remove tokens that exactly match an amount in amounts[] or are substrings of rawDateStr
    const rawTokens = narration.split(/\s+/);
    const amountStrings = amounts.map(num => num.toFixed(2));

    const cleanedTokens = rawTokens.filter((token) => {
      const tNorm = token.replace(/,/g, "").trim();
      if (!tNorm) return false;

      // Skip exact date string match
      if (tNorm === rawDateStr) return false;
      
      // Skip tokens that are pure decimal numbers matching transaction amounts
      // (e.g. "12,345.67" or "12345.67" matching an amount)
      const tNoComma = tNorm.replace(/,/g, "");
      const val = parseFloat(tNoComma);
      if (!isNaN(val) && /^\d[\d,]*\.\d{2}$/.test(tNorm)) {
        // It looks like a formatted decimal — check if it matches an amount
        if (amounts.some(num => Math.abs(num - val) < 0.02)) {
          return false;
        }
        if (amountStrings.includes(tNoComma)) {
          return false;
        }
      }
      return true;
    });

    let cleanedNarration = cleanedTokens.join(" ").trim();
    cleanedNarration = cleanedNarration.replace(/^[\s\-\/]+|[\s\-\/]+$/g, "").trim();

    if (!cleanedNarration) {
      cleanedNarration = "Bank Transaction";
    }

    txns.push({ date, narration: cleanedNarration, withdrawal, deposit });
  }

  return txns;
}

export async function parsePDF(file: File): Promise<RawTransaction[]> {
  const text = await extractPDFText(file);
  return parsePDFText(text);
}

// Helper to convert File to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

export interface ParseResult {
  bankName: string;
  transactions: RawTransaction[];
}

// ── Bank name detector (regex-based, no AI needed for PDFs) ──────────────────
const KNOWN_BANKS: { pattern: RegExp; name: string }[] = [
  { pattern: /bank\s+of\s+baroda/i,                        name: "Bank of Baroda" },
  { pattern: /state\s+bank\s+of\s+india|SBI/i,            name: "State Bank of India" },
  { pattern: /hdfc\s+bank/i,                              name: "HDFC Bank" },
  { pattern: /icici\s+bank/i,                             name: "ICICI Bank" },
  { pattern: /axis\s+bank/i,                              name: "Axis Bank" },
  { pattern: /kotak\s+mahindra|kotak\s+bank/i,           name: "Kotak Mahindra Bank" },
  { pattern: /punjab\s+national\s+bank|PNB/i,            name: "Punjab National Bank" },
  { pattern: /canara\s+bank/i,                            name: "Canara Bank" },
  { pattern: /union\s+bank/i,                             name: "Union Bank of India" },
  { pattern: /bank\s+of\s+india\b/i,                      name: "Bank of India" },
  { pattern: /indian\s+bank/i,                            name: "Indian Bank" },
  { pattern: /central\s+bank\s+of\s+india/i,             name: "Central Bank of India" },
  { pattern: /idbi\s+bank/i,                              name: "IDBI Bank" },
  { pattern: /yes\s+bank/i,                               name: "Yes Bank" },
  { pattern: /indusind\s+bank/i,                          name: "IndusInd Bank" },
  { pattern: /federal\s+bank/i,                           name: "Federal Bank" },
  { pattern: /south\s+indian\s+bank/i,                    name: "South Indian Bank" },
  { pattern: /karnataka\s+bank/i,                         name: "Karnataka Bank" },
  { pattern: /bandhan\s+bank/i,                           name: "Bandhan Bank" },
];

export function detectBankNameFromText(text: string): string {
  // Only scan the first 2000 chars — bank name is always in the header
  const header = text.slice(0, 2000);
  for (const { pattern, name } of KNOWN_BANKS) {
    if (pattern.test(header)) return name;
  }
  return "";
}

// ── AI Statement parsing via OpenRouter (Proxy through Backend) ─────────────────
// NOTE: This is only used for IMAGE files (png/jpg/jpeg/webp).
// PDF files use the local parser (parsePDF) for reliable, exact transaction counts.
export async function parseStatementWithAI(file: File): Promise<ParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  
  let payload: any = { fileName: file.name };

  if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
    const base64Data = await fileToBase64(file);
    payload.fileBase64 = base64Data;
  } else if (ext === "pdf") {
    const rawText = await extractPDFText(file);
    if (rawText.trim() && rawText.length >= 50) {
      payload.rawText = rawText;
    } else {
      const base64Data = await fileToBase64(file);
      payload.fileBase64 = base64Data;
    }
  } else {
    throw new Error("Unsupported file type for AI parsing");
  }

  const res = await axiosClient.post<ParseResult>("/bank-import/parse", payload);
  return res.data;
}

// ── OpenRouter AI enrichment (Proxy through Backend) ───────────────────────────
export async function enrichWithOpenRouter(narrations: string[]): Promise<AIMatch[]> {
  const res = await axiosClient.post<AIMatch[]>("/bank-import/enrich", { narrations });
  return res.data;
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
