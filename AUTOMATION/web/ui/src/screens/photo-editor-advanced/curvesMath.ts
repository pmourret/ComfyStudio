/* Tone curve math — pure, no React, no canvas: a 256-entry lookup table
   built from a handful of user-placed control points. Split out of
   `photoEditorLayersPixels.ts` because it is genuinely its own concern
   (frontend.md: shared-by-nothing-else pure math gets its own file), and
   because a monotone spline is exactly the kind of thing worth reasoning
   about — and testing — without a canvas in the room.

   MONOTONE CUBIC HERMITE (Fritsch-Carlson), not a naive Catmull-Rom spline:
   a naive spline can overshoot between two close control points and make
   the resulting LUT NON-monotonic — two adjacent input levels mapping to
   an inverted output order, which reads as a visible band or a colour
   inversion in flat skies/skin tones. Fritsch-Carlson clamps the tangents
   so the interpolated curve never overshoots past monotonic input points —
   the standard fix for exactly this failure mode in tone-curve editors. */

export type CurvePoint = { x: number; y: number }

const LUT_SIZE = 256

/** Points sorted by `x`. The editor is expected to keep them sorted and
    x-unique (drag is clamped against neighbours) — this still re-sorts
    defensively rather than trust a persisted layer that could have come
    from a hand-edited sidecar. */
function sortedUnique(points: readonly CurvePoint[]): CurvePoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x)
  const out: CurvePoint[] = []
  for (const p of sorted) {
    if (out.length && out[out.length - 1].x === p.x) out[out.length - 1] = p
    else out.push(p)
  }
  return out
}

/** Fritsch-Carlson tangents at each control point, monotonicity-clamped. */
function monotoneTangents(points: readonly CurvePoint[]): number[] {
  const n = points.length
  if (n < 2) return new Array(n).fill(0)
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    d.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx)
  }
  const m: number[] = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1] === 0 || d[i] === 0 || (d[i - 1] > 0) !== (d[i] > 0) ? 0 : (d[i - 1] + d[i]) / 2
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const alpha = m[i] / d[i]
    const beta = m[i + 1] / d[i]
    const s = alpha * alpha + beta * beta
    if (s > 9) {
      const tau = 3 / Math.sqrt(s)
      m[i] = tau * alpha * d[i]
      m[i + 1] = tau * beta * d[i]
    }
  }
  return m
}

/** Evaluates the Hermite spline at one `x`, given points already sorted
    and their monotone tangents. Clamps to the first/last point outside the
    control range — a curve never extrapolates past its own endpoints. */
function evalHermite(points: readonly CurvePoint[], tangents: readonly number[], x: number): number {
  const n = points.length
  if (n === 0) return x
  if (x <= points[0].x) return points[0].y
  if (x >= points[n - 1].x) return points[n - 1].y
  let i = 0
  while (i < n - 2 && x > points[i + 1].x) i++
  const x0 = points[i].x
  const x1 = points[i + 1].x
  const y0 = points[i].y
  const y1 = points[i + 1].y
  const dx = x1 - x0
  if (dx === 0) return y0
  const t = (x - x0) / dx
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  return h00 * y0 + h10 * dx * tangents[i] + h01 * y1 + h11 * dx * tangents[i + 1]
}

/** Builds the 256-entry LUT for one channel's curve. `points.length < 2`
    (should not happen — every curve always carries its two endpoints) is
    treated as the identity curve rather than throwing: a malformed
    persisted layer must degrade to "no effect", never a crash. */
export function buildCurveLut(points: readonly CurvePoint[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(LUT_SIZE)
  const sorted = sortedUnique(points)
  if (sorted.length < 2) {
    for (let i = 0; i < LUT_SIZE; i++) lut[i] = i
    return lut
  }
  const tangents = monotoneTangents(sorted)
  for (let i = 0; i < LUT_SIZE; i++) lut[i] = Math.round(evalHermite(sorted, tangents, i))
  return lut
}

/** True when the curve is exactly the default two-point identity line —
    lets callers skip building/applying a LUT that would not change
    anything, the common case for a layer that never touched this tab. */
export function isIdentityCurve(points: readonly CurvePoint[]): boolean {
  const sorted = sortedUnique(points)
  return sorted.length === 2
    && sorted[0].x === 0 && sorted[0].y === 0
    && sorted[1].x === 255 && sorted[1].y === 255
}
