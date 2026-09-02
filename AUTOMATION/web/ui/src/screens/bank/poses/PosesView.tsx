/* Bank of OpenPose skeletons (INPUTS/POSE/), consumed by the pose selector of
   the scene cards. Ported from the poses half of `static/advanced.js`, then
   reworked (2026-09-02) with search/filter/sort, rename, duplicate and a
   density toggle — see `usePoseBank.ts` for the state this composes.

   THE ONLY PLACE OF THE STUDIO WHERE A REAL PHOTO CAN TRANSIT — and it is never
   kept: AUTOMATION/pose_tools.py removes it from ComfyUI/input at the end of the
   extraction, success or failure. The interface says so, because the person
   choosing the file is the one who needs to know. */
import { useRef, useState } from 'react'

import { errorOf, type ActionLike } from '../../../api/client'
import { useApi } from '../../../api/useApi'
import { useConfirm } from '../../../chrome/ConfirmContext'
import { useToast } from '../../../chrome/ToastContext'
import { NewPoseModal } from '../../pose-editor/NewPoseModal'
import { PoseCard } from './PoseCard'
import { usePoseBank, type ProvenanceFilter, type SortBy, type UsageFilter } from './usePoseBank'

type ExtractResponse = ActionLike & { name?: string }

const GRID_COLS = {
  compact: 'repeat(auto-fill,minmax(96px,1fr))',
  comfortable: 'repeat(auto-fill,minmax(160px,1fr))',
}

