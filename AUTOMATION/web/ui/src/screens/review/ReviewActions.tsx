/* The action column of the full frame — one set per trade.

   In the Galerie the four sorting gestures are ABSENT, not greyed out: they
   make no sense on an image already kept, and an inert button would suggest
   otherwise. */

/* Downloading is an <a download> on /img — the route that already serves those
   bytes, bound to the character (isolation of 29/08): no new API to copy a file
   the browser knows how to save on its own.

   « Poster sur Instagram » is INERT and says so: the destination exists in this
   pack's trade, not yet in the code. An absent button would suggest the question
   is not asked; an active one would lie. */
export function GalleryActions({ src, onAct }: { src: string; onAct: (action: string) => void }) {
  return (
    <>
      {/* `dl` used to ride along here too, and painted nothing: that rule is
          scoped to the tile row. */}
      <a className="btn primary col-span-full" download href={src}>
        ⤓ Télécharger
      </a>
      <button
        className="btn col-span-full"
        id="btnInsta"
        disabled
        title="Poster sur Instagram — pas encore branché"
      >
        {/* inert, and it SAYS why under its label — a disabled button with no
            readable reason reads as a breakdown */}
        Poster sur Instagram{' '}
        <span className="tiny mt-[2px] block font-normal">pas encore branché</span>
      </button>
      <button className="btn col-span-full" data-a="skip" onClick={() => onAct('skip')}>
        Suivante <span className="kbd">→</span>
      </button>
    </>
  )
}

export function ReviewActions({
  bucket,
  space,
  onAct,
}: {
  bucket?: string
  space?: string
  onAct: (action: string) => void
}) {
  const button = (action: string, label: string, key?: string, wide = false, primary = false) => (
    <button
      className={`btn${wide ? ' col-span-full' : ''}${primary ? ' primary' : ''}`}
      data-a={action}
      onClick={() => onAct(action)}
    >
      {label} {key && <span className="kbd">{key}</span>}
    </button>
  )
  // decline restarts from the SFW journal: no meaning for an NSFW image
  const decline =
    space === 'nsfw' ? null : (
      <button className="btn col-span-full" data-a="decliner" onClick={() => onAct('decliner')}>
        ⟳ Décliner <span className="kbd">D</span>
      </button>
    )
  const skip = button('skip', 'Suivante', '→', true)

  if (bucket === 'OK')
    return (
      <>
        {decline}
        {skip}
        {button('archiver', 'Archiver', 'A')}
        {button('rejeter', 'Rejeter', 'X')}
      </>
    )
  if (bucket === 'REJET')
    return (
      <>
        {button('valider', 'Restaurer', 'V', true, true)}
        {button('archiver', 'Archiver', 'A')}
        {skip}
      </>
    )
  if (bucket === 'ARCHIVE')
    return (
      <>
        {button('valider', 'Restaurer', 'V', true, true)}
        {button('rejeter', 'Rejeter', 'X')}
        {skip}
      </>
    )
  return (
    <>
      {button('valider', 'Valider', 'V', true, true)}
      {decline}
      {button('rejeter', 'Rejeter', 'X')}
      {button('archiver', 'Archiver', 'A')}
      {skip}
    </>
  )
}
