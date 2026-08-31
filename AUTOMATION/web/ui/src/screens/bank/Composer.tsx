/* The composer: an intention in French, the local model writes the scenes.
   Ported from the composer half of `static/advanced.js`.

   The intention list comes from creative.json: the composer must not be able to
   invent a parallel taxonomy.

   ADDING SAVES IMMEDIATELY. A scene that exists only in the page is invisible to
   production and lost on reload; the old two-step walk only signalled it with a
   passing toast. */
import { useState } from 'react'

import { errorOf, type Schema } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useToast } from '../../chrome/ToastContext'
import { useScenes, type Scene } from '../../state/ScenesStoreContext'
import { useTaxonomy } from '../../state/TaxonomyContext'

type ComposeResponse = Schema<'ComposeResponse'>

/* A proposal, as the composer returns it: a scene plus the alerts the cleaner
   raised on it. It is reviewed, never written to the bank on its own. */
type Proposal = Scene & { alertes?: string[] }

export function Composer() {
  const api = useApi()
  const toast = useToast()
  const { creative } = useTaxonomy()
  const { addScene, save } = useScenes()
  const [intention, setIntention] = useState('')
  const [target, setTarget] = useState('')
  const [count, setCount] = useState('3')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [adding, setAdding] = useState<number | null>(null)

  const compose = async () => {
    if (!intention.trim()) {
      toast("décris d'abord ce que tu veux")
      return
    }
    setBusy(true)
    setMessage('le modèle rédige… (~20 s)')
    // `intention` is the free French text; `intention_cible` is the imposed key
    const response = await api.post<ComposeResponse>('/api/compose', {
      intention: intention.trim(),
      count,
      intention_cible: target,
    })
    setBusy(false)
    const failure = errorOf(response)
    if (failure) {
      setMessage('')
      toast(failure || 'échec')
      return
    }
    const scenes = (response.scenes ?? []) as Proposal[]
    setProposals(scenes)
    setMessage(`${scenes.length} proposition(s)`)
  }

  const accept = async (index: number) => {
    const proposal = proposals[index]
    setAdding(index)
    addScene(proposal)
    setProposals((current) => current.filter((_, i) => i !== index))
    const result = await save()
    setAdding(null)
    toast(
      result.ok
        ? `${proposal.id} enregistrée dans scenes.json`
        : `${proposal.id} ajoutée mais NON enregistrée — ${result.erreur || 'échec'}`,
    )
  }

  return (
    <div
      className="mb-[22px] rounded-card border border-line2 p-[18px]
                 bg-[linear-gradient(180deg,var(--panel2),var(--panel))]"
    >
      <h2 className="mb-[10px]">
        Décrire une intention · le modèle local écrit les scènes
      </h2>
      <textarea
        className="min-h-[70px]"
        id="intention"
        placeholder="ex : Léna aime passer du temps dans son jardin, elle y bouture ses plantes le matin"
        value={intention}
        onChange={(e) => setIntention(e.target.value)}
      />
      <div className="mt-[12px] grid grid-cols-[repeat(auto-fit,minmax(165px,1fr))] gap-[16px]">
        <label className="f">
          <span>intention imposée (optionnel)</span>
          <select id="cmpCat" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— le modèle choisit —</option>
            {(creative?.intentions ?? []).map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          <span>nombre de scènes</span>
          <input
            id="cmpN"
            type="number"
            min={1}
            max={6}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </label>
        <div className="flex items-end">
          <button className="btn primary" id="btnCompose" disabled={busy} onClick={compose}>
            Proposer des scènes
          </button>
        </div>
        <div className="flex items-end">
          <span className="tiny" id="cmpMsg">
            {message}
          </span>
        </div>
      </div>

      <div id="props">
        {proposals.map((proposal, index) => (
          <div
            className="mt-[10px] rounded-[9px] border border-line2 bg-panel2 p-[13px]"
            key={`${proposal.id}-${index}`}
          >
            <div className="mb-[8px] flex items-center gap-[10px]">
              <b className="text-[14px]">{proposal.id}</b>
              <span className="tiny">
                {proposal.intention || proposal.category} · {proposal.format} · {proposal.count} img
                · niveaux{' '}
                {(Array.isArray(proposal.intensity) ? proposal.intensity : [0, 1]).join('-')}
              </span>
              <div className="flex-1" />
              <button
                className="btn sm"
                data-add={index}
                disabled={adding !== null}
                onClick={() => accept(index)}
              >
                Ajouter et enregistrer
              </button>
              <button
                className="link"
                data-drop={index}
                onClick={() => setProposals((c) => c.filter((_, i) => i !== index))}
              >
                ignorer
              </button>
            </div>
            <div className="mb-[6px] text-[12px] text-dim2">
              {(proposal.tags ?? []).map((tag) => (
                <span className="kbd" key={tag}>
                  {tag}
                </span>
              ))}
              {(proposal.tones ?? []).length > 0 &&
                ` · va bien en ${(proposal.tones ?? []).join(', ')}`}
            </div>
            {Object.entries(proposal.wardrobe ?? {}).map(([level, outfit]) => (
              <div className="text-[12px] text-dim2" key={level}>
                tenue n{level} · {String(outfit)}
              </div>
            ))}
            {(proposal.alertes ?? []).length > 0 && (
              <div className="mt-[6px] text-[12px] text-warn">
                ⚠ à relire — {(proposal.alertes ?? []).join(' · ')}
              </div>
            )}
            <p className="mt-0 mb-[8px] text-[13px] text-dim">{proposal.prompt}</p>
            {(proposal.variants ?? []).length > 0 && (
              <div className="text-[12px] text-dim2">variantes · {(proposal.variants ?? []).join(' | ')}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
