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

import { useApi } from '../../api/useApi'
import { useLightbox } from '../../chrome/LightboxContext'
import { useRovingChoice } from '../../chrome/useRovingChoice'
import { useToast } from '../../chrome/ToastContext'
import { useConfig } from '../../state/ConfigContext'
import { useSystemState } from '../../state/SystemStateContext'
import { PATHS } from '../../app/routes'
import { DeclineDialog } from './DeclineDialog'
import { PhotoEditor } from './PhotoEditor'
import { EmptyState } from './EmptyState'
import { FullFrame } from './FullFrame'
import { Tile } from './Tile'
import { useReviewKeys } from './useReviewKeys'
import { useSortActions } from './useSortActions'
import {
  scoreBand,
  useTriage,
  type GalleryItem,
  type ScoreFilter,
  type Space,
  type Trade,
  type View,
} from './useTriage'

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

  /* Filmstrip thumbnails (design-pass screen-5, §A) — the same `thumb:true`
     URL already resolved for the grid, no extra request. Sub-components
     never call the API themselves (frontend.md): plain strings down. */
  const filmstripItems = useMemo(
    () => shown.map((item) => ({ name: item.name, thumbSrc: api.image({ ...item, thumb: true }) })),
    [shown, api],
  )

  const step = useCallback(
    (delta: number) => {
      if (!shown.length) return
      setCursor((c) => (Math.min(c, shown.length - 1) + delta + shown.length) % shown.length)
    },
    [shown.length, setCursor],
  )

  const { setFlag, act, undo, deleteForever, measure, measuring, measureLeft } = useSortActions({
    shown,
    safeCursor,
    bucket,
    space,
    setItems,
    setCursor,
    setDeclineFor,
    step,
    reload,
  })
  const editing = declineFor !== null || editFor !== null
  useReviewKeys({ trade, view, setView, step, act, setFlag, undo, current, lightboxSrc, editing })

  /* A finished batch means new images in the folder being looked at. */
  const lastBatch = useRef<string | null>(null)
  useEffect(() => {
    if (!state?.batch_id || state.running) return
    if (lastBatch.current === state.batch_id) return
    lastBatch.current = state.batch_id
    void reload()
  }, [state?.batch_id, state?.running, reload])

  const buckets = state ? (space === 'nsfw' ? state.nsfw_counts : state.counts) : null

  /* Four roving radiogroups (a11y audit, design-pass screen-5) — same
     gabarit as produce/IntensityBar.tsx: arrows move AND pick immediately,
     one Tab stop per group. `data-sp`/`data-b`/`data-f`/`data-v` and the
     `'on'` class are unchanged, additive only. */
  const spaceRoving = useRovingChoice(['sfw', 'nsfw'], space)
  const bucketIds = REVIEW_BUCKETS.map((entry) => entry.key)
  const bucketRoving = useRovingChoice(bucketIds, bucket)
  const filterIds = SCORE_FILTERS.map((entry) => entry.key)
  const filterRoving = useRovingChoice(filterIds, filter)
  const viewIds = ['revue', 'grille']
  const viewRoving = useRovingChoice(viewIds, view)

  return (
    <div className="screen" id="trier" data-metier={trade}>
      {/* The sorting screen ends on its grid: it has no launch bar to clear. */}
      <div className="wrap pb-[24px]">
        <div className="viewsel">
          {/* `data-sp="sfw"` is the WIRE key sent to /api/gallery and /img: SFW,
              not the name of a character (AUDIT §5.3). */}
          <div className="seg" id="spaceSel" role="radiogroup" aria-label="Espace">
            <button
              ref={spaceRoving.registerRef('sfw')}
              role="radio"
              aria-checked={space === 'sfw'}
              tabIndex={spaceRoving.tabIndexFor('sfw')}
              className={space === 'sfw' ? 'on' : undefined}
              data-sp="sfw"
              data-hint-text="Espace SFW — la production normale du personnage."
              onClick={() => setSpace('sfw')}
              onKeyDown={(event) => spaceRoving.onKeyDown(event, 'sfw', (id) => setSpace(id as Space))}
            >
              SFW
            </button>
            <button
              ref={spaceRoving.registerRef('nsfw')}
              role="radio"
              aria-checked={space === 'nsfw'}
              tabIndex={spaceRoving.tabIndexFor('nsfw')}
              className={space === 'nsfw' ? 'on' : undefined}
              data-sp="nsfw"
              data-hint-text="Espace NSFW — isolé, jamais exporté."
              onClick={() => setSpace('nsfw')}
              onKeyDown={(event) => spaceRoving.onKeyDown(event, 'nsfw', (id) => setSpace(id as Space))}
            >
              NSFW
            </button>
          </div>

          {/* The Galerie does not show the bucket selector at all: its folder is
              said by its tab. */}
          {trade === 'revue' && (
            <div className="seg" id="bucketSel" role="radiogroup" aria-label="Dossier">
              {REVIEW_BUCKETS.map((entry) => (
                <button
                  key={entry.key}
                  ref={bucketRoving.registerRef(entry.key)}
                  role="radio"
                  aria-checked={bucket === entry.key}
                  tabIndex={bucketRoving.tabIndexFor(entry.key)}
                  className={bucket === entry.key ? 'on' : undefined}
                  data-b={entry.key}
                  onClick={() => {
                    setBucket(entry.key)
                    setCursor(0)
                  }}
                  onKeyDown={(event) =>
                    bucketRoving.onKeyDown(event, entry.key, (id) => {
                      setBucket(id)
                      setCursor(0)
                    })
                  }
                >
                  {entry.label} <span id={`b${entry.key}`}>{buckets?.[entry.key] ?? 0}</span>
                </button>
              ))}
            </div>
          )}

          <div className="seg" id="scoreSel" role="radiogroup" aria-label="Filtre de score">
            {SCORE_FILTERS.map((entry) => (
              <button
                key={entry.key}
                ref={filterRoving.registerRef(entry.key)}
                role="radio"
                aria-checked={filter === entry.key}
                tabIndex={filterRoving.tabIndexFor(entry.key)}
                className={filter === entry.key ? 'on' : undefined}
                data-f={entry.key}
                aria-label={`${entry.label} — ${scoreFilterTitle(entry.key, qc)}`}
                title={scoreFilterTitle(entry.key, qc)}
                onClick={() => {
                  setFilter(entry.key)
                  setCursor(0)
                }}
                onKeyDown={(event) =>
                  filterRoving.onKeyDown(event, entry.key, (id) => {
                    setFilter(id as ScoreFilter)
                    setCursor(0)
                  })
                }
              >
                {entry.label}
                <span className="n">{counts[entry.key] || ''}</span>
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <div className="seg" id="viewSel" role="radiogroup" aria-label="Affichage">
            <button
              ref={viewRoving.registerRef('revue')}
              role="radio"
              aria-checked={view === 'revue'}
              tabIndex={viewRoving.tabIndexFor('revue')}
              className={view === 'revue' ? 'on' : undefined}
              data-v="revue"
              onClick={() => setView('revue')}
              onKeyDown={(event) => viewRoving.onKeyDown(event, 'revue', (id) => setView(id as View))}
            >
              Revue
            </button>
            <button
              ref={viewRoving.registerRef('grille')}
              role="radio"
              aria-checked={view === 'grille'}
              tabIndex={viewRoving.tabIndexFor('grille')}
              className={view === 'grille' ? 'on' : undefined}
              data-v="grille"
              onClick={() => setView('grille')}
              onKeyDown={(event) => viewRoving.onKeyDown(event, 'grille', (id) => setView(id as View))}
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
            <div className="empty mb-[16px]" data-avis>
              <b>« {notFound} » n'est pas dans ce dossier.</b>
              Le fichier a pu être trié ailleurs, supprimé, ou appartenir à un autre
              personnage — la Revue et la Galerie ne montrent que l'arbre du
              personnage ouvert.
              <div className="mt-[16px]">
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-[14px]">
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
                filmstripItems={filmstripItems}
                onStep={step}
                onSelectIndex={setCursor}
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

/* Route wrappers — the ROUTER names the trade. */
export function ReviewRoute() {
  return <ReviewScreen trade="revue" />
}
export function GalleryRoute() {
  return <ReviewScreen trade="galerie" />
}
