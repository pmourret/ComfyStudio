/* « Apparence » — the section of the Application screen (Phase 0b, DOCS/
   design-pass/phase-0b-theme-utilisateur.md). Same role in the file as
   `AdultContentSection.tsx` next to it: a small, character-scoped setting
   that lives here because Application is where the platform's own
   capabilities sit, agnostic of the pack (CLAUDE.md §7).

   DRAFT VS SAVED, same split as `/api/expression/preview` vs `/api/
   expression/tone` — every wheel/slider move repaints the WHOLE document
   immediately (draft), and nothing is written to `character.json` until
   Enregistrer. The draft must never survive past this section: switching
   character, or leaving without saving, hands the document straight back to
   what `chrome/useCharacterTheme.ts` (mounted once, in Shell) already shows
   for the character's actually SAVED appearance — never an abandoned drag. */
import { useEffect, useState } from 'react'

import { errorOf, type Schema } from '../api/client'
import { useApi } from '../api/useApi'
import { useCharacter } from '../character/CharacterContext'
import { HueWheel } from '../chrome/theme/HueWheel'
import {
  ACCENT_C, ACCENT_L, DEFAULT_ACCENT_HUE, DEFAULT_NEUTRAL_HUE, DEFAULT_NEUTRAL_INTENSITY,
  NEUTRAL_REFERENCE_C, NEUTRAL_REFERENCE_L, THEME_TOKEN_NAMES, computeThemeTokens, warnNearVerdict,
} from '../chrome/theme/deriveTheme'
import { useToast } from '../chrome/ToastContext'

type AppearanceBrief = Schema<'AppearanceBrief'>

// Same recipe as `screens/produce/SettingsPanel.tsx`'s `SLIDER` — copied
// rather than imported: the two screens share a visual language, not a
// dependency (Produire's settings gear and Application's Apparence panel
// are otherwise unrelated).
const SLIDER =
  'mx-0 my-[2px] h-[4px] w-full appearance-none rounded-[3px] bg-line2 [outline:none] ' +
  '[&::-webkit-slider-thumb]:h-[16px] [&::-webkit-slider-thumb]:w-[16px] ' +
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer ' +
  '[&::-webkit-slider-thumb]:rounded-[50%] [&::-webkit-slider-thumb]:border-2 ' +
  '[&::-webkit-slider-thumb]:border-panel [&::-webkit-slider-thumb]:bg-acc ' +
  '[&::-webkit-slider-thumb]:shadow-[0_1px_4px_#0008] ' +
  '[&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:w-[14px] ' +
  '[&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-[50%] ' +
  '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-panel ' +
  '[&::-moz-range-thumb]:bg-acc'

// Ceiling of the intensity slider (document, "Pourquoi une intensité, pas
// seulement une teinte") — deliberately low, past it risks falling back
// under the WCAG thresholds already validated at Phase 0.
const INTENSITY_MAX = 0.05

