/* The generation settings panel, opened by the gear of the launch bar AND by the
   rail. Two buttons, ONE state — not a second settings surface that could drift
   from this one.

   The « mesuré » badge lights when the value is the one from config.json, and a
   counter in the panel head says how far one has moved from the validated
   values. That is the whole point: one sees at a glance how far one has gone.

   Ported from `renderReglages` / `majAffichage` in `static/create.js`. */
import { useMemo, useRef } from 'react'

import { BY_ID, PRESETS, SECTIONS, fmtVal, type Setting } from './settings'
import { useOverlayPanel } from './useOverlayPanel'

/** Every control's value, by setting id. Booleans for switches, strings for the
    rest — a numeric field must be able to be EMPTY, which a number cannot say. */
export type SettingValues = Record<string, string | boolean>

export function referenceOf(
  item: Setting,
  presetRef: Record<string, unknown>,
  nsfwRef: Record<string, unknown>,
): unknown {
  if (item.dest === 'preset') return presetRef[item.cle!]
  if (item.dest === 'nsfw') return nsfwRef[item.cle!] ?? presetRef[item.cle!]
  return '' // batch fields have no measured reference
}

/** Initial values: those of config.json for preset/nsfw, empty for the batch
    fields, which mean « the scene's default ». */
export function initialValues(
  presetRef: Record<string, unknown>,
  nsfwRef: Record<string, unknown>,
): SettingValues {
  const out: SettingValues = {}
  SECTIONS.forEach((section) =>
    section.items.forEach((item) => {
      if (item.dest === 'job') {
        out[item.id] = item.type === 'bool' ? false : ''
        return
      }
      const reference = referenceOf(item, presetRef, nsfwRef)
      if (reference === undefined) {
        out[item.id] = item.type === 'bool' ? false : ''
        return
      }
      out[item.id] = item.type === 'bool' ? Boolean(reference) : String(reference)
    }),
  )
  return out
}

/** Applies a preset ON TOP of the measured values — it fills the panel, it does
    not bypass it. */
export function withPreset(
  values: SettingValues,
  preset: string,
  presetRef: Record<string, unknown>,
  nsfwRef: Record<string, unknown>,
): SettingValues {
  const base = initialValues(presetRef, nsfwRef)
  const out: SettingValues = { ...base }
  // the batch fields are the operator's, a preset does not touch them
  SECTIONS.forEach((section) =>
    section.items.forEach((item) => {
      if (item.dest === 'job') out[item.id] = values[item.id]
    }),
  )
  Object.entries(PRESETS[preset] ?? PRESETS.realisme).forEach(([key, value]) => {
    const item = Object.values(BY_ID).find((i) => i.cle === key && i.dest === 'preset')
    if (item) out[item.id] = item.type === 'bool' ? Boolean(value) : String(value)
  })
  return out
}

/** What the panel sends to the server, for one destination. */
export function valuesFor(
  values: SettingValues,
  dest: 'preset' | 'nsfw',
): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {}
  SECTIONS.forEach((section) =>
    section.items.forEach((item) => {
      if (item.dest !== dest) return
      const value = values[item.id]
      out[item.cle!] = item.type === 'bool' ? Boolean(value) : Number.parseFloat(String(value))
    }),
  )
  return out
}

/* The shapes the panel repeats. They were `.rgs`, `.rgh`, `.mes`… in
   `produce.css`; they are the same declarations, written where the markup is.

   THE BADGE IS SPLIT IN THREE on purpose. Two utilities setting the SAME
   property are decided by their order in the generated sheet, not by their order
   in the class string — so an « off » chain cannot override a colour the base
   already names. The base holds only what both states share; each state names
   its own ground, border and text. */
const SECTION =
  'mt-[14px] border-t border-t-line pt-[14px] first:mt-0 first:[border-top:0] first:pt-0'
