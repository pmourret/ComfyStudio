/* The advanced (Lightroom-style) photo editor — `${PATHS.photoEditorAdvanced}
   /:name`, `bucket`/`space` as query params (see routes.ts's own note on why
   a photo resolves fully from those three, unlike the from-scratch pose
   flow's router `state`). Reached from the simplified modal's "Éditeur
   avancé →" link (screens/review/PhotoEditor.tsx).

   Composition only (frontend.md): state/gestures live in
   usePhotoEditorAdvanced.ts, the compositing math in
   photoEditorLayersPixels.ts. This file owns the one thing neither of those
   should — the canvas ref and the draw effect, same split PhotoEditor.tsx
   itself uses for its own single-layer canvas. */
import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { screenForImage } from '../../app/routes'
import { useConfirm } from '../../chrome/ConfirmContext'
import { useToast } from '../../chrome/ToastContext'
import { useZoomPan } from '../../chrome/useZoomPan'
import { ZoomControls } from '../../chrome/ZoomControls'
import { AdvancedColorPanel } from './AdvancedColorPanel'
import { AiRetouchPanel } from './AiRetouchPanel'
import { Histogram } from './Histogram'
import { HistoryPanel } from './HistoryPanel'
import { LayerList } from './LayerList'
import { LayerSettingsPanel } from './LayerSettingsPanel'
import { renderMaskAlpha } from './maskMath'
import { DEFAULT_MASK } from './MaskPicker'
import { PerspectivePanel } from './PerspectivePanel'
import { composeLayers, computeHistogram, NEUTRAL_SETTINGS, type Mask } from './photoEditorLayersPixels'
import { PresetsPanel } from './PresetsPanel'
import { SharpenBlurPanel } from './SharpenBlurPanel'
import { usePhotoEditorAdvanced } from './usePhotoEditorAdvanced'
import { UndoRedoButtons } from '../pose-editor/UndoRedoButtons'

export function PhotoEditorAdvancedScreen() {
  const { name } = useParams<{ name: string }>()
  const [searchParams] = useSearchParams()
  const bucket = searchParams.get('bucket') || 'OK'
  const space = searchParams.get('space') || 'sfw'
  if (!name) return null // unreachable: the route declares `:name` without `?`
  return <PhotoEditorAdvancedInner bucket={bucket} space={space} name={name} />
}

