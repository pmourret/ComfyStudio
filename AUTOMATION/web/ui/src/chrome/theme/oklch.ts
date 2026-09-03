/* OKLCH -> sRGB conversion and WCAG contrast math, hand-written rather than
   pulled in as a dependency: this is the first color-picker UI in the
   studio, the formulas are short and stable (CSS Color 4 / Björn Ottosson's
   OKLab), and a portable app gains nothing from a package for ~40 lines of
   pure math. No DOM, no React — safe to exercise from a throwaway Node
   script (there is no unit-test runner in this frontend yet). */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function srgbGamma(c: number): number {
  const v = clamp01(c)
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}

function toHex2(v: number): string {
  return Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')
}

/** OKLCH(l, c, hDeg) -> `#rrggbb`. l in [0,1], c roughly [0, 0.4], h in degrees. */
export function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b

  const ll = l_ ** 3
  const mm = m_ ** 3
  const ss = s_ ** 3

  const r = +4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss
  const g = -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss
  const bl = -0.0041960863 * ll - 0.7034186147 * mm + 1.7076147010 * ss

  return `#${toHex2(srgbGamma(r))}${toHex2(srgbGamma(g))}${toHex2(srgbGamma(bl))}`
}

function hexToLinearChannels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const chan = (byte: number) => {
    const s = byte / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return [chan((n >> 16) & 255), chan((n >> 8) & 255), chan(n & 255)]
}

/** WCAG relative luminance of a `#rrggbb` color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToLinearChannels(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two `#rrggbb` colors, >= 1. */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA)
  const lb = relativeLuminance(hexB)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Whichever of near-black / near-white contrasts best against `bgHex` —
    the text color to paint ON a flat accent fill. */
export function bestOnColor(bgHex: string): string {
  const dark = '#050505'
  const light = '#f5f5f5'
  return contrastRatio(dark, bgHex) >= contrastRatio(light, bgHex) ? dark : light
}

/** Shortest distance between two hues on the 360° circle, in [0, 180]. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}
