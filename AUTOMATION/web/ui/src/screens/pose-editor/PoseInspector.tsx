/* The advanced screen's sidebar companion to PoseCanvas: numeric readout of
   the selection, plus an outliner listing all 60 by name — a joint at 4px
   radius on a hand is a small target even zoomed in, a named row in a list
   never is. Screen-only (not the modal): needs real width, and the modal's
   whole point is staying a fast, minimal in-context tweak. */
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

import { InfoHint } from '../bank/composer/InfoHint'
import {
  angleAndLength, BODY_JOINT_GROUPS, BODY_JOINT_NAMES, HAND_JOINT_GROUPS, HAND_JOINT_NAMES,
  nameOf, parentIndexOf, type JointGroup,
} from './poseTopology'
import { parsePointKey, pointKey, withPoint, type Point, type PointGroup, type PoseFrame } from './poseFrame'
import type { Selected } from './PoseCanvas'

/** Where an unplaced joint (`c<=0`, sitting at the flat-decode default of
    (0,0) — see poseFrame.ts's `flatToPoints`) lands the moment someone
    asks to place it. A fixed diagonal offset from the parent, not
    anything anatomical: the point is about to be dragged into its real
    spot anyway, this only needs to land it somewhere visible and not
    exactly on top of its parent (or of ANOTHER unplaced sibling — several
    at once all default to the same (0,0), which is exactly the "stuck in
    a corner, unreachable by click" problem this exists to fix). Root
    joints (no parent) fall back to the canvas center. */
function defaultPlacement(pose: PoseFrame, parentPoint: Point | null): { x: number; y: number } {
  if (parentPoint) return { x: parentPoint.x + 40, y: parentPoint.y - 40 }
  return { x: pose.canvasWidth / 2, y: pose.canvasHeight / 2 }
}

