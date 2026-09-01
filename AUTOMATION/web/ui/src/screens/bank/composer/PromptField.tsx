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
          className="min-h-[54px] resize-y"
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
        cardClassName="w-[min(640px,100%)]!"
      >
        <h3>{label}</h3>
        <textarea
          className="min-h-[240px] resize-y"
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
