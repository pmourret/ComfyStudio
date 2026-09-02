/* "+ Nouvelle pose" opens this instead of navigating straight to the editor
   — a full-screen template picker for what is really one short decision
   "n'a pas de sens" (studio session, 2026-09-02). This modal collects that
   decision (name, starting template, optional "create a template too") and
   hands it off as router state; it saves nothing itself — PoseEditorScreen
   reads the state back out and does the actual load/save. */
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { PATHS } from '../../app/routes'
import { useApi } from '../../api/useApi'
import { Dialog } from '../../chrome/Dialog'

/** The handoff contract to `PoseEditorScreen` — read back out of
    `useLocation().state` there. */
export type NewPoseIntent = {
  presetName: string
  label: string
  createTemplate: boolean
}

export function NewPoseModal({ onClose }: { onClose: () => void }) {
  const api = useApi()
  const navigate = useNavigate()
  const location = useLocation()
  const [presets, setPresets] = useState<{ nom: string; label: string }[] | null>(null)
  const [chosenPreset, setChosenPreset] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [createTemplate, setCreateTemplate] = useState(false)

  useEffect(() => {
    let cancelled = false
    void api
      .get<{ presets?: { nom: string; label: string }[] }>('/api/pose/presets')
      .then((response) => {
        if (cancelled) return
        const list = response.presets ?? []
        setPresets(list)
        // A pose from scratch always starts from a template, never a blank
        // canvas (2026-09-01) — pre-selecting the obvious one leaves the
        // name as the only decision left, when there is just one template.
        setChosenPreset((current) => current ?? list[0]?.nom ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [api])

  const canCreate = Boolean(chosenPreset) && label.trim() !== ''

  const onCreate = () => {
    if (!canCreate || !chosenPreset) return
    const intent: NewPoseIntent = { presetName: chosenPreset, label: label.trim(), createTemplate }
    // `search: location.search` carries `?character=` forward explicitly —
    // without it, CharacterContext's own URL-catches-up-to-state effect
    // (see its comment on `selectCharacter`) replaces this navigation a
    // tick later to re-add the query param, and that replace does not
    // forward `state`, silently dropping `intent` right after arrival.
    navigate({ pathname: PATHS.poseEditor, search: location.search }, { state: intent })
  }

  return (
    <Dialog
      id="newPoseBox"
      open
      onDismiss={onClose}
      initialFocus="#newPoseName"
      className="w-[min(460px,calc(100vw-32px))] max-w-[min(460px,calc(100vw-32px))]"
      cardClassName="w-[min(460px,100%)]! p-[20px]!"
    >
      <h3 className="mb-[4px]! text-[16px]!">Nouvelle pose</h3>
      <p className="tiny mb-[14px]">
        Coordonnées entièrement inventées, jamais issues d'une photo — le point
        de départ se corrige ensuite point par point.
      </p>

      <label className="tiny mb-[4px] block" htmlFor="newPoseName">
        Nom
      </label>
      <input
        id="newPoseName"
        className="mb-[14px] w-full"
        value={label}
        placeholder="ex. assise sur un tabouret"
        onChange={(event) => setLabel(event.target.value)}
      />

      <div className="tiny mb-[6px]">Gabarit de départ</div>
      {presets === null ? (
        <p className="tiny mb-[14px]">chargement…</p>
      ) : presets.length === 0 ? (
        <div className="empty mb-[14px] rounded-card border border-line bg-panel px-[12px] py-[16px] text-[13px]">
          aucun gabarit disponible.
        </div>
      ) : (
        <div className="mb-[14px] grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-[8px]">
          {presets.map((p) => (
            <button
              key={p.nom}
              type="button"
              aria-pressed={chosenPreset === p.nom}
              className={`rounded-[8px] border px-[12px] py-[8px] text-[13px] ${
                chosenPreset === p.nom ? 'border-acc bg-panel2' : 'border-line2 bg-panel'
              }`}
              onClick={() => setChosenPreset(p.nom)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <label className="mb-[16px] flex items-center gap-[8px] text-[13px]">
        <input
          type="checkbox"
          checked={createTemplate}
          onChange={(event) => setCreateTemplate(event.target.checked)}
        />
        Créer aussi un gabarit réutilisable à partir de cette pose
      </label>

      <div className="flex items-center gap-[12px]">
        <button type="button" className="btn primary" disabled={!canCreate} onClick={onCreate}>
          Créer
        </button>
        <button type="button" className="link" onClick={onClose}>
          annuler
        </button>
      </div>
    </Dialog>
  )
}
