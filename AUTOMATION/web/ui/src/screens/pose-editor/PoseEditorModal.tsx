/* Same editor as PoseEditorScreen, in a Dialog — opened from the scene
   composer's Pose tab for a quick in-context tweak, no navigation away from
   the scene being edited. Props/Dialog usage mirror PhotoEditor.tsx exactly
   (`open`, `onDismiss`, `initialFocus`, `className`/`cardClassName`).

   KNOWN ROUGH EDGE: overwriting a pose IN PLACE changes its PNG's bytes
   under the same file name, and `/img/pose` carries no cache-busting token
   (unlike `/img`'s own `v`, added for exactly this reason once the same
   need existed for character images). A thumbnail already painted
   elsewhere on the page (the composer's own pose grid, `PosesView`) may
   keep showing the pre-edit render until the page reloads or that `<img>`
   remounts. Not fixed here: no caller needs it yet, and adding a `v` param
   with nothing on either end passing one would be exactly the kind of
   speculative plumbing this project avoids — revisit if it turns out to
   matter in practice. */
import { Dialog } from '../../chrome/Dialog'
import { useToast } from '../../chrome/ToastContext'
import { PoseCanvas } from './PoseCanvas'
import { usePoseEditor, type PoseEditorSource } from './usePoseEditor'

export function PoseEditorModal({
  source,
  onClose,
  onSaved,
}: {
  source: PoseEditorSource
  onClose: () => void
  /** Called with the name actually written — same as `source`'s name on a
      plain overwrite, a fresh one otherwise. */
  onSaved: (name: string) => void
}) {
  const { pose, loading, loadError, saving, dirty, update, save } = usePoseEditor(source)
  const toast = useToast()

  const onSave = async () => {
    const result = await save()
    if (!result.ok) {
      toast(result.erreur)
      return
    }
    onSaved(result.name)
  }

  return (
    <Dialog
      id="poseEditorModal"
      open
      onDismiss={onClose}
      initialFocus="#poseModalClose"
      className="w-[min(900px,calc(100vw-32px))]"
      cardClassName="w-[min(900px,100%)]!"
    >
      <div className="mb-[12px] flex items-center justify-between">
        <h3 className="m-0">Éditeur de pose</h3>
        <button id="poseModalClose" type="button" className="link" onClick={onClose}>
          fermer
        </button>
      </div>
      {loading && <p className="tiny">chargement…</p>}
      {loadError && (
        <div className="empty rounded-card border border-line bg-panel px-[16px] py-[28px] text-[13px]">
          {loadError}
        </div>
      )}
      {pose && (
        <>
          <div className="h-[480px]">
            <PoseCanvas pose={pose} onChange={update} />
          </div>
          <div className="mt-[12px] flex items-center gap-[12px]">
            <button className="btn primary" disabled={saving} onClick={() => void onSave()}>
              Enregistrer
            </button>
            {dirty && <span className="tiny">modifications non enregistrées</span>}
          </div>
        </>
      )}
    </Dialog>
  )
}
