/* Values read from config.json, ONE source. Ported from `static/config.js`.

   NO THRESHOLD IS EVER WRITTEN IN THE FRONTEND (CLAUDE.md §8.4): the disk sort
   and the screen must speak of the same threshold. The score reading bands and
   the reference values of the generation settings come from here, never from a
   constant in a component.

   The response is typed as an open record on purpose — `/api/config` has NO
   response model, and its docstring says why: a model there would be a second,
   silently diverging copy of that file's shape. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useApi } from '../api/useApi'
import { useCharacter } from '../character/CharacterContext'

/** Score reading bands. The defaults only ever serve the instant before
    /api/config answers — they are the same ones the legacy module carried. */
export type QcBands = { ok: number; watch: number; high: number }

const DEFAULT_QC: QcBands = { ok: 0.72, watch: 0.6, high: 0.75 }

type CharacterConfig = Record<string, unknown>

type ConfigContextValue = {
  qc: QcBands
  /** The whole file, for whoever reads a key this layer must not get to choose. */
  config: CharacterConfig | null
}

const Ctx = createContext<ConfigContextValue | null>(null)

export function ConfigProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const { claimed } = useCharacter()
  const [config, setConfig] = useState<CharacterConfig | null>(null)
  const [qc, setQc] = useState<QcBands>(DEFAULT_QC)

  const load = useCallback(async () => {
    try {
      const response = await api.get<CharacterConfig>('/api/config')
      setConfig(response)
      const bands = response.qc as Record<string, number> | undefined
      if (bands) {
        const ok = Number(bands.threshold_ok)
        setQc({
          ok,
          watch: Number(bands.threshold_watch),
          high: Number(bands.threshold_high ?? ok + 0.03),
        })
      }
    } catch {
      /* keep the defaults — a comfort reading must not break the screen */
    }
  }, [api])

  // the settings belong to a character: switching reloads them
  useEffect(() => {
    void load()
  }, [load, claimed])

  const value = useMemo(() => ({ qc, config }), [qc, config])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useConfig(): ConfigContextValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useConfig hors de ConfigProvider')
  return value
}
