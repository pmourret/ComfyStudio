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
import { ConfirmProvider } from '../chrome/ConfirmContext'
import { ToastProvider } from '../chrome/ToastContext'
import { ScenesStoreProvider } from '../state/ScenesStoreContext'
import { ServerLogProvider } from '../state/ServerLogContext'
import { TaxonomyProvider } from '../state/TaxonomyContext'
import { BankPosesScreen, BankScenesScreen } from '../screens/bank/BankScreen'
import { ApplicationScreen } from '../screens/ApplicationScreen'
import { CharactersScreen } from '../screens/CharactersScreen'
import { WizardScreen } from '../screens/WizardScreen'
import { CharacterSheetScreen } from '../screens/CharacterSheetScreen'
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
              {/* Toast and Confirm are chrome surfaces every screen may reach
                  for; ServerLog outlives the Application screen it belongs to,
                  so lines survive navigating away and back — as they did when
                  screens stayed in the DOM. */}
              <ToastProvider>
              <ConfirmProvider>
              <ServerLogProvider>
              <TaxonomyProvider>
              <ScenesStoreProvider>
              <Routes>
                <Route element={<Shell />}>
                  <Route path="/" element={<HomeRedirect />} />

                  {/* --- migrated */}
                  <Route path={PATHS.journal} element={<JournalScreen />} />
                  {/* The two halves of the legacy `#registre`, switched by a
                      `data-vue` attribute, are two routes now. */}
                  <Route path={PATHS.characters} element={<CharactersScreen />} />
                  <Route path={PATHS.character} element={<CharacterSheetScreen />} />
                  <Route path={PATHS.application} element={<ApplicationScreen />} />
                  <Route path={PATHS.wizard} element={<WizardScreen />} />
                  {/* `#scenes` and `#scenes/poses` become two routes: the slash
                      always meant « sub-view of », and now the router says it. */}
                  <Route path={PATHS.bankScenes} element={<BankScenesScreen />} />
                  <Route path={PATHS.bankPoses} element={<BankPosesScreen />} />

                  {/* --- still served by the legacy frontend */}
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

                  {/* An unknown path is not a screen: it goes back to the entry
                      point rather than leaving a blank studio. */}
                  <Route path="*" element={<HomeRedirect />} />
                </Route>
              </Routes>
              </ScenesStoreProvider>
              </TaxonomyProvider>
              </ServerLogProvider>
              </ConfirmProvider>
              </ToastProvider>
            </ChromeProvider>
          </ComfyStatsProvider>
        </SystemStateProvider>
      </FaultsProvider>
    </CharacterProvider>
  )
}
