/* The Produire rail: intention AND tone, both always visible. Replaces the
   two first steps of the old wizard (`#intentGrid`/`#intentVides`/
   `#toneRow` in ProduceScreen.tsx) with a permanent ~170px left-hand list —
   screen-3-produire design pass, §S. Same logic as before (`pickIntent`,
   roving tabindex, empty cards leading to the composer): what changes is the
   PRESENTATION, compact rows instead of cards that only appeared once
   clicked, because a permanent rail has no room for `.intents`' wide grid.

   Intentions with no scene stay OUTSIDE the radiogroup, below a separator:
   they are an action (open the composer), never a state that stays checked
   — same reasoning `IntentCard.tsx` used to carry, folded in here since the
   card presentation it drove is gone. */
import { useRovingChoice } from '../../chrome/useRovingChoice'
import type { Creative } from '../../state/TaxonomyContext'

/* `CreativeIntention` only declares `key` and `label` in the Pydantic
   model, with `extra="allow"`: creative.json belongs to the character, and
   that layer relays it rather than freezing its shape. */
export type Intention = {
  key: string
  label?: string | null
  icon?: string
  min_intensity?: number
  defaults?: { tone?: string }
}

/* `bg-transparent`: a bare row <button> with no background class falls back
   to the browser's own light button face (same bug found and fixed on the
   header's shutdown buttons, chrome/Header.tsx — the root cause here too). */
const ROW =
  'flex w-full items-center gap-[8px] rounded-[8px] border border-transparent' +
  ' bg-transparent px-[10px] py-[8px] text-left text-[13px]' +
  ' [transition:border-color_.12s,background-color_.12s]' +
  ' focus-visible:outline-2 focus-visible:outline-[var(--focus)] focus-visible:outline-offset-[-2px]'
const ROW_ON = 'border-acc bg-panel2'
const ROW_IDLE = 'hover:bg-panel2'
const ROW_VOID = 'opacity-[.72] hover:border-acc hover:opacity-100'

export function IntentRail({
  full,
  empty,
  intent,
  onPickIntent,
  goCompose,
  tones,
  tone,
  onPickTone,
}: {
  full: [Intention, number][]
  empty: [Intention, number][]
  intent: string | null
  onPickIntent: (key: string) => void
  goCompose: () => void
  tones: Creative['tones']
  tone: string
  onPickTone: (key: string) => void
}) {
  const intentIds = full.map(([entry]) => entry.key)
  const intentRoving = useRovingChoice(intentIds, intent)
  const toneIds = (tones ?? []).map((entry) => entry.key)
  const toneRoving = useRovingChoice(toneIds, tone)

  return (
    <nav
      className="flex w-[170px] flex-none flex-col gap-[22px] max-[1100px]:w-full"
      aria-label="Intention et ton"
    >
      <div>
        <h2 className="mb-[10px] text-[12px] font-semibold uppercase tracking-[.9px] text-dim">
          Intention
        </h2>
        <div className="flex flex-col gap-[3px]" id="railIntent" role="radiogroup" aria-label="Intention">
          {full.map(([entry, n]) => (
            <button
              type="button"
              key={entry.key}
              ref={intentRoving.registerRef(entry.key)}
              role="radio"
              aria-checked={entry.key === intent}
              tabIndex={intentRoving.tabIndexFor(entry.key)}
              className={`${ROW} ${entry.key === intent ? ROW_ON : ROW_IDLE}`}
              data-k={entry.key}
              onClick={() => onPickIntent(entry.key)}
              onKeyDown={(event) => intentRoving.onKeyDown(event, entry.key, onPickIntent)}
            >
              <span className="w-[18px] flex-none text-center text-[15px] leading-none" aria-hidden="true">
                {entry.icon}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{entry.label}</span>
              <span className="flex-none text-[11px] text-dim">{n}</span>
            </button>
          ))}
        </div>
        {empty.length > 0 && (
          <div id="railIntentVides">
            <div
              className="mt-[14px] mb-[8px] flex items-center gap-[8px] text-[10.5px]
                         uppercase tracking-[.5px] text-dim2
                         after:h-px after:flex-1 after:bg-line after:content-['']"
              data-sep
            >
              à peupler
            </div>
            <div className="flex flex-col gap-[3px]">
              {empty.map(([entry]) => (
                <button
                  type="button"
                  key={entry.key}
                  className={`${ROW} ${ROW_VOID}`}
                  data-k={entry.key}
                  /* "en composer une" moved to a hint bubble (audit-ux-ui,
                     end of chantier — measured in the browser): inline in a
                     170px row it left barely 120px for icon + label, which
                     truncated a name as short as "Self-care" down to
                     "Self…". The button is already focusable, so the hint
                     reaches the keyboard the same way A1-A3's badges do. */
                  data-hint-text="en composer une"
                  onClick={goCompose}
                >
                  <span
                    className="w-[18px] flex-none text-center text-[15px] leading-none text-dim2"
                    aria-hidden="true"
                  >
                    {entry.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-dim2">{entry.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {intent && (tones ?? []).length > 0 && (
        <div>
          <h2 className="mb-[10px] text-[12px] font-semibold uppercase tracking-[.9px] text-dim">
            Ton
          </h2>
          <div className="chips" id="railTone" role="radiogroup" aria-label="Ton">
            {(tones ?? []).map((entry) => (
              <button
                type="button"
                key={entry.key}
                ref={toneRoving.registerRef(entry.key)}
                role="radio"
                aria-checked={entry.key === tone}
                tabIndex={toneRoving.tabIndexFor(entry.key)}
                className={`chip-t${entry.key === tone ? ' on' : ''}`}
                data-k={entry.key}
                onClick={() => onPickTone(entry.key)}
                onKeyDown={(event) => toneRoving.onKeyDown(event, entry.key, onPickTone)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
