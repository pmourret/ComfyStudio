/* The workshop tool rail. Ported from `static/rail.js`.

   WHAT THE RAIL IS NOT: a second navigation. The six navbar destinations remain
   the chrome, and none of them is copied here.

   WHAT IT IS: the TOOLS of the current character's pack, read from
   `UNIVERS/<pack>/tools.json` through /api/universe/tools, plus the workshop
   shortcuts that are not primary destinations.

   The rail knows nothing about the character nor the pack (CLAUDE.md §8.7): it
   reads a `surface` declared by the tool and looks up what that surface opens in
   the SURFACES table below. A pack declaring a known surface gets the same
   button whatever its character; an UNKNOWN surface gets an INERT button that
   says why — never an invented destination. */
import { Link, useLocation } from 'react-router-dom'

import { errorOf, type ActionLike, type Schema } from '../api/client'
import { useApi } from '../api/useApi'
import { useCharacter } from '../character/CharacterContext'
import { PATHS } from '../app/routes'
import { useChrome } from './ChromeContext'
import { Icon } from './Icon'
import { useCallback, useEffect, useState } from 'react'

type UniverseTools = Schema<'UniverseToolsResponse'>

/* `tools` is `Any` in the Pydantic model — it relays tools.json, which belongs
   to the pack. This is the shape the rail READS. */
type Tool = { id?: string; label?: string; surface?: string }

/* The surfaces the studio knows how to open today. `to`: a route. `inert`: the
   reason, shown as a tooltip — the tool exists, it simply has no entry point of
   its own from the rail. */
const SURFACES: Record<string, { to?: string; inert?: string; icon: string }> = {
  'bank-poses': { to: PATHS.bankPoses, icon: 'pose' },
  'bank-scenes': { to: PATHS.bankScenes, icon: 'scenes' },
  'review-lightbox': { inert: 'depuis une image de la Revue', icon: 'image' },
}
const UNKNOWN = 'pas encore de surface dans le studio'

/* Workshop shortcuts — they come from no pack, they are the structure of the
   studio. A shortcut whose destination a TOOL already covers is dropped: the
   pose surface is declared in both tools.json, so it appears once. */
const SHORTCUTS = [
  { label: 'Scènes', to: PATHS.bankScenes, icon: 'scenes' },
  { label: 'Poses', to: PATHS.bankPoses, icon: 'pose' },
]

/* The rail only shows where its entries have a surface: Produire today. On
   list screens it would have no active entry and would only eat width.
   `/bank/scenes` was EXCLUDED first (31/08/2026 consolidation pass): its own
   toolbar covers what the rail offered there. `/bank/poses` and the pose
   editor followed the same reasoning once the editor grew its own complete
   navigation across five build phases (2026-09-02) — the rail's "Poses"
   entry pointed at a screen that no longer needed pointing at, from inside
   itself. */
const RAIL_ON = [PATHS.produce]

export function useRailVisible(): boolean {
  const { pathname } = useLocation()
  const { isClaimed } = useCharacter()
  return isClaimed && RAIL_ON.some((base) => pathname === base || pathname.startsWith(base + '/'))
}

/* A rail entry. The label sits in its own <span>, not as bare text: collapsed,
   it is removed VISUALLY (clip-path) and stays the button's accessible name —
   same treatment as `.nav-lab` in the navbar, same reason. */
function RailItem({
  label,
  to,
  inert,
  icon,
  active,
}: {
  label: string
  to?: string
  inert?: string
  icon: string
  active?: boolean
}) {
  const content = (
    <>
      <Icon name={icon} className="rail-ic" />
      <span className="rail-lab-it">{label}</span>
    </>
  )
  if (!to) {
    /* An inert tool stays VISIBLE and readable: it says the capability exists,
       and its tooltip says where it opens from. Hiding it would suggest the pack
       does not have it. */
    return (
      <button className="rail-it" disabled data-hint-text={inert}>
        {content}
      </button>
    )
  }
  return (
    <Link className={`rail-it${active ? ' on' : ''}`} to={to} data-go={to}>
      {content}
    </Link>
  )
}

