/* Router and provider stack.

   ORDER MATTERS. CharacterProvider must sit inside the Router (it reads and
   writes the query string) and outside everything that calls the API — every
   caller is bound to the claimed character through `useApi`. FaultsProvider
   wraps the pollers, which report into it.

   ROUTES — one per screen, plus distinct routes for the two screens the legacy
   frontend switched by attribute (see app/routes.ts). Screens not migrated yet
   render PendingScreen, which links to the legacy frontend: the URL exists, the
   destination is honest, nothing is lost. */
import { Navigate, Route, Routes } from 'react-router-dom'

import { CharacterProvider, useCharacter } from '../character/CharacterContext'
import { ChromeProvider } from '../chrome/ChromeContext'
import { Shell } from '../chrome/Shell'
import { ComfyStatsProvider } from '../state/ComfyStatsContext'
import { FaultsProvider } from '../state/FaultsContext'
import { SystemStateProvider } from '../state/SystemStateContext'
import { JournalScreen } from '../screens/JournalScreen'
import { PendingScreen } from '../screens/PendingScreen'
import { PATHS } from './routes'

/* The entry gate (J7bis): with no `?character=` the studio opens on the
   registry, not on the production of a default character. A link that names a
   character is honoured, and so is a deep link inside the studio. */
function HomeRedirect() {
  const { isClaimed } = useCharacter()
  return <Navigate to={isClaimed ? PATHS.produce : PATHS.characters} replace />
}

export function App() {
  return (
    <CharacterProvider>
      <FaultsProvider>
        <SystemStateProvider>
          <ComfyStatsProvider>
            <ChromeProvider>
              <Routes>
                <Route element={<Shell />}>
                  <Route path="/" element={<HomeRedirect />} />

                  {/* --- migrated */}
                  <Route path={PATHS.journal} element={<JournalScreen />} />

                  {/* --- still served by the legacy frontend */}
                  <Route
                    path={PATHS.characters}
                    element={<PendingScreen title="Registre des personnages" legacyHash="registre" />}
                  />
                  <Route
                    path={PATHS.character}
                    element={<PendingScreen title="Fiche du personnage" legacyHash="registre" />}
                  />
                  <Route
                    path={PATHS.wizard}
                    element={<PendingScreen title="Nouveau personnage" legacyHash="wizard" />}
                  />
                  <Route
                    path={PATHS.produce}
                    element={<PendingScreen title="Produire" legacyHash="creer" />}
                  />
                  <Route
                    path={`${PATHS.review}/:name?`}
                    element={<PendingScreen title="Revue" legacyHash="trier" />}
                  />
                  <Route
                    path={`${PATHS.gallery}/:name?`}
                    element={<PendingScreen title="Galerie" legacyHash="galerie" />}
                  />
                  <Route
                    path={PATHS.bankScenes}
                    element={<PendingScreen title="Banque de scènes" legacyHash="scenes" />}
                  />
                  <Route
                    path={PATHS.bankPoses}
                    element={<PendingScreen title="Banque de poses" legacyHash="scenes/poses" />}
                  />
                  <Route
                    path={PATHS.application}
                    element={<PendingScreen title="Application" legacyHash="appli" />}
                  />

                  {/* An unknown path is not a screen: it goes back to the entry
                      point rather than leaving a blank studio. */}
                  <Route path="*" element={<HomeRedirect />} />
                </Route>
              </Routes>
            </ChromeProvider>
          </ComfyStatsProvider>
        </SystemStateProvider>
      </FaultsProvider>
    </CharacterProvider>
  )
}
