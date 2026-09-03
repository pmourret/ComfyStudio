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
   outlives it is the polling of generated candidates, stopped on unmount.

   LAYOUT (screen-1-wizard design pass, 03/09/2026): moved from the centred
   `.wrap` model to Produire's two-column workstation grid — the four choices
   were previously summarised in one line of the launch bar, read only when
   about to click Next. The right column now shows them building up as they
   are made. Reuses Produire's REAL pattern (`ProduceScreen.tsx`'s grid +
   `Inspector`'s sticky classes) — DESIGN.md still names this `.cr-main`/
   `.cr-side`, a pre-Tailwind naming that matches no class in this build. */
import { useCallback, useEffect, useRef, useState } from 'react'

import { errorOf, type Schema } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useCharacter } from '../../character/CharacterContext'
import { useToast } from '../../chrome/ToastContext'
import { PATHS } from '../../app/routes'
import { BuildSheetPanel } from './BuildSheetPanel'
import { StepBody, StepBodySkeleton } from './StepBody'
import {
  NOTE_ERR, STEPS, candidateUrl,
  type CandidateState, type CharacterType, type Step,
} from './shared'

type WizardOptions = Schema<'WizardOptionsResponse'>
type BaseNameResponse = Schema<'BaseNameResponse'>
type BaseGenerateResponse = Schema<'BaseGenerateResponse'>
type BaseCandidatesResponse = Schema<'BaseCandidatesResponse'>
type CreateCharacterResponse = Schema<'CreateCharacterResponse'>

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


/* ------------------------------------------------------------- appearance
   The wizard's own sheet is gone. Two of its blocks did NOT come here: `.it`
   (the option card) and `.launch` (the launch bar) went up into `screens.css`,
   because Produire lays out the same two components — a sheet named after one
   screen was the wrong home for a thing two screens share. The one `@keyframes`
   of the studio went into `base.css`, next to the reduced-motion rule that
   governs it: a keyframe name is global whatever sheet declares it. */
const WRAP = 'pb-[130px]'
/* The workstation grid — same shape as `#creer .wrap.split` (ProduceScreen.tsx):
   full width, sticky right column, right column moves under the left one below
   1100 px rather than overlaying it. */
const SPLIT =
  'wrap m-0 grid w-full max-w-none gap-[22px] pb-[130px] [align-items:start] ' +
  'grid-cols-[minmax(0,1fr)_clamp(280px,22vw,420px)] max-[1100px]:grid-cols-[1fr]'
const ID_GRID = 'mt-[6px] mb-[22px] grid grid-cols-2 gap-[16px] max-[720px]:grid-cols-1'

/* THE STEPPER SHOWS where one is; it is not a control — steps are reached by
   the bar at the bottom, which is where the gating lives.

   `mt-0 mb-[20px]` and not `m-0 mb-[20px]`: Tailwind emits the LONGHAND before
   the shorthand (measured on the border of the Revue, previous commit), so a
   `m-0` would wipe the bottom margin out. A <ol> has no side margin to reset
   anyway. No colour in the base chain — each state names its own, the trap of
   every sheet migrated so far. */
const STEPS_LIST = 'mt-0 mb-[20px] flex list-none flex-wrap gap-[8px] p-0 text-[13px]'
const STEP = 'flex items-center gap-[7px] rounded-[20px] border px-[12px] py-[6px]'
const STEP_STATE = {
  todo: 'border-line text-dim2',
  on: 'border-acc text-txt',
  done: 'border-line text-dim',
}
const BULLET = 'flex h-[18px] w-[18px] items-center justify-center rounded-[50%] text-[11px] not-italic'
const BULLET_STATE = {
  todo: 'bg-line2 text-txt',
  on: 'bg-acc text-on-acc',
  done: 'bg-ok text-on-acc',
}




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

  /* A ref rather than the effect's own closed-over flag: `loadOptions` is now
     called from two places (mount, and the Retry button), and both must skip
     setting state once the screen is gone. */
  const mounted = useRef(true)
  useEffect(() => () => {
    mounted.current = false
  }, [])

  const loadOptions = useCallback(() => {
    setLoadFailed(false)
    api
      .get<WizardOptions>('/api/wizard/options')
      .then((response) => {
        if (!mounted.current) return
        if (errorOf(response) || !Array.isArray(response.types)) setLoadFailed(true)
        else setTypes(response.types)
      })
      .catch(() => {
        if (mounted.current) setLoadFailed(true)
      })
  }, [api])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

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
        <div className={`wrap ${WRAP}`}>
          <h2>Nouveau personnage</h2>
          <p className={NOTE_ERR} data-note>
            Impossible de charger les choix du wizard.
          </p>
          <button className="btn sm" id="wizRetry" onClick={loadOptions}>
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  const worldLabel = currentType?.worlds?.find((entry) => entry.id === world)?.label ?? null

  return (
    <div className="screen" id="wizard">
      <div className={SPLIT}>
        <div className="min-w-0">
          <h2>Nouveau personnage</h2>

          <div className={ID_GRID}>
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
                {/* `.wiz-ok` / `.wiz-bad` ARE NOT PORTED: neither ever painted.
                    `label.f span` (chrome.css, a class plus two types) outweighs
                    them — and outweighs `.tiny` too. Measured on 31/08/2026: this
                    hint is `--dim` in BOTH states, valid and invalid. Painting it
                    now would be a VISIBLE change, which a migration meant to be
                    invisible does not smuggle in; the ✓ and the sentence carry the
                    state on their own, as they always have. */}
                <span className="tiny" id="wizCidHint">
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

          <ol className={STEPS_LIST} id="wizSteps" aria-label="Étapes de création">
            {STEPS.map((key, index) => {
              const state = index < step ? 'done' : index === step ? 'on' : 'todo'
              return (
                <li
                  key={key}
                  className={`${STEP} ${STEP_STATE[state]}`}
                  data-step={state}
                  aria-current={index === step ? 'step' : undefined}
                >
                  <i className={`${BULLET} ${BULLET_STATE[state]}`}>{index + 1}</i>
                  {LABELS[key]}
                </li>
              )
            })}
          </ol>

          <div id="wizBody">
            {types === null ? (
              <StepBodySkeleton />
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

        <BuildSheetPanel
          name={name}
          cid={cid}
          typeLabel={currentType?.label ?? null}
          styleLabel={style}
          worldLabel={worldLabel}
          frozenBase={frozenBase}
          basePreview={basePreview}
        />
      </div>

      <div className="launch">
        <div className="inner">
          <div className="flex-1" />
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
