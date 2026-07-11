/**
 * PageSkeleton.tsx — Premium animated skeleton loader used during lazy-loaded page chunks.
 * Replaces the blank white flash that appears before each page's JS bundle loads.
 */
export function PageSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-5 animate-pulse">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <div className="h-7 w-52 bg-slate-200 rounded-lg" />
          <div className="h-4 w-36 bg-slate-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-slate-200 rounded-lg" />
          <div className="h-9 w-28 bg-slate-200 rounded-lg" />
          <div className="h-9 w-32 bg-indigo-100 rounded-lg" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-lg shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-3 w-20 bg-slate-100 rounded" />
              <div className="h-5 w-28 bg-slate-200 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        {/* Table header */}
        <div className="flex gap-4 px-4 py-3 bg-slate-50 border-b border-slate-100">
          {[3, 8, 5, 5, 5].map((w, i) => (
            <div key={i} className={`h-3 bg-slate-200 rounded w-${w * 4}`} style={{ width: `${w * 2}rem` }} />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 px-4 py-3 border-b border-slate-50"
            style={{ opacity: 1 - i * 0.08 }}
          >
            {[3, 8, 5, 5, 5].map((w, j) => (
              <div key={j} className="h-3 bg-slate-100 rounded" style={{ width: `${w * 2}rem` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full-page shimmer card used for heavier report pages. */
export function ReportSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200 rounded-lg" />
          <div className="h-4 w-40 bg-slate-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-20 bg-slate-200 rounded-lg" />
          <div className="h-9 w-20 bg-slate-200 rounded-lg" />
          <div className="h-9 w-28 bg-indigo-100 rounded-lg" />
        </div>
      </div>

      {/* Status banner */}
      <div className="h-12 bg-slate-100 rounded-xl" />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-slate-100">
            <div className="h-3 w-20 bg-slate-100 rounded mb-2" />
            <div className="h-6 w-32 bg-slate-200 rounded" />
          </div>
        ))}
      </div>

      {/* Two-column report layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[0, 1].map((col) => (
          <div key={col} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <div className="h-10 bg-slate-50 border-b border-slate-100 px-4 flex items-center">
              <div className="h-3 w-32 bg-slate-200 rounded" />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
                <div className="h-3 rounded bg-slate-100" style={{ width: `${40 + Math.random() * 40}%` }} />
                <div className="h-3 w-20 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
