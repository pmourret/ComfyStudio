/* The body of one wizard step — and only the body: the stepper, the gating and
   the writes stay in the screen.

   FOUR STEPS, ONE COMPONENT, on purpose. They share a layout and a way of
   saying « this choice is frozen at creation » (CLAUDE.md §8.8). Four files
   would copy that framing four times, and the day it changes three copies get
   forgotten.

   It renders and it calls back: every `on*` prop is the screen's decision. */
import type React from 'react'

import { OptionCard } from './OptionCard'
import {
  BASE_GRID, CAND, CANDS, CAND_CHOSEN, CAND_ERR, CAND_IDLE, COL_TITLE, FROZEN_HINT,
  FROZEN_IMG, NOTE_OK, SPIN, candidateUrl,
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

  if (step === 'type') {
    return (
      <div className="intents">
        {types.map((entry) => (
          <OptionCard
            key={entry.id}
            active={props.type === entry.id}
            title={entry.label}
            sub={`machine : ${entry.family}`}
            onClick={() => props.onPickType(entry.id)}
          />
        ))}
      </div>
    )
  }

  if (!currentType) return null

  if (step === 'style') {
    const styles = currentType.styles ?? []
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
      <div className="intents">
        {styles.map((entry) => (
          <OptionCard
            key={entry}
            active={props.style === entry}
            title={entry}
            hint={FROZEN_HINT}
            onClick={() => props.onPickStyle(entry)}
          />
        ))}
      </div>
    )
  }

  if (step === 'world') {
    const worlds = currentType.worlds ?? []
    if (!worlds.length) {
      return <p className={NOTE_OK} data-note>Aucun monde déclaré pour ce type.</p>
    }
    return (
      <div className="intents">
        {worlds.map((entry) => (
          <OptionCard
            key={entry.id}
            active={props.world === entry.id}
            title={entry.label}
            sub={entry.tone ?? undefined}
            hint={FROZEN_HINT}
            onClick={() => props.onPickWorld(entry.id)}
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
          <div className={CANDS} id="wizCands">
            {(props.candidates ?? []).map((candidate, index) =>
              candidate.state === 'ready' ? (
                <button
                  key={candidate.file}
                  className={`${CAND} ${
                    props.basePreview === candidateUrl(candidate.file) ? CAND_CHOSEN : CAND_IDLE
                  }`}
                  type="button"
                  data-file={candidate.file}
                  data-chosen={props.basePreview === candidateUrl(candidate.file) ? '1' : undefined}
                  onClick={() => props.onFreeze(candidate.file)}
                >
                  <img
                    className="block h-full w-full object-cover"
                    alt="portrait candidat"
                    src={candidateUrl(candidate.file)}
                  />
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
