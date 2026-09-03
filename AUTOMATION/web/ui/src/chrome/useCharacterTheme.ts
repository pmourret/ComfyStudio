/* Applies the current character's theme override to the whole document via
   inline properties on `:root` (Phase 0b, DOCS/design-pass/
   phase-0b-theme-utilisateur.md) — sibling of `usePackTheme.ts`, same
   `:root`-not-`.app` reasoning (portals must resolve the same palette).

   Where `usePackTheme` toggles a single attribute and lets `tokens.css` do
   the rest, this hook computes the 12 color tokens itself
   (`theme/deriveTheme.ts`, OKLCH) — a pack declares one static skin, a
   character's appearance is arbitrary numbers with no CSS rule to match.

   NOTHING SET IS THE CONTRACT for a character with no `appearance`: this
   clears every token it might have set rather than deriving a "neutral,
   intensity 0" default, which would NOT byte-match the hand-picked platform
   hex already on bare `:root` in tokens.css (chroma 0 is perfectly
   achromatic; the shipped defaults carry a faint tint from Phase 0's own
   method) — see the comment on `computeThemeTokens`. Skipping entirely is
   what makes "no personalization -> no visible difference from today"
   actually hold, rather than merely aim for. */
import { useEffect } from 'react'

import { computeThemeTokens, THEME_TOKEN_NAMES } from './theme/deriveTheme'

export type CharacterAppearance = {
  neutral_hue?: number | null
  neutral_intensity?: number | null
  accent_hue?: number | null
} | null | undefined

export function useCharacterTheme(appearance: CharacterAppearance) {
  const neutralHue = appearance?.neutral_hue ?? null
  const neutralIntensity = appearance?.neutral_intensity ?? null
  const accentHue = appearance?.accent_hue ?? null

  useEffect(() => {
    const root = document.documentElement
    if (neutralHue == null && neutralIntensity == null && accentHue == null) {
      THEME_TOKEN_NAMES.forEach((name) => root.style.removeProperty(name))
      return
    }
    const tokens = computeThemeTokens({ neutralHue, neutralIntensity, accentHue })
    THEME_TOKEN_NAMES.forEach((name) => root.style.setProperty(name, tokens[name]))
  }, [neutralHue, neutralIntensity, accentHue])
}
