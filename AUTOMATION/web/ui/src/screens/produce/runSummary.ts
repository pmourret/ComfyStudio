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

   Pure function: it reads, it formats, it decides nothing. */
import { mmss } from '../../chrome/Header'
import type { Creative } from '../../state/TaxonomyContext'
import type { IntensityTier, PlanResponse } from './useProduceState'

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
}): { sumN: string; sumT: string } {
  if (editing) {
    const total = plan?.total ?? 0
    return {
      sumN: total ? `${total} ${total > 1 ? 'images' : 'image'}` : '—',
      sumT: !picked.size
        ? 'coche au moins une image source'
        : !instructionText
          ? "écris l'instruction d'édition"
          : `${total} édition${total > 1 ? 's' : ''} · environ ${mmss(total * 82)}`,
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
