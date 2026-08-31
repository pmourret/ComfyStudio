/* Revue AND Galerie — sorting, sub-scores, judgement, decline.
   Ported from `static/review.js`.

   TWO TRADES, TWO ROUTES (migration brief, point 2). The legacy screen carried
   both in `#trier[data-metier]`, an attribute written from the route. They are
   `/review` and `/gallery` now — but they remain ONE component with one loader
   and one grid: duplicating them would leave two grids to maintain and two
   loaders to fall out of sync. What the trade changes is what is OFFERED, and
   that is decided here rather than by three CSS rules.

   AN IMAGE CAN BE AIMED AT BY NAME (F1.3): `/review/:name` and `/gallery/:name`.
   A name absent from this folder — sorted elsewhere, deleted, or belonging to
   another character — is SAID on screen; it never shows another image instead.

   COUPLING TRAP §5.6-1 — the `v` token. Every image URL goes through
   `api.image()`, which appends `v` (the mtime) verbatim. Without it the browser
   keeps serving the image from before an overwrite by the editor. It is
   consumed, never interpreted.

   COUPLING TRAP §5.6-4 — /api/mesurer in batches. The client must keep calling
   while `restant > 0`. That contract is unchanged; see `measure()` below. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { errorOf, type ActionLike } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useConfirm } from '../../chrome/ConfirmContext'
import { useLightbox } from '../../chrome/LightboxContext'
import { useToast } from '../../chrome/ToastContext'
import { useConfig } from '../../state/ConfigContext'
import { useSystemState } from '../../state/SystemStateContext'
import { PATHS } from '../../app/routes'
import { DeclineDialog } from './DeclineDialog'
import { PhotoEditor } from './PhotoEditor'
import { ScoreBars, calibration } from './ScoreBars'
import {
  scoreBand,
  scoreClass,
  useTriage,
  type GalleryItem,
  type ScoreFilter,
  type Space,
  type Trade,
} from './useTriage'
import './review.css'

const SORT_TARGET: Record<string, string> = {
  valider: 'OK',
  revoir: 'A_REVOIR',
  rejeter: 'REJET',
  archiver: 'ARCHIVE',
}
const SORT_LABEL: Record<string, string> = {
  valider: 'validée',
  revoir: 'à revoir',
  rejeter: 'rejetée',
  archiver: 'archivée',
}

const EMPTY_DONE: Record<string, string> = {
  A_REVOIR: 'Tout est trié.',
  OK: "Aucune image validée pour l'instant.",
  REJET: 'Aucun rejet.',
  ARCHIVE: 'Aucune image archivée.',
  SANS_VISAGE: 'Aucune image sans visage détecté.',
}

const SCORE_FILTERS: { key: ScoreFilter; label: string }[] = [
  { key: 'tout', label: 'Tout' },
  { key: 'haut', label: 'Excellentes' },
  { key: 'moyen', label: 'Correctes' },
  { key: 'bas', label: 'Sous la bande' },
]

/* Bucket selector of the Revue trade. `OK` is NOT offered here: the kept images
   have their destination, the Galerie. */
const REVIEW_BUCKETS = [
  { key: 'A_REVOIR', label: 'À revoir' },
  { key: 'REJET', label: 'Rejetées' },
  // SANS_VISAGE is a real QC verdict (no face detected): the runner filled that
  // folder while nothing led to it, so its images became unfindable
  { key: 'SANS_VISAGE', label: 'Sans visage' },
  { key: 'ARCHIVE', label: 'Archivées' },
]

