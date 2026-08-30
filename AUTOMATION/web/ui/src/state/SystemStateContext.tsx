/* The production tick: /api/state every 1.5 s, shared by the whole chrome.

   Ported from `static/poller.js`. It paints the ComfyUI dot, the production
   text, the bucket counters and the Review badge, and it tells the screens when
   a batch has finished.

   BATCH TRACKING BY ID, not by an observed running -> stopped transition: a
   short job (a single decline) can start AND finish inside the same 1.5 s
   window, invisible to a transition. `finishedBatchId` changes exactly once per
   finished batch, which is what a screen needs to reload itself.

   STATE.character IS THE BATCH'S, not the URL's. One GPU, one batch for the
   whole platform (AUDIT §4.5): the character running may differ from the one
   being looked at, and any screen that compares them must read this field, not
   assume. */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

import { useApi } from '../api/useApi'
import type { Schema } from '../api/client'
import { errorOf } from '../api/client'
import { useFaults } from './FaultsContext'
import { usePolling } from './usePolling'

export type SystemState = Schema<'SystemStateResponse'>

type SystemStateContextValue = {
  state: SystemState | null
  /** Id of the last batch observed FINISHED. Changes once per batch. */
  finishedBatchId: string | null
  /** Force a tick now — after an action that changes the counters. */
  refresh: () => void
}

const Ctx = createContext<SystemStateContextValue | null>(null)

export const TICK_MS = 1500

export function SystemStateProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const { report } = useFaults()
  const [state, setState] = useState<SystemState | null>(null)
  const [finishedBatchId, setFinishedBatchId] = useState<string | null>(null)
  const lastBatch = useRef<string | null>(null)

  const tick = useCallback(async () => {
    let response: (SystemState & { ok?: boolean; erreur?: string }) | null = null
    try {
      response = await api.get<SystemState>('/api/state')
    } catch {
      return // network truly down: the previous banner already says it
    }
    /* /api/state can come back malformed (a 5xx with an HTML body becomes
       {ok:false} above). Without this guard `state.counts.X` throws on every
       tick, in the console only. */
    const failure =
      errorOf(response) ||
      (response.counts && typeof response.counts === 'object'
        ? null
        : 'réponse illisible du serveur')
    report('sonde', failure)
    if (failure) {
      setState(null)
      return
    }
    /* Last batch error: visible on every screen through the banner, not only in
       the Produire log. */
    report(
      'production',
      response.last_error
        ? `dernière production : ${response.last_error.msg} (${response.last_error.at})`
        : null,
    )
    setState(response)
    if (!response.running && response.batch_id && response.batch_id !== lastBatch.current) {
      lastBatch.current = response.batch_id
      setFinishedBatchId(response.batch_id)
    }
  }, [api, report])

  usePolling(tick, { intervalMs: TICK_MS })

  const value = useMemo(
    () => ({ state, finishedBatchId, refresh: () => void tick() }),
    [state, finishedBatchId, tick],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSystemState(): SystemStateContextValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useSystemState hors de SystemStateProvider')
  return value
}
