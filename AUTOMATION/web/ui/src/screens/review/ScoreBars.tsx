/* The three realism sub-scores, as compact bars. Ported from `barre()` and
   `etalon()` in `static/review.js`.

   WHERE THE SCALE COMES FROM. The calibration band when it exists (>= 8 images
   judged convincing), otherwise the range observed in the CURRENT folder. NO
   THRESHOLD IS WRITTEN IN THE CODE: the project has no corpus of real
   photographs, so the reference is the user's own judgement (CLAUDE.md §8.4).
   Which is exactly why the scale has to be SAID — otherwise one does not know
   what is being read. */
import type { GalleryItem } from './useTriage'

/* The three measurements, and the item field each one reads. The band key and
   the item key differ, and that mismatch is in the payload, not a mistake. */
const MEASURES: { label: string; band: string; field: keyof GalleryItem; decimals: number }[] = [
  { label: 'net', band: 'nettete', field: 'nettete', decimals: 0 },
  { label: 'peau', band: 'texture_visage', field: 'texture', decimals: 2 },
  { label: 'fond', band: 'bruit_fond', field: 'fond', decimals: 2 },
]

type Band = { min: number; max: number; n?: number; source?: string }

function Bar({
  label,
  value,
  band,
  observed,
  decimals,
}: {
  label: string
  value: number
  band: Band | null
  observed: number[]
  decimals: number
}) {
  let lo: number
  let hi: number
  let klass = ''
  if (band) {
    lo = Math.min(band.min, value)
    hi = Math.max(band.max, value)
    klass = value >= band.min && value <= band.max ? 'dans' : 'hors'
  } else {
    lo = Math.min(...observed)
    hi = Math.max(...observed)
  }
  const percent = hi > lo ? Math.round((100 * (value - lo)) / (hi - lo)) : 50
  return (
    <div className="b2">
      <span>{label}</span>
      <u>
        <i className={klass} style={{ width: `${Math.max(3, percent)}%` }} />
      </u>
      <b>{value.toFixed(decimals)}</b>
    </div>
  )
}

export function ScoreBars({
  item,
  bands,
  items,
  flat = false,
}: {
  item: GalleryItem
  bands: Record<string, unknown>
  items: GalleryItem[]
  /** In the side panel the bars carry their own padding from the panel. */
  flat?: boolean
}) {
  return (
    <div className="bars" style={flat ? { padding: 0 } : undefined}>
      {MEASURES.map((measure) => {
        const value = item[measure.field] as number | null | undefined
        if (value == null) return null
        const observed = items
          .map((i) => i[measure.field] as number | null | undefined)
          .filter((v): v is number => v != null)
        return (
          <Bar
            key={measure.band}
            label={measure.label}
            value={value}
            band={(bands[measure.band] as Band | null) ?? null}
            observed={observed}
            decimals={measure.decimals}
          />
        )
      })}
    </div>
  )
}

/* Where the scale of the bars comes from — to be said, otherwise one does not
   know what is being read.

   The three bars can be calibrated SEPARATELY: taking the first band that comes
   announced an origin the others do not necessarily share. We say what is true
   of all three. */
export function calibration(
  bands: Record<string, unknown>,
  references: { mesurees: number; total: number },
): string {
  const list = Object.values(bands).filter(Boolean) as Band[]
  if (!list.length) return '· pas de cible, échelle du dossier'
  const partial = list.length < 3 ? ` · ${list.length}/3 mesures calibrées` : ''
  const sources = new Set(list.map((b) => b.source))
  if (sources.size > 1) return `· cibles mixtes (référence et jugements)${partial}`
  return (
    (list[0].source === 'reference'
      ? `· cible : ${references.mesurees} image(s) de référence`
      : `· cible : ${list[0].n} image(s) jugées convaincantes`) + partial
  )
}
