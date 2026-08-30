/* Journal — the production history of the claimed character.

   FIRST SCREEN MIGRATED, and chosen for it: read-only, one route, one filter,
   and none of the three coupling traps of AUDIT §5.6 touch it. It validates the
   pattern (shell, router, character context, generated types, error surfacing)
   on ground where nothing can be lost.

   ROUTE. It stays a SUB-SCREEN of Application, at /app/journal, with no navbar
   entry of its own — exactly its reachability in the legacy frontend, where it
   had no tab and kept the Application entry lit. */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { errorOf, type Schema } from '../api/client'
import { useApi } from '../api/useApi'
import { useCharacter } from '../character/CharacterContext'
import { useSystemState } from '../state/SystemStateContext'

type JournalResponse = Schema<'JournalResponse'>

/* The backend models a row as a free dict ON PURPOSE — its docstring says so:
   rows are raw CSV records and the column set varies with journal migrations.
   This is therefore the narrow shape the SCREEN reads, declared where it is
   read, not a second copy of a contract the server refuses to freeze. Every
   field is optional because a row written before a migration may lack it. */
type JournalRow = {
  date?: string
  scene?: string
  variante?: string
  format?: string
  seed?: string | number
  score_identite?: string | number
  verdict?: string
  duree_s?: number
}

/* The verdicts the filter offers. Same four entries as the legacy segmented
   control, in the same order; `''` is « everything ». */
const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Tout' },
  { value: 'OK', label: 'OK' },
  { value: 'A_REVOIR', label: 'À revoir' },
  { value: 'REJET', label: 'Rejet' },
]

/** `2026-08-30T14:22:07` -> `08-30 14:22`, as the legacy table showed it. */
const shortDate = (value: string | undefined) => (value || '').replace('T', ' ').slice(5, 16)

export function JournalScreen() {
  const api = useApi()
  const { claimed } = useCharacter()
  const { finishedBatchId } = useSystemState()
  const [rows, setRows] = useState<JournalRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let response: (JournalResponse & { ok?: boolean; erreur?: string }) | null = null
    try {
      response = await api.get<JournalResponse>('/api/journal')
    } catch {
      setError('serveur injoignable')
      setLoading(false)
      return
    }
    /* Malformed response: without this guard `rows.filter` throws below and the
       journal stays empty without a word. Same check the legacy loader made,
       for the same reason. */
    const failure = errorOf(response) || (Array.isArray(response.rows) ? null : 'réponse illisible du serveur')
    setLoading(false)
    if (failure) {
      setError(failure)
      return
    }
    setError(null)
    setRows(response.rows as JournalRow[])
  }, [api])

  /* Reloads on entering the screen, on a character switch — the journal is a
     character's, and switching no longer reloads the page (point 1) — and when a
     batch finishes, which is when new lines appear. */
  useEffect(() => {
    void load()
  }, [load, claimed, finishedBatchId])

  const shown = useMemo(
    () => rows.filter((row) => !filter || row.verdict === filter),
    [rows, filter],
  )

  return (
    <div className="screen" id="journal">
      <div className="wrap">
        <h2>Journal de production</h2>
        <div className="viewsel">
          <div className="seg" id="jFilter" role="group" aria-label="Filtrer par verdict">
            {FILTERS.map((entry) => (
              <button
                key={entry.value || 'tout'}
                className={filter === entry.value ? 'on' : undefined}
                data-f={entry.value}
                aria-pressed={filter === entry.value}
                onClick={() => setFilter(entry.value)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="tiny" id="jInfo">
            {error ? `journal : ${error}` : loading ? 'chargement…' : `${shown.length} ligne(s)`}
          </span>
        </div>

        <table id="jt">
          <thead>
            <tr>
              <th>date</th>
              <th>scène</th>
              <th>format</th>
              <th>seed</th>
              <th>score</th>
              <th>verdict</th>
              <th>durée</th>
            </tr>
          </thead>
          <tbody>
            {shown.length ? (
              shown.map((row, index) => (
                // the CSV carries no id; a row is identified by its rank in the
                // list the server returned, which is stable between two renders
                // of the same response
                <tr key={`${row.date ?? ''}-${index}`}>
                  <td>{shortDate(row.date)}</td>
                  <td>
                    {row.scene || ''}
                    {row.variante ? <span className="tiny"> ({row.variante.slice(0, 28)})</span> : null}
                  </td>
                  <td>{row.format || ''}</td>
                  <td className="num">{row.seed ?? ''}</td>
                  <td className="num">{row.score_identite ?? ''}</td>
                  <td>{row.verdict || ''}</td>
                  <td className="num">{row.duree_s ? `${row.duree_s} s` : ''}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="empty">
                  {error ? 'journal indisponible' : loading ? 'chargement…' : 'aucune ligne'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
