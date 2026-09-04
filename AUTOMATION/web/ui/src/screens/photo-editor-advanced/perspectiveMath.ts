/* Perspective ("keystone") correction — pure, no React, no canvas beyond
   the ImageData it's handed. Own file, same reasoning as curvesMath.ts/
   hslMath.ts: a genuinely separate concern (2D projective geometry), easy
   to get subtly wrong in isolation from the compositing plumbing.

   CANVAS 2D HAS NO NATIVE PROJECTIVE TRANSFORM — `ctx.setTransform` is
   affine only (scale/rotate/skew/translate, 6 parameters), it cannot
   express a true keystone warp. This module computes the projective
   (homography) matrix by hand and resamples pixel by pixel.

   MODEL: the FULL source image maps onto a trapezoid INSET within the
   destination canvas (not the other way around) — `perspH`/`perspV`
   choose which pair of opposite destination edges narrows. A destination
   pixel that falls in the canvas but OUTSIDE that trapezoid has no source
   content and is left TRANSPARENT — this is deliberate (design-pass §7b:
   "coin hors de la source = transparent"), matching what every
   perspective-correction tool this takes its cue from actually does: no
   auto-crop happens here, cropping stays the simplified modal's job. */

type Point = { x: number; y: number }
/** Row-major 3×3: [a,b,c, d,e,f, g,h,i]. */
type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

/** Paul Heckbert's square-to-quad homography (a standard, well-documented
    construction — not derived ad hoc here): the UNIT SQUARE
    (0,0)-(1,0)-(1,1)-(0,1) maps onto the given quad's four corners, in the
    same order. Returns the row-major matrix `[a..i]` such that
    `(x,y,w) = M · (u,v,1)`, actual point `(x/w, y/w)`. */
function squareToQuadMatrix(p0: Point, p1: Point, p2: Point, p3: Point): Mat3 {
  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const dy3 = p0.y - p1.y + p2.y - p3.y

  if (dx3 === 0 && dy3 === 0) {
    // parallelogram: no perspective term needed (g=h=0)
    return [
      p1.x - p0.x, p3.x - p0.x, p0.x,
      p1.y - p0.y, p3.y - p0.y, p0.y,
      0, 0, 1,
    ]
  }
  const denom = dx1 * dy2 - dx2 * dy1
  const g = denom === 0 ? 0 : (dx3 * dy2 - dx2 * dy3) / denom
  const h = denom === 0 ? 0 : (dx1 * dy3 - dx3 * dy1) / denom
  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1,
  ]
}

/** Standard adjugate/determinant 3×3 inverse. `null` on a singular matrix
    (degenerate quad — e.g. two corners coincide) rather than dividing by
    zero into NaN pixels. */
function invert3x3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-9) return null
  const invDet = 1 / det
  const D = -(b * i - c * h)
  const E = a * i - c * g
  const F = -(a * h - b * g)
  const G = b * f - c * e
  const H = -(a * f - c * d)
  const I = a * e - b * d
  return [A * invDet, D * invDet, G * invDet, B * invDet, E * invDet, H * invDet, C * invDet, F * invDet, I * invDet]
}

function apply(m: Mat3, x: number, y: number): Point {
  const w = m[6] * x + m[7] * y + m[8]
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w }
}

/** How far the strength scales at the ±30° bound — tuned so the extreme
    slider value produces a visible, controllable warp without inverting
    the trapezoid on itself. Not derived from a real lens/sensor model:
    this is a "correction" tool operating on a flat approximation, same
    honesty as `photoEditorPixels.ts`'s own temperature wash. */
const STRENGTH = 0.35

function destQuad(width: number, height: number, perspHDeg: number, perspVDeg: number) {
  const insetV = Math.tan((perspVDeg * Math.PI) / 180) * width * STRENGTH
  const insetH = Math.tan((perspHDeg * Math.PI) / 180) * height * STRENGTH
  const topX = Math.max(0, insetV)
  const bottomX = Math.max(0, -insetV)
  const leftY = Math.max(0, insetH)
  const rightY = Math.max(0, -insetH)
  return {
    tl: { x: topX, y: leftY },
    tr: { x: width - topX, y: rightY },
    br: { x: width - bottomX, y: height - rightY },
    bl: { x: bottomX, y: height - leftY },
  }
}

/** Warps whatever is painted on `ctx` in place. No-op when both angles are
    zero (the common case — most layers never touch this panel). */
export function warpPerspective(ctx: CanvasRenderingContext2D, width: number, height: number, perspHDeg: number, perspVDeg: number): void {
  if (!perspHDeg && !perspVDeg) return
  const quad = destQuad(width, height, perspHDeg, perspVDeg)
  // Unit square (0,0)-(1,0)-(1,1)-(0,1) -> dest quad, then INVERTED: for a
  // dest pixel we need (u,v) back, not the forward direction.
  const forward = squareToQuadMatrix(quad.tl, quad.tr, quad.br, quad.bl)
  const inverse = invert3x3(forward)
  if (!inverse) return

  const src = ctx.getImageData(0, 0, width, height)
  const srcData = src.data
  const out = ctx.createImageData(width, height)
  const outData = out.data

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const { x: u, y: v } = apply(inverse, dx, dy)
      const oi = (dy * width + dx) * 4
      if (u < 0 || u > 1 || v < 0 || v > 1) {
        outData[oi + 3] = 0 // outside the mapped trapezoid: transparent
        continue
      }
      const sx = u * (width - 1)
      const sy = v * (height - 1)
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(width - 1, x0 + 1)
      const y1 = Math.min(height - 1, y0 + 1)
      const fx = sx - x0
      const fy = sy - y0
      for (let c = 0; c < 4; c++) {
        const p00 = srcData[(y0 * width + x0) * 4 + c]
        const p10 = srcData[(y0 * width + x1) * 4 + c]
        const p01 = srcData[(y1 * width + x0) * 4 + c]
        const p11 = srcData[(y1 * width + x1) * 4 + c]
        const top = p00 + (p10 - p00) * fx
        const bottom = p01 + (p11 - p01) * fx
        outData[oi + c] = Math.round(top + (bottom - top) * fy)
      }
    }
  }
  ctx.putImageData(out, 0, 0)
}
