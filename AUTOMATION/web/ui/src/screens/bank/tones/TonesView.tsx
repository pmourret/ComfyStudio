/* Third sub-view of the Bank — one card per tone, linking out to its own
   expression editor (`screens/expression-editor/`). Reuses the taxonomy
   already loaded app-wide (`useTaxonomy`); no route of its own. */
import { ToneCard } from './ToneCard'
import { useToneBank } from './useToneBank'

export function TonesView() {
  const { rows, loaded } = useToneBank()

  return (
    <div id="bankTones">
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <h2 className="m-0">
          Tons{' '}
          <span className="tiny" id="nTones">
            {rows.length ? `— ${rows.length}` : ''}
          </span>
        </h2>
      </div>
      <p className="tiny mt-[6px] mb-[16px]">
        Chaque ton peut régler une plage d'expression faciale (12 paramètres du
        node ComfyUI ExpressionEditor), tirée au hasard dans cette plage à
        chaque génération. Les tons eux-mêmes se déclarent dans creative.json —
        cet écran règle seulement la plage de celui qu'on choisit.
      </p>

      {!loaded ? (
        <p className="tiny">chargement…</p>
      ) : rows.length === 0 ? (
        <div className="empty rounded-card border border-line bg-panel px-[16px] py-[28px] text-[13px]">
          aucun ton déclaré pour ce personnage.
        </div>
      ) : (
        <div
          className="grid gap-[10px]"
          style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}
          id="tonesGrid"
        >
          {rows.map((tone) => (
            <ToneCard key={tone.key} tone={tone} />
          ))}
        </div>
      )}
    </div>
  )
}
