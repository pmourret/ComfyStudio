/* "Retouche IA — maquettée, volontairement inerte" (design-pass
   screen-photo-editor.md §7b) : panneau complet (sélecteur de masque —
   MÊME composant que le flou sélectif, taille de pinceau, champ prompt),
   mais "Générer la retouche" reste PERMANENTMENT désactivé. Aucun appel
   réseau, aucun faux résultat — le bouton dit pourquoi en `data-hint-text`
   (pas `title`, CLAUDE.md §3), jamais un simple `disabled` muet.
   Presentational only (frontend.md). */
import { DEFAULT_MASK, MaskPicker } from './MaskPicker'
import type { Layer, LayerSettings, Mask } from './photoEditorLayersPixels'

const RAISON_INERTE =
  "Backend d'édition IA pas encore branché (F5.2) — l'interface est prête à recevoir le résultat"

export function AiRetouchPanel({
  layer, onChange, editingMask, onToggleMaskEdit,
}: {
  layer: Layer
  onChange: (patch: Partial<LayerSettings>) => void
  editingMask: boolean
  onToggleMaskEdit: () => void
}) {
  const settings = layer.settings
  const mask = settings.aiMask ?? DEFAULT_MASK

  return (
    <details className="adv">
      <summary>
        Retouche IA <span className="tiny rounded-[4px] bg-panel2 px-[6px] py-[1px] align-middle text-dim">bientôt</span>
      </summary>
      <div className="mt-[10px] flex flex-col gap-[14px]">
        <MaskPicker
          mask={mask}
          onChange={(next: Mask) => onChange({ aiMask: next })}
          editing={editingMask}
          onToggleEditing={onToggleMaskEdit}
        />

        <div>
          <div className="flex justify-between text-[12.5px] text-dim">
            <label htmlFor="pe-ai-brush">taille du pinceau IA</label>
            <span className="tabular-nums text-txt">{Math.round(settings.aiBrushSize * 100)}</span>
          </div>
          <input
            id="pe-ai-brush"
            type="range"
            className="mt-[2px]"
            min={1}
            max={30}
            step={1}
            value={Math.round(settings.aiBrushSize * 100)}
            onChange={(e) => onChange({ aiBrushSize: Number(e.target.value) / 100 })}
          />
        </div>

        <div>
          <label className="mb-[4px] block text-[12.5px] text-dim" htmlFor="pe-ai-prompt">
            instruction
          </label>
          <textarea
            id="pe-ai-prompt"
            rows={3}
            className="w-full resize-none"
            placeholder="ex : retirer la tache sur le mur"
            value={settings.aiPrompt}
            onChange={(e) => onChange({ aiPrompt: e.target.value })}
          />
        </div>

        <button
          type="button"
          className="btn primary sm w-full"
          disabled
          data-hint-text={RAISON_INERTE}
        >
          Générer la retouche
        </button>
      </div>
    </details>
  )
}
