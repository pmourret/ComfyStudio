/* A small (i) button that explains one complex point next to its label.

   Deliberately not a new tooltip mechanism: `chrome/HintLayer.tsx` already
   shows a bubble for any element carrying `data-hint-text`, on hover AND
   focus, closed by Escape — this is that same contract, just on a bare icon
   button instead of a control that already does something else.

   The icon alone announces nothing (frontend.md: an icon-only button needs an
   `aria-label`, `title` is not enough), so the NAME stays generic — "plus
   d'information" — and the actual explanation rides in `data-hint-text` as the
   button's DESCRIPTION, which HintLayer wires to `aria-describedby` itself. */
import { Icon } from '../../../chrome/Icon'

export function InfoHint({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="ml-[5px] inline-flex h-[15px] w-[15px] shrink-0 cursor-help items-center
                 justify-center rounded-[50%] border-0 bg-transparent p-0 align-middle
                 text-dim2 hover:text-dim focus-visible:outline-2 focus-visible:outline-focus
                 focus-visible:outline-offset-2"
      aria-label="Plus d'information"
      data-hint-text={text}
    >
      <Icon name="info" className="h-[14px] w-[14px]" />
    </button>
  )
}
