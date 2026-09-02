/* Loads and saves the catalog of ONE world (ADR-0015) — the only place that
   calls `/api/worlds/{id}/places`. A sub-component never calls the API
   (`.claude/rules/frontend.md`); `PlaceInspector` receives what this hook
   loads and the callback that saves it.

   SHARED BY TWO SCREENS. The Banque (`screens/bank/BankScreen.tsx`) edits
   ONE place tied to a selected scene; `WorldPlacesScreen` in this folder
   manages the WHOLE catalog of a world, characters aside. Both import this
   hook rather than each keeping a copy — it lives here, not under `bank/`,
   because it is a world concern, not a scene-bank one.

   THIS IS A WORLD RESOURCE, NOT A CHARACTER ONE: `useApi()` still appends
   `?character=` to every call (it is the only caller in the app), but the
   route ignores it — the catalog belongs to the world, not to whoever is
   looking at it. Editing here affects every character composing in this
   world, not just the one currently claimed. */
import { useCallback, useEffect, useState } from 'react'

import { errorOf, type Schema } from '../../api/client'
import { useApi } from '../../api/useApi'

export type Place = Schema<'Place'>
type PlacesResponse = Schema<'PlacesResponse'>

type SaveResult = { ok: boolean; erreur?: string }

export function useWorldPlaces(worldId: string | null) {
  const api = useApi()
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!worldId) {
      setPlaces(null)
      setLabel(null)
      return
    }
    let response: (PlacesResponse & { ok?: boolean; erreur?: string }) | null = null
    try {
      response = await api.get<PlacesResponse>(`/api/worlds/${encodeURIComponent(worldId)}/places`)
    } catch {
      response = null
    }
    const failure =
      !response ? 'serveur injoignable' : errorOf(response) || (Array.isArray(response.places) ? null : 'catalogue illisible')
    setError(failure)
    if (!failure) {
      setPlaces(response!.places)
      setLabel(response!.label)
    }
  }, [api, worldId])

  useEffect(() => {
    void load()
  }, [load])

  /* Replaces the WHOLE catalog, like saving a scene bank replaces the whole
     document — same shape of contract, one level up (ADR-0015 §3). */
  const save = useCallback(
    async (next: Place[]): Promise<SaveResult> => {
      if (!worldId) return { ok: false, erreur: 'aucun monde' }
      const response = await api.post<{ ok?: boolean; erreur?: string }>(
        `/api/worlds/${encodeURIComponent(worldId)}/places`,
        { places: next },
      )
      const failure = errorOf(response)
      if (failure) return { ok: false, erreur: failure }
      await load()
      return { ok: true }
    },
    [api, load, worldId],
  )

  return { places, label, error, load, save }
}
