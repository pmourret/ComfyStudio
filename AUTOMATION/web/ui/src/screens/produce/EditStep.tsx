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
    <div className="mb-[30px]" id="stepEdit">
      <h2 className="flex items-baseline gap-[10px]">
        <i className="not-italic text-acc" data-num>{number}</i> · Instruction d'édition{' '}
        <span className="tiny normal-case tracking-normal">— en anglais, court et concret</span>
      </h2>

      {/* `produce.css` also carried a `details.preamb` rule resetting the top
          margin, border and padding of this fold — it never applied: it had the
          SAME weight as `details.adv` and came BEFORE it in the sheet, so the
          separator won. Measured in the browser; only the bottom margin was ever
          live, and only it survives. */}
      <details className="adv mb-[12px]">
        <summary>ce que le graphe garantit déjà, sans que tu l'écrives</summary>
        <pre
          className="mt-[10px] mb-[6px] rounded-[8px] border border-line bg-panel px-[14px]
                     py-[12px] text-[12px] leading-[1.55] whitespace-pre-wrap text-dim"
          id="preambule"
        >{preamble}</pre>
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

      {/* Instruction alerts: a panel, never a block. */}
      <div className="flex flex-col gap-[6px]" id="instrAlertes">
        {alerts.map((alert, index) => (
          <div
            className="rounded-[8px] border border-warn-line bg-warn-bg px-[12px] py-[9px]
                       text-[12.5px] leading-[1.5] text-warn-txt
                       before:font-bold before:text-warn before:content-['!_']"
            key={index}
          >
            {alert}
          </div>
        ))}
      </div>

      <p className="tiny mt-[6px] mb-0">
        La sortie va dans <code id="sortieNsfw">{output || '—'}</code> et n'est jamais
        exportée.
      </p>

      <details className="adv mt-[14px]!" id="instrBiblio">
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
        <div className="mt-[10px] flex max-h-[280px] flex-col gap-[4px] overflow-auto" id="biblioList">
          {history?.length ? (
            history.map((entry, index) => (
              <div
                className="flex cursor-pointer items-baseline gap-[10px] rounded-[7px] border
                           border-transparent px-[10px] py-[7px]
                           hover:border-line2 hover:bg-panel"
                key={`${entry.texte}-${index}`}
                data-bib
                data-t={entry.texte}
                title={entry.alertes.join(' · ') || 'aucune alerte'}
                onClick={() => onInstruction(entry.texte)}
              >
                <span
                  className="min-w-[42px] flex-none text-[12px] tabular-nums"
                  style={{ color: dot(entry.identite) }}
                >
                  {entry.identite != null ? entry.identite.toFixed(3) : '—'}
                </span>
                <span className="flex-1 truncate text-[12.5px] text-txt">{entry.texte}</span>
                {entry.alertes.length > 0 && (
                  <span className="flex-none font-bold text-warn">!</span>
                )}
                <span className="flex-none text-[11px] text-dim2">{entry.n}×</span>
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
