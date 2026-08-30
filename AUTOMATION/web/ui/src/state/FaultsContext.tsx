/* Aggregated faults, shown as a permanent banner at the top of the studio.

   WHY IT EXISTS (ported from `static/health.js`). `apiFetch` never throws: on a
   500 with an HTML body it yields {ok:false, erreur}. Loaders took that object
   for a scene bank or a taxonomy and the first property access threw —
   silently. Observed on 26/08/2026: a dashboard left open across a `scenes.json`
   migration serves old code against new data and answers 500. So a failed load
   does not leave an empty screen; it says what happened, and where.

   One entry per SOURCE (`sonde`, `production`, a loader…), so a recurring fault
   overwrites its own line instead of stacking duplicates. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Faults = Record<string, string>

type FaultsContextValue = {
  faults: Faults
  /** Report a fault, or clear it by passing null. */
  report: (source: string, detail: string | null) => void
}

const Ctx = createContext<FaultsContextValue | null>(null)

export function FaultsProvider({ children }: { children: ReactNode }) {
  const [faults, setFaults] = useState<Faults>({})

  const report = useCallback((source: string, detail: string | null) => {
    setFaults((current) => {
      if (!detail) {
        if (!(source in current)) return current
        const next = { ...current }
        delete next[source]
        return next
      }
      if (current[source] === detail) return current
      return { ...current, [source]: detail }
    })
  }, [])

  const value = useMemo(() => ({ faults, report }), [faults, report])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFaults(): FaultsContextValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useFaults hors de FaultsProvider')
  return value
}
