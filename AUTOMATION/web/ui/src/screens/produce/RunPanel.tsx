/* The execution panel. Ported from `renderRun` in `static/create.js`.

   The card of a FINISHED batch is a report: what ran, what it gave, and the
   technical log underneath. It used to stay until the next batch with no way to
   close it once read — on a working screen it took the top of Produire to teach
   nothing more.

   It is closed BY HAND, and the dismissal is remembered PER BATCH: the next
   batch brings the card back. Closing is not « never show again », it is « that
   one, I have read it ». A RUNNING batch has NO cross: it already carries its
   stop button, and a production card one can make disappear while it runs would
   hide the only place that says where it is. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { errorOf, type ActionLike } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useLightbox } from '../../chrome/LightboxContext'
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

/** One entry of STATE.recent. */
type Recent = { bucket: string; name: string; scene?: string; space?: string; score?: number }

export function RunPanel({ state }: { state: SystemState | null }) {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const { open: openLightbox } = useLightbox()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const running = Boolean(state?.running)

  // a new batch brings the card back, whatever was dismissed before
  const lastBatch = useRef<string | null>(null)
  useEffect(() => {
    if (state?.batch_id && state.batch_id !== lastBatch.current) {
      lastBatch.current = state.batch_id
      setStopping(false)
    }
  }, [state?.batch_id])

  if (!state) return null
  if (!state.running && !state.total) return null
  // finished batch, already read: we do not come back to it until another ran
  if (!state.running && state.batch_id && state.batch_id === dismissed) return null

  const recent = (state.recent ?? []) as Recent[]
  // during generation the image in progress is not acquired yet
  const done = Math.max(0, state.index - (state.running ? 1 : 0))
  const percent = state.total ? Math.round((100 * done) / state.total) : 0

  /* End of an EDITING batch: the next gesture of the NSFW flow is the retouch,
     and it lives in the photo editor, reachable from the Revue (ADR-0003: the
     NSFW recomposes two global tools, it adds none). We NAME the path rather
     than open a route that would jump over the Revue. */
  const finishedEditing = !state.running && Boolean(state.edition) && Boolean(state.total)
  /* The last output of the batch, to NAME the destination of the link: an
     editing batch files its images by verdict (OK or A_REVOIR), so sometimes in
     the Galerie and sometimes in the Revue. We READ the bucket rather than
     assume it — assuming OK sent one to a folder where the image was not. */
  const last = recent[recent.length - 1] ?? null
  const where = last && last.bucket === 'OK' ? 'Galerie' : 'Revue'

  const stop = async () => {
    setStopping(true)
    const response = await api.post<ActionLike>('/api/stop')
    const failure = errorOf(response)
    if (failure) {
      setStopping(false)
      toast(failure || 'arrêt impossible')
    }
  }

  return (
    <div id="runPanel">
      <div className="run">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <b>{running ? 'Production en cours' : 'Batch terminé'}</b>
          <span className="muted">
            {running
              ? `image ${state.index}/${state.total}` +
                (state.current ? ` · ${state.current}` : '') +
                (state.eta ? ` · reste ~${mmss(state.eta)}` : '')
              : Object.entries(state.stats ?? {})
                  .filter(([, v]) => v)
                  .map(([k, v]) => `${v} ${VERDICT_LABEL[k] ?? k.toLowerCase()}`)
                  .join(' · ')}
          </span>
          <div className="spacer" style={{ flex: 1 }} />
          {running ? (
            <button className="btn sm" id="btnStop" disabled={stopping} onClick={stop}>
              Arrêter
            </button>
          ) : (
            <button className="btn sm" id="btnGoTri" onClick={() => navigate(PATHS.review)}>
              Trier les résultats
            </button>
          )}
          {!running && (
            <button
              className="run-x"
              id="btnRunFermer"
              aria-label="Fermer le compte rendu"
              onClick={() => setDismissed(state.batch_id ?? null)}
            >
              ✕
            </button>
          )}
        </div>

        <div className="bar">
          <div style={{ width: `${percent}%` }} />
        </div>

        <div className="strip">
          {/* `space`: on the editing tier the strip also shows the NSFW output,
              which lives in PROD/<CID>/_NSFW. Without it /img looks on the SFW
              side and answers 404. `imageUrl` carries it from the item. */}
          {recent
            .slice()
            .reverse()
            .map((entry) => (
              <img
                key={entry.name}
                className={entry.bucket}
                src={api.image({ ...entry, thumb: true })}
                alt=""
                title={`${entry.scene ?? ''}${entry.score ? ` · ${entry.score.toFixed(3)}` : ''}`}
                onClick={() => openLightbox(api.image(entry))}
              />
            ))}
        </div>

        {finishedEditing && (
          <p className="tiny" style={{ margin: '8px 0 0' }}>
            Retouche : <b>{where}, espace NSFW</b> → l'image → <b>Éditer</b>.{' '}
            {/* The ONE gesture of the application that enters the NSFW space by
                navigation: it KNOWS which space the batch came out of (J7 —
                never a chrome tab). It also NAMES the file, to open on the image
                just produced rather than on a folder to find it back in. */}
            <button
              className="link"
              id="btnGoNsfw"
              onClick={() =>
                navigate(
                  last
                    ? screenForImage(last.bucket, last.name)
                    : where === 'Galerie'
                      ? PATHS.gallery
                      : PATHS.review,
                )
              }
            >
              ouvrir {last ? 'cette image' : `la ${where}`} en NSFW
            </button>
          </p>
        )}

        <details
          className="adv"
          style={{ marginTop: 6, border: 0, padding: 0 }}
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
    </div>
  )
}
