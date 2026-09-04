/* State and gestures of ONE tone's expression range: hydrates from the
   taxonomy (`useTaxonomy` — the same `/api/creative` every tone picker in
   the app already reads), previews on up to 3 already-produced photos at
   once (design pass, `DOCS/design-pass/screen-expression-editor.md`, B1 —
   one representative photo was never enough to trust a range), saves the
   range back. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

/** One selected photo's render state — B1: each of the up to 3 selected
    photos gets its OWN result, so one failing (e.g. no face detected) never
    hides the others that succeeded. */
export type PhotoResult = {
  previewUrl: string | null
  scoreAfter: number | null
  viewingOriginal: boolean
  rendering: boolean
  renderError: string | null
  /** Set on a successful render — compared against `paramsChangedAt` (B5) to
      flag a card whose params moved since it was last rendered. */
  renderedAt: number | null
}

const EMPTY_RESULT: PhotoResult = {
  previewUrl: null, scoreAfter: null, viewingOriginal: false,
  rendering: false, renderError: null, renderedAt: null,
}

/** A tone `copyFromTone` can pull a range from — B3. */
export type CopySource = { key: string; label: string; paramLabels: string[] }

export type SaveResult = { ok: true } | { ok: false; erreur: string }

const PARAM_NAMES = Object.keys(PARAM_BOUNDS) as ExpressionParamName[]

/** Design pass §B1/§B4: "jusqu'à 3" — a 4th selection is rejected, never
    silently dropped (the caller toasts on `'limit'`). */
