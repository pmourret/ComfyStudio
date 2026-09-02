/* Loading, editing and saving ONE pose — shared by the dedicated screen and
   the modal opened from the scene composer, so the two never diverge on
   what "save" or "save as new" actually do. */
import { useCallback, useEffect, useRef, useState } from 'react'

import { errorOf } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useScenes } from '../../state/ScenesStoreContext'
import { editableToFrame, frameToEditable, type PoseFrame, type RawPoseFrame } from './poseFrame'

// A drag reports every pointermove as its own `update()` call — one entry
// per PIXEL crossed would make undo useless (a hundred steps to get back to
// where a single drag started). Coalescing by time, not by drag lifecycle,
// keeps this hook the only place that knows about history: PoseCanvas stays
// unaware that undo exists at all.
const HISTORY_COALESCE_MS = 400
const HISTORY_LIMIT = 100

export type PoseEditorSource =
  | { kind: 'pose'; name: string }
  // `initialLabel`: the name typed in the "new pose" modal, applied on top
  // of the template's own points once loaded — the template contributes a
  // starting shape, never a starting name.
  | { kind: 'preset'; nom: string; initialLabel?: string }

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
  // Refs, not state: canUndo/canRedo below still read them fresh on every
  // render, because every push/pop here happens alongside a `setPose` call
  // whose new value is a genuinely different object — that alone forces the
  // render these two need. No separate "history changed" state to keep in
  // sync.
  const past = useRef<PoseFrame[]>([])
  const future = useRef<PoseFrame[]>([])
  const lastPushAt = useRef(0)

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
    const frame = frameToEditable(response)
    if (source.kind === 'preset' && source.initialLabel) frame.label = source.initialLabel
    setPose(frame)
    setDirty(false)
    past.current = []
    future.current = []
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
    setPose((current) => {
      if (current) {
        const now = Date.now()
        if (now - lastPushAt.current > HISTORY_COALESCE_MS) {
          past.current.push(current)
          if (past.current.length > HISTORY_LIMIT) past.current.shift()
        }
        lastPushAt.current = now
      }
      return next
    })
    future.current = []
    setDirty(true)
  }, [])

  /** Like `update`, but ALWAYS its own undo step — never coalesced with
      whatever came just before. `update`'s time window exists for ONE
      continuous drag reporting many pointermove events; a discrete,
      deliberate action (mirror left/right, and anything similar later)
      fired by a button click can legitimately land inside that same
      400ms window as a PRIOR unrelated action (confirmed live: mirroring
      the body then immediately mirroring a hand merged into a single
      undo step, undoing both when the user meant to undo one). This is
      the fix: push unconditionally, and reset `lastPushAt` so a quick
      drag right after doesn't merge INTO this action either — the same
      guard `undo`/`redo` already use for the same reason. */
  const applyAction = useCallback((next: PoseFrame) => {
    setPose((current) => {
      if (current) past.current.push(current)
      if (past.current.length > HISTORY_LIMIT) past.current.shift()
      return next
    })
    future.current = []
    lastPushAt.current = 0
    setDirty(true)
  }, [])

  const undo = useCallback(() => {
    setPose((current) => {
      const prev = past.current.pop()
      if (!prev || !current) return current
      future.current.push(current)
      return prev
    })
    // A fresh gesture right after undoing must not merge into the step just
    // undone — without this an undo followed by a drag could coalesce back
    // into the same past entry it just popped.
    lastPushAt.current = 0
    setDirty(true)
  }, [])

  const redo = useCallback(() => {
    setPose((current) => {
      const next = future.current.pop()
      if (!next || !current) return current
      past.current.push(current)
      return next
    })
    lastPushAt.current = 0
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

  /** The "create a template too" option on a from-scratch pose — writes the
      CURRENT frame into AUTOMATION/pose_presets/ under `label`, alongside
      (never instead of) `save()`. Independent of `name`/`dirty`: a template
      is not "the pose", so this never touches either. */
  const saveAsPreset = useCallback(
    async (label: string): Promise<SaveResult> => {
      if (!pose) return { ok: false, erreur: 'rien à enregistrer' }
      const response = await api.post<{ ok?: boolean; erreur?: string; nom?: string }>(
        '/api/pose/preset',
        { label, keypoints: editableToFrame(pose) },
      )
      const failure = errorOf(response)
      if (failure || !response.nom) return { ok: false, erreur: failure || 'échec' }
      return { ok: true, name: response.nom }
    },
    [api, pose],
  )

  return {
    pose, name, loading, loadError, saving, dirty, update, applyAction, save, saveAsPreset, reload: load,
    undo, redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }
}
