/* Entry point. `BrowserRouter` and not a hash router: real paths, served by
   FastAPI with an SPA fallback (api/main.py). */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { App } from './app/App'
/* THE identity layer, and the ONLY one: palette, typography, shape. base,
   chrome and screens depend on it through var() alone, never a hard-coded value
   that would encode a style choice. It moved here from the legacy tree the day
   that tree was removed — while both frontends were served, keeping a single
   copy in `static/` was what kept the palette from drifting in two. */
/* Tailwind's utilities and the theme that maps them onto the tokens. FIRST, so
   that `tokens.css` keeps the last word on any name the two layers share:
   `--font-mono` exists in both, and there it is a `font` shorthand carrying a
   size, which a family-only redefinition would break. Utilities also want to sit
   before the hand-written sheets while the migration is under way — a screen not
   yet converted must keep beating a utility, never the reverse. */
import './styles/theme.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/chrome.css'
import './styles/screens.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
