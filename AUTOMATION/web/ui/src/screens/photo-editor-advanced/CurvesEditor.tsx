/* Tone curve editor — SVG, one channel at a time (RGB/R/V/B tabs), design-
   pass §7b "courbes par canal R/V/B/RGB". Presentational-ish: it owns the
   drag/click INTERACTION locally (a point mid-drag is local state, same
   reasoning `PhotoEditor.tsx`'s own crop-box drag uses — a live gesture is
   not a fact the rest of the app needs to know about until it settles),
   but every COMMITTED change goes out through `onChange`, which is what
   `usePhotoEditorAdvanced.ts` actually writes to history.

   The drawn curve is `buildCurveLut` itself sampled at all 256 inputs —
   never a decorative approximation of it — so what's shown is always
   exactly what gets applied to pixels.

   COORDINATE SPACE: viewBox is `0 0 256 256`, matching pixel values 1:1
   (x = input level, y = output level, SVG's own y FLIPPED so 0 sits at the
   bottom like every tone-curve graph). Screen -> curve-space conversion
   goes through `getScreenCTM()` rather than a manual bounding-box/scale
   calculation — robust to however CSS ends up sizing the `<svg>`, the same
   class of correctness `PhotoEditor.tsx`'s own `displayScale()` has to
   hand-roll for a plain canvas. */
import { useRef, useState } from 'react'

import { buildCurveLut, type CurvePoint } from './curvesMath'

const SIZE = 256
const POINT_RADIUS = 5

type Channel = 'rgb' | 'r' | 'g' | 'b'
const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'rgb', label: 'RGB' },
  { key: 'r', label: 'R' },
  { key: 'g', label: 'V' },
  { key: 'b', label: 'B' },
]
const CHANNEL_STROKE: Record<Channel, string> = {
  rgb: 'var(--txt)', r: '#e0555c', g: '#4caf6e', b: '#4a8fe0',
}