export function PosesView() {
  const api = useApi()
  const confirm = useConfirm()
  const toast = useToast()
  const {
    rows, totalCount,
    search, setSearch,
    provenanceFilter, setProvenanceFilter,
    usageFilter, setUsageFilter,
    sortBy, setSortBy,
    density, setDensity,
    busyNames,
    rename, duplicate, remove, reload,
  } = usePoseBank()
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [newPoseOpen, setNewPoseOpen] = useState(false)

  const onDelete = async (name: string, scenesUsing: string[]) => {
    const ok = await confirm({
      title: 'Retirer ce squelette ?',
      button: 'Retirer',
      body: scenesUsing.length ? (
        <p>
          Référencé par {scenesUsing.length} scène{scenesUsing.length > 1 ? 's' : ''}
          {' '}— <b>{scenesUsing.join(', ')}</b> — qui le perdront au prochain
          enregistrement : <code>{name}</code> deviendra introuvable, ce que la
          validation signalera.
        </p>
      ) : (
        <p>
          Aucune scène ne le référence actuellement — <code>{name}</code> peut
          être retiré sans rien casser.
        </p>
      ),
    })
    if (!ok) return
    const result = await remove(name)
    toast(result.ok ? 'squelette retiré' : result.erreur || 'échec')
  }

  const onDuplicate = async (name: string) => {
    const result = await duplicate(name)
    toast(result.ok ? `dupliqué : ${result.name}` : result.erreur || 'échec')
  }

  const onRename = async (name: string, label: string) => {
    const result = await rename(name, label)
    if (!result.ok) toast(result.erreur)
  }

  const extract = async () => {
    const file = fileInput.current?.files?.[0]
    if (!file) return
    setBusy(true)
    setMessage('extraction en cours… (~20 s)')
    try {
      /* base64 in a JSON body, never multipart — the origin guard depends on
         the Content-Type being application/json (api/security.py). The prefix
         `data:...;base64,` is stripped: the route wants the payload alone. */
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const response = await api.post<ExtractResponse>('/api/pose/extract', {
        filename: file.name,
        data_base64: base64,
      })
      const failure = errorOf(response)
      if (failure) {
        setMessage('')
        toast(failure || 'échec')
        return
      }
      setMessage('')
      if (fileInput.current) fileInput.current.value = ''
      setFileName('')
      toast(`squelette extrait : ${response.name}`)
      // guarded reload: an edit in progress on the Scenes view is not overwritten
      await reload(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id="bankPoses">
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <h2 className="m-0">
          Squelettes de pose{' '}
          <span className="tiny" id="nPoses">
            {totalCount ? `— ${totalCount}` : ''}
          </span>
        </h2>
        <button type="button" className="btn sm" onClick={() => setNewPoseOpen(true)}>
          + Nouvelle pose
        </button>
      </div>
      {newPoseOpen && <NewPoseModal onClose={() => setNewPoseOpen(false)} />}
      <p className="tiny mt-[6px] mb-[16px]">
        Un squelette OpenPose extrait d'une photo, imposable à une scène
        (ControlNet, cran SFW seulement). <b>La photo source ne reste jamais sur
        le disque</b> : seul le squelette est gardé. « + Nouvelle pose » part
        d'un gabarit, sans photo — à corriger point par point ensuite.
      </p>

      {totalCount > 0 && (
        <div className="mb-[12px] flex flex-wrap items-end gap-[12px]" id="poseToolbar">
          <label className="flex flex-col gap-[3px] text-[11px] text-dim">
            <span>rechercher</span>
            <input
              className="w-[180px]"
              value={search}
              placeholder="nom ou libellé…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-[3px] text-[11px] text-dim">
            <span>provenance</span>
            <select
              value={provenanceFilter}
              onChange={(event) => setProvenanceFilter(event.target.value as ProvenanceFilter)}
            >
              <option value="all">toutes</option>
              <option value="preset">gabarit</option>
              <option value="extraction">photo</option>
            </select>
          </label>
          <label className="flex flex-col gap-[3px] text-[11px] text-dim">
            <span>utilisation</span>
            <select
              value={usageFilter}
              onChange={(event) => setUsageFilter(event.target.value as UsageFilter)}
            >
              <option value="all">toutes</option>
              <option value="used">utilisées</option>
              <option value="unused">non utilisées</option>
            </select>
          </label>
          <label className="flex flex-col gap-[3px] text-[11px] text-dim">
            <span>tri</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}>
              <option value="recent">plus récent</option>
              <option value="name">alphabétique</option>
              <option value="usage">plus utilisées</option>
            </select>
          </label>
          <div className="ml-auto flex items-center gap-[2px]" role="group" aria-label="Taille des vignettes">
            <button
              type="button"
              className="btn sm"
              aria-pressed={density === 'compact'}
              onClick={() => setDensity('compact')}
            >
              compact
            </button>
            <button
              type="button"
              className="btn sm"
              aria-pressed={density === 'comfortable'}
              onClick={() => setDensity('comfortable')}
            >
              confortable
            </button>
          </div>
        </div>
      )}

      <div
        className="mb-[14px] grid gap-[10px]"
        style={{ gridTemplateColumns: GRID_COLS[density] }}
        id="poseGrid"
      >
        {rows.length ? (
          rows.map((row) => (
            <PoseCard
              key={row.name}
              name={row.name}
              label={row.label}
              source={row.source}
              scenesUsing={row.scenesUsing}
              busy={busyNames.has(row.name)}
              onDelete={() => onDelete(row.name, row.scenesUsing)}
              onDuplicate={() => onDuplicate(row.name)}
              onRename={(label) => onRename(row.name, label)}
            />
          ))
        ) : (
          <div className="empty col-span-full p-[24px]">
            {/* The only way to have rows.length === 0 while totalCount > 0
                is an active filter — unfiltered, rows mirrors every pose. */}
            {totalCount === 0 ? "aucun squelette pour l'instant" : 'aucun squelette ne correspond à ces filtres'}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-[12px]">
        <label className="btn sm" htmlFor="poseFile">
          choisir une photo
        </label>
        <input
          type="file"
          id="poseFile"
          accept="image/png,image/jpeg,image/webp"
          hidden
          ref={fileInput}
          onChange={() => setFileName(fileInput.current?.files?.[0]?.name ?? '')}
        />
        <span className="tiny" id="poseFileName">
          {fileName}
        </span>
        <button className="btn" id="btnPoseExtract" disabled={!fileName || busy} onClick={extract}>
          Extraire le squelette
        </button>
        <span className="tiny" id="poseMsg" role="status">
          {message}
        </span>
      </div>

      {/* Attributing a pose TO a scene stays on the scene card, in the Scenes
          sub-view: it is a property of the scene, not of the skeleton. */}
      <p className="tiny mt-[18px] mb-0">
        Pour <b>imposer</b> un de ces squelettes à une scène, c'est sur la carte
        de la scène — sous-vue <b>Scènes</b>.
      </p>
    </div>
  )
}