export function ReviewScreen({ trade }: { trade: Trade }) {
  const api = useApi()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { name: focusName } = useParams()
  const { qc } = useConfig()
  const { state, refresh: refreshCounts } = useSystemState()
  const { src: lightboxSrc, open: openLightbox } = useLightbox()

  /* Galerie always reads the kept ones; Revue opens on the queue to judge and
     lets one walk the other folders. */
  const [bucket, setBucket] = useState(trade === 'galerie' ? 'OK' : 'A_REVOIR')
  /* Always SFW on entry. Only a gesture that NAMES the NSFW space enters it, and
     a chrome tab is not one (J7). The end-of-batch link from Produire is that
     gesture; when Produire is migrated it must carry the space explicitly. */
  const [space, setSpace] = useState<Space>('sfw')
  const [filter, setFilter] = useState<ScoreFilter>('tout')
  const [measuring, setMeasuring] = useState(false)
  const [measureLeft, setMeasureLeft] = useState<number | null>(null)
  const [declineFor, setDeclineFor] = useState<GalleryItem | null>(null)
  const [editFor, setEditFor] = useState<GalleryItem | null>(null)

  useEffect(() => {
    setBucket(trade === 'galerie' ? 'OK' : 'A_REVOIR')
    setSpace('sfw')
    setFilter('tout')
  }, [trade])

  const triage = useTriage({ bucket, space, trade, focusName: focusName ?? null })
  const { items, setItems, bands, references, unmeasured, notFound, setNotFound } = triage
  const { cursor, setCursor, view, setView, reload } = triage

  /* VITEMS = what is actually shown. `items` stays the folder's list. */
  const shown = useMemo(
    () => (filter === 'tout' ? items : items.filter((i) => scoreBand(i.score, qc) === filter)),
    [items, filter, qc],
  )
  const counts = useMemo(() => {
    const out: Record<string, number> = { tout: items.length, haut: 0, moyen: 0, bas: 0 }
    items.forEach((i) => {
      out[scoreBand(i.score, qc)] += 1
    })
    return out
  }, [items, qc])

  // the cursor is re-bounded whenever the visible list shrinks under it
  const safeCursor = Math.min(cursor, Math.max(0, shown.length - 1))
  const current = shown[safeCursor]

  const step = useCallback(
    (delta: number) => {
      if (!shown.length) return
      setCursor((c) => (Math.min(c, shown.length - 1) + delta + shown.length) % shown.length)
    },
    [shown.length, setCursor],
  )

  /* The realism judgement moves nothing: it is independent of sorting. */
  const setFlag = useCallback(
    async (item: GalleryItem, flag: string) => {
      const next = item.flag === flag ? null : flag // clicking again removes it
      const response = await api.post<ActionLike>('/api/flag', { name: item.name, flag: next })
      const failure = errorOf(response)
      if (failure) {
        toast(failure || 'jugement impossible')
        return
      }
      setItems((list) => list.map((i) => (i.name === item.name ? { ...i, flag: next } : i)))
    },
    [api, toast, setItems],
  )

  const act = useCallback(
    async (action: string, index?: number) => {
      if (!shown.length) return
      const at = index ?? safeCursor
      const item = shown[at]
      if (!item) return
      if (action === 'decliner') {
        /* /api/decline only knows the SFW journal; the button is already hidden
           in NSFW, this guard covers the D shortcut. */
        if (item.space === 'nsfw') {
          toast("déclinaison indisponible ici — passe par l'espace NSFW")
          return
        }
        setDeclineFor(item)
        return
      }
      if (action === 'skip') {
        step(1)
        return
      }
      if (index != null) setCursor(index)
      // already in this folder: we move on rather than write a no-op
      if (SORT_TARGET[action] === bucket) {
        step(1)
        return
      }
      const response = await api.post<ActionLike>('/api/action', {
        name: item.name,
        bucket: item.bucket,
        space: item.space,
        action,
      })
      const failure = errorOf(response)
      if (failure) {
        toast(failure || 'action impossible')
        return
      }
      setItems((list) => list.filter((i) => i.name !== item.name))
      refreshCounts()
      toast(`${item.scene || item.name} → ${SORT_LABEL[action]}`, {
        label: 'annuler',
        run: () => void undo(),
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, bucket, shown, safeCursor, step, toast, setItems, setCursor, refreshCounts],
  )

  const undo = useCallback(async () => {
    const response = await api.post<ActionLike>('/api/undo')
    const failure = errorOf(response)
    if (failure) {
      toast(failure || 'rien à annuler')
      return
    }
    toast('action annulée')
    void reload()
    refreshCounts()
  }, [api, toast, reload, refreshCounts])

  /* PERMANENT DELETION — deliberately OUTSIDE act(): it is not a sort, it never
     goes into UNDO (there is nothing to put back, the file is gone), and mixing
     the two in one generic function is exactly the shortcut that would one day
     make deletion « just one more bucket ». An explicit confirmation every time,
     and NEVER a keyboard shortcut — it is the one gesture of the app with no way
     out. */
  const deleteForever = useCallback(
    async (index?: number) => {
      const item = shown[index ?? safeCursor]
      if (!item) return
      const ok = await confirm({
        title: 'Supprimer définitivement ?',
        button: 'Supprimer définitivement',
        body: (
          <>
            <p>
              <b>{item.scene || item.name}</b> sera effacée du disque. Aucun retour
              possible — contrairement au tri, il n'y a pas de bouton « annuler »
              pour ce geste.
            </p>
            <p className="tiny">
              Le journal garde la trace qu'elle a existé et son score ; seul le
              fichier disparaît.
            </p>
          </>
        ),
      })
      if (!ok) return
      const response = await api.post<ActionLike>('/api/delete', {
        name: item.name,
        bucket: item.bucket,
        space: item.space,
      })
      const failure = errorOf(response)
      if (failure) {
        toast(failure || 'suppression impossible')
        return
      }
      setItems((list) => list.filter((i) => i.name !== item.name))
      refreshCounts()
      toast(`${item.scene || item.name} supprimée définitivement`)
    },
    [api, confirm, shown, safeCursor, toast, setItems, refreshCounts],
  )

  /* COUPLING TRAP §5.6-4. Catching up the realism measurements, IN BATCHES: one
     InsightFace pass costs ~190 ms and the server refuses to do 200 in a single
     request. The client must keep calling while `restant > 0` — that is the
     contract, not a stopgap, and there is no push infrastructure to replace it
     with (AUDIT §7.3). The 40-round guard bounds a loop that must never become
     infinite. */
  const measure = async () => {
    if (measuring) return
    setMeasuring(true)
    /* A failure mid-loop must NOT be followed by « mesures à jour ». The legacy
       handler toasted the error, broke, and then toasted the success line
       anyway — which overwrote the only thing that said what went wrong, a
       fraction of a second after it appeared. */
    let failed = false
    try {
      for (let guard = 0; guard < 40; guard += 1) {
        const response = await api.post<ActionLike & { restant?: number }>('/api/mesurer', {
          bucket,
          space,
          lot: 20,
        })
        const failure = errorOf(response)
        if (failure) {
          failed = true
          toast(failure || 'mesure impossible')
          break
        }
        if (!response.restant) break
        setMeasureLeft(response.restant)
      }
      if (!failed) toast('mesures à jour')
    } finally {
      setMeasuring(false)
      setMeasureLeft(null)
      await reload()
    }
  }

  /* KEYBOARD. Each handler carries a stack of guards, and a migration must
     reproduce them exactly: a text field, an open modal, the lightbox, the photo
     editor, and the Galerie trade — where the sorting shortcuts do not exist
     either. Hiding the buttons and letting the keyboard sort would be the worst
     of both halves: one would sort blind, with nothing on screen to say so. */
  const editing = declineFor !== null || editFor !== null
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /input|textarea/i.test(target.tagName)) return
      if (target?.isContentEditable) return
      // an open modal <dialog> swallows the page: its keys must not percolate
      if (document.querySelector('dialog[open]')) return
      if (lightboxSrc) return
      if (document.body.classList.contains('editing')) return

      const key = event.key.toLowerCase()
      if (key === 'arrowright') return step(1)
      if (key === 'arrowleft') return step(-1)
      /* Enter on the grid = open the aimed tile full frame (the keyboard
         equivalent of clicking the thumbnail). Not when the focus is on a
         button: Enter would then sort AND magnify. */
      if (key === 'enter' && view === 'grille' && !target?.closest('button, a')) {
        setView('revue')
        return
      }
      if (trade === 'galerie' && 'vrxadu'.includes(key)) return
      if (key === 'v') void act('valider')
      else if (key === 'r') void act('revoir')
      else if (key === 'x') void act('rejeter')
      else if (key === 'a') void act('archiver')
      else if (key === 'd') void act('decliner')
      else if (key === 'c') current && void setFlag(current, 'ok')
      else if (key === 'i') current && void setFlag(current, 'ia')
      else if (key === 'u') void undo()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [act, current, editing, lightboxSrc, setFlag, setView, step, trade, undo, view])

  /* A finished batch means new images in the folder being looked at. */
  const lastBatch = useRef<string | null>(null)
  useEffect(() => {
    if (!state?.batch_id || state.running) return
    if (lastBatch.current === state.batch_id) return
    lastBatch.current = state.batch_id
    void reload()
  }, [state?.batch_id, state?.running, reload])

  const buckets = state ? (space === 'nsfw' ? state.nsfw_counts : state.counts) : null

  return (
    <div className="screen" id="trier" data-metier={trade}>
      <div className="wrap">
        <div className="viewsel">
          {/* `data-sp="sfw"` is the WIRE key sent to /api/gallery and /img: SFW,
              not the name of a character (AUDIT §5.3). */}
          <div className="seg" id="spaceSel">
            <button
              className={space === 'sfw' ? 'on' : undefined}
              data-sp="sfw"
              data-hint-text="Espace SFW — la production normale du personnage."
              onClick={() => setSpace('sfw')}
            >
              SFW
            </button>
            <button
              className={space === 'nsfw' ? 'on' : undefined}
              data-sp="nsfw"
              data-hint-text="Espace NSFW — isolé, jamais exporté."
              onClick={() => setSpace('nsfw')}
            >
              NSFW
            </button>
          </div>

          {/* The Galerie does not show the bucket selector at all: its folder is
              said by its tab. */}
          {trade === 'revue' && (
            <div className="seg" id="bucketSel">
              {REVIEW_BUCKETS.map((entry) => (
                <button
                  key={entry.key}
                  className={bucket === entry.key ? 'on' : undefined}
                  data-b={entry.key}
                  onClick={() => {
                    setBucket(entry.key)
                    setCursor(0)
                  }}
                >
                  {entry.label} <span id={`b${entry.key}`}>{buckets?.[entry.key] ?? 0}</span>
                </button>
              ))}
            </div>
          )}

          <div className="seg" id="scoreSel">
            {SCORE_FILTERS.map((entry) => (
              <button
                key={entry.key}
                className={filter === entry.key ? 'on' : undefined}
                data-f={entry.key}
                title={scoreFilterTitle(entry.key, qc)}
                onClick={() => {
                  setFilter(entry.key)
                  setCursor(0)
                }}
              >
                {entry.label}
                <span className="n">{counts[entry.key] || ''}</span>
              </button>
            ))}
          </div>

          <div className="spacer" style={{ flex: 1 }} />

          <div className="seg" id="viewSel">
            <button
              className={view === 'revue' ? 'on' : undefined}
              data-v="revue"
              onClick={() => setView('revue')}
            >
              Revue
            </button>
            <button
              className={view === 'grille' ? 'on' : undefined}
              data-v="grille"
              onClick={() => setView('grille')}
            >
              Grille
            </button>
          </div>

          {unmeasured > 0 && (
            <button className="btn sm" id="btnMesurer" disabled={measuring} onClick={measure}>
              {measuring
                ? measureLeft
                  ? `mesure… ${measureLeft} restante(s)`
                  : 'mesure…'
                : `Mesurer (${unmeasured})`}
            </button>
          )}
          {/* Undo has no place in the Galerie: nothing is sorted there. */}
          {trade === 'revue' && (
            <button className="btn sm" id="btnUndo" disabled={!state?.undo} onClick={undo}>
              Annuler
            </button>
          )}
        </div>

        <div id="triageBody">
          {notFound && (
            /* A banner, not an empty screen: the folder may well have content,
               and it is the REQUEST that failed, not the load. */
            <div className="empty avis">
              <b>« {notFound} » n'est pas dans ce dossier.</b>
              Le fichier a pu être trié ailleurs, supprimé, ou appartenir à un autre
              personnage — la Revue et la Galerie ne montrent que l'arbre du
              personnage ouvert.
              <div style={{ marginTop: 16 }}>
                <button className="btn" id="btnAvisFermer" onClick={() => setNotFound(null)}>
                  Fermer
                </button>
              </div>
            </div>
          )}

          {!shown.length ? (
            <EmptyState
              empty={!items.length}
              bucket={bucket}
              total={items.length}
              onShowAll={() => setFilter('tout')}
            />
          ) : view === 'grille' ? (
            <div className="grid">
              {shown.map((item, index) => (
                <Tile
                  key={item.name}
                  item={item}
                  index={index}
                  current={index === safeCursor}
                  trade={trade}
                  qc={qc}
                  bands={bands}
                  items={items}
                  src={api.image({ ...item, thumb: true })}
                  fullSrc={api.image(item)}
                  onAim={() => setCursor(index)}
                  onOpen={() => {
                    setCursor(index)
                    setView('revue')
                  }}
                  onAct={(action) => act(action, index)}
                  onFlag={(flag) => setFlag(item, flag)}
                  onEdit={() => setEditFor(item)}
                  onDelete={() => deleteForever(index)}
                />
              ))}
            </div>
          ) : (
            current && (
              <FullFrame
                item={current}
                index={safeCursor}
                total={shown.length}
                filtered={filter !== 'tout' ? items.length : null}
                trade={trade}
                qc={qc}
                bands={bands}
                items={items}
                references={references}
                src={api.image(current)}
                onStep={step}
                onMagnify={() => openLightbox(api.image(current))}
                onAct={(action) => act(action)}
                onFlag={(flag) => setFlag(current, flag)}
                onEdit={() => setEditFor(current)}
                onDelete={() => deleteForever()}
              />
            )
          )}
        </div>
      </div>

      {editFor && (
        <PhotoEditor
          item={editFor}
          src={api.image(editFor)}
          onClose={() => setEditFor(null)}
          onSaved={() => {
            setEditFor(null)
            void reload()
            refreshCounts()
          }}
        />
      )}

      {declineFor && (
        <DeclineDialog
          item={declineFor}
          onClose={() => setDeclineFor(null)}
          onLaunched={(label, total) => {
            setDeclineFor(null)
            toast(`${label} — ${total} image(s) en production`)
            navigate(PATHS.produce)
          }}
        />
      )}
    </div>
  )
}

