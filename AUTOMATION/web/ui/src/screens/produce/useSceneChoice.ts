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
   empty grid says « nothing exists » when it means « nothing matches ». */
import { useCallback, useMemo } from 'react'

import type { Scene } from '../../state/ScenesStoreContext'
import type { IntensityTier } from './useProduceState'

export type SceneMeta = Record<
  string,
  { band?: number[]; intention?: string; tones?: string[]; tags?: string[]; pose?: string }
>

export function useSceneChoice({
  bank,
  drafts,
  tier,
  level,
  intent,
  tone,
}: {
  bank: { meta?: unknown } | null | undefined
  drafts: { base: unknown }[]
  tier: IntensityTier | null
  level: number
  intent: string | null
  tone: string
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

  /* The tone removes no scene — it lifts the ones that suit it. Hard filtering
     led to dead ends (lifestyle + elegant: zero scene). */
  const visibleScenes = useMemo(() => {
    if (!intent) return []
    const affinity = (s: Scene) => ((meta[s.id]?.tones ?? []).includes(tone) ? 0 : 1)
    return scenesOf(intent)
      .slice()
      .sort((a, b) => affinity(a) - affinity(b) || a.id.localeCompare(b.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, tone, scenesOf, meta])

  return { meta, sceneList, scenesOf, visibleScenes }
}
