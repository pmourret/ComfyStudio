/* Full-frame view of one image, closed on click or Escape.
   Ported from `static/lightbox.js`.

   It is NOT a <dialog>: it has no focusable content, nothing to trap focus on,
   and the whole surface is the close affordance. Escape is therefore handled
   here rather than natively — and the review shortcuts check it before acting,
   so V/X/A never sort an image behind the veil. */
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
  const open = useCallback((next: string) => setSrc(next), [])
  const close = useCallback(() => setSrc(null), [])

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
      <div id="lightbox" style={{ display: src ? 'flex' : 'none' }} onClick={close}>
        {src && <img src={src} alt="" />}
      </div>
    </Ctx.Provider>
  )
}

export function useLightbox(): LightboxContextValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useLightbox hors de LightboxProvider')
  return value
}
