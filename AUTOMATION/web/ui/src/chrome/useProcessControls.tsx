/* Two destructive process actions — stop THIS dashboard, stop ComfyUI —
   shared by the Application screen (`ApplicationScreen.tsx`) and the
   header's quick-access shutdown buttons (`Header.tsx`). Same verb, same
   confirmation, same consequence, wherever the click comes from.

   CONSEQUENTIAL ACTIONS, SO: confirmation every time, and the confirmation
   says what actually happens. For ComfyUI a stop is NEVER clean under
   Windows (no graceful shutdown signal, TerminateProcess cuts mid-job) —
   said before acting, not after. Ported verbatim from the Application
   screen's own `onAppStop`/`onComfyStop`, which now call this instead of
   carrying the logic themselves. */
import { useCallback, useState, type ReactNode } from 'react'

import { errorOf, type Schema } from '../api/client'
import { useApi } from '../api/useApi'
import { useComfyStats } from '../state/ComfyStatsContext'
import { useServerLog } from '../state/ServerLogContext'
import { useSystemState } from '../state/SystemStateContext'
import { useConfirm } from './ConfirmContext'
import { useToast } from './ToastContext'

type ActionResponse = Schema<'ActionResponse'>

export function useProcessControls() {
  const api = useApi()
  const confirm = useConfirm()
  const toast = useToast()
  const { append } = useServerLog()
  const { refresh: refreshProbes } = useComfyStats()
  const { state } = useSystemState()
  const running = Boolean(state?.running)
  /** Set only by `stopApp` — a stopped dashboard replaces the whole screen
      with this message, wherever the button that triggered it lives
      (`Takeover` portals to `document.body`, so it covers everything
      regardless of the caller). */
  const [takeover, setTakeover] = useState<ReactNode>(null)

  const post = useCallback(
    async (url: string): Promise<boolean> => {
      const response = await api.post<ActionResponse>(url)
      const failure = errorOf(response)
      if (failure) {
        toast(failure)
        return false
      }
      return true
    },
    [api, toast],
  )

  const stopApp = useCallback(async () => {
    const ok = await confirm({
      title: 'Arrêter le tableau de bord ?',
      button: 'Arrêter',
      body: (
        <p>
          Coupe le serveur web local. Cette page ne répondra plus tant qu'il
          n'est pas relancé à la main (<code>AUTOMATION/run_web.bat</code>).
          Une génération en cours serait interrompue.
        </p>
      ),
    })
    if (!ok) return
    // fire-and-forget: the server answers before exiting (web/api/routers/
    // app.py), but there is nothing useful to do with a failed response here
    // — the takeover is the same message either way.
    await api.post('/api/app/stop')
    setTakeover(
      <>
        Tableau de bord arrêté.
        <br />
        <span className="text-[13px]">
          Relance <code>run_web.bat</code> pour y revenir.
        </span>
      </>,
    )
  }, [api, confirm])

  const stopComfy = useCallback(async () => {
    const ok = await confirm({
      title: 'Arrêter ComfyUI ?',
      button: 'Arrêter ComfyUI',
      body: (
        <p>
          {running && (
            <b>
              Une génération est en cours sur ce tableau de bord — elle sera
              perdue.{' '}
            </b>
          )}
          Windows ne permet pas un arrêt propre : le processus est coupé net,
          sans le temps de finir un job.
        </p>
      ),
    })
    if (!ok) return
    if (!(await post('/api/app/comfy/stop'))) return
    append('ComfyUI arrêté')
    toast('ComfyUI arrêté')
    refreshProbes()
  }, [confirm, post, append, toast, refreshProbes, running])

  return { stopApp, stopComfy, takeover }
}
