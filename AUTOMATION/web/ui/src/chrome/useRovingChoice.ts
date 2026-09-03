/* Keyboard mechanics for one radiogroup of mutually exclusive choices — a
   generic UI-kit hook (like Icon.tsx, Dialog.tsx), not chrome-specific:
   first used by the wizard's type/style/world cards and candidate grid
   (screen-1-wizard design pass), promoted here once Produire needed the
   exact same mechanics for its intensity/quality/tone/intention groups
   (screen-3-produire) — frontend.md: shared by two, owned by neither.

   Arrows move the selection AND pick it immediately, same as a native radio
   group; Home/End jump to the ends. `tabIndexFor` keeps exactly one Tab stop
   per group: the active choice, or the first item while nothing is picked
   yet.

   FOCUS FOLLOWS `activeId`, NEVER THE KEY PRESS ITSELF (found live,
   screen-3-produire audit): IntensityBar's `onPick` can open a confirmation
   dialog and never actually change the level if the user cancels it — an
   eager `.focus()` on the "next" button right after `onKeyDown` left focus
   on a button `aria-checked="false"`, visibly disconnected from the real
   selection. Focus is moved by an effect keyed on `activeId` instead, and
   only when it fires while focus is ALREADY somewhere inside this group —
   that is exactly "a keyboard move that took effect"; a cancelled one
   leaves `activeId` unchanged, so the effect never runs, and the dialog's
   own focus-restore (chrome/Dialog.tsx) puts focus back on the original,
   still-correct button instead. A programmatic change from outside the
   group (or one back-to-back so fast the group never got focus) does not
   steal focus, because `document.activeElement` will not be one of its own
   nodes at that moment. */
import { useCallback, useEffect, useRef } from 'react'

export function useRovingChoice(ids: string[], activeId: string | null) {
  const nodes = useRef(new Map<string, HTMLElement>())

  const registerRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) nodes.current.set(id, el)
      else nodes.current.delete(id)
    },
    [],
  )

  const tabIndexFor = useCallback(
    (id: string): 0 | -1 => {
      const target = activeId && ids.includes(activeId) ? activeId : ids[0]
      return id === target ? 0 : -1
    },
    [ids, activeId],
  )

  useEffect(() => {
    if (!activeId) return
    const current = document.activeElement
    const withinGroup = current instanceof HTMLElement && [...nodes.current.values()].includes(current)
    if (withinGroup) nodes.current.get(activeId)?.focus()
  }, [activeId])

  const onKeyDown = useCallback(
    (
      event: React.KeyboardEvent,
      currentId: string,
      onSelect: (id: string) => void,
    ) => {
      const index = ids.indexOf(currentId)
      if (index === -1) return
      let next: number | null = null
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % ids.length
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        next = (index - 1 + ids.length) % ids.length
      } else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = ids.length - 1
      if (next === null) return
      event.preventDefault()
      onSelect(ids[next])
    },
    [ids],
  )

  return { tabIndexFor, onKeyDown, registerRef }
}