const SECTION_TITLE = 'text-[12px] font-semibold uppercase tracking-[.8px] text-dim2'
const BADGE_BASE = 'rounded-[5px] border px-[6px] py-[2px] text-[10px] uppercase tracking-[.6px]'
const BADGE_ON = 'border-mes-line bg-mes-bg text-ok'
const BADGE_OFF = 'border-line bg-transparent text-dim2 opacity-55'
const BADGE = BADGE_BASE + ' ' + BADGE_ON
const ROW = 'mb-[16px] last:mb-0'
const ROW_HEAD = 'mb-[6px] flex items-center gap-[8px]'
const HELP = 'mt-[6px] mb-0 text-[12.5px] leading-[1.6] text-dim'
/* A field of the panel repaints what `chrome.css` gives every input, except its
   border colour and its radius — that is the whole of the old `.rg select,
   .rg input[type=number]`. */
const FIELD = 'w-full rounded-[8px] border border-line2 bg-panel2 px-[10px] py-[8px]'
/* The slider, thumb included. `appearance-none` on the track AND on the thumb:
   without it the browser paints its own control and ignores the rest. */
const SLIDER =
  'mx-0 my-[2px] h-[4px] w-full appearance-none rounded-[3px] bg-line2 [outline:none] ' +
  '[&::-webkit-slider-thumb]:h-[16px] [&::-webkit-slider-thumb]:w-[16px] ' +
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer ' +
  '[&::-webkit-slider-thumb]:rounded-[50%] [&::-webkit-slider-thumb]:border-2 ' +
  '[&::-webkit-slider-thumb]:border-panel [&::-webkit-slider-thumb]:bg-acc ' +
  '[&::-webkit-slider-thumb]:shadow-[0_1px_4px_#0008] ' +
  '[&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:w-[14px] ' +
  '[&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-[50%] ' +
  '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-panel ' +
  '[&::-moz-range-thumb]:bg-acc'

const sameAsReference = (item: Setting, value: SettingValues[string], reference: unknown) =>
  item.type === 'bool'
    ? Boolean(reference) === Boolean(value)
    : Math.abs(Number(reference) - Number(value)) < 1e-9

