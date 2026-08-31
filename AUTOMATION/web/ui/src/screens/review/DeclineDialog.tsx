/* Décliner — restart from a kept image rather than relaunch a batch.
   Ported from the decline half of `static/review.js`.

   The server rebuilds the job from the journal line — the seed is there for
   exactly that. `dry` asks FIRST what makes sense on THIS image, so a button
   that would fail is never offered.

   THE ARMING GESTURE IS NOT HERE. When the next tier requires arming and does
   not have it, the box says WHERE the decision is taken (Application → Contenu
   adulte) and does not take you there. Offering a second path to the same
   decision, in the middle of a production gesture, is exactly what J7 undid. */
import { useCallback, useEffect, useState } from 'react'

import { errorOf, type ActionLike } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useConfirm } from '../../chrome/ConfirmContext'
import { Dialog } from '../../chrome/Dialog'
import { useToast } from '../../chrome/ToastContext'
import type { GalleryItem } from './useTriage'

/* The dry-run answer. `/api/decline` relays what the pack and the journal allow
   for this image; the shape is the screen's reading of it. */
type DryRun = ActionLike & {
  scene?: string
  ton?: string
  modes?: {
    lumiere?: number
    seeds?: boolean
    intensite?: boolean
    editer?: boolean
    ton?: { key: string; label: string }[]
  }
  niveau_suivant?: string
  suivant_verrouille?: boolean
  suivant_requires?: string
  suivant_instruction?: boolean
  edition_label?: string
  edition_verrouillee?: boolean
  edition_raison?: string
}

type Launched = ActionLike & { libelle?: string; total?: number }

/* An INERT sentence, not a button: arming has one place. We say where to go, we
   do not take you there. */
function ArmingNotice({ reason }: { reason?: string }) {
  return (
    <p className="tiny mt-[2px] mb-[12px]">
      {reason || "L'édition d'image n'est pas disponible pour ce personnage."}
      <br />
      Pour l'activer : <b>Application → Contenu adulte</b>.
    </p>
  )
}

