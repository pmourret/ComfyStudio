/* Full-frame view of one image, closed on click of the backdrop or Escape.
   Ported from `static/lightbox.js` — its CSS was NOT (styles/chrome.css's
   own `#lightbox` comment explains: the rule was simply missing, the image
   inserted itself at natural size in the page flow instead of floating
   above it, found by clicking it for real, 2026-09-03).

   It is NOT a <dialog>: it has no focusable content beyond the close
   button, nothing to trap focus on. Escape is handled here rather than
   natively — and the review shortcuts check `src` before acting, so V/X/A
   never sort an image behind the veil.

   ZOOM (2026-09-03): a click on the IMAGE toggles native pixel size
   (`zoomed`) instead of closing — the backdrop still closes on click, as
   does Escape and the close button, at either zoom level. This is a
   behaviour change for every existing caller (Revue, Galerie, Produire):
   clicking the enlarged image used to close it, it now zooms — the
   standard gesture of most image viewers, and accepted as such rather than
   kept for backward compatibility's own sake. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type LightboxContextValue = {
  /** The image currently magnified, or null. Read by the keyboard guards. */
  src: string | null
  open: (src: string) => void
  close: () => void
}

const Ctx = createContext<LightboxContextValue | null>(null)

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [src, setSrc] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const open = useCallback((next: string) => {
    setSrc(next)
    setZoomed(false)
  }, [])
  const close = useCallback(() => {
    setSrc(null)
    setZoomed(false)
  }, [])

  useEffect(() => {
    if (!src) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [src, close])

  const value = useMemo(() => ({ src, open, close }), [src, open, close])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        id="lightbox"
        className={[src ? 'on' : '', zoomed ? 'zoomed' : ''].filter(Boolean).join(' ') || undefined}
        onClick={close}
      >
        {src && (
          <img
            src={src}
            alt=""
            onClick={(event) => {
              event.stopPropagation()
              setZoomed((z) => !z)
            }}
          />
        )}
        {src && (
          <button type="button" id="lightboxClose" aria-label="Fermer" onClick={close}>
            ✕
          </button>
        )}
      </div>
    </Ctx.Provider>
  )
}

export function useLightbox(): LightboxContextValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useLightbox hors de LightboxProvider')
  return value
}
