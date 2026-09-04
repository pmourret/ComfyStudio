/* "Préréglages" tab — design-pass §7b: applied to the SELECTED layer in one
   grouped history step, replaces the earlier "Filtres" idea. Presentational
   only (frontend.md). */
import { PRESETS } from './photoEditorLayersPixels'

export function PresetsPanel({ onApply }: { onApply: (presetId: string) => void }) {
  return (
    <div className="flex flex-col gap-[4px]" data-presets>
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="rounded-[8px] border border-line2 bg-panel px-[10px] py-[7px] text-left text-[13px] hover:border-acc hover:bg-panel2"
          onClick={() => onApply(preset.id)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}
