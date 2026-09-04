/* The Produire "develop" panel — the sticky right column, screen-3-produire
   design pass §S. Replaces `Inspector.tsx` on this screen: same "last
   image" role, condensed to a single line + a 44×56 thumbnail instead of a
   full hero shot, to make room for what the panel adds — the detail of
   whichever scene is POINTED (hovered or focused in the grid, not
   necessarily ticked for launch): its score, which tones it suits, the pose
   it imposes, and "Sélectionner" to add it to the run without leaving the
   panel. Points AT a scene and SELECTS it are two different gestures on
   purpose — a photographer's loupe view previews a frame before deciding to
   keep it.

   THE HEADER IS SELF-CONTAINED, LIKE ITS PREDECESSOR. `Inspector.tsx` read
   its own two sources (STATE.recent, then a gallery fallback) rather than
   taking them as props — the "last image" is a fact about the CHARACTER,
   not about anything this screen already tracks. Same shape kept here. */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { errorOf, type ActionLike, type Schema } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useCharacter } from '../../character/CharacterContext'
import { useConfig } from '../../state/ConfigContext'
import { useLightbox } from '../../chrome/LightboxContext'
import { useSystemState } from '../../state/SystemStateContext'
import { screenForImage } from '../../app/routes'
import type { Scene } from '../../state/ScenesStoreContext'
import type { SceneMeta, SceneStats } from './useSceneChoice'

type GalleryResponse = Schema<'GalleryResponse'>
type GalleryItem = Schema<'GalleryItem'>

type Shown = {
  name: string
  bucket?: string
  space?: string
  scene?: string | null
  score?: string | number | null
}

export function SceneDevelopPanel({
  scene,
  meta,
  stats,
  preview,
  tone,
  isSelected,
  onToggleSelect,
  imageUrl,
}: {
  /** The scene currently pointed (hovered/focused) in the grid — `null` when
      nothing has been pointed at yet this session. */
  scene: Scene | null
  meta?: SceneMeta[string]
  stats?: SceneStats[string]
  preview?: { name: string; bucket: string; space?: string; v?: number }
  tone: string
  isSelected: boolean
  onToggleSelect: (id: string) => void
  imageUrl: (ref: Record<string, unknown>) => string
}) {
  const api = useApi()
  const navigate = useNavigate()
  const { claimed } = useCharacter()
  const { qc } = useConfig()
  const { state } = useSystemState()
  const { open: openLightbox } = useLightbox()
  const [fallback, setFallback] = useState<GalleryItem | null>(null)

  const fromState: Shown | null =
    state && state.character === claimed && Array.isArray(state.recent) && state.recent.length
      ? (state.recent[state.recent.length - 1] as Shown)
      : null

  const loadFallback = useCallback(async () => {
    try {
      const response = await api.get<GalleryResponse>('/api/gallery?bucket=OK&space=sfw')
      if (errorOf(response as ActionLike)) return
      const items = (response.items ?? []) as GalleryItem[]
      setFallback(items[0] ?? null)
    } catch {
      /* silent: comfort reading, the fault banner already carries a real load failure */
    }
  }, [api])

  useEffect(() => {
    setFallback(null)
    void loadFallback()
  }, [loadFallback, claimed])

  const last: Shown | null = fromState ?? (fallback as Shown | null)
  const lastThumb = last ? api.image({ ...last, thumb: true }) : null

  const dot =
    stats?.avg == null
      ? 'var(--dim2)'
      : stats.avg >= qc.high
        ? 'var(--ok)'
        : stats.avg >= qc.ok
          ? 'var(--warn)'
          : 'var(--bad)'
  const affines = meta?.tones ?? []

  return (
    <aside
      className="sticky top-[12px] flex max-h-[calc(100vh-150px)] flex-col gap-[16px]
                 overflow-auto max-[1100px]:static max-[1100px]:max-h-none"
      aria-label="Développement"
    >
      {/* Condensed "last image" — a single line + a small thumbnail, in place
          of Inspector's full hero shot: the panel's room now goes to the
          pointed scene below. */}
      <div className="flex items-center gap-[10px]">
        <button
          type="button"
          className="relative h-[56px] w-[44px] flex-none overflow-hidden rounded-[6px]
                     border border-line bg-panel2 disabled:cursor-default"
          disabled={!last || !lastThumb}
          onClick={() => last && openLightbox(api.image(last))}
          aria-label={last ? `dernière image — ${last.scene ?? ''}` : 'aucune image encore'}
        >
          {last && lastThumb && (
            <img className="h-full w-full object-cover" src={lastThumb} alt="" />
          )}
        </button>
        <div className="min-w-0 flex-1 text-[12.5px] leading-[1.4]">
          <div className="text-dim">Dernière image</div>
          {last ? (
            <button
              className="link truncate text-[13px]"
              onClick={() => navigate(screenForImage(last.bucket, last.name))}
            >
              {last.scene || last.name}
            </button>
          ) : (
            <span className="text-dim2">rien encore</span>
          )}
        </div>
      </div>

      <div className="border-t border-t-line" />

      {/* The pointed scene's detail — the panel's real estate now goes here. */}
      {scene ? (
        <div className="flex flex-col gap-[10px]" id="developScene">
          <h2 className="text-[13px] font-semibold">{scene.id}</h2>

          <div>
            <div className="mb-[4px] flex items-center gap-[6px] text-[12.5px]">
              <span className="h-[7px] w-[7px] flex-none rounded-[50%]" style={{ background: dot }} />
              {stats ? (
                <span>
                  {stats.avg != null ? stats.avg.toFixed(3) : '—'} · {stats.ok ?? 0}/{stats.n} validée
                  {stats.n > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-dim2">jamais produite</span>
              )}
            </div>
            {stats && stats.ok != null && stats.n > 0 && (
              <div className="h-[5px] w-full overflow-hidden rounded-[3px] bg-line2" aria-hidden="true">
                <div
                  className="h-full rounded-[3px]"
                  style={{ width: `${Math.round((100 * stats.ok) / stats.n)}%`, background: dot }}
                />
              </div>
            )}
          </div>

          {affines.length > 0 && (
            <div className="text-[12.5px]">
              <div className="mb-[4px] text-dim">tons affins</div>
              <div className="flex flex-wrap gap-[5px]">
                {affines.map((t) => (
                  <span
                    key={t}
                    className={`rounded-[10px] border px-[7px] py-px text-[11px] ${
                      t === tone ? 'border-acc text-acc' : 'border-line text-dim'
                    }`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {meta?.pose && (
            <div className="text-[12.5px]">
              <span
                className="rounded-[8px] bg-panel2 px-[7px] py-px text-[11px] font-bold text-[#9fd8ff]"
                tabIndex={0}
                data-hint-text={`pose imposée : ${meta.pose}`}
              >
                <span aria-hidden="true">⛓ </span>pose
              </span>
            </div>
          )}

          {preview && (
            <div
              className="aspect-[4/5] w-full rounded-[8px] border border-line bg-panel2 bg-cover bg-center"
              style={{ backgroundImage: `url('${imageUrl({ ...preview, thumb: true })}')` }}
              aria-hidden="true"
            />
          )}

          <button
            type="button"
            id="developSelect"
            className={`btn sm${isSelected ? ' on' : ''}`}
            onClick={() => onToggleSelect(scene.id)}
          >
            {isSelected ? 'Retirer de la sélection' : 'Sélectionner'}
          </button>
        </div>
      ) : (
        <p className="tiny m-0 text-dim">survole ou choisis une scène pour voir son détail</p>
      )}
    </aside>
  )
}
