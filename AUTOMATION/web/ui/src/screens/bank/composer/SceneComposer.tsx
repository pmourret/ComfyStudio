/* The scene composer: one scene, seven tabs, wireframe-driven (31/08/2026).

   WHAT IT REPLACES. The inspector used to be one flat form — a dozen fields
   stacked in a single scroll, id to pose. This walks the same fields through
   seven small panels instead: general, lumière, vêtements, pose, un
   récapitulatif du prompt, une amélioration IA (pour l'instant un gabarit —
   voir la note du panneau), et le JSON final.

   A TABLIST, NOT A NAV. `BankScreen`'s Scènes|Poses switch is a nav because it
   NAVIGATES — two routes, the browser's back button walks between them. These
   seven panels are the opposite case: one widget, no URL change, nothing to
   bookmark. That is exactly what `role="tablist"` exists for, so unlike the
   nav above it this one earns the role for real — arrow keys move the
   selection (roving tabindex), Home/End jump the ends.

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
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Link } from 'react-router-dom'

import { Icon } from '../../../chrome/Icon'
import type { Creative } from '../../../state/TaxonomyContext'
import {
  bandOf,
  composePrompt,
  draftsToScenes,
  textToWardrobe,
  type SceneDraft,
} from '../../../state/ScenesStoreContext'
import { PATHS } from '../../../app/routes'
import { InfoHint } from './InfoHint'
import { PromptField } from './PromptField'
import { appendWardrobeLine, WARDROBE_CATALOG } from './wardrobeCatalog'

const FORMATS = ['4:5', '2:3', '9:16', '1:1']

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

/* Skeletons of INPUTS/POSE/, served by /api/scenes. A scene pointing at a
   missing skeleton (file moved, renamed) KEEPS it in the list rather than lose
   it in silence — same rule as an out-of-taxonomy intention. */
function poseOptions(poses: string[], current: string) {
  return current && !poses.includes(current) ? [...poses, current] : poses
}

