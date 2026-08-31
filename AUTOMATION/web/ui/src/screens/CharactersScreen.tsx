/* The entry gate: the character registry, at /characters.

   WHAT CHANGES (migration brief, point 2). This used to be one half of
   `#registre`, switched by a `data-vue` attribute the screen wrote from what the
   URL claimed. It is now a route of its own, and the sheet is another — two
   honest URLs instead of one screen with two faces.

   WHAT DOES NOT CHANGE. This is where the application opens when no character is
   claimed, and the navbar does not exist here: with no character there is no
   workshop to navigate, so the registry takes the whole screen and choosing a
   character is what MAKES you enter. Not a landing page — a dense list.

   Opening a card no longer reloads the studio (point 1): it sets the shared
   state and the URL follows. The `href` stays so a card is copyable and opens in
   a new tab like any link. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { errorOf, type Schema } from '../api/client'
import { useApi } from '../api/useApi'
import { useCharacter, type CharacterRow } from '../character/CharacterContext'
import { useFaults } from '../state/FaultsContext'
import { PATHS } from '../app/routes'

type CharacterListResponse = Schema<'CharacterListResponse'>

/* Where a card leads once its character is loaded. Produire is the studio's
   working screen — the same destination the legacy reload landed on. */
const AFTER_PICK = PATHS.produce

function NewCharacterCard() {
  /* Present EVEN on an empty registry: otherwise a fresh machine (no
     CHARACTERS/ folder, a case that is planned for) opens a gate with no path
     to the wizard at all. */
  return (
    <Link
      className="block rounded-card border-2 bg-panel px-[15px] py-[14px] text-txt no-underline hover:border-line2 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 flex flex-col justify-center gap-[4px]
                 border-line border-dashed"
      to={PATHS.wizard}
      data-char-card
      data-new
    >
      <b className="block text-[15px] font-semibold text-acc">+ Nouveau personnage</b>
      {/* `.tiny` already carries --dim2; the sheet said it a second time. */}
      <span className="tiny">type, style et monde — figés à la création</span>
    </Link>
  )
}

export function CharactersScreen() {
  const api = useApi()
  const { claimed, selectCharacter } = useCharacter()
  const { report } = useFaults()
  const [rows, setRows] = useState<CharacterRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    let response: (CharacterListResponse & { ok?: boolean; erreur?: string }) | null = null
    try {
      response = await api.get<CharacterListResponse>('/api/characters')
    } catch {
      report('registre', 'liste des personnages illisible')
      setFailed(true)
      return
    }
    const failure = errorOf(response) || (Array.isArray(response.characters) ? null : 'liste illisible')
    if (failure) {
      report('registre', `liste des personnages : ${failure}`)
      setFailed(true)
      return
    }
    report('registre', null)
    setFailed(false)
    setRows(response.characters)
  }, [api, report])

  useEffect(() => {
    void load()
  }, [load])

  /* One update: the character AND the destination. Selecting then navigating
     separately dropped `?character=` — the second write carries no query. */
  const pick = (id: string) => selectCharacter(id, { to: AFTER_PICK })

  if (failed) {
    return (
      <div className="screen">
        <div className="wrap">
          <div className="empty">
            <b>Registre indisponible</b>
            La liste des personnages n'a pas pu être lue. Le détail est dans le
            bandeau en haut de l'écran.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen" id="registre" data-vue="sas">
      <div className="wrap">
        <div>
          <h2>Registre des personnages</h2>
          <p className="tiny mt-[6px] mb-[18px]">
            Ouvrir un personnage charge le studio sur sa production. Son type et
            son monde sont figés à sa création.
          </p>
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-[14px]"
            id="charGrid"
          >
            {rows === null && <p className="tiny">chargement du registre…</p>}
            {rows?.length === 0 && (
              <div className="empty col-span-full">
                <b>Aucun personnage</b>
                Le dossier CHARACTERS/ est vide sur cette machine.
              </div>
            )}
            {rows?.map((row) => (
                <a
                  key={row.id}
                  className={`block rounded-card border-2 bg-panel px-[15px] py-[14px] text-txt no-underline hover:border-line2 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2 ${row.id === claimed ? 'border-acc' : 'border-line'}`}
                  href={`?character=${encodeURIComponent(row.id)}`}
                  data-char-card
                  data-current={row.id === claimed ? '1' : undefined}
                  onClick={(event) => {
                    // a modified click keeps the browser's own meaning
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                    event.preventDefault()
                    pick(row.id)
                  }}
                >
                  <b className="block text-[15px] font-semibold">{row.name || row.id}</b>
                  {/* An id is technical: it reads in mono. `font:12px var(--font-mono)`
                      never applied — the token already carries a size, so the
                      shorthand held two and the browser dropped the lot. */}
                  <code className="font-code text-[12px] leading-[normal] text-dim2">
                    {row.id}
                  </code>
                  <div className="mt-[10px] flex flex-wrap gap-[6px]">
                    <span className="rounded-[20px] border px-[8px] py-[2px] text-[11px] whitespace-nowrap border-line2 text-dim" data-char-tag>{row.type || '—'}</span>
                    <span className="rounded-[20px] border px-[8px] py-[2px] text-[11px] whitespace-nowrap border-line2 text-dim" data-char-tag>{row.world?.label || '—'}</span>
                    {row.nsfw && <span className="rounded-[20px] border px-[8px] py-[2px] text-[11px] whitespace-nowrap border-warn-line bg-warn-bg text-warn-txt" data-char-tag>
                        NSFW
                      </span>}
                    {/* A pack the studio cannot resolve is a breakdown, not a
                        case to repair in silence (ADR-0012): the card says so
                        rather than opening on an error. */}
                    {row.known_universe === false && (
                      <span
                        className="rounded-[20px] border px-[8px] py-[2px] text-[11px] whitespace-nowrap border-danger-line bg-danger-bg text-danger-txt"
                        data-char-tag
                      >
                        pack inconnu
                      </span>
                    )}
                  </div>
                </a>
            ))}
            {/* Always last in the grid, empty registry included. */}
            {rows !== null && <NewCharacterCard />}
          </div>
        </div>
      </div>
    </div>
  )
}
