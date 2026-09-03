/* The inspector: everything about ONE scene, and nothing about the others.

   THE COMPOSER LIVES NEXT DOOR (31/08/2026, wireframe-driven). The flat form
   this file used to render directly — a dozen fields in one scroll — is now
   `composer/SceneComposer.tsx`, seven tabs instead: this file keeps the
   OUTER shell (the section, the Escape-closes gesture, the aria-label) and
   the world-link decision that gates several of the composer's fields, and
   hands the rest to it. `DocumentPane` below is untouched — a different
   concern (the bank's shared settings, shown when nothing is selected).

   THE INSPECTOR DOES NOT OWN THE SCENE. It edits a DRAFT, and the draft carries
   the original object (`base`): every key it does not display crosses the save
   untouched — `world` and `origin` among them. See ScenesStoreContext for the
   incident that rule comes from. */
import { useCallback, useEffect, useRef } from 'react'

import type { Creative } from '../../state/TaxonomyContext'
import type { SceneDraft } from '../../state/ScenesStoreContext'
import { SceneComposer } from './composer/SceneComposer'
import type { ScenePreview } from './SceneList'

/** Same guard as `pose-editor/PoseCanvas.tsx`'s own `isTextEntry`, duplicated
    rather than shared (that one lives in a different screen's module) — a
    `<select>` needs the same protection here that a `<textarea>`/`<input>`
    does, which the pose editor's own version does not need to worry about. */
function isEditableControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true
  if (target.tagName !== 'INPUT') return false
  const NOT_TEXT = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color']
  return !NOT_TEXT.includes((target as HTMLInputElement).type)
}

/* Same coalescing window/depth as the pose editor's own history
   (`usePoseEditor.ts`) — a keystroke is this screen's equivalent of a
   pointermove: one undo step per PAUSE in typing, not one per character. */
const HISTORY_COALESCE_MS = 400
const HISTORY_LIMIT = 100

