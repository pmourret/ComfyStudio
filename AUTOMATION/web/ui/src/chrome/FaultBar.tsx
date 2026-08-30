/* The banner that says the server did not return what was needed.

   Without it, a failure on /api/scenes or /api/creative left the Produire screen
   entirely empty — no intent, no scene, no slider — and not a word. An empty
   screen that does not explain itself costs more than a displayed error
   (.claude/rules/frontend.md).

   The « relance run_web.bat » advice only holds for an /api/* probe returning
   malformed data (a server running behind the code on disk) — not for a
   production error or an unreadable list, where it would mislead. */
import { useFaults } from '../state/FaultsContext'

export function FaultBar() {
  const { faults } = useFaults()
  const entries = Object.entries(faults)
  if (!entries.length) return null

  const stale = entries.some(([source]) => source === 'sonde')
  const text =
    entries.map(([source, detail]) => `${source} : ${detail}`).join(' · ') +
    (stale
      ? " — si le serveur tourne depuis avant une modification du projet, relance run_web.bat"
      : '')

  return (
    <div id="panneBar" role="status">
      <b>Le tableau de bord ne peut pas charger</b>
      <span id="panneTxt">{text}</span>
      <div className="spacer" style={{ flex: 1 }} />
      <button className="btn sm" id="btnRecharger" onClick={() => location.reload()}>
        Réessayer
      </button>
    </div>
  )
}
