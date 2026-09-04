/* The production queue band — screen-3-produire design pass §S. Replaces
   `RunPanel.tsx`'s "flow" mounting (a big report card at the top of the
   column, closed by hand and gone until the next batch) with a thin,
   PERMANENT strip just above the launch bar: the batch running now, and a
   short in-memory history of the last 3.

   IT IS A HISTORY, NEVER A REAL QUEUE. The pipeline stays mono-GPU
   (`state.running` is a single server-side boolean) — this band does not
   invent parallel jobs, it remembers what already ran, client-side, no new
   request. A history entry is CAPTURED at the exact instant its batch's
   `running` flips false: `state.stats`/`state.recent` describe whichever
   batch is CURRENT on the server, so waiting to read them later — once a
   new batch has started — would already be reading the wrong one. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { errorOf, type ActionLike } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useToast } from '../../chrome/ToastContext'
import type { SystemState } from '../../state/SystemStateContext'
import { PATHS, screenForImage } from '../../app/routes'
import { mmss } from '../../chrome/Header'

const VERDICT_LABEL: Record<string, string> = {
  OK: 'validées',
  A_REVOIR: 'à revoir',
  REJET: 'rejetées',
  SANS_VISAGE: 'sans visage',
  ERREUR: 'en erreur',
}

type Recent = { bucket: string; name: string; scene?: string; space?: string; score?: number }

/** One line of history, frozen at the moment its batch finished. */
type HistoryEntry = {
  batchId: string
  label: string
  last: Recent | null
  /* Whether that batch EDITED rather than generated — the "open in NSFW"
     link only makes sense there (RunPanel's own rule, kept). */
  editing: boolean
}

export function QueueRail({ state }: { state: SystemState | null }) {
  const api = useApi()
  const navigate = useNavigate()
  const toast = useToast()
  const [stopping, setStopping] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [logOpen, setLogOpen] = useState(false)
  const wasRunning = useRef(false)
  const lastCaptured = useRef<string | null>(null)

  useEffect(() => {
    if (!state) return
    const justFinished = wasRunning.current && !state.running
    wasRunning.current = Boolean(state.running)
    if (!justFinished || !state.batch_id || state.batch_id === lastCaptured.current) return
    lastCaptured.current = state.batch_id
    const recent = (state.recent ?? []) as Recent[]
    const counted = Object.entries(state.stats ?? {})
      .filter(([, v]) => v)
      .map(([k, v]) => `${v} ${VERDICT_LABEL[k] ?? k.toLowerCase()}`)
      .join(' · ')
    setHistory((current) =>
      [
        {
          batchId: state.batch_id as string,
          label: counted || (state.total ? `${state.total} image${state.total > 1 ? 's' : ''}` : 'lot vide'),
          last: recent[recent.length - 1] ?? null,
          editing: Boolean(state.edition),
        },
        ...current,
      ].slice(0, 3),
    )
  }, [state])

  if (!state) return null
  const running = Boolean(state.running)
  if (!running && history.length === 0) return null

  const stop = async () => {
    setStopping(true)
    const response = await api.post<ActionLike>('/api/stop')
    const failure = errorOf(response)
    if (failure) {
      setStopping(false)
      toast(failure || 'arrêt impossible')
    }
  }

  const goTo = (entry: HistoryEntry) => {
    if (entry.last) navigate(screenForImage(entry.last.bucket, entry.last.name))
    else navigate(PATHS.review)
  }

  const done = Math.max(0, state.index - (running ? 1 : 0))
  const percent = state.total ? Math.round((100 * done) / state.total) : 0

  return (
    <div className="mb-[14px] rounded-card border border-line bg-panel px-[14px] py-[10px]" id="queueRail">
      {running && (
        <div className="mb-[8px]">
          <div className="flex flex-wrap items-center gap-[10px] text-[12.5px]">
            <b>Production en cours</b>
            <span className="muted">
              image {state.index}/{state.total}
              {state.current ? ` · ${state.current}` : ''}
              {state.eta ? ` · reste ~${mmss(state.eta)}` : ''}
            </span>
            <div className="flex-1" />
            <button className="btn sm" id="btnStop" disabled={stopping} onClick={stop}>
              Arrêter
            </button>
          </div>
          <div className="mt-[6px] h-[4px] overflow-hidden rounded-[2px] bg-panel2">
            <div className="h-full bg-acc [transition:width_.5s]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="flex flex-wrap items-center gap-[8px]" id="queueHistory">
          <span className="text-[11px] uppercase tracking-[.5px] text-dim2">derniers lots</span>
          {history.map((entry, index) => (
            <button
              key={entry.batchId}
              type="button"
              /* `bg-transparent` on the base chain: a bare <button> with no
                 background class falls back to the browser's own light
                 button face — real bug, found on the header's shutdown
                 buttons (chrome/Header.tsx), same root cause here for the
                 index > 0 (unstyled) chips. */
              className={`rounded-[999px] border bg-transparent px-[9px] py-[3px] text-[11.5px] ${
                index === 0 ? 'border-line2 bg-panel2 text-txt' : 'border-line text-dim'
              }`}
              onClick={() => goTo(entry)}
              data-hint-text={
                index === 0
                  ? entry.editing
                    ? 'ouvrir cette image en NSFW'
                    : 'trier les résultats'
                  : 'revoir ce lot'
              }
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}

      <details
        className="adv mt-[6px]! [border:0]! p-0!"
        open={logOpen}
        onToggle={(e) => setLogOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>journal technique</summary>
        <pre
          className="mt-[10px] mb-0 max-h-[190px] overflow-auto whitespace-pre-wrap
                     rounded-[8px] border border-line bg-[#0e1014] p-[11px]
                     text-[12px] text-dim
                     empty:before:italic empty:before:text-dim2
                     empty:before:content-['aucune_action_enregistrée_dans_cette_session']"
        >{(state.log ?? []).slice(-40).join('\n')}</pre>
      </details>
    </div>
  )
}
