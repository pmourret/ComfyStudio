/* « Contenu adulte » — the section of the Application screen, and the arming
   ritual it opens (J7). Ported from `static/nsfw-arm.js`.

   ONE SINGLE PLACE. Arming used to live on the locked step of the intensity
   slider and inside the Decline modal: two doors, both in the middle of a
   production gesture, where one does not want to take that kind of decision. It
   lives here, on the screen that configures the application — and disarming with
   it. Produire carries the decision out, it no longer takes it.

   NO GLOBAL SWITCH. The switch is ONE character's (CHARACTERS/<id>/character.json,
   key `nsfw`, ADR-0010), off at creation. This section therefore always speaks
   of the current character, and names it.

   TWO CONDITIONS. The edit step only appears on Produire if the character is
   armed AND its pack declares an edit graph (universe.json / edit_workflow). A
   pack without the graph says so here, in plain words: arming stays allowed, it
   just makes nothing appear. */
import { useCallback, useEffect, useState } from 'react'

import { errorOf, type Schema } from '../api/client'
import { useApi } from '../api/useApi'
import { useCharacter } from '../character/CharacterContext'
import { useConfirm } from '../chrome/ConfirmContext'
import { Dialog } from '../chrome/Dialog'
import { useToast } from '../chrome/ToastContext'

type NsfwState = Schema<'NsfwStateResponse'>
type NsfwArmResponse = Schema<'NsfwArmResponse'>

export function AdultContentSection() {
  const api = useApi()
  const confirm = useConfirm()
  const toast = useToast()
  const { claimed, refreshSheet } = useCharacter()
  const [state, setState] = useState<NsfwState | null>(null)
  const [failed, setFailed] = useState(false)
  const [arming, setArming] = useState(false)
  const [word, setWord] = useState('')

  const load = useCallback(async () => {
    let response: (NsfwState & { ok?: boolean; erreur?: string }) | null = null
    try {
      response = await api.get<NsfwState>('/api/nsfw/state')
    } catch {
      setFailed(true)
      return
    }
    if (errorOf(response)) {
      setFailed(true)
      return
    }
    setFailed(false)
    setState(response)
  }, [api])

  // reloaded on entering the screen, and on a character switch: this section
  // speaks of ONE character, and switching no longer reloads the page
  useEffect(() => {
    void load()
  }, [load, claimed])

  /* After a switch, everything that READS the flag has to catch up. The sheet is
     one of them (CharacterContext holds it).

     The creative taxonomy is the other — arming makes /api/creative emit the
     edit tier — but it has no React owner yet: Produire is still served by the
     legacy frontend, which loads its own taxonomy when it opens. When Produire
     is migrated, its taxonomy must be refreshed HERE too, exactly as
     `nsfw-arm.js` called `loadCreative()`, or its slider keeps a state from
     before the switch. */
  const afterToggle = async () => {
    refreshSheet()
    await load()
  }

  const disarm = async () => {
    const ok = await confirm({
      title: 'Désactiver le contenu adulte ?',
      button: 'Désactiver',
      body: (
        <>
          <p>
            Le cran disparaît du curseur de Produire et plus aucune édition ne peut
            être lancée.
          </p>
          <p>
            Les images déjà produites <b>restent en place</b> dans{' '}
            <code>{state?.sortie || ''}</code> — rien n'est supprimé.
          </p>
        </>
      ),
    })
    if (!ok) return
    const response = await api.post<NsfwArmResponse>('/api/nsfw/arm', { arm: false })
    const failure = errorOf(response)
    if (failure) {
      toast(failure || 'désactivation impossible')
      return
    }
    toast('contenu adulte désactivé')
    await afterToggle()
  }

  /* The ritual: copy the word, not a click. It states the real consequences —
     the character's own folder, and the fact that nothing leaves it. */
  const arm = async () => {
    const response = await api.post<NsfwArmResponse>('/api/nsfw/arm', {
      arm: true,
      confirm: word,
    })
    const failure = errorOf(response)
    if (failure) {
      toast(
        failure === 'confirmation manquante'
          ? 'recopie exactement le mot ARMER'
          : failure || 'échec',
      )
      return
    }
    setArming(false)
    setWord('')
    toast('contenu adulte activé')
    await afterToggle()
  }

  if (failed) {
    return (
      <div id="nsfwBox">
        <p className="tiny">État indisponible — le serveur n'a pas répondu.</p>
      </div>
    )
  }
  if (!state) {
    return (
      <div id="nsfwBox">
        <p className="tiny">chargement…</p>
      </div>
    )
  }

  const tool = state.outil ?? {}
  const armed = Boolean(tool.armed)
  const total = Object.values(state.counts ?? {}).reduce((a, b) => a + b, 0)

  return (
    <div id="nsfwBox">
      <p className="tiny mt-[6px] mb-[14px]">
        Ajoute au curseur de Produire un cran qui <b>édite une image déjà validée</b>{' '}
        que tu choisis toi-même — il n'engendre jamais une scène à partir de rien.
        La retouche se fait ensuite dans l'éditeur photo, depuis la Revue.
      </p>

      {/* The pack does not have the tool: say it BEFORE the switch, otherwise
          arming promises a step that will not appear. We do not forbid it for
          all that — arming is the character's decision, it stays takeable. */}
      {!tool.has_graph && (
        <p className="tiny mt-0 mb-[14px]" id="nsfwManque">
          {tool.reason || ''} L'activer ici est sans effet visible sur Produire
          tant que le pack n'aura pas son graphe d'édition.
        </p>
      )}

      <p className="tiny mt-0 mb-[16px]">
        État : <b>{armed ? 'activé' : 'désactivé'}</b>
        {armed && total > 0 && (
          <>
            {' '}
            · {total} image{total > 1 ? 's' : ''} dans <code>{state.sortie || ''}</code>
          </>
        )}
      </p>

      <div className="mt-[14px] mb-[6px] flex gap-[12px]">
        {armed ? (
          <button className="btn danger" id="btnNsfwOff" onClick={disarm}>
            Désactiver
          </button>
        ) : (
          <button className="btn" id="btnNsfwOn" onClick={() => setArming(true)}>
            Activer…
          </button>
        )}
      </div>

      <Dialog
        id="armBoxNsfw"
        open={arming}
        onDismiss={() => setArming(false)}
        initialFocus="#armWord2"
      >
        <h3>Activer le contenu adulte — {state.nom || ''}</h3>
        <p>
          Un cran s'ajoute au curseur de Produire. Il part de l'image validée que tu
          choisis : la sélection est manuelle, il n'y a pas de reprise automatique.
        </p>
        <ul>
          <li>le verrou d'identité du pack remet le visage depuis la base gelée</li>
          <li>
            sorties isolées dans <code>{state.sortie || ''}</code>,{' '}
            <b>jamais exportées</b>
          </li>
          <li>une image dont la passe d'identité sort de la bande n'est pas éditée</li>
          <li>réversible ici même, à tout moment</li>
        </ul>
        <label className="f mt-[14px]">
          <span>pour activer, recopier le mot ARMER</span>
          <input
            id="armWord2"
            autoComplete="off"
            className="max-w-[220px]"
            value={word}
            onChange={(event) => setWord(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void arm()
            }}
          />
        </label>
        <div className="mt-[16px] flex items-center gap-[12px]">
          <button className="btn primary" id="btnArm2" onClick={arm}>
            Activer
          </button>
          <button className="link" id="armClose" onClick={() => setArming(false)}>
            annuler
          </button>
        </div>
      </Dialog>
    </div>
  )
}
