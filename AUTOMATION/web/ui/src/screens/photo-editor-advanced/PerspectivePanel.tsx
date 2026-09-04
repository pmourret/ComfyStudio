/* "Recadrage avancé" — design-pass §7b: perspective horizontale/verticale
   SEULEMENT — le ratio et le redressement fin restent dans le modal
   simplifié (7a), volontairement pas dupliqués ici. Repliable
   (`<details className="adv">`, même pattern déjà établi). Presentational
   only (frontend.md): `onChange` is the one write path. */
import type { Layer, LayerSettings } from './photoEditorLayersPixels'

const ROWS: { key: 'perspH' | 'perspV'; label: string }[] = [
  { key: 'perspH', label: 'horizontale' },
  { key: 'perspV', label: 'verticale' },
]

export function PerspectivePanel({
  layer, onChange,
}: {
  layer: Layer
  onChange: (patch: Partial<LayerSettings>) => void
}) {
  const settings = layer.settings

  return (
    <details className="adv">
      <summary>Recadrage avancé</summary>
      <div className="mt-[10px]">
        {ROWS.map((row) => (
          <div key={row.key} className="mb-[8px]">
            <div className="mt-[6px] flex justify-between text-[12.5px] text-dim">
              <label htmlFor={`pe-${row.key}`}>{row.label}</label>
              <span className="tabular-nums text-txt">{settings[row.key]}°</span>
            </div>
            <input
              id={`pe-${row.key}`}
              type="range"
              className="mt-[2px]"
              min={-30}
              max={30}
              step={1}
              value={settings[row.key]}
              onChange={(e) => onChange({ [row.key]: Number(e.target.value) })}
            />
          </div>
        ))}
        {(settings.perspH !== 0 || settings.perspV !== 0) && (
          <p className="tiny opacity-70">
            les coins hors du cadre corrigé restent transparents — pas de recadrage automatique.
          </p>
        )}
      </div>
    </details>
  )
}
