/* The Review's keyboard, and the stack of guards each key carries.

   EVERY GUARD HERE HAS A REASON, and none may be dropped: a text field being
   typed into, an open modal `<dialog>` (which swallows the page), the lightbox,
   the photo editor, and the Galerie trade — where the sorting shortcuts do not
   exist any more than their buttons do.

   That last one is the important one. Hiding the buttons and letting the
   keyboard sort anyway would be the worst of both halves: one would sort blind,
   with nothing on screen to say it happened. */
import { useEffect } from 'react'

import type { GalleryItem, Trade, View } from './useTriage'

export function useReviewKeys({
  trade,
  view,
  setView,
  step,
  act,
  setFlag,
  undo,
  current,
  lightboxSrc,
  editing,
}: {
  trade: Trade
  view: View
  setView: (view: View) => void
  step: (delta: number) => void
  act: (action: string, index?: number) => Promise<void> | void
  setFlag: (item: GalleryItem, flag: string) => Promise<void> | void
  undo: () => Promise<void> | void
  current: GalleryItem | undefined
  lightboxSrc: string | null
  editing: boolean
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /input|textarea/i.test(target.tagName)) return
      if (target?.isContentEditable) return
      // an open modal <dialog> swallows the page: its keys must not percolate
      if (document.querySelector('dialog[open]')) return
      if (lightboxSrc) return
      if (document.body.classList.contains('editing')) return

      const key = event.key.toLowerCase()
      if (key === 'arrowright') return step(1)
      if (key === 'arrowleft') return step(-1)
      /* Enter on the grid = open the aimed tile full frame (the keyboard
         equivalent of clicking the thumbnail). Not when the focus is on a
         button: Enter would then sort AND magnify. */
      if (key === 'enter' && view === 'grille' && !target?.closest('button, a')) {
        setView('revue')
        return
      }
      if (trade === 'galerie' && 'vrxadu'.includes(key)) return
      if (key === 'v') void act('valider')
      else if (key === 'r') void act('revoir')
      else if (key === 'x') void act('rejeter')
      else if (key === 'a') void act('archiver')
      else if (key === 'd') void act('decliner')
      else if (key === 'c') current && void setFlag(current, 'ok')
      else if (key === 'i') current && void setFlag(current, 'ia')
      else if (key === 'u') void undo()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [act, current, editing, lightboxSrc, setFlag, setView, step, trade, undo, view])
}
