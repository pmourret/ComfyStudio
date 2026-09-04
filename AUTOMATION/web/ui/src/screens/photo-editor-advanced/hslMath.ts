/* HSL-by-band colour math — pure, no React, no canvas. Own file for the same
   reason as curvesMath.ts: a genuinely separate concern, easy to reason
   about (and get wrong) in isolation from the compositing plumbing.

   SIX BANDS, ONE HUE WHEEL. Lightroom's own HSL/Color panel is the model
   (design-pass §7b): rouges/jaunes/verts/cyans/bleus/magentas, evenly
   spaced 60° apart. A pixel's hue gets a WEIGHT per band from a triangular
   kernel (1 at the band's own centre, 0 at the neighbour's centre, 60°
   away) — two adjacent bands' weights always sum to exactly 1 at any hue
   between them, so there is never a hard seam between bands, and never a
   hue double-counted or dropped either. */

export type HslBandName = 'rouges' | 'jaunes' | 'verts' | 'cyans' | 'bleus' | 'magentas'
export type HslBand = { h: number; s: number; l: number }

export const HSL_BANDS: readonly HslBandName[] = ['rouges', 'jaunes', 'verts', 'cyans', 'bleus', 'magentas']

const BAND_HUE: Record<HslBandName, number> = {
  rouges: 0, jaunes: 60, verts: 120, cyans: 180, bleus: 240, magentas: 300,
}

/** True when every band is either absent or all-zero — lets callers skip
    the whole RGB<->HSL round trip for the common case of an untouched
    layer. */
export function isHslNeutral(hsl: Partial<Record<HslBandName, HslBand>> | undefined): boolean {
  if (!hsl) return true
  return HSL_BANDS.every((band) => {
    const b = hsl[band]
    return !b || (b.h === 0 && b.s === 0 && b.l === 0)
  })
}

function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Weighted h/s/l shift for one pixel's hue (0-360), summed across all 6
    bands' triangular weights. */
function weightedShift(hue: number, hsl: Partial<Record<HslBandName, HslBand>>): HslBand {
  let h = 0
  let s = 0
  let l = 0
  for (const band of HSL_BANDS) {
    const entry = hsl[band]
    if (!entry) continue
    const weight = Math.max(0, 1 - circularDistance(hue, BAND_HUE[band]) / 60)
    if (weight === 0) continue
    h += weight * entry.h
    s += weight * entry.s
    l += weight * entry.l
  }
  return { h, s, l }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60
  return [h, s, l]
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hn = ((h % 360) + 360) % 360 / 360
  return [
    Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hn) * 255),
    Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  ]
}

/** Applies the band adjustments to one RGB pixel, in place semantics via
    return — luminance shift scaled to ±0.5 at the extreme slider value
    (an unscaled ±100% would blow out to black/white far too fast to be
    usable), saturation shift multiplicative (matches how a "more/less
    saturated" slider is expected to behave — a percentage OF the pixel's
    own saturation, not a flat additive one). */
export function applyHslShift(r: number, g: number, b: number, hsl: Partial<Record<HslBandName, HslBand>>): [number, number, number] {
  const [h, s, l] = rgbToHsl(r, g, b)
  const shift = weightedShift(h, hsl)
  if (shift.h === 0 && shift.s === 0 && shift.l === 0) return [r, g, b]
  const nh = h + shift.h
  const ns = Math.max(0, Math.min(1, s * (1 + shift.s / 100)))
  const nl = Math.max(0, Math.min(1, l + (shift.l / 100) * 0.5))
  return hslToRgb(nh, ns, nl)
}
