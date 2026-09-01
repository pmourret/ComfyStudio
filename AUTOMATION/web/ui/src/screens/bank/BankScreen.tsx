/* The scene bank — TWO sub-views, two routes.

   `#scenes` and `#scenes/poses` were one screen with two wrappers shown or
   hidden. They are `/bank/scenes` and `/bank/poses` now. The reason for the
   split has not changed: the bank held everything in one column, and the
   skeleton block sat between the composer and the scene cards, in the middle of
   a page one scrolls to edit scenes. Two different workshops, not two sections.

   SCENES IS A WORKBENCH: A GRID AND AN INSPECTOR (31/08/2026). It was twenty
   stacked forms — five thousand pixels before one knew what the character owns.
   The grid holds what identifies a scene, the inspector holds the rest, and the
   two-column geometry is the one Produire already uses: same studio, same
   shape.

   THE CONSOLIDATION PASS (31/08/2026, wireframe-driven). The world banner and
   the "Scènes N" heading merge into one band at the top (`WorldBanner`, now
   also carrying the count); the grid stops wrapping and becomes a fixed
   2-row, horizontally-scrolling carousel (see `useSceneWorkbench.onGridKeyDown`
   for the column-major keyboard math this needed); the LLM composer and the
   raw-JSON panel are RETIRED FROM THIS SCREEN, not deleted — `Composer.tsx`
   and `ScenesStoreContext`'s `rawJson`/`applyRawJson` are untouched, waiting
   to resurface elsewhere later. The tool rail is off here too
   (`chrome/ToolRail.tsx`, `RAIL_ON`): the screen's own toolbar now covers what
   it offered.

   THE SAVE BAR IS ON BOTH VIEWS, and that is deliberate: it saves the screen's
   DOCUMENT, and a scene edit left pending on the other view must keep its button
   — hiding it would hide the action while the dirty banner keeps warning. */
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useApi } from '../../api/useApi'
import { Icon } from '../../chrome/Icon'
import { useToast } from '../../chrome/ToastContext'
import { useScenes } from '../../state/ScenesStoreContext'
import { useTaxonomy } from '../../state/TaxonomyContext'
import { PATHS } from '../../app/routes'
import { PlaceInspector } from '../worlds/PlaceInspector'
import { useWorldPlaces } from '../worlds/useWorldPlaces'
import { PosesView } from './PosesView'
import { SceneGridCard, type ScenePreview } from './SceneGrid'
import { DocumentPane, SceneInspector } from './SceneInspector'
import { useSceneWorkbench } from './useSceneWorkbench'
import { WorldBanner } from './WorldBanner'

/* What the save bar SAYS it saves, per sub-view. Same button, same handler, same
   file: only the label changes.

   On Poses, plain « scenes.json » suggested the skeletons were being saved. They
   are already on disk by the time the grid shows them (INPUTS/POSE/, written by
   the extraction); what this view puts into scenes.json is the ATTRIBUTIONS
   carried by the scenes. The disk target never lied — the context was missing.

   A two-entry table, not a growing `if`: the day the bank gains a third
   sub-view, it adds a line. */
const SAVE_BAR = {
  scenes: ['scenes.json', 'une sauvegarde .bak est faite à chaque enregistrement'],
  poses: [
    'Scènes + attributions de pose',
    'Enregistre scenes.json — pas les squelettes (déjà sur le disque). Une .bak à chaque fois.',
  ],
} as const

