/* The Produire inspector — the sticky right column. Ported from
   `static/inspector.js`.

   WHAT IT REPAIRS: the screen only showed a result DURING a batch (the strip of
   the run panel). Coming back to it cold said nothing about what the character
   had already produced — one went to tune an intensity without the last image it
   gave under one's eyes.

   TWO SOURCES, in this order, from the smallest diff to the costliest:
     1. STATE.recent from /api/state — already received on every tick, no extra
        call. Kept ONLY if STATE.character is the character of the URL:
        `character` there is the one of the RUNNING BATCH, not the one being
        looked at. Without that test, Abyssiaelle's inspector would show the last
        image of a Léna batch launched from another tab — exactly the failure the
        29/08 isolation closed elsewhere.
     2. the last SFW item of the OK bucket via /api/gallery — read once.

   The bytes only ever travel through `api.image()`, and both routes read are
   already bound to the character. */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { errorOf, type ActionLike, type Schema } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useCharacter } from '../../character/CharacterContext'
import { useLightbox } from '../../chrome/LightboxContext'
import { useSystemState } from '../../state/SystemStateContext'
import { screenForImage } from '../../app/routes'

type GalleryResponse = Schema<'GalleryResponse'>
type GalleryItem = Schema<'GalleryItem'>

/** What both sources have in common — the inspector reads no more than this. */
type Shown = {
  name: string
  bucket?: string
  space?: string
  scene?: string | null
  format?: string | null
  score?: string | number | null
  v?: number | string | null
}

const VERDICT_LABEL: Record<string, string> = {
  OK: 'validées',
  A_REVOIR: 'à revoir',
  REJET: 'rejetées',
  SANS_VISAGE: 'sans visage',
  ERREUR: 'en erreur',
}

/* /api/state returns a float, /api/gallery an already formatted string (or ''). */
const scoreText = (value: Shown['score']) => {
  if (value == null || value === '') return ''
  const n = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(n) ? n.toFixed(3) : ''
}

export function Inspector() {
  const api = useApi()
  const navigate = useNavigate()
  const { claimed, sheet } = useCharacter()
  const { state } = useSystemState()
  const { open: openLightbox } = useLightbox()
  const [fallback, setFallback] = useState<GalleryItem | null>(null)
  const [failed, setFailed] = useState(false)

  /* STATE.recent is the batch's. `state.character` is the character OF THE
     RUNNING BATCH, which can differ from the one on screen (AUDIT §4.5): one
     GPU, one batch for the whole platform. */
  const fromState: Shown | null =
    state && state.character === claimed && Array.isArray(state.recent) && state.recent.length
      ? (state.recent[state.recent.length - 1] as Shown)
      : null

  const loadFallback = useCallback(async () => {
    /* /api/gallery is already bound to the character and returns its items from
       newest to oldest: the first one is enough, we do not sort again. */
    try {
      const response = await api.get<GalleryResponse>('/api/gallery?bucket=OK&space=sfw')
      if (errorOf(response as ActionLike)) return
      const items = (response.items ?? []) as GalleryItem[]
      setFallback(items[0] ?? null)
    } catch {
      /* silent: it is a comfort reading, and the fault banner already carries a
         real load failure of the gallery */
    }
  }, [api])

  // re-read on a character switch: the last image belongs to a character
  useEffect(() => {
    setFallback(null)
    setFailed(false)
    void loadFallback()
  }, [loadFallback, claimed])

  const item: Shown | null = fromState ?? (fallback as Shown | null)
  const source = fromState ? 'dernier batch' : item ? 'banque · validées' : ''

  const rows: [string, string][] = []
  if (item) {
    if (item.scene) rows.push(['Scène', item.scene])
    // `format` only exists on the gallery source (STATE.recent does not carry
    // it): the row is omitted rather than showing a dash, which would suggest
    // data missing from the file
    if (item.format) rows.push(['Format', item.format])
    const score = scoreText(item.score)
    if (score) rows.push(['Score identité', score])
    // the verdict in words: the run strip only carries it as a border colour,
    // and « status never by colour alone »
    if (item.bucket) rows.push(['Tri', VERDICT_LABEL[item.bucket] ?? item.bucket])
    if (item.space === 'nsfw') rows.push(['Espace', 'NSFW'])
  }
  if (sheet) {
    if (sheet.output_style) rows.push(['Style', sheet.output_style])
    if (sheet.world?.label) rows.push(['Monde', sheet.world.label])
    if (sheet.universe?.label) rows.push(['Pack', sheet.universe.label])
  }

  const thumb = item ? api.image({ ...item, thumb: true }) : null

  return (
    <aside className="cr-side" id="inspector" aria-label="Dernière image du personnage">
      <h2>
        Dernière image{' '}
        <span className="tiny" id="insSrc">
          {source}
        </span>
      </h2>
      {/* Fixed text, and its display is a CSS rule hanging off `.ins-shot.vide`:
          nothing to keep in sync here. */}
      <p className="tiny ins-role" id="insRole">
        Dernière sortie de ce personnage — pas l'aperçu du prochain run.
      </p>
      <div className={`ins-shot${item && !failed ? '' : ' vide'}`} id="insShot">
        {item && !failed && thumb && (
          <img
            className="ins-layer cur"
            id="insImg"
            src={thumb}
            alt={item.scene ? `dernière image — ${item.scene}` : 'dernière image'}
            onClick={() => openLightbox(api.image(item))}
            /* The failure is SAID, never swallowed — but WITHOUT naming its
               cause: an <img> onerror does not tell a 404 (file sorted or
               deleted between two ticks) from a 500 (thumbnail impossible to
               build). Announcing « supprimée » on a 500 would send one looking
               in the wrong place. */
            onError={() => setFailed(true)}
          />
        )}
        {(!item || failed) && (
          <p className="ins-void" id="insVoid">
            {failed
              ? 'image indisponible pour le moment'
              : `rien encore pour ${sheet?.name || claimed}`}
          </p>
        )}
      </div>
      <dl className="meta ins-meta" id="insMeta">
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {/* The lightbox shows the bytes; this link leads to the SCREEN where the
          image is worked on, and its bucket decides which — a kept one in the
          Galerie, everything else in the Revue. */}
      {item && (
        <p className="tiny ins-voir" id="insVoirLigne">
          <button
            className="link"
            id="insVoir"
            onClick={() => navigate(screenForImage(item.bucket, item.name))}
          >
            voir cette image
          </button>
        </p>
      )}
    </aside>
  )
}
