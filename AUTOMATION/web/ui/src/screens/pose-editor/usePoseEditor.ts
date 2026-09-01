/* Loading, editing and saving ONE pose — shared by the dedicated screen and
   the modal opened from the scene composer, so the two never diverge on
   what "save" or "save as new" actually do. */
import { useCallback, useEffect, useState } from 'react'

import { errorOf } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useScenes } from '../../state/ScenesStoreContext'
import { editableToFrame, frameToEditable, type PoseFrame, type RawPoseFrame } from './poseFrame'

export type PoseEditorSource =
  | { kind: 'pose'; name: string }
  | { kind: 'preset'; nom: string }

export type SaveResult = { ok: true; name: string } | { ok: false; erreur: string }

export function usePoseEditor(source: PoseEditorSource) {
  const api = useApi()
  const { load: reloadSceneBank } = useScenes()
  const [pose, setPose] = useState<PoseFrame | null>(null)
  // The pose's OWN saved name — null until the first save of a from-scratch
  // pose. Distinct from `source`, which never changes after mount: editing
  // an extracted pose and then "saving as new" must keep pointing `name` at
  // the FRESH file, not silently drift back to what the screen was opened
  // with.
  const [name, setName] = useState<string | null>(source.kind === 'pose' ? source.name : null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const url =
      source.kind === 'pose'
        ? `/api/pose/keypoints?name=${encodeURIComponent(source.name)}`
        : `/api/pose/preset?nom=${encodeURIComponent(source.nom)}`
    const response = await api.get<RawPoseFrame>(url)
    const failure = errorOf(response)
    if (failure) {
      setLoadError(failure)
      setLoading(false)
      return
    }
    setPose(frameToEditable(response))
    setDirty(false)
    setLoading(false)
  }, [api, source])

  useEffect(() => {
    void load()
    // `source` is fixed for the lifetime of a mounted editor (a new pose to
    // edit means a new screen/modal instance, not a prop change) — this
    // effect is the initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = useCallback((next: PoseFrame) => {
    setPose(next)
    setDirty(true)
  }, [])

  /** `asNew`: keep whatever is currently saved under `name` untouched and
      branch a fresh pose instead — see PoseSaveRequest's own doc for why
      that is just "omit `name`", not a second parameter. */
  const save = useCallback(
    async (opts?: { asNew?: boolean }): Promise<SaveResult> => {
      if (!pose) return { ok: false, erreur: 'rien à enregistrer' }
      setSaving(true)
      try {
        const response = await api.post<{ ok?: boolean; erreur?: string; name?: string }>(
          '/api/pose/save',
          { name: opts?.asNew ? null : name, keypoints: editableToFrame(pose) },
        )
        const failure = errorOf(response)
        if (failure || !response.name) return { ok: false, erreur: failure || 'échec' }
        setName(response.name)
        setDirty(false)
        // The scene bank's own `poses` list (GET /api/scenes) is where every
        // pose picker in the app reads from — a save that names a NEW pose
        // (brand-new or "save as new") is invisible elsewhere until this
        // runs, same reload `PosesView` already calls after extract/delete.
        void reloadSceneBank(true)
        return { ok: true, name: response.name }
      } finally {
        setSaving(false)
      }
    },
    [api, pose, name, reloadSceneBank],
  )

  return { pose, name, loading, loadError, saving, dirty, update, save, reload: load }
}
