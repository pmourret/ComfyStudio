/* Selection state shared by the modal and the advanced screen — identical
   logic in both, so it lives once rather than being re-typed twice (the
   same reasoning as UndoRedoButtons.tsx). The modal never surfaces
   multi-select UI (no outliner, no "N points" panel), but the underlying
   PoseCanvas still expects a full Set + all three callbacks to behave
   correctly, so it gets the same hook rather than a stripped-down cousin. */
import { useCallback, useState } from 'react'

import { pointKey, type PointGroup } from './poseFrame'
import type { Selected } from './PoseCanvas'

export function useSelection() {
  const [selected, setSelected] = useState<Selected>(new Set())

  /** Plain click on a joint: replace the whole selection with just this
      one — the pre-multi-select behavior, still the default gesture. */
  const onSelect = useCallback((group: PointGroup, index: number) => {
    setSelected(new Set([pointKey(group, index)]))
  }, [])

  /** Ctrl/Cmd+click: add or remove this one joint without touching the
      rest of the selection. */
  const onToggleSelect = useCallback((group: PointGroup, index: number) => {
    const key = pointKey(group, index)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  /** Shift+drag a rectangle on the canvas background: union the enclosed
      joints into the selection — never removes, a rectangle re-drawn over
      already-selected points shouldn't deselect them. */
  const onSelectMany = useCallback((keys: string[]) => {
    setSelected((prev) => new Set([...prev, ...keys]))
  }, [])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  return { selected, onSelect, onToggleSelect, onSelectMany, clearSelection }
}
