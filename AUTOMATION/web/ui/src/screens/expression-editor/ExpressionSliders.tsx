/* Presentational only (frontend.md: a sub-component never calls the API) —
   one row per ExpressionEditor parameter, grouped (PARAM_GROUPS). A live
   "valeur d'essai" drives the preview; two committed numbers (min/max) are
   what a save actually sends, for parameters marked "inclure". Numeric
   fields, not a dual-handle slider widget: same vocabulary PoseInspector
   already uses (fields + explicit action buttons), not a new one. */
import { useEffect, useState } from 'react'

import { InfoHint } from '../bank/composer/InfoHint'
import { PARAM_BOUNDS, PARAM_GROUPS, PARAM_LABELS, type ExpressionParamName } from './expressionBounds'
import type { ParamState } from './useExpressionEditor'

export function ExpressionSliders({
  params, onTrial, onMin, onMax, onToggle, onSetAsMin, onSetAsMax,
}: {
  params: Record<ExpressionParamName, ParamState>
  onTrial: (name: ExpressionParamName, value: number) => void
  onMin: (name: ExpressionParamName, value: number) => void
  onMax: (name: ExpressionParamName, value: number) => void
  onToggle: (name: ExpressionParamName) => void
  onSetAsMin: (name: ExpressionParamName) => void
  onSetAsMax: (name: ExpressionParamName) => void
}) {
  return (
    <div className="flex flex-col gap-[10px]">
      <ColumnHeader />
      {PARAM_GROUPS.map((group) => {
        const included = group.params.filter((name) => params[name].included).length
        return (
        <div key={group.label}>
          <div className="tiny mb-[4px] opacity-70">
            {group.label} — {included}/{group.params.length} inclus
          </div>
          <div className="flex flex-col gap-[4px]">
            {group.params.map((name) => (
              <ParamRow
                key={name}
                name={name}
                state={params[name]}
                onTrial={(value) => onTrial(name, value)}
                onMin={(value) => onMin(name, value)}
                onMax={(value) => onMax(name, value)}
                onToggle={() => onToggle(name)}
                onSetAsMin={() => onSetAsMin(name)}
                onSetAsMax={() => onSetAsMax(name)}
              />
            ))}
          </div>
        </div>
        )
      })}
    </div>
  )
}

/** Once, at the top of the whole list — not once per group, and not
    repeated in every `NumberField` caption below it (removed there for
    height: §S). Sticky so it stays in view while the panel scrolls past a
    group boundary. Its cells are ghost copies of `ParamRow`'s own controls
    (same classes, `invisible`) rather than hand-picked widths: the header
    can't drift out of alignment with the rows if `ParamRow`'s own widths
    ever change, because it IS those widths. */
function ColumnHeader() {
  return (
    <div className="sticky top-0 z-[1] flex items-center gap-[6px] bg-bg px-[8px] pb-[4px] text-[11px] text-dim2">
      <div className="w-[140px] shrink-0" />
      <div className="min-w-[34px] flex-1" />
      <span className="w-[46px] shrink-0 text-center">essai</span>
      <span className="w-[46px] shrink-0 text-center">min</span>
      <button type="button" tabIndex={-1} aria-hidden className="btn sm !px-[7px] invisible">mn</button>
      <span className="w-[46px] shrink-0 text-center">max</span>
      <button type="button" tabIndex={-1} aria-hidden className="btn sm !px-[7px] invisible">mx</button>
    </div>
  )
}

