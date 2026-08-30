/* The edit-instruction block of the NSFW tier, with the graph preamble and the
   library of already-used instructions. Ported from `static/create.js`.

   THE PREAMBLE IS SHOWN, NOT DESCRIBED. It used to be summarised by a sentence
   (« la pose et le décor sont déjà protégés ») without ever being displayed: 5 of
   the 16 instructions written after the 24/08 rework still rewrote `same pose`.
   We show the text.

   THE LIBRARY IS THE JOURNAL. It already carries instruction + score: 25 edits
   for 15 distinct instructions, the most frequent one retyped 6 times. We
   propose it back, best identity first.

   THE ALERTS ARE COMPUTED BY THE SERVER (nsfw_batch), not here: the CLI and this
   screen must give the same warning, and there is only one definition of the
   watched vocabulary. */
import { useCallback, useEffect, useState } from 'react'

import { errorOf, type ActionLike, type Schema } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useConfig } from '../../state/ConfigContext'

type Instructions = Schema<'NsfwInstructionsResponse'>

/** One line of the library, as /api/nsfw/instructions returns it. */
type HistoryEntry = { texte: string; identite: number | null; n: number; alertes: string[] }

export function EditStep({
  number,
  instruction,
  onInstruction,
  alerts,
  output,
}: {
  number: number
  instruction: string
  onInstruction: (value: string) => void
  alerts: string[]
  /** The output folder, of THIS character — read from /api/nsfw/state, never
      written as a constant (it read PROD/_NSFW/ for everybody, which has never
      been the real path). */
  output: string
}) {
  const api = useApi()
  const { qc } = useConfig()
  const [preamble, setPreamble] = useState('')
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await api.get<Instructions>('/api/nsfw/instructions')
      if (errorOf(response as ActionLike)) return
      setPreamble(response.preambule ?? '')
      setHistory((response.historique ?? []) as HistoryEntry[])
    } catch {
      /* the block still works without its library: the field is what matters */
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  const dot = (value: number | null) =>
    value == null
      ? 'var(--dim2)'
      : value >= qc.high
        ? 'var(--ok)'
        : value >= qc.ok
          ? 'var(--warn)'
          : 'var(--bad)'

  return (
    <div className="step" id="stepEdit">
      <h2>
        <i className="num">{number}</i> · Instruction d'édition{' '}
        <span className="tiny">— en anglais, court et concret</span>
      </h2>

      <details className="adv preamb">
        <summary>ce que le graphe garantit déjà, sans que tu l'écrives</summary>
        <pre id="preambule">{preamble}</pre>
        <p className="tiny">
          Inutile de le répéter dans l'instruction : elle ne sert qu'à dire{' '}
          <b>ce qui change</b>.
        </p>
      </details>

      <textarea
        id="editInstr"
        placeholder="ex: unbuttoned shirt"
        value={instruction}
        onChange={(event) => onInstruction(event.target.value)}
      />

      <div id="instrAlertes">
        {alerts.map((alert, index) => (
          <div className="alerte" key={index}>
            {alert}
          </div>
        ))}
      </div>

      <p className="tiny" style={{ margin: '6px 0 0' }}>
        La sortie va dans <code id="sortieNsfw">{output || '—'}</code> et n'est jamais
        exportée.
      </p>

      <details className="adv" id="instrBiblio" style={{ marginTop: 14 }}>
        <summary>
          instructions déjà employées{' '}
          <span className="tiny" id="biblioN">
            {history === null
              ? ''
              : history.length
                ? `— ${history.length}, la meilleure identité d'abord`
                : "— aucune pour l'instant"}
          </span>
        </summary>
        <div id="biblioList">
          {history?.length ? (
            history.map((entry, index) => (
              <div
                className="bib"
                key={`${entry.texte}-${index}`}
                data-t={entry.texte}
                title={entry.alertes.join(' · ') || 'aucune alerte'}
                onClick={() => onInstruction(entry.texte)}
              >
                <span className="sc" style={{ color: dot(entry.identite) }}>
                  {entry.identite != null ? entry.identite.toFixed(3) : '—'}
                </span>
                <span className="tx">{entry.texte}</span>
                {entry.alertes.length > 0 && <span className="warn">!</span>}
                <span className="n">{entry.n}×</span>
              </div>
            ))
          ) : (
            <div className="empty">le journal d'édition est vide</div>
          )}
        </div>
      </details>
    </div>
  )
}
