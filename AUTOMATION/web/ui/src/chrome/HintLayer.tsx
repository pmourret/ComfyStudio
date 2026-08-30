/* One tooltip for the whole document, ported from `static/hints.js`.

   DELEGATION, NOT PER-ELEMENT WIRING. A single pair of listeners on the
   document, and nothing to re-attach when a screen repaints its controls. Any
   element carrying `data-hint-text` gets a bubble; that is the whole contract.
   In React this stays the right shape for the same reason it was in vanilla:
   the rail, the probes and the intensity slider all rebuild their DOM.

   HOVER AND FOCUS BOTH. A reading that exists only on hover is lost to anyone
   navigating with a keyboard. `focusin`/`focusout` bubble (unlike focus/blur),
   which is what makes the delegation possible.

   `aria-describedby` and not `aria-label`: the bubble COMPLETES the button's
   name, it does not replace it — a screen reader must read both. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const TARGET = '[data-hint-text]'
const POP_ID = 'hintPop'

/** What the bubble describes: the anchor's box, and its text. */
type Target = { rect: DOMRect; text: string } | null

export function HintLayer() {
  const [target, setTarget] = useState<Target>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  /* Placement happens AFTER the bubble is in the document, in a layout effect:
     its width depends on its text, and computing it beforehand would mean
     reimplementing text layout. The legacy module measured the same way, by
     laying the bubble out at 0,0 first. */
  useLayoutEffect(() => {
    if (!target || !popRef.current) {
      setPosition(null)
      return
    }
    const a = target.rect
    const b = popRef.current.getBoundingClientRect()
    const left = Math.max(
      8,
      Math.min(a.left + a.width / 2 - b.width / 2, window.innerWidth - b.width - 8),
    )
    // under the anchor, centred on it, flipped ABOVE when the bottom is short
    let top = a.bottom + 8
    if (top + b.height > window.innerHeight - 8) top = a.top - b.height - 8
    setPosition({ left: Math.round(left), top: Math.round(Math.max(8, top)) })
  }, [target])

  useEffect(() => {
    let anchor: Element | null = null

    const show = (element: Element) => {
      const text = (element as HTMLElement).dataset.hintText || ''
      if (!text || element === anchor) return
      anchor = element
      element.setAttribute('aria-describedby', POP_ID)
      setTarget({ rect: element.getBoundingClientRect(), text })
    }

    /* Immediate exit, no fade out: unmounting takes the bubble out of the
       accessibility tree, which a mere `opacity:0` would not do. A fade would
       mean leaving an announced bubble 150 ms on an element already left. */
    const hide = () => {
      if (!anchor) return
      anchor.removeAttribute('aria-describedby')
      anchor = null
      setTarget(null)
    }

    const anchorOf = (event: Event): Element | null =>
      event.target instanceof Element ? event.target.closest(TARGET) : null

    /* Only close when the pointer (or the focus) really leaves the anchor.
       Without this test, moving onto a CHILD of the button fires mouseout then
       mouseover, so the bubble blinks under a motionless cursor. */
    const leaves = (event: MouseEvent | FocusEvent) =>
      !anchor ||
      !(event.relatedTarget instanceof Element) ||
      !anchor.contains(event.relatedTarget)

    const onMouseOver = (event: MouseEvent) => {
      const found = anchorOf(event)
      if (found) show(found)
    }
    const onMouseOut = (event: MouseEvent) => {
      if (anchor && anchorOf(event) === anchor && leaves(event)) hide()
    }
    const onFocusIn = (event: FocusEvent) => {
      const found = anchorOf(event)
      if (found) show(found)
      else hide()
    }
    const onFocusOut = (event: FocusEvent) => {
      if (anchor && leaves(event)) hide()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }

    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKeyDown)
    // A bubble is positioned in viewport coordinates: it follows neither a
    // scroll nor a resize, it closes.
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)

    return () => {
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [])

  if (!target) return null
  return (
    <div
      id={POP_ID}
      ref={popRef}
      role="tooltip"
      className={position ? 'on' : undefined}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
    >
      {target.text}
    </div>
  )
}
