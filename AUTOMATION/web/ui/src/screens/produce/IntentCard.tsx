/* One intention of the Créer screen. A card with NO scene is dimmed and still
   clickable: it leads to the composer, which is the only way it will ever
   have one. Hiding it would hide the way out. */

/* `CreativeIntention` only declares `key` and `label` in the Pydantic model,
   with `extra="allow"`: creative.json belongs to the character, and that layer
   relays it rather than freezing its shape. This is what the SCREEN reads —
   declared where it is read, like the journal rows and config.json. */
export type Intention = {
  key: string
  label?: string | null
  icon?: string
  min_intensity?: number
  defaults?: { tone?: string }
}

export function IntentCard({
  entry,
  count,
  active,
  onClick,
  radio,
}: {
  entry: Intention
  count: number
  active: boolean
  onClick: () => void
  /** screen-3-produire: present only for `#intentGrid`, a real single-choice
      group. `#intentVideGrid` (no scene, leads to the composer) omits it —
      those cards are actions, never a state that stays checked, so they stay
      plain buttons in the natural tab order. */
  radio?: {
    tabIndex: 0 | -1
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void
    elementRef: (el: HTMLButtonElement | null) => void
  }
}) {
  /* `.it` stays a class: it belongs to `wizard.css`, which is not migrated yet.
     What Produire ADDED to it is here — a card with no scene is dimmed, and lifts
     on hover, which is how it says the click leads to the composer. A card with
     no scene is exactly a card of the `#intentVides` grid, which is where the
     sheet hung that rule. `!` on the text: `.it span` is a class + a type. */
  const void_ = count === 0
  return (
    <button
      type="button"
      ref={radio?.elementRef}
      role={radio ? 'radio' : undefined}
      aria-checked={radio ? active : undefined}
      tabIndex={radio?.tabIndex}
      className={`it${active ? ' on' : ''}${
        void_ ? ' opacity-[.72] hover:border-acc hover:opacity-100' : ''
      }`}
      data-k={entry.key}
      data-void={void_ ? '1' : undefined}
      onClick={onClick}
      onKeyDown={radio?.onKeyDown}
    >
      <span className={`mb-[9px] block text-[22px]! leading-none ${void_ ? 'text-dim2!' : ''}`}>
        {entry.icon}
      </span>
      <b>{entry.label}</b>
      <span className={void_ ? 'text-dim2!' : undefined}>
        {count ? `${count} scène${count > 1 ? 's' : ''}` : 'en composer une'}
      </span>
    </button>
  )
}
