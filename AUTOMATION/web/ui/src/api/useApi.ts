/* The ONLY way a component gets an API caller.

   Everything it hands back is already bound to the claimed character, so
   `?character=` cannot be forgotten by construction — that is the whole point
   (AUDIT §5.1). Nothing else in the app should import `apiFetch` directly. */
import { useMemo } from 'react'

import { useCharacter } from '../character/CharacterContext'
import { apiFetch, apiPost, imageUrl, type ActionLike, type ImageRef } from './client'

export type BoundApi = {
  get: <T>(url: string) => Promise<T & ActionLike>
  post: <T>(url: string, body?: unknown) => Promise<T & ActionLike>
  image: (ref: ImageRef) => string
}

export function useApi(): BoundApi {
  const { claimed } = useCharacter()
  return useMemo(
    () => ({
      get: <T,>(url: string) => apiFetch<T>(url, claimed),
      post: <T,>(url: string, body?: unknown) => apiPost<T>(url, body, claimed),
      image: (ref: ImageRef) => imageUrl(ref, claimed),
    }),
    [claimed],
  )
}