export function SettingsPanel({
  open,
  values,
  presetRef,
  nsfwRef,
  editTier,
  nsfwLevel,
  onChange,
  onReset,
  onClose,
}: {
  open: boolean
  values: SettingValues
  presetRef: Record<string, unknown>
  nsfwRef: Record<string, unknown>
  /** True on the tier that edits — the NSFW section only makes sense there. */
  editTier: boolean
  /* The NSFW pipeline leans on the identity QC verdict: without it every verdict
     becomes "OK". Same for the Rapide/Brut presets, which cut the refiner and
     the grain the branch inherits. Disable rather than let one click a control
     with no effect (double guard, see guard_intensity server-side). */
  nsfwLevel: boolean
  onChange: (id: string, value: string | boolean) => void
  onReset: () => void
  /** screen-3-produire: Escape closes the panel, same rule as any overlay
      (cadrage). Opened from two places (launch bar AND rail gear) — see
      useOverlayPanel, focus returns to whichever actually opened it. */
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  /* Scoped to #gearBody: the header's "Valeurs mesurées" reset button comes
     first in DOM order but is chrome, not a setting — the deliverable asks
     for "le premier réglage" specifically. */
  useOverlayPanel(open, onClose, containerRef, '#gearBody :is(input,select,textarea,button):not([disabled])')

  /* Deviation count, globally and per section. A folded section must say it
     hides a deviation, otherwise folding hides the very information the counter
     exists to give. */
  const { total, bySection } = useMemo(() => {
    let count = 0
    const per: Record<string, number> = {}
    SECTIONS.forEach((section) =>
      section.items.forEach((item) => {
        const reference = referenceOf(item, presetRef, nsfwRef)
        if (reference === '' || reference === undefined) return
        if (!sameAsReference(item, values[item.id], reference)) {
          count += 1
          per[section.titre] = (per[section.titre] ?? 0) + 1
        }
      }),
    )
    return { total: count, bySection: per }
  }, [values, presetRef, nsfwRef])

  return (
    <div
      ref={containerRef}
      className={`fixed right-[20px] bottom-[96px] z-[8] w-[min(620px,calc(100vw-40px))]
                  max-h-[calc(100vh-190px)] overflow-auto rounded-[12px] border border-line2
                  bg-panel p-[18px] shadow-elev ${open ? 'block' : 'hidden'}`}
      id="gearPanel"
      data-open={open ? '1' : undefined}
    >
      <div className="mb-[10px] flex items-center gap-[12px]">
        <h3 className="m-0 text-[13px] font-semibold uppercase tracking-[.9px] text-dim">
          Réglages
        </h3>
        <div className="flex-1" />
        <span className="tiny" id="gearDiff">
          {total ? `${total} réglage${total > 1 ? 's' : ''} hors valeur mesurée` : ''}
        </span>
        <button
          className="btn sm"
          id="btnReset"
          title="Remet chaque réglage à la valeur mesurée du projet"
          onClick={onReset}
        >
          Valeurs mesurées
        </button>
      </div>
      <p className="mt-0 mb-[18px] text-[12.5px] leading-[1.6] text-dim">
        Chaque réglage dit ce qu'il fait et ce qu'il coûte. Les valeurs marquées{' '}
        <b className={BADGE}>mesuré</b> sont celles validées par les tests du projet :
        s'en écarter est permis, mais c'est un choix, pas un réglage neutre.
      </p>
      <div id="gearBody">
        {SECTIONS.map((section) => {
          if (section.niveau === 'edit' && !editTier) return null
          const body = section.items.map((item) => (
            <SettingRow
              key={item.id}
              item={item}
              value={values[item.id]}
              reference={referenceOf(item, presetRef, nsfwRef)}
              master={item.lieA ? Boolean(values[item.lieA]) : true}
              nsfwLevel={nsfwLevel}
              onChange={onChange}
            />
          ))
          if (!section.replie) {
            return (
              <section
                className={SECTION}
                data-rgs
                data-niveau={section.niveau ?? ''}
                key={section.titre}
              >
                <h4 className={`${SECTION_TITLE} mt-0 mb-[12px]`}>{section.titre}</h4>
                {body}
              </section>
            )
          }
          const deviations = bySection[section.titre] ?? 0
          return (
            <section
              className={SECTION}
              data-rgs
              data-niveau={section.niveau ?? ''}
              key={section.titre}
            >
              {/* The fold marker: `[[open]>&]` reads « this summary, inside an
                  open details » — the state lives on the parent, so no `open:`
                  variant can see it from here. */}
              <details>
                <summary
                  className="flex cursor-pointer items-baseline gap-[10px] [list-style:none]
                             [&::-webkit-details-marker]:hidden
                             before:text-[11px] before:text-acc before:content-['▸']
                             [[open]>&]:before:content-['▾']"
                >
                  <h4 className={`${SECTION_TITLE} m-0 inline`}>{section.titre}</h4>
                  <span
                    className={`text-[11px] ${deviations ? 'text-acc' : 'text-dim2'}`}
                    data-sec={section.titre}
                  >
                    {deviations ? `${deviations} hors mesuré` : ''}
                  </span>
                </summary>
                {body}
              </details>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function SettingRow({
  item,
  value,
  reference,
  master,
  nsfwLevel,
  onChange,
}: {
  item: Setting
  value: string | boolean
  reference: unknown
  master: boolean
  nsfwLevel: boolean
  onChange: (id: string, value: string | boolean) => void
}) {
  const hasReference = reference !== '' && reference !== undefined
  const measured = hasReference && sameAsReference(item, value, reference)
  /* A setting depending on a switch that is off no longer has an effect: say
     so, rather than let it look live. */
  const inert = !master
  const disabled =
    (item.id === 'noqc' && nsfwLevel) ||
    (item.dest === 'preset' && false)
  const classes = `${ROW}${inert ? ' opacity-[.42]' : ''}`
  // a setting moved away from its measured value names itself in the accent
  const title = `text-[13.5px] font-semibold ${!measured && hasReference ? 'text-acc' : ''}`

  if (item.type === 'bool') {
    return (
      <div className={classes} data-rg data-id={item.id}>
        <label className="flex cursor-pointer items-center gap-[8px] text-[13.5px]">
          <input
            className={`w-auto ${inert ? 'pointer-events-none' : ''}`}
            type="checkbox"
            id={item.id}
            checked={Boolean(value)}
            disabled={disabled}
            title={disabled ? "indisponible au niveau NSFW — protège l'enchaînement automatique" : ''}
            onChange={(e) => onChange(item.id, e.target.checked)}
          />{' '}
          <b>{item.label}</b>
        </label>
        <p className={`${HELP} ml-[26px]`} data-rgq>{item.quoi}</p>
        {/* The `title` above is mouse-only: the same reason, visible, so a
            keyboard/screen-reader user gets it too (cadrage — pas seulement
            au survol). */}
        {disabled && (
          <p className={`${HELP} ml-[26px]`}>
            indisponible au niveau NSFW — protège l'enchaînement automatique
          </p>
        )}
      </div>
    )
  }

  if (item.type === 'liste') {
    return (
      <div className={classes} data-rg data-id={item.id}>
        <div className={ROW_HEAD}>
          <b className={title}>{item.label}</b>
        </div>
        <select
          className={`${FIELD}${inert ? ' pointer-events-none' : ''}`}
          id={item.id}
          value={String(value)}
          onChange={(e) => onChange(item.id, e.target.value)}
        >
          {(item.options ?? []).map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </select>
        <p className={HELP} data-rgq>{item.quoi}</p>
      </div>
    )
  }

  if (item.type === 'nombre') {
    return (
      <div className={classes} data-rg data-id={item.id}>
        <div className={ROW_HEAD}>
          <b className={title}>{item.label}</b>
        </div>
        <input
          className={`${FIELD}${inert ? ' pointer-events-none' : ''}`}
          type="number"
          id={item.id}
          min={item.min}
          max={item.max}
          placeholder={item.vide ?? ''}
          value={String(value)}
          onChange={(e) => onChange(item.id, e.target.value)}
        />
        <p className={HELP} data-rgq>{item.quoi}</p>
      </div>
    )
  }

  return (
    <div className={classes} data-rg data-id={item.id}>
      <div className={ROW_HEAD}>
        <b className={title}>{item.label}</b>
        <span className="flex-1" />
        <span className="text-[13px] font-semibold tabular-nums text-acc" id={`v_${item.id}`}>
          {fmtVal(item, value as string)}
        </span>
        <span
          className={`${BADGE_BASE} ${measured ? BADGE_ON : BADGE_OFF}`}
          id={`m_${item.id}`}
          data-mes
          data-off={measured ? undefined : '1'}
          title={`valeur mesurée du projet : ${hasReference ? fmtVal(item, reference as number) : '—'}`}
        >
          mesuré
        </span>
      </div>
      <input
        className={`${SLIDER}${inert ? ' pointer-events-none' : ''}`}
        type="range"
        id={item.id}
        min={item.min}
        max={item.max}
        step={item.pas}
        value={String(value)}
        onChange={(e) => onChange(item.id, e.target.value)}
      />
      <div className="mt-[3px] flex justify-between text-[11px] text-dim2">
        <span>{item.bas}</span>
        <span>{item.haut}</span>
      </div>
      <p className={HELP} data-rgq>
        {item.quoi}
        {item.cout && <span className="mt-[4px] block text-dim2" data-cout> {item.cout}</span>}
      </p>
    </div>
  )
}
