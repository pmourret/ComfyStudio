/* Which scenes the current level makes available, and in which order.

   TWO RULES THAT COME FROM THE SERVER, AND ARE NOT REIMPLEMENTED HERE.

   The BAND of a scene arrives in `bank.meta`: the server applies the same
   compatibility defaults as the runner, so the frontend reads a band rather
   than deriving one. A second derivation would drift the day the defaults move.

   The LEVEL consulted is the GENERATION level, not the displayed one. On the
   editing tier the chain runs in two steps — generate at `base_level` (Soft)
   then edit — so asking for the scenes of level 3 empties the grid: no scene
   declares band 3. `payload_at_generation_level()` applies the same rule on the
   server.

   THE TONE REMOVES NOTHING. It lifts the scenes that suit it to the top. Hard
   filtering led to dead ends — lifestyle + elegant returned zero scene, and an
   empty grid says « nothing exists » when it means « nothing matches ».

   SEARCH AND SORT (screen-3-produire design pass, §S) — client-side only,
   over the SAME `scenesOf(intent)` list: a substring match on the scene id,
   and a sort key that REPLACES the tone-affinity order rather than fighting
   it (affinity is itself one of the choices, and the default). Neither
   touches `scenesOf`: a shorter, reordered `visibleScenes` is exactly what
   the grid renders, nothing else reads this list. */
import { useCallback, useMemo } from 'react'

import type { Scene } from '../../state/ScenesStoreContext'
import type { IntensityTier } from './useProduceState'

export type SceneMeta = Record<
  string,
  { band?: number[]; intention?: string; tones?: string[]; tags?: string[]; pose?: string }
>

export type SceneStats = Record<string, { avg: number | null; n: number; ok?: number | null }>

export type SceneSort = 'affinity' | 'never' | 'score' | 'name'

export function useSceneChoice({
  bank,
  drafts,
  tier,
  level,
  intent,
  tone,
  search = '',
  sortBy = 'affinity',
}: {
  bank: { meta?: unknown; stats?: unknown } | null | undefined
  drafts: { base: unknown }[]
  tier: IntensityTier | null
  level: number
  intent: string | null
  tone: string
  /** Substring on `scene.id`, case-insensitive. */
  search?: string
  sortBy?: SceneSort
}) {
  /* Level at which the GENERATION pass runs — see the header. */
  const sceneLevel = tier?.base_level != null ? tier.base_level : level

  /* A scene is only available if the current level is in its band. The band
     comes from the server (bank.meta), which applies the same compatibility
     defaults as the runner — the frontend does not reimplement them. */
  const meta = (bank?.meta ?? {}) as SceneMeta
  const sceneList = useMemo(() => drafts.map((d) => d.base as Scene), [drafts])
  const inBand = useCallback(
    (scene: Scene) => {
      const band = meta[scene.id]?.band ?? [0, 1]
      return band[0] <= sceneLevel && sceneLevel <= band[1]
    },
    [meta, sceneLevel],
  )
  const intentOf = (scene: Scene) => meta[scene.id]?.intention ?? scene.category
  const scenesOf = useCallback(
    (key: string) => sceneList.filter((s) => inBand(s) && (key === '*' || intentOf(s) === key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sceneList, inBand, meta],
  )

  const stats = (bank?.stats ?? {}) as SceneStats

  /* The tone removes no scene — it lifts the ones that suit it. Hard filtering
     led to dead ends (lifestyle + elegant: zero scene). Kept as the DEFAULT
     sort; the three others are picked explicitly, never combined with it —
     a secondary key on top of a secondary key stops being legible. */
  const visibleScenes = useMemo(() => {
    if (!intent) return []
    const needle = search.trim().toLowerCase()
    const pool = needle
      ? scenesOf(intent).filter((s) => s.id.toLowerCase().includes(needle))
      : scenesOf(intent)
    const affinity = (s: Scene) => ((meta[s.id]?.tones ?? []).includes(tone) ? 0 : 1)
    const comparators: Record<SceneSort, (a: Scene, b: Scene) => number> = {
      affinity: (a, b) => affinity(a) - affinity(b) || a.id.localeCompare(b.id),
      // never-produced first — `n` absent or zero means the scene never ran
      never: (a, b) => Number((stats[a.id]?.n ?? 0) > 0) - Number((stats[b.id]?.n ?? 0) > 0)
        || a.id.localeCompare(b.id),
      // best average identity score first; never-produced (no avg) sinks last
      score: (a, b) => (stats[b.id]?.avg ?? -1) - (stats[a.id]?.avg ?? -1)
        || a.id.localeCompare(b.id),
      name: (a, b) => a.id.localeCompare(b.id),
    }
    return pool.slice().sort(comparators[sortBy])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, tone, scenesOf, meta, search, sortBy, stats])

  return { meta, stats, sceneList, scenesOf, visibleScenes }
}
