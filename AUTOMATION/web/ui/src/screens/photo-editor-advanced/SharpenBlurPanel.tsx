/* "Netteté / flou sélectif" — design-pass §7b. Presentational only
   (frontend.md): `onChange` writes settings, `editing`/`onToggleMaskEdit`
   are lifted to the Screen because on-canvas mask placement needs the
   preview canvas, which this panel does not own. */
import { DEFAULT_MASK, MaskPicker } from './MaskPicker'
import type { Layer, LayerSettings, Mask } from './photoEditorLayersPixels'

export function SharpenBlurPanel({
  layer, onChange, editingMask, onToggleMaskEdit,
}: {
  layer: Layer
  onChange: (patch: Partial<LayerSettings>) => void
  editingMask: boolean
  onToggleMaskEdit: () => void
}) {
  const settings = layer.settings
  const mask = settings.blurMask ?? DEFAULT_MASK

  return (
    <details className="adv">
      <summary>Netteté / flou sélectif</summary>
      <div className="mt-[10px] flex flex-col gap-[14px]">
        <div>
          <div className="flex justify-between text-[12.5px] text-dim">
            <label htmlFor="pe-sharpen">netteté</label>
            <span className="tabular-nums text-txt">{settings.sharpen}</span>
          </div>
          <input
            id="pe-sharpen"
            type="range"
            className="mt-[2px]"
            min={0}
            max={100}
            step={1}
            value={settings.sharpen}
            onChange={(e) => onChange({ sharpen: Number(e.target.value) })}
          />
        </div>

        <div>
          <label className="flex items-center gap-[6px] text-[12.5px]">
            <input
              type="checkbox"
              className="w-auto shrink-0"
              checked={settings.blurOn}
              onChange={(e) => onChange({ blurOn: e.target.checked, blurMask: settings.blurMask ?? DEFAULT_MASK })}
            />
            flou sélectif
          </label>
          {settings.blurOn && (
            <div className="mt-[10px] flex flex-col gap-[10px]">
              <div>
                <div className="flex justify-between text-[12.5px] text-dim">
                  <label htmlFor="pe-blur-radius">rayon</label>
                  <span className="tabular-nums text-txt">{Math.round(settings.blurRadius * 100)}</span>
                </div>
                <input
                  id="pe-blur-radius"
                  type="range"
                  className="mt-[2px]"
                  min={1}
                  max={20}
                  step={1}
                  value={Math.round(settings.blurRadius * 100)}
                  onChange={(e) => onChange({ blurRadius: Number(e.target.value) / 100 })}
                />
              </div>
              <div>
                <div className="flex justify-between text-[12.5px] text-dim">
                  <label htmlFor="pe-blur-strength">force</label>
                  <span className="tabular-nums text-txt">{settings.blurStrength}</span>
                </div>
                <input
                  id="pe-blur-strength"
                  type="range"
                  className="mt-[2px]"
                  min={0}
                  max={100}
                  step={1}
                  value={settings.blurStrength}
                  onChange={(e) => onChange({ blurStrength: Number(e.target.value) })}
                />
              </div>
              <MaskPicker
                mask={mask}
                onChange={(next: Mask) => onChange({ blurMask: next })}
                editing={editingMask}
                onToggleEditing={onToggleMaskEdit}
              />
            </div>
          )}
        </div>
      </div>
    </details>
  )
}
