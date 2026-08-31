/* The inspector: everything about ONE scene, and nothing about the others.

   THE FIELDS DID NOT MOVE. This is the former `SceneCard.tsx` — the same
   controls, the same `data-f` names, the same French labels and the same
   incident notes. What changed is where it lives: one panel beside the grid
   instead of twenty stacked forms.

   THE INSPECTOR DOES NOT OWN THE SCENE. It edits a DRAFT, and the draft carries
   the original object (`base`): every key it does not display crosses the save
   untouched — `world` and `origin` among them. See ScenesStoreContext for the
   incident that rule comes from.

   Text fields hold their TEXT, converted only on save — converting on each
   keystroke would erase what is being typed. */
import { useEffect, useRef } from 'react'

import type { Creative } from '../../state/TaxonomyContext'
import { bandOf, textToWardrobe, type SceneDraft } from '../../state/ScenesStoreContext'

const FORMATS = ['4:5', '2:3', '9:16', '1:1']

/* Vocabulary of the walk, for the intention selector. A scene carrying a key
   absent from creative.json KEEPS it: we add it to the list rather than let it
   vanish from the selector — hence from the scene. */
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

export function SceneInspector({
  draft,
  creative,
  poses,
  produced,
  onPatch,
  onRemove,
  onClose,
}: {
  draft: SceneDraft
  creative: Creative | null
  poses: string[]
  produced: number | null
  onPatch: (patch: Partial<SceneDraft>) => void
  onRemove: () => void
  onClose: () => void
}) {
  /* The displayed ceiling is deduced from the outfits, live: it follows the
     wardrobe text as it is typed. */
  const band = bandOf({
    intensity: Number.parseInt(draft.bandLo, 10) || 0,
    wardrobe: textToWardrobe(draft.wardrobe),
  })

  /* Opening a scene puts the cursor in it. Otherwise the click lands in the
     grid and the first keystroke goes nowhere — one clicks, then clicks
     again. */
  const first = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    first.current?.focus()
  }, [draft.uid])

  return (
    <section
      id="sceneInspector"
      aria-label={`Scène ${draft.id}`}
      /* Escape closes the panel and hands the focus back to its card — the same
         gesture as every overlay of the studio, even though this one is a
         column and not a dialog. */
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
      className="rounded-card border border-line bg-panel p-[16px]"
    >
      <div className="mb-[12px] flex items-center gap-[10px]">
        <label className="f m-0 flex-1">
          <span>identifiant — sert de nom de fichier</span>
          <input
            ref={first}
            className="font-semibold"
            data-f="id"
            value={draft.id}
            onChange={(e) => onPatch({ id: e.target.value })}
          />
        </label>
        <button
          className="cursor-pointer self-end border-none bg-transparent text-[18px] text-dim2
                     hover:text-bad focus-visible:outline-2 focus-visible:outline-focus
                     focus-visible:outline-offset-2"
          id="btnSceneRemove"
          aria-label={`Retirer la scène ${draft.id}`}
          title="retirer cette scène"
          onClick={onRemove}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {/* Renaming a produced scene orphans it from its images: the statistics
          and the preview are indexed by id. Said here, where the rename
          happens. */}
      <p className="tiny mt-0 mb-[14px]" id="insProduced">
        {produced
          ? `${produced} image(s) déjà produite(s) — renommer l'identifiant les détache de cette scène.`
          : 'jamais produite'}
      </p>

      <div className="mb-[12px] grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-[12px]">
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

      <div className="mb-[12px] grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-[12px]">
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
            className="w-[88px]"
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
          className="min-h-[78px] resize-y"
          data-f="prompt"
          value={draft.prompt}
          onChange={(e) => onPatch({ prompt: e.target.value })}
        />
      </label>

      <label className="f mt-[10px]">
        <span>
          tenues — une par ligne, préfixée de son niveau (<code>0: a linen shirt
          and jeans</code>) · <b>c'est le niveau le plus haut ici qui fixe
          jusqu'où la scène monte</b>
        </span>
        <textarea
          data-f="wardrobe"
          className="min-h-[52px] resize-y"
          spellCheck={false}
          value={draft.wardrobe}
          onChange={(e) => onPatch({ wardrobe: e.target.value })}
        />
      </label>

      <label className="f mt-[10px]">
        <span>variantes de lumière ou de saison (une par ligne) — jamais une tenue</span>
        <textarea
          className="min-h-[52px] resize-y"
          data-f="variants"
          value={draft.variants}
          onChange={(e) => onPatch({ variants: e.target.value })}
        />
      </label>

      <div className="mt-[10px] mb-[4px] grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] items-start gap-[12px]">
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
        <div hidden={!draft.pose}>
          {draft.pose && (
            <img
              className="block max-w-[120px] rounded-[8px] border border-line2"
              loading="lazy"
              src={`/img/pose?name=${encodeURIComponent(draft.pose)}`}
              alt=""
            />
          )}
        </div>
      </div>
    </section>
  )
}

/* Nothing selected. The panel is not empty — it holds what belongs to the
   DOCUMENT rather than to a scene: the two fragments every prompt of the bank
   carries. They used to sit above the cards, where they were re-read on every
   visit and edited about once a month. */
export function DocumentPane({
  anchor,
  direction,
  count,
  onAnchor,
  onDirection,
}: {
  anchor: string
  direction: string
  count: number
  onAnchor: (value: string) => void
  onDirection: (value: string) => void
}) {
  return (
    <section
      id="bankDocument"
      aria-label="Réglages de la banque"
      className="rounded-card border border-line bg-panel p-[16px]"
    >
      <h2 className="mt-0 mb-[4px]">Réglages de la banque</h2>
      <p className="tiny mt-0 mb-[16px]">
        Ce que les {count} scènes partagent. Ouvre une scène dans la grille pour
        l'éditer.
      </p>

      <label className="f">
        <span>ancre d'identité — ajoutée à toutes les scènes</span>
        <textarea
          id="anchor"
          className="min-h-[64px] resize-y"
          value={anchor}
          onChange={(e) => onAnchor(e.target.value)}
        />
      </label>
      <p className="tiny mt-[6px] mb-[18px]">
        Ne décris jamais le visage dans une scène : le verrou d'identité le
        porte. Ici on ne met que ce qu'il ne transporte pas (cheveux, yeux,
        taches de rousseur).
      </p>

      <label className="f">
        <span>note de direction — ajoutée à la fin de tous les prompts</span>
        <input
          id="direction"
          placeholder="ex : autumn palette, softer light — laisser vide si aucune"
          value={direction}
          onChange={(e) => onDirection(e.target.value)}
        />
      </label>
      <p className="tiny mt-[6px] mb-0">
        Sert à donner une intention de série sans réécrire chaque scène. Se vide
        aussi vite qu'elle se met.
      </p>
    </section>
  )
}
