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
import { AdvancedColorPanel } from './AdvancedColorPanel'
import { Histogram } from './Histogram'
import { HistoryPanel } from './HistoryPanel'
import { LayerList } from './LayerList'
import { LayerSettingsPanel } from './LayerSettingsPanel'
import { PerspectivePanel } from './PerspectivePanel'
import { composeLayers, computeHistogram, NEUTRAL_SETTINGS } from './photoEditorLayersPixels'
import { PresetsPanel } from './PresetsPanel'
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

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage || !imageEl) return
    const pad = 32 // the stage's own padding, both sides — same margin PhotoEditor.tsx measures against
    const maxW = Math.max(200, stage.clientWidth - pad)
    const maxH = Math.max(200, stage.clientHeight - pad)
    const scale = Math.min(maxW / imageEl.naturalWidth, maxH / imageEl.naturalHeight, 1)
    canvas.width = Math.max(40, Math.round(imageEl.naturalWidth * scale))
    canvas.height = Math.max(40, Math.round(imageEl.naturalHeight * scale))
    canvas.style.width = `${canvas.width}px`
    canvas.style.height = `${canvas.height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Avant/après (same contract as PhotoEditor.tsx's own): every layer's
    // COLOUR settings swap to neutral, nothing else about the stack
    // (visibility/opacity/order) changes — it previews colour work only.
    const displayLayers = beforeAfter ? layers.map((l) => ({ ...l, settings: NEUTRAL_SETTINGS })) : layers
    composeLayers(ctx, canvas.width, canvas.height, imageEl, displayLayers)
    setHistogram(computeHistogram(ctx, canvas.width, canvas.height))
  }, [imageEl, layers, beforeAfter])

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

          {/* Centre — aperçu composité */}
          <div
            className="relative flex min-h-0 min-w-0 items-center justify-center rounded-card border border-line bg-[#0a0a0a] p-[16px]"
            ref={stageRef}
          >
            {imageError ? (
              <p className="tiny text-danger-txt">échec du chargement de l'image</p>
            ) : (
              <canvas id="peCanvas" ref={canvasRef} className="block max-h-full max-w-full rounded-[2px]" />
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
                <PerspectivePanel layer={selectedLayer} onChange={updateSelectedSettings} />
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
