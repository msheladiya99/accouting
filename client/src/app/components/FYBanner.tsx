import { CalendarRange } from "lucide-react";
import { NavLink } from "react-router";
import { useApp } from "../context/AppContext";

/** A small info strip shown at the top of each report page, indicating the active FY. */
export function FYBanner() {
  const { selectedFY } = useApp();
  if (!selectedFY) return null;

  const statusColors: Record<string, string> = {
    current:  "bg-emerald-50 border-emerald-200 text-emerald-700",
    previous: "bg-slate-100 border-slate-200 text-slate-600",
    future:   "bg-indigo-50 border-indigo-200 text-indigo-700",
    closed:   "bg-red-50 border-red-200 text-red-700",
  };

  return (
    <div className={`flex items-center justify-between px-4 py-2 rounded-xl border text-xs font-medium mb-1 ${statusColors[selectedFY.status]}`}>
      <div className="flex items-center gap-2">
        <CalendarRange size={13} />
        <span>
          Showing data for <strong>{selectedFY.label}</strong>
          {" "}({new Date(selectedFY.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          {" – "}
          {new Date(selectedFY.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })})
        </span>
      </div>
      <NavLink to="/financial-year" className="underline underline-offset-2 hover:opacity-70 transition-opacity whitespace-nowrap ml-4">
        Switch FY
      </NavLink>
    </div>
  );
}
