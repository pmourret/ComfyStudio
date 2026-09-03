/* The Produire screen's own state, and the plan that follows it.
   Ported from `static/create.js`.

   COUPLING TRAP §5.6-2 — /api/plan is replayed on every keystroke, behind a
   debounce. It carries THREE things at once: the count, the prompt preview and
   the instruction alerts. Nothing here batches it away or replaces it with a
   local computation: the assembly of the prompt lives on the server, and a
   second implementation in the frontend is exactly what the preview exists to
   avoid.

   COUPLING TRAP §5.6-3 — `#btnRun.disabled`. Two timers used to write it: the
   1.5 s production tick and refreshPlan(). `planOk()` was the common source that
   kept them from fighting, and it is documented on the backend side as
   AUDIT.md §5.6. Here `planOk` is derived state and the button's disabled
   attribute is ONE expression, computed in one place from (planOk, running,
   comfy) — the two writers cannot exist any more, so neither can the bug the
   guard covered. The guard survives as that single expression; see
   `runDisabled` below. */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ActionLike, Schema } from '../../api/client'
import { useApi } from '../../api/useApi'
import type { Creative } from '../../state/TaxonomyContext'

export type PlanResponse = Schema<'PlanResponse'>

/** The prompt preview, as `apercu_prompt()` builds it. */
export type Preview = {
  total_car: number
  n_jobs: number
  scene: string
  fragments: { source: string; texte: string; part: number }[]
  echos: { mot: string; sources: string[] }[]
}

/** One editable source image of the NSFW tier. */
export type SourceImage = { name: string; bucket: string }

/* The debounce of the plan. 220 ms is the legacy value: short enough that the
   count follows typing, long enough that a sentence does not fire one request
   per letter. */
const PLAN_DEBOUNCE_MS = 220

export type IntensityTier = Creative['intensity'][number]

/** The tier that EDITS an image instead of generating one. ONE place recognises
    it, so the answer is the same everywhere (slider, blocks, badge, guards). The
    server has its counterpart, `palier_edition`. */
export const isEditTier = (tier: IntensityTier | null | undefined) =>
  Boolean(tier && tier.pipeline === 'edit')

export function usePlan({
  payload,
  enabled,
}: {
  payload: () => Record<string, unknown>
  /** False while the screen has nothing to ask about yet. */
  enabled: boolean
}) {
  const api = useApi()
  const [plan, setPlan] = useState<(PlanResponse & ActionLike) | null>(null)
  const [pending, setPending] = useState(false)
  const timer = useRef<number | null>(null)
  const sequence = useRef(0)
  const latest = useRef(payload)
  latest.current = payload

  const refresh = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (!enabled) {
      setPlan(null)
      return
    }
    setPending(true)
    timer.current = window.setTimeout(async () => {
      const seq = ++sequence.current
      let response: (PlanResponse & ActionLike) | null = null
      try {
        response = await api.post<PlanResponse>('/api/plan', latest.current())
      } catch {
        response = { ok: false, erreur: 'serveur injoignable' } as PlanResponse & ActionLike
      }
      // a stale answer never overwrites a newer one
      if (seq !== sequence.current) return
      setPending(false)
      setPlan(response)
    }, PLAN_DEBOUNCE_MS)
  }, [api, enabled])

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  return { plan, pending, refresh }
}
