/* A hue wheel: the first circular control in the studio (Phase 0b, DOCS/
   design-pass/phase-0b-theme-utilisateur.md — the document says "roue", not
   a bar). `role="slider"` + manual pointer/keyboard, the same ARIA pattern a
   native `<input type=range>` implements under the hood — there is no HTML
   element for a circular one. Same focus-ring convention as the rest of the
   studio's custom controls (`outline-focus`, e.g. `SceneComposer.tsx`).

   The ring is drawn at a REFERENCE lightness/chroma passed in by the caller,
   not the true applied color: the neutral wheel's real chroma tops out at
   0.05 (Phase 0b's deliberately low ceiling), which would render as an
   almost-flat gray ring — unusable for picking a hue by eye. The accent
   wheel's reference IS its true color (fixed L/C already visible enough,
   see the three pack accents it replaces: #90b0c4 / #d5a051 / #f3896f).
   Either way the handle's own fill uses that same reference color, so the
   handle always matches what it sits on. */
import { useCallback, useId, useMemo, useRef } from 'react'

import { oklchToHex } from './oklch'

const RING_STOPS = 24 // every 15° — smooth enough at any screen size, cheap to compute
const STEP = 1
const BIG_STEP = 10

function ringGradient(trackL: number, trackC: number): string {
  const stops: string[] = []
  for (let i = 0; i <= RING_STOPS; i++) {
    const hue = (360 * i) / RING_STOPS
    const pct = (100 * i) / RING_STOPS
    stops.push(`${oklchToHex(trackL, trackC, hue)} ${pct}%`)
  }
  return `conic-gradient(from 0deg, ${stops.join(', ')})`
}

/* 0deg = up, clockwise positive — matches `conic-gradient(from 0deg, ...)`,
   so the handle always sits on the ring position of its own hue's color. */
function angleFromPointer(clientX: number, clientY: number, rect: DOMRect): number {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const deg = (Math.atan2(clientX - cx, -(clientY - cy)) * 180) / Math.PI
  return (deg + 360) % 360
}

const wrap360 = (deg: number) => ((deg % 360) + 360) % 360

export function HueWheel({
  label,
  value,
  onChange,
  trackL,
  trackC,
  size = 120,
}: {
  label: string
  value: number
  onChange: (hue: number) => void
  trackL: number
  trackC: number
  size?: number
}) {
  const ringRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const id = useId()
  const gradient = useMemo(() => ringGradient(trackL, trackC), [trackL, trackC])

  const moveTo = useCallback(
    (clientX: number, clientY: number) => {
      const el = ringRef.current
      if (!el) return
      onChange(Math.round(angleFromPointer(clientX, clientY, el.getBoundingClientRect())))
    },
    [onChange],
  )

  const onPointerDown = (event: React.PointerEvent) => {
    draggingRef.current = true
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    moveTo(event.clientX, event.clientY)
  }
  const onPointerMove = (event: React.PointerEvent) => {
    if (!draggingRef.current) return
    moveTo(event.clientX, event.clientY)
  }
  const onPointerUp = (event: React.PointerEvent) => {
    draggingRef.current = false
    ;(event.currentTarget as Element).releasePointerCapture(event.pointerId)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = value + STEP
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = value - STEP
    else if (event.key === 'PageUp') next = value + BIG_STEP
    else if (event.key === 'PageDown') next = value - BIG_STEP
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = 359
    if (next === null) return
    event.preventDefault()
    onChange(wrap360(next))
  }

  const angleRad = (value * Math.PI) / 180
  const radius = size / 2 - 10
  const handleX = size / 2 + radius * Math.sin(angleRad)
  const handleY = size / 2 - radius * Math.cos(angleRad)

  return (
    <div
      ref={ringRef}
      role="slider"
      tabIndex={0}
      id={id}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)}°`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      /* No `outline-none` here: it would set `outline-style:none`
         unconditionally, and `focus-visible:outline-2` only ever sets width
         — a style that stays `none` never renders regardless of width/color
         (confirmed live: outline was computed as present but invisible
         before this fix). Same convention as `SceneComposer.tsx`'s tabs —
         leave outline-style alone, only add width/color/offset on focus. */
      className="relative cursor-pointer touch-none rounded-full
                 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
      style={{ width: size, height: size, background: gradient }}
    >
      {/* Handle border is a fixed near-white, not a token: a ring drawn AT every
          hue has no single token color that would stay visible against all of
          them — same raw-on-purpose case as DESIGN.md's "liseré clair des
          pastilles cochées". */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full border-2 border-[#f5f5f5]
                   shadow-[0_0_0_1px_#00000088]"
        style={{
          width: 16,
          height: 16,
          left: handleX - 8,
          top: handleY - 8,
          background: oklchToHex(trackL, trackC, value),
        }}
      />
    </div>
  )
}
