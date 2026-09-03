/* Exact derivation table of DOCS/design-pass/phase-0b-theme-utilisateur.md
   ("Dérivation exacte"): a character's `appearance` (hue + intensity of the
   neutral scale, hue of the accent) -> the 12 CSS custom properties
   `useCharacterTheme.ts` sets inline on <html>. Pure functions, no DOM. */
import { bestOnColor, contrastRatio, hueDistance, oklchToHex } from './oklch'

export type Appearance = {
  neutralHue?: number | null
  neutralIntensity?: number | null
  accentHue?: number | null
}

// Platform default: intensity 0 makes the neutral hue moot (chroma 0 is pure
// gray regardless of hue) — 220 only matters as the accent's default, and as
// the wheels' resting position before a character has ever touched them.
export const DEFAULT_NEUTRAL_HUE = 220
export const DEFAULT_NEUTRAL_INTENSITY = 0
export const DEFAULT_ACCENT_HUE = 220

const NEUTRAL_L: Record<string, number> = {
  '--bg': 0.15, '--panel': 0.20, '--panel2': 0.25,
  '--line': 0.32, '--line2': 0.44,
  '--dim2': 0.62, '--dim': 0.67, '--txt': 0.90,
}
// factor 1 for surfaces/lines, 0.35 for text roles — keeps text close to
// neutral even at the intensity ceiling (document, §"Pourquoi une intensité").
const NEUTRAL_CHROMA_FACTOR: Record<string, number> = {
  '--bg': 1, '--panel': 1, '--panel2': 1, '--line': 1, '--line2': 1,
  '--dim2': 0.35, '--dim': 0.35, '--txt': 0.35,
}

// Exported: `HueWheel`'s accent ring uses this exact L/C as its reference
// color — the true applied color, not a legibility boost (unlike the
// neutral wheel, whose real chroma tops out at 0.05).
export const ACCENT_L = 0.76
export const ACCENT_C = 0.06
const ACCENT_D_L = 0.54
// Exported: `HueWheel`'s neutral ring reference. NOT the true applied color
// (real chroma tops out at 0.05, Phase 0b's deliberate ceiling — a ring
// drawn at that chroma would look almost flat gray, unusable for picking a
// hue by eye) — a mid lightness and a clearly-legible chroma, for the wheel
// only.
export const NEUTRAL_REFERENCE_L = 0.6
export const NEUTRAL_REFERENCE_C = 0.15

const FOCUS_L_START = 0.90
const FOCUS_L_STEP = 0.02
const FOCUS_L_MAX = 0.97
const FOCUS_HUE_OFFSET = 40

// Verdict hues named in the document — the accent wheel warns within 12° of
// any of these, never the neutral wheel (a capped-intensity fond cannot be
// mistaken for a flat verdict fill).
const VERDICT_HUES: Record<string, number> = { ok: 145, warn: 75, bad: 22, high: 165 }
const VERDICT_WARN_DISTANCE = 12

export type ThemeTokens = Record<string, string>

/** The 8 neutral + 4 accent-derived tokens for a fully-specified appearance
    (all three inputs already resolved to real numbers — no defaulting here,
    see `computeThemeTokens` for that). */
export function deriveTokens(neutralHue: number, neutralIntensity: number, accentHue: number): ThemeTokens {
  const tokens: ThemeTokens = {}

  for (const role of Object.keys(NEUTRAL_L)) {
    const chroma = neutralIntensity * NEUTRAL_CHROMA_FACTOR[role]
    tokens[role] = oklchToHex(NEUTRAL_L[role], chroma, neutralHue)
  }

  const accHex = oklchToHex(ACCENT_L, ACCENT_C, accentHue)
  const accDHex = oklchToHex(ACCENT_D_L, ACCENT_C, accentHue)
  tokens['--acc'] = accHex
  tokens['--acc-d'] = accDHex
  tokens['--on-acc'] = bestOnColor(accHex)

  const focusHue = (accentHue + FOCUS_HUE_OFFSET) % 360
  let focusL = FOCUS_L_START
  let focusHex = oklchToHex(focusL, ACCENT_C, focusHue)
  while (
    focusL < FOCUS_L_MAX &&
    (contrastRatio(focusHex, tokens['--bg']) < 3 || contrastRatio(focusHex, tokens['--panel2']) < 3)
  ) {
    focusL = Math.min(FOCUS_L_MAX, focusL + FOCUS_L_STEP)
    focusHex = oklchToHex(focusL, ACCENT_C, focusHue)
  }
  tokens['--focus'] = focusHex

  return tokens
}

/** Applies platform defaults for whichever of the three dimensions is
    absent — used for a PARTIAL customization (e.g. only the accent hue was
    ever set). Full absence is handled by the caller, which should skip this
    entirely (see `useCharacterTheme.ts`): defaulting all three here would
    compute a "neutral, intensity 0" gray that does not byte-match the
    hand-picked platform hex in tokens.css (chroma 0 is perfectly achromatic;
    the shipped defaults carry a faint tint from Phase 0's own method). */
export function computeThemeTokens(appearance: Appearance): ThemeTokens {
  const neutralHue = appearance.neutralHue ?? DEFAULT_NEUTRAL_HUE
  const neutralIntensity = appearance.neutralIntensity ?? DEFAULT_NEUTRAL_INTENSITY
  const accentHue = appearance.accentHue ?? DEFAULT_ACCENT_HUE
  return deriveTokens(neutralHue, neutralIntensity, accentHue)
}

/** French warning text when `accentHue` sits within 12° of a verdict hue, or
    null. Never called for the neutral wheel (document, "Garde-fou"). */
export function warnNearVerdict(accentHue: number): string | null {
  for (const [name, hue] of Object.entries(VERDICT_HUES)) {
    if (hueDistance(accentHue, hue) < VERDICT_WARN_DISTANCE) {
      const label = name === 'ok' ? 'OK' : name === 'warn' ? 'WATCH' : name === 'bad' ? 'BAD' : 'HIGH'
      return `cette teinte est trop proche du verdict ${label} — un badge et l'accent pourraient se confondre`
    }
  }
  return null
}

/** Every token `useCharacterTheme.ts` / the Apparence panel's live preview
    ever set inline — used to clear them all when a character has nothing
    customized (Phase 0b, "aucune différence visible avec aujourd'hui"). */
export const THEME_TOKEN_NAMES: readonly string[] = [
  '--bg', '--panel', '--panel2', '--line', '--line2', '--txt', '--dim', '--dim2',
  '--acc', '--acc-d', '--on-acc', '--focus',
]
