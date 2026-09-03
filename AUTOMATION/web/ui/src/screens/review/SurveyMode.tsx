/* Compare mode (design-pass screen-5, §B) — up to 4 selected images side by
   side, each with its real score/judgement, and a "Garder cette version"
   that resolves the comparison: this one validated, the rest of the
   COMPARED set (not the whole original selection — see `overflowCount`)
   rejected.

   Reuses `ScoreBars`/`FlagButtons` as-is (same components `FullFrame.tsx`
   already uses) — no new score-display code. The confirmation ritual lives
   HERE rather than in `ReviewScreen.tsx`: it is this component that knows
   exactly which images are being compared and can name the real
   consequence, the same reasoning `DeclineDialog.tsx`/`PhotoEditor.tsx`
   already follow for their own confirmations. The actual mutation
   (`actMany`) stays in `ReviewScreen.tsx`, reached only through `onKeep`. */
import { useConfirm } from '../../chrome/ConfirmContext'
import { FlagButtons } from './FlagButtons'
import { ScoreBars } from './ScoreBars'
import type { GalleryItem } from './useTriage'

export function SurveyMode({
  compared,
  overflowCount,
  bands,
  allItems,
  onFlag,
  onKeep,
}: {
  compared: { item: GalleryItem; src: string }[]
  overflowCount: number
  bands: Record<string, unknown>
  allItems: GalleryItem[]
  onFlag: (item: GalleryItem, flag: string) => void
  onKeep: (kept: GalleryItem, compared: GalleryItem[]) => void
}) {
  const confirm = useConfirm()

  if (compared.length < 2) {
    return (
      <p className="tiny" role="status">
        Sélectionne au moins deux images pour comparer.
      </p>
    )
  }

  const keep = async (kept: GalleryItem) => {
    const others = compared.map((c) => c.item).filter((i) => i.name !== kept.name)
    const ok = await confirm({
      title: 'Garder cette version ?',
      button: 'Garder cette version',
      body: (
        <>
          <p>
            <b>{kept.scene || kept.name}</b> sera validée.
          </p>
          <p className="tiny">
            {others.length === 1
              ? "L'autre image comparée sera rejetée."
              : `Les ${others.length} autres images comparées seront rejetées.`}
          </p>
        </>
      ),
    })
    if (!ok) return
    onKeep(kept, compared.map((c) => c.item))
  }

  return (
    <div>
      {overflowCount > 0 && (
        <p className="tiny mb-[14px]">
          {compared.length} affichées sur {compared.length + overflowCount} sélectionnées — les {compared.length}
          {' '}premières.
        </p>
      )}
      <div
        className="grid gap-[16px]"
        style={{ gridTemplateColumns: `repeat(${compared.length}, minmax(0, 1fr))` }}
      >
        {compared.map(({ item, src }) => (
          <div
            key={item.name}
            className="flex flex-col gap-[10px] rounded-card border border-line bg-panel p-[12px]"
          >
            <img
              className="block aspect-[4/5] w-full rounded-[6px] object-cover"
              src={src}
              alt=""
            />
            {item.nettete == null ? (
              <div className="tiny">non mesuré</div>
            ) : (
              <ScoreBars item={item} bands={bands} items={allItems} flat />
            )}
            <div className="flex gap-[3px]" data-tacts>
              <FlagButtons item={item} onFlag={(flag) => onFlag(item, flag)} />
            </div>
            <button className="btn primary w-full" data-keep onClick={() => void keep(item)}>
              Garder cette version
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
