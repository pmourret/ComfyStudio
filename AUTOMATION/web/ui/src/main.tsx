/* Entry point. `BrowserRouter` and not a hash router: real paths, served by
   FastAPI with an SPA fallback (api/main.py). */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { App } from './app/App'
/* THE identity layer, and the ONLY one: palette, typography, shape. base,
   chrome, screens and every Tailwind utility depend on it through var() alone,
   never a hard-coded value that would encode a style choice. */
import './styles/tokens.css'
import './styles/base.css'
import './styles/chrome.css'
import './styles/screens.css'
/* LAST, and that is the point: it carries Tailwind's utilities unlayered, so a
   utility ties with the shared component classes above and wins by coming after
   them. See the header of theme.css for what was measured. */
import './styles/theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
