/* The permanent chrome: header, fault banner, navbar, and the screen outlet.

   Layout ported from `static/index.html` + base.css: a column (header, banner,
   then `.shell`), with the navbar and <main> side by side. `min-height:0` and
   `min-width:0` on the flex children are not cosmetic — without them the PAGE
   scrolls instead of <main>, which is the bug they were added for.

   The tool rail is deliberately NOT here yet: it only ever shows on Produire and
   Banque, neither of which is migrated, and shipping a component no screen can
   display would mean shipping something no test can exercise. It lands with the
   Banque screen, along with its collapse preference (already held by
   ChromeContext). */
import { Outlet } from 'react-router-dom'

import { useCharacter } from '../character/CharacterContext'
import { FaultBar } from './FaultBar'
import { Header } from './Header'
import { HintLayer } from './HintLayer'
import { SideNav } from './SideNav'
import { useChrome } from './ChromeContext'

export function Shell() {
  const { isClaimed } = useCharacter()
  const { navCollapsed, focus, iconsOnly } = useChrome()

  /* Chrome state travels as classes on the shell root, not on <body>: the
     legacy frontend had no choice (its CSS was global), a React tree does. */
  const classes = [
    'app',
    isClaimed ? '' : 'no-character',
    navCollapsed ? 'nav-mince' : '',
    focus ? 'focus' : '',
    iconsOnly ? 'icons-only' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      {/* focus mode hides the header: what REMAINS is what drives the work.
          We remove what says « where am I », not what serves to do. */}
      {!focus && <Header />}
      <FaultBar />
      <div className="shell">
        <SideNav />
        <main>
          <Outlet />
        </main>
      </div>
      <HintLayer />
    </div>
  )
}
