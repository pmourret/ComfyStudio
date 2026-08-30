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
import { useEffect, useRef, type ReactNode } from 'react'

export function Dialog({
  open,
  onDismiss,
  dismissable = true,
  initialFocus,
  id,
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
    element.addEventListener('cancel', onCancel)
    element.addEventListener('click', onClick)
    return () => {
      element.removeEventListener('cancel', onCancel)
      element.removeEventListener('click', onClick)
    }
  }, [dismissable, onDismiss])

  return (
    <dialog id={id} ref={ref}>
      <div className="card">{children}</div>
    </dialog>
  )
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
