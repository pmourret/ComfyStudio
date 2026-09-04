/* "+ Ajouter un calque" — design-pass §7b: a menu of 3 kinds (réglage /
   image / retouche). A modal (`chrome/Dialog.tsx`), not a popover — the
   same choice `CopyFromToneMenu.tsx` made after measuring an EARLIER
   popover version overlapping the list it floated over in a narrow aside;
   this panel is narrower still (220px), so the same trap applies before
   it is even built. Presentational only (frontend.md): `onAdd` is the one
   callback, the actual history-grouped write lives in
   usePhotoEditorAdvanced.ts. */
import { useState } from 'react'

import { Dialog } from '../../chrome/Dialog'
import type { LayerKind } from './photoEditorLayersPixels'

const KINDS: { kind: LayerKind; label: string; hint: string }[] = [
  { kind: 'reglage', label: 'Réglage', hint: 'Colorimétrie appliquée seule, sans image propre' },
  { kind: 'image', label: 'Image', hint: 'Un asset importé, composité par-dessus' },
  { kind: 'retouche', label: 'Retouche', hint: 'Contenu généré (IA), composité par-dessus' },
]

export function AddLayerMenu({ onAdd }: { onAdd: (kind: LayerKind, label: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className="btn sm w-full" onClick={() => setOpen(true)}>
        + Ajouter un calque
      </button>
      <Dialog
        id="addLayerBox"
        open={open}
        onDismiss={() => setOpen(false)}
        className="w-[min(380px,calc(100vw-32px))] max-w-[min(380px,calc(100vw-32px))]"
        cardClassName="w-[min(380px,100%)]! p-[20px]!"
      >
        <h3 className="mb-[14px]! text-[16px]!">Ajouter un calque</h3>
        <div className="flex flex-col gap-[6px]" role="menu">
          {KINDS.map((entry) => (
            <button
              key={entry.kind}
              type="button"
              role="menuitem"
              className="rounded-[8px] border border-line2 bg-panel px-[12px] py-[8px] text-left text-[13px] hover:border-acc hover:bg-panel2"
              onClick={() => {
                onAdd(entry.kind, entry.label)
                setOpen(false)
              }}
            >
              <span className="block">{entry.label}</span>
              <span className="tiny block opacity-70">{entry.hint}</span>
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
