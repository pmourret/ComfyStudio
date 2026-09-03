/* The sheet of the loaded character, at /character. READ-ONLY.

   WHY IT EXISTS (F1.2). The navbar used to open the same screen as the entry
   gate — a SECOND door to CHOOSE a character, while the identity menu already
   changes, lists and creates. There were therefore two doors to choose, and none
   to READ the character that is open. This is that reading, and nothing else.

   WHAT IT DOES NOT DO, spelled out:
     - it does not replay the choice grid: « Tous les personnages » reopens the
       header menu, the one place a character is changed;
     - it never arms anything. Adult content has ONE gesture, on the Application
       screen (J7, ADR-0010) — here we read its state and say where it is taken.

   ONE CALL, AND IT IS ALREADY MADE. /api/character is loaded by
   CharacterContext for the chrome; the sheet reads the same object. The legacy
   frontend fetched that route TWICE — once in character.js for the header, once
   in registre.js for the sheet — and cached each separately. */
import { Link } from 'react-router-dom'

import { initialOf, useCharacter, type CharacterSheet } from '../character/CharacterContext'
import { useChrome } from '../chrome/ChromeContext'
import { PATHS } from '../app/routes'

/* Active content types: the CREATION registry (ADR-0004), an axis transverse to
   packs. In V1 only `image` is active everywhere; video and voice are declared
   and dormant, so that turning them on later is a change of value, not of
   schema. The sheet says so rather than letting it look like a gap. */
const CONTENT_LABELS: Record<string, string> = {
  image: 'image',
  video: 'vidéo',
  voice: 'voix',
  staging: 'mise en scène',
}

function ContentTypes({ sheet }: { sheet: CharacterSheet }) {
  const declared = (sheet.content_types ?? {}) as Record<string, unknown>
  const keys = Object.keys(CONTENT_LABELS)
  const active = keys.filter((key) => declared[key])
  const dormant = keys.filter((key) => key in declared && !declared[key])
  return (
    <>
      {active.map((key) => CONTENT_LABELS[key]).join(', ') || '—'}
      {dormant.length > 0 && (
        <span className="tiny">
          {' '}
          · déclarés, pas encore branchés : {dormant.map((key) => CONTENT_LABELS[key]).join(', ')}
        </span>
      )}
    </>
  )
}

/* State of the adult branch, READ. Three distinct states, never merged into
   « unavailable »: the character's switch, the pack's edit graph, and the two
   together. A character armed whose pack has no tool does not have the same
   problem as one simply off — and the sheet exists precisely to read which.

   Two conditions, two sentences: what the state IS, then what it CHANGES on the
   Produire screen. Without the second, « activé » does not say whether a step
   appears anywhere, which is the only question one asks reading the sheet. */
function AdultContent({ sheet }: { sheet: CharacterSheet }) {
  const tool = sheet.nsfw_tool ?? {}
  const armed = Boolean(sheet.nsfw || tool.armed)
  const hasGraph = Boolean(tool.has_graph)

  const state = armed
    ? hasGraph
      ? 'activé'
      : "activé, sans outil d'édition dans ce pack"
    : 'désactivé'
  const effect = !armed
    ? "aucun cran d'édition sur Produire, aucune sortie NSFW"
    : hasGraph
      ? "le cran d'édition est proposé sur Produire"
      : "aucun cran sur Produire tant que le pack n'a pas son graphe"

  return (
    <div className="meta">
      <dt className="mb-[9px]">Contenu adulte</dt>
      <p className="tiny m-0">
        État : <b>{state}</b> <span className="tiny">· {effect}</span>
      </p>
      {/* The reason comes from the server (edit_tool_state): the same sentence
          as the Application screen, not a second wording to keep in sync. */}
      {!hasGraph && tool.reason && (
        <p className="tiny mt-[8px] mb-0">
          {tool.reason}
        </p>
      )}
      <p className="tiny mt-[10px] mb-0">
        {sheet.nsfw ? 'Se désactive au même endroit :' : "Pour l'activer :"}{' '}
        <b>Application → Contenu adulte</b>.
      </p>
    </div>
  )
}

/* One empty `.meta` card, sized by the same padding + row rhythm as a real
   one rather than a guessed height — three placeholder lines because every
   real card on this screen carries exactly three `Row`s. */
function SkeletonMeta() {
  return (
    <div className="meta">
      <div className="h-[10px] w-[70px] rounded-[3px] bg-line" />
      <div className="mb-[11px] mt-[6px] h-[14px] w-[45%] rounded-[3px] bg-line" />
      <div className="h-[10px] w-[70px] rounded-[3px] bg-line" />
      <div className="mb-[11px] mt-[6px] h-[14px] w-[60%] rounded-[3px] bg-line" />
      <div className="h-[10px] w-[70px] rounded-[3px] bg-line" />
      <div className="mt-[6px] h-[14px] w-[50%] rounded-[3px] bg-line" />
    </div>
  )
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{term}</dt>
      <dd className="last-of-type:mb-[6px]">{children}</dd>
    </>
  )
}

