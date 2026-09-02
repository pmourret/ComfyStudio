/* Shared by the modal and the dedicated screen — both sit on the same
   usePoseEditor history, so the buttons themselves carry no logic beyond
   the two callbacks. Ctrl/Cmd+Z and +Shift+Z (or +Y) do the same thing from
   PoseCanvas itself; these exist for discoverability and for reaching undo
   without the canvas holding focus.

   `data-hint-text`, not `title`: the studio's own tooltip (chrome/HintLayer,
   mounted once in Shell.tsx) already shows on hover AND keyboard focus,
   closes on Escape, and wires `aria-describedby` itself — a native `title`
   gets none of that (audit finding, 2026-09-02). */
export function UndoRedoButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  return (
    <div className="flex items-center gap-[4px]">
      <button
        type="button"
        className="btn sm"
        aria-label="Annuler"
        data-hint-text="Annuler (Ctrl+Z)"
        disabled={!canUndo}
        onClick={onUndo}
      >
        ↶
      </button>
      <button
        type="button"
        className="btn sm"
        aria-label="Rétablir"
        data-hint-text="Rétablir (Ctrl+Maj+Z)"
        disabled={!canRedo}
        onClick={onRedo}
      >
        ↷
      </button>
    </div>
  )
}
