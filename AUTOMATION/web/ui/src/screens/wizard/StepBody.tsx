/* The body of one wizard step — and only the body: the stepper, the gating and
   the writes stay in the screen.

   FOUR STEPS, ONE COMPONENT, on purpose. They share a layout and a way of
   saying « this choice is frozen at creation » (CLAUDE.md §8.8). Four files
   would copy that framing four times, and the day it changes three copies get
   forgotten.

   All four `useRovingChoice` calls happen unconditionally at the top, even
   though only one group is ever shown at a time — the Rules of Hooks forbid
   calling a hook from inside a branch that might not run, so an empty id list
   (the groups that do not apply to the current step) is the deliberate,
   cheap way to keep every call unconditional.

   It renders and it calls back: every `on*` prop is the screen's decision. */
import type React from 'react'

import { Icon } from '../../chrome/Icon'
import { OptionCard } from './OptionCard'
import { useRovingChoice } from './useRovingChoice'
import {
  BASE_GRID, CAND, CANDS, CAND_CHOSEN, CAND_ERR, CAND_IDLE, COL_TITLE, FROZEN_HINT,
  FROZEN_IMG, NOTE_ERR, NOTE_OK, SKELETON_CARD, SPIN, candidateUrl,
  type CandidateState, type CharacterType, type Step,
} from './shared'