export const MAX_SELECTED_PHOTOS = 3

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
  /** B5: bumped by every params-changing gesture (`updateParams` AND
      `applyParamsAction`, so a drag or a discrete action both count), never
      by the hydration effect below — hydrating is not "the user changed
      something since the last render". */
  const paramsChangedAt = useRef(0)

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

  const [selectedPhotos, setSelectedPhotos] = useState<GalleryItem[]>([])
  const [results, setResults] = useState<Record<string, PhotoResult>>({})
  const [saving, setSaving] = useState(false)

  const setResultFor = useCallback((name: string, updater: (current: PhotoResult) => PhotoResult) => {
    setResults((current) => ({ ...current, [name]: updater(current[name] ?? EMPTY_RESULT) }))
  }, [])

  // Revokes every still-live object URL on unmount only — a ref mirrors
  // `results` so this effect does not need to re-run (and re-attach a fresh
  // cleanup) on every render just to stay one render behind.
  const resultsRef = useRef(results)
  resultsRef.current = results
  useEffect(
    () => () => {
      Object.values(resultsRef.current).forEach((r) => {
        if (r.previewUrl) URL.revokeObjectURL(r.previewUrl)
      })
    },
    [],
  )

  /** Toggles a photo in/out of the up-to-3 selection. Returns what happened
      so the SCREEN can toast on `'limit'` (B4) — this hook stays state/
      gestures only, no UI feedback of its own (frontend.md's screen split). */
  const togglePhotoSelection = useCallback(
    (next: GalleryItem): 'added' | 'removed' | 'limit' => {
      const alreadySelected = selectedPhotos.some((p) => p.name === next.name)
      if (alreadySelected) {
        setSelectedPhotos((current) => current.filter((p) => p.name !== next.name))
        setResults((current) => {
          const entry = current[next.name]
          if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl)
          const rest = { ...current }
          delete rest[next.name]
          return rest
        })
        return 'removed'
      }
      if (selectedPhotos.length >= MAX_SELECTED_PHOTOS) return 'limit'
      setSelectedPhotos((current) => [...current, next])
      return 'added'
    },
    [selectedPhotos],
  )

  const toggleViewingOriginal = useCallback(
    (name: string) => {
      setResultFor(name, (r) => ({ ...r, viewingOriginal: !r.viewingOriginal }))
    },
    [setResultFor],
  )

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
    paramsChangedAt.current = Date.now()
    setDirty(true)
  }, [])

  /** Always a FRESH undo step — a discrete click (toggle, "fixer comme
      min/max", copier depuis un autre ton) must never merge with an
      unrelated drag that happened to land in the same coalescing window,
      matching usePoseEditor.ts's own `applyAction()` and the bug it was
      written to fix there (two quick discrete actions collapsing into one
      undo step). */
  const applyParamsAction = useCallback((updater: (current: Params) => Params) => {
    setParams((current) => {
      if (!current) return current
      past.current.push(current)
      if (past.current.length > HISTORY_LIMIT) past.current.shift()
      return updater(current)
    })
    future.current = []
    lastPushAt.current = 0
    paramsChangedAt.current = Date.now()
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

  /** B3 — other tones that already have a saved range to copy from, with
      the labels of what each includes (the menu's subtitle). */
  const copySources = useMemo((): CopySource[] => {
    if (!creative) return []
    return creative.tones
      .filter((t) => t.key !== toneKey && t.expression && Object.keys(t.expression).length > 0)
      .map((t) => ({
        key: t.key,
        label: t.label || t.key,
        paramLabels: (Object.keys(t.expression as SavedRange) as ExpressionParamName[]).map((n) => PARAM_LABELS[n]),
      }))
  }, [creative, toneKey])

  /** One undo step for the whole copy (`applyParamsAction`, not
      `updateParams`) — a single Ctrl+Z must undo the copy entirely, not
      merge with whatever the user types next (design pass §B3). */
  const copyFromTone = useCallback(
    (sourceKey: string) => {
      const source = creative?.tones.find((t) => t.key === sourceKey)
      const range = source?.expression
      if (!range) return
      applyParamsAction((current) => {
        const next = { ...current }
        for (const name of Object.keys(range) as ExpressionParamName[]) {
          const bounds = range[name]
          if (!bounds) continue
          next[name] = { ...next[name], included: true, min: bounds[0], max: bounds[1] }
        }
        return next
      })
    },
    [creative, applyParamsAction],
  )

  /** Renders ONE photo — used both by `renderAll()` and by a single card's
      "réessayer" (B1). Independent of every other photo's own render: an
      exception from one never keeps the others from resolving, and a
      `finally` (not a duplicated `rendering: false` in both branches) turns
      it off exactly once regardless of which branch ran. */
  const renderOne = useCallback(
    async (photo: GalleryItem) => {
      if (!params) return
      setResultFor(photo.name, (r) => ({ ...r, rendering: true, renderError: null }))
      try {
        const trial = {} as Record<ExpressionParamName, number>
        for (const name of PARAM_NAMES) trial[name] = params[name].trial
        const result = await api.postForBlob('/api/expression/preview', {
          bucket: photo.bucket, space: photo.space, name: photo.name, params: trial,
        })
        if (!result.ok) {
          setResultFor(photo.name, (r) => ({ ...r, renderError: result.erreur }))
          return
        }
        const next = URL.createObjectURL(result.blob)
        const header = result.headers.get('X-Identity-After')
        setResultFor(photo.name, (r) => {
          if (r.previewUrl) URL.revokeObjectURL(r.previewUrl)
          return {
            ...r, previewUrl: next, scoreAfter: header ? Number(header) : null,
            viewingOriginal: false, renderError: null, renderedAt: Date.now(),
          }
        })
      } finally {
        setResultFor(photo.name, (r) => ({ ...r, rendering: false }))
      }
    },
    [api, params, setResultFor],
  )

  const renderAll = useCallback(() => {
    void Promise.all(selectedPhotos.map((photo) => renderOne(photo)))
  }, [selectedPhotos, renderOne])

  const retryPhoto = useCallback(
    (name: string) => {
      const photo = selectedPhotos.find((p) => p.name === name)
      if (photo) void renderOne(photo)
    },
    [selectedPhotos, renderOne],
  )

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
    copySources, copyFromTone,
    photos, photosError,
    selectedPhotos, togglePhotoSelection, results,
    toggleViewingOriginal, renderAll, retryPhoto,
    paramsChangedAt,
    saving, save,
  }
}
