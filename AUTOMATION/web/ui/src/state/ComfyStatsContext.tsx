/* Memory and thermal probes — ONE source, several surfaces.

   Ported from `static/sondes.js`. The banner (compact) and the Application
   screen (detailed) read the SAME result: two fetches for the same data would
   double the subprocess spawns and could show two truths. That is why this is a
   context and not a hook each surface calls for itself.

   Own cadence, 5 s, never the studio's 1.5 s tick — see usePolling for the
   incident that rule comes from — and paused on a hidden tab. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { useApi } from '../api/useApi'
import type { Schema } from '../api/client'
import { usePolling } from './usePolling'

export type ComfyStats = Schema<'ComfyStatsResponse'>

type ComfyStatsContextValue = {
  stats: ComfyStats | null
  refresh: () => void
}

const Ctx = createContext<ComfyStatsContextValue | null>(null)

export const PROBE_MS = 5000

export function ComfyStatsProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const [stats, setStats] = useState<ComfyStats | null>(null)

  const probe = useCallback(async () => {
    try {
      const response = await api.get<ComfyStats>('/api/app/comfy/stats')
      setStats(response)
    } catch {
      /* Deliberately silent: the probes are a comfort reading of the MACHINE,
         and ComfyUI being unreachable is already said by the dot next to them.
         A second banner for the same fact would be noise. */
    }
  }, [api])

  usePolling(probe, { intervalMs: PROBE_MS, pauseWhenHidden: true })

  const value = useMemo(() => ({ stats, refresh: () => void probe() }), [stats, probe])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useComfyStats(): ComfyStatsContextValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useComfyStats hors de ComfyStatsProvider')
  return value
}