export function StepBody(props: {
  step: Step
  types: CharacterType[]
  currentType: CharacterType | null
  type: string | null
  style: string | null
  world: string | null
  cidValid: boolean
  frozenBase: string | null
  basePreview: string
  fileMessage: string
  genMessage: string
  candidates: CandidateState[] | null
  onPickType: (id: string) => void
  onPickStyle: (value: string) => void
  onPickWorld: (value: string) => void
  onFilePicked: (event: React.ChangeEvent<HTMLInputElement>) => void
  onGenerate: () => void
  onFreeze: (file: string) => void
}) {
  const { step, types, currentType } = props

  const typeIds = types.map((entry) => entry.id)
  const typeRoving = useRovingChoice(typeIds, props.type)

  const styles = currentType?.styles ?? []
  const styleRoving = useRovingChoice(styles, props.style)

  const worlds = (currentType?.worlds ?? []).map((entry) => entry.id)
  const worldRoving = useRovingChoice(worlds, props.world)

  const readyCandidates = (props.candidates ?? []).filter((c) => c.state === 'ready')
  const chosenCandidate =
    readyCandidates.find((c) => candidateUrl(c.file) === props.basePreview)?.file ?? null
  const candidateRoving = useRovingChoice(
    readyCandidates.map((c) => c.file),
    chosenCandidate,
  )

  if (step === 'type') {
    if (!types.length) {
      return (
        <p className={NOTE_ERR} data-note>
          Aucun type de personnage n'est déclaré. Vérifie{' '}
          <code>PACKS/resolution.json</code> et les <code>universe.json</code> des
          packs.
        </p>
      )
    }
    return (
      <div className="intents" role="radiogroup" aria-label="Type de personnage">
        {types.map((entry) => (
          <OptionCard
            key={entry.id}
            active={props.type === entry.id}
            title={entry.label}
            sub={`machine : ${entry.family}`}
            tabIndex={typeRoving.tabIndexFor(entry.id)}
            elementRef={typeRoving.registerRef(entry.id)}
            onClick={() => props.onPickType(entry.id)}
            onKeyDown={(event) => typeRoving.onKeyDown(event, entry.id, props.onPickType)}
          />
        ))}
      </div>
    )
  }

  if (!currentType) return null

  if (step === 'style') {
    /* A single style is not a choice: we say so instead of showing one card that
       can only be clicked one way. */
    if (styles.length === 1) {
      return (
        <p className={NOTE_OK} data-note>
          Ce type ne produit qu'un style : <b>{styles[0]}</b>. Il est fixé à la
          création — en changer reviendrait à créer un autre personnage.
        </p>
      )
    }
    return (
      <div className="intents" role="radiogroup" aria-label="Style de sortie">
        {styles.map((entry) => (
          <OptionCard
            key={entry}
            active={props.style === entry}
            title={entry}
            hint={FROZEN_HINT}
            tabIndex={styleRoving.tabIndexFor(entry)}
            elementRef={styleRoving.registerRef(entry)}
            onClick={() => props.onPickStyle(entry)}
            onKeyDown={(event) => styleRoving.onKeyDown(event, entry, props.onPickStyle)}
          />
        ))}
      </div>
    )
  }

  if (step === 'world') {
    const worldEntries = currentType.worlds ?? []
    if (!worldEntries.length) {
      return <p className={NOTE_OK} data-note>Aucun monde déclaré pour ce type.</p>
    }
    return (
      <div className="intents" role="radiogroup" aria-label="Monde">
        {worldEntries.map((entry) => (
          <OptionCard
            key={entry.id}
            active={props.world === entry.id}
            title={entry.label}
            sub={entry.tone ?? undefined}
            hint={FROZEN_HINT}
            tabIndex={worldRoving.tabIndexFor(entry.id)}
            elementRef={worldRoving.registerRef(entry.id)}
            onClick={() => props.onPickWorld(entry.id)}
            onKeyDown={(event) => worldRoving.onKeyDown(event, entry.id, props.onPickWorld)}
          />
        ))}
      </div>
    )
  }

  /* The frozen base is written under the id: without a valid one there is
     nothing to name the file after, so the step says that rather than failing
     on upload. */
  if (!props.cidValid) {
    return (
      <p className={NOTE_OK} data-note>
        Renseigne d'abord un <b>identifiant</b> valide en haut : la base d'identité
        est enregistrée sous ce nom.
      </p>
    )
  }

  return (
    <>
      <p className={NOTE_OK} data-note>
        Le visage de référence, figé à la création : le verrou d'identité s'y
        accroche pour toute la production.{' '}
        <b>Personnage fictif — jamais la photo d'une personne réelle.</b>
      </p>
      <div className={BASE_GRID}>
        <div>
          <h3 className={COL_TITLE}>Fournir une image</h3>
          <label className="btn sm" htmlFor="wizFile">
            Choisir un fichier…
          </label>
          <input
            type="file"
            id="wizFile"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={props.onFilePicked}
          />
          <p className="tiny" id="wizFileMsg">
            {props.fileMessage}
          </p>
        </div>
        <div>
          <h3 className={COL_TITLE}>Générer un portrait</h3>
          <button className="btn sm" id="wizGen" onClick={props.onGenerate}>
            Générer 4 portraits
          </button>
          <p className="tiny" id="wizGenMsg">
            {props.genMessage}
          </p>
          <div
            className={CANDS}
            id="wizCands"
            role="radiogroup"
            aria-label="Portraits générés"
          >
            {(props.candidates ?? []).map((candidate, index) =>
              candidate.state === 'ready' ? (
                <button
                  key={candidate.file}
                  className={`${CAND} ${
                    props.basePreview === candidateUrl(candidate.file) ? CAND_CHOSEN : CAND_IDLE
                  }`}
                  type="button"
                  role="radio"
                  aria-checked={props.basePreview === candidateUrl(candidate.file)}
                  tabIndex={candidateRoving.tabIndexFor(candidate.file)}
                  ref={candidateRoving.registerRef(candidate.file)}
                  data-file={candidate.file}
                  data-chosen={props.basePreview === candidateUrl(candidate.file) ? '1' : undefined}
                  onClick={() => props.onFreeze(candidate.file)}
                  onKeyDown={(event) =>
                    candidateRoving.onKeyDown(event, candidate.file, props.onFreeze)
                  }
                >
                  <img
                    className="block h-full w-full object-cover"
                    alt="portrait candidat"
                    src={candidateUrl(candidate.file)}
                  />
                  {props.basePreview === candidateUrl(candidate.file) && (
                    <Icon name="check" className="absolute top-[4px] right-[4px] h-[13px] w-[13px] text-acc" />
                  )}
                </button>
              ) : candidate.state === 'error' ? (
                <div
                  key={candidate.file || index}
                  className={`${CAND} ${CAND_ERR}`}
                  data-cand="error"
                  title={candidate.detail || ''}
                >
                  échec
                </div>
              ) : (
                <div key={candidate.file || index} className={`${CAND} ${CAND_IDLE}`} data-cand="pending">
                  <span className={SPIN} />
                </div>
              ),
            )}
          </div>
        </div>
      </div>
      <div className="mt-[18px]" id="wizBasePreview">
        {props.frozenBase && (
          <div className="flex items-center gap-[14px]">
            <img className={FROZEN_IMG} alt="base d'identité" src={props.basePreview} />
            <span className="text-[12.5px] text-dim">
              base gelée : <code>{props.frozenBase}</code>
            </span>
          </div>
        )}
      </div>
    </>
  )
}

/** Loading placeholder for the type step, before `/api/wizard/options` answers:
    the shape of three `.it` cards, not a sentence — used by `WizardScreen`. */
export function StepBodySkeleton() {
  return (
    <div className="intents" aria-hidden="true">
      <div className={SKELETON_CARD} />
      <div className={SKELETON_CARD} />
      <div className={SKELETON_CARD} />
    </div>
  )
}