function FrozenBase({ sheet }: { sheet: CharacterSheet }) {
  const base = sheet.base ?? {}
  if (base.present) {
    return (
      <>
        présente{' '}
        <span className="tiny">
          · <code>{base.name || ''}</code>
        </span>
      </>
    )
  }
  if (base.name) {
    return (
      <>
        <b>introuvable</b>{' '}
        <span className="tiny">
          · <code>{base.name}</code> attendue dans les entrées de ComfyUI
        </span>
      </>
    )
  }
  return <b>absente</b>
}

export function CharacterSheetScreen() {
  const { claimed, sheet, sheetError, refreshSheet } = useCharacter()
  const { openIdentityMenu } = useChrome()

  /* Reached with no character claimed — a pasted /character link, or a switch
     back to the gate. The registry is the honest destination, and it is one
     click away rather than an empty screen. */
  if (!claimed) {
    return (
      <div className="screen">
        <div className="wrap">
          <div className="empty">
            <b>Aucun personnage ouvert</b>
            <p className="muted">Cette fiche lit le personnage chargé ; il n'y en a pas.</p>
            <p className="mt-[18px]">
              <Link className="btn" to={PATHS.characters}>
                Ouvrir le registre
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (sheetError) {
    /* The fallback invents nothing: the id comes from the URL, it is true even
       when the rest is missing. Saying what we do not know beats an empty
       sheet. */
    return (
      <div className="screen" id="registre" data-vue="fiche">
        <div className="wrap">
          <div className="empty">
            <b>Fiche indisponible</b>
            Le serveur n'a pas rendu la fiche de <code>{claimed}</code> : {sheetError}.
            <p className="mt-[14px]">
              <button className="btn sm" id="ficheRetry" onClick={refreshSheet}>
                Réessayer
              </button>
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!sheet) {
    /* The shape of a loaded sheet, not a sentence — same idea as the wizard's
       loading skeleton (screen-1). No pack is resolved yet at this point (the
       name that would tell us which is exactly what has not loaded), so this
       stays on whichever token sheet is already active rather than forcing a
       flash of the commune one. */
    return (
      <div className="screen" id="registre" data-vue="fiche">
        <div className="wrap">
          <div className="fiche" aria-hidden="true">
            <div className="mb-[4px] flex items-center gap-[14px]">
              <span className="h-[46px] w-[46px] flex-none rounded-[50%] bg-panel2" />
              <div>
                <div className="h-[19px] w-[160px] rounded-[4px] bg-line" />
                <div className="mt-[6px] h-[12px] w-[90px] rounded-[4px] bg-line" />
              </div>
            </div>
            <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[14px]">
              <SkeletonMeta />
              <SkeletonMeta />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const pack = sheet.universe ?? {}

  return (
    <div className="screen" id="registre" data-vue="fiche">
      <div className="wrap">
        <div className="fiche" id="fiche">
          <div className="mb-[4px] flex items-center gap-[14px]">
            {/* The INITIAL, not the frozen base portrait: no route serves those
                bytes, which live outside PROD/ on the ComfyUI input side. */}
            <span
              className="flex h-[46px] w-[46px] flex-none items-center justify-center
                         rounded-[50%] border border-line2 bg-panel2 text-[20px]
                         font-bold text-acc"
              aria-hidden="true"
            >
              {initialOf(sheet)}
            </span>
            <div>
              <h2 className="m-0 text-[19px] font-semibold tracking-[0px] text-txt normal-case">
                {sheet.name || sheet.id}
              </h2>
              <code className="font-code text-[12px] leading-[normal] text-dim2">{sheet.id}</code>
            </div>
            <div className="flex-1" />
            {/* Reopens the HEADER menu — there are not two places where one
                changes character. stopPropagation: the outside click that closes
                that menu would otherwise close the one this button opens. */}
            <button
              className="link"
              id="ficheAutres"
              onClick={(event) => {
                event.stopPropagation()
                openIdentityMenu()
              }}
            >
              Tous les personnages
            </button>
          </div>
          <p className="tiny mt-0 mb-[18px]">
            Fiche du personnage ouvert — en lecture. Pour en ouvrir un autre ou en
            créer un, passe par le menu d'identité de l'en-tête.
          </p>

          <div className="mb-[14px] grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[14px]">
            <div className="meta">
              <dl className="m-0">
                <Row term="Type de personnage">{sheet.type || '—'}</Row>
                <Row term="Style de sortie">{sheet.output_style || '—'}</Row>
                <Row term="Monde">{sheet.world?.label || '—'}</Row>
              </dl>
              <p className="tiny mt-[2px] mb-0">
                Trois choix humains, <b>figés à la création</b> : en changer, c'est
                créer un autre personnage.
              </p>
            </div>
            <div className="meta">
              <dl className="m-0">
                <Row term="Pack">
                  {pack.label || pack.id || '—'}
                  {pack.model_family && <span className="tiny"> · {pack.model_family}</span>}
                </Row>
                <Row term="Base gelée">
                  <FrozenBase sheet={sheet} />
                </Row>
                <Row term="Contenus actifs">
                  <ContentTypes sheet={sheet} />
                </Row>
              </dl>
              <p className="tiny mt-[2px] mb-0">
                Le pack n'est pas choisi : il est <b>déduit</b> du type et du style,
                et il porte le verrou d'identité.
              </p>
            </div>
          </div>

          <AdultContent sheet={sheet} />
        </div>
      </div>
    </div>
  )
}
