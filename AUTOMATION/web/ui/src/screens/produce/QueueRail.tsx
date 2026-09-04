/* The batch-finished acknowledgment — screen-3-produire design pass §S,
   trimmed further 2026-09-04 (user report: a persistent card kept
   reporting a batch long after it was done, sitting right above the
   prompt bar). What used to be a permanent 3-batch history of chips is now
   a single TOAST fired the instant a batch finishes — the studio's own way
   of ACKNOWLEDGING something just happened, never its way of reporting it
   forever (chrome/ToastContext.tsx's own contract). The header's status
   line already shows "production N/M · ~T" while a batch runs and survives
   scrolling (§S, same design pass); this component only had to cover the
   moment it STOPS running.

   What remains here is the technical log, collapsed by default — a quiet
   trail for anyone who wants it, never competing for attention the way a
   card of chips did. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useToast } from '../../chrome/ToastContext'
import type { SystemState } from '../../state/SystemStateContext'
import { PATHS, screenForImage } from '../../app/routes'

const VERDICT_LABEL: Record<string, string> = {
  OK: 'validées',
  A_REVOIR: 'à revoir',
  REJET: 'rejetées',
  SANS_VISAGE: 'sans visage',
  ERREUR: 'en erreur',
}

type Recent = { bucket: string; name: string; scene?: string; space?: string; score?: number }

export function QueueRail({ state }: { state: SystemState | null }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [logOpen, setLogOpen] = useState(false)
  const wasRunning = useRef(false)
  const lastAcked = useRef<string | null>(null)

  /* CAPTURED at the exact instant `running` flips false: `state.stats`/
     `state.recent` describe whichever batch is CURRENT on the server, so
     waiting to read them later — once a new batch has started — would
     already be reading the wrong one. */
  useEffect(() => {
    if (!state) return
    const justFinished = wasRunning.current && !state.running
    wasRunning.current = Boolean(state.running)
    if (!justFinished || !state.batch_id || state.batch_id === lastAcked.current) return
    lastAcked.current = state.batch_id

    const recent = (state.recent ?? []) as Recent[]
    const last = recent[recent.length - 1] ?? null
    const counted = Object.entries(state.stats ?? {})
      .filter(([, v]) => v)
      .map(([k, v]) => `${v} ${VERDICT_LABEL[k] ?? k.toLowerCase()}`)
      .join(' · ')
    const editing = Boolean(state.edition)
    toast(
      `lot terminé — ${counted || (state.total ? `${state.total} image${state.total > 1 ? 's' : ''}` : 'lot vide')}`,
      {
        label: editing ? 'ouvrir en NSFW' : 'trier les résultats',
        run: () => navigate(last ? screenForImage(last.bucket, last.name) : PATHS.review),
      },
    )
  }, [state, toast, navigate])

  if (!state) return null

  return (
    <div className="mb-[14px]" id="queueRail">
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
