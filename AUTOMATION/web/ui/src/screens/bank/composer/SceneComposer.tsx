/* The scene composer: one scene, seven tabs, wireframe-driven (31/08/2026).

   WHAT IT REPLACES. The inspector used to be one flat form — a dozen fields
   stacked in a single scroll, id to pose. This walks the same fields through
   seven small panels instead: general, lumière, vêtements, pose, un
   récapitulatif du prompt, une amélioration IA (pour l'instant un gabarit —
   voir la note du panneau), et le JSON final.

   A TABLIST, NOT A NAV — AND RADIX'S, NOT HAND-ROLLED (audit UX/UI
   follow-up). `BankScreen`'s Scènes|Poses switch is a nav because it
   NAVIGATES — two routes, the browser's back button walks between them. These
   seven panels are the opposite case: one widget, no URL change, nothing to
   bookmark. `@radix-ui/react-tabs` owns the roving tabindex, the arrow/Home/End
   keys and the aria-selected/aria-controls/aria-labelledby wiring — three
   separate hand-rolled bugs surfaced in this exact widget before it landed
   here (a focus race on `requestAnimationFrame`, `aria-controls` pointing at
   an unmounted panel, the id template drifting from what the DOM actually
   had). `Tabs.Content` still unmounts inactive panels by default just like
   the hand-rolled version did — `forceMount` + `hidden` below is still ours
   to keep, Radix does not solve that part for free.

   THE PROMPT IS SPLIT HERE, NOWHERE ELSE. `scenes.json` still carries one
   `prompt` string, read by `build_jobs` exactly as before (byte-exact test,
   CLAUDE.md §3). `promptBase` / `promptLight` / `promptPose` are draft-only
   fragments, joined by `composePrompt` on save — see the long comment on
   `SceneDraft` in ScenesStoreContext for why reloading a scene cannot tell the
   fragments apart again. `wardrobe` (what is worn, per level) is presented in
   the Vêtements tab as "Prompt de vêtement" but is a DIFFERENT mechanism
   entirely — injected by `wardrobe_for` at generation time, never merged into
   the joined prompt (the field's own label has always said "jamais la
   tenue") — so it keeps its own control, unlocked by a world link that the
   three prompt fragments respect (ADR-0015: `prompt` is the one key a linked
   scene never owns, `wardrobe`/`pose` are overlay keys it always does). */
import { useEffect, useRef, useState, type RefObject } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Link } from 'react-router-dom'

import { useApi } from '../../../api/useApi'
import { Dialog } from '../../../chrome/Dialog'
import { Icon } from '../../../chrome/Icon'
import { useToast } from '../../../chrome/ToastContext'
import type { Creative } from '../../../state/TaxonomyContext'
import {
  bandOf,
  composePrompt,
  draftsToScenes,
  textToWardrobe,
  type SceneDraft,
} from '../../../state/ScenesStoreContext'
import { PATHS } from '../../../app/routes'
import type { ScenePreview } from '../SceneList'
import { InfoHint } from './InfoHint'
import { PromptField } from './PromptField'
import { joinWardrobeByLevel, splitWardrobeByLevel, WARDROBE_CATALOG, WARDROBE_LEVELS } from './wardrobeCatalog'
import { PoseEditorModal } from '../../pose-editor/PoseEditorModal'

const FORMATS = ['4:5', '2:3', '9:16', '1:1']

/* Border/highlight tints tying RecapPanel's 3 fragment fields to their
   segment in the composed preview (design pass écran 7, §V4) — platform
   tokens (`tokens.css`), not values chosen here: `--frag-light`/`--frag-pose`
   are new, `--acc` for the base fragment is the app's own existing accent. */
const FRAGMENT_COLORS = {
  base: 'var(--acc)',
  light: 'var(--frag-light)',
  pose: 'var(--frag-pose)',
} as const

type TabKey = 'general' | 'light' | 'clothing' | 'pose' | 'recap' | 'ai' | 'json'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'general', label: 'Général', icon: 'gear' },
  { key: 'light', label: 'Lumière', icon: 'bulb' },
  { key: 'clothing', label: 'Vêtements', icon: 'shirt' },
  { key: 'pose', label: 'Pose', icon: 'pose' },
  { key: 'recap', label: 'Prompt global', icon: 'pencil' },
  { key: 'ai', label: 'Amélioration IA', icon: 'robot' },
  { key: 'json', label: 'JSON final', icon: 'terminal' },
]

/* Vocabulary of the walk, for the intention selector. A scene carrying a key
   absent from creative.json KEEPS it: we add it to the list rather than let it
   vanish from the selector — hence from the scene. */
function intentionOptions(creative: Creative | null, current: string) {
  const entries = (creative?.intentions ?? []).map((i) => [i.key, i.label] as [string, string])
  if (current && !entries.some(([key]) => key === current)) entries.push([current, current])
  return entries
}

/** Filename + human label (design pass écran 7, §A1) — the same shape
    `usePoseBank`/`PoseCard` already resolve for the Poses screen, fetched
    separately here (`/api/pose/bank`) rather than widening `poses:
    string[]` on `/api/scenes`: that route stays "enough for a picker" for
    whichever other consumer reads it (its own doc comment,
    `api/routers/images.py`), this composer just asks the richer route for
    itself, same as `usePoseBank` already does. */
type PoseSummary = { name: string; label: string | null }

/* Skeletons of INPUTS/POSE/, served by /api/scenes. A scene pointing at a
   missing skeleton (file moved, renamed) KEEPS it in the list rather than lose
   it in silence — same rule as an out-of-taxonomy intention. */
function poseOptions(poses: PoseSummary[], current: string) {
  return current && !poses.some((p) => p.name === current)
    ? [...poses, { name: current, label: null }]
    : poses
}

