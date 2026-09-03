/* One prompt fragment: a compact textarea for a quick edit, a pencil that opens
   the SAME value in a bigger modal for a comfortable one, and a cross that
   empties it. Used by every prompt-shaped field of the composer (light,
   wardrobe flavour, pose, the four fragments of the recap, the global prompt) —
   one control, six call sites, so it lives on its own rather than being
   retyped six times.

   THE COMPACT FIELD STAYS EDITABLE. The modal is comfort for a LONG fragment,
   not the only way in — a two-word correction should not force an overlay
   open (studio-wide "simplification du parcours" direction). Both write the
   same `value`/`onChange`, there is no second copy to drift. */
import { useState } from 'react'

import { Dialog } from '../../../chrome/Dialog'
import { Icon } from '../../../chrome/Icon'
import { InfoHint } from './InfoHint'

export function PromptField({
  dataField,
  label,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
  lockedNote,
  accentColor,
}: {
  /** `data-f` on the compact textarea — the browser fumigation's hook. */
  dataField: string
  label: string
  /** Explanation shown by the (i) button next to the label — omit for a field
      simple enough not to need one. */
  hint?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** A scene bound to a world place: this fragment is inherited and re-derived
      server-side on every save, so editing it here would be discarded — see
      SceneInspector's `worldLinked`. */
  disabled?: boolean
  /** Said under the field only while `disabled` is true — why it is locked. */
  lockedNote?: string
  /** Border tint (a CSS color, usually a `var(--frag-*)` token) — used by
      RecapPanel's 3 fragment mirrors to tie each field to its segment in the
      composed preview below (design pass écran 7, §V4). Omitted everywhere
      else: a tab with only ONE fragment has nothing to disambiguate. */
  accentColor?: string
}) {
  const [editing, setEditing] = useState(false)
  const fieldId = `scene-prompt-${dataField}`

  return (
    <div className="f">
      <label htmlFor={fieldId}>
        <span>
          {label}
          {hint && <InfoHint text={hint} />}
        </span>
      </label>
      <div className="flex items-start gap-[6px]">
        <textarea
          id={fieldId}
          data-f={dataField}
          className="min-h-[78px] resize-y"
          style={accentColor ? { borderColor: accentColor } : undefined}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="flex flex-col gap-[5px]">
          <button
            type="button"
            className="cursor-pointer rounded-[6px] border border-line2 bg-panel2 p-[6px]
                       text-dim hover:text-txt disabled:cursor-not-allowed disabled:opacity-40
                       focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
            aria-label={`Modifier « ${label} » dans une fenêtre plus confortable`}
            disabled={disabled}
            onClick={() => setEditing(true)}
          >
            <Icon name="pencil" className="h-[14px] w-[14px]" />
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-[6px] border border-line2 bg-panel2 p-[6px]
                       text-dim leading-none hover:text-bad disabled:cursor-not-allowed
                       disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-focus
                       focus-visible:outline-offset-2"
            aria-label={`Vider « ${label} »`}
            disabled={disabled || !value}
            onClick={() => onChange('')}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
      {disabled && lockedNote && <p className="tiny mt-[4px] mb-0">{lockedNote}</p>}

      <Dialog
        open={editing}
        onDismiss={() => setEditing(false)}
        initialFocus="textarea"
        /* `className` gives the <dialog> ITSELF a definite WIDTH, not just a
           `max-width` — chrome.css's own `dialog{}` sets only `max-width`, so
           the element has no explicit size and shrink-wraps to content
           (native `dialog` has no UA-stylesheet width, only position/inset).
           `.card`'s own `width:min(…,100%)` then resolves that `100%`
           against an INDETERMINATE parent width — which collapsed the whole
           modal down to the width of its own heading text (measured: 288px,
           nowhere near the 640px `cardClassName` asked for), matching the
           report: "s'affiche en vraiment petit". Giving the dialog a real
           width breaks that circularity; the card's `100%` now has something
           concrete to be 100% OF. `max-width` needs the SAME override too —
           chrome.css's own `max-width:min(560px,…)` still wins over a plain
           `width` utility otherwise (max-width always clamps width when the
           two conflict), which is why a first attempt at this still measured
           exactly 560px. */
        className="w-[min(760px,calc(100vw-32px))] max-w-[min(760px,calc(100vw-32px))]"
        cardClassName="w-[min(760px,100%)]!"
      >
        <h3>{label}</h3>
        <textarea
          className="min-h-[320px] resize-y"
          style={accentColor ? { borderColor: accentColor } : undefined}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="mt-[16px] flex items-center gap-[12px]">
          <button className="btn primary" onClick={() => setEditing(false)}>
            Fermer
          </button>
          <button
            className="link"
            disabled={disabled || !value}
            onClick={() => onChange('')}
          >
            vider
          </button>
        </div>
      </Dialog>
    </div>
  )
}
