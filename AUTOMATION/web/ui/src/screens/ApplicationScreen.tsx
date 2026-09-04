/* Application — settings of the APP itself, not of a generation.

   Distinct from the gear panel of Produire, which tunes a run; this screen
   drives the two PROCESSES that make a run possible, and holds the one gesture
   that arms adult content.

   CONSEQUENTIAL ACTIONS, SO: confirmation every time, and the confirmation says
   what actually happens. For ComfyUI a stop is NEVER clean under Windows (no
   graceful shutdown signal, TerminateProcess cuts mid-job) — said before acting,
   not after. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { errorOf, type Schema } from '../api/client'
import { useApi } from '../api/useApi'
import { useCharacter } from '../character/CharacterContext'
import { useConfirm } from '../chrome/ConfirmContext'
import { Takeover } from '../chrome/Takeover'
import { useToast } from '../chrome/ToastContext'
import { useProcessControls } from '../chrome/useProcessControls'
import { useComfyStats } from '../state/ComfyStatsContext'
import { useServerLog } from '../state/ServerLogContext'
import { useSystemState } from '../state/SystemStateContext'
import { usePolling } from '../state/usePolling'
import { PATHS } from '../app/routes'
import { AdultContentSection } from './AdultContentSection'
import { AppearanceSection } from './AppearanceSection'
import { ComfyGauges } from './ComfyGauges'

type ActionResponse = Schema<'ActionResponse'>

/* On THIS screen the probes are read at their own, faster pace, on top of the
   module's 5 s: it is the screen where one watches the numbers move, and it is
   the only place that justifies it. The route caches for 1.5 s server-side, so
   this does not double the nvidia-smi spawns. */
const SCREEN_PROBE_MS = 2000

