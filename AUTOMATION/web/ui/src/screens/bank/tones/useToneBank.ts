/* Derives the tone list straight from the taxonomy already loaded app-wide
   (`useTaxonomy` — `GET /api/creative`) — no route of its own. Tones
   themselves stay hand-authored elsewhere (creative.json); this hook only
   reads what each one has configured, for the picker's summary line. */
import { useTaxonomy } from '../../../state/TaxonomyContext'
import { PARAM_BOUNDS, type ExpressionParamName } from '../../expression-editor/expressionBounds'

export type ToneRow = {
  key: string
  label: string
  configuredParams: ExpressionParamName[]
}

const PARAM_NAMES = Object.keys(PARAM_BOUNDS) as ExpressionParamName[]

export function useToneBank() {
  const { creative } = useTaxonomy()
  const rows: ToneRow[] = (creative?.tones ?? []).map((tone) => ({
    key: tone.key,
    label: tone.label || tone.key,
    configuredParams: PARAM_NAMES.filter((name) => tone.expression?.[name] != null),
  }))
  return { rows, loaded: creative !== null }
}
