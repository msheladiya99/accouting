/**
 * SmartDateInput
 *
 * A date input component that supports:
 *  - Typing shorthand dates like "31-03", "31/03", "3103", "31-03-25", "31-03-2025"
 *  - Automatically resolving the year from the active financial year
 *  - A calendar icon that opens the native date picker restricted to the FY range
 *  - Visual formatting in DD-MM-YYYY style
 *
 * Props:
 *   value      - controlled YYYY-MM-DD value (from react-hook-form)
 *   onChange   - callback with YYYY-MM-DD string on valid parse
 *   onError    - callback with error string on failed parse
 *   selectedFY - the active financial year (for year resolution & min/max)
 *   hasError   - whether to render red error border
 *   className  - optional extra classes
 *   id         - optional input id
 *   disabled   - optional disabled state
 */
import { useState, useRef, useEffect } from "react";
import { CalendarDays } from "lucide-react";
import type { FinancialYear } from "../../api/financialYearApi";
import { parseSmartDate, formatToUIDate } from "../../utils/dateUtils";

interface SmartDateInputProps {
  value: string;                   // YYYY-MM-DD (controlled)
  onChange: (v: string) => void;   // receives YYYY-MM-DD
  onError?: (msg: string) => void; // receives error message
  selectedFY: FinancialYear | null;
  hasError?: boolean;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export function SmartDateInput({
  value,
  onChange,
  onError,
  selectedFY,
  hasError,
  className = "",
  id,
  disabled,
}: SmartDateInputProps) {
  // Text displayed in the input box (DD-MM-YYYY or whatever the user is typing)
  const [textVal, setTextVal]   = useState<string>(value ? formatToUIDate(value) : "");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const hiddenDateRef = useRef<HTMLInputElement>(null);

  // Sync external value changes back to display string
  useEffect(() => {
    if (value) {
      setTextVal(formatToUIDate(value));
    } else {
      setTextVal("");
    }
  }, [value]);

  function handleBlur() {
    if (!textVal.trim()) return;

    const { date, error } = parseSmartDate(textVal, selectedFY);
    if (error || !date) {
      setLocalErr(error ?? "Invalid date");
      onError?.(error ?? "Invalid date");
      // Don't clear the text — keep user's input so they can fix it
    } else {
      setLocalErr(null);
      setTextVal(formatToUIDate(date));
      onChange(date);
    }
  }

  function handleCalendarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawVal = e.target.value; // YYYY-MM-DD
    if (!rawVal) return;
    const { date, error } = parseSmartDate(rawVal, selectedFY);
    if (error || !date) {
      setLocalErr(error ?? "Invalid date");
      onError?.(error ?? "Invalid date");
    } else {
      setLocalErr(null);
      setTextVal(formatToUIDate(date));
      onChange(date);
    }
  }

  const showError = hasError || !!localErr;
  const baseClass = `w-full px-3 py-2.5 rounded-lg text-sm outline-none border transition-all pr-10`;
  const stateClass = showError
    ? "border-red-300 bg-red-50 focus:ring-2 focus:ring-red-100 focus:border-red-400"
    : "border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400";

  return (
    <div className={`relative ${className}`}>
      {/* Text input for typing */}
      <input
        id={id}
        type="text"
        value={textVal}
        disabled={disabled}
        placeholder="DD-MM-YYYY"
        onChange={(e) => {
          setTextVal(e.target.value);
          setLocalErr(null);
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleBlur();
          }
        }}
        className={`${baseClass} ${stateClass}`}
      />

      {/* Calendar icon button */}
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => hiddenDateRef.current?.showPicker?.()}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition-colors"
        title="Open date picker"
      >
        <CalendarDays size={16} />
      </button>

      {/* Hidden native date input — used only for the calendar picker */}
      <input
        ref={hiddenDateRef}
        type="date"
        tabIndex={-1}
        value={value || ""}
        min={selectedFY?.startDate ?? undefined}
        max={selectedFY?.endDate ?? undefined}
        onChange={handleCalendarChange}
        className="sr-only"
        aria-hidden
      />

      {/* Inline error message */}
      {localErr && (
        <p className="mt-1 text-xs text-red-600">{localErr}</p>
      )}
    </div>
  );
}
