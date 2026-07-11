/**
 * SkeletonLoaders.tsx
 *
 * Page-specific skeleton components for every report page.
 * These are shown while data is loading — replacing full-page spinners
 * with shimmering placeholders that match the actual layout.
 *
 * The "animate-pulse" Tailwind class drives the shimmer animation.
 * No changes to accounting logic or data.
 */

// ── Shared shimmer bar ─────────────────────────────────────────────────────────
function ShimmerBar({ w = "100%", h = "12px", className = "" }: { w?: string; h?: string; className?: string }) {
  return (
    <div
      className={`bg-slate-200 rounded ${className}`}
      style={{ width: w, height: h }}
    />
  );
}

// ── Trial Balance Skeleton ─────────────────────────────────────────────────────
export function TrialBalanceSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <ShimmerBar w="180px" h="28px" />
          <ShimmerBar w="140px" h="16px" className="bg-slate-100" />
        </div>
        <div className="flex gap-2">
          <ShimmerBar w="90px" h="36px" />
          <ShimmerBar w="100px" h="36px" />
          <ShimmerBar w="110px" h="36px" className="bg-indigo-100" />
        </div>
      </div>

      {/* Status banner */}
      <ShimmerBar h="48px" className="rounded-xl bg-slate-100" />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl p-3 border border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-100 rounded-lg shrink-0" />
            <div className="space-y-1.5 flex-1">
              <ShimmerBar w="60px" h="10px" className="bg-slate-100" />
              <ShimmerBar w="40px" h="16px" />
            </div>
          </div>
        ))}
      </div>

      {/* AG Grid skeleton */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Column headers */}
        <div className="flex gap-0 bg-slate-50 border-b border-slate-200 px-3 py-2.5">
          {["14%", "22%", "11%", "11%", "11%", "11%", "10%", "10%"].map((w, i) => (
            <div key={i} style={{ width: w }} className="pr-3">
              <ShimmerBar h="10px" />
            </div>
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-0 px-3 py-2.5 border-b border-slate-50"
            style={{ opacity: Math.max(0.15, 1 - i * 0.06) }}
          >
            {["14%", "22%", "11%", "11%", "11%", "11%", "10%", "10%"].map((w, j) => (
              <div key={j} style={{ width: w }} className="pr-3">
                <ShimmerBar
                  h="10px"
                  w={j === 0 ? "80%" : j === 1 ? "60%" : "50%"}
                  className={j % 2 === 0 ? "bg-slate-100" : "bg-slate-50"}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Balance Sheet Skeleton ─────────────────────────────────────────────────────
export function BalanceSheetSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <ShimmerBar w="160px" h="28px" />
          <ShimmerBar w="130px" h="16px" className="bg-slate-100" />
        </div>
        <div className="flex gap-2">
          {[80, 90, 100, 120].map((w) => (
            <ShimmerBar key={w} w={`${w}px`} h="36px" />
          ))}
        </div>
      </div>

      {/* Status + cards */}
      <ShimmerBar h="48px" className="rounded-xl bg-emerald-50" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-lg" />
            <div className="space-y-2 flex-1">
              <ShimmerBar w="80px" h="10px" className="bg-slate-100" />
              <ShimmerBar w="100px" h="18px" />
            </div>
          </div>
        ))}
      </div>

      {/* Two-column B/S layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {["Liabilities & Capital", "Assets"].map((col) => (
          <div key={col} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-800 flex items-center gap-2">
              <ShimmerBar w="140px" h="14px" className="bg-slate-600" />
            </div>
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50"
                style={{ opacity: Math.max(0.2, 1 - i * 0.07) }}
              >
                <ShimmerBar w={`${30 + (i % 5) * 10}%`} h="10px" className={i % 3 === 0 ? "bg-slate-200" : "bg-slate-100"} />
                <ShimmerBar w="80px" h="10px" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── P&L Statement Skeleton ─────────────────────────────────────────────────────
export function PLStatementSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <ShimmerBar w="200px" h="28px" />
          <ShimmerBar w="160px" h="16px" className="bg-slate-100" />
        </div>
        <div className="flex gap-2">
          {[80, 90, 100, 120].map((w) => (
            <ShimmerBar key={w} w={`${w}px`} h="36px" />
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {[80, 100, 90, 110, 95, 80].map((w, i) => (
            <ShimmerBar key={i} w={`${w}px`} h="32px" className="rounded-lg" />
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-100 rounded-lg" />
            <div className="space-y-1.5 flex-1">
              <ShimmerBar w="60px" h="10px" className="bg-slate-100" />
              <ShimmerBar w="80px" h="16px" />
            </div>
          </div>
        ))}
      </div>

      {/* Section blocks */}
      {["Income", "Direct Expenses", "Indirect Expenses"].map((section, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className={`px-5 py-3.5 flex items-center justify-between ${i === 0 ? "bg-emerald-600" : i === 1 ? "bg-amber-600" : "bg-red-600"}`}>
            <ShimmerBar w="140px" h="14px" className="bg-white/30" />
            <ShimmerBar w="80px" h="18px" className="bg-white/30" />
          </div>
          {Array.from({ length: 4 }).map((_, j) => (
            <div key={j} className="flex items-center justify-between px-5 py-3 border-b border-slate-50">
              <ShimmerBar w={`${30 + j * 8}%`} h="10px" className="bg-slate-100" />
              <ShimmerBar w="70px" h="10px" className="bg-slate-100" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Ledger Master Skeleton ─────────────────────────────────────────────────────
export function LedgerMasterSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <ShimmerBar w="160px" h="28px" />
          <ShimmerBar w="130px" h="14px" className="bg-slate-100" />
        </div>
        <div className="flex gap-2">
          <ShimmerBar w="100px" h="36px" className="bg-indigo-100" />
          <ShimmerBar w="90px" h="36px" />
        </div>
      </div>

      {/* Search + filter row */}
      <div className="flex gap-2">
        <ShimmerBar w="260px" h="36px" className="rounded-lg" />
        <ShimmerBar w="120px" h="36px" className="rounded-lg" />
        <ShimmerBar w="100px" h="36px" className="rounded-lg" />
      </div>

      {/* AG Grid skeleton */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex gap-0 bg-slate-50 border-b border-slate-200 px-3 py-2.5">
          {["6%", "35%", "30%", "15%", "14%"].map((w, i) => (
            <div key={i} style={{ width: w }} className="pr-3">
              <ShimmerBar h="10px" />
            </div>
          ))}
        </div>
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-0 px-3 py-3 border-b border-slate-50 items-center"
            style={{ opacity: Math.max(0.1, 1 - i * 0.055) }}
          >
            <div style={{ width: "6%" }} className="pr-3">
              <div className="w-4 h-4 bg-slate-100 rounded" />
            </div>
            <div style={{ width: "35%" }} className="pr-3">
              <ShimmerBar h="10px" w={`${50 + (i % 5) * 10}%`} />
            </div>
            <div style={{ width: "30%" }} className="pr-3">
              <ShimmerBar h="10px" w="60%" className="bg-slate-100" />
            </div>
            <div style={{ width: "15%" }} className="pr-3">
              <ShimmerBar h="10px" w="70%" className="bg-slate-100" />
            </div>
            <div style={{ width: "14%" }}>
              <div className="flex gap-1">
                <div className="w-6 h-6 bg-slate-100 rounded" />
                <div className="w-6 h-6 bg-slate-100 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Background Refresh Indicator ──────────────────────────────────────────────
/**
 * A subtle "Refreshing…" badge shown in the top-right of a report while fresh
 * data loads in the background. Does NOT block the page — old data stays visible.
 */
export function RefreshingBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium bg-white border border-slate-200 rounded-full px-3 py-1 shadow-sm">
      <div className="w-2.5 h-2.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      Refreshing…
    </div>
  );
}
