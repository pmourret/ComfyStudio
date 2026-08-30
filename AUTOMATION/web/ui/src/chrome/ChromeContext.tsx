/* Chrome state of the studio: collapsed navbar, collapsed tool rail, focus mode.

   Ported from `static/studio.js`, including the distinction that module exists
   for — two INDEPENDENT settings:

     - « réduire » is a durable preference. One can want icons permanently,
       without being in the middle of a work session.
     - « focus » is a work mode. It hides the header and forces icons for as
       long as it lasts, WITHOUT overwriting the preference — leaving it gives
       the navbar back exactly as it was.

   Mixing them meant entering then leaving focus unfolded a navbar that had been
   deliberately collapsed.

   PERSISTENCE. The same two localStorage keys as the legacy frontend, same
   values ('1'/'0'), so a preference set before this migration survives it. Focus
   is deliberately NOT persisted: finding the studio next morning with its header
   gone, without remembering asking for it, reads as a breakdown, not a setting.

   Reads and writes are guarded: localStorage throws for real in a private
   window, with third-party cookies blocked, or during a thumbnail capture. A
   lost comfort setting must give a NORMAL chrome, never a studio stuck in focus. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const NAV_KEY = 'studio.nav-mince'
const RAIL_KEY = 'studio.rail-mince'

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* tant pis */
  }
}

type ChromeContextValue = {
  navCollapsed: boolean
  railCollapsed: boolean
  focus: boolean
  /** True when the navbar shows icons only, whatever the reason (width included). */
  iconsOnly: boolean
  toggleNav: () => void
  toggleRail: () => void
  toggleFocus: () => void
}

const Ctx = createContext<ChromeContextValue | null>(null)

/* Below this width the layout imposes icons on its own. `matchMedia` reads the
   SAME bound as the stylesheet instead of duplicating it in a comparison. */
const NARROW = '(max-width:1100px)'

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [navCollapsed, setNavCollapsed] = useState(() => readFlag(NAV_KEY))
  const [railCollapsed, setRailCollapsed] = useState(() => readFlag(RAIL_KEY))
  const [focus, setFocus] = useState(false)
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches)

  useEffect(() => {
    const query = window.matchMedia(NARROW)
    const onChange = () => setNarrow(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const toggleNav = useCallback(() => {
    setNavCollapsed((current) => {
      writeFlag(NAV_KEY, !current)
      return !current
    })
  }, [])

  const toggleRail = useCallback(() => {
    setRailCollapsed((current) => {
      writeFlag(RAIL_KEY, !current)
      return !current
    })
  }, [])

  const toggleFocus = useCallback(() => setFocus((current) => !current), [])

  /* « f » toggles focus. Same guards as the legacy handler: we do not steal a
     keystroke from a text field, nor from a mode that already has its own.
     Escape is NOT used — it already closes the identity menu, the lightbox and
     the editor, and a fourth meaning would make the most-used key of the chrome
     unpredictable. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'f' && event.key !== 'F') return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && /input|textarea|select/i.test(target.tagName)) return
      if (target?.isContentEditable) return
      if (document.querySelector('dialog[open]')) return
      event.preventDefault()
      toggleFocus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [toggleFocus])

  const value = useMemo<ChromeContextValue>(
    () => ({
      navCollapsed,
      railCollapsed,
      focus,
      iconsOnly: navCollapsed || focus || narrow,
      toggleNav,
      toggleRail,
      toggleFocus,
    }),
    [navCollapsed, railCollapsed, focus, narrow, toggleNav, toggleRail, toggleFocus],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useChrome(): ChromeContextValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useChrome hors de ChromeProvider')
  return value
}
