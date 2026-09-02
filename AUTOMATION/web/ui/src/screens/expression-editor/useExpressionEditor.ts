/* State and gestures of ONE tone's expression range: hydrates from the
   taxonomy (`useTaxonomy` — the same `/api/creative` every tone picker in
   the app already reads), previews on an already-produced photo, saves the
   range back. */
import { useCallback, useEffect, useRef, useState } from 'react'

import { errorOf, type ActionLike, type Schema } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useTaxonomy } from '../../state/TaxonomyContext'
import { PARAM_BOUNDS, PARAM_LABELS, type ExpressionParamName } from './expressionBounds'

export type GalleryItem = Schema<'GalleryItem'>
type SavedRange = Schema<'ExpressionRangeParams'>
type Params = Record<ExpressionParamName, ParamState>

export type ParamState = {
  /** Whether this parameter is part of the tone's SAVED range — an
      unincluded parameter keeps its own trial/min/max around (so toggling
      it back on does not lose what was there), it just drops out of what
      `save()` sends. */
  included: boolean
  /** The single value the live preview renders — independent of `included`:
      exploring a parameter does not commit it to the tone. */
  trial: number
  min: number
  max: number
}

export type SaveResult = { ok: true } | { ok: false; erreur: string }

const PARAM_NAMES = Object.keys(PARAM_BOUNDS) as ExpressionParamName[]

// Same constants as usePoseEditor.ts's own history: a drag or a burst of
// keystrokes reports many calls in a row — one undo step per burst, not one
// per event, or undoing a single slider drag would take a hundred Ctrl+Z.
const HISTORY_COALESCE_MS = 400
const HISTORY_LIMIT = 100

function initialParamState(saved: SavedRange | null | undefined): Params {
  const out = {} as Params
  for (const name of PARAM_NAMES) {
    const range = saved?.[name]
    out[name] = range
      ? { included: true, trial: range[0], min: range[0], max: range[1] }
      : { included: false, trial: 0, min: 0, max: 0 }
  }
  return out
}

