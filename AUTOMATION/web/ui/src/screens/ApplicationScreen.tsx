/* Application — settings of the APP itself, not of a generation.

   Distinct from the gear panel of Produire, which tunes a run; this screen
   drives the two PROCESSES that make a run possible, and holds the one gesture
   that arms adult content.

   CONSEQUENTIAL ACTIONS, SO: confirmation every time, and the confirmation says
   what actually happens. For ComfyUI a stop is NEVER clean under Windows (no
   graceful shutdown signal, TerminateProcess cuts mid-job) — said before acting,
   not after. */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

import { errorOf, type Schema } from '../api/client'
import { useApi } from '../api/useApi'
import { useCharacter } from '../character/CharacterContext'
import { useConfirm } from '../chrome/ConfirmContext'
import { useToast } from '../chrome/ToastContext'
import { useComfyStats } from '../state/ComfyStatsContext'
import { useServerLog } from '../state/ServerLogContext'
import { useSystemState } from '../state/SystemStateContext'
import { usePolling } from '../state/usePolling'
import { PATHS } from '../app/routes'
import { AdultContentSection } from './AdultContentSection'
import { ComfyGauges } from './ComfyGauges'
import './application.css'

type ActionResponse = Schema<'ActionResponse'>

/* On THIS screen the probes are read at their own, faster pace, on top of the
   module's 5 s: it is the screen where one watches the numbers move, and it is
   the only place that justifies it. The route caches for 1.5 s server-side, so
   this does not double the nvidia-smi spawns. */
const SCREEN_PROBE_MS = 2000

/* Full-screen takeover. The whole dashboard is about to become unreachable, so
   there is no point keeping tiles and buttons on screen — they would answer
   nothing. */
function Takeover({ children }: { children: React.ReactNode }) {
  /* Portalled to <body> and fixed over everything: the chrome must go too. The
     navbar would otherwise keep offering destinations that answer nothing. The
     legacy screen replaced `document.body.innerHTML` for the same reason; a
     portal does it without destroying the React tree that has to poll for the
     server coming back. */
  return createPortal(
    <div className="takeover" role="status">
      <div>{children}</div>
    </div>,
    document.body,
  )
}

export function ApplicationScreen() {
  const api = useApi()
  const confirm = useConfirm()
  const toast = useToast()
  const { state } = useSystemState()
  const { stats, refresh: refreshProbes } = useComfyStats()
  const { lines, append } = useServerLog()
  const { sheet } = useCharacter()
  const [takeover, setTakeover] = useState<React.ReactNode>(null)

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

  const onAppStop = async () => {
    const ok = await confirm({
      title: 'Arrêter le tableau de bord ?',
      button: 'Arrêter',
      danger: true,
      body: (
        <p>
          Coupe le serveur web local. Cette page ne répondra plus tant qu'il n'est
          pas relancé à la main (<code>AUTOMATION/run_web.bat</code>). Une
          génération en cours serait interrompue.
        </p>
      ),
    })
    if (!ok) return
    await api.post('/api/app/stop')
    setTakeover(
      <>
        Tableau de bord arrêté.
        <br />
        <span style={{ fontSize: 13 }}>
          Relance <code>run_web.bat</code> pour y revenir.
        </span>
      </>,
    )
  }

  const onComfyStop = async () => {
    const ok = await confirm({
      title: 'Arrêter ComfyUI ?',
      button: 'Arrêter ComfyUI',
      danger: true,
      body: (
        <p>
          {running && (
            <b>
              Une génération est en cours sur ce tableau de bord — elle sera
              perdue.{' '}
            </b>
          )}
          Windows ne permet pas un arrêt propre : le processus est coupé net, sans
          le temps de finir un job.
        </p>
      ),
    })
    if (!ok) return
    if (!(await post('/api/app/comfy/stop'))) return
    append('ComfyUI arrêté')
    toast('ComfyUI arrêté')
    refreshProbes()
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

  if (takeover) return <Takeover>{takeover}</Takeover>

  return (
    <div className="screen" id="appli">
      <div className="wrap">
        <h2>Application</h2>
        <p className="tiny" style={{ margin: '6px 0 22px' }}>
          Serveur local et ComfyUI. Les réglages d'une génération sont
          l'engrenage, sur Produire.
        </p>

        {/* The screen title having taken « Application », the two buttons below
            need their own level: they stop the WEB SERVER, not ComfyUI, which
            has its own pair right after. Without it « Arrêter » would read as
            « stop the application » — the opposite of what it does. */}
        <h2>Serveur web local</h2>
        <p className="tiny" style={{ margin: '6px 0 16px' }}>
          Celui que tu utilises en ce moment.
        </p>
        <div className="appliActs">
          <button className="btn" id="btnAppRestart" onClick={onAppRestart}>
            Redémarrer
          </button>
          <button className="btn danger" id="btnAppStop" onClick={onAppStop}>
            Arrêter
          </button>
        </div>

        <h2 style={{ marginTop: 34 }}>
          ComfyUI{' '}
          <span className="tiny" id="comfyEtat">
            {state === null ? '' : online ? '— en ligne' : '— hors ligne'}
          </span>
        </h2>
        <p className="tiny" style={{ margin: '6px 0 16px' }}>
          Le moteur de génération (GPU). <b>Windows ne permet pas un arrêt
          propre</b> : le processus est coupé net, sans le temps de finir un job
          en cours. Utile pour libérer la VRAM ou reprendre en compte un custom
          node mis à jour.
        </p>
        <ComfyGauges stats={stats} />
        <div className="appliActs">
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
          <button className="btn danger" id="btnComfyStop" onClick={onComfyStop}>
            Arrêter
          </button>
        </div>

        {/* ADULT CONTENT (J7). The ONLY place the decision is taken, and for
            THIS character. No global switch — no application setting is worth
            the same for every character at once — and no gesture inside the
            production flow: Produire carries the decision out, it does not
            take it. */}
        <h2 style={{ marginTop: 34 }}>
          Contenu adulte{' '}
          <span className="tiny" id="nsfwQui">
            {sheet?.name ? `— ${sheet.name}` : ''}
          </span>
        </h2>
        <AdultContentSection />

        <h2 style={{ marginTop: 34 }}>Journal des productions</h2>
        <p className="tiny" style={{ margin: '6px 0 10px' }}>
          L'historique des batchs — date, scène, format, score, verdict, durée.{' '}
          <Link className="link" to={PATHS.journal}>
            Ouvrir le journal des productions
          </Link>
        </p>

        <h2 style={{ marginTop: 34 }}>Journal du serveur</h2>
        <pre className="log" id="appliLog" style={{ display: 'block', maxHeight: 220 }}>
          {lines.join('\n')}
        </pre>
      </div>
    </div>
  )
}
