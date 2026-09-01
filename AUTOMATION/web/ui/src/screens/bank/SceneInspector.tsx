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
import type { Creative } from '../../state/TaxonomyContext'
import type { SceneDraft } from '../../state/ScenesStoreContext'
import { SceneComposer } from './composer/SceneComposer'
import type { ScenePreview } from './SceneList'

export function SceneInspector({
  draft,
  creative,
  poses,
  produced,
  preview,
  imageUrl,
  onPatch,
  onRemove,
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

  return (
    <section
      id="sceneInspector"
      aria-label={`Scène ${draft.id}`}
      /* Escape closes the panel and hands the focus back to its card — the same
         gesture as every overlay of the studio, even though this one is a
         column and not a dialog. */
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
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
        onPatch={onPatch}
        onRemove={onRemove}
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