export function PoseInspector({
  pose,
  selected,
  onSelect,
  onToggleSelect,
  onChange,
  onRecenter,
  onClearSelection,
  pinned,
  onSetPinned,
  onMirrorBody,
  onAlign,
  onOffset,
}: {
  pose: PoseFrame
  selected: Selected
  onSelect: (group: PointGroup, index: number) => void
  onToggleSelect: (group: PointGroup, index: number) => void
  onChange: (pose: PoseFrame) => void
  onRecenter: () => void
  onClearSelection: () => void
  pinned: ReadonlySet<string>
  /** Pins or unpins every key in one call — the "épingler tout" button on a
      multi-selection, and the single-joint toggle alike (a selection of
      one is just the same call with a one-element array). */
  onSetPinned: (keys: string[], value: boolean) => void
  onMirrorBody: (direction: 'rightToLeft' | 'leftToRight') => void
  /** Snaps every placed point in the CURRENT selection to their shared mean
      on one axis (design-pass screen-6, §B2) — the other axis untouched. */
  onAlign: (axis: 'x' | 'y') => void
  /** Moves every point in `origins` by (dx, dy) as ONE history step
      (design-pass screen-6, §B3) — `origins` is the caller's own snapshot
      (captured on the offset field's focus, see `OffsetField` below), not
      re-read from `pose` here: by the time this fires, `pose` may already
      reflect an EARLIER offset from the same gesture pair (dx committed,
      then dy). */
  onOffset: (origins: ReadonlyMap<string, Point>, dx: number, dy: number) => void
}) {
  const selectedKeys = [...selected]
  const single = selectedKeys.length === 1 ? parsePointKey(selectedKeys[0]) : null
  const point = single ? pose[single.group][single.index] : null
  const parentIndex = single ? parentIndexOf(single.group, single.index) : null
  const parentPoint = single && parentIndex !== null ? pose[single.group][parentIndex] : null
  const allPinned = selectedKeys.length > 0 && selectedKeys.every((k) => pinned.has(k))
  // §B3's origin snapshot — a ref, not state: capturing it is a side effect
  // of focusing a field, not something that should itself trigger a
  // render. Re-captured on EVERY focus (not once per selection) so a
  // dx-then-dy pair composes: dy's origins are whatever the group's
  // position actually is by the time dy gains focus, dx's own commit
  // included.
  const offsetOrigins = useRef<Map<string, Point>>(new Map())
  const captureOffsetOrigins = () => {
    const snapshot = new Map<string, Point>()
    for (const key of selectedKeys) {
      const { group, index } = parsePointKey(key)
      const p = pose[group][index]
      if (p.c > 0) snapshot.set(key, p)
    }
    offsetOrigins.current = snapshot
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[10px]">
      <div className="flex gap-[4px]">
        <button type="button" className="btn sm flex-1" disabled={selected.size === 0} onClick={onRecenter}>
          Recentrer sur la sélection
        </button>
        {selected.size > 0 && (
          <button type="button" className="btn sm" onClick={onClearSelection}>
            Désélectionner
          </button>
        )}
      </div>

      <div>
        <div className="tiny mb-[4px] opacity-70">Symétrie corps</div>
        <div className="flex items-center gap-[4px]">
          <button type="button" className="btn sm flex-1" onClick={() => onMirrorBody('rightToLeft')}>
            Droite → gauche
          </button>
          <button type="button" className="btn sm flex-1" onClick={() => onMirrorBody('leftToRight')}>
            Gauche → droite
          </button>
        </div>
      </div>

      {selectedKeys.length > 1 && (
        <div>
          <div className="tiny mb-[4px] opacity-70">Alignement</div>
          <div className="flex items-center gap-[4px]">
            <button type="button" className="btn sm flex-1" onClick={() => onAlign('x')}>
              Aligner X
            </button>
            <button type="button" className="btn sm flex-1" onClick={() => onAlign('y')}>
              Aligner Y
            </button>
          </div>
        </div>
      )}

      {single && point ? (
        <div className="rounded-card border border-line2 bg-panel2 p-[10px]">
          <div className="flex items-center justify-between gap-[8px]">
            <b className="text-[13px]">{nameOf(single.group, single.index)}</b>
            <button
              type="button"
              className="btn sm"
              aria-pressed={allPinned}
              onClick={() => onSetPinned(selectedKeys, !allPinned)}
            >
              {allPinned ? 'Libérer' : 'Épingler'}
            </button>
          </div>
          {point.c > 0 ? (
            <>
              <div className="mt-[8px] flex gap-[8px]">
                <NumberField
                  label="x"
                  value={point.x}
                  onCommit={(x) => onChange(withPoint(pose, single.group, single.index, x, point.y))}
                />
                <NumberField
                  label="y"
                  value={point.y}
                  onCommit={(y) => onChange(withPoint(pose, single.group, single.index, point.x, y))}
                />
              </div>
              {parentPoint ? (
                <p className="tiny mt-[8px]">
                  {angleAndLength(parentPoint, point)} — depuis « {nameOf(single.group, parentIndex!)} »
                  <InfoHint text="Glisser ce joint en tenant Maj préserve cette longueur d'os (rotation façon IK) plutôt que de l'étirer librement." />
                </p>
              ) : (
                <p className="tiny mt-[8px]">racine — aucun os parent à mesurer</p>
              )}
            </>
          ) : (
            <div className="mt-[8px]">
              <p className="tiny">
                Pas encore placé — le gabarit ou la photo source ne le couvrait pas.
              </p>
              <button
                type="button"
                className="btn sm mt-[6px] w-full"
                onClick={() => {
                  // A low-confidence extraction often still carries a real
                  // (x, y) guess — c<=0 just means "not sure", not "no
                  // idea". Promoting that guess (keep x/y, mark placed)
                  // beats overwriting it with a generic offset. Only a
                  // point that never had ANY data lands exactly at (0, 0)
                  // (poseFrame.ts's flatToPoints default) — that's the one
                  // case worth a computed position instead.
                  const target = point.x === 0 && point.y === 0
                    ? defaultPlacement(pose, parentPoint)
                    : { x: point.x, y: point.y }
                  onChange(withPoint(pose, single.group, single.index, target.x, target.y))
                  onRecenter()
                }}
              >
                Placer ce point
              </button>
            </div>
          )}
        </div>
      ) : selectedKeys.length > 1 ? (
        <div className="rounded-card border border-line2 bg-panel2 p-[10px]">
          <div className="flex items-center justify-between gap-[8px]">
            <b className="text-[13px]">
              {selectedKeys.length} points sélectionnés
              <InfoHint text="Glisser l'un des points déplace tout le groupe ensemble, forme relative conservée." />
            </b>
            <button
              type="button"
              className="btn sm"
              aria-pressed={allPinned}
              onClick={() => onSetPinned(selectedKeys, !allPinned)}
            >
              {allPinned ? 'Libérer tout' : 'Épingler tout'}
            </button>
          </div>
          <div className="mt-[8px] flex gap-[8px]">
            <OffsetField
              label="dx"
              onFocus={captureOffsetOrigins}
              onCommit={(dx) => onOffset(offsetOrigins.current, dx, 0)}
            />
            <OffsetField
              label="dy"
              onFocus={captureOffsetOrigins}
              onCommit={(dy) => onOffset(offsetOrigins.current, 0, dy)}
            />
          </div>
        </div>
      ) : (
        <p className="tiny">aucun joint sélectionné</p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <JointList title="Corps" group="body" names={BODY_JOINT_NAMES} groups={BODY_JOINT_GROUPS}
                   points={pose.body} selected={selected} onSelect={onSelect} onToggleSelect={onToggleSelect}
                   pinned={pinned} />
        <JointList title="Main gauche" group="handLeft" names={HAND_JOINT_NAMES} groups={HAND_JOINT_GROUPS}
                   points={pose.handLeft} selected={selected} onSelect={onSelect} onToggleSelect={onToggleSelect}
                   pinned={pinned} />
        <JointList title="Main droite" group="handRight" names={HAND_JOINT_NAMES} groups={HAND_JOINT_GROUPS}
                   points={pose.handRight} selected={selected} onSelect={onSelect} onToggleSelect={onToggleSelect}
                   pinned={pinned} />
      </div>
    </div>
  )
}

/** A plain controlled `<input type="number">` bound straight to `value`
    fights the user the moment they type a bare "-" or clear the field —
    `Number("-")` is NaN, so skipping onCommit for it is right, but then the
    prop hasn't changed and the input would otherwise snap back to the last
    committed digit on every keystroke. Local text state absorbs the
    in-progress typing; the prop only overwrites it when `value` itself
    actually changes (a drag on the canvas, an undo, a fresh selection). */
function NumberField({
  label, value, onCommit,
}: {
  label: string
  value: number
  onCommit: (next: number) => void
}) {
  const [text, setText] = useState(String(Math.round(value)))

  useEffect(() => {
    setText(String(Math.round(value)))
  }, [value])

  return (
    <label className="f flex-1">
      <span>{label}</span>
      <input
        type="number"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          const parsed = Number(event.target.value)
          if (event.target.value.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed)
        }}
      />
    </label>
  )
}

