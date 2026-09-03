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

/* A text field being typed into, never a checkbox. `<input>` alone used to
   be the whole test — found live (design-pass screen-5, §D): a selection
   checkbox is an `<input>` too and stays focused after a click (expected,
   accessible behaviour), so Échap pressed right after checking a box never
   reached this hook at all, silently swallowed by this guard before it
   could clear the selection. Narrowed to the input TYPES that actually take
   text, everything else (checkbox/radio/range/button/…) falls through. */
function isTextEntry(el: HTMLElement | null): boolean {
  if (!el) return false
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName !== 'INPUT') return false
  const NOT_TEXT = ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color']
  return !NOT_TEXT.includes((el as HTMLInputElement).type)
}

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
  selectedCount,
  onClearSelection,
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
  /** Multi-select (design-pass screen-5, §D) — Échap clears it, nothing else
      here owned this key before. */
  selectedCount: number
  onClearSelection: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (isTextEntry(target)) return
      if (target?.isContentEditable) return
      // an open modal <dialog> swallows the page: its keys must not percolate
      if (document.querySelector('dialog[open]')) return
      if (lightboxSrc) return
      if (document.body.classList.contains('editing')) return
      /* The filmstrip (design-pass screen-5, §A) is a `role="listbox"` with
         its OWN ArrowLeft/Right handling (chrome/useRovingChoice.ts) that
         already calls `onSelectIndex` -> `setCursor`. This listener is a raw
         `document` listener, outside React's synthetic event tree: a
         `stopPropagation()` inside the filmstrip's own `onKeyDown` would
         NOT stop it from also firing here and calling `step()` a second
         time for the same keypress. Same guard idiom as the four checks
         above. */
      if (target?.closest('[role="listbox"]')) return

      const key = event.key.toLowerCase()
      if (key === 'escape' && selectedCount > 0) {
        onClearSelection()
        return
      }
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
  }, [
    act, current, editing, lightboxSrc, setFlag, setView, step, trade, undo, view,
    selectedCount, onClearSelection,
  ])
}
