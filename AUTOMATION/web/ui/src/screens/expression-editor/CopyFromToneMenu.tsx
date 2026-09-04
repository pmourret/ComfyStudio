/* "Copier depuis…" — design pass §B3: apply another tone's already-saved
   expression range onto the one being edited here, in one gesture.
   Presentational only (frontend.md: a sub-component never calls the API) —
   `onCopy` is the one callback, the actual `applyParamsAction` write lives
   in `useExpressionEditor.ts`.

   A modal (`chrome/Dialog.tsx`, same primitive as `NewPoseModal.tsx`'s own
   template picker), not a popover: an earlier popover version (positioned
   under the trigger, `role="menu"`) measured as overlapping 6-8 of the 12
   param rows beneath it once the row height shrank — a small dropdown never
   had room for the per-tone subtitle (which params it includes) without
   running into the list it floats over. The dialog's own backdrop and
   sizing rule that problem out structurally instead of chasing pixel
   budgets. Picking a tone applies immediately and closes — this is a single
   decision, unlike `NewPoseModal`'s multi-field form, so there is no
   separate confirm step. */
import { useState } from 'react'

import { Dialog } from '../../chrome/Dialog'
import type { CopySource } from './useExpressionEditor'

export function CopyFromToneMenu({ sources, onCopy }: { sources: CopySource[]; onCopy: (sourceKey: string) => void }) {
  const [open, setOpen] = useState(false)

  if (sources.length === 0) return null

  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>
        Copier depuis…
      </button>
      <Dialog
        id="copyFromToneBox"
        open={open}
        onDismiss={() => setOpen(false)}
        className="w-[min(420px,calc(100vw-32px))] max-w-[min(420px,calc(100vw-32px))]"
        cardClassName="w-[min(420px,100%)]! p-[20px]!"
      >
        <h3 className="mb-[4px]! text-[16px]!">Copier depuis…</h3>
        <p className="tiny mb-[14px]">
          Applique la plage d'un autre ton déjà réglé sur celui-ci — un seul
          geste, un seul Ctrl+Z pour tout annuler.
        </p>
        <div className="flex flex-col gap-[6px]">
          {sources.map((source) => (
            <button
              key={source.key}
              type="button"
              className="rounded-[8px] border border-line2 bg-panel px-[12px] py-[8px] text-left text-[13px] hover:border-acc hover:bg-panel2"
              onClick={() => {
                onCopy(source.key)
                setOpen(false)
              }}
            >
              <span className="block">{source.label}</span>
              <span className="tiny block opacity-70">{source.paramLabels.join(', ')}</span>
            </button>
          ))}
        </div>
        <div className="mt-[16px]">
          <button type="button" className="link" onClick={() => setOpen(false)}>
            annuler
          </button>
        </div>
      </Dialog>
    </>
  )
}