/** A discrete offset, not a live preview (design-pass screen-6, §B3) —
    unlike `NumberField` above, this never commits per keystroke: `NumberField`'s
    `useEffect(() => setText(...), [value])` only resynchronizes when its
    `value` PROP changes, which never happens here (this field always means
    "how much MORE to move from here", not a joint's own coordinate) — so
    nothing would ever reset the displayed text back to `0` after a commit
    if this reused that component as-is. Commits on Enter or blur, then
    resets itself to `'0'` — a plain local reset, no prop round-trip needed
    since there is no `value` to diverge from. `onFocus` lets the CALLER
    (this field never reads `pose`) snapshot the group's current position
    the moment the user starts typing, not once per selection — so a
    dx-then-dy pair composes onto the position dx already moved to. */
function OffsetField({
  label, onFocus, onCommit,
}: {
  label: string
  onFocus: () => void
  onCommit: (delta: number) => void
}) {
  const [text, setText] = useState('0')

  const commit = () => {
    const parsed = Number(text)
    if (text.trim() !== '' && Number.isFinite(parsed) && parsed !== 0) onCommit(parsed)
    setText('0')
  }

  return (
    <label className="f flex-1">
      <span>{label}</span>
      <input
        type="number"
        value={text}
        onFocus={onFocus}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          commit()
        }}
      />
    </label>
  )
}

