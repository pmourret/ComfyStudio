/* Permanent banner while scenes.json has pending changes.

   A toast does not do: it disappears, and the scene then becomes
   indistinguishable from a saved one — until production refuses to see it. The
   banner stays until the save, and it carries the save. */
import { useToast } from './ToastContext'
import { useScenes } from '../state/ScenesStoreContext'

export function DirtyBar() {
  const { dirty, save } = useScenes()
  const toast = useToast()
  if (!dirty) return null

  return (
    <div id="dirtyBar" role="status">
      <b>Modifications non enregistrées</b>
      <span>
        des scènes existent seulement dans cette page — elles seront perdues au
        rechargement, et la production ne les voit pas.
      </span>
      <div className="spacer" style={{ flex: 1 }} />
      <button
        className="btn sm"
        id="btnDirtySave"
        onClick={async () => {
          const result = await save()
          toast(result.ok ? 'scenes.json enregistré' : result.erreur || "échec de l'enregistrement")
        }}
      >
        Enregistrer maintenant
      </button>
    </div>
  )
}