export function SceneComposer({
  draft,
  creative,
  poses,
  produced,
  worldLinked,
  onPatch,
  onRemove,
  onSaveDocument,
}: {
  draft: SceneDraft
  creative: Creative | null
  poses: string[]
  produced: number | null
  /* A scene bound to a world place (ADR-0015): its frame — the prompt this
     composer builds — is re-derived server-side on every save, so the four
     fragments below are locked here regardless of what gets typed. Wardrobe
     levels and the pose skeleton are OVERLAY keys, never locked by this. */
  worldLinked: boolean
  onPatch: (patch: Partial<SceneDraft>) => void
  onRemove: () => void
  /** The document-level save — same action as the launch bar's "Enregistrer",
      offered again from the JSON panel for a "I've checked it, ship it" close. */
  onSaveDocument: () => void
}) {
  const [tab, setTab] = useState<TabKey>('general')
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const idRef = useRef<HTMLInputElement | null>(null)

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

  /* Selecting a tab focuses ITS button — the WAI-ARIA tablist convention,
     followed uniformly whether the selection came from a click, an arrow key,
     or "Suivant"/"Précédent" below a panel. Done here, at the one place every
     tab change goes through, rather than as a separate effect keyed on `tab`:
     that used to run AFTER the mount effect below and steal focus back from
     the identifier field it had just set — two effects racing over one
     outcome.

     SYNCHRONOUS, no `requestAnimationFrame`: only the active PANEL is
     conditionally rendered, never the tab STRIP — every `#scene-tab-*` button
     is already in the DOM before `setTab` runs, so there is nothing to wait
     for. Deferring the focus a frame used to lose a real race under load
     (caught by the browser fumigation intermittently failing its roving-
     tabindex check: React had applied `aria-selected` well before the queued
     frame fired, so a reader polling right after the keypress could see the
     selection change with the focus lagging a frame behind it). */
  const goto = (index: number) => {
    if (index < 0 || index >= TABS.length) return
    const key = TABS[index].key
    setTab(key)
    tabsRef.current?.querySelector<HTMLElement>(`#scene-tab-${key}`)?.focus()
  }

  /* Roving tabindex, arrow-key nav — WAI-ARIA tablist pattern. Left/Right (and
     Up/Down, since the strip reads as one row either way) move BOTH the focus
     and the selection; Home/End jump the ends. This is the studio's first
     `role="tablist"` that actually earns it: seven panels of ONE widget, no
     navigation, no URL — see the file banner for why BankScreen's own
     Scènes|Poses switch deliberately is NOT this. */
  const onTabsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    if (event.key === 'Home') {
      event.preventDefault()
      goto(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      goto(TABS.length - 1)
    } else if (event.key in steps) {
      event.preventDefault()
      goto(activeIndex + steps[event.key])
    }
  }

  const lockedNote =
    "hérité du lieu — s'édite dans l'onglet Monde, ce qui serait tapé ici ne survit pas à l'enregistrement (ADR-0015)."

  return (
    <div>
      <div
        ref={tabsRef}
        role="tablist"
        aria-label="Sections de la scène"
        onKeyDown={onTabsKeyDown}
        className="mb-[14px] flex gap-[4px] rounded-[9px] border border-line bg-panel2 p-[4px]"
      >
        {TABS.map((t, index) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`scene-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`scene-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            data-hint-text={t.label}
            className={`flex flex-1 cursor-pointer items-center justify-center rounded-[6px] border-0
                       py-[8px] focus-visible:outline-2 focus-visible:outline-focus
                       focus-visible:outline-offset-2 ${
                         tab === t.key ? 'bg-acc text-on-acc' : 'bg-transparent text-dim hover:text-txt'
                       }`}
            onClick={() => goto(index)}
          >
            <span className="sr-only">{t.label}</span>
            <Icon name={t.icon} className="h-[16px] w-[16px]" />
          </button>
        ))}
      </div>

      {TABS.map(
        (t) =>
          tab === t.key && (
            <div
              key={t.key}
              role="tabpanel"
              id={`scene-panel-${t.key}`}
              aria-labelledby={`scene-tab-${t.key}`}
              tabIndex={0}
            >
              {t.key === 'general' && (
                <GeneralPanel
                  draft={draft}
                  creative={creative}
                  produced={produced}
                  worldLinked={worldLinked}
                  idRef={idRef}
                  onPatch={onPatch}
                />
              )}
              {t.key === 'light' && (
                <LightPanel draft={draft} worldLinked={worldLinked} lockedNote={lockedNote} onPatch={onPatch} />
              )}
              {t.key === 'clothing' && <ClothingPanel draft={draft} onPatch={onPatch} />}
              {t.key === 'pose' && (
                <PosePanel
                  draft={draft}
                  poses={poses}
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

              {/* One shared bottom section, same shape on EVERY tab (wireframe
                  31/08/2026): a rule, then full-width bars — Suivant above
                  Précédent, never side by side — so the gesture is always in
                  the same place regardless of which panel is open. Only their
                  PRESENCE varies (no Précédent on the first tab, no Suivant on
                  the last); "Supprimer la scène" is a fourth bar, General
                  only, always last — a destructive act does not share a row
                  with navigation. */}
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
                  <button className="btn danger w-full" onClick={onRemove}>
                    ⚠ Supprimer la scène
                  </button>
                )}
              </div>
            </div>
          ),
      )}
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
}: {
  draft: SceneDraft
  creative: Creative | null
  produced: number | null
  worldLinked: boolean
  idRef: RefObject<HTMLInputElement | null>
  onPatch: (patch: Partial<SceneDraft>) => void
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

      <div className="mt-[10px] grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-[12px]">
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
        <label className="f">
          <span>
            niveau minimum — jusqu'à <b>{band[1]}</b>
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
      </div>

      <div className="mt-[10px] grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-[12px]">
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
          className="min-h-[52px] resize-y"
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
   three prompt fragments, it is never re-derived nor discarded at save. */
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
     too, not silently back at 0. */
  const [level, setLevel] = useState(() => Math.min(3, Math.max(0, Number.parseInt(draft.bandLo, 10) || 0)))
  const items = filter
    ? (WARDROBE_CATALOG.find((c) => c.category === filter)?.items ?? [])
    : WARDROBE_CATALOG.flatMap((c) => c.items)

  return (
    <div>
      <PromptField
        dataField="wardrobe"
        label="Prompt de vêtement"
        hint="Une tenue par ligne, préfixée de son niveau : « 0: a linen shirt and jeans ». Le niveau le plus haut déclaré ici fixe jusqu'où la scène peut monter. Jamais fondu dans le prompt final envoyé au modèle : la tenue est injectée séparément selon le niveau de génération — c'est ce que le studio veut dire par « jamais la tenue »."
        placeholder="0: a beige knit sweater and jeans"
        value={draft.wardrobe}
        onChange={(value) => onPatch({ wardrobe: value })}
      />

      <div className="mt-[16px] flex flex-wrap items-center justify-between gap-[10px]">
        <span className="text-[12px] text-dim">
          Sélecteur de vêtement
          <InfoHint text="Vocabulaire de départ en texte — des images de collection remplaceront ces cases à terme. Filtre par catégorie, sélectionne une pièce, choisis le niveau, puis « + » l'ajoute comme nouvelle ligne au prompt ci-dessus, sans toucher aux lignes déjà là." />
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
            niveau de la ligne ajoutée
          </label>
          <select
            id="wardrobeLevel"
            className="!w-auto"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          >
            {[0, 1, 2, 3].map((n) => (
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
            onClick={() => onPatch({ wardrobe: appendWardrobeLine(draft.wardrobe, selected, level) })}
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
  poses: string[]
  worldLinked: boolean
  lockedNote: string
  onPatch: (patch: Partial<SceneDraft>) => void
}) {
  const options = poseOptions(poses, draft.pose)
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
        <Link className="btn sm" to={PATHS.bankPoses}>
          Éditeur de pose
        </Link>
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
        {options.length === 0 ? (
          <div className="empty col-span-full p-[16px] text-[12px]">
            aucun squelette en banque — l'éditeur de pose en extrait depuis une photo
          </div>
        ) : (
          options.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={draft.pose === name}
              title={name}
              className={`relative aspect-square overflow-hidden rounded-[8px] border bg-black ${
                draft.pose === name ? 'border-acc' : 'border-line2'
              }`}
              onClick={() => onPatch({ pose: name })}
            >
              <img
                className="h-full w-full object-contain"
                loading="lazy"
                src={`/img/pose?name=${encodeURIComponent(name)}`}
                alt={name}
              />
            </button>
          ))
        )}
      </div>
    </div>
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
        onChange={(value) => onPatch({ promptBase: value })}
      />
      <PromptField
        dataField="prompt_light_recap"
        label="Prompt de lumière"
        value={draft.promptLight}
        disabled={worldLinked}
        lockedNote={worldLinked ? lockedNote : undefined}
        onChange={(value) => onPatch({ promptLight: value })}
      />
      <PromptField
        dataField="prompt_pose_recap"
        label="Prompt de pose"
        value={draft.promptPose}
        disabled={worldLinked}
        lockedNote={worldLinked ? lockedNote : undefined}
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
        <textarea className="min-h-[70px] resize-y" readOnly value={composePrompt(draft)} />
      </label>
    </div>
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
  return (
    <div>
      <label className="f">
        <span>
          JSON final
          <InfoHint text="Ce que cette scène deviendra dans scenes.json à l'enregistrement — lecture seule ici, le détail s'édite dans les autres onglets." />
        </span>
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
