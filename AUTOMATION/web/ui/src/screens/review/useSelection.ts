/* Multi-select state of the grid (design-pass screen-5, §D/§B) — feeds BOTH
   the bulk action bar (§D) and the Comparer mode's source set (§B), one
   `Set<string>` for both. Same spirit as `screens/pose-editor/
   useSelection.ts` (a `Set` of stable keys) but a fresh file: different
   domain, different item shape, no import across screens for a hook this
   small (frontend.md — shared by two, owned by neither, is about a REAL
   shared shape, not a naming coincidence).

   A real `<input type="checkbox">` is already a toggle (§4.7) — no Ctrl/Cmd
   modifier to distinguish from a plain click, unlike a click-a-photo
   paradigm. Only Shift adds a second gesture: union the range between the
   last plain click (the anchor) and this one, never a removal — same
   doctrine as the pose-editor's own `onSelectMany`. */
import { useCallback, useRef, useState } from 'react'

import type { GalleryItem } from './useTriage'

export function useSelection(shown: GalleryItem[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchorRef = useRef<number | null>(null)

  const onSelectClick = useCallback(
    (name: string, index: number, event: { shiftKey: boolean }) => {
      if (event.shiftKey && anchorRef.current != null) {
        const [lo, hi] =
          anchorRef.current <= index ? [anchorRef.current, index] : [index, anchorRef.current]
        const names = shown.slice(lo, hi + 1).map((item) => item.name)
        setSelected((prev) => new Set([...prev, ...names]))
        return
      }
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        return next
      })
      anchorRef.current = index
    },
    [shown],
  )

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    anchorRef.current = null
  }, [])

  return { selected, onSelectClick, clearSelection }
}
