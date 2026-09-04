/* State and gestures of the advanced (Lightroom-style) photo editor: loads a
   photo's persisted layer stack, edits it, saves it back. Compositing itself
   is `photoEditorLayersPixels.ts`'s job (pure, no React) — this hook only
   owns the STACK and its history, never a canvas or a DOM ref
   (frontend.md's screen split: the canvas ref and the draw effect live in
   `PhotoEditorAdvancedScreen.tsx`). */
import { useCallback, useEffect, useRef, useState } from 'react'

import { errorOf, type Schema } from '../../api/client'
import { useApi } from '../../api/useApi'
import {
  baseLayer, newLayer, PRESETS, type Layer, type LayerKind, type LayerSettings,
} from './photoEditorLayersPixels'

export type PhotoEditorAdvancedSource = { bucket: string; space: string; name: string }
export type SaveResult = { ok: true; name: string; remplace: boolean } | { ok: false; erreur: string }

/* Same coalescing window as usePoseEditor.ts / useExpressionEditor.ts's own
   history: a slider drag reports many calls in a row — one undo step per
   burst, not one per event. Unlike those two, no HISTORY_LIMIT cap here:
   `dirty` below is an INDEX comparison against the last-saved cursor, and
   trimming old entries would shift indices out from under it. A layer
   stack's history entries are tiny (a handful of small objects, nothing
   like a pose's keypoint array) — bounding memory was never the reason the
   other two editors cap at 100, so there is nothing to trade off by not
   capping this one. */
const HISTORY_COALESCE_MS = 400

/** One point in the undo/redo timeline. `structural` distinguishes the two
    consumers of this SAME array: Ctrl+Z steps through every entry
    (coalesced slider drags included), but the "Historique" panel only ever
    lists the STRUCTURAL ones (design-pass §7b: "actions structurantes —
    ajout/suppression de calque, préréglage appliqué") — a filtered VIEW of
    this array, not a second one to keep in sync. */
type HistoryEntry = { layers: Layer[]; label: string; structural: boolean }
type HistoryState = { entries: HistoryEntry[]; cursor: number }

const baseLayerOf = (layers: readonly Layer[]) =>
  layers.find((l) => l.kind === 'photo') ?? layers[layers.length - 1]

