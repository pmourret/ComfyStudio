/* Produire — intensity slider, intention, tone, scenes, launch.
   Ported from `static/create.js`, the largest module of the legacy frontend.

   THREE BLOCKS, ONE DECISION EACH. Blocks 2 and 3 do not exist until the
   intention is chosen: that is the whole point of the linear walk. On the tier
   that EDITS, there are two blocks instead — source image, then instruction.
   ONE function decides which blocks are on screen and how they are numbered;
   the legacy version had that spread between setLevel and renderTones, which
   contradicted each other as soon as a third mode appeared.

   COUPLING TRAP §5.6-2 — /api/plan is replayed on every keystroke, debounced. It
   carries the count, the prompt preview AND the instruction alerts at once. See
   usePlan; nothing here replaces it with a local computation.

   COUPLING TRAP §5.6-3 — `#btnRun.disabled`. Two timers used to write it (the
   1.5 s tick and refreshPlan), and `planOk()` was the common source that kept
   them from fighting — documented backend-side as AUDIT.md §5.6. Here it is ONE
   derived expression, `runDisabled`, computed in one place from (planOk,
   running, comfy). The two writers cannot exist any more, so neither can the bug
   the guard covered; the guard survives as that single expression. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { errorOf, type ActionLike } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useChrome } from '../../chrome/ChromeContext'
import { useConfirm } from '../../chrome/ConfirmContext'
import { useToast } from '../../chrome/ToastContext'
import { useRovingChoice } from '../../chrome/useRovingChoice'
import { useConfig } from '../../state/ConfigContext'
import { useScenes, type Scene } from '../../state/ScenesStoreContext'
import { useSystemState } from '../../state/SystemStateContext'
import { useTaxonomy } from '../../state/TaxonomyContext'
import { PATHS } from '../../app/routes'
import { EditStep } from './EditStep'
import { PromptPreview } from './PromptPreview'
import { QueueRail } from './QueueRail'
import { IntensityBar } from './IntensityBar'
import { IntentRail, type Intention } from './IntentRail'
import { NewSceneCard, SceneCard } from './SceneCard'
import { SceneCompareView } from './SceneCompareView'
import { SceneDevelopPanel } from './SceneDevelopPanel'
import { useNsfwSources } from './useNsfwSources'
import { useSceneChoice, type SceneSort } from './useSceneChoice'
import { runSummary } from './runSummary'
import {
  SettingsPanel,
  initialValues,
  valuesFor,
  withPreset,
  type SettingValues,
} from './SettingsPanel'
import { isEditTier, usePlan, type IntensityTier, type Preview } from './useProduceState'

const QUALITY_OPTIONS = [
  ['realisme', 'Réalisme', 'Pipeline mesuré (peau, grain). Pas le style du personnage.'],
  ['rapide', 'Rapide', 'Coupe la repasse de texture — plus vite, peau plus lisse.'],
  ['brut', 'Brut', 'Coupe repasse, reprise du visage et mise à la taille.'],
] as const

export function ProduceScreen() {
  const api = useApi()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { creative, reload: reloadCreative } = useTaxonomy()
  const { bank, drafts } = useScenes()
  const { config } = useConfig()
  const { state, refresh: refreshCounts } = useSystemState()
  const { gearOpen, toggleGear, closeGear } = useChrome()

  const presetRef = (config?.preset ?? {}) as Record<string, unknown>
  const nsfwRef = (config?.nsfw ?? {}) as Record<string, unknown>

  const [level, setLevelState] = useState(0)
  const [intent, setIntent] = useState<string | null>(null)
  const [tone, setTone] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /** Tiers confirmed for this session — never persisted. */
  const confirmed = useRef<Set<number>>(new Set())
  const [values, setValues] = useState<SettingValues>({})
  const [quality, setQuality] = useState('realisme')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [override, setOverride] = useState('')
  const [instruction, setInstruction] = useState('')
  const [launching, setLaunching] = useState(false)

  // the panel is filled from config.json as soon as it lands
  useEffect(() => {
    if (config) setValues(initialValues(presetRef, nsfwRef))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  const tiers = creative?.intensity ?? []
  const tier = (tiers.find((t) => t.level === level) ?? null) as IntensityTier | null
  const editTier = isEditTier(tier)
  const onToolGone = useCallback(() => setLevelState(0), [])
  const { sources, picked, setPicked, nsfwOut } = useNsfwSources({
    editTier,
    reloadCreative,
    onToolGone,
  })
  /* True when the current tier EDITS an existing image instead of generating
     one. That is the default behaviour of the NSFW tier, and the project's rule:
     the branch edits an already validated image, it never generates from zero.
     `generer_avant` restores the generate-then-edit chain for the ONE case where
     it serves — no validated image exists yet for the wanted scene. The server
     applies the same rule in mode_edition(). */
  const editing = editTier && !values.generavant

  const [sceneSearch, setSceneSearch] = useState('')
  const [sceneSort, setSceneSort] = useState<SceneSort>('affinity')
  /** The scene under the pointer/focus in the grid — the develop panel's
      subject, distinct from `selected` (screen-3-produire §S: pointing at a
      scene and picking it for the run are two different gestures). */
  const [pointedId, setPointedId] = useState<string | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const { meta, stats, sceneList, scenesOf, visibleScenes } = useSceneChoice({
    bank,
    drafts,
    tier,
    level,
    intent,
    tone,
    search: sceneSearch,
    sortBy: sceneSort,
  })

  // ---------------------------------------------------------------- payload
  const field = (id: string, fallback: string | boolean = '') => values[id] ?? fallback
  const payload = useCallback(
    () => ({
      scenes: [...selected],
      categories: [],
      count: field('count'),
      format: field('format'),
      limit: field('limit'),
      seed: field('seed'),
      no_variants: field('novar', false),
      no_qc: field('noqc', false),
      preset: valuesFor(values, 'preset'),
      nsfw: valuesFor(values, 'nsfw'),
      intensity: level,
      confirm_intensity: confirmed.current.has(level),
      tone,
      intention: intent === '*' ? null : intent,
      edit_instruction: instruction,
      // the images to edit, and the mode. The server strips what is no longer
      // editable (sources_valides) — the list may have aged.
      sources: [...picked],
      generer_avant: field('generavant', false),
      // scene amendment for THIS launch: the server only keeps it when a single
      // scene is ticked, and passes it through the same face check
      scene_override: override,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, values, level, tone, intent, instruction, picked, override],
  )

  /* The plan runs in editing mode even with nothing ticked: it is what renders
     the instruction alerts. In generation it needs an intention and a scene. */
  const unsaved = [...selected].filter((id) => !meta[id])
  const planEnabled = editing || (Boolean(intent) && selected.size > 0 && !unsaved.length)
  const { plan, refresh: refreshPlan } = usePlan({ payload, enabled: planEnabled })

  useEffect(() => {
    refreshPlan()
  }, [refreshPlan, payload])

  // ------------------------------------------------------------------ level
  const setLevel = async (next: number) => {
    const target = tiers.find((t) => t.level === next)
    if (!target) return
    if (target.requires === 'confirm' && !confirmed.current.has(next)) {
      const ok = await confirm({
        title: `Passer en « ${target.label} » ?`,
        button: `Passer en ${target.label}`,
        body: (
          <>
            <p>
              Les images produites à ce niveau <b>ne partent pas dans l'export</b> :
              elles restent consultables, mais hors du dossier de publication.
            </p>
            <ul>
              <li>
                destination : <code>{target.destination || '—'}</code>
              </li>
              <li>export désactivé pour ce palier</li>
            </ul>
          </>
        ),
      })
      if (!ok) return
      confirmed.current.add(next)
    }
    setLevelState(next)
    setOverride('')
  }

  /* Out-of-band scenes disappear when the level changes: the selection is
     pruned rather than left pointing at scenes the plan will not see. */
  useEffect(() => {
    const available = new Set(
      (intent ? scenesOf(intent) : []).map((s) => s.id),
    )
    setSelected((current) => {
      const next = new Set([...current].filter((id) => available.has(id)))
      return next.size === current.size ? current : next
    })
    // an intention can become empty when the level changes
    if (intent && intent !== '*' && !scenesOf(intent).length) setIntent(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level])

  // ------------------------------------------------------------------ launch
  const nbSelected = editing ? picked.size : selected.size
  const comfy = Boolean(state?.comfy)
  /* Optimistic: without it the running flag stays false until the next tick
     (1.5 s), and a plan refresh triggered meanwhile by a field change could
     re-enable the button before the server confirmed the launch. */
  const running = Boolean(state?.running) || launching
  useEffect(() => {
    if (state?.running) setLaunching(false)
  }, [state?.running])

  const instructionText = instruction.trim()
  /* THE common source. See the header of this file — AUDIT.md §5.6, trap 3. */
  const planOk = editing
    ? Boolean(plan && (plan.total ?? 0) > 0 && instructionText)
    : Boolean(plan && (plan.total ?? 0) > 0 && !plan.erreur)
  /* The four conditions the legacy tick and refreshPlan each wrote separately.
     `nbSelected` is redundant with a positive plan today — but it is what the
     legacy guard actually tested (`nbSelection()`), and in editing mode SEL is
     empty while sources are ticked, which is exactly the case that made the two
     writers disagree. It stays explicit. */
  const runDisabled = !planOk || !nbSelected || running || !comfy

  const launch = async () => {
    setLaunching(true)
    const response = await api.post<ActionLike>('/api/run', payload())
    const failure = errorOf(response)
    if (failure) {
      setLaunching(false)
      toast(failure || 'échec du lancement')
      return
    }
    refreshCounts()
  }

  // --------------------------------------------------------------- summary
  const { sumN, sumT } = runSummary({
    editing,
    plan,
    picked,
    instructionText,
    intent,
    selected,
    unsaved,
    quality,
    tone,
    tier,
    bank,
    creative,
    comfy,
    running,
  })

  // --------------------------------------------------------------- render
  const intentions = ((creative?.intentions ?? []) as Intention[]).filter(
    (i) => (i.min_intensity ?? 0) <= level,
  )
  const withAll: Intention[] = [...intentions, { key: '*', label: 'Toutes', icon: '✳', defaults: {} }]
  const full: [Intention, number][] = []
  const empty: [Intention, number][] = []
  withAll.forEach((entry) => {
    const n = scenesOf(entry.key).length
    ;(n ? full : empty).push([entry, n])
  })

  const goCompose = () => navigate(PATHS.bankScenes)

  const pickIntent = (key: string) => {
    if (intent === key) return
    setIntent(key)
    setSelected(new Set()) // changing intention starts from a blank page
    const entry = ((creative?.intentions ?? []) as Intention[]).find((i) => i.key === key)
    setTone(entry?.defaults?.tone || tone || (creative?.tones?.[0]?.key ?? ''))
  }

  /* screen-3-produire, §S: the rail is always on screen, so the screen no
     longer waits for a click to show a scene grid — the first non-empty
     intention is picked as soon as the taxonomy makes one available. Guarded
     on `intent === null` alone: the level-change effect above already clears
     `intent` when it empties out, which makes this the single place a
     default gets chosen, whatever caused the previous one to go away. */
  useEffect(() => {
    if (intent === null && full.length > 0) pickIntent(full[0][0].key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, full.length])

  /* Comparing fewer than 2 candidates is not a comparison — the selection
     dropping under that (untick from the grid, or "Retenir" itself) closes
     the view rather than leaving a one-card side-by-side on screen. */
  useEffect(() => {
    if (compareOpen && selected.size < 2) setCompareOpen(false)
  }, [compareOpen, selected])

  const toggleScene = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    /* An amendment is written FOR a scene: changing the selection makes it
       void, and applying it in silence to another scene would be worse. */
    setOverride('')
  }

  /* "Retenir" in the comparison view: the run narrows to this one candidate.
     Same override-clearing rule as `toggleScene` — a selection change voids
     an amendment written for the scene(s) it used to point at. */
  const keepOnly = (id: string) => {
    setSelected(new Set([id]))
    setOverride('')
  }

  const preview = (plan?.apercu ?? null) as Preview | null

  const previewsMap = (bank?.previews ?? {}) as Record<
    string,
    { name: string; bucket: string; space?: string; v?: number }
  >

  /* Falls back to the last-toggled scene when nothing has been pointed at
     yet this session — a freshly opened screen shows something useful
     without demanding a hover first. `sceneList`, not `visibleScenes`: the
     pointed id can outlive a search/sort/tone change that would drop it. */
  const pointed = pointedId ?? [...selected].slice(-1)[0] ?? null
  const pointedScene = pointed ? (sceneList.find((s) => s.id === pointed) ?? null) : null
  const pointedPreview = pointedScene ? previewsMap[pointedScene.id] : undefined

  /* The NSFW pipeline disables Rapide/Brut (see the button below) — excluded
     from the roving id list so arrows skip them exactly as Tab already does
     for a `disabled` button, rather than "selecting" an option the user
     could not have reached by mouse. Intention and tone have the same
     roving-radiogroup mechanics, now owned by IntentRail (screen-3-produire
     §S — the rail replaced the two revealing steps that used to live here). */
  const qualityAvailable = QUALITY_OPTIONS.filter(
    ([key]) => !(editTier && key !== 'realisme'),
  ).map(([key]) => key)
  const qualityRoving = useRovingChoice(qualityAvailable, quality)

  const pickQuality = (key: string) => {
    setQuality(key)
    // the preset FILLS the panel: one sees what it changes, and can retouch
    // it right after
    setValues((current) => withPreset(current, key, presetRef, nsfwRef))
  }

  return (
    <div className="screen" id="creer">
      {/* Three columns once an intention exists to pick from: the permanent
          rail, the working column, and the sticky inspector. The tier that
          EDITS has nothing for the rail to choose (no intention/tone there),
          so it keeps the two-column layout. Under 1100 px every column goes
          full width and stacks, never as an overlay: it is a sheet one
          reads, not a notification. */}
      {/* FULL WIDTH: Produire leaves the « centred article » model — `--maxw`
          left ~200 px of gutter on each side of a working screen. */}
      <div
        className={`wrap m-0 grid w-full max-w-none gap-[22px] [align-items:start]
                   ${
                     editing
                       ? 'grid-cols-[minmax(0,1fr)_clamp(280px,22vw,420px)]'
                       : 'grid-cols-[170px_minmax(0,1fr)_clamp(280px,22vw,420px)]'
                   }
                   max-[1100px]:grid-cols-[1fr]`}
      >
        {!editing && (
          <IntentRail
            full={full}
            empty={empty}
            intent={intent}
            onPickIntent={pickIntent}
            goCompose={goCompose}
            tones={creative?.tones ?? []}
            tone={tone}
            onPickTone={setTone}
          />
        )}

        <div className="min-w-0">
          <IntensityBar
            tiers={tiers}
            level={level}
            editing={editing}
            onPick={setLevel}
          />

          {editing ? (
            <>
              <div className="mb-[30px]" id="stepSource">
                <h2 className="flex items-baseline gap-[10px]">
                  Image source{' '}
                  <span className="tiny normal-case tracking-normal" id="srcHint">
                    {sources.length
                      ? `— ${picked.size} cochée${picked.size > 1 ? 's' : ''} sur ${sources.length} éditable${sources.length > 1 ? 's' : ''}`
                      : ''}
                  </span>
                </h2>
                {sources.length > 0 && (
                  <div className="mb-[10px]">
                    <button
                      type="button"
                      className="btn sm"
                      id="btnAllSources"
                      onClick={() =>
                        setPicked((current) =>
                          current.size > 0 ? new Set() : new Set(sources.map((s) => s.name)),
                        )
                      }
                    >
                      {picked.size > 0 ? 'Tout décocher' : 'Tout cocher'}
                    </button>
                  </div>
                )}
                <div
                  className="grid max-h-[330px] gap-[10px] overflow-auto p-[3px]
                             grid-cols-[repeat(auto-fill,minmax(130px,1fr))]"
                  id="srcGrid"
                >
                  {sources.length ? (
                    sources.map((source) => {
                      const on = picked.has(source.name)
                      return (
                        <button
                          type="button"
                          key={source.name}
                          /* No border colour in the base chain — see the scene
                             card below, same trap. */
                          className={`relative block w-full cursor-pointer overflow-hidden
                                      rounded-[8px] border-2 bg-transparent p-0
                                      ${on ? 'border-acc' : 'border-line'}`}
                          data-src
                          data-n={source.name}
                          aria-pressed={on}
                          onClick={() =>
                            setPicked((current) => {
                              const next = new Set(current)
                              next.has(source.name) ? next.delete(source.name) : next.add(source.name)
                              return next
                            })
                          }
                        >
                          <img
                            className="block aspect-[4/5] w-full object-cover"
                            loading="lazy"
                            src={api.image({ ...source, thumb: true })}
                            alt=""
                          />
                          {source.bucket !== 'OK' && (
                            <div
                              className="absolute top-[6px] left-[6px] rounded-[5px] border
                                         border-warn-line bg-warn-bg px-[5px] py-px text-[9.5px]
                                         uppercase tracking-[.4px] text-warn"
                            >
                              à revoir
                            </div>
                          )}
                          <div
                            className={`absolute top-[6px] right-[6px] flex h-[20px] w-[20px]
                                        items-center justify-center rounded-[50%] border-[1.5px]
                                        text-[12px] ${
                                          on
                                            ? 'border-acc bg-acc font-bold text-on-acc'
                                            : 'border-[#ffffff55] bg-scrim text-transparent'
                                        }`}
                          >
                            ✓
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <div className="empty col-span-full px-[16px] py-[34px] text-[13px]">
                      aucune image à éditer — produis d'abord au cran Soft, puis reviens ici
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {intent && (
                <div className="mb-[30px]" id="stepScenes">
                  <h2 className="flex items-baseline gap-[10px]">
                    Scènes{' '}
                    <span className="tiny normal-case tracking-normal" id="sceneHint">
                      {sceneSearch.trim()
                        ? `${visibleScenes.length} sur ${scenesOf(intent).length} disponible${scenesOf(intent).length > 1 ? 's' : ''}`
                        : `${visibleScenes.length} disponible${visibleScenes.length > 1 ? 's' : ''} à ce niveau`}
                    </span>
                  </h2>
                  <div className="mb-[12px] flex flex-wrap items-center gap-[10px]" id="sceneToolbar">
                    <input
                      type="search"
                      className="min-w-[160px] flex-1 rounded-[8px] border border-line2 bg-panel2
                                 px-[10px] py-[6px] text-[13px]"
                      id="sceneSearch"
                      placeholder="rechercher une scène"
                      value={sceneSearch}
                      onChange={(event) => setSceneSearch(event.target.value)}
                      aria-label="Rechercher une scène par identifiant"
                      disabled={compareOpen}
                    />
                    <label className="flex items-center gap-[6px] text-[12.5px] text-dim">
                      trier
                      <select
                        className="rounded-[8px] border border-line2 bg-panel2 px-[8px] py-[6px] text-[13px]"
                        id="sceneSortBy"
                        value={sceneSort}
                        onChange={(event) => setSceneSort(event.target.value as SceneSort)}
                        disabled={compareOpen}
                      >
                        <option value="affinity">affinité de ton</option>
                        <option value="never">jamais produites</option>
                        <option value="score">meilleur score</option>
                        <option value="name">nom</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      id="btnCompare"
                      className={`btn sm${compareOpen ? ' on' : ''}`}
                      disabled={!compareOpen && selected.size < 2}
                      data-hint-text="Compare côte à côte les scènes cochées — utile pour n'en retenir qu'une."
                      onClick={() => setCompareOpen((v) => !v)}
                    >
                      {compareOpen ? 'Fermer la comparaison' : `Comparer (${selected.size})`}
                    </button>
                  </div>
                  {compareOpen ? (
                    <SceneCompareView
                      candidates={[...selected]
                        .map((id) => sceneList.find((s) => s.id === id))
                        .filter((s): s is Scene => Boolean(s))}
                      meta={meta}
                      stats={stats}
                      previews={previewsMap}
                      tone={tone}
                      imageUrl={api.image}
                      onRemove={toggleScene}
                      onKeep={keepOnly}
                    />
                  ) : (
                    <>
                      <div
                        className="grid gap-[14px] grid-cols-[repeat(auto-fill,minmax(178px,1fr))]"
                        id="sceneGrid"
                      >
                        {visibleScenes.map((scene) => (
                          <SceneCard
                            key={scene.id}
                            scene={scene}
                            meta={meta[scene.id]}
                            stats={stats[scene.id]}
                            preview={previewsMap[scene.id]}
                            tone={tone}
                            selected={selected.has(scene.id)}
                            imageUrl={api.image}
                            onClick={() => toggleScene(scene.id)}
                            onPoint={() => setPointedId(scene.id)}
                          />
                        ))}
<NewSceneCard onClick={goCompose} />
                      </div>
                      {visibleScenes.length === 0 && sceneSearch.trim() && (
                        <div className="empty px-[16px] py-[24px] text-[13px]">
                          aucune scène ne correspond à « {sceneSearch.trim()} »
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {editTier && intent && (
                <EditStep
                  number={1}
                  instruction={instruction}
                  onInstruction={setInstruction}
                  alerts={(plan?.alertes ?? []) as string[]}
                  output={nsfwOut}
                />
              )}
            </>
          )}
        </div>

        {editing ? (
          <EditStep
            instruction={instruction}
            onInstruction={setInstruction}
            alerts={(plan?.alertes ?? []) as string[]}
            output={nsfwOut}
          />
        ) : (
          <SceneDevelopPanel
            scene={pointedScene}
            meta={pointedScene ? meta[pointedScene.id] : undefined}
            stats={pointedScene ? stats[pointedScene.id] : undefined}
            preview={pointedPreview}
            tone={tone}
            isSelected={pointedScene ? selected.has(pointedScene.id) : false}
            onToggleSelect={toggleScene}
            imageUrl={api.image}
          />
        )}
      </div>

      <SettingsPanel
        open={gearOpen}
        values={values}
        presetRef={presetRef}
        nsfwRef={nsfwRef}
        editTier={editTier}
        nsfwLevel={editTier}
        onChange={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
        onReset={() => {
          setValues(initialValues(presetRef, nsfwRef))
          setQuality('realisme')
        }}
        onClose={closeGear}
      />

      <QueueRail state={state} />

      <div className="launch" id="launchBar">
        {previewOpen && (
          <PromptPreview
            preview={editing ? null : preview}
            singleScene={selected.size === 1 && !editing}
            override={override}
            onOverride={setOverride}
            onClose={() => setPreviewOpen(false)}
          />
        )}
        <div className="inner">
          <div className="sum">
            <b id="sumN">{sumN}</b>
            <div id="sumT">{sumT}</div>
          </div>
          <div className="flex-1" />
          <div className="seg" id="qual" role="radiogroup" aria-label="Qualité de rendu">
            {QUALITY_OPTIONS.map(([key, label, hint]) => {
              /* The NSFW pipeline inherits the refiner and grain from the
                 preset: the presets that cut them are disabled there rather
                 than left clickable with no effect (double guard, see
                 guard_intensity server-side). */
              const disabled = editTier && key !== 'realisme'
              return (
                <button
                  key={key}
                  ref={disabled ? undefined : qualityRoving.registerRef(key)}
                  role="radio"
                  aria-checked={quality === key}
                  tabIndex={disabled ? undefined : qualityRoving.tabIndexFor(key)}
                  className={quality === key ? 'on' : undefined}
                  data-q={key}
                  data-hint-text={hint}
                  disabled={disabled}
                  onClick={() => pickQuality(key)}
                  onKeyDown={
                    disabled
                      ? undefined
                      : (event) => qualityRoving.onKeyDown(event, key, pickQuality)
                  }
                >
                  {label}
                </button>
              )
            })}
          </div>
          <button
            className={`btn sm${previewOpen ? ' on' : ''}`}
            id="btnApercu"
            data-hint-text="Montre le prompt réellement envoyé, fragment par fragment."
            onClick={() => setPreviewOpen((v) => !v)}
          >
            Prompt
          </button>
          <button
            className="btn"
            id="btnGear"
            aria-label="Réglages de génération"
            data-hint-text="Réglages de génération — ce que chacun fait, ce qu'il coûte."
            onClick={(event) => {
              event.stopPropagation()
              toggleGear()
            }}
          >
            ⚙
          </button>
          <button className="btn primary" id="btnRun" disabled={runDisabled} onClick={launch}>
            {editing
              ? planOk
                ? `Éditer ${plan?.total} image${(plan?.total ?? 0) > 1 ? 's' : ''}`
                : 'Éditer'
              : 'Générer'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* The intensity bar. It is out of the scrolling <main> so it stays on screen,
   but it is NOT global chrome: it drives only this screen, which is why it lives
   here now rather than in the shell.

   `intMode` is the TRADE badge: painted only when the current tier edits a
   validated image instead of generating one. Empty and hidden at rest — the
   default case, generation, has nothing to announce, and a permanent badge would
   become decoration again. */
