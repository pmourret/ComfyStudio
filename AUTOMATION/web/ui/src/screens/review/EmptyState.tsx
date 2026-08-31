/* What the grid says when it has nothing to show.

   Two different silences, and they must not read alike: an EMPTY folder is
   an outcome (« Tout est trié. »), a folder hidden by the score filter is a
   filter still on — which is why the second one offers the way out. */

const EMPTY_DONE: Record<string, string> = {
  A_REVOIR: 'Tout est trié.',
  OK: "Aucune image validée pour l'instant.",
  REJET: 'Aucun rejet.',
  ARCHIVE: 'Aucune image archivée.',
  SANS_VISAGE: 'Aucune image sans visage détecté.',
}

export function EmptyState({
  empty,
  bucket,
  total,
  onShowAll,
}: {
  empty: boolean
  bucket: string
  total: number
  onShowAll: () => void
}) {
  return (
    <div className="empty">
      <b>{empty ? EMPTY_DONE[bucket] : 'Aucune image dans cette bande de score.'}</b>
      {empty
        ? bucket === 'A_REVOIR'
          ? 'Les images dont le score sort de la bande conforme atterrissent ici après chaque batch.'
          : bucket === 'SANS_VISAGE'
            ? "Le contrôle d'identité range ici les images où aucun visage n'a été détecté : dos, plan très large, visage masqué. Elles n'ont pas de score."
            : 'Rien à afficher dans ce dossier.'
        : `${total} image(s) dans ce dossier, aucune dans cette bande.`}
      {!empty && (
        <div className="mt-[16px]">
          <button className="btn" id="btnEmptyAll" onClick={onShowAll}>
            Tout afficher
          </button>
        </div>
      )}
    </div>
  )
}

/* Realism judgement buttons: they MEASURE, they do not sort — which is why they
   stay in both trades. */