/** Groups owning at least one currently selected joint start expanded —
    landing a click on the canvas, or Ctrl+Z stepping back into a hand, must
    not leave the outliner hiding the very joint(s) it's now showing
    selected elsewhere. Collapsing one back by hand afterward is still a
    full override: this only ever ADDS to `expanded`, a re-render from an
    unrelated prop change never closes what the user opened. */
function useExpandedGroups(selected: Selected, group: PointGroup, groups: readonly JointGroup[]) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    const ownersToOpen = [...selected]
      .map(parsePointKey)
      .filter((ref) => ref.group === group)
      .map((ref) => groups.find((g) => g.indices.includes(ref.index))?.label)
      .filter((label): label is string => Boolean(label) && !expanded.has(label!))
    if (ownersToOpen.length === 0) return
    setExpanded((prev) => new Set([...prev, ...ownersToOpen]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, group, groups])
  const toggle = (label: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  return { expanded, toggle }
}

function JointList({
  title, group, names, groups, points, selected, onSelect, onToggleSelect, pinned,
}: {
  title: string
  group: PointGroup
  names: readonly string[]
  groups: readonly JointGroup[]
  points: Point[]
  selected: Selected
  onSelect: (group: PointGroup, index: number) => void
  onToggleSelect: (group: PointGroup, index: number) => void
  pinned: ReadonlySet<string>
}) {
  const { expanded, toggle } = useExpandedGroups(selected, group, groups)

  const clickRow = (index: number) => (event: ReactMouseEvent) => {
    if (event.ctrlKey || event.metaKey) onToggleSelect(group, index)
    else onSelect(group, index)
  }

  return (
    <div className="mb-[10px]">
      <div className="tiny mb-[4px] opacity-70">{title}</div>
      <div className="flex flex-col gap-[2px]">
        {groups.map((g) => {
          const placedCount = g.indices.filter((i) => (points[i]?.c ?? 0) > 0).length
          // A single-joint "group" (body's neck, a hand's wrist) is just
          // that joint — a header collapsing exactly one row underneath
          // would be an extra click for nothing.
          if (g.indices.length === 1) {
            const index = g.indices[0]
            return (
              <JointRow
                key={g.label}
                label={names[index]}
                isSelected={selected.has(pointKey(group, index))}
                placed={placedCount > 0}
                isPinned={pinned.has(pointKey(group, index))}
                onClick={clickRow(index)}
              />
            )
          }
          const isOpen = expanded.has(g.label)
          return (
            <div key={g.label}>
              <button
                type="button"
                aria-expanded={isOpen}
                className="btn sm flex w-full items-center justify-between"
                onClick={() => toggle(g.label)}
              >
                <span>{isOpen ? '▾' : '▸'} {g.label}</span>
                <span className="tiny opacity-70">{placedCount}/{g.indices.length}</span>
              </button>
              {isOpen && (
                <div className="ml-[14px] mt-[2px] flex flex-col gap-[2px]">
                  {g.indices.map((index) => (
                    <JointRow
                      key={index}
                      label={names[index]}
                      isSelected={selected.has(pointKey(group, index))}
                      placed={(points[index]?.c ?? 0) > 0}
                      isPinned={pinned.has(pointKey(group, index))}
                      onClick={clickRow(index)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function JointRow({
  label, isSelected, placed, isPinned, onClick,
}: {
  label: string
  isSelected: boolean
  placed: boolean
  isPinned: boolean
  onClick: (event: ReactMouseEvent) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={`${label}${isPinned ? ', épinglé' : ''}${isSelected ? ', sélectionné' : ''}`}
      className={`btn sm justify-start ${isSelected ? 'border-acc bg-panel2' : 'border-line2'}`}
      style={{ opacity: placed ? 1 : 0.45 }}
      onClick={onClick}
    >
      {isPinned && <span aria-hidden="true">📌 </span>}
      {label}
    </button>
  )
}
