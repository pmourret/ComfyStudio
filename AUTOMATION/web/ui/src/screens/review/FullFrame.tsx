/* The single-image stage: the image, its meta column, and the gestures of the
   trade. Same rule as the tile — it renders, the screen decides. */
import { ScoreBars, calibration } from './ScoreBars'
import { FlagButtons } from './FlagButtons'
import { GalleryActions, ReviewActions } from './ReviewActions'
import { scoreClass, type GalleryItem, type Trade } from './useTriage'

/* The two arrows of the stage. `[transform:...]` and not `-translate-y-1/2`:
   the utility writes the `translate` property, the sheet wrote `transform`, and
   the computed style is not the same thing. */
const NAV =
  'absolute top-1/2 [transform:translateY(-50%)] h-[64px] w-[42px] cursor-pointer' +
  ' [border:0] bg-scrim text-[20px] text-txt focus-visible:outline-offset-[-2px]'

export function FullFrame(props: {
  item: GalleryItem
  index: number
  total: number
  filtered: number | null
  trade: Trade
  qc: { ok: number; watch: number; high: number }
  bands: Record<string, unknown>
  items: GalleryItem[]
  references: { mesurees: number; total: number }
  src: string
  onStep: (delta: number) => void
  onMagnify: () => void
  onAct: (action: string) => void
  onFlag: (flag: string) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { item, qc } = props
  const value = Number.parseFloat(item.score || '0')
  const klass = scoreClass(item.score, qc)

  return (
    <div className="grid grid-cols-[1fr_300px] gap-[22px] [align-items:start]" data-triage>
      <div
        className="relative flex min-h-[62vh] items-center justify-center overflow-hidden
                   rounded-card border border-line bg-panel"
      >
        <button
          className={`${NAV} left-0 rounded-r-[8px]`}
          aria-label="Image précédente"
          onClick={() => props.onStep(-1)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <img
          className="block max-h-[72vh] max-w-full cursor-zoom-in"
          src={props.src}
          id="stageImg"
          alt=""
          onClick={props.onMagnify}
        />
        <button
          className={`${NAV} right-0 rounded-l-[8px]`}
          aria-label="Image suivante"
          onClick={() => props.onStep(1)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <div className="sticky top-[12px] flex flex-col gap-[14px]">
        <div className="meta">
          <div className="text-[30px] leading-none font-bold" style={{ color: `var(--${klass})` }}>
            {item.score ? value.toFixed(3) : '—'}
            <small className="mt-[3px] block text-[12px] font-medium text-dim">
              similarité à la base gelée
              {item.score
                ? value >= qc.ok
                  ? ' · conforme'
                  : value >= qc.watch
                    ? ' · à surveiller'
                    : ' · hors bande'
                : ''}
            </small>
          </div>
          {/* Two arbitrary properties would be decided by their order in the
              generated sheet, and Tailwind emits `border-top` BEFORE `border`:
              the shorthand then erased the line. Measured — the separator had
              disappeared. The utilities keep it, at the cost of a `solid` style
              on three edges that are 0 px wide. */}
          <hr className="my-[14px] border-0 border-t border-t-line" />
          <dl className="m-0">
            <dt>scène</dt>
            <dd>{item.scene || '—'}</dd>
            <dt>format · date</dt>
            <dd>
              {item.format || '—'} · {item.date}
            </dd>
            <dt>seed</dt>
            <dd className="num">{item.seed || '—'}</dd>
          </dl>
          <div className="tiny">
            {props.index + 1} / {props.total}
            {props.filtered != null && ` · filtre actif sur ${props.filtered}`}
          </div>
        </div>

        <div className="meta">
          <dt className="mb-[9px]">réalisme {calibration(props.bands, props.references)}</dt>
          {item.nettete == null ? (
            <div className="tiny">non mesuré</div>
          ) : (
            <ScoreBars item={item} bands={props.bands} items={props.items} flat />
          )}
          <div className="mt-[11px] flex gap-[3px]" data-tacts>
            <FlagButtons item={item} onFlag={props.onFlag} />
          </div>
          <div className="tiny mt-[7px]">
            <span aria-hidden="true">◉</span> convaincante <span className="kbd">C</span> ·{' '}
            <span aria-hidden="true">◌</span> fait IA{' '}
            <span className="kbd">I</span>
          </div>
        </div>

        {/* `[&_.btn]` and not a utility on each button: it is the ROW that says
            its buttons are centred, exactly as the sheet did. */}
        <div className="grid grid-cols-2 gap-[9px] [&_.btn]:justify-center [&_.btn]:text-center"
             data-acts>
          {props.trade === 'galerie' ? (
            <GalleryActions src={props.src} onAct={props.onAct} />
          ) : (
            <ReviewActions bucket={item.bucket} space={item.space} onAct={props.onAct} />
          )}
        </div>

        <div className="mt-[14px] flex gap-[10px]">
          <button className="btn sm" id="btnOuvrirEditeur" onClick={props.onEdit}>
            <span aria-hidden="true">✎</span> Éditer
          </button>
          <button className="btn sm danger" id="btnSupprDef" onClick={props.onDelete}>
            <span aria-hidden="true">🗑</span> Supprimer définitivement
          </button>
        </div>

        {/* `!` on both: `details.adv` in `screens.css` is an element + class
            selector, which outweighs a plain utility. */}
        <details className="adv [border:0]! p-0!">
          <summary>prompt utilisé</summary>
          <p className="tiny mt-[8px]">
            {item.prompt || ''}
          </p>
        </details>
      </div>
    </div>
  )
}