export function ToolRail() {
  const api = useApi()
  const { claimed } = useCharacter()
  const { railCollapsed, toggleRail, toggleGear } = useChrome()
  const { pathname } = useLocation()
  const visible = useRailVisible()
  const [tools, setTools] = useState<Tool[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setTools(null)
    setError(null)
    let response: (UniverseTools & ActionLike) | null = null
    try {
      response = await api.get<UniverseTools>('/api/universe/tools')
    } catch {
      setError('serveur injoignable')
      return
    }
    const failure = errorOf(response)
    if (failure) setError(failure)
    else setTools((response.tools as Tool[]) ?? [])
  }, [api])

  // the rail reads the pack OF the current character: switching reloads it
  useEffect(() => {
    if (claimed) void load()
  }, [load, claimed])

  if (!visible) return null

  const rendered = (tools ?? []).map((tool) => {
    const surface = SURFACES[tool.surface ?? ''] ?? { inert: UNKNOWN, icon: 'default' }
    return {
      label: tool.label || tool.id || '',
      to: surface.to,
      inert: surface.to ? undefined : (surface.inert ?? UNKNOWN),
      icon: surface.icon,
    }
  })
  // de-duplication by destination: a shortcut the pack already covers
  const taken = new Set(rendered.map((entry) => entry.to).filter(Boolean))
  const shortcuts = SHORTCUTS.filter((entry) => !taken.has(entry.to))

  const isActive = (to?: string) => Boolean(to && pathname === to)

  return (
    <nav className="rail" id="toolRail" aria-label="Outils de l'atelier">
      {tools === null && !error && <p className="rail-msg">chargement…</p>}
      {/* frontend.md: a backend error is said on screen. Without this the rail
          would merely look empty, and a pack with no tool would look the same. */}
      {error && (
        <p className="rail-msg rail-ko">
          outils indisponibles
          <br />
          <span className="tiny">{error}</span>
        </p>
      )}
      {tools !== null && !error && (
        <>
          <div className="rail-grp">
            <div className="rail-lab">Outils</div>
            {rendered.length ? (
              rendered.map((entry, index) => (
                <RailItem key={`${entry.label}-${index}`} {...entry} active={isActive(entry.to)} />
              ))
            ) : (
              <p className="rail-msg">aucun outil déclaré pour ce pack</p>
            )}
          </div>
          {shortcuts.length > 0 && (
            <div className="rail-grp">
              <div className="rail-lab">Atelier</div>
              {shortcuts.map((entry) => (
                <RailItem key={entry.to} {...entry} active={isActive(entry.to)} />
              ))}
            </div>
          )}
        </>
      )}

      <div className="rail-foot">
        {/* Generation settings belong to Produire: elsewhere the panel is on a
            screen that is not mounted, so the button SAYS so instead of lying.
            Same panel as the gear of the launch bar — two buttons, ONE state,
            never a second settings surface that could drift from this one. */}
        <button
          className="rail-it"
          id="railGear"
          disabled={pathname !== PATHS.produce}
          title={pathname === PATHS.produce ? 'réglages de génération' : 'depuis Produire'}
          data-hint-text={pathname === PATHS.produce ? undefined : 'depuis Produire'}
          onClick={(event) => {
            // same guard as the identity menu: the outside-click closer must not
            // fire on the very click that opens the panel
            event.stopPropagation()
            toggleGear()
          }}
        >
          <Icon name="gear" className="rail-ic" />
          <span className="rail-lab-it">Réglages de génération</span>
        </button>
        <button
          className="rail-it rail-pli"
          id="btnRailPli"
          aria-expanded={!railCollapsed}
          onClick={toggleRail}
        >
          <Icon name="chevron" className="rail-ic rail-chev" />
          <span className="rail-lab-it" id="railPliLab">
            {railCollapsed ? 'Déplier' : 'Réduire'}
          </span>
        </button>
      </div>
    </nav>
  )
}
