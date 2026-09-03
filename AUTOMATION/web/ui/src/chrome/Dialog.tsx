/* Modal dialog primitive — native <dialog>, no library.
   Ported from `static/ui-dialog.js`, same contract:

     - `showModal()`, so the browser gives the top layer, the backdrop and the
       focus trap for free;
     - focus moves into the box on open and is restored to the element that
       opened it on close;
     - Escape is handled natively (the `cancel` event);
     - a click on the backdrop closes it when the box allows it — the event
       target is the <dialog> itself, never a child, which is how the two are
       told apart.

   Rebuilt as a component rather than a function that takes a node: the box's
   CONTENT is now JSX owned by its caller, instead of an innerHTML string
   injected into a single shared `#armCard`. The legacy frontend had one dialog
   element reused by the confirm, the NSFW arming and the decline modal, and
   whoever wrote into it last owned it. */
import {
  useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode,
} from 'react'

export function Dialog({
  open,
  onDismiss,
  dismissable = true,
  initialFocus,
  id,
  className,
  cardClassName,
  onKeyDown,
  children,
}: {
  open: boolean
  /** Called for Escape and backdrop click, so a caller holding a promise can
      resolve(false). Not called when the caller closes the box itself. */
  onDismiss: () => void
  dismissable?: boolean
  /** Selector focused first; the first focusable element otherwise. */
  initialFocus?: string
  id?: string
  /** Utilities added to the <dialog> ITSELF, for a box that does not take the
      shared geometry — the photo editor is a work surface, sized in vw/vh. The
      `dialog{…}` rule of `chrome.css` is an element selector, so a plain
      utility outweighs it: no `!` needed here, unlike `cardClassName`. */
  className?: string
  /** Utilities added to the visible plate, for a box whose size is not the
      default one — a work surface, or a narrower question. `chrome.css` styles
      `dialog .card` with an element + class selector, so an override coming
      from here needs `!`. */
  cardClassName?: string
  /** Passthrough for a caller that needs its own keydown contract inside the
      box (the pose editor modal's elevated Undo/Redo/nudge listener,
      design-pass screen-6 §A2) — attached to the rendered `<dialog>` itself.
      Independent of this file's own native `cancel`/Escape handling above:
      disjoint key sets, neither interferes with the other. */
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDialogElement>) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (open) {
      if (!element.open) {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        element.showModal()
      }
      const target = initialFocus ? element.querySelector<HTMLElement>(initialFocus) : null
      ;(target ?? element.querySelector<HTMLElement>(FOCUSABLE) ?? element).focus()
    } else if (element.open) {
      element.close()
      opener.current?.focus()
      opener.current = null
    }
  }, [open, initialFocus])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const onCancel = (event: Event) => {
      // Escape: prevent the native close so React stays the one that decides
      // whether the box is open, then let the caller react.
      event.preventDefault()
      if (dismissable) onDismiss()
    }
    const onClick = (event: MouseEvent) => {
      if (event.target === element && dismissable) onDismiss()
    }
    /* Escape closing THIS dialog is not the only thing that happens to it: the
       key event is a normal `keydown` that still bubbles up the DOM after the
       `cancel` above fires, past the <dialog> to whatever real ancestor it
       happens to be nested in. A dialog opened from inside a panel that ALSO
       closes on Escape (the scene composer's PromptField, nested in
       SceneInspector's own Escape-closes-the-panel handler) then closes BOTH
       — confirmed live: Escape in the prompt-editing modal deselected the
       whole scene. `stopPropagation` here keeps Escape's effect scoped to
       this dialog, whatever happens to contain it — a native listener, not a
       React prop, because it must run before React's own root-level dispatch
       ever sees the event. */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.stopPropagation()
    }
    element.addEventListener('cancel', onCancel)
    element.addEventListener('click', onClick)
    element.addEventListener('keydown', onKeyDown)
    return () => {
      element.removeEventListener('cancel', onCancel)
      element.removeEventListener('click', onClick)
      element.removeEventListener('keydown', onKeyDown)
    }
  }, [dismissable, onDismiss])

  return (
    <dialog id={id} className={className} ref={ref} onKeyDown={onKeyDown}>
      <div className={cardClassName ? `card ${cardClassName}` : 'card'}>{children}</div>
    </dialog>
  )
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