function ParamRow({
  name, state, onTrial, onMin, onMax, onToggle, onSetAsMin, onSetAsMax,
}: {
  name: ExpressionParamName
  state: ParamState
  onTrial: (value: number) => void
  onMin: (value: number) => void
  onMax: (value: number) => void
  onToggle: () => void
  onSetAsMin: () => void
  onSetAsMax: () => void
}) {
  const [lo, hi] = PARAM_BOUNDS[name]
  const step = hi - lo > 40 ? 1 : 0.01
  return (
    // Dimmed when NOT included — measured before this fix: an included and
    // an excluded card rendered at the exact same opacity (1), the only
    // difference being a 13px checkbox easy to miss while scanning 12 rows.
    // The checkbox and the trial slider/field stay fully opaque of their
    // own accord (`opacity` on the parent doesn't disable them) — only the
    // whole card's visual WEIGHT drops, which is what needs to read at a
    // glance: this row does not (yet) count toward what gets saved.
    //
    // One line, not three (design pass §S) — the bounds shown until now as
    // an always-visible "{lo} … {hi}" span are dropped rather than moved
    // into a bare `title`: `InfoHint` right next to the label already
    // carries the same [lo, hi] in its `data-hint-text`, reachable by
    // keyboard — a `title` here would reintroduce the hover-only pattern
    // `conventions-ux-ui.md` §3 exists to rule out, for information that is
    // not actually exclusive to it.
    <div
      className={`rounded-card border border-line2 bg-panel2 px-[8px] py-[6px] transition-opacity ${state.included ? '' : 'opacity-55'}`}
      data-param={name}
    >
      <div className="flex items-center gap-[6px]">
        {/* Fixed width, not sized-to-content: an unconstrained label made
            every row's slider/essai/min/max start at a DIFFERENT x (measured
            drift of up to 80px between rows) — worse than the wrap this
            replaced. Fixed width alignment only works if the row FITS its
            container, though: at a realistic ~1180px window the aside is
            ~458px, and a 180px label pushed the row to 558px wide — no wrap,
            no visible clip, but a SILENT horizontal scroll on the params
            list (measured: `mx`'s button rendered at x=1268, off the
            1180px viewport, reachable only by scrolling sideways with no
            affordance hinting it was there). 140px + truncating the text
            (not the row) fits the measured 458px aside with margin, and the
            two "pupilles —" labels still keep enough of "horizontal" /
            "vertical" visible past the same "pupilles —" prefix to tell
            them apart at a glance. */}
        <label className="flex w-[140px] shrink-0 items-center gap-[4px] text-[12.5px]">
          {/* `w-auto`, not just `shrink-0`: `chrome.css`'s global
              `input{width:100%}` is harmless on a checkbox as long as its
              flex container has no DEFINITE width to resolve that 100%
              against — the moment this label got a fixed `w-[140px]` above,
              the checkbox started resolving to 140px itself and pushed the
              actual text to 0 (measured: the span's own rendered width was
              literally 0px, the checkbox's was 140px). Same rule likely
              lurks on any OTHER checkbox that gains a definite-width
              ancestor later — not chased down app-wide here, flagging it. */}
          <input type="checkbox" data-param-included checked={state.included} onChange={onToggle} className="w-auto shrink-0" />
          <span className="min-w-0 flex-1 truncate">{PARAM_LABELS[name]}</span>
          <InfoHint text={`Bornes du node ComfyUI : [${lo}, ${hi}]. « Inclure » ajoute ce paramètre à la plage enregistrée pour ce ton — la valeur d'essai reste explorable même non inclus.`} />
        </label>
        <input
          type="range"
          data-param-trial-slider
          className="min-w-[34px] flex-1"
          min={lo}
          max={hi}
          step={step}
          value={state.trial}
          onChange={(event) => onTrial(Number(event.target.value))}
        />
        <NumberField field="trial" label="essai" value={state.trial} onCommit={onTrial} />
        <NumberField field="min" label="min" value={state.min} onCommit={onMin} />
        <button type="button" className="btn sm !px-[7px]" data-param-set-min onClick={onSetAsMin} title="fixer le minimum depuis l'essai">
          mn
        </button>
        <NumberField field="max" label="max" value={state.max} onCommit={onMax} />
        <button type="button" className="btn sm !px-[7px]" data-param-set-max onClick={onSetAsMax} title="fixer le maximum depuis l'essai">
          mx
        </button>
      </div>
    </div>
  )
}

/* Same shape as PoseInspector's own NumberField: local text state absorbs
   in-progress typing (a bare "-", an empty field) so the input doesn't snap
   back to the last committed digit on every keystroke. */
function NumberField({
  field, label, value, onCommit,
}: {
  field: 'trial' | 'min' | 'max'
  label: string
  value: number
  onCommit: (next: number) => void
}) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  return (
    <label className="relative w-[46px] shrink-0">
      {/* Visually hidden (clip-path), not `display:none` — stays the
          input's accessible name (frontend.md: an `<input>` needs a real
          `<label>`, never a bare `<span>` beside it). The visible caption
          repeated 3× per row was most of each row's HEIGHT (`.f span` adds
          a stacked line + 5px margin, ×3 fields) and isn't needed to read
          the row: "essai/min/max" is redundant with the field's own
          position next to its "mn"/"mx" button. Same pattern as
          `chrome.css`'s icon-mode nav label. */}
      <span className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]">{label}</span>
      <input
        type="number"
        data-param-field={field}
        className="w-full !px-[6px]"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          const parsed = Number(event.target.value)
          if (event.target.value.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed)
        }}
      />
    </label>
  )
}
