/* The dedicated expression editor — `${PATHS.expressionEditor}/:tone`. Tunes
   ONE tone's saved expression range (creative.json), previewed against up
   to 3 already-produced photos of the character at once (design pass,
   `DOCS/design-pass/screen-expression-editor.md`, §B1) — never a fresh
   upload, so the identity cost shown is a real one (AUTOMATION/
   expression.py's own reasoning: the warp's cost varies from photo to
   photo, only a real photo makes it mean anything). Tones themselves stay
   hand-authored elsewhere; this screen only edits the range of one that
   already exists. */
import { Link, useParams } from 'react-router-dom'

import { useApi } from '../../api/useApi'
import { PATHS } from '../../app/routes'
import { useLightbox } from '../../chrome/LightboxContext'
import { useToast } from '../../chrome/ToastContext'
import { useConfig } from '../../state/ConfigContext'
import { UndoRedoButtons } from '../pose-editor/UndoRedoButtons'
import { CopyFromToneMenu } from './CopyFromToneMenu'
import { ExpressionSliders } from './ExpressionSliders'
import {
  MAX_SELECTED_PHOTOS, useExpressionEditor,
  type GalleryItem, type PhotoResult,
} from './useExpressionEditor'

export function ExpressionEditorScreen() {
  const { tone: toneKey } = useParams<{ tone: string }>()
  if (!toneKey) return null // unreachable: the route declares `:tone` without `?`
  return <ExpressionEditorInner toneKey={toneKey} />
}

