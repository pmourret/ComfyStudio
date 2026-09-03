/* One frozen choice of the wizard: a type, a style, a world, or a base
   candidate — always one pick among a mutually exclusive set.

   `role="radio"` + `aria-checked`, not `aria-pressed`: these are radio-like
   choices within a set (screen-1-wizard design pass), and what a screen
   reader must say is « selected », not « pressed ». The checkmark glyph
   below is `aria-hidden` — it is for sighted users only, so it never
   collides with what `aria-checked` already announces.

   `tabIndex` is a prop, not native: the group around this card owns roving
   tabindex (`useRovingChoice`) — only the active (or first) card is ever a
   Tab stop, arrows move the selection within the group. */
import { Icon } from '../../chrome/Icon'

/* The tooltip goes on EACH card rather than on the step title: the stepper
   bullet is not focusable, hanging the bubble there would make it
   unreachable by keyboard, and giving it a tabindex would put a tab stop on
   a decorative element. */
export function OptionCard({
  active,
  title,
  sub,
  hint,
  tabIndex,
  onClick,
  onKeyDown,
  elementRef,
}: {
  active: boolean
  title: string
  sub?: string
  hint?: string
  tabIndex: 0 | -1
  onClick: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void
  elementRef: (el: HTMLButtonElement | null) => void
}) {
  return (
    <button
      ref={elementRef}
      className={`it relative${active ? ' on' : ''}`}
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={tabIndex}
      data-hint-text={hint}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <b>{title}</b>
      {sub && <span>{sub}</span>}
      {active && (
        <Icon
          name="check"
          className="absolute top-[6px] right-[6px] h-[14px] w-[14px] text-acc"
        />
      )}
    </button>
  )
}
