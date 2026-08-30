/* API calls and tolerant reading of responses — a direct port of the legacy
   `static/api.js`, with one structural change: nothing here reads an ambient
   current character. The id is a PARAMETER.

   WHY. `?character=<id>` on every `/api/*` call AND on `/img` is the isolation
   contract (AUDIT §5.1): as long as each screen assembled its own URL, the
   character — sometimes even the SFW/NSFW space — got dropped between two
   calls and `/img` served Léna's images to whoever went through. The legacy
   module held the id in a module-level `let`; here it comes from React context
   through `useApi()`, which is the ONLY way a component gets a caller. Forgetting
   the parameter stops being possible instead of being merely discouraged.

   These functions stay pure and free of React so the browser tests and any
   non-component code can use them the same way. */
import type { components } from './schema'

/** Shorthand for a Pydantic model generated from the OpenAPI schema. */
export type Schema<K extends keyof components['schemas']> = components['schemas'][K]

/** The shape EVERY response carries, success or failure (AUDIT §5.4). */
export type ActionLike = { ok?: boolean; erreur?: string }

/* The id of the character the interface CLAIMS, or null on the entry gate,
   where none is claimed yet. */
export type CharacterId = string | null

/* Appends `?character=` — and omits it when nothing is claimed.

   The legacy module defaulted to the literal `'lena'` client-side. That was a
   second copy of a default the server already owns (`current_character` in
   api/dependencies.py, documented in the OpenAPI page), so the parameter is
   simply left out instead: same answer from every route, minus one hard-coded
   character id in the frontend. `/img` is the exception that proves it right —
   it REQUIRES the parameter and answers 400 rather than serving Léna's bytes to
   whoever did not ask for them (isolation of 29/08/2026). */
export function withCharacter(url: string, characterId: CharacterId): string {
  if (!characterId) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}character=${encodeURIComponent(characterId)}`
}

export type ImageRef = {
  bucket?: string
  space?: string
  name?: string
  thumb?: boolean
  /* Byte version (mtime, integer seconds) as `/api/gallery` hands it out. The
     server IGNORES it — it exists for the URL alone: since the editor learned
     to overwrite its source, one name can designate two images and the browser
     would still show the first (AUDIT §5.6, trap 1). Consumed verbatim, never
     reinterpreted: absent on items that carry none (STATE.recent), and then the
     URL stays byte-for-byte the one from before. */
  v?: number | string | null
}

/** THE single image-URL builder for the whole application. */
export function imageUrl(ref: ImageRef, characterId: CharacterId): string {
  return withCharacter(
    `/img?bucket=${encodeURIComponent(ref.bucket || 'OK')}` +
      `&space=${encodeURIComponent(ref.space || 'sfw')}` +
      `&name=${encodeURIComponent(ref.name || '')}` +
      (ref.thumb ? '&thumb=1' : '') +
      (ref.v ? `&v=${encodeURIComponent(String(ref.v))}` : ''),
    characterId,
  )
}

/* `r.json()` alone blew up (unhandled rejection) on any response whose body is
   not JSON — an uncaught 500 server-side returns an HTML page. The fallback at
   least yields an object a toast can read. This function NEVER throws on a
   malformed body; only a dead network rejects. */
export async function apiFetch<T>(
  url: string,
  characterId: CharacterId,
  init?: RequestInit,
): Promise<T & ActionLike> {
  const response = await fetch(withCharacter(url, characterId), init)
  try {
    return (await response.json()) as T & ActionLike
  } catch {
    return {
      ok: false,
      erreur: `réponse invalide du serveur (${response.status})`,
    } as T & ActionLike
  }
}

/* Content-Type application/json, always. It is what forbids a CORS "simple
   request" and therefore what the origin guard relies on (api/security.py).
   Consequence, wanted: uploads travel as base64 inside this JSON body, never as
   multipart/form-data. */
export function apiPost<T>(
  url: string,
  body: unknown,
  characterId: CharacterId,
): Promise<T & ActionLike> {
  return apiFetch<T>(url, characterId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
}

/* An API response does not have the expected shape. `apiFetch` never throws: on
   a 500 with an HTML body it yields {ok:false, erreur}. Loaders took that object
   for a scene bank or a taxonomy, and the first access to `.scenes` threw —
   silently. So: we CHECK the shape, and we say so. Returns the message to show,
   or null when the response is usable. */
export function errorOf(response: ActionLike | null | undefined): string | null {
  if (!response || response.ok === false) {
    return response?.erreur || 'réponse inattendue du serveur'
  }
  return null
}
