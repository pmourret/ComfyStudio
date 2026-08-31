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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { errorOf, type ActionLike, type Schema } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useChrome } from '../../chrome/ChromeContext'
import { useConfirm } from '../../chrome/ConfirmContext'
import { useToast } from '../../chrome/ToastContext'
import { mmss } from '../../chrome/Header'
import { useConfig } from '../../state/ConfigContext'
import { useScenes, type Scene } from '../../state/ScenesStoreContext'
import { useSystemState } from '../../state/SystemStateContext'
import { useTaxonomy } from '../../state/TaxonomyContext'
import { usePolling } from '../../state/usePolling'
import { PATHS } from '../../app/routes'
import { EditStep } from './EditStep'
import { Inspector } from './Inspector'
import { PromptPreview } from './PromptPreview'
import { RunPanel } from './RunPanel'
import {
  SettingsPanel,
  initialValues,
  valuesFor,
  withPreset,
  type SettingValues,
} from './SettingsPanel'
import { isEditTier, usePlan, type IntensityTier, type Preview, type SourceImage } from './useProduceState'

type NsfwState = Schema<'NsfwStateResponse'>

/* `CreativeIntention` only declares `key` and `label` in the Pydantic model,
   with `extra="allow"`: creative.json belongs to the character, and that layer
   relays it rather than freezing its shape. This is what the SCREEN reads —
   declared where it is read, like the journal rows and config.json. */
type Intention = {
  key: string
  label?: string | null
  icon?: string
  min_intensity?: number
  defaults?: { tone?: string }
}

/* The source grid only refreshes while it is on screen: that is the only moment
   a newly validated image has to appear in it. */
const NSFW_TICK_MS = 4000

/* The scene card, and the state that is NOT selection. The border colour is out
   of the base chain on purpose: two utilities setting the same property are
   decided by their order in the GENERATED sheet, not by their order in the class
   string, so a conditional appended after `border-line` would never win. Each
   state names its own — and a hover that repaints the border belongs to the
   state that has one to repaint. */
const CARD =
  'relative block w-full cursor-pointer overflow-hidden rounded-card border-2 bg-panel' +
  ' [transition:border-color_.12s]'
const CARD_IDLE = 'border-line hover:border-line2'

/* The five `.lv*.on` rules of `produce.css`, as a table. FULL ESCALATION over
   the tiers — before, only lv2/lv3 had a rule of their own and lv0/lv1 fell back
   on the same accent as every other segmented control of the app. `lv1` is
   absent here because its rule only restated that accent, and a tier the table
   does not name keeps it.

   `--bg` and not `--txt`: light text on the `--bad` fill falls to 3.0:1, under
   AA. The tier that EDITS carries the hue of what it DOES, not of its rank: per
   pack it can sit at level 1 as well as at level 3. */
const TIER_TINT: Record<string, string> = {
  lv0: 'bg-ok! text-bg!',
  lv2: 'bg-warn!',
  lv3: 'bg-bad! text-bg!',
  lvedit: 'bg-bad! text-bg!',
}
const tierKey = (tier: IntensityTier) => (isEditTier(tier) ? 'lvedit' : `lv${tier.level}`)

