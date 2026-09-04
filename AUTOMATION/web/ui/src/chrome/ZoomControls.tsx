/* Presentational only (frontend.md) — paired with `useZoomPan.ts`. Same
   visual pattern as the mask-edit banner in PhotoEditorAdvancedScreen.tsx
   (`absolute` pill over the stage), `btn sm` chain already used everywhere
   else in these two editors (RATIOS, MaskPicker's mode buttons). */
export function ZoomControls({
  zoomPct,
  fitPct,
  onZoomOut,
  onZoomToFit,
  onZoomIn,
  className,
}: {
  zoomPct: number
  fitPct: number
  onZoomOut: () => void
  onZoomToFit: () => void
  onZoomIn: () => void
  className?: string
}) {
  return (
    <div
      className={`absolute bottom-[8px] flex items-center gap-[4px] rounded-[6px] bg-scrim px-[6px] py-[4px]${className ? ` ${className}` : ''}`}
    >
      <button type="button" className="btn sm !px-[9px]" aria-label="Zoom arrière" onClick={onZoomOut}>
        −
      </button>
      <button
        type="button"
        className="btn sm !px-[8px] tabular-nums"
        aria-label={zoomPct === fitPct ? 'Zoom ajusté à l’écran' : 'Ajuster le zoom à l’écran'}
        onClick={onZoomToFit}
      >
        {zoomPct}%
      </button>
      <button type="button" className="btn sm !px-[9px]" aria-label="Zoom avant" onClick={onZoomIn}>
        +
      </button>
    </div>
  )
}
