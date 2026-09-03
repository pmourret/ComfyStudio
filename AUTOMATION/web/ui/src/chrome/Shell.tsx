/* The permanent chrome: header, fault banner, navbar, and the screen outlet.

   Layout ported from `static/index.html` + base.css: a column (header, banner,
   then `.shell`), with the navbar and <main> side by side. `min-height:0` and
   `min-width:0` on the flex children are not cosmetic — without them the PAGE
   scrolls instead of <main>, which is the bug they were added for.

   The tool rail decides for itself whether it exists: it only shows where its
   entries have a surface (Produire, Banque), and it says so in one place rather
   than making the shell test the route. */
import { Outlet } from 'react-router-dom'

import { useCharacter } from '../character/CharacterContext'
import { DirtyBar } from './DirtyBar'
import { FaultBar } from './FaultBar'
import { Header } from './Header'
import { HintLayer } from './HintLayer'
import { SideNav } from './SideNav'
import { ToolRail } from './ToolRail'
import { useChrome } from './ChromeContext'
import { useCharacterTheme } from './useCharacterTheme'
import { usePackTheme } from './usePackTheme'

export function Shell() {
  const { isClaimed, sheet } = useCharacter()
  const { navCollapsed, railCollapsed, focus, iconsOnly } = useChrome()
  usePackTheme()
  useCharacterTheme(sheet?.appearance)

  /* Chrome state travels as classes on the shell root, not on <body>: the
     legacy frontend had no choice (its CSS was global), a React tree does. */
  const classes = [
    'app',
    isClaimed ? '' : 'no-character',
    navCollapsed ? 'nav-mince' : '',
    railCollapsed ? 'rail-mince' : '',
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
      <DirtyBar />
      <div className="shell">
        <SideNav />
        <ToolRail />
        <main>
          <Outlet />
        </main>
      </div>
      <HintLayer />
    </div>
  )
}
