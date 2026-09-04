/* Selection and gestures of the scene workbench.

   THE BANK IS A LIST PLUS AN INSPECTOR, and this holds the one thing the two
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

function matches(draft: SceneDraft, needle: string) {
  if (!needle) return true
  const hay = fold([draft.id, composePrompt(draft), draft.tags, draft.intention].join(' '))
  return fold(needle)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

export function useSceneWorkbench() {
  const { drafts, addScene, removeScene, duplicateScene } = useScenes()
  const confirm = useConfirm()
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
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

  /* Scene-to-scene stepping (design pass écran 7, §B2) — the composer's own
     Suivant/Précédent only walk the 7 TABS of the scene that is open;
     changing SCENE used to mean Échap (back to the list), an arrow, then
     reopening. Walks `shown` in its OWN order (the filtered document order,
     not the grouped/alphabetised order `SceneListPanel` renders it in) —
     the header this feeds has no reason to reimplement that grouping for a
     quick nudge. A no-op at either end, same as `onListKeyDown` running off
     the list: nothing to step to is not an error. */
  const shownIndex = useMemo(
    () => shown.findIndex(({ draft }) => draft.uid === selectedUid),
    [shown, selectedUid],
  )
  const hasPrevScene = shownIndex > 0
  const hasNextScene = shownIndex >= 0 && shownIndex < shown.length - 1
  const stepScene = useCallback(
    (delta: 1 | -1) => {
      const target = shownIndex + delta
      if (shownIndex < 0 || target < 0 || target >= shown.length) return
      select(shown[target].draft.uid)
    },
    [shownIndex, shown, select],
  )

  /* Arrows walk the list. An ACCELERATOR, not a composite widget: every row
     keeps its natural place in the tab order, so nothing regresses for whoever
     navigates by Tab alone. What it removes is the many tabulations it took
     to cross a bank from one corner to the other.

     LINEAR, not column-major (studio-IA direction, 2026-09-01 — the carousel
     this replaced needed a column-major math the outliner-style vertical list
     does not: DOM order already IS reading order). Up/Down move by one row;
     Home/End jump the ends. Rows inside a COLLAPSED `<details>` group are
     `display:none` (native), so `.offsetParent === null` for them — filtered
     out here the same way a hidden element already fails a visibility check
     anywhere else in the studio, not a hand-rolled exception for this list.

     Left/Right do not move between rows: they collapse/expand the group the
     focused row (or its own `<summary>`) belongs to — the same convention a
     file tree already uses (Explorer, VS Code), and the reason this list is
     grouped by `<details>` rather than a home-rolled disclosure widget in the
     first place. */
  const onListKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const list = listRef.current
    if (!list || event.altKey || event.ctrlKey || event.metaKey) return
    const target = document.activeElement as HTMLElement | null
    if (!target) return

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const details = target.closest('details')
      if (!details) return
      const wantOpen = event.key === 'ArrowRight'
      if (details.open === wantOpen) return
      event.preventDefault()
      details.open = wantOpen
      if (!wantOpen) details.querySelector<HTMLElement>('summary')?.focus()
      return
    }

    const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-scene-card]')).filter(
      (el) => el.offsetParent !== null,
    )
    const from = rows.indexOf(target)
    if (from < 0) return
    const to =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : event.key === 'ArrowDown'
            ? from + 1
            : event.key === 'ArrowUp'
              ? from - 1
              : -1
    /* Out of the list — at an edge, or on a key we do not claim. The page
       keeps its own scrolling: an arrow that does nothing must not also eat
       the gesture. */
    if (to < 0 || to >= rows.length || to === from) return
    event.preventDefault()
    rows[to].focus()
  }, [])

  /* Closing gives the focus back to the row that was open. Without it focus
     falls to the top of the document and one tabs through the whole screen to
     reach the next scene — the exact cost a workbench exists to remove. */
  const close = useCallback(() => {
    const uid = selectedUid
    setSelectedUid(null)
    if (!uid) return
    listRef.current?.querySelector<HTMLElement>(`[data-uid="${uid}"]`)?.focus()
  }, [selectedUid])

  /* A scene created blind in a grid of twenty is not created: adding opens it.
     The filter is cleared first, otherwise the new card is born hidden. */
  const add = useCallback(() => {
    setFilter('')
    setSelectedUid(addScene())
    setInspectorMode('character')
  }, [addScene])

  /* Same "opens what it creates" rule as `add` (design pass écran 7, §B1) —
     a variant of a scene is iterated on immediately, not left to find in a
     grid of twenty. The filter clears too: a duplicate born hidden behind
     an active filter would look like nothing happened. */
  const duplicate = useCallback(
    (index: number) => {
      setFilter('')
      setSelectedUid(duplicateScene(index))
      setInspectorMode('character')
    },
    [duplicateScene],
  )

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
            Elle quitte l'atelier au prochain enregistrement, et la production
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
    listRef,
    filter,
    setFilter,
    shown,
    selected,
    selectedIndex,
    select,
    stepScene,
    hasPrevScene,
    hasNextScene,
    close,
    add,
    duplicate,
    remove,
    onListKeyDown,
    inspectorMode,
    setInspectorMode,
  }
}
