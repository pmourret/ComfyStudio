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

function initialParamState(saved: SavedRange | null | undefined): Record<ExpressionParamName, ParamState> {
  const out = {} as Record<ExpressionParamName, ParamState>
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

  const [params, setParams] = useState<Record<ExpressionParamName, ParamState> | null>(null)
  // Re-hydrates when the TONE changes (a different key, navigated to from
  // the picker below) — never on an incidental `creative` refresh for the
  // SAME tone, which would otherwise clobber edits in progress right after
  // `save()` calls `reloadTaxonomy()`.
  const hydratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!creative || hydratedFor.current === toneKey) return
    setParams(initialParamState(tone?.expression))
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

  const setTrial = useCallback((name: ExpressionParamName, value: number) => {
    setParams((prev) => prev && { ...prev, [name]: { ...prev[name], trial: value } })
  }, [])

  const setMin = useCallback((name: ExpressionParamName, value: number) => {
    setParams((prev) => prev && { ...prev, [name]: { ...prev[name], min: value } })
  }, [])

  const setMax = useCallback((name: ExpressionParamName, value: number) => {
    setParams((prev) => prev && { ...prev, [name]: { ...prev[name], max: value } })
  }, [])

  const toggleIncluded = useCallback((name: ExpressionParamName) => {
    setParams((prev) => prev && { ...prev, [name]: { ...prev[name], included: !prev[name].included } })
  }, [])

  /** "Fixer comme min/max depuis l'essai" — widens the OTHER bound if the
      trial value would otherwise put min above max, rather than refusing:
      the user just showed intent to move that edge past the other one. */
  const setAsMin = useCallback((name: ExpressionParamName) => {
    setParams((prev) => {
      if (!prev) return prev
      const current = prev[name]
      const min = current.trial
      return { ...prev, [name]: { ...current, min, max: Math.max(min, current.max) } }
    })
  }, [])

  const setAsMax = useCallback((name: ExpressionParamName) => {
    setParams((prev) => {
      if (!prev) return prev
      const current = prev[name]
      const max = current.trial
      return { ...prev, [name]: { ...current, max, min: Math.min(current.min, max) } }
    })
  }, [])

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
      await reloadTaxonomy()
      return { ok: true }
    } finally {
      setSaving(false)
    }
  }, [api, params, toneKey, reloadTaxonomy])

  return {
    tone, creativeLoaded: creative !== null,
    params,
    setTrial, setMin, setMax, toggleIncluded, setAsMin, setAsMax,
    photos, photosError, photo, setPhoto,
    previewUrl, scoreAfter, rendering, renderError, renderPreview,
    saving, save,
  }
}
