/* Router and provider stack.

   ORDER MATTERS. CharacterProvider must sit inside the Router (it reads and
   writes the query string) and outside everything that calls the API — every
   caller is bound to the claimed character through `useApi`. FaultsProvider
   wraps the pollers, which report into it.

   ROUTES — one per screen, plus distinct routes for the two screens the legacy
   frontend switched by attribute (see app/routes.ts): `#registre[data-vue]`
   became /characters and /character, `#trier[data-metier]` became /review and
   /gallery. */
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
import { ConfigProvider } from '../state/ConfigContext'
import { LightboxProvider } from '../chrome/LightboxContext'
import { BankPosesScreen, BankScenesScreen, BankTonesScreen } from '../screens/bank/BankScreen'
import { ExpressionEditorScreen } from '../screens/expression-editor/ExpressionEditorScreen'
import { PhotoEditorAdvancedScreen } from '../screens/photo-editor-advanced/PhotoEditorAdvancedScreen'
import { PoseEditorScreen } from '../screens/pose-editor/PoseEditorScreen'
import { WorldPlacesScreen } from '../screens/worlds/WorldPlacesScreen'
import { WorldsScreen } from '../screens/worlds/WorldsScreen'
import { GalleryRoute, ReviewRoute } from '../screens/review/ReviewScreen'
import { ProduceScreen } from '../screens/produce/ProduceScreen'
import { ApplicationScreen } from '../screens/ApplicationScreen'
import { CharactersScreen } from '../screens/CharactersScreen'
import { WizardScreen } from '../screens/wizard/WizardScreen'
import { CharacterSheetScreen } from '../screens/CharacterSheetScreen'
import { JournalScreen } from '../screens/JournalScreen'
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
              <ConfigProvider>
              <ScenesStoreProvider>
              <LightboxProvider>
              <Routes>
                <Route element={<Shell />}>
                  <Route path="/" element={<HomeRedirect />} />

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
                  <Route path={PATHS.bankTones} element={<BankTonesScreen />} />
                  {/* :name? absent -> "new pose", starting from a chosen preset
                      (2026-09-02) — same list-then-editor shape as worlds/
                      places just below. */}
                  <Route path={`${PATHS.poseEditor}/:name?`} element={<PoseEditorScreen />} />
                  {/* `:tone` required, no `?` — this editor never creates a
                      tone, only tunes the range of one that already exists;
                      a bare visit falls through to `path="*"` below. */}
                  <Route path={`${PATHS.expressionEditor}/:tone`} element={<ExpressionEditorScreen />} />
                  {/* Design-pass screen-photo-editor.md §7b — `:name`
                      required, `bucket`/`space` as query params (routes.ts's
                      own note on why). */}
                  <Route path={`${PATHS.photoEditorAdvanced}/:name`} element={<PhotoEditorAdvancedScreen />} />
                  {/* ADR-0016: the world registry, and its catalog editor —
                      the id is a route param, like the review/gallery image
                      name below. */}
                  <Route path={PATHS.worlds} element={<WorldsScreen />} />
                  <Route path={`${PATHS.worlds}/:worldId/places`} element={<WorldPlacesScreen />} />
                  {/* The second screen the legacy chrome switched by attribute:
                      `#trier[data-metier]` becomes two routes. `:name?` is the
                      image aimed at (F1.3), the shape `#trier/<nom>` carried. */}
                  <Route path={`${PATHS.review}/:name?`} element={<ReviewRoute />} />
                  <Route path={`${PATHS.gallery}/:name?`} element={<GalleryRoute />} />
                  <Route path={PATHS.produce} element={<ProduceScreen />} />


                  {/* An unknown path is not a screen: it goes back to the entry
                      point rather than leaving a blank studio. */}
                  <Route path="*" element={<HomeRedirect />} />
                </Route>
              </Routes>
              </LightboxProvider>
              </ScenesStoreProvider>
              </ConfigProvider>
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
