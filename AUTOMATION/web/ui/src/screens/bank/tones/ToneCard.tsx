/* One tone in the bank grid — purely presentational (frontend.md: a
   sub-component never calls the API). No menu, no rename/duplicate/delete:
   a tone is hand-authored in creative.json, this card only links to its
   expression editor. */
import { Link } from 'react-router-dom'

import { PATHS } from '../../../app/routes'
import { PARAM_LABELS } from '../../expression-editor/expressionBounds'
import type { ToneRow } from './useToneBank'

export function ToneCard({ tone }: { tone: ToneRow }) {
  return (
    <div className="flex flex-col gap-[6px] rounded-[8px] border border-line2 bg-panel2 p-[10px]" data-tone-card data-key={tone.key}>
      <b className="truncate text-[13px]">{tone.label}</b>
      <p className="tiny min-h-[2.6em] opacity-70">
        {tone.configuredParams.length
          ? tone.configuredParams.map((name) => PARAM_LABELS[name]).join(', ')
          : 'aucune expression réglée — tirage toujours neutre'}
      </p>
      <Link
        className="btn sm w-full"
        to={`${PATHS.expressionEditor}/${encodeURIComponent(tone.key)}`}
      >
        éditer l’expression
      </Link>
    </div>
  )
}