export function SceneInspector({
  draft,
  creative,
  poses,
  produced,
  preview,
  imageUrl,
  onPatch,
  onRemove,
  onDuplicate,
  onPrevScene,
  onNextScene,
  onClose,
  onSaveDocument,
}: {
  draft: SceneDraft
  creative: Creative | null
  poses: string[]
  produced: number | null
  /** The scene's last produced shot, if any — same source as the grid card's
      own thumbnail (`BankScreen.tsx`'s `previews`), threaded here so the
      composer can show it too instead of going image-blind the moment a
      scene is actually open for editing. */
  preview: ScenePreview | undefined
  imageUrl: (ref: Record<string, unknown>) => string
  onPatch: (patch: Partial<SceneDraft>) => void
  onRemove: () => void
  /** Clones this scene and opens the clone (design pass écran 7, §B1). */
  onDuplicate: () => void
  /** Steps to the previous/next scene in `useSceneWorkbench`'s `shown` list
      (design pass écran 7, §B2) — `undefined` at either end, same convention
      as the composer's own Suivant/Précédent (only rendered when there is
      somewhere to go). */
  onPrevScene: (() => void) | undefined
  onNextScene: (() => void) | undefined
  onClose: () => void
  /** The document-level save, offered again from the composer's JSON panel. */
  onSaveDocument: () => void
}) {
  /* A scene bound to a world place (ADR-0015) never owns its frame: `prompt`
     and `intention` are always re-derived from the live catalog server-side,
     so letting them be typed here would edit a value the next save discards
     — the Monde tab (`PlaceInspector`) is where that text actually lives.
     Wardrobe levels and the pose skeleton are OVERLAY keys (ADR-0015 §2):
     never locked by this, whatever the composer decides for its own fields. */
  const worldLinked = draft.base.origin === 'world'

  /* Undo stack for `onPatch` (design pass écran 7, §B3) — bounded, in
     memory, one stack for whichever scene is currently open. `patchDraft`
     (ScenesStoreContext) writes straight into the draft with no history at
     all: a field cleared by a stray Ctrl+A/Delete had no way back before
     "Enregistrer". Same shape as the pose editor's own history
     (`usePoseEditor.ts`): `past`/`future` refs of whole SNAPSHOTS (a full
     `SceneDraft`, not a diff — passing one back through `onPatch` overwrites
     every key, `SceneDraft` has none optional, so this is a safe full
     restore, not a partial merge), reset whenever the OPEN scene changes —
     switching to another scene must not let Ctrl+Z reach into a different
     one's edits. */
  const past = useRef<SceneDraft[]>([])
  const future = useRef<SceneDraft[]>([])
  const lastPushAt = useRef(0)
  useEffect(() => {
    past.current = []
    future.current = []
    lastPushAt.current = 0
  }, [draft.uid])

  const patch = useCallback(
    (p: Partial<SceneDraft>) => {
      const now = Date.now()
      if (now - lastPushAt.current > HISTORY_COALESCE_MS) {
        past.current.push(draft)
        if (past.current.length > HISTORY_LIMIT) past.current.shift()
      }
      lastPushAt.current = now
      future.current = []
      onPatch(p)
    },
    [draft, onPatch],
  )
  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(draft)
    lastPushAt.current = 0
    onPatch(prev)
  }, [draft, onPatch])
  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(draft)
    lastPushAt.current = 0
    onPatch(next)
  }, [draft, onPatch])

  return (
    <section
      id="sceneInspector"
      aria-label={`Scène ${draft.id}`}
      /* Escape closes the panel and hands the focus back to its card — the same
         gesture as every overlay of the studio, even though this one is a
         column and not a dialog.

         Up/Down step to the previous/next SCENE (design pass écran 7, §B2) —
         same keys `onListKeyDown` uses on the list itself, ELEVATED here so
         they work with focus anywhere in the composer, not just on a list
         row (same "elevate the listener" reasoning as the pose editor's own
         `handlePoseKeyDown`, design-pass screen-6 §A2). Guarded by
         `isEditableControl`: a textarea/input/select needs its OWN Up/Down
         (cursor movement, a number spinner, changing an option) more than
         this screen needs a global accelerator on top of it.

         Ctrl/Cmd+Z (+Shift for redo) undoes/redoes a patch (§B3) — same
         `isEditableControl` guard for what it APPLIES: inside a text field
         this never touches the scene-level history. It still calls
         `preventDefault()` there too, though, rather than leaving the key
         to the field's own native undo the way `PoseCanvas`'s
         `handlePoseKeyDown` does for a plain input — measured live: a
         REACT-CONTROLLED field's native Ctrl+Z is not reliably scoped to
         the FOCUSED field. Editing field A, tabbing to an untouched field B
         and pressing Ctrl+Z there still ate a character back out of A —
         Chromium's own undo falling through to "the last edit anywhere on
         the page" once the focused element has no local history of its
         own. Suppressing it entirely is the safer, predictable choice; nothing
         here ever intercepts ordinary typing, only this one combo. */
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
          return
        }
        const inField = isEditableControl(e.target)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault()
          if (inField) return
          if (e.shiftKey) redo()
          else undo()
          return
        }
        if (inField) return
        if (
          (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
          !e.altKey && !e.ctrlKey && !e.metaKey
        ) {
          const step = e.key === 'ArrowUp' ? onPrevScene : onNextScene
          if (step) {
            e.preventDefault()
            step()
          }
        }
      }}
      /* `h-full`: the ASIDE around this section is capped, not forced
         (`BankScreen.tsx`, `max-h-[calc(100vh-150px)]` — reverted from a
         forced height that could push the composer's Suivant/Précédent bar
         past the real viewport on a window taller than the cap assumed).
         Most of the time this section just sizes to its own content, same as
         the aside. `h-full` only matters the rare time a tab's content
         actually exceeds the cap: the aside then clamps to it and scrolls,
         and this keeps the visible bordered/backgrounded box — what actually
         reads as "the panel" — filling that scrollable area instead of
         stopping short partway through it. */
      className="h-full rounded-card border border-line bg-panel p-[16px]"
    >
      <SceneComposer
        draft={draft}
        creative={creative}
        poses={poses}
        produced={produced}
        preview={preview}
        imageUrl={imageUrl}
        worldLinked={worldLinked}
        onPatch={patch}
        onRemove={onRemove}
        onDuplicate={onDuplicate}
        onPrevScene={onPrevScene}
        onNextScene={onNextScene}
        onSaveDocument={onSaveDocument}
      />
    </section>
  )
}

/* Nothing selected. The panel is not empty — it holds what belongs to the
   DOCUMENT rather than to a scene: the two fragments every prompt of the bank
   carries. They used to sit above the cards, where they were re-read on every
   visit and edited about once a month. */
export function DocumentPane({
  anchor,
  direction,
  count,
  onAnchor,
  onDirection,
}: {
  anchor: string
  direction: string
  count: number
  onAnchor: (value: string) => void
  onDirection: (value: string) => void
}) {
  return (
    <section
      id="bankDocument"
      aria-label="Réglages de la banque"
      className="h-full rounded-card border border-line bg-panel p-[16px]"
    >
      <h2 className="mt-0 mb-[4px]">Réglages de la banque</h2>
      <p className="tiny mt-0 mb-[16px]">
        Ce que les {count} scènes partagent. Ouvre une scène dans la grille pour
        l'éditer.
      </p>

      <label className="f">
        <span>ancre d'identité — ajoutée à toutes les scènes</span>
        <textarea
          id="anchor"
          className="min-h-[64px] resize-y"
          value={anchor}
          onChange={(e) => onAnchor(e.target.value)}
        />
      </label>
      <p className="tiny mt-[6px] mb-[18px]">
        Ne décris jamais le visage dans une scène : le verrou d'identité le
        porte. Ici on ne met que ce qu'il ne transporte pas (cheveux, yeux,
        taches de rousseur).
      </p>

      <label className="f">
        <span>note de direction — ajoutée à la fin de tous les prompts</span>
        <input
          id="direction"
          placeholder="ex : autumn palette, softer light — laisser vide si aucune"
          value={direction}
          onChange={(e) => onDirection(e.target.value)}
        />
      </label>
      <p className="tiny mt-[6px] mb-0">
        Sert à donner une intention de série sans réécrire chaque scène. Se vide
        aussi vite qu'elle se met.
      </p>
    </section>
  )
}
