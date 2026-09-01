/* The dedicated pose editor — `${PATHS.poseEditor}/:name?`. No name in the
   URL: a preset must be chosen first (studio decision, 2026-09-01 — a pose
   made from scratch always starts from a template, never a blank canvas),
   which is why this file is a two-stage screen rather than one component
   straight into `usePoseEditor`. */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { PATHS } from '../../app/routes'
import { useApi } from '../../api/useApi'
import { useToast } from '../../chrome/ToastContext'
import { PoseCanvas } from './PoseCanvas'
import { usePoseEditor, type PoseEditorSource } from './usePoseEditor'

export function PoseEditorScreen() {
  const { name } = useParams<{ name?: string }>()
  const [chosenPreset, setChosenPreset] = useState<string | null>(null)

  if (!name && !chosenPreset) {
    return <PresetPicker onChoose={setChosenPreset} />
  }
  const source: PoseEditorSource = name ? { kind: 'pose', name } : { kind: 'preset', nom: chosenPreset! }
  return <PoseEditorInner source={source} />
}

function PresetPicker({ onChoose }: { onChoose: (nom: string) => void }) {
  const api = useApi()
  const [presets, setPresets] = useState<{ nom: string; label: string }[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void api
      .get<{ presets?: { nom: string; label: string }[] }>('/api/pose/presets')
      .then((response) => {
        if (!cancelled) setPresets(response.presets ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [api])

  return (
    <div className="screen" id="poseEditor">
      <div className="wrap w-full max-w-none">
        <Link className="btn sm" to={PATHS.bankPoses}>
          ← Retour à la banque
        </Link>
        <h2 className="mt-[16px]">Nouvelle pose — choisir un gabarit de départ</h2>
        <p className="tiny mb-[16px]">
          Coordonnées entièrement inventées, jamais issues d'une photo — le point de
          départ se corrige ensuite point par point.
        </p>
        {presets === null ? (
          <p className="tiny">chargement…</p>
        ) : presets.length === 0 ? (
          <div className="empty rounded-card border border-line bg-panel px-[16px] py-[28px] text-[13px]">
            aucun gabarit disponible.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-[12px]">
            {presets.map((p) => (
              <button
                key={p.nom}
                type="button"
                className="btn"
                onClick={() => onChoose(p.nom)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PoseEditorInner({ source }: { source: PoseEditorSource }) {
  const { pose, name, loading, loadError, saving, dirty, update, save } = usePoseEditor(source)
  const navigate = useNavigate()
  const toast = useToast()

  const onSave = async () => {
    const result = await save()
    if (!result.ok) {
      toast(result.erreur)
      return
    }
    toast(`squelette enregistré : ${result.name}`)
    if (!name) navigate(`${PATHS.poseEditor}/${result.name}`, { replace: true })
  }

  const onSaveAsNew = async () => {
    const result = await save({ asNew: true })
    if (!result.ok) {
      toast(result.erreur)
      return
    }
    toast(`nouvelle pose enregistrée : ${result.name}`)
    navigate(`${PATHS.poseEditor}/${result.name}`)
  }

  if (loading) {
    return (
      <div className="screen" id="poseEditor">
        <div className="wrap">
          <p className="tiny">chargement…</p>
        </div>
      </div>
    )
  }
  if (loadError || !pose) {
    return (
      <div className="screen" id="poseEditor">
        <div className="wrap">
          <Link className="btn sm" to={PATHS.bankPoses}>
            ← Retour à la banque
          </Link>
          <div className="empty mt-[16px] rounded-card border border-line bg-panel px-[16px] py-[28px] text-[13px]">
            {loadError || 'squelette introuvable'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen" id="poseEditor">
      <div className="wrap flex h-[calc(100vh-24px)] w-full max-w-none gap-[16px]">
        <div className="min-w-0 flex-1">
          <PoseCanvas pose={pose} onChange={update} />
        </div>
        <aside className="flex w-[240px] shrink-0 flex-col gap-[10px]">
          <Link className="btn sm" to={PATHS.bankPoses}>
            ← Retour à la banque
          </Link>
          <b className="mt-[8px] truncate text-[13px]">{name || 'nouvelle pose'}</b>
          <button className="btn primary" disabled={saving} onClick={() => void onSave()}>
            Enregistrer
          </button>
          {name && (
            <button className="btn sm" disabled={saving} onClick={() => void onSaveAsNew()}>
              Enregistrer sous (nouvelle pose)
            </button>
          )}
          {dirty && <p className="tiny">modifications non enregistrées</p>}
          <p className="tiny mt-[8px]">
            Glisser un joint pour le déplacer. Flèches pour l'ajuster au pixel près
            (Maj = pas de 10).
          </p>
        </aside>
      </div>
    </div>
  )
}
