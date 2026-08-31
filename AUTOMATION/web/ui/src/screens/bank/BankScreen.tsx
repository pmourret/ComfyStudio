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

   WHAT IS STOWED, NOT REDESIGNED. The composer, the raw JSON and the poses are
   unchanged; they simply stopped occupying the top of a screen whose subject is
   the scenes. The composer in particular lost its primary button — the screen
   has one primary action, and it is Enregistrer.

   THE SAVE BAR IS ON BOTH VIEWS, and that is deliberate: it saves the screen's
   DOCUMENT, and a scene edit left pending on the other view must keep its button
   — hiding it would hide the action while the dirty banner keeps warning. */
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useApi } from '../../api/useApi'
import { useToast } from '../../chrome/ToastContext'
import { useScenes } from '../../state/ScenesStoreContext'
import { useTaxonomy } from '../../state/TaxonomyContext'
import { PATHS } from '../../app/routes'
import { Composer } from './Composer'
import { PosesView } from './PosesView'
import { NewSceneCard, SceneGridCard, type ScenePreview } from './SceneGrid'
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
    rawJson,
    world,
    documentWorld,
    setAnchor,
    setDirection,
    patchDraft,
    applyRawJson,
    save,
  } = useScenes()
  const { creative } = useTaxonomy()
  const bench = useSceneWorkbench()
  const [status, setStatus] = useState<string | null>(null)
  const [rawDraft, setRawDraft] = useState<string | null>(null)

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
      <div className="wrap w-full max-w-none">
        {/* The two sub-views are two DESTINATIONS, so two links: shareable, and
            the browser's back button walks between them. */}
        <div className="seg mb-[22px]" id="bankView" role="tablist" aria-label="Sous-vue de la banque">
          <SubViewLink to={PATHS.bankScenes} label="Scènes" active={view === 'scenes'} vue="scenes" />
          <SubViewLink to={PATHS.bankPoses} label="Poses" active={view === 'poses'} vue="poses" />
        </div>

        {view === 'scenes' ? (
          <div id="bankScenes">
            <WorldBanner world={world} documentWorld={documentWorld} />

            {/* Two columns: the grid on the left, the sticky inspector on the
                right. Under 1100 px the right column goes UNDER, never as an
                overlay — it is a panel one edits in, not a notification. */}
            <div
              className="grid gap-[22px] [align-items:start]
                         grid-cols-[minmax(0,1fr)_clamp(320px,26vw,460px)]
                         max-[1100px]:grid-cols-[1fr]"
            >
              <div>
                <div className="mb-[12px] flex flex-wrap items-center gap-[10px]">
                  <h2 className="m-0">
                    Scènes{' '}
                    <span className="tiny" id="nScenes">
                      {bench.filter
                        ? `${bench.shown.length} sur ${drafts.length}`
                        : `${drafts.length} scènes`}
                    </span>
                  </h2>
                  <div className="flex-1" />
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
                    className="w-[190px]"
                    type="search"
                    placeholder="filtrer — nom, prompt, tag"
                    value={bench.filter}
                    onChange={(e) => bench.setFilter(e.target.value)}
                  />
                  <button
                    className="btn sm"
                    id="btnBankDocument"
                    aria-pressed={!bench.selected}
                    onClick={() => bench.select(null)}
                  >
                    Réglages de la banque
                  </button>
                </div>

                <div
                  ref={bench.gridRef}
                  id="sceneCards"
                  className="grid gap-[14px] grid-cols-[repeat(auto-fill,minmax(178px,1fr))]"
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
                  <NewSceneCard onClick={bench.add} />
                  {!bench.shown.length && bench.filter && (
                    <div className="empty col-span-full px-[16px] py-[28px] text-[13px]">
                      aucune scène ne porte « {bench.filter} » — le filtre ne
                      cache rien du document, il ne montre que ce qui répond.
                    </div>
                  )}
                </div>

                {/* Stowed: two workshops that are not the subject of this
                    screen. Unchanged inside — they moved, they were not
                    rewritten. */}
                <details className="adv mt-[24px]!" id="bankComposer">
                  <summary>Composer des scènes avec le modèle local</summary>
                  <div className="mt-[12px]">
                    <Composer />
                  </div>
                </details>

                <details className="adv mt-[12px]!">
                  <summary>JSON brut</summary>
                  <textarea
                    id="rawJson"
                    spellCheck={false}
                    className="mt-[12px] min-h-[320px] resize-y font-code text-[12px] leading-[normal]"
                    value={rawDraft ?? rawJson}
                    onChange={(e) => setRawDraft(e.target.value)}
                  />
                  <button
                    id="btnRawApply"
                    className="btn sm mt-[10px]"
                    onClick={() => {
                      try {
                        applyRawJson(rawDraft ?? rawJson)
                        setRawDraft(null)
                        toast('JSON appliqué — pense à enregistrer')
                      } catch (error) {
                        toast('JSON invalide : ' + (error as Error).message)
                      }
                    }}
                  >
                    Appliquer le JSON
                  </button>
                </details>
              </div>

              <aside
                className="sticky top-[12px] max-h-[calc(100vh-150px)] overflow-auto
                           max-[1100px]:static max-[1100px]:max-h-none"
                id="bankInspector"
              >
                {bench.selected ? (
                  <SceneInspector
                    draft={bench.selected}
                    creative={creative}
                    poses={poses}
                    produced={stats[bench.selected.base.id]?.n ?? null}
                    onPatch={(patch) => patchDraft(bench.selectedIndex, patch)}
                    onRemove={() => void bench.remove(bench.selectedIndex)}
                    onClose={bench.close}
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
      role="tab"
      aria-selected={active}
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
