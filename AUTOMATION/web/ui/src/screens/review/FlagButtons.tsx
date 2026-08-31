/* The two realism judgements. They MEASURE, they do not sort — which is why
   they appear in both trades, and in both the tile and the full frame. */
import type { GalleryItem } from './useTriage'
import { TACT, TACT_FLAG, TACT_IDLE } from './actionStyles'

/* Realism judgement buttons: they MEASURE, they do not sort — which is why they
   stay in both trades. */
export function FlagButtons({
  item,
  onFlag,
}: {
  item: GalleryItem
  onFlag: (flag: string) => void
}) {
  return (
    <>
      <button
        data-f="ok"
        className={`${TACT} ${item.flag === 'ok' ? TACT_FLAG.ok : TACT_IDLE}`}
        title="Convaincante comme photo (C)"
        onClick={(e) => {
          e.stopPropagation()
          onFlag('ok')
        }}
      >
        ◉
      </button>
      <button
        data-f="ia"
        className={`${TACT} ${item.flag === 'ia' ? TACT_FLAG.ia : TACT_IDLE}`}
        title="Ça se voit que c'est généré (I)"
        onClick={(e) => {
          e.stopPropagation()
          onFlag('ia')
        }}
      >
        ◌
      </button>
    </>
  )
}
