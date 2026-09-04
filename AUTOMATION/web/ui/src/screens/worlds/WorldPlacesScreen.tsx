/* The full catalog editor of ONE world, at /worlds/:worldId/places
   (ADR-0016). What the Banque's Monde tab never was: a place to see EVERY
   lieu of a world, add one, or retire one — the Banque only ever edits ONE
   place already tied to a selected scene.

   Reuses `useWorldPlaces` and `PlaceInspector` from this same folder,
   unchanged in spirit from ADR-0015 — this screen is the second caller they
   were written to have. */
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useConfirm } from '../../chrome/ConfirmContext'
import { useToast } from '../../chrome/ToastContext'
import { PATHS } from '../../app/routes'
import { PlaceInspector } from './PlaceInspector'
import { useWorldPlaces, type Place } from './useWorldPlaces'

const BLANK_PLACE: Place = { id: '', label: '', intention: '', prompt: '' }

function PlaceRow({
  place,
  selected,
  onOpen,
}: {
  place: Place
  selected: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className={`block w-full rounded-card border-2 bg-panel px-[13px] py-[10px] text-left cursor-pointer
                  hover:border-line2 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2
                  ${selected ? 'border-acc' : 'border-line'}`}
      onClick={onOpen}
      data-place-row
    >
      <b className="block truncate text-[13.5px] font-semibold">{place.label || place.id}</b>
      <span className="tiny">
        {place.id}
        {place.intention ? ` · ${place.intention}` : ''}
      </span>
    </button>
  )
}

export function WorldPlacesScreen() {
  const { worldId } = useParams<{ worldId: string }>()
  const toast = useToast()
  const confirm = useConfirm()
  const worldPlaces = useWorldPlaces(worldId ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const selectedPlace = creatingNew
    ? BLANK_PLACE
    : (worldPlaces.places?.find((p) => p.id === selectedId) ?? null)

  const open = useCallback((id: string) => {
    setSelectedId(id)
    setCreatingNew(false)
    setStatus(null)
  }, [])

  const add = useCallback(() => {
    setSelectedId(null)
    setCreatingNew(true)
    setStatus(null)
  }, [])

  const onSave = async (patch: { id: string; label: string; intention: string; prompt: string }) => {
    const current = worldPlaces.places ?? []
    if (creatingNew) {
      if (current.some((p) => p.id === patch.id)) {
        setStatus(`identifiant « ${patch.id} » déjà utilisé dans ce catalogue`)
        return
      }
    }
    setSaving(true)
    const next = creatingNew
      ? [...current, patch]
      : current.map((p) => (p.id === selectedId ? { ...p, ...patch } : p))
    const result = await worldPlaces.save(next)
    setSaving(false)
    setStatus(result.ok ? 'lieu enregistré' : (result.erreur ?? 'échec'))
    if (result.ok) {
      toast('catalogue du monde enregistré')
      setCreatingNew(false)
      setSelectedId(patch.id)
    }
  }

  const remove = async (id: string) => {
    const place = worldPlaces.places?.find((p) => p.id === id)
    if (!place) return
    const ok = await confirm({
      title: `Retirer le lieu « ${place.label || id} » ?`,
      button: 'Retirer',
      body: (
        <p>
          Toute scène de personnage qui le référence (`world_ref`) perdra son cadre au prochain
          enregistrement de son atelier — elle ne sera plus produisible sans être réassignée.
        </p>
      ),
    })
    if (!ok) return
    const next = (worldPlaces.places ?? []).filter((p) => p.id !== id)
    const result = await worldPlaces.save(next)
    if (!result.ok) {
      toast(result.erreur ?? 'échec du retrait')
      return
    }
    if (selectedId === id) setSelectedId(null)
    toast('lieu retiré')
  }

  if (!worldId) return null

  return (
    <div className="screen" id="worldPlaces">
      <div className="wrap w-full max-w-none">
        <Link to={PATHS.worlds} className="tiny">
          ← Mondes
        </Link>
        <h2 className="mt-[8px]">
          Lieux — {worldPlaces.label ?? worldId} <span className="tiny">{worldId}</span>
        </h2>
        {worldPlaces.error && (
          <p className="tiny mt-[6px] text-danger-txt" role="alert">
            {worldPlaces.error}
          </p>
        )}

        <div
          className="mt-[16px] grid gap-[22px] [align-items:start]
                     grid-cols-[minmax(0,320px)_minmax(320px,1fr)]
                     max-[900px]:grid-cols-[1fr]"
        >
          <div className="flex flex-col gap-[8px]">
            {worldPlaces.places === null && <p className="tiny">chargement du catalogue…</p>}
            {worldPlaces.places?.length === 0 && !creatingNew && (
              <div className="empty px-[16px] py-[24px] text-[13px]">
                <b>Catalogue vide</b>
                Ajoute un premier lieu pour que les personnages de ce monde puissent y composer
                des scènes.
              </div>
            )}
            {worldPlaces.places?.map((place) => (
              <div key={place.id} className="flex items-center gap-[6px]">
                <div className="flex-1">
                  <PlaceRow
                    place={place}
                    selected={!creatingNew && selectedId === place.id}
                    onOpen={() => open(place.id)}
                  />
                </div>
                <button
                  className="cursor-pointer border-none bg-transparent text-[16px] text-dim2
                             hover:text-bad focus-visible:outline-2 focus-visible:outline-focus
                             focus-visible:outline-offset-2"
                  aria-label={`Retirer le lieu ${place.label || place.id}`}
                  title="retirer ce lieu"
                  onClick={() => void remove(place.id)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              className="rounded-card border-2 border-dashed border-line px-[13px] py-[10px]
                         text-left text-acc cursor-pointer hover:border-line2"
              onClick={add}
            >
              + Ajouter un lieu
            </button>
          </div>

          <div>
            {selectedPlace ? (
              <PlaceInspector
                place={selectedPlace}
                worldLabel={worldPlaces.label ?? worldId}
                saving={saving}
                status={status}
                idEditable={creatingNew}
                onSave={onSave}
                onClose={() => {
                  setSelectedId(null)
                  setCreatingNew(false)
                }}
              />
            ) : (
              <div className="empty px-[16px] py-[24px] text-[13px]">
                Ouvre un lieu dans la liste, ou ajoutes-en un.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