export function usePhotoEditorAdvanced(source: PhotoEditorAdvancedSource) {
  const api = useApi()
  const [hist, setHist] = useState<HistoryState>({
    entries: [{ layers: [baseLayer()], label: 'Ouverture', structural: true }],
    cursor: 0,
  })
  const [selectedLayerId, setSelectedLayerId] = useState('base')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [beforeAfter, setBeforeAfter] = useState(false)
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null)
  const [imageError, setImageError] = useState(false)

  const lastPushAt = useRef(0)
  const savedAtCursor = useRef(0)

  const layers = hist.entries[hist.cursor].layers
  const selectedLayer = layers.find((l) => l.id === selectedLayerId) ?? baseLayerOf(layers)
  const dirty = hist.cursor !== savedAtCursor.current

  const query = `bucket=${encodeURIComponent(source.bucket)}&space=${encodeURIComponent(source.space)}&name=${encodeURIComponent(source.name)}`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void api.get<Schema<'PhotoEditorLayersResponse'>>(`/api/photo-editor/layers?${query}`).then((response) => {
      if (cancelled) return
      const failure = errorOf(response)
      if (failure) {
        setLoadError(failure)
        setLoading(false)
        return
      }
      const loaded = response.layers && response.layers.length > 0 ? response.layers : [baseLayer()]
      setHist({ entries: [{ layers: loaded, label: 'Ouverture', structural: true }], cursor: 0 })
      savedAtCursor.current = 0
      setSelectedLayerId(baseLayerOf(loaded).id)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // `source` is fixed for the lifetime of a mounted screen, same
    // reasoning as usePoseEditor.ts's own initial-load effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const image = new Image()
    image.onload = () => setImageEl(image)
    image.onerror = () => setImageError(true)
    image.src = api.image({ bucket: source.bucket, space: source.space, name: source.name })
    return () => {
      image.onload = null
      image.onerror = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.bucket, source.space, source.name])

  /** Coalesced by time (slider drag) — never shows in the History panel on
      its own (`structural: false`).

      `coalesce` is decided HERE, before `setHist` runs, and only its
      boolean RESULT is captured by the updater closure below — reading
      `lastPushAt.current` again from INSIDE the updater was the actual
      bug (found by testing, not by reading the JSX): `setHist`'s updater
      is not guaranteed to run before the very next line of this function,
      so `lastPushAt.current = now` a few lines down could — and did —
      land BEFORE React finally invoked the updater, making every single
      push measure `now - now = 0` and coalesce into the PREVIOUS
      structural entry no matter how much time had actually passed
      (confirmed live: one slider drag right after adding a layer silently
      merged into "Calque ajouté", so a single Ctrl+Z undid both at once). */
  const push = useCallback((updater: (current: Layer[]) => Layer[]) => {
    const now = Date.now()
    const coalesce = now - lastPushAt.current <= HISTORY_COALESCE_MS
    setHist((h) => {
      const current = h.entries[h.cursor].layers
      const next = updater(current)
      if (coalesce) {
        const entries = h.entries.slice(0, h.cursor + 1)
        entries[h.cursor] = { ...entries[h.cursor], layers: next }
        return { entries, cursor: h.cursor }
      }
      const entries = [...h.entries.slice(0, h.cursor + 1), { layers: next, label: '', structural: false }]
      return { entries, cursor: entries.length - 1 }
    })
    lastPushAt.current = now
  }, [])

  /** ALWAYS a fresh, STRUCTURAL step — add/remove a layer, apply a preset:
      design-pass §7b calls these out explicitly as one grouped undo step
      each, and they are what the History panel actually lists. */
  const pushAction = useCallback((updater: (current: Layer[]) => Layer[], label: string) => {
    setHist((h) => {
      const current = h.entries[h.cursor].layers
      const next = updater(current)
      const entries = [...h.entries.slice(0, h.cursor + 1), { layers: next, label, structural: true }]
      return { entries, cursor: entries.length - 1 }
    })
    // A fresh gesture right after must not merge into what was just pushed
    // — same guard usePoseEditor.ts's own applyAction() uses.
    lastPushAt.current = 0
  }, [])

  /* Jumping the cursor (undo/redo/history click) must ALSO reset the
     coalescing clock: without this, a slider drag landing inside the same
     400ms window as the jump would mutate the checkpoint just landed on
     instead of branching a fresh entry from it (usePoseEditor.ts's own
     undo()/redo() carry the identical fix, for the identical reason). */
  const jumpTo = useCallback((index: number) => {
    setHist((h) => ({ ...h, cursor: Math.max(0, Math.min(index, h.entries.length - 1)) }))
    lastPushAt.current = 0
  }, [])
  const undo = useCallback(() => jumpTo(hist.cursor - 1), [jumpTo, hist.cursor])
  const redo = useCallback(() => jumpTo(hist.cursor + 1), [jumpTo, hist.cursor])
  const canUndo = hist.cursor > 0
  const canRedo = hist.cursor < hist.entries.length - 1

  const updateSelectedSettings = useCallback(
    (patch: Partial<LayerSettings>) => {
      push((current) =>
        current.map((l) => (l.id === selectedLayerId ? { ...l, settings: { ...l.settings, ...patch } } : l)),
      )
    },
    [push, selectedLayerId],
  )

  const addLayer = useCallback(
    (kind: LayerKind, label: string) => {
      const layer = newLayer(kind, label)
      pushAction((current) => [layer, ...current], `Calque ajouté — ${label}`)
      setSelectedLayerId(layer.id)
    },
    [pushAction],
  )

  const removeLayer = useCallback(
    (id: string) => {
      const removed = layers.find((l) => l.id === id)
      if (!removed || removed.kind === 'photo') return
      pushAction((current) => current.filter((l) => l.id !== id), `Calque supprimé — ${removed.name || removed.kind}`)
      if (selectedLayerId === id) setSelectedLayerId(baseLayerOf(layers).id)
    },
    [pushAction, layers, selectedLayerId],
  )

  const toggleVisible = useCallback(
    (id: string) => {
      pushAction(
        (current) => current.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
        'Visibilité changée',
      )
    },
    [pushAction],
  )

  const setOpacity = useCallback(
    (id: string, value: number) => {
      push((current) => current.map((l) => (l.id === id ? { ...l, opacity: value } : l)))
    },
    [push],
  )

  const reorder = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const i = layers.findIndex((l) => l.id === id)
      const j = direction === 'up' ? i - 1 : i + 1
      // the base layer (always last) never moves, and nothing may move past it
      if (i < 0 || j < 0 || j >= layers.length || layers[i].locked || layers[j].locked) return
      pushAction((current) => {
        const next = [...current]
        ;[next[i], next[j]] = [next[j], next[i]]
        return next
      }, `Calque déplacé — ${layers[i].name || layers[i].kind}`)
    },
    [pushAction, layers],
  )

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = PRESETS.find((p) => p.id === presetId)
      if (!preset) return
      pushAction(
        (current) =>
          current.map((l) =>
            l.id === selectedLayerId ? { ...l, settings: { ...l.settings, ...preset.settings } } : l,
          ),
        `Préréglage appliqué — ${preset.label}`,
      )
    },
    [pushAction, selectedLayerId],
  )

  const save = useCallback(
    async (dataBase64: string, opts?: { remplacer?: boolean }): Promise<SaveResult> => {
      setSaving(true)
      try {
        const response = await api.post<Schema<'PhotoEditorSaveResponse'>>('/api/photo-editor/save', {
          name: source.name, bucket: source.bucket, space: source.space,
          remplacer: opts?.remplacer ?? false, layers, data_base64: dataBase64,
        })
        const failure = errorOf(response)
        if (failure || !response.name) return { ok: false, erreur: failure || 'échec' }
        savedAtCursor.current = hist.cursor
        return { ok: true, name: response.name, remplace: Boolean(response.remplace) }
      } finally {
        setSaving(false)
      }
    },
    [api, source, layers, hist.cursor],
  )

  return {
    loading, loadError, imageEl, imageError,
    layers, selectedLayer, selectedLayerId, selectLayer: setSelectedLayerId,
    dirty, saving,
    updateSelectedSettings, addLayer, removeLayer, toggleVisible, setOpacity, reorder, applyPreset,
    undo, redo, canUndo, canRedo, jumpTo,
    history: hist.entries, historyCursor: hist.cursor,
    beforeAfter, setBeforeAfter,
    save,
  }
}
