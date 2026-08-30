/* The studio navbar: the six destinations, on the left, full height.

   NAVBAR != RAIL. The navbar says WHERE TO GO in the application; the tool rail
   says WHAT TO DO on the current screen. Merging them would have mixed a map
   with a workbench.

   ENTRY GATE — the navbar does not exist there. With no character claimed there
   is no workshop to navigate: the registry takes the whole screen, and choosing
   a character is what MAKES you enter.

   `data-s` stays the navigation contract, as an explicit attribute rather than
   an assumption about markup. Its VALUES are the new English screen keys, since
   this migration renamed the routes they designate (see app/routes.ts).

   Labels are never `display:none` in icon mode — they are removed VISUALLY
   (clip-path) and stay the button's accessible name, otherwise the six buttons
   would be anonymous to a screen reader. The icon is aria-hidden. */
import { NavLink, useLocation } from 'react-router-dom'

import { useCharacter } from '../character/CharacterContext'
import { useSystemState } from '../state/SystemStateContext'
import { DESTINATIONS, characterPath, isDestinationActive, type Destination } from '../app/routes'
import { useChrome } from './ChromeContext'
import { Icon } from './Icon'

function DestinationLink({
  destination,
  path,
  badge,
}: {
  destination: Destination
  path: string
  badge: React.ReactNode
}) {
  const { isClaimed } = useCharacter()
  const { pathname } = useLocation()
  /* Active state is computed from the PATH, not taken from NavLink's own
     `isActive`: a destination lights up when a sub-screen of it is open, and
     /app/journal is a sub-screen of /app that NavLink alone would not light
     without an `end={false}` that also lights /characters on /character. One
     rule, in the route table, for both cases. */
  const active = isDestinationActive(destination, pathname)

  return (
    <NavLink
      className={`nav-item${active ? ' on' : ''}`}
      data-s={destination.key}
      aria-current={active ? 'page' : undefined}
      to={path}
    >
      <Icon name={destination.icon} className="nav-ic" />
      <span className="nav-lab">
        {(isClaimed && destination.labelWhenClaimed) || destination.label}
      </span>
      {badge}
    </NavLink>
  )
}

export function SideNav() {
  const { isClaimed } = useCharacter()
  const { state } = useSystemState()
  const { navCollapsed, focus, toggleNav, toggleFocus } = useChrome()

  if (!isClaimed) return null

  const waiting = state?.counts?.A_REVOIR ?? 0

  return (
    <nav className="sidenav" id="studioNav" aria-label="Navigation du studio">
      <div className="tabs">
        {DESTINATIONS.map((destination) => (
          <DestinationLink
            key={destination.key}
            destination={destination}
            path={destination.key === 'character' ? characterPath(isClaimed) : destination.path}
            badge={
              destination.badge ? (
                /* Counters vanish in icon mode — EXCEPT this one. It is the only
                   value of the chrome that says work is WAITING, and collapsed is
                   when it is needed most: it becomes a pip on the icon. At zero it
                   has nothing to announce and fades (data-zero: CSS cannot read a
                   number, so we tell it).

                   Galerie has a tab but NO badge: a counter announces pending work,
                   and a validated image awaits none. */
                <span className="n" id="nTri" data-zero={waiting ? '0' : '1'}>
                  {waiting}
                </span>
              ) : null
            }
          />
        ))}
      </div>

      {/* Foot: two CHROME settings, not two destinations. « Focus » hides the
          banner and collapses the navbar — the work surface takes the room.
          « Réduire » is a durable preference, independent of focus. */}
      <div className="nav-foot">
        <button className="nav-chrome" id="btnFocus" aria-pressed={focus} onClick={toggleFocus}>
          <Icon name="focus" className="nav-ic" />
          <span className="nav-lab" id="focusLab">
            {focus ? 'Quitter le focus' : 'Mode focus'}
          </span>
        </button>
        <button
          className="nav-chrome"
          id="btnNavPli"
          aria-expanded={!navCollapsed}
          onClick={toggleNav}
        >
          <Icon name="chevron" className="nav-ic nav-chev" />
          <span className="nav-lab" id="pliLab">
            {navCollapsed ? 'Déplier' : 'Réduire'}
          </span>
        </button>
      </div>
    </nav>
  )
}
