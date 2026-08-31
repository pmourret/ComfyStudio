/* Selection and gestures of the scene workbench.

   THE BANK IS A GRID PLUS AN INSPECTOR, and this holds the one thing the two
   halves share: which scene is open. It selects on the draft's `uid`, never on
   its index — removing the third scene used to shift every following one onto
   its neighbour's state, and an index-based selection would have followed the
   same slide onto the wrong scene.

   `.tsx` because the removal confirmation carries its sentence as markup, like
   `review/useSortActions.tsx`. Nothing here calls the API: the store owns the
   document, this owns the pointing. */
import { useCallback, useMemo, useRef, useState } from 'react'

import { useConfirm } from '../../chrome/ConfirmContext'
import { useScenes, type SceneDraft } from '../../state/ScenesStoreContext'

/** Accent- and case-insensitive enough for a bank of a few dozen scenes. */
const fold = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function matches(draft: SceneDraft, needle: string) {
  if (!needle) return true
  const hay = fold([draft.id, draft.prompt, draft.tags, draft.intention].join(' '))
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

  const select = useCallback((uid: string | null) => setSelectedUid(uid), [])

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
  }
}
