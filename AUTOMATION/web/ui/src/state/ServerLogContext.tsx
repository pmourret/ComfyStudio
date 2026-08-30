/* The server log of the Application screen — the lines it writes itself when a
   lifecycle action succeeds (ComfyUI stopped, memory unloaded, restart asked).

   WHY IT IS NOT SCREEN STATE. The legacy frontend kept every screen in the DOM
   and only toggled a class, so `#appliLog` survived navigating away and back.
   React unmounts. Holding these lines here keeps that behaviour: they last the
   session, exactly as before, and a page reload clears them, exactly as before.

   It is a trace of what YOU did, not a server stream — there is none. Newest
   first, because the last action is the one being checked. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ServerLogContextValue = {
  lines: string[]
  append: (message: string) => void
}

const Ctx = createContext<ServerLogContextValue | null>(null)

/* Enough to read back a session of lifecycle gestures, short enough that the
   list never becomes the thing that grows without bound. */
const MAX_LINES = 200

export function ServerLogProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<string[]>([])

  const append = useCallback((message: string) => {
    const stamp = new Date().toLocaleTimeString('fr-FR')
    setLines((current) => [`${stamp} · ${message}`, ...current].slice(0, MAX_LINES))
  }, [])

  const value = useMemo(() => ({ lines, append }), [lines, append])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useServerLog(): ServerLogContextValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useServerLog hors de ServerLogProvider')
  return value
}
