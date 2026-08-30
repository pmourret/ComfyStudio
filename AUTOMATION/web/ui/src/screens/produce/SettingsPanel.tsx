/* The generation settings panel, opened by the gear of the launch bar AND by the
   rail. Two buttons, ONE state — not a second settings surface that could drift
   from this one.

   The « mesuré » badge lights when the value is the one from config.json, and a
   counter in the panel head says how far one has moved from the validated
   values. That is the whole point: one sees at a glance how far one has gone.

   Ported from `renderReglages` / `majAffichage` in `static/create.js`. */
import { useMemo } from 'react'

import { BY_ID, PRESETS, SECTIONS, fmtVal, type Setting } from './settings'

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
}) {
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
    <div id="gearPanel" className={open ? 'on' : undefined}>
      <div className="gh">
        <h3>Réglages</h3>
        <div className="spacer" style={{ flex: 1 }} />
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
      <p className="gintro">
        Chaque réglage dit ce qu'il fait et ce qu'il coûte. Les valeurs marquées{' '}
        <b className="mes">mesuré</b> sont celles validées par les tests du projet :
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
              <section className="rgs" data-niveau={section.niveau ?? ''} key={section.titre}>
                <h4>{section.titre}</h4>
                {body}
              </section>
            )
          }
          const deviations = bySection[section.titre] ?? 0
          return (
            <section className="rgs pli" data-niveau={section.niveau ?? ''} key={section.titre}>
              <details>
                <summary>
                  <h4>{section.titre}</h4>
                  <span
                    className={`ecart${deviations ? ' on' : ''}`}
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
  const classes = ['rg', item.type === 'bool' ? 'b' : '', !measured && hasReference ? 'modif' : '', inert ? 'inerte' : '']
    .filter(Boolean)
    .join(' ')

  if (item.type === 'bool') {
    return (
      <div className={classes} data-id={item.id}>
        <label className="check">
          <input
            type="checkbox"
            id={item.id}
            checked={Boolean(value)}
            disabled={disabled}
            title={disabled ? "indisponible au niveau NSFW — protège l'enchaînement automatique" : ''}
            onChange={(e) => onChange(item.id, e.target.checked)}
          />{' '}
          <b>{item.label}</b>
        </label>
        <p className="rgq">{item.quoi}</p>
      </div>
    )
  }

  if (item.type === 'liste') {
    return (
      <div className={classes} data-id={item.id}>
        <div className="rgh">
          <b>{item.label}</b>
        </div>
        <select id={item.id} value={String(value)} onChange={(e) => onChange(item.id, e.target.value)}>
          {(item.options ?? []).map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </select>
        <p className="rgq">{item.quoi}</p>
      </div>
    )
  }

  if (item.type === 'nombre') {
    return (
      <div className={classes} data-id={item.id}>
        <div className="rgh">
          <b>{item.label}</b>
        </div>
        <input
          type="number"
          id={item.id}
          min={item.min}
          max={item.max}
          placeholder={item.vide ?? ''}
          value={String(value)}
          onChange={(e) => onChange(item.id, e.target.value)}
        />
        <p className="rgq">{item.quoi}</p>
      </div>
    )
  }

  return (
    <div className={classes} data-id={item.id}>
      <div className="rgh">
        <b>{item.label}</b>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="rgv" id={`v_${item.id}`}>
          {fmtVal(item, value as string)}
        </span>
        <span
          className={`mes${measured ? '' : ' off'}`}
          id={`m_${item.id}`}
          title={`valeur mesurée du projet : ${hasReference ? fmtVal(item, reference as number) : '—'}`}
        >
          mesuré
        </span>
      </div>
      <input
        type="range"
        id={item.id}
        min={item.min}
        max={item.max}
        step={item.pas}
        value={String(value)}
        onChange={(e) => onChange(item.id, e.target.value)}
      />
      <div className="rge">
        <span>{item.bas}</span>
        <span>{item.haut}</span>
      </div>
      <p className="rgq">
        {item.quoi}
        {item.cout && <span className="cout"> {item.cout}</span>}
      </p>
    </div>
  )
}