export function AppearanceSection() {
  const api = useApi()
  const toast = useToast()
  const { sheet, refreshSheet } = useCharacter()
  const saved = sheet?.appearance

  const [neutralHue, setNeutralHue] = useState(DEFAULT_NEUTRAL_HUE)
  const [neutralIntensity, setNeutralIntensity] = useState(DEFAULT_NEUTRAL_INTENSITY)
  const [accentHue, setAccentHue] = useState(DEFAULT_ACCENT_HUE)
  const [saving, setSaving] = useState(false)

  // The draft follows the saved appearance on mount AND on every character
  // switch — an unsaved drag from character A must never seed character B's
  // wheels.
  useEffect(() => {
    setNeutralHue(saved?.neutral_hue ?? DEFAULT_NEUTRAL_HUE)
    setNeutralIntensity(saved?.neutral_intensity ?? DEFAULT_NEUTRAL_INTENSITY)
    setAccentHue(saved?.accent_hue ?? DEFAULT_ACCENT_HUE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.id])

  // Live preview. `atDefault` mirrors `useCharacterTheme`'s own rule: at the
  // exact platform default, apply NOTHING rather than a computed "chroma
  // zero" approximation of it — see the long comment on that hook for why
  // the two are not byte-identical.
  useEffect(() => {
    const root = document.documentElement
    const atDefault =
      neutralHue === DEFAULT_NEUTRAL_HUE &&
      neutralIntensity === DEFAULT_NEUTRAL_INTENSITY &&
      accentHue === DEFAULT_ACCENT_HUE
    if (atDefault) {
      THEME_TOKEN_NAMES.forEach((name) => root.style.removeProperty(name))
    } else {
      const tokens = computeThemeTokens({ neutralHue, neutralIntensity, accentHue })
      THEME_TOKEN_NAMES.forEach((name) => root.style.setProperty(name, tokens[name]))
    }
    return () => {
      // Unmount, or the saved appearance just changed under us (Enregistrer
      // / Réinitialiser -> refreshSheet): hand back to what the SAVED
      // appearance means, exactly what useCharacterTheme shows everywhere
      // else in the app.
      const savedHue = saved?.neutral_hue ?? DEFAULT_NEUTRAL_HUE
      const savedIntensity = saved?.neutral_intensity ?? DEFAULT_NEUTRAL_INTENSITY
      const savedAccent = saved?.accent_hue ?? DEFAULT_ACCENT_HUE
      if (savedHue === DEFAULT_NEUTRAL_HUE && savedIntensity === DEFAULT_NEUTRAL_INTENSITY && savedAccent === DEFAULT_ACCENT_HUE) {
        THEME_TOKEN_NAMES.forEach((name) => root.style.removeProperty(name))
      } else {
        const tokens = computeThemeTokens({ neutralHue: savedHue, neutralIntensity: savedIntensity, accentHue: savedAccent })
        THEME_TOKEN_NAMES.forEach((name) => root.style.setProperty(name, tokens[name]))
      }
    }
  }, [neutralHue, neutralIntensity, accentHue, saved?.neutral_hue, saved?.neutral_intensity, saved?.accent_hue])

  const hasSaved = saved?.neutral_hue != null || saved?.neutral_intensity != null || saved?.accent_hue != null
  const isDirty =
    neutralHue !== (saved?.neutral_hue ?? DEFAULT_NEUTRAL_HUE) ||
    neutralIntensity !== (saved?.neutral_intensity ?? DEFAULT_NEUTRAL_INTENSITY) ||
    accentHue !== (saved?.accent_hue ?? DEFAULT_ACCENT_HUE)
  const warning = warnNearVerdict(accentHue)

  const save = async (body: Partial<AppearanceBrief>, okMessage: string) => {
    setSaving(true)
    const response = await api.post<AppearanceBrief>('/api/character/appearance', body)
    setSaving(false)
    const failure = errorOf(response)
    if (failure) {
      toast(failure)
      return
    }
    // Re-sync the DRAFT from the server's own answer, not just `refreshSheet()`:
    // the sheet refresh is a separate fetch that lands on its own schedule, and
    // the draft-follows-`sheet.id` effect above does not fire on a same-
    // character save — without this, a stale dragged value could keep painting
    // the document after a successful Enregistrer/Réinitialiser.
    setNeutralHue(response.neutral_hue ?? DEFAULT_NEUTRAL_HUE)
    setNeutralIntensity(response.neutral_intensity ?? DEFAULT_NEUTRAL_INTENSITY)
    setAccentHue(response.accent_hue ?? DEFAULT_ACCENT_HUE)
    toast(okMessage)
    refreshSheet()
  }

  const onSave = () =>
    save({ neutral_hue: neutralHue, neutral_intensity: neutralIntensity, accent_hue: accentHue }, 'apparence enregistrée')
  const onReset = () => save({}, 'apparence réinitialisée')

  return (
    <div id="appearanceBox">
      <p className="tiny mt-[6px] mb-[16px]">
        Teinte du fond (+ intensité) et de l'accent, propres à{' '}
        {sheet?.name || 'ce personnage'} — indépendant du pack. L'aperçu
        s'applique tout de suite ; Enregistrer pour la garder au prochain
        chargement.
      </p>

      <div className="mb-[16px] flex flex-wrap items-start gap-[32px]">
        <div className="flex flex-col items-center gap-[8px]">
          <HueWheel
            label="Teinte du fond"
            value={neutralHue}
            onChange={setNeutralHue}
            trackL={NEUTRAL_REFERENCE_L}
            trackC={NEUTRAL_REFERENCE_C}
          />
          <span className="tiny">Fond — {Math.round(neutralHue)}°</span>
          {/* The ring's own reference chroma (deriveTheme.ts,
              NEUTRAL_REFERENCE_C) is far more saturated than the real
              applied effect ever gets (intensity tops out at 0.05) —
              audited live: at hue 30° the ring shows #ca5747, the real
              --bg at max intensity is #1c0201. Said in words rather than
              toned down, so the wheel stays easy to pick a hue on. */}
          <span className="tiny max-w-[130px] text-center text-dim2">
            l'anneau exagère la teinte pour le choix — l'effet réel reste
            discret, regarde le fond de l'écran
          </span>
        </div>

        <div className="flex flex-col items-center gap-[8px]">
          <HueWheel
            label="Teinte de l'accent"
            value={accentHue}
            onChange={setAccentHue}
            trackL={ACCENT_L}
            trackC={ACCENT_C}
          />
          <span className="tiny">Accent — {Math.round(accentHue)}°</span>
        </div>

        <div className="min-w-[220px] flex-1">
          <label className="f" htmlFor="appearanceIntensity">
            <span>Intensité du fond</span>
          </label>
          <input
            id="appearanceIntensity"
            type="range"
            min={0}
            max={INTENSITY_MAX}
            step={0.001}
            value={neutralIntensity}
            onChange={(event) => setNeutralIntensity(Number(event.target.value))}
            className={SLIDER}
          />
          <span className="tiny">{Math.round((neutralIntensity / INTENSITY_MAX) * 100)} %</span>
        </div>
      </div>

      {warning && (
        <p className="tiny mt-0 mb-[14px] text-warn" role="status" id="appearanceVerdictWarning">
          {warning}
        </p>
      )}

      <div className="mt-[14px] mb-[6px] flex gap-[12px]">
        <button className="btn primary" id="btnAppearanceSave" disabled={saving || !isDirty} onClick={onSave}>
          Enregistrer
        </button>
        <button
          className="btn"
          id="btnAppearanceReset"
          disabled={saving || !hasSaved}
          title={hasSaved ? '' : 'aucune personnalisation à réinitialiser'}
          onClick={onReset}
        >
          Réinitialiser
        </button>
      </div>
    </div>
  )
}
