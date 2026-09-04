/* The two lines of the launch bar: how many images, and why.

   IT IS THE ONLY PLACE THAT SAYS WHY A LAUNCH IS NOT POSSIBLE — the button next
   to it is merely disabled, and a disabled button with no reason reads as a
   breakdown. Each branch below is a reason someone actually hit:

     - no intention, no scene: the two first steps of the screen;
     - a scene added and NOT SAVED. It exists in the bank draft, so in the grid,
       but not in `scenes.json`, which /api/plan reads. Without this line the
       plan came back to zero and the button stayed dead without a word;
     - the tier's own refusal, relayed verbatim (`plan.erreur`);
     - in editing: no source ticked, or no instruction written.

   The duration is an estimate from the character's own measured average
   (`bank.avg_duration`), not a constant: an SDXL pack and a Flux pack do not
   run at the same speed.

   `comfy` (ComfyUI unreachable) and `running` (a batch already in flight)
   are the two branches of `runDisabled` in `ProduceScreen.tsx` this file
   used not to cover (screen-3-produire §B1) — the button went dead with no
   word for either, even though this file claims to be "the only place that
   says why a launch is not possible". Checked LAST, just before the success
   branch: whether Comfy is up matters only once there is something to
   launch — an intention/scene/instruction still missing is the more
   actionable thing to say first.

   Pure function: it reads, it formats, it decides nothing. */
import { mmss } from '../../chrome/Header'
import type { Creative } from '../../state/TaxonomyContext'
import type { IntensityTier, PlanResponse } from './useProduceState'

/** The message for the two operational blockers, shared by both branches —
    `null` when neither applies, so the caller falls through to its own
    success text. */
const operationalBlock = (comfy: boolean, running: boolean): string | null => {
  if (!comfy) return 'ComfyUI est hors ligne — impossible de lancer'
  if (running) return 'un lot est déjà en cours — attends qu\'il se termine ou arrête-le'
  return null
}

export function runSummary({
  editing,
  plan,
  picked,
  instructionText,
  intent,
  selected,
  unsaved,
  quality,
  tone,
  tier,
  bank,
  creative,
  comfy,
  running,
}: {
  editing: boolean
  plan: PlanResponse | null
  picked: Set<string>
  instructionText: string
  intent: string | null
  selected: Set<string>
  unsaved: string[]
  quality: string
  tone: string
  tier: IntensityTier | null
  bank: { avg_duration?: number } | null | undefined
  creative: Creative | null | undefined
  /** Whether ComfyUI answered the last probe — `state.comfy`. */
  comfy: boolean
  /** Whether a batch is already in flight — `state.running` (optimistic). */
  running: boolean
}): { sumN: string; sumT: string } {
  if (editing) {
    const total = plan?.total ?? 0
    const blocked = !picked.size
      ? 'coche au moins une image source'
      : !instructionText
        ? "écris l'instruction d'édition"
        : operationalBlock(comfy, running)
    return {
      sumN: total ? `${total} ${total > 1 ? 'images' : 'image'}` : '—',
      sumT: blocked ?? `${total} édition${total > 1 ? 's' : ''} · environ ${mmss(total * 82)}`,
    }
  }
  if (!intent) return { sumN: '—', sumT: 'choisis une intention' }
  if (!selected.size) return { sumN: '—', sumT: 'sélectionne au moins une scène' }
  /* A scene added but not yet saved exists in the bank draft (so in the grid)
     but NOT in scenes.json, which /api/plan reads. Without this message the
     plan came back to zero and the button stayed disabled without a word. */
  if (unsaved.length)
    return {
      sumN: '—',
      sumT:
        unsaved.join(', ') +
        (unsaved.length > 1 ? ' ne sont pas enregistrées' : " n'est pas enregistrée") +
        ' — écran Banque, bouton Enregistrer',
    }
  if (plan?.erreur) return { sumN: '—', sumT: plan.erreur }
  const total = plan?.total ?? 0
  /* Unlike the branches above, the plan DID resolve here — the count is
     real, only the launch itself is blocked. Blanking it to "—" would throw
     away information the operator already has a right to see. */
  const blocked = operationalBlock(comfy, running)
  if (blocked) return { sumN: total ? `${total} ${total > 1 ? 'images' : 'image'}` : '—', sumT: blocked }
  const unit = quality === 'realisme' ? (bank?.avg_duration ?? 55) : quality === 'rapide' ? 32 : 22
  const toneLabel = (creative?.tones ?? []).find((t) => t.key === tone)
  return {
    sumN: total ? `${total} ${total > 1 ? 'images' : 'image'}` : '—',
    sumT:
      `${selected.size} scène${selected.size > 1 ? 's' : ''} · ` +
      `${tier ? tier.label : ''}${toneLabel ? ` · ${toneLabel.label}` : ''} · ` +
      `environ ${mmss(total * unit)}`,
  }
}
