/* A screen that has not been migrated yet.

   The migration goes screen by screen, and each one waits for validation before
   the next starts. Until a screen lands here in React, its route still leads
   somewhere honest: the legacy frontend, served in parallel at /legacy. Nothing
   disappears and nothing becomes unreachable — it says where the screen is and
   takes you there in one click.

   This component disappears with the last migrated screen. */
import { useCharacter } from '../character/CharacterContext'
import { legacyUrl } from '../app/routes'

export function PendingScreen({ title, legacyHash }: { title: string; legacyHash: string }) {
  const { claimed } = useCharacter()
  return (
    <div className="screen">
      <div className="wrap">
        <div className="empty">
          <b>{title}</b>
          <p className="muted">
            Cet écran n'est pas encore porté sur le nouveau frontend. Il reste
            entièrement disponible dans l'ancienne interface.
          </p>
          <p style={{ marginTop: 18 }}>
            <a className="btn" href={legacyUrl(legacyHash, claimed)}>
              Ouvrir dans l'ancienne interface
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