function PhotoEditorAdvancedInner({ bucket, space, name }: { bucket: string; space: string; name: string }) {
  const confirm = useConfirm()
  const toast = useToast()
  const {
    loading, loadError, imageEl, imageError,
    layers, selectedLayer, selectedLayerId, selectLayer,
    dirty, saving,
    updateSelectedSettings, addLayer, removeLayer, toggleVisible, setOpacity, reorder, applyPreset,
    undo, redo, canUndo, canRedo,
    history, historyCursor, jumpTo,
    beforeAfter, setBeforeAfter,
    save,
  } = usePhotoEditorAdvanced({ bucket, space, name })

  const [tab, setTab] = useState<'presets' | 'history'>('presets')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [histogram, setHistogram] = useState<number[] | null>(null)
  const zoom = useZoomPan({
    stageRef,
    naturalWidth: imageEl?.naturalWidth ?? 0,
    naturalHeight: imageEl?.naturalHeight ?? 0,
  })

  /* Mask placement (design-pass §7b masquage — shared by selective blur
     AND AI retouch, same `Mask` field shape, different `LayerSettings`
     key) happens ON THE PREVIEW ITSELF: pinceau/dégradé/radial need to see
     the image, not just a slider. `null` = not editing either;
     'blur'/'ai' says which of `blurMask`/`aiMask` the live gesture below
     reads and writes. Exits automatically on a layer switch: painting on
     the wrong layer's mask because "Modifier sur l'aperçu" silently
     survived a selection change would be a real trap, not a hypothetical
     one. */
  const [maskEditTarget, setMaskEditTarget] = useState<'blur' | 'ai' | null>(null)
  const maskDrag = useRef<{ field: 'blurMask' | 'aiMask'; mask: Mask } | null>(null)
  useLayoutEffect(() => {
    setMaskEditTarget(null)
  }, [selectedLayerId])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage || !imageEl) return
    /* The pixel BUFFER never exceeds native resolution (real detail up to
       100%, capped there to keep compositing bounded) — zooming further
       just magnifies that same native-resolution buffer via CSS, same as
       any image viewer past 100%. Below "fit", buffer and CSS size match
       exactly like before this feature existed (bufferScale ==
       displayScale whenever displayScale <= 1). */
    const bufferScale = Math.min(zoom.displayScale, 1)
    canvas.width = Math.max(40, Math.round(imageEl.naturalWidth * bufferScale))
    canvas.height = Math.max(40, Math.round(imageEl.naturalHeight * bufferScale))
    canvas.style.width = `${Math.round(imageEl.naturalWidth * zoom.displayScale)}px`
    canvas.style.height = `${Math.round(imageEl.naturalHeight * zoom.displayScale)}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Avant/après (same contract as PhotoEditor.tsx's own): every layer's
    // COLOUR settings swap to neutral, nothing else about the stack
    // (visibility/opacity/order) changes — it previews colour work only.
    const displayLayers = beforeAfter ? layers.map((l) => ({ ...l, settings: NEUTRAL_SETTINGS })) : layers
    composeLayers(ctx, canvas.width, canvas.height, imageEl, displayLayers)
    setHistogram(computeHistogram(ctx, canvas.width, canvas.height))
    // A red tint over whatever the currently-edited mask (blur or AI)
    // currently covers — painted OVER the composited result, on this same
    // canvas, only while actively editing it. Never persisted: the very
    // next redraw (any layers/beforeAfter change) recomputes from
    // `composeLayers` fresh.
    if (maskEditTarget && selectedLayer) {
      const mask = (maskEditTarget === 'blur' ? selectedLayer.settings.blurMask : selectedLayer.settings.aiMask) ?? DEFAULT_MASK
      const maskAlpha = renderMaskAlpha(mask, canvas.width, canvas.height)
      if (maskAlpha) {
        const overlay = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = overlay.data
        for (let p = 0; p < maskAlpha.length; p++) {
          const a = maskAlpha[p] * 0.5
          if (a <= 0) continue
          const i = p * 4
          data[i] = Math.round(data[i] * (1 - a) + 255 * a)
          data[i + 1] = Math.round(data[i + 1] * (1 - a))
          data[i + 2] = Math.round(data[i + 2] * (1 - a))
        }
        ctx.putImageData(overlay, 0, 0)
      }
    }
    // Must run after the canvas has actually been resized above — see
    // useZoomPan.ts's own note on why this isn't an effect inside the hook.
    zoom.applyPendingScrollAdjust()
  }, [imageEl, layers, beforeAfter, maskEditTarget, selectedLayer, zoom.displayScale, zoom.applyPendingScrollAdjust])

  const toImageSpace = (event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }
  }

  /* Same fix as CurvesEditor.tsx's own drag: the LIVE gesture reads/writes
     a ref, never the React-rendered `selectedLayer` prop — `commit()`
     (via `updateSelectedSettings`) only queues a state update, and a
     `pointermove` listener attached before that update lands would
     otherwise see a stale mask on its very first move. */
  const onMaskDragMove = (event: PointerEvent) => {
    const state = maskDrag.current
    if (!state) return
    const p = toImageSpace(event)
    if (!p) return
    let next: Mask
    if (state.mask.mode === 'pinceau') {
      const strokes = [...state.mask.strokes]
      const last = strokes[strokes.length - 1]
      strokes[strokes.length - 1] = { ...last, points: [...last.points, p] }
      next = { ...state.mask, strokes }
    } else if (state.mask.mode === 'degrade' && state.mask.gradient) {
      next = { ...state.mask, gradient: { ...state.mask.gradient, x2: p.x, y2: p.y } }
    } else if (state.mask.mode === 'radial' && state.mask.radial) {
      next = {
        ...state.mask,
        radial: {
          ...state.mask.radial,
          rx: Math.max(0.01, Math.abs(p.x - state.mask.radial.cx)),
          ry: Math.max(0.01, Math.abs(p.y - state.mask.radial.cy)),
        },
      }
    } else return
    state.mask = next
    updateSelectedSettings({ [state.field]: next })
  }

  const stopMaskDrag = () => {
    document.removeEventListener('pointermove', onMaskDragMove)
    maskDrag.current = null
  }

  const onMaskPointerDown = (event: React.PointerEvent) => {
    if (!maskEditTarget || !selectedLayer) return
    const p = toImageSpace(event)
    if (!p) return
    const field = maskEditTarget === 'blur' ? 'blurMask' : 'aiMask'
    const current = selectedLayer.settings[field] ?? DEFAULT_MASK
    let next: Mask
    if (current.mode === 'pinceau') {
      next = { ...current, strokes: [...current.strokes, { points: [p], radius: current.brushRadius }] }
    } else if (current.mode === 'degrade') {
      next = { ...current, gradient: { x1: p.x, y1: p.y, x2: p.x, y2: p.y } }
    } else if (current.mode === 'radial') {
      next = { ...current, radial: { cx: p.x, cy: p.y, rx: 0.01, ry: 0.01, rotation: 0, feather: 30 } }
    } else {
      return
    }
    maskDrag.current = { field, mask: next }
    updateSelectedSettings({ [field]: next })
    document.addEventListener('pointermove', onMaskDragMove)
    document.addEventListener('pointerup', stopMaskDrag, { once: true })
  }

  const onAsideKeyDown = (event: React.KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    } else if (key === 'y') {
      event.preventDefault()
      redo()
    }
  }

  const onSaveCopy = async () => {
    if (!imageEl) return
    const canvas = document.createElement('canvas')
    canvas.width = imageEl.naturalWidth
    canvas.height = imageEl.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    composeLayers(ctx, canvas.width, canvas.height, imageEl, layers)
    const dataBase64 = canvas.toDataURL('image/png').split(',')[1]
    const result = await save(dataBase64)
    toast(result.ok ? `copie enregistrée : ${result.name}` : result.erreur)
  }

  const onOverwrite = async () => {
    const ok = await confirm({
      title: 'Écraser la source ?',
      button: 'Écraser la source',
      body: (
        <>
          <p>
            <b>{name}</b> sera remplacée sur le disque par la version composée de tous les calques
            visibles. La version d'origine ne sera plus récupérable.
          </p>
          <p className="tiny">
            Ses mesures de réalisme portaient sur les anciens pixels : elles sont effacées, l'image
            redevient « non mesurée ». Le jugement ◉ / ◌, lui, est conservé.
          </p>
          <p className="tiny">« Enregistrer une copie » garde l'original intact.</p>
        </>
      ),
    })
    if (!ok || !imageEl) return
    const canvas = document.createElement('canvas')
    canvas.width = imageEl.naturalWidth
    canvas.height = imageEl.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    composeLayers(ctx, canvas.width, canvas.height, imageEl, layers)
    const dataBase64 = canvas.toDataURL('image/png').split(',')[1]
    const result = await save(dataBase64, { remplacer: true })
    toast(result.ok ? `${result.name} remplacée` : result.erreur)
  }

  if (loading) {
    return (
      <div className="screen" id="photoEditorAdvanced">
        <div className="wrap">
          <p className="tiny">chargement…</p>
        </div>
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="screen" id="photoEditorAdvanced">
        <div className="wrap">
          <Link className="btn sm" to={screenForImage(bucket, name)}>
            ← Retour
          </Link>
          <div className="empty mt-[16px] rounded-card border border-line bg-panel px-[16px] py-[28px] text-[13px]">
            {loadError}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen" id="photoEditorAdvanced">
      <div
        className="wrap flex h-[calc(100vh-24px)] w-full max-w-none flex-col gap-[10px]"
        /* Elevated Undo/Redo listener (same reasoning as PoseEditorScreen.tsx's
           own): this wraps the top bar AND both side panels, so a keydown
           bubbles here regardless of which slider or button currently holds
           focus — attaching it to the top bar alone (first attempt, caught by
           the fumigation, not by reading the JSX) never saw a keystroke fired
           from `#peExpo` in the right aside, a SIBLING of the top bar, not an
           ancestor of it. */
        onKeyDown={onAsideKeyDown}
      >
        {/* Sticky top bar — the design-pass's own list, in order. The back
            link returns to the photo where 7a is one click away (`onEdit`
            in ReviewScreen/GalleryScreen) rather than re-opening that modal
            directly: nothing currently drives it from a URL, and the
            design-pass explicitly leaves this choice to Claude Code. */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-[10px] rounded-card border border-line bg-panel px-[12px] py-[8px]">
          <Link className="link shrink-0" to={screenForImage(bucket, name)}>
            ← Éditeur simplifié
          </Link>
          <b className="min-w-0 truncate text-[13px]">{name}</b>
          {dirty && <span className="tiny text-warn-txt">modifications non enregistrées</span>}
          <div className="flex-1" />
          <UndoRedoButtons canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
          <button
            type="button"
            className={`btn sm${beforeAfter ? ' bg-acc border-acc! text-on-acc font-semibold' : ''}`}
            aria-pressed={beforeAfter}
            onClick={() => setBeforeAfter((v) => !v)}
          >
            {beforeAfter ? 'Afficher les réglages' : 'Avant / après'}
          </button>
          {/* The one primary CTA of this bar — `btn primary sm` (same combo
              ExpressionEditorScreen.tsx already uses), everything else here
              (undo/redo, avant/après, écraser) stays secondary weight.
              Audit finding: a first pass gave every top-bar button the same
              `btn sm` weight, unlike every sibling editor's own save button. */}
          <button type="button" className="btn primary sm" disabled={saving} onClick={() => void onSaveCopy()}>
            Enregistrer une copie
          </button>
          <button type="button" className="btn sm danger" disabled={saving} onClick={() => void onOverwrite()}>
            Écraser la source…
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_380px] gap-[12px]">
          {/* Left panel — Préréglages / Historique */}
          <aside className="flex min-h-0 flex-col overflow-y-auto rounded-card border border-line bg-panel p-[12px]">
            <div className="mb-[10px] flex gap-[4px]" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'presets'}
                className={`btn sm${tab === 'presets' ? ' bg-acc border-acc! text-on-acc font-semibold' : ''}`}
                onClick={() => setTab('presets')}
              >
                Préréglages
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'history'}
                className={`btn sm${tab === 'history' ? ' bg-acc border-acc! text-on-acc font-semibold' : ''}`}
                onClick={() => setTab('history')}
              >
                Historique
              </button>
            </div>
            {tab === 'presets' ? (
              <PresetsPanel onApply={applyPreset} />
            ) : (
              <HistoryPanel history={history} cursor={historyCursor} onJump={jumpTo} />
            )}
          </aside>

          {/* Centre — aperçu composité. `position:relative` sur l'EXTÉRIEUR,
              `overflow-auto` sur l'INTÉRIEUR SEULEMENT : un enfant absolu
              d'un conteneur qui défile fait partie de son contenu (il
              défile AVEC lui — seul `position:fixed` y échapperait), donc
              le bandeau de masque et les boutons de zoom vivent HORS de la
              zone défilante, sinon ils dérivent hors champ dès qu'on zoome
              (trouvé en testant : après quelques clics sur « + », le cadre
              de recadrage — 7a — se retrouvait mesuré à des coordonnées
              négatives, le bouton de zoom ayant traîné le défilement très
              loin en tentant de « scrollIntoView » sa propre position qui
              reculait sans fin). Le défilement natif sert de pan
              (useZoomPan.ts) — pas de geste personnalisé, donc aucune
              collision avec le drag de peinture de masque. */}
          <div className="relative flex min-h-0 min-w-0 rounded-card border border-line bg-[#0a0a0a]">
            {/* Pas `items-center justify-center` : voir la note de
                photoEditorStyles.ts (STAGE_SCROLL) — même piège de
                "safe centering" CSS, même correctif (margin:auto sur le
                canvas lui-même plutôt qu'un alignement flex). */}
            <div className="flex h-full w-full overflow-auto p-[16px]" ref={stageRef}>
              {imageError ? (
                <p className="tiny text-danger-txt">échec du chargement de l'image</p>
              ) : (
                <canvas
                  id="peCanvas"
                  ref={canvasRef}
                  className={`m-auto block rounded-[2px]${maskEditTarget ? ' cursor-crosshair' : ''}`}
                  onPointerDown={maskEditTarget ? onMaskPointerDown : undefined}
                />
              )}
            </div>
            {maskEditTarget && (
              <p className="tiny absolute bottom-[8px] left-1/2 -translate-x-1/2 rounded-[6px] bg-scrim px-[10px] py-[4px] text-txt" role="status">
                glisser sur l’image pour placer le masque — teinte rouge = zone couverte
              </p>
            )}
            {imageEl && (
              <ZoomControls
                zoomPct={zoom.zoomPct}
                fitPct={zoom.fitPct}
                onZoomOut={zoom.zoomOut}
                onZoomToFit={zoom.zoomToFit}
                onZoomIn={zoom.zoomIn}
                className="right-[8px]"
              />
            )}
          </div>

          {/* Panneau droit — histogramme, calques, colorimétrie */}
          <aside className="flex min-h-0 flex-col gap-[14px] overflow-y-auto rounded-card border border-line bg-panel p-[12px]">
            <div>
              <div className="tiny mb-[6px] uppercase tracking-[.5px] text-dim">Histogramme</div>
              <Histogram bins={histogram} />
            </div>
            <LayerList
              layers={layers}
              selectedLayerId={selectedLayerId}
              onSelect={selectLayer}
              onAdd={addLayer}
              onRemove={removeLayer}
              onToggleVisible={toggleVisible}
              onOpacity={setOpacity}
              onReorder={reorder}
            />
            {selectedLayer && (
              <>
                <LayerSettingsPanel layer={selectedLayer} onChange={updateSelectedSettings} />
                <AdvancedColorPanel layer={selectedLayer} onChange={updateSelectedSettings} />
                <SharpenBlurPanel
                  layer={selectedLayer}
                  onChange={updateSelectedSettings}
                  editingMask={maskEditTarget === 'blur'}
                  onToggleMaskEdit={() => setMaskEditTarget((v) => (v === 'blur' ? null : 'blur'))}
                />
                <PerspectivePanel layer={selectedLayer} onChange={updateSelectedSettings} />
                <AiRetouchPanel
                  layer={selectedLayer}
                  onChange={updateSelectedSettings}
                  editingMask={maskEditTarget === 'ai'}
                  onToggleMaskEdit={() => setMaskEditTarget((v) => (v === 'ai' ? null : 'ai'))}
                />
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
