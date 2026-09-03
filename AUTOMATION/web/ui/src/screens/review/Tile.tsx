/* One image of the grid: thumbnail, score, sub-scores, action row.

   It decides NOTHING — every gesture is a callback handed down by the screen.
   What it does own is the aimed-at marker: without it, V/X/A sorted the first
   image of the list with nothing on screen to say so. */
import { ScoreBars } from './ScoreBars'
import { FlagButtons } from './FlagButtons'
import { TACT, TACT_IDLE } from './actionStyles'
import { scoreClass, type GalleryItem, type Trade } from './useTriage'

/* The score pill. `none` — no measurement — is the only one that also changes
   its text colour, which is why no colour sits in the base. */
const CHIP =
  'pointer-events-none absolute top-[8px] left-[8px] rounded-[11px] px-[9px] py-[2px]' +
  ' text-[12.5px] font-bold tabular-nums [box-shadow:0_2px_8px_#0006]'
const CHIP_TINT: Record<string, string> = {
  high: 'bg-high text-bg',
  ok: 'bg-ok text-bg',
  warn: 'bg-warn text-bg',
  bad: 'bg-bad text-bg',
  none: 'bg-line2 text-dim',
}


export function Tile(props: {
  item: GalleryItem
  index: number
  current: boolean
  trade: Trade
  qc: { ok: number; watch: number; high: number }
  bands: Record<string, unknown>
  items: GalleryItem[]
  src: string
  fullSrc: string
  selected: boolean
  onSelectClick: (name: string, index: number, event: { shiftKey: boolean }) => void
  onAim: () => void
  onOpen: () => void
  onAct: (action: string) => void
  onFlag: (flag: string) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { item, qc } = props
  return (
    <div
      /* Image aimed at by the keyboard. Without this marker, V/X/A sorted the
         first image of the list with nothing on screen to say so. */
      className={`relative overflow-hidden rounded-[9px] border bg-panel ${
        item.flag === 'ia' ? 'opacity-[.62] ' : ''
      }${props.current ? 'border-acc [box-shadow:0_0_0_2px_var(--acc)]' : 'border-line'}`}
      data-tile
      data-cur={props.current ? '1' : undefined}
      aria-current={props.current ? 'true' : undefined}
      data-k={props.index}
      onMouseDown={(event) => {
        // the action buttons and the selection checkbox place the cursor
        // (or the selection) themselves
        if ((event.target as HTMLElement).closest('[data-tacts]')) return
        if ((event.target as HTMLElement).closest('[data-select]')) return
        props.onAim()
      }}
    >
      {/* Selection checkbox (design-pass screen-5, §D/§B) — feeds both the
          bulk action bar and Comparer mode. Same corner as the score chip,
          "par-dessus" it (drawn after, in DOM order — genuine layering, not
          a coincidence): a sibling of the thumbnail button, never nested
          inside it (a checkbox inside a button is invalid HTML and breaks
          screen-reader semantics). */}
      <input
        type="checkbox"
        data-select
        checked={props.selected}
        aria-label={`Sélectionner ${item.scene || item.name} pour comparer`}
        className="absolute top-[6px] left-[6px] z-[1] h-[16px] w-[16px] cursor-pointer
                   accent-acc [box-shadow:0_0_0_2px_#00000099]"
        onChange={() => {}}
        onClick={(event) => {
          event.stopPropagation()
          props.onSelectClick(item.name, props.index, { shiftKey: event.shiftKey })
        }}
      />
      {/* clickable thumbnail: a <button>, for keyboard access to the full frame.
          The ring lands on a PHOTO, of which we know nothing: the dark halo gives
          it a constant ground, without which it vanishes on a light image. */}
      <button
        type="button"
        className="block w-full cursor-zoom-in [border:0] bg-transparent p-0
                   focus-visible:[box-shadow:0_0_0_4px_var(--scrim)]
                   focus-visible:outline-offset-[-2px]"
        data-thumb
        data-k={props.index}
        title="Ouvrir en grand"
        onClick={props.onOpen}
      >
        <img
          className="block aspect-[4/5] w-full cursor-zoom-in bg-[#0f1114] object-cover"
          loading="lazy"
          src={props.src}
          alt=""
        />
      </button>
      <div
        className={`${CHIP} ${CHIP_TINT[scoreClass(item.score, qc)]}${
          item.flag === 'ia' ? ' [filter:saturate(.4)]' : ''
        }`}
      >
        {item.score ? Number.parseFloat(item.score).toFixed(2) : '—'}
      </div>
      <div className="px-[10px] py-[8px] text-[12px] text-dim">
        <b className="text-[12.5px] text-txt">{item.scene || item.name}</b>
        <br />
        {item.format || ''} · {item.date}
      </div>
      {item.nettete == null ? (
        <div className="px-[10px] py-[6px] text-[10.5px] text-dim2">réalisme non mesuré</div>
      ) : (
        <ScoreBars item={item} bands={props.bands} items={props.items} />
      )}
      <div className="flex gap-[3px] border-t border-t-line px-[8px] py-[6px]" data-tacts>
        {/* In the Galerie the four sorting gestures DISAPPEAR — not greyed out:
            they make no sense on an image already kept, and an inert button
            would suggest otherwise. */}
        {props.trade === 'galerie' ? (
          <>
            <button
              className={`${TACT} ${TACT_IDLE}`}
              data-e="1"
              aria-label="Éditer cette image"
              title="Éditer cette image"
              onClick={props.onEdit}
            >
              ✎
            </button>
            {/* the download is an <a download>: the browser saves the bytes /img
                already serves. It dresses like the buttons around it. */}
            <a
              className={`${TACT} ${TACT_IDLE} flex items-center justify-center no-underline`}
              data-dl
              download
              href={props.fullSrc}
              aria-label="Télécharger le fichier"
              title="Télécharger le fichier"
            >
              ⤓
            </a>
          </>
        ) : (
          <>
            <button
              className={`${TACT} ${TACT_IDLE}`}
              data-a="valider"
              aria-label="Garder"
              title="Garder (V)"
              onClick={() => props.onAct('valider')}
            >
              ♥
            </button>
            {item.space !== 'nsfw' && (
              <button
                className={`${TACT} ${TACT_IDLE}`}
                data-d="1"
                aria-label="Décliner"
                title="Décliner (D)"
                onClick={() => props.onAct('decliner')}
              >
                ⟳
              </button>
            )}
            <button
              className={`${TACT} ${TACT_IDLE}`}
              data-a="rejeter"
              aria-label="Rejeter"
              title="Rejeter (X)"
              onClick={() => props.onAct('rejeter')}
            >
              ✕
            </button>
            <button
              className={`${TACT} ${TACT_IDLE}`}
              data-a="archiver"
              aria-label="Archiver"
              title="Archiver (A)"
              onClick={() => props.onAct('archiver')}
            >
              ▣
            </button>
          </>
        )}
        <span className="mx-[2px] my-[3px] w-px flex-none bg-line" />
        <FlagButtons item={item} onFlag={props.onFlag} />
        <span className="mx-[2px] my-[3px] w-px flex-none bg-line" />
        <button
          className={`${TACT} ${TACT_IDLE} ml-auto`}
          data-suppr="1"
          aria-label="Supprimer définitivement"
          title="Supprimer définitivement — pas de retour"
          onClick={props.onDelete}
        >
          🗑
        </button>
      </div>
    </div>
  )
}
