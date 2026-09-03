/* The "Fiche en construction" panel — a read-only mirror of the wizard's
   choices so far, always visible instead of buried in the launch bar's
   summary text (screen-1-wizard design pass). Same sticky positioning as
   Produire's `Inspector` (the pattern this screen reuses — DESIGN.md's own
   `.cr-main`/`.cr-side` names describe the pre-Tailwind sheet and no longer
   match any real class in the React build).

   Pure presentation: props only, no API call (frontend.md — a sub-component
   never calls the API) — WizardScreen resolves ids to labels before handing
   them down. Never a Tab stop: this is a reading surface, not a control. */
const FIELD =
  'flex items-center justify-between gap-[10px] py-[8px] border-b border-line last:border-b-0'
const LABEL = 'text-[11.5px] uppercase tracking-[.5px] text-dim'
const VALUE = 'text-[13px] text-txt text-right'
const PLACEHOLDER = 'text-[13px] text-dim2 text-right'

function Field({ label, value, field }: { label: string; value: string | null; field: string }) {
  return (
    <div className={FIELD}>
      <span className={LABEL}>{label}</span>
      <span className={value ? VALUE : PLACEHOLDER} data-field={field}>
        {value ?? '—'}
      </span>
    </div>
  )
}

export function BuildSheetPanel({
  name,
  cid,
  typeLabel,
  styleLabel,
  worldLabel,
  frozenBase,
  basePreview,
}: {
  name: string
  cid: string
  typeLabel: string | null
  styleLabel: string | null
  worldLabel: string | null
  frozenBase: string | null
  basePreview: string
}) {
  return (
    <aside
      className="sticky top-[12px] max-h-[calc(100vh-150px)] overflow-auto
                 rounded-card border border-line bg-panel p-[16px]"
      aria-label="Fiche en construction"
    >
      <h3 className="mt-0 mb-[12px] text-[11.5px] uppercase tracking-[.5px] text-dim">
        Fiche en construction
      </h3>
      <Field label="Nom" value={name.trim() || null} field="name" />
      <Field label="Identifiant" value={cid || null} field="cid" />
      <Field label="Type" value={typeLabel} field="type" />
      <Field label="Style" value={styleLabel} field="style" />
      <Field label="Monde" value={worldLabel} field="world" />
      <div className={FIELD}>
        <span className={LABEL}>Base</span>
        {frozenBase ? (
          <img
            className="h-[60px] w-[60px] rounded-card border-2 border-acc object-cover"
            alt="base d'identité"
            src={basePreview}
            data-field="base"
          />
        ) : (
          <span
            className="block h-[60px] w-[60px] rounded-card border border-dashed border-line"
            data-field="base"
          />
        )}
      </div>
    </aside>
  )
}
