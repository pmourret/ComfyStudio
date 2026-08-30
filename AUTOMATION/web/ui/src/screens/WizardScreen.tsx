/* Wizard « nouveau personnage » (J7bis) — type → style → monde → base
   d'identité, puis création. Ported from `static/wizard.js`.

   THE ONLY SCREEN THAT WRITES A SHEET. Type, output style and world are the
   three HUMAN choices, frozen at creation: changing one means creating another
   character (CLAUDE.md §3, §8.8). The pack is not among them — it is RESOLVED
   from (type, style) server-side, which is why this screen never asks for it.

   IT GENERATES NO GRAPH. The wizard attaches a character to the pack of its
   family; there is never a graph file per character (§8.11). The frozen base is
   supplied or generated here — a generated portrait goes through the pack's
   graph with the identity lock BYPASSED, since no reference exists yet — and
   then never changes.

   State stays local to this screen, as it did to the module. The one thing that
   outlives it is the polling of generated candidates, stopped on unmount. */
import { useCallback, useEffect, useRef, useState } from 'react'

import { errorOf, type Schema } from '../api/client'
import { useApi } from '../api/useApi'
import { useCharacter } from '../character/CharacterContext'
import { useToast } from '../chrome/ToastContext'
import { PATHS } from '../app/routes'
import './wizard.css'

type WizardOptions = Schema<'WizardOptionsResponse'>
type CharacterType = Schema<'WizardType'>
type BaseNameResponse = Schema<'BaseNameResponse'>
type BaseGenerateResponse = Schema<'BaseGenerateResponse'>
type BaseCandidatesResponse = Schema<'BaseCandidatesResponse'>
type CreateCharacterResponse = Schema<'CreateCharacterResponse'>

const STEPS = ['type', 'style', 'world', 'base'] as const
type Step = (typeof STEPS)[number]
const LABELS: Record<Step, string> = {
  type: 'Type',
  style: 'Style',
  world: 'Monde',
  base: "Base d'identité",
}

/* The id becomes a folder name, a URL parameter and a database key. Same
   expression the server validates with — a slug refused here is refused there
   too, and saying so before the round trip is the only reason it is duplicated. */
const CID_RE = /^[a-z][a-z0-9_-]*$/
const MAX_UPLOAD = 20 * 1024 * 1024

/* Candidate polling. 4 s between rounds and 150 rounds at most: a portrait takes
   about 1 to 2 minutes, four of them can take ten, and a run that never finishes
   must stop asking rather than poll for ever. */
const POLL_MS = 4000
const POLL_MAX = 150

const candidateUrl = (file: string) =>
  `/api/characters/base/image?file=${encodeURIComponent(file)}`

type CandidateState = { file: string; state: string; detail?: string | null }

/* An option card. The tooltip goes on EACH card rather than on the step title:
   the stepper bullet is not focusable, hanging the bubble there would make it
   unreachable by keyboard, and giving it a tabindex would put a tab stop on a
   decorative element. */
function OptionCard({
  active,
  title,
  sub,
  hint,
  onClick,
}: {
  active: boolean
  title: string
  sub?: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      className={`it${active ? ' on' : ''}`}
      type="button"
      aria-pressed={active}
      data-hint-text={hint}
      onClick={onClick}
    >
      <b>{title}</b>
      {sub && <span>{sub}</span>}
    </button>
  )
}

const FROZEN_HINT = 'Figé à la création. Un autre choix = un autre personnage.'