function scoreFilterTitle(key: ScoreFilter, qc: { ok: number; high: number }): string {
  return {
    tout: 'toutes les images du dossier',
    haut: `score ≥ ${qc.high.toFixed(2)}`,
    moyen: `score ${qc.ok.toFixed(2)} à ${qc.high.toFixed(2)}`,
    bas: `score < ${qc.ok.toFixed(2)}, ou visage non mesuré`,
  }[key]
}

function EmptyState({
  empty,
  bucket,
  total,
  onShowAll,
}: {
  empty: boolean
  bucket: string
  total: number
  onShowAll: () => void
}) {
  return (
    <div className="empty">
      <b>{empty ? EMPTY_DONE[bucket] : 'Aucune image dans cette bande de score.'}</b>
      {empty
        ? bucket === 'A_REVOIR'
          ? 'Les images dont le score sort de la bande conforme atterrissent ici après chaque batch.'
          : bucket === 'SANS_VISAGE'
            ? "Le contrôle d'identité range ici les images où aucun visage n'a été détecté : dos, plan très large, visage masqué. Elles n'ont pas de score."
            : 'Rien à afficher dans ce dossier.'
        : `${total} image(s) dans ce dossier, aucune dans cette bande.`}
      {!empty && (
        <div style={{ marginTop: 16 }}>
          <button className="btn" id="btnEmptyAll" onClick={onShowAll}>
            Tout afficher
          </button>
        </div>
      )}
    </div>
  )
}

