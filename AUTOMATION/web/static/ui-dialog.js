/* Modal dialog primitive — native <dialog>, no library.
   showModal/close, focus moved into the box on open and restored to the
   triggering element on close, Escape handled natively, backdrop click closes
   when the box allows it. Serves #armBox (confirm + NSFW arming) and
   #declineBox. The photo editor is NOT a modal — it is a mode (body.editing). */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/* Open `el` (a <dialog>) modally.
   - initialFocus : selector or node to focus first (default: first focusable)
   - dismissable  : Escape / backdrop click close the box (default: true)
   - onDismiss    : called with 'escape' | 'backdrop' when the user dismisses it,
                    so a caller holding a promise can resolve(false). */
export function openDialog(el, { initialFocus, dismissable = true, onDismiss } = {}) {
  if (!el) return;
  if (el.open) el.close();                 // showModal() throws on an open dialog
  el._uiOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  el._uiOnDismiss = typeof onDismiss === 'function' ? onDismiss : null;
  el._uiDismissable = dismissable;
  if (!el._uiWired) {
    el._uiWired = true;
    // backdrop click : the event target is the <dialog> itself, not a child
    el.addEventListener('click', e => {
      if (e.target === el && el._uiDismissable) {
        el._uiOnDismiss?.('backdrop');
        closeDialog(el);
      }
    });
    // Escape : native 'cancel', then the browser closes the dialog (=> 'close')
    el.addEventListener('cancel', e => {
      if (!el._uiDismissable) { e.preventDefault(); return; }
      el._uiOnDismiss?.('escape');
    });
    el.addEventListener('close', () => el._uiOpener?.focus());
  }
  el.showModal();
  const target = initialFocus
    ? (typeof initialFocus === 'string' ? el.querySelector(initialFocus) : initialFocus)
    : el.querySelector(FOCUSABLE);
  (target || el).focus();
}

export function closeDialog(el) {
  if (el && el.open) el.close();            // fires 'close' => focus restored
}
