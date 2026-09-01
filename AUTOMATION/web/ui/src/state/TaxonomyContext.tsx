/* The creative taxonomy of the current character: intentions, tones, intensity
   tiers. Ported from `static/taxonomy.js`.

   IT IS DATA, NEVER A HARD-CODED LIST. The scene cards, the composer and the
   intensity slider all read their vocabulary here; a screen that wrote its own
   list would be a second taxonomy diverging from creative.json.

   /api/creative FILTERS: a tier that requires arming and is not available is
   NOT EMITTED — absent, never greyed out (ADR-0003). Which is why arming or
   disarming adult content has to reload this, or a slider keeps a state from
   before the switch. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { errorOf, type Schema } from '../api/client'
import { useApi } from '../api/useApi'
import { useCharacter } from '../character/CharacterContext'
import { useFaults } from './FaultsContext'

export type Creative = Schema<'CreativeResponse'>

type TaxonomyContextValue = {
  creative: Creative | null
  reload: () => Promise<void>
}

const Ctx = createContext<TaxonomyContextValue | null>(null)

export function TaxonomyProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const { claimed } = useCharacter()
  const { report } = useFaults()
  const [creative, setCreative] = useState<Creative | null>(null)

  const reload = useCallback(async () => {
    // No character claimed yet (entry gate): /api/creative now requires one,
    // and there is no taxonomy to read before a character is even picked
    // (2026-09-01 — see SystemStateContext's own note on the same pattern).
    if (!claimed) return
    let response: (Creative & { ok?: boolean; erreur?: string }) | null = null
    try {
      response = await api.get<Creative>('/api/creative')
    } catch {
      report('taxonomie', 'serveur injoignable')
      return
    }
    const failure =
      errorOf(response) || (Array.isArray(response.intentions) ? null : 'taxonomie illisible')
    report('taxonomie', failure)
    if (!failure) setCreative(response)
  }, [api, claimed, report])

  // the taxonomy belongs to a character: switching reloads it
  useEffect(() => {
    void reload()
  }, [reload, claimed])

  const value = useMemo(() => ({ creative, reload }), [creative, reload])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTaxonomy(): TaxonomyContextValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useTaxonomy hors de TaxonomyProvider')
  return value
}
