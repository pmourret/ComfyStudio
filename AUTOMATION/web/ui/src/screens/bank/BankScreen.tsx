/* The scene bank — TWO sub-views, two routes.

   `#scenes` and `#scenes/poses` were one screen with two wrappers shown or
   hidden. They are `/bank/scenes` and `/bank/poses` now. The reason for the
   split has not changed: the bank held everything in one column, and the
   skeleton block sat between the composer and the scene cards, in the middle of
   a page one scrolls to edit scenes. Two different workshops, not two sections.

   THE SAVE BAR IS ON BOTH VIEWS, and that is deliberate: it saves the screen's
   DOCUMENT, and a scene edit left pending on the other view must keep its button
   — hiding it would hide the action while the dirty banner keeps warning. */
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useToast } from '../../chrome/ToastContext'
import { useScenes } from '../../state/ScenesStoreContext'
import { useTaxonomy } from '../../state/TaxonomyContext'
import { PATHS } from '../../app/routes'
import { Composer } from './Composer'
import { PosesView } from './PosesView'
import { SceneCard } from './SceneCard'
import './bank.css'

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
  const toast = useToast()
  const {
    bank,
    drafts,
    anchor,
    direction,
    poses,
    rawJson,
    setAnchor,
    setDirection,
    patchDraft,
    addScene,
    removeScene,
    applyRawJson,
    save,
  } = useScenes()
  const { creative } = useTaxonomy()
  const [status, setStatus] = useState<string | null>(null)
  const [rawDraft, setRawDraft] = useState<string | null>(null)

  const [title, subtitle] = SAVE_BAR[view]
  const previews = (bank?.previews ?? {}) as Record<string, unknown>

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
      <div className="wrap">
        {/* The two sub-views are two DESTINATIONS, so two links: shareable, and
            the browser's back button walks between them. */}
        <div className="seg bankview" id="bankView" role="tablist" aria-label="Sous-vue de la banque">
          <SubViewLink to={PATHS.bankScenes} label="Scènes" active={view === 'scenes'} vue="scenes" />
          <SubViewLink to={PATHS.bankPoses} label="Poses" active={view === 'poses'} vue="poses" />
        </div>

        {view === 'scenes' ? (
          <div id="bankScenes">
            <Composer />

            <h2>Note de direction — ajoutée à la fin de tous les prompts</h2>
            <input
              id="direction"
              placeholder="ex : autumn palette, softer light — laisser vide si aucune"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            />
            <p className="tiny" style={{ margin: '6px 0 22px' }}>
              Sert à donner une intention de série sans réécrire chaque scène. Se
              vide aussi vite qu'elle se met.
            </p>

            <h2>Ancre d'identité — ajoutée à toutes les scènes</h2>
            <textarea
              id="anchor"
              style={{ minHeight: 64 }}
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
            />
            <p className="tiny" style={{ margin: '6px 0 22px' }}>
              Ne décris jamais le visage dans une scène : le verrou d'identité le
              porte. Ici on ne met que ce qu'il ne transporte pas (cheveux, yeux,
              taches de rousseur).
            </p>

            <h2>
              Scènes <span className="tiny" id="nScenes">{drafts.length} scènes</span>
            </h2>
            <div id="sceneCards">
              {drafts.map((draft, index) => (
                <SceneCard
                  key={index}
                  draft={draft}
                  index={index}
                  creative={creative}
                  poses={poses}
                  produced={Boolean(previews[draft.base.id])}
                  onPatch={(patch) => patchDraft(index, patch)}
                  onRemove={() => removeScene(index)}
                />
              ))}
            </div>
            <button className="btn" id="btnAddScene" onClick={() => addScene()}>
              + Ajouter une scène
            </button>

            <details className="adv" style={{ marginTop: 24 }}>
              <summary>JSON brut</summary>
              <textarea
                id="rawJson"
                spellCheck={false}
                style={{ marginTop: 12, minHeight: 320 }}
                value={rawDraft ?? rawJson}
                onChange={(e) => setRawDraft(e.target.value)}
              />
              <button
                className="btn sm"
                id="btnRawApply"
                style={{ marginTop: 10 }}
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
          <div className="spacer" style={{ flex: 1 }} />
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
      className={active ? 'on' : undefined}
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
