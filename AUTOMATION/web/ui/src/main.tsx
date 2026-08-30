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
