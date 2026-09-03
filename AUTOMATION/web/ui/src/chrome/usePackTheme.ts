/* Applies the active pack's token skin to the whole document via a
   `data-pack` attribute on <html> (DOCS/design-pass/phase-0-tokens).

   `:root` and not the shell root (`.app`, see Shell.tsx): custom properties
   must reach EVERYTHING, including a portal to <body> — the ComfyUI-down
   overlay in ApplicationScreen.tsx is one today. That is a different kind
   of state than the chrome classes Shell computes (no-character, focus...),
   which only ever affect chrome-scoped selectors and deliberately stay off
   <body>. Tokens are the identity substrate every var() depends on; :root
   is where a themeable app puts that, and it is exactly what makes portals
   resolve the same palette as the tree they were pulled out of.

   No pack resolved yet (entry gate, wizard before type/style/world pick
   one) clears the attribute rather than pointing at a screen name — falls
   back to the commune values already on plain `:root` in tokens.css. */
import { useEffect } from 'react'

import { useCharacter } from '../character/CharacterContext'

export function usePackTheme() {
  const { sheet } = useCharacter()
  const packId = sheet?.universe.id ?? null

  useEffect(() => {
    const root = document.documentElement
    if (packId) root.dataset.pack = packId
    else delete root.dataset.pack
  }, [packId])
}