export function ProduceScreen() {
  const api = useApi()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { creative, reload: reloadCreative } = useTaxonomy()
  const { bank, drafts } = useScenes()
  const { config } = useConfig()
  const { state, refresh: refreshCounts } = useSystemState()
  const { gearOpen, toggleGear } = useChrome()

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
  const [sources, setSources] = useState<SourceImage[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [nsfwOut, setNsfwOut] = useState('')
  const [launching, setLaunching] = useState(false)

  // the panel is filled from config.json as soon as it lands
  useEffect(() => {
    if (config) setValues(initialValues(presetRef, nsfwRef))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  const tiers = creative?.intensity ?? []
  const tier = (tiers.find((t) => t.level === level) ?? null) as IntensityTier | null
  const editTier = isEditTier(tier)
  /* True when the current tier EDITS an existing image instead of generating
     one. That is the default behaviour of the NSFW tier, and the project's rule:
     the branch edits an already validated image, it never generates from zero.
     `generer_avant` restores the generate-then-edit chain for the ONE case where
     it serves — no validated image exists yet for the wanted scene. The server
     applies the same rule in mode_edition(). */
  const editing = editTier && !values.generavant

  /* Level at which the GENERATION pass runs. On the editing tier the chain is in
     two steps: generate at `base_level` (Soft) then edit. The available scenes
     are therefore those of the BASE level, not of the displayed one — otherwise
     the choice empties, no scene declaring band 3. The server applies the same
     rule in niveau_generation(). */
  const sceneLevel = tier?.base_level != null ? tier.base_level : level

  /* A scene is only available if the current level is in its band. The band
     comes from the server (bank.meta), which applies the same compatibility
     defaults as the runner — the frontend does not reimplement them. */
  const meta = (bank?.meta ?? {}) as Record<string, { band?: number[]; intention?: string; tones?: string[]; tags?: string[]; pose?: string }>
  const sceneList = useMemo(() => drafts.map((d) => d.base as Scene), [drafts])
  const inBand = useCallback(
    (scene: Scene) => {
      const band = meta[scene.id]?.band ?? [0, 1]
      return band[0] <= sceneLevel && sceneLevel <= band[1]
    },
    [meta, sceneLevel],
  )
  const intentOf = (scene: Scene) => meta[scene.id]?.intention ?? scene.category
  const scenesOf = useCallback(
    (key: string) => sceneList.filter((s) => inBand(s) && (key === '*' || intentOf(s) === key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sceneList, inBand, meta],
  )

  /* The tone removes no scene — it lifts the ones that suit it. Hard filtering
     led to dead ends (lifestyle + elegant: zero scene). */
  const visibleScenes = useMemo(() => {
    if (!intent) return []
    const affinity = (s: Scene) => ((meta[s.id]?.tones ?? []).includes(tone) ? 0 : 1)
    return scenesOf(intent)
      .slice()
      .sort((a, b) => affinity(a) - affinity(b) || a.id.localeCompare(b.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, tone, scenesOf, meta])

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

  // ------------------------------------------------------------ NSFW sources
  const nsfwTick = useCallback(async () => {
    let response: (NsfwState & ActionLike) | null = null
    try {
      response = await api.get<NsfwState>('/api/nsfw/state')
    } catch {
      return
    }
    if (errorOf(response)) return
    setSources((response.sources ?? []) as SourceImage[])
    if (response.sortie) setNsfwOut(response.sortie)
    /* The arming gesture lives on the Application screen: a change made there
       must make the tier appear or DISAPPEAR here. The server stops emitting the
       tier when the tool is unavailable, so re-reading the taxonomy is enough —
       and leaving the tier if it is gone. */
    const available = Boolean(response.outil?.available)
    if (!available && editTier) {
      await reloadCreative()
      setLevelState(0)
      setPicked(new Set())
    }
  }, [api, editTier, reloadCreative])

  usePolling(nsfwTick, { intervalMs: NSFW_TICK_MS, enabled: editTier, pauseWhenHidden: true })

  /* Prune the selection: an image re-sorted meanwhile is no longer editable, and
     the server would refuse it at launch (sources_valides). */
  useEffect(() => {
    const available = new Set(sources.map((s) => s.name))
    setPicked((current) => {
      const next = new Set([...current].filter((n) => available.has(n)))
      return next.size === current.size ? current : next
    })
  }, [sources])

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
  const { sumN, sumT } = useMemo(() => {
    if (editing) {
      const total = plan?.total ?? 0
      return {
        sumN: total ? `${total} ${total > 1 ? 'images' : 'image'}` : '—',
        sumT: !picked.size
          ? 'coche au moins une image source'
          : !instructionText
            ? "écris l'instruction d'édition"
            : `${total} édition${total > 1 ? 's' : ''} · environ ${mmss(total * 82)}`,
      }
    }
    if (!intent) return { sumN: '—', sumT: 'choisis une intention' }
    if (!selected.size) return { sumN: '—', sumT: 'sélectionne au moins une scène' }
    /* A scene added but not yet saved exists in the bank draft (so in the grid)
       but NOT in scenes.json, which /api/plan reads. Without this message the
       plan came back to zero and the button stayed disabled without a word. */
    if (unsaved.length)
      return {
        sumN: '—',
        sumT:
          unsaved.join(', ') +
          (unsaved.length > 1 ? ' ne sont pas enregistrées' : " n'est pas enregistrée") +
          ' — écran Banque, bouton Enregistrer',
      }
    if (plan?.erreur) return { sumN: '—', sumT: plan.erreur }
    const total = plan?.total ?? 0
    const unit = quality === 'realisme' ? (bank?.avg_duration ?? 55) : quality === 'rapide' ? 32 : 22
    const toneLabel = (creative?.tones ?? []).find((t) => t.key === tone)
    return {
      sumN: total ? `${total} ${total > 1 ? 'images' : 'image'}` : '—',
      sumT:
        `${selected.size} scène${selected.size > 1 ? 's' : ''} · ` +
        `${tier ? tier.label : ''}${toneLabel ? ` · ${toneLabel.label}` : ''} · ` +
        `environ ${mmss(total * unit)}`,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, plan, picked, instructionText, intent, selected, unsaved.join(), quality, tone, tier, bank])

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

  const preview = (plan?.apercu ?? null) as Preview | null

  return (
    <div className="screen" id="creer">
      {/* Two columns: the steps and the execution band on the left, the sticky
          inspector on the right. Under 1100 px the right column goes UNDER, never
          as an overlay: it is a sheet one reads, not a notification. */}
      {/* FULL WIDTH: Produire leaves the « centred article » model — `--maxw`
          left ~200 px of gutter on each side of a working screen. */}
      <div
        className="wrap m-0 grid w-full max-w-none gap-[22px] [align-items:start]
                   grid-cols-[minmax(0,1fr)_clamp(280px,22vw,420px)]
                   max-[1100px]:grid-cols-[1fr]"
      >
        <div className="min-w-0">
          <IntensityBar
            tiers={tiers}
            level={level}
            editing={editing}
            onPick={setLevel}
          />

          <RunPanel state={state} />

          {editing ? (
            <>
              <div className="mb-[30px]" id="stepSource">
                <h2 className="flex items-baseline gap-[10px]">
                  <i className="not-italic text-acc" data-num>1</i> · Image source{' '}
                  <span className="tiny normal-case tracking-normal" id="srcHint">
                    {sources.length
                      ? `— ${picked.size} cochée${picked.size > 1 ? 's' : ''} sur ${sources.length} éditable${sources.length > 1 ? 's' : ''}`
                      : ''}
                  </span>
                </h2>
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

              <EditStep
                number={2}
                instruction={instruction}
                onInstruction={setInstruction}
                alerts={(plan?.alertes ?? []) as string[]}
                output={nsfwOut}
              />
            </>
          ) : (
            <>
              <div className="mb-[30px]" id="stepIntent">
                <h2 className="flex items-baseline gap-[10px]">
                  <i className="not-italic text-acc" data-num>1</i> · Intention
                </h2>
                <div className="intents" id="intentGrid">
                  {full.map(([entry, n]) => (
                    <IntentCard
                      key={entry.key}
                      entry={entry}
                      count={n}
                      active={entry.key === intent}
                      onClick={() => pickIntent(entry.key)}
                    />
                  ))}
                </div>
                {/* Intentions with no scene do not stay greyed at the head of the
                    grid: they move below a separator, and the click leads to the
                    composer. Two dead cards out of eight, at the very first
                    decision of the walk, was the observation of 26/08/2026. */}
                {empty.length > 0 && (
                  <div id="intentVides">
                    <div
                      className="mt-[22px] mb-[12px] flex items-center gap-[12px] text-[12px]
                                 uppercase tracking-[.6px] text-dim
                                 after:h-px after:flex-1 after:bg-line after:content-['']"
                      data-sep
                    >
                      à peupler — aucune scène à ce niveau
                    </div>
                    <div className="intents" id="intentVideGrid">
                      {empty.map(([entry, n]) => (
                        <IntentCard
                          key={entry.key}
                          entry={entry}
                          count={n}
                          active={false}
                          onClick={goCompose}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {intent && (
                <div className="mb-[30px]" id="stepTone">
                  <h2 className="flex items-baseline gap-[10px]">
                    <i className="not-italic text-acc" data-num>2</i> · Ton{' '}
                    <span className="tiny normal-case tracking-normal" id="toneHint">
                      {(() => {
                        const t = (creative?.tones ?? []).find((x) => x.key === tone)
                        return t ? `— ${t.prompt_add}` : ''
                      })()}
                    </span>
                  </h2>
                  <div className="chips" id="toneRow">
                    {(creative?.tones ?? []).map((entry) => (
                      <button
                        type="button"
                        key={entry.key}
                        className={`chip-t${entry.key === tone ? ' on' : ''}`}
                        data-k={entry.key}
                        onClick={() => setTone(entry.key)}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {intent && (
                <div className="mb-[30px]" id="stepScenes">
                  <h2 className="flex items-baseline gap-[10px]">
                    <i className="not-italic text-acc" data-num>3</i> · Scènes{' '}
                    <span className="tiny normal-case tracking-normal" id="sceneHint">
                      {visibleScenes.length} disponible{visibleScenes.length > 1 ? 's' : ''} à ce
                      niveau
                    </span>
                  </h2>
                  <div
                    className="grid gap-[14px] grid-cols-[repeat(auto-fill,minmax(178px,1fr))]"
                    id="sceneGrid"
                  >
                    {visibleScenes.map((scene) => (
                      <SceneCard
                        key={scene.id}
                        scene={scene}
                        meta={meta[scene.id]}
                        stats={(bank?.stats as Record<string, { avg: number | null; n: number }>)?.[scene.id]}
                        preview={(bank?.previews as Record<string, { name: string; bucket: string; space?: string; v?: number }>)?.[scene.id]}
                        tone={tone}
                        selected={selected.has(scene.id)}
                        imageUrl={api.image}
                        onClick={() => toggleScene(scene.id)}
                      />
                    ))}
                    {/* Creating a scene stays possible, but it is no longer the
                        entry point: a card at the end of the grid. */}
                    <button
                      type="button"
                      className={`${CARD} ${CARD_IDLE} flex min-h-[150px] items-center
                                  justify-center border-dashed text-center`}
                      data-scene-card
                      data-new
                      onClick={goCompose}
                    >
                      <div className="px-[11px] py-[9px]">
                        <b className="block truncate text-[20px] font-semibold">+</b>
                        <span className="text-[11.5px] text-dim">créer une scène</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {editTier && intent && (
                <EditStep
                  number={4}
                  instruction={instruction}
                  onInstruction={setInstruction}
                  alerts={(plan?.alertes ?? []) as string[]}
                  output={nsfwOut}
                />
              )}
            </>
          )}
        </div>

        <Inspector />
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
      />

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
          <div className="seg" id="qual">
            {[
              ['realisme', 'Réalisme', 'Pipeline mesuré (peau, grain). Pas le style du personnage.'],
              ['rapide', 'Rapide', 'Coupe la repasse de texture — plus vite, peau plus lisse.'],
              ['brut', 'Brut', 'Coupe repasse, reprise du visage et mise à la taille.'],
            ].map(([key, label, hint]) => (
              <button
                key={key}
                className={quality === key ? 'on' : undefined}
                data-q={key}
                data-hint-text={hint}
                /* The NSFW pipeline inherits the refiner and grain from the
                   preset: the presets that cut them are disabled there rather
                   than left clickable with no effect (double guard, see
                   guard_intensity server-side). */
                disabled={editTier && key !== 'realisme'}
                onClick={() => {
                  setQuality(key)
                  // the preset FILLS the panel: one sees what it changes, and
                  // can retouch it right after
                  setValues((current) => withPreset(current, key, presetRef, nsfwRef))
                }}
              >
                {label}
              </button>
            ))}
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
function IntensityBar({
  tiers,
  level,
  editing,
  onPick,
}: {
  tiers: IntensityTier[]
  level: number
  editing: boolean
  onPick: (level: number) => void
}) {
  const tier = tiers.find((t) => t.level === level) ?? null
  /* `unite` comes from the server: the tier that edits counts SOURCE IMAGES, not
     scenes — it picks none. Announcing « 16 scènes » there was false. */
  const unit = tier?.unite || 'scène'
  const plural = tier && tier.scenes > 1 ? 's' : ''

  return (
    <div
      className="mx-[-20px] mt-[-24px] mb-[22px] flex-none border-b border-b-line bg-panel
                 px-[20px] py-[9px]"
    >
      <div className="flex flex-wrap items-center gap-[14px]">
        <span className="text-[12px] font-semibold uppercase tracking-[.9px] text-dim">
          Intensité
        </span>
        <div className="seg" id="intSel">
          {tiers.map((entry) => (
            <button
              key={entry.level}
              data-lv={entry.level}
              data-edit={isEditTier(entry) ? '1' : undefined}
              /* `!` everywhere: `.seg button` and `.seg button.on` in
                 `screens.css` are element + class selectors, which outweigh a
                 plain utility. The tint comes from ONE class, chosen by the
                 table — chaining a second background would be decided by the
                 generated sheet, not by this string. */
              className={`${entry.level === level ? 'on ' : ''}px-[16px]! py-[6px]! ${
                entry.level === level ? TIER_TINT[tierKey(entry)] ?? '' : ''
              }`}
              title={entry.prompt_add || 'aucun ajout de prompt'}
              data-hint-text={
                isEditTier(entry)
                  ? "N'engendre rien : reprend une image déjà validée."
                  : 'Génère des images nouvelles à ce niveau.'
              }
              onClick={() => onPick(entry.level)}
            >
              {entry.label}
              <span className="ml-[6px] text-[11px] tabular-nums opacity-60">{entry.scenes}</span>
            </button>
          ))}
        </div>
        <span className="tiny" id="intHint">
          {tier
            ? `${tier.export ? 'exportable' : 'hors export'} · ${tier.scenes} ${unit}${plural} ${unit === 'image' ? 'éditable' : 'disponible'}${plural}`
            : ''}
        </span>
        {editing && (
          <span
            className="rounded-[999px] border border-warn-line bg-warn-bg px-[10px] py-[3px]
                       text-[12px] leading-[1.35] text-warn-txt"
            id="intMode"
          >
            Édition — n'engendre rien, reprend une image validée
          </span>
        )}
      </div>
    </div>
  )
}

function IntentCard({
  entry,
  count,
  active,
  onClick,
}: {
  entry: Intention
  count: number
  active: boolean
  onClick: () => void
}) {
  /* `.it` stays a class: it belongs to `wizard.css`, which is not migrated yet.
     What Produire ADDED to it is here — a card with no scene is dimmed, and lifts
     on hover, which is how it says the click leads to the composer. A card with
     no scene is exactly a card of the `#intentVides` grid, which is where the
     sheet hung that rule. `!` on the text: `.it span` is a class + a type. */
  const void_ = count === 0
  return (
    <button
      type="button"
      className={`it${active ? ' on' : ''}${
        void_ ? ' opacity-[.72] hover:border-acc hover:opacity-100' : ''
      }`}
      data-k={entry.key}
      data-void={void_ ? '1' : undefined}
      onClick={onClick}
    >
      <span className={`mb-[9px] block text-[22px]! leading-none ${void_ ? 'text-dim2!' : ''}`}>
        {entry.icon}
      </span>
      <b>{entry.label}</b>
      <span className={void_ ? 'text-dim2!' : undefined}>
        {count ? `${count} scène${count > 1 ? 's' : ''}` : 'en composer une'}
      </span>
    </button>
  )
}

function SceneCard({
  scene,
  meta,
  stats,
  preview,
  tone,
  selected,
  imageUrl,
  onClick,
}: {
  scene: Scene
  meta?: { tones?: string[]; tags?: string[]; pose?: string }
  stats?: { avg: number | null; n: number }
  preview?: { name: string; bucket: string; space?: string; v?: number }
  tone: string
  selected: boolean
  imageUrl: (ref: Record<string, unknown>) => string
  onClick: () => void
}) {
  const { qc } = useConfig()
  const dot =
    stats?.avg == null
      ? 'var(--dim2)'
      : stats.avg >= qc.high
        ? 'var(--ok)'
        : stats.avg >= qc.ok
          ? 'var(--warn)'
          : 'var(--bad)'
  const suits = (meta?.tones ?? []).includes(tone)
  const tags = (meta?.tags ?? []).slice(0, 3).join(' · ')

  return (
    <button
      type="button"
      className={`${CARD} text-left ${selected ? 'border-acc' : CARD_IDLE}`}
      data-scene-card
      data-on={selected ? '1' : undefined}
      aria-pressed={selected}
      onClick={onClick}
    >
      <div
        className={`relative aspect-[4/5] bg-panel2 bg-cover bg-center ${
          preview
            ? ''
            : "after:absolute after:inset-0 after:flex after:items-center" +
              " after:justify-center after:text-[12px] after:text-dim2" +
              " after:content-['aucune_image']"
        }`}
        data-void={preview ? undefined : '1'}
        style={preview ? { backgroundImage: `url('${imageUrl({ ...preview, thumb: true })}')` } : undefined}
      >
        {suits && (
          <div
            className="absolute top-[8px] left-[8px] rounded-[10px] bg-scrim px-[7px] py-px
                       text-[10.5px] font-bold text-acc"
          >
            ce ton
          </div>
        )}
        {meta?.pose && (
          /* imposed pose (ControlNet) */
          <div
            className="absolute top-[8px] right-[8px] rounded-[10px] bg-scrim px-[7px] py-px
                       text-[10.5px] font-bold text-[#9fd8ff]"
            title={`pose imposée : ${meta.pose}`}
          >
            ⛓ pose
          </div>
        )}
        {/* a scene added and not yet saved exists in the grid but NOT in
            scenes.json, which /api/plan reads */
        !meta && (
          <div
            className="absolute bottom-[8px] left-[8px] rounded-[5px] border border-warn-line
                       bg-warn-bg px-[6px] py-[2px] text-[10px] uppercase tracking-[.5px]
                       text-warn"
          >
            non enregistrée
          </div>
        )}
        <div
          className={`absolute top-[8px] right-[8px] flex h-[22px] w-[22px] items-center
                      justify-center rounded-[50%] border-[1.5px] text-[13px] ${
                        selected
                          ? 'border-acc bg-acc font-bold text-on-acc'
                          : 'border-[#ffffff55] bg-scrim text-transparent'
                      }`}
        >
          ✓
        </div>
      </div>
      <div className="px-[11px] py-[9px]">
        <b className="block truncate text-[13px] font-semibold">{scene.id}</b>
        <span className="text-[11.5px] text-dim">
          {scene.format || '4:5'} · {scene.count || 1} img
          {(scene.variants ?? []).length ? ` +${(scene.variants ?? []).length} var.` : ''}
        </span>
        <div className="mt-[5px] flex items-center gap-[6px] text-[11.5px]">
          <span className="h-[7px] w-[7px] flex-none rounded-[50%]" style={{ background: dot }} />
          {stats ? (
            `${stats.avg != null ? stats.avg.toFixed(2) : '—'} · ${stats.n} produite${stats.n > 1 ? 's' : ''}`
          ) : (
            <span className="text-[11.5px] text-dim2">jamais produite</span>
          )}
        </div>
        {tags && <div className="mt-[5px] truncate text-[10.5px] text-dim2">{tags}</div>}
      </div>
    </button>
  )
}