export function WizardScreen() {
  const api = useApi()
  const toast = useToast()
  const { selectCharacter } = useCharacter()

  const [types, setTypes] = useState<CharacterType[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [cid, setCid] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [style, setStyle] = useState<string | null>(null)
  const [world, setWorld] = useState<string | null>(null)
  const [frozenBase, setFrozenBase] = useState<string | null>(null)
  const [basePreview, setBasePreview] = useState('')
  const [fileMessage, setFileMessage] = useState('')
  const [genMessage, setGenMessage] = useState('')
  const [candidates, setCandidates] = useState<CandidateState[] | null>(null)
  const [creating, setCreating] = useState(false)

  /* The generation batch being polled. A ref, not state: the interval reads it,
     and re-creating the timer on every candidate update would restart the count. */
  const batch = useRef<{ pack: string; items: unknown[] } | null>(null)
  const timer = useRef<number | null>(null)

  const stopPoll = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current)
      timer.current = null
    }
  }, [])

  // leaving the screen stops the polling: nothing keeps asking for a batch
  // nobody is looking at
  useEffect(() => stopPoll, [stopPoll])

  useEffect(() => {
    let alive = true
    api
      .get<WizardOptions>('/api/wizard/options')
      .then((response) => {
        if (!alive) return
        if (errorOf(response) || !Array.isArray(response.types)) setLoadFailed(true)
        else setTypes(response.types)
      })
      .catch(() => alive && setLoadFailed(true))
    return () => {
      alive = false
    }
  }, [api])

  const currentType = (types ?? []).find((t) => t.id === type) ?? null
  const cidValid = CID_RE.test(cid)

  const pickType = (id: string) => {
    if (type === id) return
    setType(id)
    setWorld(null)
    /* A type with a single style takes it outright: there is no choice to
       offer. `?? []` because the schema declares `styles` with a default, so
       OpenAPI marks it optional — a pack that declares none is a real shape, and
       reading it as absent is how the screen keeps standing. */
    const picked = (types ?? []).find((t) => t.id === id)
    const styles = picked?.styles ?? []
    setStyle(styles.length === 1 ? styles[0] : null)
  }

  /* Changing the id invalidates the frozen base: it was written under the OLD
     one. Keeping it would attach a file named for a character that will not
     exist. */
  const onCidChange = (value: string) => {
    setCid(value.trim())
    if (frozenBase) {
      setFrozenBase(null)
      setBasePreview('')
      setFileMessage('')
    }
  }

  const onFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > MAX_UPLOAD) {
      setFileMessage('Image trop lourde (max 20 Mo).')
      return
    }
    setFileMessage('envoi…')
    /* base64 in a JSON body, never multipart: multipart is a "simple"
       Content-Type at the CORS level and would walk straight through the origin
       guard (api/security.py). */
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(file)
    })
    const response = await api.post<BaseNameResponse>('/api/characters/base/upload', {
      cid,
      image_base64: dataUrl,
    })
    const failure = errorOf(response)
    if (failure) {
      setFileMessage('')
      toast(failure || "échec de l'envoi")
      return
    }
    stopPoll()
    batch.current = null
    setCandidates(null)
    setGenMessage('')
    setFrozenBase(response.base_gelee)
    setBasePreview(dataUrl)
    setFileMessage('image enregistrée.')
  }

  const poll = useCallback(async () => {
    if (!batch.current) return
    const response = await api.post<BaseCandidatesResponse>(
      '/api/characters/base/candidates',
      batch.current,
    )
    if (errorOf(response) || !Array.isArray(response.results)) return
    const results = response.results as CandidateState[]
    setCandidates(results)
    if (results.every((c) => c.state === 'ready' || c.state === 'error')) {
      stopPoll()
      setGenMessage(
        results.some((c) => c.state === 'ready')
          ? 'choisis un portrait ci-dessous.'
          : 'la génération a échoué — réessaie, ou fournis une image.',
      )
    }
  }, [api, stopPoll])

  const onGenerate = async () => {
    setGenMessage('mise en file…')
    const response = await api.post<BaseGenerateResponse>('/api/characters/base/generate', {
      cid,
      type,
      style,
      world,
      n: 4,
    })
    const failure = errorOf(response)
    if (failure) {
      setGenMessage('')
      toast(failure || 'échec de la génération')
      return
    }
    const queued = (response.candidates ?? []) as { file: string }[]
    batch.current = { pack: response.pack, items: queued }
    setCandidates(queued.map((c) => ({ ...c, state: 'pending' })))
    setGenMessage('génération en cours… (≈ 1 à 2 min par portrait)')
    stopPoll()
    let rounds = 0
    timer.current = window.setInterval(() => {
      if (++rounds > POLL_MAX) {
        stopPoll()
        setGenMessage("la génération n'a pas répondu — réessaie, ou fournis une image.")
        return
      }
      void poll()
    }, POLL_MS)
  }

  const freeze = async (file: string) => {
    const response = await api.post<BaseNameResponse>('/api/characters/base/freeze', {
      cid,
      file,
    })
    const failure = errorOf(response)
    if (failure) {
      toast(failure || 'échec du gel')
      return
    }
    setFrozenBase(response.base_gelee)
    setBasePreview(candidateUrl(file))
  }

  /* GATING. Each step has exactly one condition, and the last one has the whole
     list: nothing is created half-chosen. */
  const stepOk = {
    type: Boolean(type),
    style: Boolean(style),
    world: Boolean(world),
    base: Boolean(frozenBase),
  }[STEPS[step]]
  const readyToCreate = Boolean(
    name.trim() && cidValid && type && style && world && frozenBase,
  )
  const last = step === STEPS.length - 1

  const create = async () => {
    if (!readyToCreate) return
    setCreating(true)
    const response = await api.post<CreateCharacterResponse>('/api/characters', {
      cid,
      name: name.trim(),
      type,
      style,
      world,
      base_gelee: frozenBase,
    })
    const failure = errorOf(response)
    if (failure) {
      setCreating(false)
      toast(failure || 'échec de la création')
      return
    }
    stopPoll()
    /* The new character becomes the current one, WITHOUT reloading the page —
       the legacy wizard ended on `location.href = ?character=<id>`. Its sheet is
       the honest landing: it shows the three frozen axes and the resolved pack,
       which is exactly what was just decided. */
    selectCharacter(response.id, { to: PATHS.character })
  }

  if (loadFailed) {
    return (
      <div className="screen" id="wizard">
        <div className="wrap">
          <h2>Nouveau personnage</h2>
          <p className="wiz-note wiz-err">Impossible de charger les choix du wizard.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen" id="wizard">
      <div className="wrap">
        <h2>Nouveau personnage</h2>

        <div className="wiz-id">
          <label className="f">
            <span>Nom affiché</span>
            <input
              id="wizName"
              autoComplete="off"
              placeholder="ex : Léna"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="f">
            <span>
              Identifiant{' '}
              <span
                className={`tiny ${cid && !cidValid ? 'wiz-bad' : 'wiz-ok'}`}
                id="wizCidHint"
              >
                {!cid ? '' : cidValid ? '✓' : '— minuscules, chiffres, - et _'}
              </span>
            </span>
            <input
              id="wizCid"
              autoComplete="off"
              spellCheck={false}
              placeholder="slug — dossiers, URL, base de données"
              value={cid}
              onChange={(event) => onCidChange(event.target.value)}
            />
          </label>
        </div>

        <ol className="wiz-steps" id="wizSteps">
          {STEPS.map((key, index) => (
            <li
              key={key}
              className={index < step ? 'done' : index === step ? 'on' : ''}
              aria-current={index === step ? 'step' : undefined}
            >
              <i>{index + 1}</i>
              {LABELS[key]}
            </li>
          ))}
        </ol>

        <div id="wizBody">
          {types === null ? (
            <p className="tiny">chargement des choix…</p>
          ) : (
            <StepBody
              step={STEPS[step]}
              types={types}
              currentType={currentType}
              type={type}
              style={style}
              world={world}
              cidValid={cidValid}
              frozenBase={frozenBase}
              basePreview={basePreview}
              fileMessage={fileMessage}
              genMessage={genMessage}
              candidates={candidates}
              onPickType={pickType}
              onPickStyle={setStyle}
              onPickWorld={setWorld}
              onFilePicked={onFilePicked}
              onGenerate={onGenerate}
              onFreeze={freeze}
            />
          )}
        </div>
      </div>

      <div className="launch">
        <div className="inner">
          <div className="sum">
            <b id="wizSumN">
              {step + 1}/{STEPS.length}
            </b>
            <div id="wizSumT">
              {[type, style, world, frozenBase ? 'base ✓' : null].filter(Boolean).join(' · ') ||
                'choisis un type'}
            </div>
          </div>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn" id="wizBack" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Retour
          </button>
          <button
            className="btn primary"
            id="wizNext"
            disabled={last ? !readyToCreate || creating : !stepOk}
            onClick={() => (last ? create() : setStep(step + 1))}
          >
            {last ? (name.trim() ? `Créer ${name.trim()}` : 'Créer le personnage') : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StepBody(props: {
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
        <p className="wiz-note">
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
      return <p className="wiz-note">Aucun monde déclaré pour ce type.</p>
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
      <p className="wiz-note">
        Renseigne d'abord un <b>identifiant</b> valide en haut : la base d'identité
        est enregistrée sous ce nom.
      </p>
    )
  }

  return (
    <>
      <p className="wiz-note">
        Le visage de référence, figé à la création : le verrou d'identité s'y
        accroche pour toute la production.{' '}
        <b>Personnage fictif — jamais la photo d'une personne réelle.</b>
      </p>
      <div className="wiz-base">
        <div className="wiz-base-col">
          <h3>Fournir une image</h3>
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
        <div className="wiz-base-col">
          <h3>Générer un portrait</h3>
          <button className="btn sm" id="wizGen" onClick={props.onGenerate}>
            Générer 4 portraits
          </button>
          <p className="tiny" id="wizGenMsg">
            {props.genMessage}
          </p>
          <div className="wiz-cands" id="wizCands">
            {(props.candidates ?? []).map((candidate, index) =>
              candidate.state === 'ready' ? (
                <button
                  key={candidate.file}
                  className={`wiz-cand${props.basePreview === candidateUrl(candidate.file) ? ' chosen' : ''}`}
                  type="button"
                  data-file={candidate.file}
                  onClick={() => props.onFreeze(candidate.file)}
                >
                  <img alt="portrait candidat" src={candidateUrl(candidate.file)} />
                </button>
              ) : candidate.state === 'error' ? (
                <div key={candidate.file || index} className="wiz-cand err" title={candidate.detail || ''}>
                  échec
                </div>
              ) : (
                <div key={candidate.file || index} className="wiz-cand pending">
                  <span className="spin" />
                </div>
              ),
            )}
          </div>
        </div>
      </div>
      <div className="wiz-base-preview" id="wizBasePreview">
        {props.frozenBase && (
          <div className="wiz-frozen">
            <img alt="base d'identité" src={props.basePreview} />
            <span>
              base gelée : <code>{props.frozenBase}</code>
            </span>
          </div>
        )}
      </div>
    </>
  )
}
