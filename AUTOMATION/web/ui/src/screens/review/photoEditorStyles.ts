/* The class chains of the editor modal.

   They live apart for one reason: there are twenty of them, they are long, and
   read in a row they hid the fifty lines of behaviour that sat between them.
   Nothing here decides anything — the `!` markers and the ordering notes travel
   with the chain they belong to. */

export const BOX = 'h-[min(880px,92vh)] max-h-[92vh] w-[min(1320px,95vw)] max-w-[95vw]'
export const CARD = 'h-full! w-full! rounded-none! [border:0]! bg-transparent! p-0! [box-shadow:none]!'
export const FRAME = 'flex h-full overflow-hidden rounded-[12px] border border-line2 bg-panel'
/* `#0a0a0a` stays raw: DESIGN.md lists the neutral blacks of the image frames
   and of this work surface among the values a universe re-tints by hand, not
   among the tokens. */
export const STAGE =
  'relative flex min-h-0 min-w-0 flex-1 items-center justify-center bg-[#0a0a0a] p-[16px]'

/* THE FRAME OF REFERENCE OF THE CROP BOX. `#edCropBox` carries CANVAS
   coordinates; its positioned parent must therefore hug the canvas to the
   pixel, not be the stage, which CENTRES it. Without this box the frame started
   from the corner of the work surface instead of the corner of the image
   (332 px of offset measured on 30/08): the veil darkened the whole image and
   the frame looked frozen. `leading-[0]` + `text-[0px]`: without them the
   canvas baseline adds a few pixels under the box and the offset comes back
   small. */
export const CANVAS_WRAP = 'relative max-h-full max-w-full text-[0px] leading-[0]'
export const CANVAS = 'block max-h-full max-w-full rounded-[2px]'
/* The 2000 px veil, and the reason the crop opens OFF (F3.1). Its colour is
   deliberately lighter than `--scrim`: one must still SEE the image outside the
   frame — passing it to the scrim would be a functional regression, which is
   why DESIGN.md lists it as left raw. */
export const CROP_BOX =
  'absolute cursor-move touch-none border-[1.5px] border-acc ' +
  '[box-shadow:0_0_0_2000px_#0b0d1066]'
/* `[transform:…]` and not `-translate-x-1/2`: the utility would write the
   `translate` property instead of `transform`. Same pixels, but the migration
   is meant to leave the computed styles alone. Each corner names its own
   cursor rather than inheriting one and overriding two — the ordering trap of
   the previous sheets. */
export const HANDLE =
  'absolute h-[14px] w-[14px] touch-none rounded-[50%] bg-acc [transform:translate(-50%,-50%)]'
export const HANDLES: Record<string, string> = {
  nw: 'left-0 top-0 cursor-nwse-resize',
  ne: 'left-full top-0 cursor-nesw-resize',
  sw: 'left-0 top-full cursor-nesw-resize',
  se: 'left-full top-full cursor-nwse-resize',
}

/* THE WAY OUT LIVES AT THE HEAD of the panel, not at its foot: it is the first
   thing one looks for when abandoning a retouch. */
export const SIDE = 'flex w-[300px] flex-none flex-col overflow-y-auto border-l border-l-line p-[20px]'
export const HEAD = 'flex items-center justify-between gap-[10px]'
export const CLOSE =
  'cursor-pointer rounded-[8px] [border:0] bg-transparent px-[8px] py-[6px] text-[16px] ' +
  'leading-none text-dim hover:bg-panel2 hover:text-txt focus-visible:outline-offset-[-2px]'
/* `.edSec:last-of-type{border-bottom:0}` IS NOT PORTED, because it never
   painted: `:last-of-type` looks at the last <div> of the panel, which is the
   actions block, not a section. All four sections have always carried their
   rule, the grain one included. Restoring the intent is a VISIBLE change and
   does not belong in a migration meant to be invisible. */
export const SEC = 'mb-[20px] border-b border-b-line pb-[18px]'
export const LAB = 'mb-[10px] text-[11.5px] uppercase tracking-[.5px] text-dim'
export const ROW = 'mt-[10px] flex justify-between text-[12.5px] text-dim'
export const VAL = 'tabular-nums text-txt'
/* `width:100%` is not repeated: `chrome.css` already gives it to every input. */
export const SLIDER = 'mt-[2px]'

/* STICKY FOOT of the settings panel. `.edSide` scrolls (the settings are taller
   than the modal from 950 px of window) and used to carry the buttons away with
   it: « Enregistrer une copie » lived 180 px below the fold. `bottom-[-20px]`
   cancels the panel padding so the block sticks to the real bottom; the shadow
   says content remains below when one has not finished scrolling. */
export const ACTIONS =
  'sticky bottom-[-20px] mt-auto bg-panel pt-[10px] pb-[20px] ' +
  '[box-shadow:0_-14px_14px_-14px_#000a]'
export const BTNS = 'mt-[14px] flex flex-col gap-[8px]'
/* Second rank: the destructive gesture. Separated from the primary rank by a
   rule and deliberately NARROWER — two full-width buttons one under the other
   get clicked in the flow, and this one cannot be taken back. */
export const BTNS2 = 'mt-[10px] flex flex-col gap-[8px] border-t border-t-line pt-[10px]'
/* The mirror is a SWITCH, and shows as pressed. `!` on the border alone:
   `.btn:hover` names a colour of its own and outweighs a plain utility — the
   pressed button would lose its accent under the pointer. */
export const FLIP_ON = ' bg-acc border-acc! text-on-acc font-semibold'

/* Share of the available box the frame takes on opening and on every ratio
   change. NOT 100 %: a frame that exactly fills the canvas has ZERO room to
   move — the clamp then locks it at x=0 and the frame looks broken while it is
   obeying (measured 30/08: a +120 px drag moved it by 0). */