/* Realism judgement buttons: they MEASURE, they do not sort — which is why they
   stay in both trades. */
function FlagButtons({
  item,
  onFlag,
}: {
  item: GalleryItem
  onFlag: (flag: string) => void
}) {
  return (
    <>
      <button
        data-f="ok"
        className={item.flag === 'ok' ? 'on' : undefined}
        title="Convaincante comme photo (C)"
        onClick={(e) => {
          e.stopPropagation()
          onFlag('ok')
        }}
      >
        ◉
      </button>
      <button
        data-f="ia"
        className={item.flag === 'ia' ? 'on' : undefined}
        title="Ça se voit que c'est généré (I)"
        onClick={(e) => {
          e.stopPropagation()
          onFlag('ia')
        }}
      >
        ◌
      </button>
    </>
  )
}

function Tile(props: {
  item: GalleryItem
  index: number
  current: boolean
  trade: Trade
  qc: { ok: number; watch: number; high: number }
  bands: Record<string, unknown>
  items: GalleryItem[]
  src: string
  fullSrc: string
  onAim: () => void
  onOpen: () => void
  onAct: (action: string) => void
  onFlag: (flag: string) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { item, qc } = props
  return (
    <div
      className={`tile${item.flag === 'ia' ? ' ia' : ''}${props.current ? ' cur' : ''}`}
      data-k={props.index}
      onMouseDown={(event) => {
        // the action buttons place the cursor themselves
        if ((event.target as HTMLElement).closest('.tacts')) return
        props.onAim()
      }}
    >
      <button type="button" className="thumb" data-k={props.index} title="Ouvrir en grand" onClick={props.onOpen}>
        <img loading="lazy" src={props.src} alt="" />
      </button>
      <div className={`chip ${scoreClass(item.score, qc)}`}>
        {item.score ? Number.parseFloat(item.score).toFixed(2) : '—'}
      </div>
      <div className="m">
        <b>{item.scene || item.name}</b>
        <br />
        {item.format || ''} · {item.date}
      </div>
      {item.nettete == null ? (
        <div className="nomeas">réalisme non mesuré</div>
      ) : (
        <ScoreBars item={item} bands={props.bands} items={props.items} />
      )}
      <div className="tacts">
        {/* In the Galerie the four sorting gestures DISAPPEAR — not greyed out:
            they make no sense on an image already kept, and an inert button
            would suggest otherwise. */}
        {props.trade === 'galerie' ? (
          <>
            <button data-e="1" title="Éditer cette image" onClick={props.onEdit}>
              ✎
            </button>
            <a className="dl" download href={props.fullSrc} title="Télécharger le fichier">
              ⤓
            </a>
          </>
        ) : (
          <>
            <button data-a="valider" title="Garder (V)" onClick={() => props.onAct('valider')}>
              ♥
            </button>
            {item.space !== 'nsfw' && (
              <button data-d="1" title="Décliner (D)" onClick={() => props.onAct('decliner')}>
                ⟳
              </button>
            )}
            <button data-a="rejeter" title="Rejeter (X)" onClick={() => props.onAct('rejeter')}>
              ✕
            </button>
            <button data-a="archiver" title="Archiver (A)" onClick={() => props.onAct('archiver')}>
              ▣
            </button>
          </>
        )}
        <span className="sep" />
        <FlagButtons item={item} onFlag={props.onFlag} />
        <span className="sep" />
        <button
          className="ml-auto"
          data-suppr="1"
          title="Supprimer définitivement — pas de retour"
          onClick={props.onDelete}
        >
          🗑
        </button>
      </div>
    </div>
  )
}

function FullFrame(props: {
  item: GalleryItem
  index: number
  total: number
  filtered: number | null
  trade: Trade
  qc: { ok: number; watch: number; high: number }
  bands: Record<string, unknown>
  items: GalleryItem[]
  references: { mesurees: number; total: number }
  src: string
  onStep: (delta: number) => void
  onMagnify: () => void
  onAct: (action: string) => void
  onFlag: (flag: string) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { item, qc } = props
  const value = Number.parseFloat(item.score || '0')
  const klass = scoreClass(item.score, qc)

  return (
    <div className="triage">
      <div className="stage">
        <button className="nav prev" onClick={() => props.onStep(-1)}>
          ‹
        </button>
        <img src={props.src} id="stageImg" alt="" onClick={props.onMagnify} />
        <button className="nav next" onClick={() => props.onStep(1)}>
          ›
        </button>
      </div>
      <div className="side">
        <div className="meta">
          <div className="score" style={{ color: `var(--${klass})` }}>
            {item.score ? value.toFixed(3) : '—'}
            <small>
              similarité à la base gelée
              {item.score
                ? value >= qc.ok
                  ? ' · conforme'
                  : value >= qc.watch
                    ? ' · à surveiller'
                    : ' · hors bande'
                : ''}
            </small>
          </div>
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '14px 0' }} />
          <dl style={{ margin: 0 }}>
            <dt>scène</dt>
            <dd>{item.scene || '—'}</dd>
            <dt>format · date</dt>
            <dd>
              {item.format || '—'} · {item.date}
            </dd>
            <dt>seed</dt>
            <dd className="num">{item.seed || '—'}</dd>
          </dl>
          <div className="tiny">
            {props.index + 1} / {props.total}
            {props.filtered != null && ` · filtre actif sur ${props.filtered}`}
          </div>
        </div>

        <div className="meta">
          <dt style={{ marginBottom: 9 }}>réalisme {calibration(props.bands, props.references)}</dt>
          {item.nettete == null ? (
            <div className="tiny">non mesuré</div>
          ) : (
            <ScoreBars item={item} bands={props.bands} items={props.items} flat />
          )}
          <div className="tacts" style={{ marginTop: 11, border: 0, padding: 0 }}>
            <FlagButtons item={item} onFlag={props.onFlag} />
          </div>
          <div className="tiny" style={{ marginTop: 7 }}>
            ◉ convaincante <span className="kbd">C</span> · ◌ fait IA{' '}
            <span className="kbd">I</span>
          </div>
        </div>

        <div className="acts">
          {props.trade === 'galerie' ? (
            <GalleryActions src={props.src} onAct={props.onAct} />
          ) : (
            <ReviewActions bucket={item.bucket} space={item.space} onAct={props.onAct} />
          )}
        </div>

        <div className="secActs">
          <button className="btn sm" id="btnOuvrirEditeur" onClick={props.onEdit}>
            ✎ Éditer
          </button>
          <button className="btn sm danger" id="btnSupprDef" onClick={props.onDelete}>
            🗑 Supprimer définitivement
          </button>
        </div>

        <details className="adv" style={{ border: 0, padding: 0 }}>
          <summary>prompt utilisé</summary>
          <p className="tiny" style={{ marginTop: 8 }}>
            {item.prompt || ''}
          </p>
        </details>
      </div>
    </div>
  )
}