export function CurvesEditor({
  curves, channel, onChannelChange, onChange,
}: {
  curves: { rgb: CurvePoint[]; r: CurvePoint[]; g: CurvePoint[]; b: CurvePoint[] }
  channel: Channel
  onChannelChange: (channel: Channel) => void
  onChange: (channel: Channel, points: CurvePoint[]) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const points = curves[channel]

  /* The live gesture's OWN copy of {index, points} — never the `points`
     PROP once a drag is under way. Found by testing, not by reading the
     JSX: `onBackgroundPointerDown` adds a point and starts dragging it in
     the SAME gesture, but `commit()` (below) only queues a React state
     update — it does not apply synchronously. The `pointermove` listener
     is attached to `document` in that same tick, BEFORE React re-renders
     with the new point in `points`; reading `points` from the closure at
     that moment still sees the OLD (shorter) array, so the newly-added
     point's index looked like the LAST one in that stale array and the
     endpoint-lock logic silently snapped it back to x=255 on the very
     first move — the curve never visibly changed. A ref updated
     synchronously on every move sidesteps the whole class of bug (same
     fix in spirit as `usePhotoEditorAdvanced.ts`'s own coalescing race). */
  const drag = useRef<{ index: number; points: CurvePoint[] } | null>(null)

  const toCurveSpace = (event: { clientX: number; clientY: number }): CurvePoint | null => {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = event.clientX
    pt.y = event.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const local = pt.matrixTransform(ctm.inverse())
    return { x: Math.max(0, Math.min(SIZE - 1, local.x)), y: Math.max(0, Math.min(SIZE - 1, SIZE - local.y)) }
  }

  const commit = (next: CurvePoint[]) => {
    onChange(channel, [...next].sort((a, b) => a.x - b.x))
  }

  const onDragMove = (event: PointerEvent) => {
    const state = drag.current
    if (!state) return
    const p = toCurveSpace(event)
    if (!p) return
    const { index: i, points: pts } = state
    const isFirst = i === 0
    const isLast = i === pts.length - 1
    const prevX = isFirst ? -1 : pts[i - 1].x + 1
    const nextX = isLast ? SIZE : pts[i + 1].x - 1
    const x = isFirst ? 0 : isLast ? SIZE - 1 : Math.max(prevX, Math.min(nextX, Math.round(p.x)))
    const next = [...pts]
    next[i] = { x, y: Math.round(p.y) }
    state.points = next // keeps the NEXT move's clamp bounds current too
    commit(next)
  }

  const stopDrag = () => {
    document.removeEventListener('pointermove', onDragMove)
    drag.current = null
  }

  const startDrag = (index: number) => (event: React.PointerEvent) => {
    event.stopPropagation()
    setSelected(index)
    drag.current = { index, points }
    document.addEventListener('pointermove', onDragMove)
    document.addEventListener('pointerup', stopDrag, { once: true })
  }

  const onBackgroundPointerDown = (event: React.PointerEvent) => {
    const p = toCurveSpace(event)
    if (!p) return
    // Adds a point where clicked, and starts dragging it immediately — the
    // same "click adds and you're already holding it" gesture Lightroom's
    // own curve panel uses, rather than a separate add-then-drag pair of
    // gestures.
    const rounded = { x: Math.round(p.x), y: Math.round(p.y) }
    const next = [...points, rounded].sort((a, b) => a.x - b.x)
    const index = next.indexOf(rounded)
    commit(next)
    setSelected(index)
    drag.current = { index, points: next }
    document.addEventListener('pointermove', onDragMove)
    document.addEventListener('pointerup', stopDrag, { once: true })
  }

  const removePoint = (index: number) => {
    if (index === 0 || index === points.length - 1) return // endpoints are never removable
    commit(points.filter((_, i) => i !== index))
    setSelected(null)
  }

  const lut = buildCurveLut(points)
  const pathD = Array.from(lut).map((y, x) => `${x === 0 ? 'M' : 'L'} ${x},${SIZE - y}`).join(' ')

  return (
    <div>
      <div className="mb-[6px] flex gap-[4px]" role="tablist" aria-label="Canal de la courbe">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={channel === c.key}
            className={`btn sm !px-[10px]${channel === c.key ? ' bg-acc border-acc! text-on-acc font-semibold' : ''}`}
            onClick={() => onChannelChange(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        // `aspect-square` ALONE, no competing `max-h`: the two together
        // fought each other (measured: a 354px-wide panel rendered the
        // graph letterboxed at 200×200 inside its own 354×200 box, so
        // every hit-target radius computed against the intended width came
        // out visibly too small on screen). A tone-curve grid is
        // conventionally square in every professional tool this takes its
        // cue from — trying `preserveAspectRatio="none"` to stretch it into
        // the old non-square box instead just swapped the problem for an
        // ANISOTROPIC one (a circular hit target renders as an ellipse
        // under non-uniform x/y scale — measured 25×14px, meeting the
        // 24px width minimum but not the height one). A true square keeps
        // one uniform scale factor, so a circle stays a circle and the
        // same radius clears 24px in both dimensions. The panel already
        // scrolls (`overflow-y-auto` on its aside), so the taller graph
        // (≈354px) costs scrolling, not breakage.
        className="aspect-square w-full cursor-crosshair touch-none rounded-[6px] border border-line2 bg-panel2"
        onPointerDown={onBackgroundPointerDown}
        role="img"
        aria-label={`Courbe de tonalité, canal ${channel.toUpperCase()} — glisser un point pour la déformer, cliquer une zone vide en ajoute un`}
      >
        {/* thirds grid, reference diagonal (no change) */}
        {[1, 2].map((i) => (
          <g key={i}>
            <line x1={(SIZE / 3) * i} y1={0} x2={(SIZE / 3) * i} y2={SIZE} stroke="var(--line)" strokeWidth={1} />
            <line x1={0} y1={(SIZE / 3) * i} x2={SIZE} y2={(SIZE / 3) * i} stroke="var(--line)" strokeWidth={1} />
          </g>
        ))}
        <line x1={0} y1={SIZE} x2={SIZE} y2={0} stroke="var(--line2)" strokeWidth={1} strokeDasharray="4 4" />
        <path d={pathD} fill="none" stroke={CHANNEL_STROKE[channel]} strokeWidth={2} />
        {points.map((p, i) => (
          // Two circles, not one: a control point drawn at a size that
          // reads well on a tone-curve graph (~8px rendered, audit-measured)
          // is well under the 24×24 CSS px WCAG 2.2 AA target size (SC
          // 2.5.8) — the SAME class of finding the layer-list icon buttons
          // already hit once. The FIX there was to make the button itself
          // bigger; here the visible dot staying small is correct (a
          // professional curve editor's own convention, and the SVG scale
          // makes a literally-24px dot look oversized on the graph) — so
          // the hit target grows via an invisible circle instead, radius
          // chosen so it renders close to 24px at this panel's actual width
          // (~354px measured), same "measured, not guessed" discipline as
          // the label-width fixes in the expression editor's own audit.
          <g
            key={i}
            onPointerDown={startDrag(i)}
            onDoubleClick={(event) => {
              event.stopPropagation()
              removePoint(i)
            }}
            style={{ cursor: 'grab' }}
          >
            <circle cx={p.x} cy={SIZE - p.y} r={9} fill="transparent" pointerEvents="all" />
            <circle
              cx={p.x}
              cy={SIZE - p.y}
              r={selected === i ? POINT_RADIUS + 1.5 : POINT_RADIUS}
              fill={selected === i ? 'var(--acc)' : CHANNEL_STROKE[channel]}
              stroke="var(--bg)"
              strokeWidth={1.5}
              pointerEvents="none"
            />
          </g>
        ))}
      </svg>
      <p className="tiny mt-[4px] opacity-70">
        glisser un point pour courber · double-clic pour en retirer un (sauf les extrémités)
      </p>
    </div>
  )
}
