/* The dedicated expression editor — `${PATHS.expressionEditor}/:tone`. Tunes
   ONE tone's saved expression range (creative.json), previewed against an
   already-produced photo of the character — never a fresh upload, so the
   identity cost shown is a real one (AUTOMATION/expression.py's own
   reasoning: the warp's cost varies from photo to photo, only a real photo
   makes it mean anything). Tones themselves stay hand-authored elsewhere;
   this screen only edits the range of one that already exists. */
import { Link, useParams } from 'react-router-dom'

import { useApi } from '../../api/useApi'
import { PATHS } from '../../app/routes'
import { useToast } from '../../chrome/ToastContext'
import { useConfig } from '../../state/ConfigContext'
import { ExpressionSliders } from './ExpressionSliders'
import { useExpressionEditor, type GalleryItem } from './useExpressionEditor'

export function ExpressionEditorScreen() {
  const { tone: toneKey } = useParams<{ tone: string }>()
  if (!toneKey) return null // unreachable: the route declares `:tone` without `?`
  return <ExpressionEditorInner toneKey={toneKey} />
}

function ExpressionEditorInner({ toneKey }: { toneKey: string }) {
  const api = useApi()
  const toast = useToast()
  const { qc } = useConfig()
  const {
    tone, creativeLoaded, params,
    setTrial, setMin, setMax, toggleIncluded, setAsMin, setAsMax,
    photos, photosError, photo, selectPhoto,
    previewUrl, scoreAfter, rendering, renderError, renderPreview,
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
            ← Retour à la banque
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

  const previewSrc =
    previewUrl ?? (photo ? api.image({ bucket: photo.bucket, space: photo.space, name: photo.name, v: photo.v }) : null)

  return (
    <div className="screen" id="expressionEditor">
      {/* Height-bounded, like PoseEditorScreen's own `.wrap` — without it
          neither column has anything to scroll WITHIN, so the whole PAGE
          scrolls instead (measured: the sidebar alone grew to 2676px tall).
          That took the photo grid and the preview off-screen while reaching
          the lower parameter groups (Regard/Sourcils/Rotation) — exactly
          the two things a live preview tool most needs kept in view
          together. Found by measuring the real layout, not by reading the
          JSX. */}
      <div className="wrap h-[calc(100vh-24px)] w-full max-w-none">
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_360px] gap-[16px]">
          <div className="h-full min-h-0 min-w-0 overflow-y-auto pr-[4px]">
            <Link className="link" to={PATHS.bankScenes}>
              ← Retour à la banque
            </Link>
            <h2 className="mt-[6px]">{tone.label || tone.key}</h2>

            <div className="mt-[10px]">
              <div className="tiny mb-[6px] opacity-70">
                Photo de référence — déjà produite, jamais un envoi à la volée
              </div>
              <PhotoPicker
                photos={photos}
                error={photosError}
                selected={photo}
                onSelect={selectPhoto}
                imageUrl={api.image}
              />
            </div>

            <div className="mt-[12px] rounded-card border border-line2 bg-panel2 p-[10px]">
              {previewSrc ? (
                <img className="max-h-[420px] w-full rounded-[6px] object-contain" src={previewSrc} alt="" />
              ) : (
                <div className="empty rounded-card border border-line bg-panel px-[16px] py-[28px] text-[13px]">
                  choisis une photo ci-dessus pour prévisualiser
                </div>
              )}
              <div className="mt-[8px] flex items-center gap-[10px]">
                <button
                  type="button"
                  className="btn primary sm"
                  disabled={!photo || rendering}
                  onClick={() => void renderPreview()}
                >
                  {rendering ? 'rendu en cours…' : 'Rendre l’aperçu'}
                </button>
                {scoreAfter !== null && <ScoreBadge score={scoreAfter} ok={qc.ok} watch={qc.watch} />}
              </div>
              {renderError && (
                <p role="status" className="tiny mt-[6px] text-danger-txt">
                  {renderError}
                </p>
              )}
            </div>
          </div>

          <aside className="flex h-full min-h-0 w-[360px] shrink-0 flex-col gap-[10px]">
            <button type="button" className="btn primary" disabled={saving} onClick={() => void onSave()}>
              Enregistrer la plage
            </button>
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
  selected: GalleryItem | null
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
      {photos.map((item) => (
        <button
          key={item.name}
          type="button"
          data-photo={item.name}
          className="relative aspect-square overflow-hidden rounded-[6px] border p-0"
          style={{ borderColor: selected?.name === item.name ? 'var(--acc)' : 'var(--line2)' }}
          aria-pressed={selected?.name === item.name}
          title={[item.scene, item.date, item.score].filter(Boolean).join(' · ')}
          onClick={() => onSelect(item)}
        >
          <img
            className="h-full w-full object-cover"
            loading="lazy"
            src={imageUrl({ bucket: item.bucket, space: item.space, name: item.name, v: item.v, thumb: true })}
            alt={item.scene || item.name}
          />
        </button>
      ))}
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
