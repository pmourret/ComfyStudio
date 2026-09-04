/* "Masquage à la Lightroom" — design-pass §7b: sélecteur à 6 modes,
   PARTAGÉ par le flou sélectif ET la retouche IA (même composant, deux
   appelants). Presentational only (frontend.md) — le placement réel sur
   l'aperçu (pinceau/dégradé/radial) est piloté par le parent via
   `editing`/`onToggleEditing`, les gestes de glisser eux-mêmes vivent dans
   `PhotoEditorAdvancedScreen.tsx` (qui possède le canvas). */
import type { Mask, MaskMode } from './photoEditorLayersPixels'

export const DEFAULT_MASK: Mask = {
  mode: 'pinceau', brushRadius: 0.05, strokes: [], gradient: null, radial: null,
}

const MODES: { key: MaskMode; label: string; inert?: boolean }[] = [
  { key: 'sujet', label: 'Sujet', inert: true },
  { key: 'ciel', label: 'Ciel', inert: true },
  { key: 'arriere-plan', label: 'Arrière-plan', inert: true },
  { key: 'pinceau', label: 'Pinceau' },
  { key: 'degrade', label: 'Dégradé' },
  { key: 'radial', label: 'Radial' },
]

const PLACEABLE: MaskMode[] = ['pinceau', 'degrade', 'radial']

export function MaskPicker({
  mask, onChange, editing, onToggleEditing,
}: {
  mask: Mask
  onChange: (mask: Mask) => void
  editing: boolean
  onToggleEditing: () => void
}) {
  return (
    <div>
      <div className="tiny mb-[6px] uppercase tracking-[.5px] text-dim">Masque</div>
      <div className="grid grid-cols-3 gap-[4px]" role="radiogroup" aria-label="Mode de masquage">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={mask.mode === m.key}
            disabled={m.inert}
            data-hint-text={m.inert ? 'Détection automatique — backend de segmentation pas encore branché' : undefined}
            className={`btn sm !px-[6px] text-[11px]${mask.mode === m.key ? ' bg-acc border-acc! text-on-acc font-semibold' : ''}`}
            onClick={() => onChange({ ...mask, mode: m.key })}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mask.mode === 'pinceau' && (
        <div className="mt-[8px]">
          <div className="flex justify-between text-[12.5px] text-dim">
            <label htmlFor="pe-brush-radius">rayon du pinceau</label>
            <span className="tabular-nums text-txt">{Math.round(mask.brushRadius * 100)}</span>
          </div>
          <input
            id="pe-brush-radius"
            type="range"
            className="mt-[2px]"
            min={1}
            max={30}
            step={1}
            value={Math.round(mask.brushRadius * 100)}
            onChange={(e) => onChange({ ...mask, brushRadius: Number(e.target.value) / 100 })}
          />
        </div>
      )}
      {(mask.mode === 'degrade' || mask.mode === 'radial') && (
        <p className="tiny mt-[6px] opacity-70">
          {mask.mode === 'degrade' ? 'glisser sur l’aperçu pour placer le dégradé.' : 'glisser depuis le centre sur l’aperçu pour placer le radial.'}
        </p>
      )}

      <div className="mt-[8px] flex flex-wrap gap-[6px]">
        <button
          type="button"
          className={`btn sm${editing ? ' bg-acc border-acc! text-on-acc font-semibold' : ''}`}
          disabled={!PLACEABLE.includes(mask.mode)}
          onClick={onToggleEditing}
        >
          {editing ? 'Terminé' : 'Modifier sur l’aperçu'}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => onChange({ ...mask, strokes: [], gradient: null, radial: null })}
        >
          effacer le masque
        </button>
      </div>
    </div>
  )
}
