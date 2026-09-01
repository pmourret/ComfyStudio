/* Bank of OpenPose skeletons (INPUTS/POSE/), consumed by the pose selector of
   the scene cards. Ported from the poses half of `static/advanced.js`.

   THE ONLY PLACE OF THE STUDIO WHERE A REAL PHOTO CAN TRANSIT — and it is never
   kept: AUTOMATION/pose_tools.py removes it from ComfyUI/input at the end of the
   extraction, success or failure. The interface says so, because the person
   choosing the file is the one who needs to know. */
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { errorOf, type ActionLike } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useConfirm } from '../../chrome/ConfirmContext'
import { useToast } from '../../chrome/ToastContext'
import { useScenes } from '../../state/ScenesStoreContext'
import { PATHS } from '../../app/routes'

type ExtractResponse = ActionLike & { name?: string }

export function PosesView() {
  const api = useApi()
  const confirm = useConfirm()
  const toast = useToast()
  const { poses, load } = useScenes()
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const remove = async (name: string) => {
    const ok = await confirm({
      title: 'Retirer ce squelette ?',
      button: 'Retirer',
      body: (
        <p>
          Une scène qui le référence encore le perdra au prochain enregistrement
          — <code>{name}</code> deviendra introuvable, ce que la validation
          signalera.
        </p>
      ),
    })
    if (!ok) return
    const response = await api.post<ActionLike>('/api/pose/delete', { name })
    const failure = errorOf(response)
    if (failure) {
      toast(failure || 'échec')
      return
    }
    toast('squelette retiré')
    // guarded reload: an edit in progress on the Scenes view is not overwritten
    await load(true)
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
      await load(true)
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
            {poses.length ? `— ${poses.length}` : ''}
          </span>
        </h2>
        <Link className="btn sm" to={PATHS.poseEditor}>
          + Nouvelle pose
        </Link>
      </div>
      <p className="tiny mt-[6px] mb-[16px]">
        Un squelette OpenPose extrait d'une photo, imposable à une scène
        (ControlNet, cran SFW seulement). <b>La photo source ne reste jamais sur
        le disque</b> : seul le squelette est gardé. « + Nouvelle pose » part
        d'un gabarit, sans photo — à corriger point par point ensuite.
      </p>

      <div
        className="mb-[14px] grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-[10px]"
        id="poseGrid"
      >
        {poses.length ? (
          poses.map((name) => (
            <div
              className="relative aspect-square overflow-hidden rounded-[8px]
                         border border-line2 bg-black"
              data-pose-card
              data-n={name}
              key={name}
            >
              <img
                className="h-full w-full object-contain"
                loading="lazy"
                src={`/img/pose?name=${encodeURIComponent(name)}`}
                alt={name}
              />
              <button
                className="absolute top-[4px] right-[4px] m-0 h-[20px] w-[20px]
                           cursor-pointer rounded-[50%] border border-danger-line
                           bg-scrim text-[13px] leading-none text-danger-txt
                           hover:bg-danger-bg focus-visible:outline-2
                           focus-visible:outline-focus focus-visible:outline-offset-2"
                data-del
                title="retirer de la banque"
                onClick={() => remove(name)}
              >
                ×
              </button>
              <Link
                className="absolute bottom-[4px] left-[4px] rounded-[6px] border
                           border-line2 bg-scrim px-[6px] py-[2px] text-[10.5px]
                           text-dim no-underline hover:text-txt
                           focus-visible:outline-2 focus-visible:outline-focus
                           focus-visible:outline-offset-2"
                to={`${PATHS.poseEditor}/${encodeURIComponent(name)}`}
              >
                éditer
              </Link>
            </div>
          ))
        ) : (
          <div className="empty col-span-full p-[24px]">
            aucun squelette pour l'instant
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
        <span className="tiny" id="poseMsg">
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
