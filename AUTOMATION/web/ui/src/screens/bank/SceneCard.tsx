/* One scene card. Ported from `renderSceneCards()` in `static/advanced.js`.

   THE CARD DOES NOT OWN THE SCENE. It edits a DRAFT, and the draft carries the
   original object (`base`): every key the card does not display crosses the save
   untouched. See ScenesStoreContext for the incident that rule comes from.

   Text fields hold their TEXT, converted only on save — converting on each
   keystroke would erase what is being typed. */
import type { Creative } from '../../state/TaxonomyContext'
import {
  bandOf,
  textToWardrobe,
  type SceneDraft,
} from '../../state/ScenesStoreContext'

const FORMATS = ['4:5', '2:3', '9:16', '1:1']

/* Vocabulary of the walk, for the card's intention selector. A scene carrying a
   key absent from creative.json KEEPS it: we add it to the list rather than let
   it vanish from the selector — hence from the scene. */
function intentionOptions(creative: Creative | null, current: string) {
  const entries = (creative?.intentions ?? []).map((i) => [i.key, i.label] as [string, string])
  if (current && !entries.some(([key]) => key === current)) entries.push([current, current])
  return entries
}

/* Skeletons of INPUTS/POSE/, served by /api/scenes. A scene pointing at a
   missing skeleton (file moved, renamed) KEEPS it in the list rather than lose
   it in silence — same rule as an out-of-taxonomy intention. */
function poseOptions(poses: string[], current: string) {
  return current && !poses.includes(current) ? [...poses, current] : poses
}

export function SceneCard({
  draft,
  index,
  creative,
  poses,
  produced,
  onPatch,
  onRemove,
}: {
  draft: SceneDraft
  index: number
  creative: Creative | null
  poses: string[]
  produced: boolean
  onPatch: (patch: Partial<SceneDraft>) => void
  onRemove: () => void
}) {
  /* The displayed ceiling is deduced from the outfits, live: it follows the
     wardrobe text as it is typed, without repainting the card. */
  const band = bandOf({
    intensity: Number.parseInt(draft.bandLo, 10) || 0,
    wardrobe: textToWardrobe(draft.wardrobe),
  })

  return (
    <div className="sceneCard" data-k={index}>
      <div className="top">
        <input
          className="id"
          data-f="id"
          value={draft.id}
          onChange={(e) => onPatch({ id: e.target.value })}
        />
        <span className="tiny">{produced ? 'déjà produite' : 'jamais produite'}</span>
        <button className="del" title="supprimer" onClick={onRemove}>
          ×
        </button>
      </div>

      <div className="rowf">
        {/* `category` disappeared on 26/08/2026: it was a duplicate of the
            intention (14 scenes out of 16 identical) that ALSO served as the
            export folder — the 2 divergences filed the images somewhere other
            than under the intention on screen. */}
        <label className="f">
          <span>intention — sert aussi de dossier d'export</span>
          <select
            data-f="intention"
            value={draft.intention}
            onChange={(e) => onPatch({ intention: e.target.value })}
          >
            <option value="">— aucune —</option>
            {intentionOptions(creative, draft.intention).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          <span>format</span>
          <select
            data-f="format"
            value={draft.format}
            onChange={(e) => onPatch({ format: e.target.value })}
          >
            {FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="f">
          <span>images</span>
          <input
            data-f="count"
            type="number"
            min={1}
            value={draft.count}
            onChange={(e) => onPatch({ count: e.target.value })}
          />
        </label>
        <label className="f">
          <span>guidance (option)</span>
          <input
            data-f="guidance"
            type="number"
            step="0.1"
            placeholder="défaut"
            value={draft.guidance}
            onChange={(e) => onPatch({ guidance: e.target.value })}
          />
        </label>
      </div>

      <div className="rowf">
        {/* One number only: the maximum is DEDUCED from the declared outfits.
            The two fields said the same thing, and the outfit was authoritative
            anyway (wardrobe_for takes the highest <= level). */}
        <label className="f">
          <span>
            niveau minimum — jusqu'à <b>{band[1]}</b>, déduit des tenues
          </span>
          <input
            data-f="band_lo"
            type="number"
            min={0}
            max={3}
            style={{ width: 88 }}
            value={draft.bandLo}
            onChange={(e) => onPatch({ bandLo: e.target.value })}
          />
        </label>
        <label className="f">
          <span>tons affins — virgules</span>
          <input
            data-f="tones"
            placeholder={(creative?.tones ?? []).map((t) => t.key).join(', ')}
            value={draft.tones}
            onChange={(e) => onPatch({ tones: e.target.value })}
          />
        </label>
        <label className="f">
          <span>tags — virgules</span>
          <input
            data-f="tags"
            value={draft.tags}
            onChange={(e) => onPatch({ tags: e.target.value })}
          />
        </label>
      </div>

      <label className="f">
        <span>
          prompt de scène — décor, cadrage, lumière. Jamais le visage, jamais la
          tenue.
        </span>
        <textarea
          data-f="prompt"
          value={draft.prompt}
          onChange={(e) => onPatch({ prompt: e.target.value })}
        />
      </label>

      <label className="f" style={{ marginTop: 10 }}>
        <span>
          tenues — une par ligne, préfixée de son niveau (<code>0: a linen shirt
          and jeans</code>) · <b>c'est le niveau le plus haut ici qui fixe
          jusqu'où la scène monte</b>
        </span>
        <textarea
          data-f="wardrobe"
          spellCheck={false}
          style={{ minHeight: 52 }}
          value={draft.wardrobe}
          onChange={(e) => onPatch({ wardrobe: e.target.value })}
        />
      </label>

      <label className="f" style={{ marginTop: 10 }}>
        <span>variantes de lumière ou de saison (une par ligne) — jamais une tenue</span>
        <textarea
          data-f="variants"
          style={{ minHeight: 52 }}
          value={draft.variants}
          onChange={(e) => onPatch({ variants: e.target.value })}
        />
      </label>

      <div className="rowf" style={{ marginTop: 10, alignItems: 'flex-start' }}>
        <label className="f">
          <span>
            pose imposée (option) — ControlNet, cran SFW uniquement
            <br />
            <span className="tiny">
              A/B mesuré : 0 image sous la bande d'identité sur 15. Un squelette
              repose ou de profil peut ne pas être suivi, vérifier le résultat à
              l'œil.
            </span>
          </span>
          <select
            data-f="pose"
            value={draft.pose}
            onChange={(e) => onPatch({ pose: e.target.value })}
          >
            <option value="">— aucune —</option>
            {poseOptions(poses, draft.pose).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="posePrev" hidden={!draft.pose}>
          {draft.pose && (
            <img loading="lazy" src={`/img/pose?name=${encodeURIComponent(draft.pose)}`} alt="" />
          )}
        </div>
      </div>
    </div>
  )
}