export function DeclineDialog({
  item,
  onClose,
  onLaunched,
}: {
  item: GalleryItem
  onClose: () => void
  onLaunched: (label: string, total: number) => void
}) {
  const api = useApi()
  const confirm = useConfirm()
  const toast = useToast()
  const [dry, setDry] = useState<DryRun | null>(null)
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .post<DryRun>('/api/decline', { name: item.name, dry: true, n: 3 })
      .then((response) => {
        if (!alive) return
        const failure = errorOf(response)
        if (failure) {
          toast(failure || 'déclinaison impossible')
          onClose()
          return
        }
        setDry(response)
      })
      .catch(() => {
        if (alive) {
          toast('déclinaison impossible')
          onClose()
        }
      })
    return () => {
      alive = false
    }
  }, [api, item.name, onClose, toast])

  const launch = useCallback(
    async (mode: string, tone?: string) => {
      if (!dry || busy) return
      const body: Record<string, unknown> = { name: item.name, mode, n: 3 }

      if (mode === 'editer') {
        /* Editing does not go up a tier: it therefore does not ask the « outside
           export » confirmation of a tier it does not cross. The server itself
           checks the arming and the instruction (guard_intensity). */
        body.confirm_intensity = true
        if (!instruction.trim()) {
          toast("écris l'instruction d'édition")
          return
        }
      }
      if (mode === 'intensite') {
        /* Same confirmation as the main slider for the same transition — this
           path used to send it unconditionally, which skipped the « outside
           export » warning of the `requires:confirm` tiers. */
        if (dry.suivant_requires === 'confirm') {
          const ok = await confirm({
            title: `Passer en ${dry.niveau_suivant} ?`,
            button: `Passer en ${dry.niveau_suivant}`,
            body: (
              <p>
                Les images produites à ce niveau <b>ne partent pas dans l'export</b>.
              </p>
            ),
          })
          if (!ok) return
        }
        body.confirm_intensity = true
      }
      if (tone) body.tone = tone
      if (instruction) body.edit_instruction = instruction

      setBusy(true)
      const response = await api.post<Launched>('/api/decline', body)
      setBusy(false)
      const failure = errorOf(response)
      if (failure) {
        toast(failure || 'échec')
        return
      }
      onLaunched(response.libelle ?? 'déclinaison', response.total ?? 0)
    },
    [api, busy, confirm, dry, instruction, item.name, onLaunched, toast],
  )

  const modes = dry?.modes ?? {}
  /* One instruction field: the two buttons that EDIT share it. */
  const needsInstruction = Boolean((dry?.suivant_instruction && modes.intensite) || modes.editer)

  const ModeButton = ({
    mode,
    label,
    available,
    suffix,
  }: {
    mode: string
    label: string
    available?: boolean | number
    suffix: string
  }) => (
    <button
      className="btn mb-[9px] flex w-full items-center justify-start gap-[10px] text-left
                 disabled:opacity-[.38]"
      data-m={mode}
      data-dm
      disabled={!available || busy}
      onClick={() => launch(mode)}
    >
      {label} <span className="ml-auto text-[11.5px] text-dim">{suffix}</span>
    </button>
  )

  return (
    /* A question, not a work surface: the box is narrower and tighter than the
       shared plate. `!` because `chrome.css` styles `dialog .card` with an
       element + class selector, which outweighs a plain utility. */
    <Dialog
      id="declineBox"
      open
      onDismiss={onClose}
      cardClassName="w-[min(460px,100%)]! p-[20px]!"
    >
      <h3 className="mb-[4px]! text-[16px]!">Décliner</h3>
      {!dry ? (
        <p className="tiny">chargement…</p>
      ) : (
        <>
          <div className="mb-[16px] text-[12.5px] text-dim">
            {dry.scene || item.name} · {item.score || '—'}
            {dry.ton ? ` · ton ${dry.ton}` : ''}
          </div>

          <ModeButton
            mode="lumiere"
            label="Autre lumière"
            available={modes.lumiere}
            suffix={modes.lumiere ? `${modes.lumiere} variante(s)` : 'aucune variante'}
          />
          <ModeButton
            mode="seeds"
            label="Même scène, 3 autres tirages"
            available={modes.seeds}
            suffix="3 images"
          />

          {dry.suivant_verrouille ? (
            <ArmingNotice reason={dry.edition_raison} />
          ) : (
            <ModeButton
              mode="intensite"
              label={dry.niveau_suivant ? `Monter en ${dry.niveau_suivant}` : "Monter d'un cran"}
              available={modes.intensite}
              suffix={modes.intensite ? '1 image' : 'niveau max'}
            />
          )}

          {/* « Éditer » does not go up a tier: it starts from THIS image,
              whatever its level, and regenerates nothing. */}
          {dry.edition_label &&
            (dry.edition_verrouillee ? (
              dry.suivant_verrouille ? null : (
                <ArmingNotice reason={dry.edition_raison} />
              )
            ) : (
              <ModeButton
                mode="editer"
                label={`Éditer en ${dry.edition_label}`}
                available={modes.editer}
                suffix={modes.editer ? 'cette image, sans régénérer' : 'image non éditable'}
              />
            ))}

          {needsInstruction && (
            <input
              className="mt-[-4px] mb-[10px]"
              id="dInstr"
              placeholder="instruction d'édition, en anglais — requise pour éditer"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
            />
          )}

          {(modes.ton ?? []).length > 0 && (
            <>
              <div className="mt-[16px] mb-[8px] text-[12px] font-semibold uppercase
                              tracking-[.9px] text-dim">
                Autre ton
              </div>
              <div className="chips">
                {(modes.ton ?? []).map((tone) => (
                  <button
                    key={tone.key}
                    type="button"
                    className="chip-t"
                    data-t={tone.key}
                    disabled={busy}
                    onClick={() => launch('ton', tone.key)}
                  >
                    {tone.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-[18px] flex items-center gap-[12px]">
            <button className="link" id="dclose" onClick={onClose}>
              fermer
            </button>
            <span className="tiny">même seed sauf pour les tirages</span>
          </div>
        </>
      )}
    </Dialog>
  )
}
