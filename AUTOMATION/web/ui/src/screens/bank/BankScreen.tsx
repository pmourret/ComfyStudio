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
   — hiding it would hide the action while the dirty banner keeps warning.

   THE SAVE BAR MOVED OFF THE FIXED FOOTER (2026-09-01, studio-IA polish). A
   `position:fixed` bar at the bottom of the viewport cost every screen a
   reserved strip of dead space (`.wrap`'s own 120px bottom padding) whether or
   not anything needed it, and pushed the "Réglages de la banque" toggle down
   below the scene list, a second landmark to scroll past. Both now sit beside
   the Scènes/Poses switch, at the top, where the switch already is — no
   `position:fixed`, no reserved clearance, one less thing to scroll for. The
   `.launch`/`.inner`/`.sum` classes stay defined in the shared stylesheet and
   in use by `ProduceScreen`/`WizardScreen` — only this screen stops reaching
   for them. */
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
import { PosesView } from './poses/PosesView'
import { SceneListPanel, type ScenePreview } from './SceneList'
import { TonesView } from './tones/TonesView'
import { DocumentPane, SceneInspector } from './SceneInspector'
import { useSceneWorkbench } from './useSceneWorkbench'
import { WorldBanner } from './WorldBanner'

/* What « Enregistrer » saves, per sub-view — said in its HOVER tooltip, not as
   permanent text (2026-09-01: a title + a ".bak" reassurance sat in the chrome
   at all times, reported as noise — "n'a pas d'intérêt à être affiché ici").

   On Poses, plain « scenes.json » would suggest the skeletons are what gets
   saved. They are already on disk by the time the grid shows them
   (INPUTS/POSE/, written by the extraction); what this view puts into
   scenes.json is the ATTRIBUTIONS carried by the scenes. The disk target never
   lied — the context was missing, and it still needs saying somewhere, just
   on demand rather than permanently.

   A two-entry table, not a growing `if`: the day the bank gains a third
   sub-view, it adds a line — Tons is that third line (2026-09-03): its own
   document is creative.json, saved from ITS OWN editor screen, never from
   this button — the hint says so, rather than implying a tone's expression
   range rides along with a scenes.json save it has nothing to do with. */
const SAVE_HINT = {
  scenes: 'Enregistrer scenes.json — une sauvegarde .bak est faite à chaque fois',
  poses:
    'Enregistrer les attributions de pose dans scenes.json — jamais les squelettes, déjà sur le disque',
  tones:
    'Enregistrer scenes.json — la plage d\'expression d\'un ton s\'enregistre depuis son propre éditeur, pas ici',
} as const

export function BankScreen({ view }: { view: 'scenes' | 'poses' | 'tones' }) {
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

  const previews = (bank?.previews ?? {}) as Record<string, ScenePreview>
  const stats = (bank?.stats ?? {}) as Record<string, { n: number; avg: number | null }>

  const onSave = async () => {
    const result = await save()
    setStatus(result.ok ? 'enregistré · sauvegarde .bak faite' : (result.erreur ?? 'échec'))
    if (result.ok) toast('scenes.json enregistré')
  }

  return (
    <div className="screen" id="scenes">
      {/* `pb-[24px]`: the shared `.wrap` class reserves 120px at the bottom for
          `ProduceScreen`/`WizardScreen`'s own fixed launch bar — this screen no
          longer has one, so that clearance is now dead scroll space, overridden
          back down to match the top padding. */}
      <div className="wrap w-full max-w-none pb-[24px]">
        {/* The two sub-views are two DESTINATIONS, so two links: shareable, and
            the browser's back button walks between them.

            A NAV, NOT A TABLIST. It looked like a segmented control so it wore
            `role="tablist"`, and the roles lied twice: there is no `tabpanel`
            for a tab to control, and these links NAVIGATE — a screen reader
            announced « onglet 1 sur 2 » for something that changes the URL and
            unmounts the screen. Two links in a nav say exactly what they do,
            and `aria-current="page"` marks the one we are on.

            The document actions ride along on the SAME row, at the SAME
            height: "Réglages de la banque" (scenes-only — Poses has no
            document-level settings pane) and the save button, which stays on
            BOTH sub-views per the note above. `flex-wrap` lets the right-hand
            block drop to its own line rather than overflow on a narrow
            window. */}
        <div className="mb-[22px] flex flex-wrap items-center justify-between gap-[12px]">
          <nav className="seg" id="bankView" aria-label="Sous-vue de la banque">
            <SubViewLink to={PATHS.bankScenes} label="Scènes" active={view === 'scenes'} vue="scenes" />
            <SubViewLink to={PATHS.bankPoses} label="Poses" active={view === 'poses'} vue="poses" />
            <SubViewLink to={PATHS.bankTones} label="Tons" active={view === 'tones'} vue="tones" />
          </nav>

          <div className="flex flex-wrap items-center gap-[10px]">
            {view === 'scenes' && (
              <button
                className="btn sm"
                id="btnBankDocument"
                aria-pressed={!bench.selected}
                onClick={() => bench.select(null)}
              >
                Réglages de la banque
              </button>
            )}
            <div className="flex items-center gap-[10px]">
              {/* TRANSIENT ONLY — no resting text (2026-09-01: a permanent
                  "scenes.json / une sauvegarde .bak est faite..." sat here at
                  all times, reported as not worth the permanent space). What
                  this button saves, per sub-view, moved into its OWN hover
                  tooltip below; what a save just DID (success or the refusal
                  message) still needs to be seen without hovering, so it
                  stays a visible, if transient, status line — `role="status"`
                  matches DirtyBar/FaultBar's own transient-message pattern. */}
              {status && (
                <span id="scMsg" role="status" className="tiny text-right leading-tight">
                  {status}
                </span>
              )}
              <button
                className="btn primary sm"
                id="btnSaveScenes"
                aria-label="Enregistrer"
                data-hint-text={SAVE_HINT[view]}
                onClick={onSave}
              >
                <Icon name="save" className="h-[15px] w-[15px]" />
              </button>
            </div>
          </div>
        </div>

        {view === 'scenes' ? (
          <div id="bankScenes">
            <WorldBanner world={world} documentWorld={documentWorld} sceneCount={drafts.length} />

            {/* Two zones: a NARROW scene list on the left, the composer
                DOMINANT on the right (studio-IA direction, 2026-09-01 — was
                the reverse: an unbounded grid squeezing a `clamp(…,600px)`
                composer sidebar). The list is a picker, not the work
                surface — Unreal's World Outliner, Photoshop's Layers panel,
                a narrow vertical list next to the wide area you actually
                work in. Under 1100 px both still stack into one column,
                unchanged threshold. */}
            <div
              className="grid gap-[22px] [align-items:start]
                         grid-cols-[clamp(240px,22vw,320px)_minmax(0,1fr)]
                         max-[1100px]:grid-cols-[1fr]"
            >
              {/* `min-w-0`: a general grid-child safety net (a long unbroken
                  scene id could otherwise force the track wider than the
                  clamp asks for), not tied to the carousel this replaced —
                  see `chrome/Shell.tsx`'s own `min-height:0`/`min-width:0`
                  note for the general shape of this class of bug. */}
              <div className="min-w-0 max-[1100px]:max-w-[420px]">
                <div className="mb-[10px] flex flex-col gap-[8px]">
                  <div className="flex items-center gap-[6px]">
                    {/* A real <label>, not a placeholder posing as one: the
                        placeholder disappears at the first keystroke. It is
                        removed VISUALLY (`sr-only` clips it) because the field
                        sits in a toolbar, and it stays the control's
                        accessible name. */}
                    <label className="sr-only" htmlFor="sceneFilter">
                      filtrer les scènes
                    </label>
                    <input
                      id="sceneFilter"
                      ref={searchRef}
                      className="flex-1"
                      type="search"
                      placeholder="Rechercher"
                      value={bench.filter}
                      onChange={(e) => bench.setFilter(e.target.value)}
                    />
                    {/* The filter is already live — clicking this does not
                        trigger a search that keystrokes did not already run.
                        It gives the search field a real, honest affordance
                        instead of a decorative icon: it puts the cursor back
                        in it, which is what one wants right after this
                        click. */}
                    <button
                      type="button"
                      className="btn sm"
                      aria-label="Rechercher"
                      onClick={() => searchRef.current?.focus()}
                    >
                      <Icon name="search" className="h-[15px] w-[15px]" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-[8px]">
                    <span className="tiny" id="nScenes">
                      {bench.filter
                        ? `${bench.shown.length} sur ${drafts.length}`
                        : `${drafts.length} scènes`}
                    </span>
                    <button className="btn primary sm" id="btnAddScene" onClick={bench.add}>
                      + Ajouter une scène
                    </button>
                  </div>
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
                  <SceneListPanel
                    shown={bench.shown}
                    creative={creative}
                    filterActive={Boolean(bench.filter.trim())}
                    previews={previews}
                    stats={stats}
                    selectedUid={bench.selected?.uid}
                    imageUrl={api.image}
                    onOpen={bench.select}
                    listRef={bench.listRef}
                    onKeyDown={bench.onListKeyDown}
                  />
                )}
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
                   fold the way a wrong forced height can.

                   "150px" DROPPED TO "90px" (2026-09-01): that budget was
                   guessing room for the top nav AND the fixed launch bar's own
                   height at the bottom — the bar is gone (moved into the top
                   row, see the file's opening comment), so only the top nav
                   need be guessed for now. Being a CAP, an imprecise guess
                   here only costs the aside its own internal scroll, never a
                   hidden control — see the paragraph above. */
                className="sticky top-[12px] max-h-[calc(100vh-90px)] overflow-auto
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
                    onDuplicate={() => bench.duplicate(bench.selectedIndex)}
                    onPrevScene={bench.hasPrevScene ? () => bench.stepScene(-1) : undefined}
                    onNextScene={bench.hasNextScene ? () => bench.stepScene(1) : undefined}
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
        ) : view === 'poses' ? (
          <PosesView />
        ) : (
          <TonesView />
        )}
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
export function BankTonesScreen() {
  return <BankScreen view="tones" />
}
