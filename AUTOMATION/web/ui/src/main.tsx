/* Entry point. `BrowserRouter` and not a hash router: real paths, served by
   FastAPI with an SPA fallback (api/main.py). */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { App } from './app/App'
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
