/* "Histogramme (lecture seule, live)" — design-pass §7b, right panel item 1.
   Presentational: `bins` (luminance, 0-255 bucketed) is computed by the
   Screen from the composited canvas's own pixels, right after each draw —
   no separate render pass, no server round-trip. */
export function Histogram({ bins }: { bins: readonly number[] | null }) {
  if (!bins || bins.length === 0) {
    return <div className="tiny opacity-70">histogramme indisponible</div>
  }
  const max = Math.max(1, ...bins)
  return (
    <div
      className="flex h-[64px] items-end gap-[1px] rounded-[6px] border border-line2 bg-panel px-[4px] py-[4px]"
      aria-hidden="true"
    >
      {bins.map((value, i) => (
        <div
          key={i}
          className="min-w-[1px] flex-1 bg-[var(--dim2)]"
          style={{ height: `${Math.max(1, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}
