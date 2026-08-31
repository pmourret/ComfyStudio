/* The grid of the bank: one card per scene, the essentials only.

   WHAT IT REPAIRS. The bank was twenty stacked forms of a dozen fields each —
   five thousand pixels to scroll before knowing what the character owns. One
   could not compare two scenes, find « the café one », or count how many carry
   an imposed pose without walking the whole page.

   THE CARD SHOWS WHAT IDENTIFIES A SCENE, the inspector holds the rest: its
   picture, its name, its format and count, whether it has ever been produced,
   and the two things that change what a run does — an imposed pose and a
   wardrobe that lifts its ceiling. Everything else is one click away.

   Deliberately the same card vocabulary as the Créer grid
   (`produce/SceneCard.tsx`): the same scenes, seen twice for two trades — there
   they are PICKED for a run, here they are OPENED for editing. Two looks for
   one object would be the studio contradicting itself. */
import { bandOf, textToWardrobe, type SceneDraft } from '../../state/ScenesStoreContext'

/* The border carries the selection, so it stays out of the base chain: two
   utilities setting the same property are decided by their order in the
   GENERATED sheet, not in the class string. Same reasoning as the Créer card. */
const CARD =
  'relative block w-full cursor-pointer overflow-hidden rounded-card border-2 bg-panel text-left' +
  ' [transition:border-color_.12s] focus-visible:outline-2 focus-visible:outline-focus' +
  ' focus-visible:outline-offset-2'
const CARD_IDLE = 'border-line hover:border-line2'

export type ScenePreview = { name: string; bucket: string }

export function SceneGridCard({
  draft,
  preview,
  stats,
  selected,
  imageUrl,
  onOpen,
}: {
  draft: SceneDraft
  preview?: ScenePreview
  stats?: { n: number; avg: number | null }
  selected: boolean
  imageUrl: (ref: Record<string, unknown>) => string
  onOpen: () => void
}) {
  /* The ceiling follows the wardrobe TEXT as it is typed in the inspector, so
     the card answers « how far does this scene go » without a save. Mirror of
     `lb.scene_band`, same call as the inspector's own line. */
  const band = bandOf({
    intensity: Number.parseInt(draft.bandLo, 10) || 0,
    wardrobe: textToWardrobe(draft.wardrobe),
  })
  const tags = draft.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ')

  return (
    <button
      type="button"
      className={`${CARD} ${selected ? 'border-acc' : CARD_IDLE}`}
      data-scene-card
      data-uid={draft.uid}
      data-on={selected ? '1' : undefined}
      aria-pressed={selected}
      onClick={onOpen}
    >
      <div
        className={`relative aspect-[4/5] bg-panel2 bg-cover bg-center ${
          preview
            ? ''
            : "after:absolute after:inset-0 after:flex after:items-center" +
              " after:justify-center after:text-[12px] after:text-dim2" +
              " after:content-['jamais_produite']"
        }`}
        data-void={preview ? undefined : '1'}
        style={
          preview
            ? { backgroundImage: `url('${imageUrl({ ...preview, thumb: true })}')` }
            : undefined
        }
      >
        {draft.pose && (
          <div
            className="absolute top-[8px] left-[8px] rounded-[10px] bg-scrim px-[7px] py-px
                       text-[10.5px] font-bold text-[#9fd8ff]"
            title={`pose imposée : ${draft.pose}`}
          >
            {/* the glyph accompanies a word, so it is not read out on its own */}
            <span aria-hidden="true">⛓ </span>pose
          </div>
        )}
        {band[1] > 0 && (
          <div
            className="absolute right-[8px] bottom-[8px] rounded-[10px] bg-scrim px-[7px]
                       py-px text-[10.5px] font-bold text-dim"
            title={`niveaux ${band[0]} à ${band[1]}, déduits des tenues`}
          >
            n{band[0]}–{band[1]}
          </div>
        )}
      </div>
      <div className="px-[11px] py-[9px]">
        <b className="block truncate text-[13px] font-semibold" data-card-id>
          {draft.id || '(sans identifiant)'}
        </b>
        <span className="text-[11.5px] text-dim">
          {draft.format} · {draft.count} img
          {draft.variants.trim() ? ` +${draft.variants.trim().split('\n').length} var.` : ''}
        </span>
        {/* Produced or not is SAID, not only shown: renaming the id of a scene
            that already has images orphans them from their statistics, and the
            gesture is only informed if the card says there are any. */}
        <div className="mt-[5px] text-[11.5px] text-dim" data-card-produced>
          {stats ? `${stats.n} produite${stats.n > 1 ? 's' : ''}` : 'jamais produite'}
        </div>
        {tags && <div className="mt-[5px] truncate text-[10.5px] text-dim2">{tags}</div>}
      </div>
    </button>
  )
}

/* Last card of the grid, in the same family as the ones around it: creating
   belongs to the grid rather than sitting above it as a lone button. */
export function NewSceneCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={`${CARD} ${CARD_IDLE} flex min-h-[170px] items-center justify-center
                  border-dashed text-center`}
      data-scene-card
      data-new
      id="btnAddScene"
      onClick={onClick}
    >
      <div className="px-[11px] py-[9px]">
        <b className="block text-[20px] font-semibold" aria-hidden="true">
          +
        </b>
        <span className="text-[11.5px] text-dim">ajouter une scène</span>
      </div>
    </button>
  )
}