/* Downloading is an <a download> on /img — the route that already serves those
   bytes, bound to the character (isolation of 29/08): no new API to copy a file
   the browser knows how to save on its own.

   « Poster sur Instagram » is INERT and says so: the destination exists in this
   pack's trade, not yet in the code. An absent button would suggest the question
   is not asked; an active one would lie. */
function GalleryActions({ src, onAct }: { src: string; onAct: (action: string) => void }) {
  return (
    <>
      <a className="btn primary wide dl" download href={src}>
        ⤓ Télécharger
      </a>
      <button
        className="btn wide"
        id="btnInsta"
        disabled
        title="Poster sur Instagram — pas encore branché"
      >
        Poster sur Instagram <span className="tiny">pas encore branché</span>
      </button>
      <button className="btn wide" data-a="skip" onClick={() => onAct('skip')}>
        Suivante <span className="kbd">→</span>
      </button>
    </>
  )
}

function ReviewActions({
  bucket,
  space,
  onAct,
}: {
  bucket?: string
  space?: string
  onAct: (action: string) => void
}) {
  const button = (action: string, label: string, key?: string, wide = false, primary = false) => (
    <button
      className={`btn${wide ? ' wide' : ''}${primary ? ' primary' : ''}`}
      data-a={action}
      onClick={() => onAct(action)}
    >
      {label} {key && <span className="kbd">{key}</span>}
    </button>
  )
  // decline restarts from the SFW journal: no meaning for an NSFW image
  const decline =
    space === 'nsfw' ? null : (
      <button className="btn wide" data-a="decliner" onClick={() => onAct('decliner')}>
        ⟳ Décliner <span className="kbd">D</span>
      </button>
    )
  const skip = button('skip', 'Suivante', '→', true)

  if (bucket === 'OK')
    return (
      <>
        {decline}
        {skip}
        {button('archiver', 'Archiver', 'A')}
        {button('rejeter', 'Rejeter', 'X')}
      </>
    )
  if (bucket === 'REJET')
    return (
      <>
        {button('valider', 'Restaurer', 'V', true, true)}
        {button('archiver', 'Archiver', 'A')}
        {skip}
      </>
    )
  if (bucket === 'ARCHIVE')
    return (
      <>
        {button('valider', 'Restaurer', 'V', true, true)}
        {button('rejeter', 'Rejeter', 'X')}
        {skip}
      </>
    )
  return (
    <>
      {button('valider', 'Valider', 'V', true, true)}
      {decline}
      {button('rejeter', 'Rejeter', 'X')}
      {button('archiver', 'Archiver', 'A')}
      {skip}
    </>
  )
}

/* Route wrappers — the ROUTER names the trade. */
export function ReviewRoute() {
  return <ReviewScreen trade="revue" />
}
export function GalleryRoute() {
  return <ReviewScreen trade="galerie" />
}
