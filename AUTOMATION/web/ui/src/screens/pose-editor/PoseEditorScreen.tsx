/* The dedicated pose editor — `${PATHS.poseEditor}/:name?` for an existing
   pose, or `${PATHS.poseEditor}` with router `state` for a from-scratch one.
   That state (`NewPoseIntent`) is handed off by `NewPoseModal.tsx` — chosen
   template, name, "create a template too" — the modal is the only way in
   for a new pose now (2026-09-02): a bare visit to this route with neither
   a name nor that state has nothing to edit, so it bounces to the bank
   rather than resurrect the old full-screen template picker. */
import { useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'

import { PATHS } from '../../app/routes'
import { useApi } from '../../api/useApi'
import { useToast } from '../../chrome/ToastContext'
import { InfoHint } from '../bank/composer/InfoHint'
import { handlePoseKeyDown, PoseCanvas } from './PoseCanvas'
import { PoseInspector } from './PoseInspector'
import { alignSelection, mirrorBody, mirrorHand, withPointsMoved, type Point } from './poseFrame'
import { ReferenceControls } from './ReferenceControls'
import { UndoRedoButtons } from './UndoRedoButtons'
import { usePoseEditor, type PoseEditorSource } from './usePoseEditor'
import { useReferenceOverlay } from './useReferenceOverlay'
import { useSelection } from './useSelection'
import type { NewPoseIntent } from './NewPoseModal'

export function PoseEditorScreen() {
  const { name } = useParams<{ name?: string }>()
  const location = useLocation()
  const intent = (location.state as NewPoseIntent | null) ?? null

  if (!name && !intent) {
    return <Navigate to={PATHS.bankPoses} replace />
  }
  const source: PoseEditorSource = name
    ? { kind: 'pose', name }
    : { kind: 'preset', nom: intent!.presetName, initialLabel: intent!.label }
  return <PoseEditorInner source={source} createTemplateIntent={!name && (intent?.createTemplate ?? false)} />
}

function PoseEditorInner({
  source, createTemplateIntent = false,
}: {
  source: PoseEditorSource
  createTemplateIntent?: boolean
}) {
  const {
    pose, name, loading, loadError, saving, dirty, update, applyAction, save, saveAsPreset,
    undo, redo, canUndo, canRedo,
  } = usePoseEditor(source)
  const [createTemplate, setCreateTemplate] = useState(createTemplateIntent)
  const { selected, onSelect, onToggleSelect, onSelectMany, clearSelection } = useSelection()
  const [recenterTrigger, setRecenterTrigger] = useState(0)
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set())
  const navigate = useNavigate()
  const toast = useToast()
  const api = useApi()
  const reference = useReferenceOverlay(pose, api)
  const referenceImage = reference.referenceUrl
    ? { url: reference.referenceUrl, opacity: reference.opacity }
    : null

  const setPinnedMany = (keys: string[], value: boolean) => {
    setPinned((prev) => {
      const next = new Set(prev)
      for (const key of keys) {
        if (value) next.add(key)
        else next.delete(key)
      }
      return next
    })
  }

  const onSave = async () => {
    const wasNew = !name
    const result = await save()
    if (!result.ok) {
      toast(result.erreur)
      return
    }
    let message = `squelette enregistré : ${result.name}`
    // "Créer aussi un gabarit" only ever fires on the pose's OWN first save
    // — a template is a one-time snapshot of a shape, not something a later
    // re-save should keep re-creating.
    if (wasNew && createTemplate && pose) {
      const presetResult = await saveAsPreset(pose.label || result.name)
      message = presetResult.ok
        ? `squelette et gabarit enregistrés : ${result.name} / ${presetResult.name}`
        : `squelette enregistré, mais le gabarit a échoué : ${presetResult.erreur}`
      setCreateTemplate(false)
    }
    toast(message)
    if (wasNew) navigate(`${PATHS.poseEditor}/${result.name}`, { replace: true })
  }

  const onSaveAsNew = async () => {
    const result = await save({ asNew: true })
    if (!result.ok) {
      toast(result.erreur)
      return
    }
    toast(`nouvelle pose enregistrée : ${result.name}`)
    navigate(`${PATHS.poseEditor}/${result.name}`)
  }

  if (loading) {
    return (
      <div className="screen" id="poseEditor">
        <div className="wrap">
          <p className="tiny">chargement…</p>
        </div>
      </div>
    )
  }
  if (loadError || !pose) {
    return (
      <div className="screen" id="poseEditor">
        <div className="wrap">
          <Link className="btn sm" to={PATHS.bankPoses}>
            ← Retour à la banque
          </Link>
          <div className="empty mt-[16px] rounded-card border border-line bg-panel px-[16px] py-[28px] text-[13px]">
            {loadError || 'squelette introuvable'}
          </div>
        </div>
      </div>
    )
  }

  const onMirrorBody = (direction: 'rightToLeft' | 'leftToRight') => applyAction(mirrorBody(pose, direction))
  const onMirrorHand = (from: 'handLeft' | 'handRight') => applyAction(mirrorHand(pose, from))
  const onAlign = (axis: 'x' | 'y') => applyAction(alignSelection(pose, selected, axis))
  const onOffset = (origins: ReadonlyMap<string, Point>, dx: number, dy: number) =>
    applyAction(withPointsMoved(pose, origins, dx, dy))

  return (
    <div className="screen" id="poseEditor">
      <div
        className="wrap flex h-[calc(100vh-24px)] w-full max-w-none gap-[16px]"
        /* Elevated Undo/Redo/nudge listener (design-pass screen-6, §A2) —
           replaces PoseCanvas's own removed `<svg onKeyDown>`, not added
           alongside it: this container wraps every canvas AND the inspector,
           so a keydown bubbles here regardless of where focus actually is
           (a joint, or nowhere in particular after clicking Annuler). The
           guard against text-entry targets (NumberField/OffsetField) lives
           inside `handlePoseKeyDown` itself. */
        onKeyDown={(event) =>
          handlePoseKeyDown(event, { pose, selected, pinned, onChange: update, onUndo: undo, onRedo: redo })
        }
      >
        {/* Both close-ups and the full view share the SAME pose/selected —
            dragging a fingertip here and watching it move on the full-body
            canvas is one edit, not a sync between two. Wireframed in
            session (2026-09-02): hands stacked in their own column rather
            than, say, a toggle or an overlay — always visible side by side
            with the view they're a detail OF. */}
        <div className="flex w-[300px] shrink-0 flex-col gap-[16px]">
          <LabeledCanvas
            label="Main gauche"
            headerExtra={
              <button type="button" className="btn sm" onClick={() => onMirrorHand('handRight')}>
                Copier depuis la main droite
              </button>
            }
          >
            <PoseCanvas
              pose={pose}
              onChange={update}
              selected={selected}
              onSelect={onSelect}
              onToggleSelect={onToggleSelect}
              onSelectMany={onSelectMany}
              focus="handLeft"
              referenceImage={referenceImage}
              pinned={pinned}
            />
          </LabeledCanvas>
          <LabeledCanvas
            label="Main droite"
            headerExtra={
              <button type="button" className="btn sm" onClick={() => onMirrorHand('handLeft')}>
                Copier depuis la main gauche
              </button>
            }
          >
            <PoseCanvas
              pose={pose}
              onChange={update}
              selected={selected}
              onSelect={onSelect}
              onToggleSelect={onToggleSelect}
              onSelectMany={onSelectMany}
              focus="handRight"
              referenceImage={referenceImage}
              pinned={pinned}
            />
          </LabeledCanvas>
        </div>
        <LabeledCanvas
          label="Corps complet"
          className="min-w-0"
          headerExtra={
            <ReferenceControls
              referenceUrl={reference.referenceUrl}
              opacity={reference.opacity}
              onOpacityChange={reference.setOpacity}
              onPickFile={reference.setReferenceFile}
              onClearReference={reference.clearReference}
              previewUrl={reference.previewUrl}
              rendering={reference.rendering}
              onRefreshPreview={() => void reference.refreshPreview()}
              onClearPreview={reference.clearPreview}
            />
          }
        >
          <PoseCanvas
            pose={pose}
            onChange={update}
            selected={selected}
            onSelect={onSelect}
            onToggleSelect={onToggleSelect}
            onSelectMany={onSelectMany}
            recenterTrigger={recenterTrigger}
            referenceImage={referenceImage}
            renderPreviewUrl={reference.previewUrl}
            pinned={pinned}
          />
        </LabeledCanvas>
        <aside className="flex min-h-0 w-[320px] shrink-0 flex-col gap-[10px]">
          <Link className="link" to={PATHS.bankPoses}>
            ← Retour à la banque
          </Link>
          <b className="mt-[4px] truncate text-[13px]">
            {pose.label || name || 'Nouvelle pose'}
            <InfoHint
              text="Glisser un joint le déplace ; le choisir dans la liste ci-dessous fonctionne aussi.
                    Flèches pour l'ajuster au pixel près (Maj = pas de 10). Maj+glisser un joint tourne un
                    membre en préservant sa longueur d'os. Ctrl/Cmd+clic ajoute un joint à la sélection,
                    Maj+glisser le fond du canvas sélectionne un rectangle. Ctrl+Z annule, Ctrl+Maj+Z rétablit."
            />
          </b>
          <UndoRedoButtons canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
          <button className="btn primary" disabled={saving} onClick={() => void onSave()}>
            Enregistrer
          </button>
          {name && (
            <button className="btn sm" disabled={saving} onClick={() => void onSaveAsNew()}>
              Enregistrer sous (nouvelle pose)
            </button>
          )}
          {dirty && <p className="tiny" role="status">Modifications non enregistrées</p>}
          <PoseInspector
            pose={pose}
            selected={selected}
            onSelect={onSelect}
            onToggleSelect={onToggleSelect}
            onChange={update}
            pinned={pinned}
            onSetPinned={setPinnedMany}
            onMirrorBody={onMirrorBody}
            onAlign={onAlign}
            onOffset={onOffset}
            onRecenter={() => setRecenterTrigger((t) => t + 1)}
            onClearSelection={clearSelection}
          />
        </aside>
      </div>
    </div>
  )
}

function LabeledCanvas({
  label, className = '', headerExtra, children,
}: {
  label: string
  className?: string
  /** A panel-specific toolbar, on its OWN row below the label — sharing one
      row between a short label and a toolbar (the reference-photo controls,
      which grow once a photo is picked) made "Corps complet" wrap across
      three lines and crowd the label out (audit finding, 2026-09-02). */
  headerExtra?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-[4px] ${className}`}>
      <div className="tiny opacity-70">{label}</div>
      {headerExtra && <div className="flex flex-wrap items-center gap-[8px]">{headerExtra}</div>}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
