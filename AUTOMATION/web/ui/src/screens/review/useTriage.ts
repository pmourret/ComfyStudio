/* Sorting state and the gallery loader — the head of `static/review.js`.

   TWO TRADES, ONE LOADER (F1.1). Revue (judging the A_REVOIR queue) and Galerie
   (consulting the kept ones) are two chrome destinations served by the SAME
   loader and the SAME grid. What changes is the TRADE: in Galerie no sorting
   gesture is offered — neither button nor shortcut — and the consulting gestures
   take their place. Duplicating the screen would have left two grids to maintain
   and two loaders to fall out of sync.

   TWO AXES WE NEVER DERIVE FROM ONE ANOTHER (AUDIT §5.3): `character_id` says
   WHO (it is bound by useApi), `space` says SFW or NSFW. The chrome tabs always
   land on SFW; only a gesture that NAMES the NSFW space enters it. */
import { useCallback, useEffect, useRef, useState } from 'react'

import { errorOf, type ActionLike, type Schema } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useFaults } from '../../state/FaultsContext'
import type { QcBands } from '../../state/ConfigContext'

export type GalleryItem = Schema<'GalleryItem'>
export type GalleryResponse = Schema<'GalleryResponse'>

export type Trade = 'revue' | 'galerie'
export type Space = 'sfw' | 'nsfw'
export type View = 'grille' | 'revue' | 'comparer'
export type ScoreFilter = 'tout' | 'haut' | 'moyen' | 'bas'

/* Calibration band of one realism sub-score, as /api/gallery hands it over. The
   backend types it loosely; this is what the bars READ. */
export type Band = { min: number; max: number; n?: number; source?: string }

export const BUCKETS = ['OK', 'A_REVOIR', 'REJET', 'SANS_VISAGE', 'ARCHIVE'] as const

/* scoreClass is the ONLY function that reads the thresholds; scoreBand (the
   filter) derives from its own tiers rather than comparing against QC again with
   different bounds — otherwise « Correctes » and « Excellentes » end up with the
   same green badge, which is exactly what happened before. */
export function scoreClass(score: string | null | undefined, qc: QcBands): string {
  const value = Number.parseFloat(String(score))
  if (!score || Number.isNaN(value)) return 'none'
  return value >= qc.high ? 'high' : value >= qc.ok ? 'ok' : value >= qc.watch ? 'warn' : 'bad'
}

export function scoreBand(score: string | null | undefined, qc: QcBands): ScoreFilter {
  const klass = scoreClass(score, qc)
  // warn / bad / none all fall into « sous la bande »
  return klass === 'high' ? 'haut' : klass === 'ok' ? 'moyen' : 'bas'
}

export type TriageState = {
  bucket: string
  space: Space
  trade: Trade
  view: View
  items: GalleryItem[]
  bands: Record<string, Band | null>
  references: { mesurees: number; total: number }
  /** Count of images of the folder with no realism measurement yet. */
  unmeasured: number
  /** Name aimed at by the route that could not be found in this folder. */
  notFound: string | null
  loading: boolean
}

export function useTriage({
  bucket,
  space,
  trade,
  focusName,
}: {
  bucket: string
  space: Space
  trade: Trade
  focusName: string | null
}) {
  const api = useApi()
  const { report } = useFaults()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [bands, setBands] = useState<Record<string, Band | null>>({})
  const [references, setReferences] = useState({ mesurees: 0, total: 0 })
  const [unmeasured, setUnmeasured] = useState(0)
  const [notFound, setNotFound] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(0)
  const [view, setView] = useState<View>('grille')

  /* Stale-response token: two quick clicks on two different buckets can see the
     first answer land after the second and overwrite the list with data that no
     longer matches the selected bucket. */
  const sequence = useRef(0)
  /* The name aimed at is CONSUMED by the load: the list is not there yet when
     the navigation is decided. */
  const pendingFocus = useRef<string | null>(null)
  pendingFocus.current = focusName

  const load = useCallback(async () => {
    const seq = ++sequence.current
    setLoading(true)
    let response: (GalleryResponse & ActionLike) | null = null
    try {
      response = await api.get<GalleryResponse>(`/api/gallery?bucket=${bucket}&space=${space}`)
    } catch {
      response = null
    }
    if (seq !== sequence.current) return
    setLoading(false)
    const failure = !response
      ? 'serveur injoignable'
      : errorOf(response) || (Array.isArray(response.items) ? null : 'réponse illisible du serveur')
    report('galerie', failure)
    // keep the previous list, which then says it is possibly stale
    if (failure) return

    const list = response!.items as GalleryItem[]
    setItems(list)
    setBands((response!.bandes ?? {}) as Record<string, Band | null>)
    setReferences((response!.references as { mesurees: number; total: number }) ?? { mesurees: 0, total: 0 })
    setUnmeasured(Number(response!.sans_mesure ?? 0))

    /* Consume the aimed name. It is only looked for in the LOADED folder — so in
       the open character's tree, /api/gallery serving only its own: a name from
       another character lands here as « introuvable », it cannot bring back its
       bytes. Same for a file sorted elsewhere between the link being shared and
       opened. We SAY it; we never aim at another image instead. */
    const target = pendingFocus.current
    if (!target) {
      setNotFound(null)
      return
    }
    pendingFocus.current = null
    const index = list.findIndex((item) => item.name === target)
    if (index < 0) {
      setNotFound(target)
      return
    }
    setNotFound(null)
    setCursor(index)
    /* Revue opens the image full frame — that is where one judges; Galerie stays
       on the grid and merely puts the thumbnail under the cursor. */
    setView(trade === 'revue' ? 'revue' : 'grille')
  }, [api, bucket, space, trade, report])

  // reloads on every change of folder, space or trade
  useEffect(() => {
    setCursor(0)
    void load()
  }, [load])

  return {
    items,
    setItems,
    bands,
    references,
    unmeasured,
    notFound,
    setNotFound,
    loading,
    cursor,
    setCursor,
    view,
    setView,
    reload: load,
  }
}
