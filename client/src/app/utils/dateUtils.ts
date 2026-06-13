import type { FinancialYear } from "../api/financialYearApi";

/**
 * Parse a typed date string (shorthand friendly) into a YYYY-MM-DD string.
 *
 * Accepted formats (auto-resolves year from FY if not supplied):
 *   "3103"       → 31-03 of the resolved year
 *   "31-03"      → 31-03 of the resolved year
 *   "31/03"      → 31-03 of the resolved year
 *   "01-04"      → 01-04 of the resolved year
 *   "31-03-25"   → 2025-03-31
 *   "31-03-2025" → 2025-03-31
 *   "2025-03-31" → 2025-03-31  (already YYYY-MM-DD)
 *
 * Year resolution logic (when only DD-MM given):
 *   - If a FinancialYear is active (e.g. 2024-25, startDate=2024-04-01, endDate=2025-03-31)
 *     - Days with month 04-03 in the FY that belong to year1 (April–March):
 *       month >= 4 → use startDate year  (e.g. month=4 → 2024)
 *       month <= 3 → use endDate   year  (e.g. month=3 → 2025)
 *   - Falls back to the current calendar year.
 *
 * Returns:
 *   { date: "YYYY-MM-DD", error: null }        on success
 *   { date: null,         error: "message" }    on parse/range failure
 */
export function parseSmartDate(
  input: string,
  fy: FinancialYear | null
): { date: string | null; error: string | null } {
  if (!input || !input.trim()) return { date: null, error: "Date is required" };

  const s = input.trim().replace(/\s/g, "");

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    day = d; month = m; year = y;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(s)) {
    const parts = s.split(/[\/\-]/);
    day = Number(parts[0]); month = Number(parts[1]); year = Number(parts[2]);
  }
  // DD/MM/YY or DD-MM-YY
  else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}$/.test(s)) {
    const parts = s.split(/[\/\-]/);
    day = Number(parts[0]); month = Number(parts[1]);
    const yy = Number(parts[2]);
    year = yy < 50 ? 2000 + yy : 1900 + yy;
  }
  // DD/MM or DD-MM (no year — resolve from FY)
  else if (/^\d{1,2}[\/\-]\d{1,2}$/.test(s)) {
    const parts = s.split(/[\/\-]/);
    day = Number(parts[0]); month = Number(parts[1]);
    year = resolveYear(month, fy);
  }
  // DDMM (4 digits, no separator)
  else if (/^\d{4}$/.test(s)) {
    day = Number(s.slice(0, 2)); month = Number(s.slice(2, 4));
    year = resolveYear(month, fy);
  }
  // DD only — treat as day in current/FY month? Not enough info — reject
  else {
    return { date: null, error: "Invalid date format. Use DD-MM, DD-MM-YYYY or YYYY-MM-DD." };
  }

  // Basic range checks
  if (!day || !month || !year) return { date: null, error: "Invalid date." };
  if (month < 1 || month > 12) return { date: null, error: `Invalid month: ${month}.` };
  if (day < 1 || day > 31) return { date: null, error: `Invalid day: ${day}.` };

  const formatted = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // Validate it's a real calendar date
  const d = new Date(formatted + "T00:00:00");
  if (isNaN(d.getTime()) || d.getMonth() + 1 !== month || d.getDate() !== day) {
    return { date: null, error: `Invalid date: ${day}/${month}/${year} does not exist.` };
  }

  // Financial year range validation
  if (fy) {
    if (formatted < fy.startDate || formatted > fy.endDate) {
      const fyLabel = fy.label ?? fy.financialYear;
      return {
        date: null,
        error: `Date ${formatToUIDate(formatted)} is outside the active financial year (${fyLabel}: ${formatToUIDate(fy.startDate)} – ${formatToUIDate(fy.endDate)}).`,
      };
    }
  }

  return { date: formatted, error: null };
}

/**
 * Resolves the year for a given month using the active financial year.
 *
 * Indian FY runs Apr-Mar, so:
 *   month >= 4 → belongs to first half (start year)
 *   month <= 3 → belongs to second half (end year)
 */
function resolveYear(month: number | null, fy: FinancialYear | null): number {
  if (!fy || !month) return new Date().getFullYear();
  const startYear = Number(fy.startDate.slice(0, 4));
  const endYear   = Number(fy.endDate.slice(0, 4));
  return month >= 4 ? startYear : endYear;
}

/**
 * Format a YYYY-MM-DD string to DD-MM-YYYY (Indian accounting style).
 */
export function formatToUIDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Format a YYYY-MM-DD string to DD/MM/YYYY.
 */
export function formatToSlashDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