export function useExpressionEditor(toneKey: string) {
  const api = useApi()
  const { creative, reload: reloadTaxonomy } = useTaxonomy()
  const tone = creative?.tones.find((t) => t.key === toneKey) ?? null

  const [params, setParams] = useState<Params | null>(null)
  const [dirty, setDirty] = useState(false)
  const past = useRef<Params[]>([])
  const future = useRef<Params[]>([])
  const lastPushAt = useRef(0)

  // Re-hydrates when the TONE changes (a different key, navigated to from
  // the picker below) — never on an incidental `creative` refresh for the
  // SAME tone, which would otherwise clobber edits in progress right after
  // `save()` calls `reloadTaxonomy()`.
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!creative || hydratedFor.current === toneKey) return
    setParams(initialParamState(tone?.expression))
    setDirty(false)
    past.current = []
    future.current = []
    hydratedFor.current = toneKey
  }, [creative, tone, toneKey])

  const [photos, setPhotos] = useState<GalleryItem[] | null>(null)
  const [photosError, setPhotosError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void api.get<{ items?: GalleryItem[] }>('/api/gallery').then((response) => {
      if (cancelled) return
      const failure = errorOf(response)
      if (failure) {
        setPhotosError(failure)
        return
      }
      setPhotos(response.items ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [api])

  const [photo, setPhoto] = useState<GalleryItem | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [scoreAfter, setScoreAfter] = useState<number | null>(null)
  const [viewingOriginal, setViewingOriginal] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    [],
  )

  /** Picking a photo drops whatever preview/score is on screen — found in
      testing, not reading: without this, choosing a NEW photo after a
      successful render left the PREVIOUS photo's rendered image and identity
      score on screen (the grid's own selection highlight moved to the new
      photo, nothing else did), which reads as belonging to it. */
  const selectPhoto = useCallback((next: GalleryItem) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreviewUrl(null)
    setScoreAfter(null)
    setRenderError(null)
    setViewingOriginal(false)
    setPhoto(next)
  }, [])

  const toggleViewingOriginal = useCallback(() => setViewingOriginal((v) => !v), [])

  /** Coalesced by time — dragging the trial slider or typing into a field
      fires many calls in a burst; one undo step per burst, matching
      usePoseEditor.ts's own `update()`. */
  const updateParams = useCallback((updater: (current: Params) => Params) => {
    setParams((current) => {
      if (!current) return current
      const now = Date.now()
      if (now - lastPushAt.current > HISTORY_COALESCE_MS) {
        past.current.push(current)
        if (past.current.length > HISTORY_LIMIT) past.current.shift()
      }
      lastPushAt.current = now
      return updater(current)
    })
    future.current = []
    setDirty(true)
  }, [])

  /** Always a FRESH undo step — a discrete click (toggle, "fixer comme
      min/max") must never merge with an unrelated drag that happened to
      land in the same coalescing window, matching usePoseEditor.ts's own
      `applyAction()` and the bug it was written to fix there (two quick
      discrete actions collapsing into one undo step). */
  const applyParamsAction = useCallback((updater: (current: Params) => Params) => {
    setParams((current) => {
      if (!current) return current
      past.current.push(current)
      if (past.current.length > HISTORY_LIMIT) past.current.shift()
      return updater(current)
    })
    future.current = []
    lastPushAt.current = 0
    setDirty(true)
  }, [])

  const undo = useCallback(() => {
    setParams((current) => {
      const prev = past.current.pop()
      if (!prev || !current) return current
      future.current.push(current)
      return prev
    })
    lastPushAt.current = 0
  }, [])

  const redo = useCallback(() => {
    setParams((current) => {
      const next = future.current.pop()
      if (!next || !current) return current
      past.current.push(current)
      return next
    })
    lastPushAt.current = 0
  }, [])

  const setTrial = useCallback(
    (name: ExpressionParamName, value: number) => {
      updateParams((current) => ({ ...current, [name]: { ...current[name], trial: value } }))
    },
    [updateParams],
  )

  const setMin = useCallback(
    (name: ExpressionParamName, value: number) => {
      updateParams((current) => ({ ...current, [name]: { ...current[name], min: value } }))
    },
    [updateParams],
  )

  const setMax = useCallback(
    (name: ExpressionParamName, value: number) => {
      updateParams((current) => ({ ...current, [name]: { ...current[name], max: value } }))
    },
    [updateParams],
  )

  const toggleIncluded = useCallback(
    (name: ExpressionParamName) => {
      applyParamsAction((current) => ({ ...current, [name]: { ...current[name], included: !current[name].included } }))
    },
    [applyParamsAction],
  )

  /** "Fixer comme min/max depuis l'essai" — widens the OTHER bound if the
      trial value would otherwise put min above max, rather than refusing:
      the user just showed intent to move that edge past the other one. */
  const setAsMin = useCallback(
    (name: ExpressionParamName) => {
      applyParamsAction((current) => {
        const c = current[name]
        const min = c.trial
        return { ...current, [name]: { ...c, min, max: Math.max(min, c.max) } }
      })
    },
    [applyParamsAction],
  )

  const setAsMax = useCallback(
    (name: ExpressionParamName) => {
      applyParamsAction((current) => {
        const c = current[name]
        const max = c.trial
        return { ...current, [name]: { ...c, max, min: Math.min(c.min, max) } }
      })
    },
    [applyParamsAction],
  )

  const renderPreview = useCallback(async () => {
    if (!photo || !params) return
    setRendering(true)
    setRenderError(null)
    try {
      const trial = {} as Record<ExpressionParamName, number>
      for (const name of PARAM_NAMES) trial[name] = params[name].trial
      const result = await api.postForBlob('/api/expression/preview', {
        bucket: photo.bucket, space: photo.space, name: photo.name, params: trial,
      })
      if (!result.ok) {
        setRenderError(result.erreur)
        return
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const next = URL.createObjectURL(result.blob)
      previewUrlRef.current = next
      setPreviewUrl(next)
      setViewingOriginal(false)
      const header = result.headers.get('X-Identity-After')
      setScoreAfter(header ? Number(header) : null)
    } finally {
      setRendering(false)
    }
  }, [api, photo, params])

  const save = useCallback(async (): Promise<SaveResult> => {
    if (!params) return { ok: false, erreur: 'rien à enregistrer' }
    const payload: Partial<Record<ExpressionParamName, [number, number]>> = {}
    for (const name of PARAM_NAMES) {
      const p = params[name]
      if (!p.included) continue
      if (p.min > p.max) {
        return { ok: false, erreur: `${PARAM_LABELS[name]} : le minimum dépasse le maximum` }
      }
      payload[name] = [p.min, p.max]
    }
    setSaving(true)
    try {
      const response = await api.post<ActionLike>('/api/expression/tone', { tone: toneKey, params: payload })
      const failure = errorOf(response)
      if (failure) return { ok: false, erreur: failure }
      setDirty(false)
      await reloadTaxonomy()
      return { ok: true }
    } finally {
      setSaving(false)
    }
  }, [api, params, toneKey, reloadTaxonomy])

  return {
    tone, creativeLoaded: creative !== null,
    params, dirty,
    setTrial, setMin, setMax, toggleIncluded, setAsMin, setAsMax,
    undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0,
    photos, photosError, photo, selectPhoto,
    previewUrl, scoreAfter, viewingOriginal, toggleViewingOriginal,
    rendering, renderError, renderPreview,
    saving, save,
  }
}
