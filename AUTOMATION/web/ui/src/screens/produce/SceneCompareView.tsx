/* Side-by-side comparison of the scenes ticked for this run — screen-3-
   produire design pass §S. Toggled by "Comparer (N)" in the scene grid's
   toolbar, active from 2 ticked scenes. Not a new selection mechanism: the
   candidates ARE `selected`, read from the full scene list rather than the
   (searched/sorted/filtered) grid — comparing must not depend on what the
   grid happens to show at the moment the button was pressed.

   "Retenir" narrows the run down to that one candidate — the point of
   comparing side by side is picking a winner, not adding a second workflow
   for launching. No persistence: this is screen state, gone on navigation,
   same as the ticks it reads. */
import { useConfig } from '../../state/ConfigContext'
import type { Scene } from '../../state/ScenesStoreContext'
import type { SceneMeta, SceneStats } from './useSceneChoice'

export function SceneCompareView({
  candidates,
  meta,
  stats,
  previews,
  tone,
  imageUrl,
  onRemove,
  onKeep,
}: {
  candidates: Scene[]
  meta: SceneMeta
  stats: SceneStats
  previews: Record<string, { name: string; bucket: string; space?: string; v?: number }>
  tone: string
  imageUrl: (ref: Record<string, unknown>) => string
  /** Un-ticks one candidate — same effect as clicking its card in the grid. */
  onRemove: (id: string) => void
  /** Keeps only this one: the run narrows to a single scene. */
  onKeep: (id: string) => void
}) {
  const { qc } = useConfig()

  return (
    <div
      className="grid gap-[14px] grid-cols-[repeat(auto-fill,minmax(220px,1fr))]"
      id="compareGrid"
      aria-label="Comparaison des scènes cochées"
    >
      {candidates.map((scene) => {
        const s = stats[scene.id]
        const preview = previews[scene.id]
        const dot =
          s?.avg == null
            ? 'var(--dim2)'
            : s.avg >= qc.high
              ? 'var(--ok)'
              : s.avg >= qc.ok
                ? 'var(--warn)'
                : 'var(--bad)'
        const suits = (meta[scene.id]?.tones ?? []).includes(tone)
        return (
          <div
            key={scene.id}
            className="overflow-hidden rounded-card border border-line bg-panel"
            data-compare-card
          >
            <div
              className="relative aspect-[4/5] bg-panel2 bg-cover bg-center"
              style={preview ? { backgroundImage: `url('${imageUrl({ ...preview, thumb: true })}')` } : undefined}
            >
              {suits && (
                <div className="absolute top-[8px] left-[8px] rounded-[10px] bg-scrim px-[7px] py-px text-[10.5px] font-bold text-acc">
                  ce ton
                </div>
              )}
              <button
                type="button"
                className="absolute top-[8px] right-[8px] flex h-[24px] w-[24px] items-center
                           justify-center rounded-[50%] border border-line2 bg-scrim p-0 text-[13px]
                           text-txt"
                aria-label={`retirer ${scene.id} de la comparaison`}
                onClick={() => onRemove(scene.id)}
              >
                ✕
              </button>
            </div>
            <div className="p-[11px]">
              <b className="block truncate text-[13px] font-semibold">{scene.id}</b>
              <div className="mt-[5px] flex items-center gap-[6px] text-[11.5px]">
                <span className="h-[7px] w-[7px] flex-none rounded-[50%]" style={{ background: dot }} />
                {s ? (
                  `${s.avg != null ? s.avg.toFixed(3) : '—'} · ${s.ok ?? 0}/${s.n} validée${s.n > 1 ? 's' : ''}`
                ) : (
                  <span className="text-dim2">jamais produite</span>
                )}
              </div>
              <button
                type="button"
                className="btn sm mt-[9px] w-full"
                onClick={() => onKeep(scene.id)}
              >
                Retenir
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
