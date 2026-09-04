/* The layer stack — design-pass §7b: always visible, never an accordion.
   Presentational only (frontend.md): every gesture is a callback, the
   actual history-grouped writes live in usePhotoEditorAdvanced.ts.

   Rendered TOP TO BOTTOM in the same order the array already carries it —
   `layers[0]` is the frontmost layer, the locked `photo` base is always
   last (see photoEditorLayersPixels.ts's own ordering note), so the list
   reads exactly like the stack it represents. */
import { AddLayerMenu } from './AddLayerMenu'
import type { Layer, LayerKind } from './photoEditorLayersPixels'

/* 24×24 CSS px minimum (WCAG 2.2 SC 2.5.8, AA — frontend.md's own
   target). A first pass sized these to the glyph alone (`p-0`, measured
   11-18px) — found by measuring the real DOM in the end-of-chantier audit,
   not by reading the JSX, against `UndoRedoButtons.tsx`'s own icon
   buttons (35×34px) as the established comparison. */
const ICON_BTN =
  'flex h-[24px] w-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] ' +
  'border-0 bg-transparent text-[13px] leading-none text-dim hover:bg-panel2 hover:text-txt ' +
  'disabled:opacity-30 disabled:hover:bg-transparent'

export function LayerList({
  layers, selectedLayerId, onSelect, onAdd, onRemove, onToggleVisible, onOpacity, onReorder,
}: {
  layers: readonly Layer[]
  selectedLayerId: string
  onSelect: (id: string) => void
  onAdd: (kind: LayerKind, label: string) => void
  onRemove: (id: string) => void
  onToggleVisible: (id: string) => void
  onOpacity: (id: string, value: number) => void
  onReorder: (id: string, direction: 'up' | 'down') => void
}) {
  return (
    <div>
      <div className="mb-[8px] flex items-center justify-between">
        <div className="tiny uppercase tracking-[.5px] text-dim">Calques</div>
      </div>
      <ul className="flex flex-col gap-[4px]" data-layer-list>
        {layers.map((layer, index) => {
          const selected = layer.id === selectedLayerId
          return (
            <li
              key={layer.id}
              data-layer={layer.id}
              data-layer-kind={layer.kind}
              className="rounded-[8px] border px-[8px] py-[6px]"
              style={{
                borderColor: selected ? 'var(--acc)' : 'var(--line2)',
                background: selected ? 'var(--panel2)' : 'var(--panel)',
              }}
            >
              <div className="flex items-center gap-[6px]">
                <button
                  type="button"
                  className={ICON_BTN}
                  aria-label={layer.visible ? 'Masquer le calque' : 'Afficher le calque'}
                  data-hint-text={layer.visible ? 'Masquer' : 'Afficher'}
                  onClick={() => onToggleVisible(layer.id)}
                  disabled={layer.locked}
                >
                  {layer.visible ? '◉' : '◌'}
                </button>
                <button
                  type="button"
                  className="flex min-h-[24px] min-w-0 flex-1 items-center gap-[6px] truncate border-0 bg-transparent p-0 text-left text-[13px]"
                  onClick={() => onSelect(layer.id)}
                  aria-pressed={selected}
                >
                  <span className="truncate">{layer.name || layer.kind}</span>
                  {/* No up/down/delete on this row already SAYS locked —
                      but only after noticing their absence. A visible
                      reason costs one small tag (audit finding: nothing
                      in the list itself explained why, only the
                      Colorimétrie panel did, and only once selected). */}
                  {layer.locked && <span className="tiny shrink-0 opacity-60">verrouillé</span>}
                </button>
                <div className="flex shrink-0 items-center gap-[2px]">
                  <button
                    type="button"
                    className={ICON_BTN}
                    aria-label="Monter le calque"
                    data-hint-text="Monter"
                    disabled={layer.locked || index === 0 || layers[index - 1]?.locked}
                    onClick={() => onReorder(layer.id, 'up')}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={ICON_BTN}
                    aria-label="Descendre le calque"
                    data-hint-text="Descendre"
                    disabled={layer.locked || layers[index + 1]?.locked}
                    onClick={() => onReorder(layer.id, 'down')}
                  >
                    ↓
                  </button>
                  {!layer.locked && (
                    <button
                      type="button"
                      className={`${ICON_BTN} hover:text-danger-txt`}
                      aria-label="Supprimer le calque"
                      data-hint-text="Supprimer"
                      onClick={() => onRemove(layer.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              {!layer.locked && (
                <div className="mt-[4px] flex items-center gap-[6px] pl-[20px]">
                  <label htmlFor={`opacity-${layer.id}`} className="tiny shrink-0 opacity-70">
                    opacité
                  </label>
                  <input
                    id={`opacity-${layer.id}`}
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={layer.opacity}
                    onChange={(e) => onOpacity(layer.id, Number(e.target.value))}
                    className="min-w-0 flex-1"
                  />
                  <span className="tiny w-[28px] shrink-0 text-right tabular-nums">{layer.opacity}</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-[10px]">
        <AddLayerMenu onAdd={onAdd} />
      </div>
    </div>
  )
}
