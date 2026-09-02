/* Editing ONE lieu of a world's catalog (ADR-0015). Writes `WORLDS/<id>.json`
   through its own routes, never `POST /api/scenes` — and it affects every
   character composing in this world.

   SHARED BY TWO SCREENS, same reasoning as `useWorldPlaces`: the Banque's
   Monde tab (`screens/bank/BankScreen.tsx`) edits one place tied to a
   selected scene, `WorldPlacesScreen` in this folder manages the whole
   catalog. Neither owns it; it lives here because it is a world concern.

   PRESENTATION ONLY. It holds its own text-field state (reset whenever
   `place.id` changes) because saving here is an immediate, self-contained
   action — not part of the Banque's dirty document. It never calls the API
   itself; `onSave` does. */
import { useEffect, useState } from 'react'

import type { Place } from './useWorldPlaces'

export function PlaceInspector({
  place,
  worldLabel,
  saving,
  status,
  idEditable = false,
  onSave,
  onClose,
}: {
  place: Place
  worldLabel: string
  saving: boolean
  status: string | null
  /* Editable only for a place just being created (ADR-0016) — never for one
     already in the catalog: renaming it would silently orphan every
     character scene whose `world_ref` points at the old id, and nothing
     here repairs that (same "the server refuses, it does not repair"
     stance as ADR-0014 §4/ADR-0015 §5). */
  idEditable?: boolean
  onSave: (patch: { id: string; label: string; intention: string; prompt: string }) => void
  onClose: () => void
}) {
  const [id, setId] = useState(place.id ?? '')
  const [label, setLabel] = useState(place.label ?? '')
  const [intention, setIntention] = useState(place.intention ?? '')
  const [prompt, setPrompt] = useState(place.prompt ?? '')

  useEffect(() => {
    setId(place.id ?? '')
    setLabel(place.label ?? '')
    setIntention(place.intention ?? '')
    setPrompt(place.prompt ?? '')
  }, [place.id, place.label, place.intention, place.prompt])

  return (
    <section
      aria-label={`Lieu ${place.label || place.id}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
      className="rounded-card border border-line bg-panel p-[16px]"
    >
      <p className="tiny mt-0 mb-[14px] text-warn">
        <span aria-hidden="true">⚠ </span>
        catalogue du monde « {worldLabel} » — modifie ce que <b>tous les personnages</b> de
        ce monde héritent, pas seulement celui-ci
      </p>

      {idEditable ? (
        <label className="f">
          <span>identifiant — sert de world_ref pour les scènes qui composeront ici</span>
          <input value={id} onChange={(e) => setId(e.target.value)} />
        </label>
      ) : (
        <p className="tiny mt-0 mb-[12px]">
          identifiant : <code className="font-code text-[12px] leading-[normal]">{place.id}</code>
        </p>
      )}

      <label className="f mt-[12px]">
        <span>nom du lieu</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>

      <label className="f mt-[12px]">
        <span>intention — sert aussi de dossier d'export</span>
        <input value={intention} onChange={(e) => setIntention(e.target.value)} />
      </label>

      <label className="f mt-[12px]">
        <span>
          prompt du lieu — décor, cadrage, lumière. Jamais le visage, jamais la tenue : c'est un
          cadre, pas une garde-robe.
        </span>
        <textarea
          className="min-h-[78px] resize-y"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>

      <div className="mt-[14px] flex items-center gap-[10px]">
        <button
          className="btn primary sm"
          disabled={saving || !prompt.trim() || (idEditable && !id.trim())}
          onClick={() => onSave({ id: id.trim(), label, intention, prompt: prompt.trim() })}
        >
          Enregistrer le lieu
        </button>
        {status && <span className="tiny">{status}</span>}
      </div>
    </section>
  )
}
