/* The intensity segmented control: the levels a pack declares, and what the
   selected one is about to do.

   It says the TRUTH of the tier rather than its rank — the tier that EDITS
   announces that it engenders nothing and takes back a validated image, and
   it counts SOURCE IMAGES, not scenes (`unite` comes from the server).
   Announcing « 16 scènes » there was false.

   A FULL-WIDTH BAR ABOVE EVERYTHING (rail, grid, develop panel) — not
   scoped to the content column. Rendered as a direct sibling of the grid in
   ProduceScreen.tsx, not nested inside it: it used to bleed out of a padded
   column via negative margins, which broke the moment a rail column became
   its neighbour — the rail and the bar started at different tops, and their
   content visibly overlapped (found live, user report 2026-09-04). A real
   top-level bar has no margin trick to keep in sync with its container. */
import { useRovingChoice } from '../../chrome/useRovingChoice'
import { isEditTier, type IntensityTier } from './useProduceState'

/* The five `.lv*.on` rules of `produce.css`, as a table. FULL ESCALATION over
   the tiers — before, only lv2/lv3 had a rule of their own and lv0/lv1 fell back
   on the same accent as every other segmented control of the app. `lv1` is
   absent here because its rule only restated that accent, and a tier the table
   does not name keeps it.

   `--bg` and not `--txt`: light text on the `--bad` fill falls to 3.0:1, under
   AA. The tier that EDITS carries the hue of what it DOES, not of its rank: per
   pack it can sit at level 1 as well as at level 3. */
const TIER_TINT: Record<string, string> = {
  lv0: 'bg-ok! text-bg!',
  lv2: 'bg-warn!',
  lv3: 'bg-bad! text-bg!',
  lvedit: 'bg-bad! text-bg!',
}
const tierKey = (tier: IntensityTier) => (isEditTier(tier) ? 'lvedit' : `lv${tier.level}`)

export function IntensityBar({
  tiers,
  level,
  editing,
  onPick,
}: {
  tiers: IntensityTier[]
  level: number
  editing: boolean
  onPick: (level: number) => void
}) {
  const tier = tiers.find((t) => t.level === level) ?? null
  /* `unite` comes from the server: the tier that edits counts SOURCE IMAGES, not
     scenes — it picks none. Announcing « 16 scènes » there was false. */
  const unit = tier?.unite || 'scène'
  const plural = tier && tier.scenes > 1 ? 's' : ''

  /* screen-3-produire: a single-choice group like the wizard's type/style/
     world cards, same mechanics (roving tabindex, arrows select immediately
     — including the confirm-dialog path some tiers require, since it still
     goes through `onPick`, never bypassed). */
  const ids = tiers.map((entry) => String(entry.level))
  const roving = useRovingChoice(ids, level != null ? String(level) : null)

  return (
    <div className="w-full flex-none border-b border-b-line bg-panel px-[20px] py-[9px]">
      <div className="flex flex-wrap items-center gap-[14px]">
        <span className="text-[12px] font-semibold uppercase tracking-[.9px] text-dim">
          Intensité
        </span>
        <div className="seg" id="intSel" role="radiogroup" aria-label="Niveau d'intensité">
          {tiers.map((entry) => {
            const id = String(entry.level)
            return (
              <button
                key={entry.level}
                ref={roving.registerRef(id)}
                data-lv={entry.level}
                data-edit={isEditTier(entry) ? '1' : undefined}
                role="radio"
                aria-checked={entry.level === level}
                tabIndex={roving.tabIndexFor(id)}
                /* `!` everywhere: `.seg button` and `.seg button.on` in
                   `screens.css` are element + class selectors, which outweigh a
                   plain utility. The tint comes from ONE class, chosen by the
                   table — chaining a second background would be decided by the
                   generated sheet, not by this string. */
                className={`${entry.level === level ? 'on ' : ''}px-[16px]! py-[6px]! ${
                  entry.level === level ? TIER_TINT[tierKey(entry)] ?? '' : ''
                }`}
                data-hint-text={
                  isEditTier(entry)
                    ? "N'engendre rien : reprend une image déjà validée."
                    : 'Génère des images nouvelles à ce niveau.'
                }
                onClick={() => onPick(entry.level)}
                onKeyDown={(event) => roving.onKeyDown(event, id, (nextId) => onPick(Number(nextId)))}
              >
                {entry.label}
                <span className="ml-[6px] text-[11px] tabular-nums opacity-60">{entry.scenes}</span>
              </button>
            )
          })}
        </div>
        <span className="tiny" id="intHint">
          {tier
            ? `${tier.export ? 'exportable' : 'hors export'} · ${tier.scenes} ${unit}${plural} ${unit === 'image' ? 'éditable' : 'disponible'}${plural}` +
              (tier.prompt_add ? ` · ajoute : ${tier.prompt_add}` : '')
            : ''}
        </span>
        {editing && (
          <span
            className="rounded-[999px] border border-warn-line bg-warn-bg px-[10px] py-[3px]
                       text-[12px] leading-[1.35] text-warn-txt"
            id="intMode"
          >
            Édition — n'engendre rien, reprend une image validée
          </span>
        )}
      </div>
    </div>
  )
}