export function ApplicationScreen() {
  const api = useApi()
  const confirm = useConfirm()
  const toast = useToast()
  const { state } = useSystemState()
  const { stats, refresh: refreshProbes } = useComfyStats()
  const { lines, append } = useServerLog()
  const { sheet } = useCharacter()
  const [takeover, setTakeover] = useState<React.ReactNode>(null)
  /* Stop THIS dashboard / stop ComfyUI: shared with the header's own
     quick-access buttons, same confirmation, same consequence — see
     chrome/useProcessControls.tsx. Restart and unload stay local: only
     this screen offers them. */
  const { stopApp, stopComfy, takeover: stopTakeover } = useProcessControls()

  usePolling(refreshProbes, { intervalMs: SCREEN_PROBE_MS, pauseWhenHidden: true })

  const online = Boolean(state?.comfy)
  const running = Boolean(state?.running)

  /* Unloading only makes sense if ComfyUI answers, and never under a production.
     The state comes from the shared probe and the shared tick — one source for
     what is displayed AND for what the button allows, so the two can never be a
     poll out of step with each other. */
  const canUnload = Boolean(stats?.en_ligne) && !running
  const unloadReason = running
    ? 'une production est en cours'
    : stats?.en_ligne
      ? ''
      : 'ComfyUI ne répond pas'

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

  /* Unloading does not stop ComfyUI: it gives back the VRAM the models hold, and
     they reload by themselves on the next generation. Say it, otherwise
     « décharger » reads as « arrêter » — the two neighbouring buttons stop. */
  const onUnload = async () => {
    const ok = await confirm({
      title: 'Décharger la mémoire ?',
      button: 'Décharger',
      body: (
        <>
          <p>
            Libère la VRAM que les modèles chargés retiennent. ComfyUI{' '}
            <b>reste en ligne</b> : les modèles se rechargent d'eux-mêmes à la
            prochaine génération, qui sera donc un peu plus longue.
          </p>
          <p className="tiny">Rien n'est perdu — ni file d'attente, ni image.</p>
        </>
      ),
    })
    if (!ok) return
    if (!(await post('/api/app/comfy/unload'))) return
    append('mémoire ComfyUI déchargée')
    toast('mémoire déchargée')
    refreshProbes()
  }

  const onAppRestart = async () => {
    const ok = await confirm({
      title: 'Redémarrer le tableau de bord ?',
      button: 'Redémarrer',
      body: (
        <p>
          Relance le serveur web local avec le code et la configuration à jour.
          Cette page se recharge d'elle-même une fois qu'il répond de nouveau —
          quelques secondes.
        </p>
      ),
    })
    if (!ok) return
    if (!(await post('/api/app/restart'))) return
    setTakeover('Redémarrage du tableau de bord…')
  }

  const onComfyRestart = async () => {
    const ok = await confirm({
      title: 'Redémarrer ComfyUI ?',
      button: 'Redémarrer ComfyUI',
      body: (
        <p>
          {running && (
            <b>
              Une génération est en cours sur ce tableau de bord — elle sera
              perdue.{' '}
            </b>
          )}
          Arrêt net puis relance dans une nouvelle fenêtre console. Compte 30 s à
          2 min : le premier chargement des custom nodes est le plus long.
        </p>
      ),
    })
    if (!ok) return
    if (!(await post('/api/app/comfy/restart'))) return
    append("redémarrage de ComfyUI demandé — une nouvelle fenêtre va s'ouvrir")
    toast('redémarrage de ComfyUI lancé (~30 s à 2 min)')
  }

  /* Waiting for the restarted server: poll until it answers, then reload — the
     new process serves new code, so a re-render would not be enough. */
  const waitingForRestart = takeover === 'Redémarrage du tableau de bord…'
  useEffect(() => {
    if (!waitingForRestart) return
    const timer = window.setInterval(() => {
      fetch('/api/state')
        .then(() => {
          window.clearInterval(timer)
          location.reload()
        })
        .catch(() => {})
    }, 700)
    return () => window.clearInterval(timer)
  }, [waitingForRestart])

  if (takeover || stopTakeover) return <Takeover>{takeover || stopTakeover}</Takeover>

  return (
    <div className="screen" id="appli">
      <div className="wrap">
        <h2>Application</h2>
        <p className="tiny mt-[6px] mb-[22px]">
          Serveur local et ComfyUI. Les réglages d'une génération sont
          l'engrenage, sur Produire.
        </p>

        {/* The screen title having taken « Application », the two buttons below
            need their own level: they stop the WEB SERVER, not ComfyUI, which
            has its own pair right after. Without it « Arrêter » would read as
            « stop the application » — the opposite of what it does. */}
        <h2>Serveur web local</h2>
        <p className="tiny mt-[6px] mb-[16px]">
          Celui que tu utilises en ce moment.
        </p>
        <div className="mt-[14px] mb-[6px] flex gap-[12px]">
          <button className="btn" id="btnAppRestart" onClick={onAppRestart}>
            Redémarrer
          </button>
          <button className="btn danger" id="btnAppStop" onClick={stopApp}>
            Arrêter
          </button>
        </div>

        <h2 className="mt-[34px]">
          ComfyUI{' '}
          <span className="tiny" id="comfyEtat">
            {state === null ? '' : online ? '— en ligne' : '— hors ligne'}
          </span>
        </h2>
        <p className="tiny mt-[6px] mb-[16px]">
          Le moteur de génération (GPU). <b>Windows ne permet pas un arrêt
          propre</b> : le processus est coupé net, sans le temps de finir un job
          en cours. Utile pour libérer la VRAM ou reprendre en compte un custom
          node mis à jour.
        </p>
        <ComfyGauges stats={stats} />
        <div className="mt-[14px] mb-[6px] flex gap-[12px]">
          <button
            className="btn"
            id="btnComfyUnload"
            disabled={!canUnload}
            title={unloadReason}
            onClick={onUnload}
          >
            Décharger la mémoire
          </button>
          <button className="btn" id="btnComfyRestart" onClick={onComfyRestart}>
            Redémarrer
          </button>
          <button className="btn danger" id="btnComfyStop" onClick={stopComfy}>
            Arrêter
          </button>
        </div>

        {/* ADULT CONTENT (J7). The ONLY place the decision is taken, and for
            THIS character. No global switch — no application setting is worth
            the same for every character at once — and no gesture inside the
            production flow: Produire carries the decision out, it does not
            take it. */}
        <h2 className="mt-[34px]">
          Contenu adulte{' '}
          <span className="tiny" id="nsfwQui">
            {sheet?.name ? `— ${sheet.name}` : ''}
          </span>
        </h2>
        <AdultContentSection />

        {/* APPEARANCE (Phase 0b). Same rank as Contenu adulte just above: a
            platform capability that writes character-level data, agnostic of
            the pack (CLAUDE.md §7). */}
        <h2 className="mt-[34px]">
          Apparence{' '}
          <span className="tiny" id="appearanceQui">
            {sheet?.name ? `— ${sheet.name}` : ''}
          </span>
        </h2>
        <AppearanceSection />

        <h2 className="mt-[34px]">Journal des productions</h2>
        <p className="tiny mt-[6px] mb-[10px]">
          L'historique des batchs — date, scène, format, score, verdict, durée.{' '}
          <Link className="link" to={PATHS.journal}>
            Ouvrir le journal des productions
          </Link>
        </p>

        <h2 className="mt-[34px]">Journal du serveur</h2>
        <pre
          className="mt-[10px] mb-0 block max-h-[220px] overflow-auto whitespace-pre-wrap
                     rounded-[8px] border border-line bg-[#0e1014] p-[11px]
                     text-[12px] text-dim
                     empty:before:italic empty:before:text-dim2
                     empty:before:content-['aucune_action_enregistrée_dans_cette_session']"
          id="appliLog"
        >
          {lines.join('\n')}
        </pre>
      </div>
    </div>
  )
}