export function SceneComposer({
  draft,
  creative,
  poses,
  produced,
  preview,
  imageUrl,
  worldLinked,
  onPatch,
  onRemove,
  onDuplicate,
  onPrevScene,
  onNextScene,
  onSaveDocument,
}: {
  draft: SceneDraft
  creative: Creative | null
  poses: string[]
  produced: number | null
  preview: ScenePreview | undefined
  imageUrl: (ref: Record<string, unknown>) => string
  /* A scene bound to a world place (ADR-0015): its frame — the prompt this
     composer builds — is re-derived server-side on every save, so the four
     fragments below are locked here regardless of what gets typed. Wardrobe
     levels and the pose skeleton are OVERLAY keys, never locked by this. */
  worldLinked: boolean
  onPatch: (patch: Partial<SceneDraft>) => void
  onRemove: () => void
  /** Clones this scene and opens the clone (design pass écran 7, §B1). */
  onDuplicate: () => void
  /** Scene-to-scene chevrons in the header (design pass écran 7, §B2) —
      `undefined` at either end of the (filtered) list. */
  onPrevScene: (() => void) | undefined
  onNextScene: (() => void) | undefined
  /** The document-level save — same action as the launch bar's "Enregistrer",
      offered again from the JSON panel for a "I've checked it, ship it" close. */
  onSaveDocument: () => void
}) {
  const [tab, setTab] = useState<TabKey>('general')
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const idRef = useRef<HTMLInputElement | null>(null)
  const api = useApi()

  /* Labels for `poses` (design pass écran 7, §A1) — refetched whenever the
     filename list itself changes, same trigger `usePoseBank`'s own
     `reloadBankDetail` uses. A pose with no sidecar (legacy, or the fetch
     hasn't landed yet) falls back to its filename below, same as
     `PoseCard`'s own `label || name`. */
  const [poseLabels, setPoseLabels] = useState<Record<string, string | null>>({})
  useEffect(() => {
    let cancelled = false
    void api
      .get<{ poses?: { nom: string; label: string | null }[] }>('/api/pose/bank')
      .then((response) => {
        if (cancelled) return
        const map: Record<string, string | null> = {}
        for (const entry of response.poses ?? []) map[entry.nom] = entry.label
        setPoseLabels(map)
      })
    return () => {
      cancelled = true
    }
  }, [api, poses])
  const posesWithLabels: PoseSummary[] = poses.map((name) => ({ name, label: poseLabels[name] ?? null }))

  /* Opening a DIFFERENT scene always starts on Général and puts the cursor in
     its name — the same "opening focuses the identifier" contract the flat
     form had, just re-anchored to the tab that now holds it. Switching tabs on
     the SAME scene must not fight the user's own navigation, hence keying on
     `draft.uid` and nothing else. */
  useEffect(() => {
    setTab('general')
    idRef.current?.focus()
  }, [draft.uid])

  const activeIndex = TABS.findIndex((t) => t.key === tab)

  /* Only for "Suivant"/"Précédent" below a panel — a gesture OUTSIDE Radix's
     own tablist, so its roving-focus group has no reason to know about it.
     A click or an arrow key INSIDE `Tabs.List` moves focus correctly on its
     own; this is the one path left where the composer still has to do it by
     hand, matching the same "selecting a tab focuses its button" convention
     either way. */
  const goto = (index: number) => {
    if (index < 0 || index >= TABS.length) return
    const key = TABS[index].key
    setTab(key)
    tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${key}"]`)?.focus()
  }
  const gotoTab = (key: TabKey) => goto(TABS.findIndex((t) => t.key === key))

  const lockedNote =
    "hérité du lieu — s'édite dans l'onglet Monde, ce qui serait tapé ici ne survit pas à l'enregistrement (ADR-0015)."

  return (
    /* `flex h-full flex-col`, not a plain block: the tabpanel's own `flex-1`
       (below) needs a REAL flex container to grow inside, and `h-full`
       resolves against `#sceneInspector`'s own height (SceneInspector.tsx)
       only once every link of the chain between here and there is definite —
       a plain block div here left that chain broken, so the panel's height
       fix upstream never reached the tabpanel content at all (audit UX/UI,
       m2 — measured live: a 300px gap between the nav bar and the panel's
       real bottom edge). */
    <Tabs.Root
      value={tab}
      onValueChange={(v) => setTab(v as TabKey)}
      className="flex h-full flex-col"
    >
      <SceneHeader
        draft={draft}
        produced={produced}
        preview={preview}
        imageUrl={imageUrl}
        onPrevScene={onPrevScene}
        onNextScene={onNextScene}
      />

      <Tabs.List
        ref={tabsRef}
        aria-label="Sections de la scène"
        className="mb-[16px] flex gap-[6px] rounded-[10px] border border-line bg-panel2 p-[6px]"
      >
        {TABS.map((t) => (
          <Tabs.Trigger
            key={t.key}
            value={t.key}
            /* `data-tab`, not `id`: Radix computes `aria-controls` from an id
               it generates and tracks internally (`useId`) — overriding the
               rendered `id` prop replaces the ATTRIBUTE but not Radix's own
               reference to the value it expected there, which broke both
               `aria-controls` (pointed at an id nothing wore any more) and
               the roving-focus group's own lookup of "the next trigger to
               focus" (same mechanism, same expected id). A plain data
               attribute gives the browser fumigation something stable to
               select on without touching what Radix already gets right. */
            data-tab={t.key}
            data-hint-text={t.label}
            className={`flex flex-1 cursor-pointer items-center justify-center rounded-[7px] border-0
                       py-[12px] focus-visible:outline-2 focus-visible:outline-focus
                       focus-visible:outline-offset-2 ${
                         tab === t.key ? 'bg-acc text-on-acc' : 'bg-transparent text-dim hover:text-txt'
                       }`}
          >
            <span className="sr-only">{t.label}</span>
            <Icon name={t.icon} className="h-[19px] w-[19px]" />
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {/* All SEVEN panels stay mounted (`forceMount`) — only the active one's
          CONTENT does not (audit UX/UI, M2). Radix itself only mounts the
          active `Tabs.Content` by default, which would have reproduced the
          exact bug this fixed: `aria-controls` pointing at an unmounted
          panel for the six inactive tabs. `hidden` keeps the same practical
          effect (invisible, out of the accessibility tree, out of tab order)
          without the trigger lying about what it controls — Radix computes
          `aria-controls`/`aria-labelledby` itself from `value`, correctly,
          whichever panels happen to be mounted. */}
      {TABS.map((t) => (
        <Tabs.Content
          key={t.key}
          value={t.key}
          data-tabpanel={t.key}
          forceMount
          hidden={tab !== t.key}
          className="flex-1 min-h-0"
        >
          {tab === t.key && (
            /* `flex h-full flex-col` on an INNER wrapper, not the `hidden`
               element itself (audit UX/UI, m2): Tailwind's `.flex{display:
               flex}` and the UA's `[hidden]{display:none}` carry the same
               specificity, so putting both on one element risks the utility
               winning the cascade and defeating `hidden` — keeping them on
               separate elements sidesteps the question entirely. The content
               panel is `flex-1`: on a short tab (Général, Lumière…) it grows
               to fill the now-full-height box instead of leaving the nav bar
               floating over a dead gap above the panel's bottom edge. */
            <div className="flex h-full flex-col">
              <div className="flex-1">
                {t.key === 'general' && (
                  <GeneralPanel
                    draft={draft}
                    creative={creative}
                    produced={produced}
                    worldLinked={worldLinked}
                    idRef={idRef}
                    onPatch={onPatch}
                    onGotoClothing={() => gotoTab('clothing')}
                  />
                )}
                {t.key === 'light' && (
                  <LightPanel draft={draft} worldLinked={worldLinked} lockedNote={lockedNote} onPatch={onPatch} />
                )}
                {t.key === 'clothing' && <ClothingPanel draft={draft} onPatch={onPatch} />}
                {t.key === 'pose' && (
                  <PosePanel
                    draft={draft}
                    poses={posesWithLabels}
                    worldLinked={worldLinked}
                    lockedNote={lockedNote}
                    onPatch={onPatch}
                  />
                )}
                {t.key === 'recap' && (
                  <RecapPanel draft={draft} worldLinked={worldLinked} lockedNote={lockedNote} onPatch={onPatch} />
                )}
                {t.key === 'ai' && <AiPanel draft={draft} />}
                {t.key === 'json' && <JsonPanel draft={draft} onSaveDocument={onSaveDocument} />}
              </div>

              {/* One shared bottom section, same shape on EVERY tab (wireframe
                  31/08/2026): a rule, then full-width bars — Suivant above
                  Précédent, never side by side — so the gesture is always in
                  the same place regardless of which panel is open. Only their
                  PRESENCE varies (no Précédent on the first tab, no Suivant on
                  the last); "Dupliquer"/"Supprimer la scène" are General-only,
                  always last, destructive strictly after neutral (design pass
                  écran 7, §B1 — a destructive act does not share a row with
                  navigation, nor come before a constructive one). */}
              <div className="mt-[18px] flex flex-col gap-[10px] border-t border-line pt-[16px]">
                {activeIndex < TABS.length - 1 && (
                  <button className="btn w-full" onClick={() => goto(activeIndex + 1)}>
                    Suivant →
                  </button>
                )}
                {activeIndex > 0 && (
                  <button className="btn w-full" onClick={() => goto(activeIndex - 1)}>
                    ← Précédent
                  </button>
                )}
                {t.key === 'general' && (
                  <button className="btn w-full" onClick={onDuplicate}>
                    Dupliquer la scène
                  </button>
                )}
                {t.key === 'general' && (
                  <button className="btn danger w-full" onClick={onRemove}>
                    ⚠ Supprimer la scène
                  </button>
                )}
              </div>
            </div>
          )}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  )
}

/* ------------------------------------------------------------ En-tête
   "Studio IA, pas un formulaire" (2026-09-01 direction). Persistent across
   every tab — unlike the panels below, this is not `Tabs.Content` — because
   the whole point is to never lose sight of WHAT is being edited while
   composing it: the composer used to be text fields end to end, no image
   anywhere, indistinguishable from editing a spreadsheet row. The grid card
   already carries this same preview; nothing upstream of it changes here,
   this just stops discarding it the moment a scene opens for editing. */
function SceneHeader({
  draft,
  produced,
  preview,
  imageUrl,
  onPrevScene,
  onNextScene,
}: {
  draft: SceneDraft
  produced: number | null
  preview: ScenePreview | undefined
  imageUrl: (ref: Record<string, unknown>) => string
  /** Scene-to-scene chevrons (design pass écran 7, §B2) — `undefined` at
      either end of the list, same "only render what is possible" rule as
      the composer's own Suivant/Précédent. */
  onPrevScene: (() => void) | undefined
  onNextScene: (() => void) | undefined
}) {
  const composed = composePrompt(draft)
  // Mirror of `lb.scene_band` / the old grid card's own call: the ceiling
  // follows the wardrobe TEXT as typed, so the badge answers "how far does
  // this scene go" without a save.
  const band = bandOf({
    intensity: Number.parseInt(draft.bandLo, 10) || 0,
    wardrobe: textToWardrobe(draft.wardrobe),
  })
  return (
    <div className="mb-[16px] flex gap-[14px]">
      {/* Bumped from a 51×64 reminder icon to an actual focal point (studio-IA
          polish pass, 2026-09-01) — the composer has the width for it now that
          the scene list gave it up (see BankScreen.tsx's grid-cols). Pose/band
          badges moved here from the retired grid card (2026-09-01): the list
          row dropped them once this header started carrying the picture, so
          they needed exactly one new home, not two. */}
      <div
        id="scenePreviewThumb"
        data-void={preview ? undefined : '1'}
        className={`relative h-[128px] w-[102px] shrink-0 overflow-hidden rounded-[10px] border
                   border-line2 bg-panel2 bg-cover bg-center ${
                     preview
                       ? ''
                       : "after:absolute after:inset-0 after:flex after:items-center" +
                         " after:justify-center after:p-[6px] after:text-center after:text-[10px]" +
                         " after:leading-tight after:text-dim2 after:content-['jamais_produite']"
                   }`}
        style={preview ? { backgroundImage: `url('${imageUrl({ ...preview, thumb: true })}')` } : undefined}
      >
        {draft.pose && (
          // `tabIndex={0}` + `data-hint-text` (design pass écran 7, §A2) —
          // same contract as `InfoHint` and `PoseCard`'s own provenance
          // badge (`chrome/HintLayer.tsx`, wired on hover AND focus): a
          // plain `title` only reaches a mouse, this reaches the keyboard
          // and a screen reader too. The base fact stays in visible text.
          <div
            className="absolute top-[6px] left-[6px] rounded-[8px] bg-scrim px-[6px] py-px
                       text-[10px] font-bold text-[#9fd8ff]"
            tabIndex={0}
            data-hint-text={`pose imposée : ${draft.pose}`}
          >
            {/* the glyph accompanies a word, so it is not read out on its own */}
            <span aria-hidden="true">⛓ </span>pose
          </div>
        )}
        {band[1] > 0 && (
          <div
            className="absolute right-[6px] bottom-[6px] rounded-[8px] bg-scrim px-[6px]
                       py-px text-[10px] font-bold text-dim"
            tabIndex={0}
            data-hint-text={`niveaux ${band[0]} à ${band[1]}, déduits des tenues`}
          >
            n{band[0]}–{band[1]}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          {/* Scene-to-scene chevrons (design pass écran 7, §B2) — discreet,
              next to the id rather than a bar of their own: Suivant/Précédent
              below already own the visual weight of "move", these are a
              lighter accelerator for the one gesture (Échap, arrow, reopen)
              this replaces. Same Up/Down keys as `onListKeyDown`, elevated to
              the whole composer (`SceneInspector.tsx`). */}
          <div className="flex items-center gap-[6px]">
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded-[5px] border-0 bg-transparent p-0
                         text-[13px] leading-none text-dim2 hover:text-txt
                         disabled:cursor-not-allowed disabled:opacity-30
                         focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
              aria-label="Scène précédente"
              data-hint-text="Scène précédente — même liste que les ateliers, flèche Haut"
              disabled={!onPrevScene}
              onClick={onPrevScene}
            >
              ◂
            </button>
            <b className="block min-w-0 flex-1 truncate text-[17px]">{draft.id || '(sans identifiant)'}</b>
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded-[5px] border-0 bg-transparent p-0
                         text-[13px] leading-none text-dim2 hover:text-txt
                         disabled:cursor-not-allowed disabled:opacity-30
                         focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
              aria-label="Scène suivante"
              data-hint-text="Scène suivante — même liste que les ateliers, flèche Bas"
              disabled={!onNextScene}
              onClick={onNextScene}
            >
              ▸
            </button>
          </div>
          <span className="text-[12px] text-dim">
            {produced ? `${produced} image${produced > 1 ? 's' : ''} produite${produced > 1 ? 's' : ''}` : 'jamais produite'}
          </span>
        </div>

        <div className="flex items-start gap-[6px] rounded-[7px] border border-line2 bg-panel2 px-[10px] py-[8px]">
          <span className="shrink-0 pt-px text-[10px] font-semibold uppercase tracking-[.5px] text-dim2">
            Prompt
            <InfoHint text="Aperçu en direct du prompt composé, mis à jour à chaque frappe — le détail par fragment s'édite dans l'onglet Prompt global, jamais ici." />
          </span>
          <p
            id="scenePromptPreview"
            className="m-0 line-clamp-3 min-w-0 flex-1 text-[12px] text-dim"
            title={composed || undefined}
          >
            {composed || '— vide —'}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Général */
function GeneralPanel({
  draft,
  creative,
  produced,
  worldLinked,
  idRef,
  onPatch,
  onGotoClothing,
}: {
  draft: SceneDraft
  creative: Creative | null
  produced: number | null
  worldLinked: boolean
  idRef: RefObject<HTMLInputElement | null>
  onPatch: (patch: Partial<SceneDraft>) => void
  /** Jumps to the Vêtements tab — the gauge below answers "why this ceiling",
      this answers "where do I change it". */
  onGotoClothing: () => void
}) {
  const band = bandOf({
    intensity: Number.parseInt(draft.bandLo, 10) || 0,
    wardrobe: textToWardrobe(draft.wardrobe),
  })

  return (
    <div>
      <label className="f">
        <span>identifiant — sert de nom de fichier</span>
        <input
          ref={idRef}
          className="font-semibold"
          data-f="id"
          value={draft.id}
          onChange={(e) => onPatch({ id: e.target.value })}
        />
      </label>
      <p className="tiny mt-[6px] mb-[14px]">
        {produced
          ? `${produced} image(s) déjà produite(s) — renommer l'identifiant les détache de cette scène.`
          : 'jamais produite'}
      </p>

      <label className="f mt-[10px]">
        <span>
          intention — sert aussi de dossier d'export
          {worldLinked && <> · <b>héritée du lieu</b>, s'édite dans l'onglet Monde</>}
        </span>
        <select
          data-f="intention"
          value={draft.intention}
          disabled={worldLinked}
          onChange={(e) => onPatch({ intention: e.target.value })}
        >
          <option value="">— aucune —</option>
          {intentionOptions(creative, draft.intention).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-[12px] grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-[14px]">
        <label className="f">
          <span>format</span>
          <select data-f="format" value={draft.format} onChange={(e) => onPatch({ format: e.target.value })}>
            {FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="f">
          <span>images</span>
          <input
            data-f="count"
            type="number"
            min={1}
            value={draft.count}
            onChange={(e) => onPatch({ count: e.target.value })}
          />
        </label>
        <label className="f">
          <span>guidance (option)</span>
          <input
            data-f="guidance"
            type="number"
            step="0.1"
            placeholder="défaut"
            value={draft.guidance}
            onChange={(e) => onPatch({ guidance: e.target.value })}
          />
        </label>
        <div>
          <label className="f">
            <span>
              niveau minimum
              <InfoHint text="Le maximum n'est pas saisi : il est déduit de la tenue la plus haute déclarée dans l'onglet Vêtements, pour ne pas avoir deux champs qui peuvent se contredire." />
            </span>
            <input
              data-f="band_lo"
              type="number"
              min={0}
              max={3}
              value={draft.bandLo}
              onChange={(e) => onPatch({ bandLo: e.target.value })}
            />
          </label>
          <BandGauge band={band} onJump={onGotoClothing} />
        </div>
      </div>

      <div className="mt-[12px] grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[14px]">
        <label className="f">
          <span>tons affins — virgules</span>
          <input
            data-f="tones"
            placeholder={(creative?.tones ?? []).map((t) => t.key).join(', ')}
            value={draft.tones}
            onChange={(e) => onPatch({ tones: e.target.value })}
          />
        </label>
        <label className="f">
          <span>tags — virgules</span>
          <input data-f="tags" value={draft.tags} onChange={(e) => onPatch({ tags: e.target.value })} />
        </label>
      </div>
    </div>
  )
}

/* Compact 0→3 gauge — segments `band[0]`..`band[1]` filled in accent, the rest
   dim. Clickable: jumps to Vêtements, since the ceiling shown here is DEDUCED
   from what is declared there (design pass écran 7, §V1) — the gauge answers
   "why this ceiling" on sight, the click answers "where do I change it". */
function BandGauge({ band, onJump }: { band: [number, number]; onJump: () => void }) {
  return (
    <button
      type="button"
      className="mt-[6px] flex cursor-pointer items-center gap-[3px] rounded-[6px]
                 border-0 bg-transparent p-0 focus-visible:outline-2
                 focus-visible:outline-focus focus-visible:outline-offset-2"
      aria-label={`Niveaux ${band[0]} à ${band[1]} — ouvrir l'onglet Vêtements pour changer le plafond`}
      data-hint-text="Le plafond est déduit de la tenue la plus haute déclarée dans l'onglet Vêtements — cliquer pour y aller."
      onClick={onJump}
    >
      {[0, 1, 2, 3].map((level) => (
        <span
          key={level}
          aria-hidden="true"
          className={`h-[6px] w-[20px] rounded-[2px] ${
            level >= band[0] && level <= band[1] ? 'bg-acc' : 'bg-line2'
          }`}
        />
      ))}
    </button>
  )
}

/* ----------------------------------------------------------------- Lumière */
function LightPanel({
  draft,
  worldLinked,
  lockedNote,
  onPatch,
}: {
  draft: SceneDraft
  worldLinked: boolean
  lockedNote: string
  onPatch: (patch: Partial<SceneDraft>) => void
}) {
  return (
    <div>
      <PromptField
        dataField="prompt_light"
        label="Prompt de lumière de la scène"
        hint="Rejoint le prompt final à l'enregistrement, après le décor et avant le vêtement et la pose."
        placeholder="ex : golden hour, soft window light"
        value={draft.promptLight}
        disabled={worldLinked}
        lockedNote={worldLinked ? lockedNote : undefined}
        onChange={(value) => onPatch({ promptLight: value })}
      />

      <label className="f mt-[14px]">
        <span>variantes de lumière ou de saison (une par ligne) — jamais une tenue</span>
        <textarea
          className="min-h-[68px] resize-y"
          data-f="variants"
          value={draft.variants}
          onChange={(e) => onPatch({ variants: e.target.value })}
        />
      </label>

      <EmptyCatalog
        label="Travailler depuis un template de lumière"
        hint="Catalogue de templates de lumière réutilisables — pas encore alimenté dans cette version. En attendant, décris la lumière directement ci-dessus."
        empty="aucun template pour l'instant"
      />
    </div>
  )
}

/* --------------------------------------------------------------- Vêtements
   Never gated by `worldLinked`: `wardrobe` is an OVERLAY key (ADR-0015 §2),
   the one thing a world-linked scene always keeps as its own — unlike the
   three prompt fragments, it is never re-derived nor discarded at save.

   FOUR FIELDS, ONE PER LEVEL (design pass écran 7, §V2) — replaces the single
   free-text zone prefixed by hand (« 0: a linen shirt… »), where a mistyped
   prefix silently dropped the line into no level at all. `draft.wardrobe`
   stays the SAME flat "N: description" text underneath (`composePrompt`/
   `bandOf` never see this split); `splitWardrobeByLevel`/`joinWardrobeByLevel`
   (wardrobeCatalog.ts) are the round trip, done fresh on every render rather
   than held as separate state — the same "derived, never stored" rule
   `useSceneWorkbench.tsx` already follows, so this panel can never drift from
   `draft.wardrobe` itself. A line that does not parse (typed elsewhere, via
   the Recap tab's raw mirror) rides along as `extra`, untouched. */
function ClothingPanel({
  draft,
  onPatch,
}: {
  draft: SceneDraft
  onPatch: (patch: Partial<SceneDraft>) => void
}) {
  /* Filter narrows which garments the grid shows; SELECTING one only
     highlights it. Nothing touches `wardrobe` until "+" is pressed — a
     deliberate two-step (browse, then commit) rather than the earlier
     "every click writes a line" version, which made a mis-click hard to
     notice among a dozen entries. */
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState('')
  /* Audit UX/UI (M4) : the selector used to always write "0: ...", so it
     stopped being useful the moment a scene needed a garment above the
     floor level — the exact mechanic (`bandOf`) this whole tab exists to
     feed. Defaults to the scene's OWN minimum rather than a flat 0: a scene
     already living at niveau 1 most likely wants its next garment there
     too, not silently back at 0. Also which of the 4 fields below "+" writes
     into — the active level the panel's own hint refers to. */
  const [level, setLevel] = useState(() => Math.min(3, Math.max(0, Number.parseInt(draft.bandLo, 10) || 0)))
  const items = filter
    ? (WARDROBE_CATALOG.find((c) => c.category === filter)?.items ?? [])
    : WARDROBE_CATALOG.flatMap((c) => c.items)

  const { byLevel, extra } = splitWardrobeByLevel(draft.wardrobe)
  const setLevelText = (targetLevel: number, text: string) =>
    onPatch({ wardrobe: joinWardrobeByLevel({ ...byLevel, [targetLevel]: text }, extra) })

  return (
    <div>
      <span className="text-[12px] text-dim">
        Prompt de vêtement, par niveau
        <InfoHint text="Une tenue par ligne — le champ EST le niveau, plus besoin de le taper devant. Le niveau le plus haut renseigné ici fixe jusqu'où la scène peut monter. Jamais fondu dans le prompt final envoyé au modèle : la tenue est injectée séparément selon le niveau de génération — c'est ce que le studio veut dire par « jamais la tenue »." />
      </span>
      <div className="mt-[8px] grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[10px]">
        {WARDROBE_LEVELS.map((lvl) => (
          <label className="f" key={lvl}>
            <span>
              niveau {lvl}
              {lvl === 0 && ' — repli des niveaux au-dessus tant qu ils sont vides'}
            </span>
            <textarea
              className="min-h-[56px] resize-y"
              data-f={`wardrobe_${lvl}`}
              placeholder={lvl === 0 ? 'a beige knit sweater and jeans' : undefined}
              value={byLevel[lvl]}
              onChange={(e) => setLevelText(lvl, e.target.value)}
            />
          </label>
        ))}
      </div>
      {extra.length > 0 && (
        <p className="tiny mt-[8px] mb-0">
          {extra.length} ligne{extra.length > 1 ? 's' : ''} sans niveau reconnu, laissée
          {extra.length > 1 ? 's' : ''} intacte{extra.length > 1 ? 's' : ''} — visible
          {extra.length > 1 ? 's' : ''} et modifiable{extra.length > 1 ? 's' : ''} dans l'onglet Prompt global.
        </p>
      )}

      <div className="mt-[16px] flex flex-wrap items-center justify-between gap-[10px]">
        <span className="text-[12px] text-dim">
          Sélecteur de vêtement
          <InfoHint text="Vocabulaire de départ en texte — des images de collection remplaceront ces cases à terme. Filtre par catégorie, sélectionne une pièce, choisis le niveau, puis « + » l'ajoute au champ de ce niveau, sans toucher aux autres." />
        </span>
        <div className="flex items-center gap-[8px]">
          <label className="sr-only" htmlFor="wardrobeFilter">
            filtrer le sélecteur de vêtement par catégorie
          </label>
          <select
            id="wardrobeFilter"
            className="!w-auto"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setSelected('')
            }}
          >
            <option value="">toutes les catégories</option>
            {WARDROBE_CATALOG.map(({ category }) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="wardrobeLevel">
            niveau du champ où ajouter la pièce
          </label>
          <select
            id="wardrobeLevel"
            className="!w-auto"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          >
            {WARDROBE_LEVELS.map((n) => (
              <option key={n} value={n}>
                niveau {n}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn sm"
            aria-label="Ajouter la pièce sélectionnée comme nouvelle ligne"
            disabled={!selected}
            onClick={() => setLevelText(level, byLevel[level] ? `${byLevel[level]}\n${selected}` : selected)}
          >
            +
          </button>
        </div>
      </div>

      <div
        className="mt-[8px] grid max-h-[230px] grid-cols-[repeat(auto-fill,minmax(92px,1fr))]
                   gap-[8px] overflow-y-auto rounded-[8px] border border-line2 p-[8px]"
      >
        {items.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={selected === item}
            title={item}
            /* A square placeholder for the illustrated thumbnail this control
               will show once a real catalog exists — the text sits where the
               image will. */
            className={`flex aspect-square items-center justify-center overflow-hidden rounded-[8px]
                       border p-[6px] text-center text-[10.5px] leading-tight text-dim ${
                         selected === item ? 'border-acc bg-panel2' : 'border-line2 bg-panel'
                       }`}
            onClick={() => setSelected(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- Pose */
function PosePanel({
  draft,
  poses,
  worldLinked,
  lockedNote,
  onPatch,
}: {
  draft: SceneDraft
  poses: PoseSummary[]
  worldLinked: boolean
  lockedNote: string
  onPatch: (patch: Partial<SceneDraft>) => void
}) {
  const options = poseOptions(poses, draft.pose)
  // Same `label || name` fallback as `PoseCard`'s own accessible name.
  const currentLabel = options.find((p) => p.name === draft.pose)?.label || draft.pose
  const [editing, setEditing] = useState(false)
  /* "+ Nouvelle pose" (design pass écran 7, §V3): two steps, both without
     leaving the scene. `naming` collects name + starting template (the same
     decision `NewPoseModal` collects for the Poses screen, minus "créer
     aussi un gabarit réutilisable" — a one-off pose for this scene has no
     reason to also seed the shared preset library; that path stays on the
     Poses screen's own "+ Nouvelle pose"). Once named, `creating` opens the
     SAME `PoseEditorModal` the pencil above already uses to correct an
     ASSIGNED pose in place — here with a `preset` source instead of a
     `pose` one — and its `onSaved` assigns the result to `draft.pose`
     directly, instead of returning to the pose list. */
  const [naming, setNaming] = useState(false)
  const [creating, setCreating] = useState<{ presetName: string; label: string } | null>(null)
  return (
    <div>
      <PromptField
        dataField="prompt_pose"
        label="Prompt de pose"
        hint="Description en prose de la pose (« leaning against the doorway »). Rejoint le prompt final. Le squelette ControlNet ci-dessous est un mécanisme séparé — les deux peuvent coexister ou non."
        placeholder="ex : leaning against the doorway, arms crossed"
        value={draft.promptPose}
        disabled={worldLinked}
        lockedNote={worldLinked ? lockedNote : undefined}
        onChange={(value) => onPatch({ promptPose: value })}
      />

      <div className="mt-[14px] flex items-center justify-between">
        <span className="text-[12px] text-dim">
          Sélecteur de pose — squelette ControlNet imposé (option, cran SFW uniquement)
          <InfoHint text="Mesuré (A/B interne) : 0 image sous la bande d'identité sur 15. Un squelette de dos ou de profil peut ne pas être suivi par le modèle — vérifier le résultat à l'œil après génération." />
        </span>
        <div className="flex items-center gap-[6px]">
          {draft.pose && (
            <button
              type="button"
              className="btn sm"
              aria-label={`Modifier « ${currentLabel} » point par point`}
              data-hint-text="Retoucher ce squelette, sans quitter la scène"
              onClick={() => setEditing(true)}
            >
              <Icon name="pencil" className="h-[14px] w-[14px]" />
            </button>
          )}
          <Link className="btn sm" to={PATHS.bankPoses}>
            Éditeur de pose
          </Link>
        </div>
      </div>
      <div
        className="mt-[8px] grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-[8px]"
        data-f="pose"
        data-value={draft.pose}
      >
        <button
          type="button"
          aria-pressed={!draft.pose}
          className={`flex aspect-square items-center justify-center rounded-[8px] border
                     text-[11px] text-dim ${!draft.pose ? 'border-acc bg-panel2' : 'border-line2 bg-panel'}`}
          onClick={() => onPatch({ pose: '' })}
        >
          aucune
        </button>
        <button
          type="button"
          className="flex aspect-square items-center justify-center rounded-[8px]
                     border border-dashed border-line2 text-[11px] text-dim hover:text-txt"
          data-hint-text="Créer une pose depuis un gabarit, sans quitter la scène"
          onClick={() => setNaming(true)}
        >
          <span aria-hidden="true">+ </span>nouvelle
        </button>
        {options.length === 0 ? (
          <div className="empty col-span-full p-[16px] text-[12px]">
            aucun squelette dans les ateliers — l'éditeur de pose en extrait depuis une photo
          </div>
        ) : (
          options.map(({ name, label }) => (
            <button
              key={name}
              type="button"
              aria-pressed={draft.pose === name}
              title={label || name}
              className={`relative aspect-square overflow-hidden rounded-[8px] border bg-black ${
                draft.pose === name ? 'border-acc' : 'border-line2'
              }`}
              onClick={() => onPatch({ pose: name })}
            >
              {/* `alt` carries the button's accessible name — same
                  `label || name` fallback as `PoseCard`'s own thumbnail
                  (design pass écran 7, §A1): a screen reader used to hear
                  the raw filename (`leaning-doorway-standing-01`) with no
                  route to the human label PoseCard already shows. */}
              <img
                className="h-full w-full object-contain"
                loading="lazy"
                src={`/img/pose?name=${encodeURIComponent(name)}`}
                alt={label || name}
              />
            </button>
          ))
        )}
      </div>

      {editing && draft.pose && (
        <PoseEditorModal
          source={{ kind: 'pose', name: draft.pose }}
          onClose={() => setEditing(false)}
          onSaved={(name) => {
            onPatch({ pose: name })
            setEditing(false)
          }}
        />
      )}

      {naming && (
        <NewPoseDialog
          onCancel={() => setNaming(false)}
          onStart={(intent) => {
            setCreating(intent)
            setNaming(false)
          }}
        />
      )}
      {creating && (
        <PoseEditorModal
          source={{ kind: 'preset', nom: creating.presetName, initialLabel: creating.label }}
          onClose={() => setCreating(null)}
          onSaved={(name) => {
            onPatch({ pose: name })
            setCreating(null)
          }}
        />
      )}
    </div>
  )
}

/* Name + starting-template step for a from-scratch pose, opened by the "+
   Nouvelle pose" tile above. Deliberately a SMALLER form than the Poses
   screen's own `NewPoseModal` (no "créer aussi un gabarit réutilisable" — a
   one-off pose for this scene has no reason to also seed the shared preset
   library) and it hands its result to a CALLBACK instead of navigating: the
   scene composer stays open, `PosePanel` above opens `PoseEditorModal` next
   rather than routing to `PATHS.poseEditor`. */
function NewPoseDialog({
  onCancel,
  onStart,
}: {
  onCancel: () => void
  onStart: (intent: { presetName: string; label: string }) => void
}) {
  const api = useApi()
  const [presets, setPresets] = useState<{ nom: string; label: string }[] | null>(null)
  const [chosenPreset, setChosenPreset] = useState<string | null>(null)
  const [label, setLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    void api
      .get<{ presets?: { nom: string; label: string }[] }>('/api/pose/presets')
      .then((response) => {
        if (cancelled) return
        const list = response.presets ?? []
        setPresets(list)
        setChosenPreset((current) => current ?? list[0]?.nom ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [api])

  const canStart = Boolean(chosenPreset) && label.trim() !== ''

  return (
    <Dialog
      id="newPoseInlineBox"
      open
      onDismiss={onCancel}
      initialFocus="#newPoseInlineName"
      className="w-[min(460px,calc(100vw-32px))] max-w-[min(460px,calc(100vw-32px))]"
      cardClassName="w-[min(460px,100%)]! p-[20px]!"
    >
      <h3 className="mb-[4px]! text-[16px]!">Nouvelle pose</h3>
      <p className="tiny mb-[14px]">
        Coordonnées entièrement inventées, jamais issues d'une photo — le point
        de départ se corrige ensuite point par point, sans quitter la scène.
      </p>

      <label className="tiny mb-[4px] block" htmlFor="newPoseInlineName">
        Nom
      </label>
      <input
        id="newPoseInlineName"
        className="mb-[14px] w-full"
        value={label}
        placeholder="ex. assise sur un tabouret"
        onChange={(event) => setLabel(event.target.value)}
      />

      <div className="tiny mb-[6px]">Gabarit de départ</div>
      {presets === null ? (
        <p className="tiny mb-[14px]">chargement…</p>
      ) : presets.length === 0 ? (
        <div className="empty mb-[14px] rounded-card border border-line bg-panel px-[12px] py-[16px] text-[13px]">
          aucun gabarit disponible.
        </div>
      ) : (
        <div className="mb-[14px] grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-[8px]">
          {presets.map((p) => (
            <button
              key={p.nom}
              type="button"
              aria-pressed={chosenPreset === p.nom}
              className={`rounded-[8px] border px-[12px] py-[8px] text-[13px] ${
                chosenPreset === p.nom ? 'border-acc bg-panel2' : 'border-line2 bg-panel'
              }`}
              onClick={() => setChosenPreset(p.nom)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-[12px]">
        <button
          type="button"
          className="btn primary"
          disabled={!canStart}
          onClick={() => chosenPreset && onStart({ presetName: chosenPreset, label: label.trim() })}
        >
          Continuer
        </button>
        <button type="button" className="link" onClick={onCancel}>
          annuler
        </button>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------- Prompt global */
function RecapPanel({
  draft,
  worldLinked,
  lockedNote,
  onPatch,
}: {
  draft: SceneDraft
  worldLinked: boolean
  lockedNote: string
  onPatch: (patch: Partial<SceneDraft>) => void
}) {
  return (
    <div>
      <p className="tiny mt-0 mb-[14px]">
        Les fragments de cette scène. Ne décris jamais le visage ici : le verrou d'identité le
        porte.
      </p>
      <PromptField
        dataField="prompt_base"
        label="Prompt de base — décor, cadrage"
        placeholder="ex : a sunlit kitchen, morning light through the window"
        value={draft.promptBase}
        disabled={worldLinked}
        lockedNote={worldLinked ? lockedNote : undefined}
        accentColor={FRAGMENT_COLORS.base}
        onChange={(value) => onPatch({ promptBase: value })}
      />
      <PromptField
        dataField="prompt_light_recap"
        label="Prompt de lumière — même champ que l'onglet Lumière"
        value={draft.promptLight}
        disabled={worldLinked}
        lockedNote={worldLinked ? lockedNote : undefined}
        accentColor={FRAGMENT_COLORS.light}
        onChange={(value) => onPatch({ promptLight: value })}
      />
      <PromptField
        dataField="prompt_pose_recap"
        label="Prompt de pose — même champ que l'onglet Pose"
        value={draft.promptPose}
        disabled={worldLinked}
        lockedNote={worldLinked ? lockedNote : undefined}
        accentColor={FRAGMENT_COLORS.pose}
        onChange={(value) => onPatch({ promptPose: value })}
      />

      <PromptField
        dataField="wardrobe_recap"
        label="Prompt de vêtement — réglé à part"
        hint="Jamais fondu dans le prompt composé ci-dessous : la tenue est injectée séparément selon le niveau de génération (onglet Vêtements), pas ici."
        value={draft.wardrobe}
        onChange={(value) => onPatch({ wardrobe: value })}
      />

      <label className="f mt-[14px]">
        <span>
          prompt composé
          <InfoHint text="Assemble les trois fragments ci-dessus — décor, lumière, pose — séparés par une virgule, dans le même ordre que le studio utilise à la génération. Un fragment vide est ignoré ; la tenue n'y participe jamais." />
        </span>
        {/* Purely visual annotation of the textarea below, colored by
            fragment (design pass écran 7, §V4) — the relation between the 3
            tinted fields above and their place in the join becomes visible
            on sight, not just stated in a label ("même champ que l'onglet
            Lumière"). `aria-hidden` : the textarea right below already
            announces this same text once, correctly — this would only
            double it. */}
        <ComposedPromptPreview draft={draft} />
        <textarea className="min-h-[70px] resize-y" readOnly value={composePrompt(draft)} />
      </label>
    </div>
  )
}

/* See the `aria-hidden` note above: decorative twin of the composed prompt,
   fragment-colored, sitting just above the real (accessible, copyable)
   readonly textarea rather than replacing it. */
function ComposedPromptPreview({ draft }: { draft: SceneDraft }) {
  const fragments = [
    { text: draft.promptBase.trim(), color: FRAGMENT_COLORS.base },
    { text: draft.promptLight.trim(), color: FRAGMENT_COLORS.light },
    { text: draft.promptPose.trim(), color: FRAGMENT_COLORS.pose },
  ].filter((fragment) => fragment.text)

  return (
    <p
      aria-hidden="true"
      className="m-0 mb-[6px] rounded-[8px] border border-line2 bg-panel2 px-[10px] py-[8px]
                 text-[12.5px] leading-relaxed"
    >
      {fragments.length === 0 ? (
        <span className="text-dim">— vide —</span>
      ) : (
        fragments.map((fragment, index) => (
          <span key={index}>
            <span
              className="rounded-[3px] px-[2px] py-px"
              style={{ color: fragment.color, backgroundColor: `color-mix(in srgb, ${fragment.color} 18%, transparent)` }}
            >
              {fragment.text}
            </span>
            {index < fragments.length - 1 && <span className="text-dim">, </span>}
          </span>
        ))
      )}
    </p>
  )
}

/* ------------------------------------------------------ Amélioration IA */
function AiPanel({ draft }: { draft: SceneDraft }) {
  const composed = composePrompt(draft)
  return (
    <div>
      <label className="f">
        <span>
          prompt global
          <InfoHint text="Aperçu en lecture seule du prompt composé — pour le modifier, retourner à l'onglet Prompt global." />
        </span>
        <textarea className="min-h-[70px] resize-y" readOnly value={composed} />
      </label>

      <button
        type="button"
        className="btn mt-[14px]"
        disabled
        data-hint-text="Pas encore branché à un modèle — arrivera une fois l'interface validée."
      >
        Générer par IA
      </button>

      <label className="f mt-[14px]">
        <span>prompt IA</span>
        <textarea
          className="min-h-[110px] resize-y"
          readOnly
          disabled
          placeholder="s'affichera ici une fois l'amélioration par IA branchée"
          value=""
        />
      </label>

      <button type="button" className="btn mt-[10px]" disabled>
        Sauvegarder le prompt IA
      </button>
    </div>
  )
}

/* --------------------------------------------------------------- JSON final */
function JsonPanel({ draft, onSaveDocument }: { draft: SceneDraft; onSaveDocument: () => void }) {
  const json = JSON.stringify(draftsToScenes([draft])[0], null, 2)
  const toast = useToast()

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      toast('JSON copié')
    } catch {
      toast('copie impossible — le presse-papier a refusé')
    }
  }

  return (
    <div>
      <label className="f">
        {/* `div`, not `span`, for this row: `label.f span{display:block}`
            (chrome.css) is a descendant selector that would outrank the
            `.flex` utility on a nested `span` (same trap as the tabpanel/
            `hidden` note above in this file) and collapse the row. */}
        <div className="flex items-center justify-between">
          <span>
            JSON final
            <InfoHint text="Ce que cette scène deviendra dans scenes.json à l'enregistrement — lecture seule ici, le détail s'édite dans les autres onglets." />
          </span>
          <button
            type="button"
            className="cursor-pointer rounded-[6px] border border-line2 bg-panel2 p-[6px]
                       text-dim hover:text-txt focus-visible:outline-2 focus-visible:outline-focus
                       focus-visible:outline-offset-2"
            aria-label="Copier le JSON final"
            data-hint-text="Copie ce JSON dans le presse-papier — utile en support/debug sans quitter l'écran."
            onClick={() => void onCopy()}
          >
            <Icon name="copy" className="h-[14px] w-[14px]" />
          </button>
        </div>
        <textarea className="min-h-[260px] resize-y font-mono text-[12px]" readOnly value={json} />
      </label>
      <button className="btn primary mt-[14px]" onClick={onSaveDocument}>
        Sauvegarder
      </button>
    </div>
  )
}

/* --------------------------------------------------------- catalogue vide
   Shared shell for the two catalogs the wireframe asks for (light templates,
   clothing thumbnails) that have no real data behind them yet — see the
   architecture Q&A this composer was built from. An empty state SAYS there is
   nothing yet rather than hiding the section, same rule `ToolRail` follows for
   an inert tool: the capability is named, not invented. */
function EmptyCatalog({ label, hint, empty }: { label: string; hint: string; empty: string }) {
  return (
    <div className="mt-[14px]">
      <span className="text-[12px] text-dim">
        {label}
        <InfoHint text={hint} />
      </span>
      <div className="empty mt-[6px] p-[16px] text-[12px]">{empty}</div>
    </div>
  )
}
