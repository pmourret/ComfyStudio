/* One frozen choice of the wizard: a type, a style, a world.

   `aria-pressed` and not a checkmark: these are radio-like choices within a set,
   and what a screen reader must say is « selected », not « ✓ ». */
/* An option card. The tooltip goes on EACH card rather than on the step title:
   the stepper bullet is not focusable, hanging the bubble there would make it
   unreachable by keyboard, and giving it a tabindex would put a tab stop on a
   decorative element. */
export function OptionCard({
  active,
  title,
  sub,
  hint,
  onClick,
}: {
  active: boolean
  title: string
  sub?: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      className={`it${active ? ' on' : ''}`}
      type="button"
      aria-pressed={active}
      data-hint-text={hint}
      onClick={onClick}
    >
      <b>{title}</b>
      {sub && <span>{sub}</span>}
    </button>
  )
}