export function BankScreen({ view }: { view: 'scenes' | 'poses' }) {
  const api = useApi()
  const toast = useToast()
  const {
    bank,
    drafts,
    anchor,
    direction,
    poses,
    world,
    documentWorld,
    setAnchor,
    setDirection,
    patchDraft,
    save,
    load,
  } = useScenes()
  const { creative } = useTaxonomy()
  const bench = useSceneWorkbench()
  const [status, setStatus] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  // Monde | Personnage (ADR-0015) — the catalog of the CHARACTER's world,
  // loaded once and shared by every scene the Banque opens.
  const worldPlaces = useWorldPlaces(world?.id ?? null)
  const [placeStatus, setPlaceStatus] = useState<string | null>(null)
  const [placeSaving, setPlaceSaving] = useState(false)
  const worldLinked = bench.selected?.base.origin === 'world'
  const selectedPlace =
    worldLinked && bench.selected
      ? (worldPlaces.places?.find((p) => p.id === bench.selected!.base.world_ref) ?? null)
      : null

  const onSavePlace = async (patch: { id: string; label: string; intention: string; prompt: string }) => {
    if (!selectedPlace || !worldPlaces.places) return
    setPlaceSaving(true)
    // `idEditable` is not set below, so `patch.id` always equals `selectedPlace.id` here.
    const next = worldPlaces.places.map((p) => (p.id === selectedPlace.id ? { ...p, ...patch } : p))
    const result = await worldPlaces.save(next)
    setPlaceSaving(false)
    setPlaceStatus(result.ok ? 'lieu enregistré · hérité par tous les personnages du monde' : (result.erreur ?? 'échec'))
    if (result.ok) {
      toast('catalogue du monde enregistré')
      await load() // le prompt affiché côté Personnage doit suivre tout de suite
    }
  }

  const [title, subtitle] = SAVE_BAR[view]
  const previews = (bank?.previews ?? {}) as Record<string, ScenePreview>
  const stats = (bank?.stats ?? {}) as Record<string, { n: number; avg: number | null }>

  const onSave = async () => {
    const result = await save()
    /* `#scMsg` doubles as the status line, and that is wanted: the status is
       transient, the sub-view text is the resting state, and only a change of
       view puts it back. */
    setStatus(result.ok ? 'enregistré · sauvegarde .bak faite' : (result.erreur ?? 'échec'))
    if (result.ok) toast('scenes.json enregistré')
  }

  return (
    <div className="screen" id="scenes">
      {/* `pb-[130px]`: room for the fixed launch bar below — needed now that
          « Réglages de la banque » moved under the carousel (31/08/2026); it
          used to sit above the grid, where the bar never reached it. Same
          clearance value as `WizardScreen`'s `.wrap`, same reason. */}
      <div className="wrap w-full max-w-none pb-[130px]">
        {/* The two sub-views are two DESTINATIONS, so two links: shareable, and
            the browser's back button walks between them.

            A NAV, NOT A TABLIST. It looked like a segmented control so it wore
            `role="tablist"`, and the roles lied twice: there is no `tabpanel`
            for a tab to control, and these links NAVIGATE — a screen reader
            announced « onglet 1 sur 2 » for something that changes the URL and
            unmounts the screen. Two links in a nav say exactly what they do,
            and `aria-current="page"` marks the one we are on. */}
        <nav className="seg mb-[22px]" id="bankView" aria-label="Sous-vue de la banque">
          <SubViewLink to={PATHS.bankScenes} label="Scènes" active={view === 'scenes'} vue="scenes" />
          <SubViewLink to={PATHS.bankPoses} label="Poses" active={view === 'poses'} vue="poses" />
        </nav>

        {view === 'scenes' ? (
          <div id="bankScenes">
            <WorldBanner world={world} documentWorld={documentWorld} sceneCount={drafts.length} />

            {/* Two zones: the bank on the left, the sticky compositeur on the
                right. Under 1100 px the right column goes UNDER, never as an
                overlay — it is a panel one edits in, not a notification.
                It STAYS in this side column at every width above that
                (31/08/2026 correction: an earlier pass made it drop full-width
                below the grid instead, which was the wrong axis — the ask was
                HEIGHT, not width; see the `<aside>` below). */}
            <div
              className="grid gap-[22px] [align-items:start]
                         grid-cols-[minmax(0,1fr)_clamp(380px,32vw,600px)]
                         max-[1100px]:grid-cols-[1fr]"
            >
              {/* `min-w-0`: without it this grid item sizes to its CONTENT's
                  intrinsic width — the carousel's full unscrolled row of
                  cards, not the track `minmax(0,1fr)` asks for. That grid
                  blowout pushed the toolbar's "+ Ajouter une scène" button
                  (flex-1-pushed to the row's end) out past the left zone,
                  under the compositeur — same class of bug the `min-height:0`
                  / `min-width:0` note in `chrome/Shell.tsx` already names. */}
              <div className="min-w-0">
                <div className="mb-[12px] flex flex-wrap items-center gap-[10px]">
                  {/* A real <label>, not a placeholder posing as one: the
                      placeholder disappears at the first keystroke. It is
                      removed VISUALLY (`sr-only` clips it) because the field
                      sits in a toolbar, and it stays the control's accessible
                      name. */}
                  <label className="sr-only" htmlFor="sceneFilter">
                    filtrer les scènes
                  </label>
                  <input
                    id="sceneFilter"
                    ref={searchRef}
                    className="w-[220px]"
                    type="search"
                    placeholder="Rechercher — nom, prompt"
                    value={bench.filter}
                    onChange={(e) => bench.setFilter(e.target.value)}
                  />
                  {/* The filter is already live — clicking this does not
                      trigger a search that keystrokes did not already run.
                      It gives the search field a real, honest affordance
                      instead of a decorative icon: it puts the cursor back
                      in it, which is what one wants right after this click. */}
                  <button
                    type="button"
                    className="btn sm"
                    aria-label="Rechercher"
                    onClick={() => searchRef.current?.focus()}
                  >
                    <Icon name="search" className="h-[15px] w-[15px]" />
                  </button>
                  <span className="tiny" id="nScenes">
                    {bench.filter
                      ? `${bench.shown.length} sur ${drafts.length}`
                      : `${drafts.length} scènes`}
                  </span>
                  <div className="flex-1" />
                  <button className="btn primary sm" id="btnAddScene" onClick={bench.add}>
                    + Ajouter une scène
                  </button>
                </div>

                {drafts.length === 0 ? (
                  <div className="empty rounded-card border border-line bg-panel px-[16px] py-[28px] text-[13px]">
                    <b className="block mb-[4px]">Banque vide</b>
                    Ajoute une première scène avec « + Ajouter une scène » ci-dessus.
                  </div>
                ) : bench.shown.length === 0 ? (
                  <div className="empty rounded-card border border-line bg-panel px-[16px] py-[28px] text-[13px]">
                    aucune scène ne porte « {bench.filter} » — le filtre ne cache rien du document,
                    il ne montre que ce qui répond.
                  </div>
                ) : (
                  <div
                    ref={bench.gridRef}
                    id="sceneCards"
                    /* Arrows move the focus from card to card, Home and End to
                       the two ends. An accelerator laid over the tab order, not
                       a replacement for it — see useSceneWorkbench for the
                       column-major math the carousel shape now needs. */
                    onKeyDown={bench.onGridKeyDown}
                    className="grid gap-[14px] [grid-auto-flow:column] [grid-template-rows:repeat(2,auto)]
                               [grid-auto-columns:178px] overflow-x-auto overflow-y-hidden pb-[10px]
                               snap-x snap-mandatory"
                  >
                    {bench.shown.map(({ draft }) => (
                      <SceneGridCard
                        key={draft.uid}
                        draft={draft}
                        preview={previews[draft.base.id]}
                        stats={stats[draft.base.id]}
                        selected={bench.selected?.uid === draft.uid}
                        imageUrl={api.image}
                        onOpen={() => bench.select(draft.uid)}
                      />
                    ))}
                  </div>
                )}

                <div className="mt-[14px]">
                  <button
                    className="btn sm"
                    id="btnBankDocument"
                    aria-pressed={!bench.selected}
                    onClick={() => bench.select(null)}
                  >
                    Réglages de la banque
                  </button>
                </div>
              </div>

              <aside
                /* CAP, not a forced size (reverted 31/08/2026 — a forced
                   `h-[calc(100vh-150px)]` was tried to make a short tab visually
                   fill the column, but "150px" is a GUESS at how much chrome
                   sits above this aside — it was tuned against a 950px test
                   viewport, and on a real, taller window it undershoots, so the
                   forced box (and the Suivant/Précédent bar pinned to its
                   bottom, since the audit's m2 fix) can extend past the actual
                   visible viewport with no obvious cue that the primary
                   navigation button is now off-screen. Reported live: it
                   disappeared entirely. A `max-h` cap can only ever make the
                   box SHORTER than its content demands (falling back to its own
                   `overflow-auto` scrollbar, always reachable from where it
                   already is) — it can never push a critical control past the
                   fold the way a wrong forced height can. Same value Produire's
                   own Inspector already uses this way. */
                className="sticky top-[12px] max-h-[calc(100vh-150px)] overflow-auto
                           max-[1100px]:static max-[1100px]:max-h-none"
                id="bankInspector"
              >
                {bench.selected && worldLinked && (
                  /* A GROUP of two buttons, not a tablist: it toggles which
                     panel of the SAME inspector shows, no navigation and no
                     `tabpanel` on either side — see SceneGrid/Scenes-Poses
                     for why this studio reserves `tablist` for links that
                     actually navigate. */
                  <div
                    role="group"
                    aria-label="Cadre du lieu ou réglages du personnage"
                    className="seg mb-[10px]"
                  >
                    <button
                      type="button"
                      className={`px-[13px] py-[6px] text-[12.5px]${bench.inspectorMode === 'character' ? ' on bg-acc font-semibold text-on-acc' : ' bg-transparent text-dim'}`}
                      aria-pressed={bench.inspectorMode === 'character'}
                      onClick={() => bench.setInspectorMode('character')}
                    >
                      Personnage
                    </button>
                    <button
                      type="button"
                      className={`px-[13px] py-[6px] text-[12.5px]${bench.inspectorMode === 'world' ? ' on bg-acc font-semibold text-on-acc' : ' bg-transparent text-dim'}`}
                      aria-pressed={bench.inspectorMode === 'world'}
                      onClick={() => bench.setInspectorMode('world')}
                    >
                      Monde
                    </button>
                  </div>
                )}

                {bench.selected && worldLinked && bench.inspectorMode === 'world' ? (
                  selectedPlace ? (
                    <PlaceInspector
                      place={selectedPlace}
                      worldLabel={world?.label ?? bench.selected.base.world ?? ''}
                      saving={placeSaving}
                      status={placeStatus}
                      onSave={onSavePlace}
                      onClose={bench.close}
                    />
                  ) : (
                    <div className="empty rounded-card border border-line bg-panel px-[16px] py-[28px] text-[13px]">
                      {worldPlaces.error ?? 'lieu introuvable dans le catalogue du monde'}
                    </div>
                  )
                ) : bench.selected ? (
                  <SceneInspector
                    draft={bench.selected}
                    creative={creative}
                    poses={poses}
                    produced={stats[bench.selected.base.id]?.n ?? null}
                    preview={previews[bench.selected.base.id]}
                    imageUrl={api.image}
                    onPatch={(patch) => patchDraft(bench.selectedIndex, patch)}
                    onRemove={() => void bench.remove(bench.selectedIndex)}
                    onClose={bench.close}
                    onSaveDocument={onSave}
                  />
                ) : (
                  <DocumentPane
                    anchor={anchor}
                    direction={direction}
                    count={drafts.length}
                    onAnchor={setAnchor}
                    onDirection={setDirection}
                  />
                )}
              </aside>
            </div>
          </div>
        ) : (
          <PosesView />
        )}
      </div>

      <div className="launch">
        <div className="inner">
          <div className="sum">
            <b id="scTitre">{title}</b>
            <div id="scMsg">{status ?? subtitle}</div>
          </div>
          <div className="flex-1" />
          <button className="btn primary" id="btnSaveScenes" onClick={onSave}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

function SubViewLink({
  to,
  label,
  active,
  vue,
}: {
  to: string
  label: string
  active: boolean
  vue: string
}) {
  return (
    <Link
      to={to}
      /* `on` is kept as the marker of the current sub-view — it is what the
         segmented control means, and what a reader looks for — but nothing
         hangs off it any more: the two states are written here. */
      className={
        'inline-flex cursor-pointer items-center border-none px-[15px] py-[8px]' +
        ' text-[13.5px] no-underline focus-visible:outline-2' +
        ' focus-visible:outline-focus focus-visible:-outline-offset-2' +
        (active ? ' on bg-acc font-semibold text-on-acc' : ' bg-transparent text-dim')
      }
      data-vue={vue}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  )
}

/* Route wrappers: the ROUTER names the sub-view, the screen does not read it
   back out of the path. */
export function BankScenesScreen() {
  return <BankScreen view="scenes" />
}
export function BankPosesScreen() {
  return <BankScreen view="poses" />
}
