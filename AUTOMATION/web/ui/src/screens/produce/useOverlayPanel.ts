/* Escape + focus for a floating panel that is NOT a native <dialog> —
   PromptPreview and SettingsPanel (screen-3-produire design pass). Mirrors
   chrome/Dialog.tsx's own focus contract (first focusable control on open,
   focus restored to whatever opened it on close) without showModal()'s
   blocking backdrop: both panels are intentionally non-modal — PromptPreview
   keeps updating while scenes are ticked behind it, which a real modal
   would make impossible.

   `active` covers both mounting shapes in this folder: PromptPreview only
   exists while open (pass `true`, the effect then runs once on mount);
   SettingsPanel stays permanently mounted and toggles a `hidden` class
   (pass its `open` prop, the effect re-runs on every toggle).

   Escape is a plain `document` keydown listener, same pattern as
   IdentityMenu's own Escape handling — safe to coexist with Dialog.tsx's
   native <dialog> Escape, which already stops its own propagation (see its
   comment on a real nested-Escape bug), so a confirm dialog opened on top
   of one of these panels never closes both at once. */
import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useOverlayPanel(
  active: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
  /** Selector focused first when it matches something (same contract as
      chrome/Dialog.tsx's own `initialFocus`); the first focusable element
      otherwise. Write it to exclude a disabled state itself (e.g.
      `'#x:not([disabled])'`) so a temporarily-unusable "real" first control
      falls through to the generic search rather than focusing nothing. */
  initialFocus?: string,
) {
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const target = initialFocus ? containerRef.current?.querySelector<HTMLElement>(initialFocus) : null
    ;(target ?? containerRef.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener.current?.focus()
      opener.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
