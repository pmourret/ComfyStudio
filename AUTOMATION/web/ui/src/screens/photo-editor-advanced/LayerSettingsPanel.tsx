/* "Colorimétrie" panel — design-pass §7b: acts on the SELECTED layer's
   `settings`, changes what it shows when the selection changes. Only the 4
   basic sliders this pass (courbes/niveaux/HSL land with their own step —
   see photoEditorLayersPixels.ts's own note on why they are not fields of
   `LayerSettings` yet). Presentational only (frontend.md). */
import { LAYER_SLIDERS, type Layer, type LayerSettings } from './photoEditorLayersPixels'

export function LayerSettingsPanel({
  layer, onChange,
}: {
  layer: Layer
  onChange: (patch: Partial<LayerSettings>) => void
}) {
  return (
    <div>
      <div className="tiny mb-[8px] uppercase tracking-[.5px] text-dim">
        Colorimétrie — {layer.name || layer.kind}
        {layer.locked && <span className="opacity-70"> (calque de base)</span>}
      </div>
      {LAYER_SLIDERS.map((slider) => (
        <div key={slider.key} className="mb-[10px]">
          <div className="mt-[10px] flex justify-between text-[12.5px] text-dim">
            <label htmlFor={slider.id}>{slider.label}</label>
            <span className="tabular-nums text-txt">{layer.settings[slider.key]}</span>
          </div>
          <input
            id={slider.id}
            type="range"
            className="mt-[2px]"
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={layer.settings[slider.key]}
            onChange={(e) => onChange({ [slider.key]: Number(e.target.value) })}
          />
        </div>
      ))}
    </div>
  )
}
