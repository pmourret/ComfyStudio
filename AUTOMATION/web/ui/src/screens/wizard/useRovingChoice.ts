/* Keyboard mechanics for one radiogroup of mutually exclusive choices —
   the type/style/world cards and the candidate grid all share this, even
   though what they render differs (a labelled card vs. an image thumbnail
   with error/pending states). Arrows move the selection AND pick it
   immediately, same as a native radio group; Home/End jump to the ends.
   `tabIndexFor` keeps exactly one Tab stop per group: the active choice, or
   the first item while nothing is picked yet. */
import { useCallback, useRef } from 'react'

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
      const nextId = ids[next]
      onSelect(nextId)
      nodes.current.get(nextId)?.focus()
    },
    [ids],
  )

  return { tabIndexFor, onKeyDown, registerRef }
}