function ExpressionEditorInner({ toneKey }: { toneKey: string }) {
  const api = useApi()
  const toast = useToast()
  const { qc } = useConfig()
  const { open: openLightbox } = useLightbox()
  const {
    tone, creativeLoaded, params, dirty,
    setTrial, setMin, setMax, toggleIncluded, setAsMin, setAsMax,
    undo, redo, canUndo, canRedo,
    copySources, copyFromTone,
    photos, photosError,
    selectedPhotos, togglePhotoSelection, results,
    toggleViewingOriginal, renderAll, retryPhoto,
    paramsChangedAt,
    saving, save,
  } = useExpressionEditor(toneKey)

  if (!creativeLoaded) {
    return (
      <div className="screen" id="expressionEditor">
        <div className="wrap">
          <p className="tiny">chargement…</p>
        </div>
      </div>
    )
  }
  if (!tone || !params) {
    return (
      <div className="screen" id="expressionEditor">
        <div className="wrap">
          <Link className="btn sm" to={PATHS.bankScenes}>
            ← Retour aux ateliers
          </Link>
          <div className="empty mt-[16px] rounded-card border border-line bg-panel px-[16px] py-[28px] text-[13px]">
            ton introuvable : {toneKey}
          </div>
        </div>
      </div>
    )
  }

  const onSave = async () => {
    const result = await save()
    toast(result.ok ? 'plage d’expression enregistrée' : result.erreur)
  }

  const onSelectPhoto = (photo: GalleryItem) => {
    const outcome = togglePhotoSelection(photo)
    if (outcome === 'limit') {
      toast(`${MAX_SELECTED_PHOTOS} photos maximum — décoche-en une pour en ajouter une autre`)
    }
  }

  const anyRendering = selectedPhotos.some((p) => results[p.name]?.rendering)

  /* Ctrl/Cmd+Z undoes, +Maj+Z or +Y redoes — same detection as
     PoseCanvas.tsx's own onKeyDown. Bound on the WHOLE aside (button +
     number fields), not just one focusable root as PoseCanvas does for its
     SVG: the number fields here are as much the primary surface as the
     slider is, undoing from one should work the same as from the other.
     `preventDefault` also suppresses the browser's own per-field text undo,
     which would otherwise fire alongside this and double the effect. */
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

  return (
    <div className="screen" id="expressionEditor">
      {/* Height-bounded, like PoseEditorScreen's own `.wrap` — without it
          neither column has anything to scroll WITHIN, so the whole PAGE
          scrolls instead (measured: the sidebar alone grew to 2676px tall).
          That took the photo grid and the preview off-screen while reaching
          the lower parameter groups (Regard/Sourcils/Rotation) — exactly
          the two things a live preview tool most needs kept in view
          together. Found by measuring the real layout, not by reading the
          JSX.

          50/50 columns (design pass, "Direction" header — équilibre
          aperçu/paramètres conservé), not the old fixed 360px aside: the
          one-line ParamRow below (§S) needs real width for slider + 3
          numeric fields + 2 buttons on one row, which 360px never gave it. */}
      <div className="wrap h-[calc(100vh-24px)] w-full max-w-none">
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[16px]">
          <div className="h-full min-h-0 min-w-0 overflow-y-auto pr-[4px]">
            <Link className="link" to={PATHS.bankScenes}>
              ← Retour aux ateliers
            </Link>
            <h2 className="mt-[6px]">{tone.label || tone.key}</h2>

            <div className="mt-[10px]">
              <div className="tiny mb-[6px] opacity-70">
                Photo de référence — déjà produite, jamais un envoi à la volée ({selectedPhotos.length}/{MAX_SELECTED_PHOTOS} sélectionnées)
              </div>
              <PhotoPicker
                photos={photos}
                error={photosError}
                selected={selectedPhotos}
                onSelect={onSelectPhoto}
                imageUrl={api.image}
              />
            </div>

            <div className="mt-[12px]">
              {selectedPhotos.length === 0 ? (
                <div className="empty rounded-card border border-line bg-panel px-[16px] py-[28px] text-[13px]">
                  choisis jusqu’à {MAX_SELECTED_PHOTOS} photos ci-dessus pour prévisualiser
                </div>
              ) : (
                <div
                  className="grid gap-[8px]"
                  style={{ gridTemplateColumns: `repeat(${selectedPhotos.length}, minmax(0, 1fr))` }}
                >
                  {selectedPhotos.map((photo) => {
                    const result = results[photo.name]
                    const stale = result?.renderedAt != null && paramsChangedAt.current > result.renderedAt
                    return (
                      <PhotoResultCard
                        key={photo.name}
                        photo={photo}
                        result={result}
                        imageUrl={api.image}
                        onToggleOriginal={() => toggleViewingOriginal(photo.name)}
                        onRetry={() => retryPhoto(photo.name)}
                        openLightbox={openLightbox}
                        ok={qc.ok}
                        watch={qc.watch}
                        stale={stale}
                      />
                    )
                  })}
                </div>
              )}
              <button
                type="button"
                className="btn primary sm mt-[8px]"
                disabled={selectedPhotos.length === 0 || anyRendering}
                onClick={renderAll}
              >
                {anyRendering ? 'rendu en cours…' : 'Rendre l’aperçu'}
              </button>
            </div>
          </div>

          <aside
            className="flex h-full min-h-0 min-w-0 flex-col gap-[10px]"
            onKeyDown={onAsideKeyDown}
          >
            {/* One row, not two: "Enregistrer" and "Copier depuis…" are both
                tone-level actions and read as a pair once grouped — the
                previous layout put "Copier depuis…" on its own row, right-
                aligned, floating with nothing to its left when the screen
                wasn't dirty (found on a real screenshot, not a guess).
                `btn primary` alone (no `flex-1`) instead of stretching
                Save across the whole row: full-width was disproportionate
                next to a small secondary button once they sit together.
                Undo/redo stay visually separate on the right — history
                controls, not tone-level actions. */}
            <div className="flex items-center gap-[8px]">
              <button
                type="button"
                className="btn primary"
                disabled={saving}
                onClick={() => void onSave()}
              >
                Enregistrer la plage
              </button>
              <CopyFromToneMenu sources={copySources} onCopy={copyFromTone} />
              <div className="flex-1" />
              <UndoRedoButtons canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
            </div>
            {dirty && <p className="tiny">Modifications non enregistrées</p>}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ExpressionSliders
                params={params}
                onTrial={setTrial}
                onMin={setMin}
                onMax={setMax}
                onToggle={toggleIncluded}
                onSetAsMin={setAsMin}
                onSetAsMax={setAsMax}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function PhotoPicker({
  photos, error, selected, onSelect, imageUrl,
}: {
  photos: GalleryItem[] | null
  error: string | null
  selected: GalleryItem[]
  onSelect: (photo: GalleryItem) => void
  imageUrl: (ref: { bucket: string; space: string; name: string; v?: string | number | null; thumb?: boolean }) => string
}) {
  if (error) return <p className="tiny text-danger-txt">{error}</p>
  if (photos === null) return <p className="tiny">chargement…</p>
  if (photos.length === 0) {
    return (
      <div className="empty rounded-card border border-line bg-panel px-[12px] py-[16px] text-[13px]">
        aucune photo validée pour l’instant — la Revue en produira à mesurer.
      </div>
    )
  }
  return (
    <div
      className="grid gap-[6px]"
      style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(72px,1fr))' }}
    >
      {photos.map((item) => {
        const isSelected = selected.some((p) => p.name === item.name)
        return (
          <button
            key={item.name}
            type="button"
            data-photo={item.name}
            className="relative aspect-square overflow-hidden rounded-[6px] border p-0"
            style={{ borderColor: isSelected ? 'var(--acc)' : 'var(--line2)' }}
            aria-pressed={isSelected}
            data-hint-text={[item.scene, item.date, item.score].filter(Boolean).join(' · ')}
            onClick={() => onSelect(item)}
          >
            <img
              className="h-full w-full object-cover"
              loading="lazy"
              src={imageUrl({ bucket: item.bucket, space: item.space, name: item.name, v: item.v, thumb: true })}
              alt={item.scene || item.name}
            />
          </button>
        )
      })}
    </div>
  )
}

/** One selected photo's render result — its own image, toggle, score,
    staleness and error/retry, isolated from the other up-to-2 cards next to
    it (design pass §B1: one failing photo must never hide the others). */
function PhotoResultCard({
  photo, result, imageUrl, onToggleOriginal, onRetry, openLightbox, ok, watch, stale,
}: {
  photo: GalleryItem
  result: PhotoResult | undefined
  imageUrl: (ref: { bucket: string; space: string; name: string; v?: string | number | null }) => string
  onToggleOriginal: () => void
  onRetry: () => void
  openLightbox: (src: string) => void
  ok: number
  watch: number
  stale: boolean
}) {
  const originalSrc = imageUrl({ bucket: photo.bucket, space: photo.space, name: photo.name, v: photo.v })
  const viewingOriginal = result?.viewingOriginal ?? false
  const previewSrc = result?.previewUrl && !viewingOriginal ? result.previewUrl : originalSrc

  return (
    <div className="rounded-card border border-line2 bg-panel2 p-[8px]" data-photo-result={photo.name}>
      <img
        className="h-[190px] w-full cursor-zoom-in rounded-[6px] object-contain"
        src={previewSrc}
        alt=""
        onClick={() => openLightbox(previewSrc)}
      />
      <div className="mt-[6px] flex flex-wrap items-center gap-[6px]">
        {result?.previewUrl && (
          <button type="button" className="btn sm" onClick={onToggleOriginal}>
            {viewingOriginal ? 'Voir le rendu' : 'Voir l’original'}
          </button>
        )}
        {result?.rendering && <span className="tiny">rendu…</span>}
        {result?.scoreAfter != null && !viewingOriginal && (
          <ScoreBadge score={result.scoreAfter} ok={ok} watch={watch} />
        )}
      </div>
      {stale && !viewingOriginal && (
        <p className="tiny mt-[4px] text-warn-txt">réglages modifiés depuis ce rendu</p>
      )}
      {result?.renderError && (
        <div className="mt-[4px]" role="status">
          <p className="tiny text-danger-txt">{result.renderError}</p>
          <button type="button" className="btn sm mt-[4px]" data-photo-retry onClick={onRetry}>
            Réessayer
          </button>
        </div>
      )}
    </div>
  )
}

function ScoreBadge({ score, ok, watch }: { score: number; ok: number; watch: number }) {
  const level = score >= ok ? 'ok' : score >= watch ? 'watch' : 'reject'
  const color = level === 'ok' ? 'text-ok' : level === 'watch' ? 'text-warn-txt' : 'text-danger-txt'
  const label = level === 'ok' ? 'conforme' : level === 'watch' ? 'à surveiller' : 'dérive'
  return (
    <span className={`tiny ${color}`}>
      identité après expression : {score.toFixed(3)} ({label})
    </span>
  )
}
