/* The current character, as SHARED REACT STATE.

   WHAT CHANGES FROM THE LEGACY FRONTEND (migration brief, point 1). `?character=`
   used to be read once at load time and changing character meant reloading the
   whole page (V1 contract, CLAUDE.md §9). Here the id is state: switching
   re-renders, it does not reload. The query parameter stays in the URL so a link
   is still bookmarkable and shareable — but it is now a MIRROR of the state, not
   the trigger. The one place the URL still leads is a real navigation the user
   made: back/forward, or a pasted link. The effect below covers exactly that case.

   WHAT DOES NOT CHANGE. The three creation axes (type, output style, world) are
   frozen at creation and the pack is derived from them (CLAUDE.md §3, §8.8):
   nothing here edits a sheet, and no route exists to. This context READS.

   `claimed` is null on the entry gate — no character is claimed, so no
   `?character=` goes out and the server applies its own default. `sheet` is the
   loaded character's record, or null while it is in flight. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { apiFetch, errorOf, type CharacterId, type Schema } from '../api/client'

export type CharacterSheet = Schema<'CharacterSheet'>
export type CharacterRow = Schema<'CharacterRow'>

type CharacterContextValue = {
  /** The claimed id, or null on the entry gate. */
  claimed: CharacterId
  /** True when a character is actually claimed — the legacy `characterIsExplicit`. */
  isClaimed: boolean
  /** Full record of the claimed character, null while loading or on failure. */
  sheet: CharacterSheet | null
  /** Message to show when the sheet could not be read. Never a silent failure. */
  sheetError: string | null
  /** The registry, loaded on demand by the identity menu. */
  roster: CharacterRow[] | null
  rosterError: string | null
  loadRoster: () => void
  /* Switch character WITHOUT reloading the page.

     `to` moves to another screen IN THE SAME UPDATE. It is not a convenience:
     selecting and then navigating separately makes the second write win, and a
     `navigate('/produce')` carries no query — so `?character=` was set on the
     screen being left and dropped on arrival. One update, one URL. */
  selectCharacter: (id: string, options?: { to?: string }) => void
}

const Ctx = createContext<CharacterContextValue | null>(null)

export function CharacterProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const fromUrl = searchParams.get('character')

  const [claimed, setClaimed] = useState<CharacterId>(fromUrl)
  const [sheet, setSheet] = useState<CharacterSheet | null>(null)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [roster, setRoster] = useState<CharacterRow[] | null>(null)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const rosterRequested = useRef(false)

  /* THE MIRROR. State is authoritative; `?character=` is a reflection of it that
     the provider maintains. Two directions, and which one applies depends on
     whether the URL names anybody:

       - it NAMES someone, and it is not who we hold -> the user navigated
         (back, forward, a pasted link). Adopt it.
       - it names NOBODY while a character is loaded -> an internal navigation
         dropped the query. Every `<Link to="/character">` does exactly that,
         and making each one carry the parameter would be the same discipline
         this migration removed everywhere else. The state stands, the URL
         catches up.

     `replace: true` on the catch-up: rewriting the mirror is not a navigation,
     and pushing an entry for it would put a duplicate in history each time. */
  useEffect(() => {
    if (fromUrl !== null) {
      if (fromUrl !== claimed) setClaimed(fromUrl)
      return
    }
    if (claimed === null) return
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('character', claimed)
        return next
      },
      { replace: true },
    )
  }, [fromUrl, claimed, setSearchParams])

  /* state -> URL. `replace: false` keeps the switch in history, so Back returns
     to the character you came from — which is what a shareable URL implies. */
  const selectCharacter = useCallback(
    (id: string, options?: { to?: string }) => {
      setClaimed(id)
      const next = new URLSearchParams(searchParams)
      next.set('character', id)
      if (options?.to) navigate({ pathname: options.to, search: next.toString() })
      else setSearchParams(next, { replace: false })
    },
    [navigate, searchParams, setSearchParams],
  )

  /* The sheet follows the claimed id. An aborted flight cannot paint over a
     newer one: switching twice quickly used to be a race in any code that
     dropped this guard. */
  useEffect(() => {
    if (!claimed) {
      setSheet(null)
      setSheetError(null)
      return
    }
    let current = true
    setSheet(null)
    setSheetError(null)
    apiFetch<CharacterSheet>('/api/character', claimed)
      .then((response) => {
        if (!current) return
        const failure = errorOf(response)
        if (failure) setSheetError(failure)
        else setSheet(response)
      })
      .catch(() => {
        if (current) setSheetError('serveur injoignable')
      })
    return () => {
      current = false
    }
  }, [claimed])

  /* The registry powers the identity menu. Loaded once, on demand — the legacy
     `fillSwitcher`. A failure shows a message and RESETS the latch, so opening
     the menu again retries instead of leaving it mute forever. */
  const loadRoster = useCallback(() => {
    if (rosterRequested.current) return
    rosterRequested.current = true
    setRosterError(null)
    apiFetch<Schema<'CharacterListResponse'>>('/api/characters', null)
      .then((response) => {
        const failure = errorOf(response)
        if (failure) {
          rosterRequested.current = false
          setRosterError(failure)
          return
        }
        setRoster(response.characters ?? [])
      })
      .catch(() => {
        rosterRequested.current = false
        setRosterError('liste indisponible')
      })
  }, [])

  const value = useMemo<CharacterContextValue>(
    () => ({
      claimed,
      isClaimed: claimed !== null,
      sheet,
      sheetError,
      roster,
      rosterError,
      loadRoster,
      selectCharacter,
    }),
    [claimed, sheet, sheetError, roster, rosterError, loadRoster, selectCharacter],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCharacter(): CharacterContextValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useCharacter hors de CharacterProvider')
  return value
}

/** Readable initial of a character, for the chrome badge.

    `[...str]` and not charAt: a name starting outside the BMP would be cut in
    two half units. The chrome shows an INITIAL, never the frozen base portrait —
    no route serves those bytes, and inventing one that reads ComfyUI/input/
    without a character_id bound would reopen the leak closed on 29/08/2026. */
export function initialOf(sheet: { name?: string | null; id?: string | null } | null): string {
  const source = String(sheet?.name || sheet?.id || '?').trim()
  return ([...source][0] || '?').toUpperCase()
}
