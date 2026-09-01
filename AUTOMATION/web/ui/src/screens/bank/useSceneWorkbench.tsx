/* Selection and gestures of the scene workbench.

   THE BANK IS A GRID PLUS AN INSPECTOR, and this holds the one thing the two
   halves share: which scene is open. It selects on the draft's `uid`, never on
   its index — removing the third scene used to shift every following one onto
   its neighbour's state, and an index-based selection would have followed the
   same slide onto the wrong scene.

   `.tsx` because the removal confirmation carries its sentence as markup, like
   `review/useSortActions.tsx`. Nothing here calls the API: the store owns the
   document, this owns the pointing. */
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { useConfirm } from '../../chrome/ConfirmContext'
import { composePrompt, useScenes, type SceneDraft } from '../../state/ScenesStoreContext'

/** Accent- and case-insensitive enough for a bank of a few dozen scenes. */
const fold = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/* Fixed rows of the carousel grid (`BankScreen.tsx`, `#sceneCards`,
   `[grid-template-rows:repeat(2,auto)]`) \u2014 a DESIGN constant, not derived: 2
   rows is the wireframe's choice, it does not change with the viewport the
   way the old auto-fill grid's column count did (31/08/2026 layout pass). */
const GRID_ROWS = 2

function matches(draft: SceneDraft, needle: string) {
  if (!needle) return true
  const hay = fold([draft.id, composePrompt(draft), draft.tags, draft.intention].join(' '))
  return fold(needle)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

export function useSceneWorkbench() {
  const { drafts, addScene, removeScene } = useScenes()
  const confirm = useConfirm()
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const gridRef = useRef<HTMLDivElement | null>(null)
  /* Monde | Personnage (ADR-0015) — only meaningful for a scene bound to a
     world place (`origin === 'world'`), reset to 'character' on every new
     selection so opening a different scene never inherits the previous
     one's tab. */
  const [inspectorMode, setInspectorMode] = useState<'character' | 'world'>('character')

  /* Derived, never stored: a selection that outlives the scene it points at is
     how an inspector ends up editing a draft the grid no longer has. Switching
     character reloads the drafts with fresh uids, so it also clears itself. */
  const selectedIndex = useMemo(
    () => drafts.findIndex((draft) => draft.uid === selectedUid),
    [drafts, selectedUid],
  )
  const selected = selectedIndex >= 0 ? drafts[selectedIndex] : null

  /* The filter narrows the GRID, never the document: what it hides is still
     saved, still produced, still counted. Each entry carries its REAL index in
     the bank, so a patch keeps addressing the right scene. */
  const shown = useMemo(
    () =>
      drafts
        .map((draft, index) => ({ draft, index }))
        .filter(({ draft }) => matches(draft, filter)),
    [drafts, filter],
  )

  const select = useCallback((uid: string | null) => {
    setSelectedUid(uid)
    setInspectorMode('character')
  }, [])

  /* Arrows walk the grid. An ACCELERATOR, not a composite widget: every card
     keeps its natural place in the tab order, so nothing regresses for whoever
     navigates by Tab alone. What it removes is the twenty tabulations it took
     to cross a bank from one corner to the other.

     COLUMN-MAJOR, not row-major (31/08/2026 layout pass): the grid is now a
     horizontal carousel (`[grid-auto-flow:column]`, `GRID_ROWS` fixed rows),
     so the DOM order (unchanged — CSS never reorders it) walks DOWN a column
     before moving to the next one. The old grid was `auto-fill` (row-major,
     variable column count read from the computed style, since it changed with
     the window); this one is the opposite shape — a FIXED row count, a
     variable column count — so the roles of Up/Down and Left/Right swap:
     Up/Down move by one (next/previous row of the SAME column), Left/Right
     jump a whole column (`±GRID_ROWS`). */
  const onGridKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const grid = gridRef.current
    if (!grid || event.altKey || event.ctrlKey || event.metaKey) return
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-scene-card]'))
    const from = cards.indexOf(document.activeElement as HTMLElement)
    if (from < 0) return

    const steps: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      ArrowLeft: -GRID_ROWS,
      ArrowRight: GRID_ROWS,
    }
    const to =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? cards.length - 1
          : event.key in steps
            ? from + steps[event.key]
            : -1
    /* Out of the grid — at an edge, or on a key we do not claim. The page keeps
       its own scrolling: an arrow that does nothing must not also eat the
       gesture. */
    if (to < 0 || to >= cards.length || to === from) return
    event.preventDefault()
    cards[to].focus()
  }, [])

  /* Closing gives the focus back to the card that was open. Without it focus
     falls to the top of the document and one tabs through the whole screen to
     reach the next scene — the exact cost a workbench exists to remove. */
  const close = useCallback(() => {
    const uid = selectedUid
    setSelectedUid(null)
    if (!uid) return
    gridRef.current?.querySelector<HTMLElement>(`[data-uid="${uid}"]`)?.focus()
  }, [selectedUid])

  /* A scene created blind in a grid of twenty is not created: adding opens it.
     The filter is cleared first, otherwise the new card is born hidden. */
  const add = useCallback(() => {
    setFilter('')
    setSelectedUid(addScene())
    setInspectorMode('character')
  }, [addScene])

  /* Removing is destructive — the scene leaves the bank at the next save and
     production stops proposing it. Retiring a POSE skeleton already asks; a
     scene is worth more than a skeleton. */
  const remove = useCallback(
    async (index: number) => {
      const draft = drafts[index]
      if (!draft) return
      const ok = await confirm({
        title: `Retirer la scène « ${draft.id} » ?`,
        button: 'Retirer',
        body: (
          <p>
            Elle quitte la banque au prochain enregistrement, et la production
            ne la proposera plus. Les images déjà produites, elles, restent sur
            le disque.
          </p>
        ),
      })
      if (!ok) return
      if (draft.uid === selectedUid) setSelectedUid(null)
      removeScene(index)
    },
    [confirm, drafts, removeScene, selectedUid],
  )

  return {
    gridRef,
    filter,
    setFilter,
    shown,
    selected,
    selectedIndex,
    select,
    close,
    add,
    remove,
    onGridKeyDown,
    inspectorMode,
    setInspectorMode,
  }
}
