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
    <div className="flex flex-col gap-[14px]">
      {PARAM_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="tiny mb-[6px] opacity-70">{group.label}</div>
          <div className="flex flex-col gap-[8px]">
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
      ))}
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
    <div className="rounded-card border border-line2 bg-panel2 p-[8px]" data-param={name}>
      <div className="flex items-center justify-between gap-[8px]">
        <label className="flex items-center gap-[6px] text-[12.5px]">
          <input type="checkbox" data-param-included checked={state.included} onChange={onToggle} />
          {PARAM_LABELS[name]}
          <InfoHint text={`Bornes du node ComfyUI : [${lo}, ${hi}]. « Inclure » ajoute ce paramètre à la plage enregistrée pour ce ton — la valeur d'essai reste explorable même non inclus.`} />
        </label>
        <span className="tiny opacity-60">{lo} … {hi}</span>
      </div>

      <div className="mt-[6px] flex items-center gap-[8px]">
        <input
          type="range"
          data-param-trial-slider
          className="flex-1"
          min={lo}
          max={hi}
          step={step}
          value={state.trial}
          onChange={(event) => onTrial(Number(event.target.value))}
        />
        <NumberField field="trial" label="essai" value={state.trial} onCommit={onTrial} />
      </div>

      <div className="mt-[6px] flex items-end gap-[6px]">
        <NumberField field="min" label="min" value={state.min} onCommit={onMin} />
        <button type="button" className="btn sm" data-param-set-min onClick={onSetAsMin} title="fixer le minimum depuis l'essai">
          ↙ min
        </button>
        <NumberField field="max" label="max" value={state.max} onCommit={onMax} />
        <button type="button" className="btn sm" data-param-set-max onClick={onSetAsMax} title="fixer le maximum depuis l'essai">
          ↦ max
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
    <label className="f w-[64px] shrink-0">
      <span>{label}</span>
      <input
        type="number"
        data-param-field={field}
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
