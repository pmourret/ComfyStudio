/* "Historique" tab — design-pass §7b: "liste des actions structurantes
   (ajout/suppression de calque, préréglage appliqué), clic = retour à cet
   état". A FILTERED view of the full undo/redo array (coalesced slider
   drags still step through with Ctrl+Z, they just never get their own row
   here) — see usePhotoEditorAdvanced.ts's own note on `structural`.
   Presentational only (frontend.md): each row's real index is what
   `onJump` receives, so a click lands on the exact entry shown. */
type HistoryEntry = { label: string; structural: boolean }

export function HistoryPanel({
  history, cursor, onJump,
}: {
  history: readonly HistoryEntry[]
  cursor: number
  onJump: (index: number) => void
}) {
  return (
    <ul className="flex flex-col gap-[2px]" data-history>
      {history.map((entry, index) =>
        entry.structural ? (
          <li key={index}>
            <button
              type="button"
              className="w-full rounded-[6px] border-0 px-[8px] py-[5px] text-left text-[13px]"
              style={{
                background: index === cursor ? 'var(--panel2)' : 'transparent',
                color: index === cursor ? 'var(--txt)' : 'var(--dim)',
                fontWeight: index === cursor ? 600 : 400,
              }}
              aria-current={index === cursor}
              onClick={() => onJump(index)}
            >
              {entry.label}
            </button>
          </li>
        ) : null,
      )}
    </ul>
  )
}
