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
    /* It opens ABOVE the launch bar and takes its width — it is its extension.
       `overflow-x-hidden` is a belt, not the fix: the real defect was the text
       column without `min-w-0`. VERTICAL scrolling stays: the full prompt often
       goes past 52vh. */
    <div
      className="m-0 mb-[10px] max-h-[52vh] max-w-none overflow-x-hidden overflow-y-auto"
      id="apercuPanel"
    >
      <div className="rounded-[12px] border border-line2 bg-panel px-[18px] py-[14px] shadow-elev">
        <div className="mb-[10px] flex items-baseline gap-[12px]">
          <b className="text-[14px]">Prompt envoyé</b>
          <span className="tiny" id="apMeta">
            {preview.total_car} caractères · {preview.scene}
            {preview.n_jobs > 1 ? ` · ${preview.n_jobs} images, aperçu de la première` : ''}
          </span>
          <span className="flex-1" />
          <button className="link" id="apFermer" onClick={onClose}>
            fermer
          </button>
        </div>

        <div id="apFrags">
          {preview.fragments.map((fragment, index) => {
            // the scene is the only fragment the user writes: we tell it apart
            const own = fragment.source === 'scène'
            return (
              <div
                className={`flex items-baseline gap-[12px] border-t border-t-line py-[5px] ${
                  own ? 'mx-[-18px] bg-[#1e2630] px-[18px]' : ''
                }`}
                key={index}
                data-fragment
                data-own={own ? '1' : undefined}
              >
                <span
                  className="min-w-[34px] flex-none text-right text-[11px] tabular-nums text-dim2"
                  data-part
                >
                  {fragment.part}%
                </span>
                <span
                  className={`min-w-[118px] flex-none text-[11.5px] uppercase tracking-[.4px] ${
                    own ? 'text-acc' : 'text-dim'
                  }`}
                  data-source
                >
                  {fragment.source}
                </span>
                {/* `min-w-0`: without it the flex item keeps its `min-width:auto`,
                    refuses to go under the width of its content and pushes the
                    line out of the frame. Both left labels being `flex-none`, it
                    was the TEXT — the only thing one comes to read — that went
                    out. */}
                <span
                  className={`min-w-0 flex-1 text-[12.5px] leading-[1.5] [overflow-wrap:anywhere]
                              ${own ? 'text-txt' : ''}`}
                >
                  {fragment.texte}
                </span>
              </div>
            )
          })}
        </div>

        <div id="apEchos">
          {preview.echos.length > 0 && (
            <div className="mt-[12px] border-t border-t-line pt-[10px]">
              <b className="mb-[8px] block text-[11.5px] uppercase tracking-[.4px] text-dim">
                mots partagés par plusieurs fragments
              </b>
              {preview.echos.map((echo) => (
                <span
                  className="mr-[6px] mb-[6px] inline-block rounded-[6px] border border-warn-line
                             bg-warn-bg px-[8px] py-[3px] text-[12px] text-warn-txt"
                  key={echo.mot}
                >
                  {echo.mot} <i className="text-[10.5px] not-italic text-dim">{echo.sources.join(' · ')}</i>
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

        <div
          className={`mt-[12px] border-t border-t-line pt-[10px] ${
            singleScene ? '' : 'opacity-45'
          }`}
        >
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
              className="min-h-[56px]"
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
