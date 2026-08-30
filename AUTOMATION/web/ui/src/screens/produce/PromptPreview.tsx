/* PREVIEW OF THE PROMPT ACTUALLY SENT. Ported from `renderApercu` in
   `static/create.js`.

   Measured 26/08/2026: on `cuisine_matin` the final prompt is 578 characters of
   which 179 are written by the user — 31 %. The rest (anchor, texture, outfit,
   tone, intention, tier) was assembled without ever being shown. A failed result
   could therefore not be diagnosed: impossible to know whether it was the scene,
   the tone, or two fragments contradicting each other.

   The panel shows each fragment with its source and its share, flags the words
   that come back from one fragment to another, and lets one amend the scene FOR
   THIS LAUNCH (without touching scenes.json).

   THE AMENDMENT FIELD IS NEVER RE-CREATED. Typing in it changes the prompt,
   hence the preview, hence the payload — repainting it would make the caret jump
   on every keystroke. It is a controlled input of its own here, and only the
   COMPUTED parts (fragments, echoes, header) follow the plan. */
import type { Preview } from './useProduceState'

export function PromptPreview({
  preview,
  /** The amendment only means something on ONE scene: with several, « the »
      scene designates nothing. The server applies the same rule
      (scene_override). */
  singleScene,
  override,
  onOverride,
  onClose,
}: {
  preview: Preview | null
  singleScene: boolean
  override: string
  onOverride: (value: string) => void
  onClose: () => void
}) {
  if (!preview) return null
  return (
    <div id="apercuPanel">
      <div className="ap">
        <div className="aph">
          <b>Prompt envoyé</b>
          <span className="tiny" id="apMeta">
            {preview.total_car} caractères · {preview.scene}
            {preview.n_jobs > 1 ? ` · ${preview.n_jobs} images, aperçu de la première` : ''}
          </span>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="link" id="apFermer" onClick={onClose}>
            fermer
          </button>
        </div>

        <div id="apFrags">
          {preview.fragments.map((fragment, index) => (
            <div className={`fr${fragment.source === 'scène' ? ' sc' : ''}`} key={index}>
              <span className="pc">{fragment.part}%</span>
              <span className="src">{fragment.source}</span>
              <span className="tx">{fragment.texte}</span>
            </div>
          ))}
        </div>

        <div id="apEchos">
          {preview.echos.length > 0 && (
            <div className="ech">
              <b>mots partagés par plusieurs fragments</b>
              {preview.echos.map((echo) => (
                <span className="e" key={echo.mot}>
                  {echo.mot} <i>{echo.sources.join(' · ')}</i>
                </span>
              ))}
              <p className="tiny">
                Une répétition n'est pas forcément une faute — mais deux fragments
                qui parlent du même sujet se disputent. C'est ce qui a fait
                cohabiter « close intimate framing » et « full figure in frame ».
              </p>
            </div>
          )}
        </div>

        <div className={`amd${singleScene ? '' : ' inerte'}`}>
          <label className="f">
            <span id="apAmdLbl">
              {singleScene ? (
                <>
                  amender la scène pour ce lancement — n'enregistre rien dans{' '}
                  <code>scenes.json</code>
                </>
              ) : (
                'amendement indisponible — il demande une seule scène sélectionnée'
              )}
            </span>
            <textarea
              id="sceneOverride"
              spellCheck={false}
              placeholder="laisser vide pour garder le texte de la scène"
              disabled={!singleScene}
              value={override}
              onChange={(event) => onOverride(event.target.value)}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
