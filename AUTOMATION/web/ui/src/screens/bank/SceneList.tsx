/* The scene list: a selector, not a showcase. Replaces the 2-row horizontal
   carousel (31/08/2026 layout pass) with a narrow, vertically-scrolling
   outliner — one row per scene, grouped by intention in native `<details>`
   sections (studio-IA direction, 2026-09-01).

   WHY THE CAROUSEL DID NOT SURVIVE. A horizontal carousel is what you reach
   for when you refuse vertical scroll and are short on height — it is not
   how a professional tool organises a list of things you pick ONE of at a
   time. Unreal's World Outliner, Photoshop's Layers panel: a narrow vertical
   list, one row per object, that scrolls the ordinary way. This screen's
   scene picker is exactly that kind of list, not the work surface — the
   composer is the work surface, and it can only become the dominant, wide
   area (BankScreen.tsx's grid-cols) once this stops competing for width.

   THE CARD SHOWS THE ESSENTIALS, the composer's own header (SceneComposer's
   `SceneHeader`) now carries the rest once a scene is open — pose/band
   badges and tags do not need to survive twice. Deliberately the same
   `data-scene-card` contract `produce/SceneCard.tsx` used, so the keyboard
   accelerator in `useSceneWorkbench` keeps working the same way. */
import type { Creative } from '../../state/TaxonomyContext'
import type { SceneDraft } from '../../state/ScenesStoreContext'

export type ScenePreview = { name: string; bucket: string }

export function SceneListRow({
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
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-[9px] rounded-[8px] border-2 bg-panel px-[8px] py-[6px]
                 text-left [transition:border-color_.12s] focus-visible:outline-2
                 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                   selected ? 'border-acc' : 'border-transparent hover:border-line2'
                 }`}
      data-scene-card
      data-uid={draft.uid}
      data-on={selected ? '1' : undefined}
      aria-pressed={selected}
      onClick={onOpen}
    >
      <div
        className="h-[42px] w-[34px] shrink-0 overflow-hidden rounded-[6px] bg-panel2 bg-cover bg-center"
        style={preview ? { backgroundImage: `url('${imageUrl({ ...preview, thumb: true })}')` } : undefined}
      />
      <div className="min-w-0 flex-1">
        <b className="block truncate text-[12.5px] font-semibold" data-card-id>
          {draft.id || '(sans identifiant)'}
        </b>
        <span className="block truncate text-[10.5px] text-dim" data-card-produced>
          {draft.format} · {draft.count} img ·{' '}
          {stats ? `${stats.n} produite${stats.n > 1 ? 's' : ''}` : 'jamais produite'}
        </span>
      </div>
    </button>
  )
}

export type SceneGroup = {
  key: string
  label: string
  entries: { draft: SceneDraft; index: number }[]
}

/* Order follows `creative.intentions` — the same vocabulary the composer's
   own intention selector reads (never a taxonomy this screen invents on its
   own). A scene whose intention fell out of the taxonomy, or has none, KEEPS
   its own group rather than losing its scenes into an unrelated bucket —
   same "keep what's out of taxonomy visible" rule the composer already
   applies to an out-of-taxonomy intention value. */
export function groupByIntention(
  shown: { draft: SceneDraft; index: number }[],
  creative: Creative | null,
): SceneGroup[] {
  const labels = new Map((creative?.intentions ?? []).map((i) => [i.key, i.label]))
  const order = (creative?.intentions ?? []).map((i) => i.key)
  const buckets = new Map<string, { draft: SceneDraft; index: number }[]>()
  for (const entry of shown) {
    const key = entry.draft.intention || ''
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(entry)
  }
  const orderedKeys = [
    ...order.filter((k) => buckets.has(k)),
    ...[...buckets.keys()].filter((k) => k && !order.includes(k)),
    ...(buckets.has('') ? [''] : []),
  ]
  return orderedKeys.map((key) => ({
    key,
    label: key ? (labels.get(key) ?? key) : '— sans intention —',
    entries: buckets.get(key)!,
  }))
}
