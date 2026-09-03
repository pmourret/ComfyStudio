/* The skeleton editor's own work surface: an SVG rendering of a PoseFrame,
   each joint a draggable circle. No canvas library — react-konva was looked
   at and set aside (studio decision, 2026-09-01): the actual interaction is
   simpler than it sounds. "Rotate a limb" is just moving ONE endpoint while
   the connecting line's OTHER end (the parent joint) stays put — nothing
   here needs a real rotation transform, just redrawing a line between two
   points on every frame.

   DRAG PATTERN copied from PhotoEditor.tsx's crop-handle code (same studio,
   same problem: a pointer's screen-pixel movement has to become a delta in
   the SURFACE's own coordinate space, not the page's). The SVG equivalent of
   PhotoEditor's `displayScale()` is `getScreenCTM().inverse()` — the
   standard way to turn a client (mouse) point into the SVG's own
   `viewBox` units regardless of how large the element is drawn on screen.

   MODIFIER KEYS, one meaning each, chosen to never collide (2026-09-02):
     Shift + drag a JOINT       -> IK-style rotate (preserve bone length)
     Shift + drag the BACKGROUND -> rectangle-select
     Ctrl/Cmd + click a JOINT   -> toggle it in/out of the selection
   Shift already meant two different things depending on target (joint vs
   background) before multi-select existed; Ctrl/Cmd was free and matches
   the OS-standard "toggle one item" convention, so toggling never has to
   guess whether a still Shift+click was a selection gesture or the start of
   an IK drag that just didn't move yet. */
import {
  useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent,
} from 'react'

import {
  BODY_COLORS, BODY_LIMBS, HAND_EDGES, HAND_JOINT_COLOR, handEdgeColor, nameOf, parentIndexOf,
} from './poseTopology'
import {
  parsePointKey, pointKey, withPoint, withPointsMoved,
  type Point, type PointGroup, type PoseFrame,
} from './poseFrame'

const JOINT_RADIUS = 7
const HAND_JOINT_RADIUS = 4
const NUDGE = 1
const NUDGE_FAST = 10
const MIN_SCALE = 1
const MAX_SCALE = 8
const WHEEL_ZOOM_STEP = 1.2
const BUTTON_ZOOM_STEP = 1.4

/** A joint's identity is `pointKey(group, index)` — plain strings rather
    than `{group,index}` objects because a Set needs comparable values, and
    every consumer (pin, multi-select) already keyed by this same string. */
export type Selected = ReadonlySet<string>
type View = { scale: number; x: number; y: number }
type HandGroup = 'handLeft' | 'handRight'
type Rect = { x0: number; y0: number; x1: number; y1: number }

const IDENTITY_VIEW: View = { scale: 1, x: 0, y: 0 }
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/* A11y audit, design-pass screen-6, §A2. Structural type rather than
   `React.KeyboardEvent` or DOM `KeyboardEvent`: the two call sites (this
   component's own circles bubbling a synthetic event, and a screen/modal
   level `<div>`/`Dialog` listener) each carry a different concrete event
   type, and this function only ever touches the members below. */
type PoseKeyEvent = {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  target: EventTarget | null
  preventDefault: () => void
}

/** A text field being typed into — never a joint `<circle>` (never an
    `<input>`/`<textarea>` to begin with) but ALWAYS true for the numeric
    fields (`NumberField`/`OffsetField` in `PoseInspector.tsx`) once the
    listener moves up to the shared container (§A2 below): without this,
    typing "z" there would fire Undo, and the arrow keys would nudge the
    selected JOINTS instead of stepping the focused number input. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'TEXTAREA') return true
  if (target.tagName !== 'INPUT') return false
  const NOT_TEXT = ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color']
  return !NOT_TEXT.includes((target as HTMLInputElement).type)
}

/** Ctrl/Cmd+Z (+Shift for redo), Ctrl/Cmd+Y, and arrow-key nudge of the
    current selection — the canvas's own keyboard contract, extracted to a
    pure function so it can be called from a listener ABOVE this component
    too (design-pass screen-6, §A2: today this only fires while focus stays
    inside the `<svg>`, so Undo/Redo/pin buttons living outside it — then
    Ctrl+Z — do nothing). Elevate the LISTENER, don't duplicate it: wiring
    this at both the `<svg>` and an ancestor would double-fire on every
    keypress made with focus inside the svg (normal DOM bubbling, no
    `stopPropagation` here to prevent it). The text-entry guard lives HERE,
    not at each call site, so neither caller can forget it. */
export function handlePoseKeyDown(
  event: PoseKeyEvent,
  { pose, selected, pinned, onChange, onUndo, onRedo }: {
    pose: PoseFrame
    selected: Selected
    pinned?: ReadonlySet<string>
    onChange: (pose: PoseFrame) => void
    onUndo?: () => void
    onRedo?: () => void
  },
): void {
  if (isTextEntry(event.target)) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) onRedo?.()
    else onUndo?.()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    onRedo?.()
    return
  }
  if (selected.size === 0) return
  const step = event.shiftKey ? NUDGE_FAST : NUDGE
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0], ArrowRight: [step, 0],
    ArrowUp: [0, -step], ArrowDown: [0, step],
  }
  const d = delta[event.key]
  if (!d) return
  event.preventDefault()
  let next = pose
  for (const key of selected) {
    if (pinned?.has(key)) continue
    const { group, index } = parsePointKey(key)
    const p = next[group][index]
    next = withPoint(next, group, index, p.x + d[0], p.y + d[1])
  }
  onChange(next)
}

/** The view that frames one hand's own placed points, padded so they don't
    sit flush against the edge — a hand is a small cluster inside a
    768×1024-ish canvas, `IDENTITY_VIEW` would show it as a speck. Falls
    back to the untouched full canvas when nothing in the hand is placed
    yet (nothing to fit a box around). Pure in `points`/canvas size: calling
    it twice with the same pose gives the same view back, which is what
    lets both the initial mount AND the reset button share this. */
function fitToHand(points: Point[], canvasWidth: number, canvasHeight: number): View {
  const placed = points.filter((p) => p.c > 0)
  if (placed.length === 0) return IDENTITY_VIEW
  const xs = placed.map((p) => p.x)
  const ys = placed.map((p) => p.y)
  const PADDING = 1.4
  const boxW = Math.max(Math.max(...xs) - Math.min(...xs), 1) * PADDING
  const boxH = Math.max(Math.max(...ys) - Math.min(...ys), 1) * PADDING
  const scale = clamp(Math.min(canvasWidth / boxW, canvasHeight / boxH), MIN_SCALE, MAX_SCALE)
  const viewW = canvasWidth / scale
  const viewH = canvasHeight / scale
  return {
    scale,
    x: (Math.min(...xs) + Math.max(...xs)) / 2 - viewW / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2 - viewH / 2,
  }
}

export function PoseCanvas({
  pose,
  onChange,
  selected,
  onSelect,
  onToggleSelect,
  onSelectMany,
  recenterTrigger,
  focus,
  referenceImage,
  renderPreviewUrl,
  pinned,
}: {
  pose: PoseFrame
  onChange: (pose: PoseFrame) => void
  /** Controlled, not local state: the advanced screen's outliner and numeric
      readout both need to READ the selection and WRITE it (click a name in
      the list, select the same joints the canvas has highlighted) — a
      selection the canvas alone knows about can't be shown outside it. */
  selected: Selected
  /** Plain click/drag-start on a joint: replace the selection with just
      this one. */
  onSelect: (group: PointGroup, index: number) => void
  /** Ctrl/Cmd+click a joint: add or remove it without touching the rest —
      does NOT start a drag, a toggle is a pure selection gesture. */
  onToggleSelect: (group: PointGroup, index: number) => void
  /** Shift+drag a rectangle on the background finishes here with every
      enclosed joint's key — unioned into the selection, never replacing
      it. */
  onSelectMany: (keys: string[]) => void
  /** Bump this (e.g. a counter) to recenter the view on the selection's
      bounding box at its current zoom — the "Recentrer" button's own
      trigger. Left `view` itself internal rather than lifting it too: the
      camera is this canvas's own business, callers only ever need to NUDGE
      it toward a point, never own it outright. */
  recenterTrigger?: number
  /** Restricts rendering to ONE hand and starts pre-zoomed to fit it — the
      advanced screen's two close-up panels. Omitted: the ordinary full-body
      + both-hands canvas, unchanged. Every joint still lives in the SAME
      `pose`/`selected`, so dragging a fingertip here and the main canvas
      showing it move are the same edit, not two. */
  focus?: HandGroup
  /** A user-picked photo, drawn BEHIND the skeleton at `x=0 y=0
      width=canvasWidth height=canvasHeight` — the same coordinate space the
      joints live in, so it pans/zooms in lockstep with them instead of
      sitting on top as a separate, misaligned HTML layer. Never uploaded
      anywhere: the caller hands this an object URL from a local File, and
      the whole point of that is that the photo never leaves the browser
      (pose_tools.py's own rule for an extraction source photo — never
      persisted — extended here to "never even sent"). */
  referenceImage?: { url: string; opacity: number } | null
  /** The on-demand `/api/pose/render` PNG — while set, this REPLACES the
      interactive layers (no drag handles drawn, nothing to click) rather
      than sitting on top of them: two skeletons overlaid would just be
      visual noise, and the static render isn't a thing to edit anyway.
      `mixBlendMode: screen` so the render's solid black background (what
      ControlNet actually expects) contributes nothing to the composite —
      only the colored strokes show over `referenceImage` underneath. */
  renderPreviewUrl?: string | null
  /** Joints (`pointKey(group, index)`) that stay put no matter what — a
      drag on one is still selectable (so the numeric panel and the pin
      toggle itself still work) but never actually moves the point, and the
      keyboard nudge skips it too. Screen-only concept, like `selected`:
      the modal doesn't offer pinning, so it never passes this. */
  pinned?: ReadonlySet<string>
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  // Local to this canvas instance, not to `pose` — a drag that edits the
  // frame must not reset the zoom the user just dialed in. Resets only when
  // the whole editor remounts (a fresh source) or via the reset button.
  const [view, setView] = useState<View>(() =>
    focus ? fitToHand(pose[focus], pose.canvasWidth, pose.canvasHeight) : IDENTITY_VIEW,
  )
  // The rectangle currently being dragged out (Shift+background-drag), in
  // SVG user-space — null whenever no rectangle-select gesture is active.
  const [rectSelect, setRectSelect] = useState<Rect | null>(null)

  const toSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return { x: 0, y: 0 }
    const p = svg.createSVGPoint()
    p.x = clientX
    p.y = clientY
    const local = p.matrixTransform(ctm.inverse())
    return { x: local.x, y: local.y }
  }, [])

  /** Zooms by `factor`, keeping `anchor` (SVG user-space) under the same
      screen position — the cursor for wheel zoom, the view's own center for
      the toolbar buttons (anchor omitted). */
  const zoomBy = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      setView((v) => {
        const nextScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
        if (nextScale === v.scale) return v
        const w = pose.canvasWidth / v.scale
        const h = pose.canvasHeight / v.scale
        const pivot = anchor ?? { x: v.x + w / 2, y: v.y + h / 2 }
        const fx = (pivot.x - v.x) / w
        const fy = (pivot.y - v.y) / h
        const nw = pose.canvasWidth / nextScale
        const nh = pose.canvasHeight / nextScale
        return { scale: nextScale, x: pivot.x - fx * nw, y: pivot.y - fy * nh }
      })
    },
    [pose.canvasWidth, pose.canvasHeight],
  )

  // A native listener, not React's onWheel: React attaches wheel handlers as
  // passive by default, so preventDefault() there is silently ignored — the
  // page keeps scrolling underneath while the canvas also zooms. Only a
  // listener added with { passive: false } can actually stop that.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (event: WheelEvent) => {
      event.preventDefault()
      const anchor = toSvgPoint(event.clientX, event.clientY)
      zoomBy(event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP, anchor)
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [toSvgPoint, zoomBy])

  const startPan = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      event.preventDefault()
      const start = toSvgPoint(event.clientX, event.clientY)
      const orig = { x: view.x, y: view.y }
      const move = (e: globalThis.PointerEvent) => {
        const now = toSvgPoint(e.clientX, e.clientY)
        setView((v) => ({ ...v, x: orig.x - (now.x - start.x), y: orig.y - (now.y - start.y) }))
      }
      const stop = () => document.removeEventListener('pointermove', move)
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', stop, { once: true })
    },
    [toSvgPoint, view.x, view.y],
  )

  /** Every placed joint whose (x, y) falls inside `rect` (SVG user-space,
      any two opposite corners) — `focus` restricts this to the same
      layer(s) actually shown, so a rectangle drawn in a hand close-up never
      silently reaches into the other hand or the body. */
  const pointsInRect = useCallback(
    (rect: Rect): string[] => {
      const minX = Math.min(rect.x0, rect.x1)
      const maxX = Math.max(rect.x0, rect.x1)
      const minY = Math.min(rect.y0, rect.y1)
      const maxY = Math.max(rect.y0, rect.y1)
      const hits: string[] = []
      const collect = (group: PointGroup, points: Point[]) => {
        points.forEach((p, i) => {
          if (p.c > 0 && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
            hits.push(pointKey(group, i))
          }
        })
      }
      if (!focus) collect('body', pose.body)
      if (!focus || focus === 'handLeft') collect('handLeft', pose.handLeft)
      if (!focus || focus === 'handRight') collect('handRight', pose.handRight)
      return hits
    },
    [pose, focus],
  )

  const startRectSelect = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      event.preventDefault()
      const start = toSvgPoint(event.clientX, event.clientY)
      setRectSelect({ x0: start.x, y0: start.y, x1: start.x, y1: start.y })
      const move = (e: globalThis.PointerEvent) => {
        const now = toSvgPoint(e.clientX, e.clientY)
        setRectSelect((r) => (r ? { ...r, x1: now.x, y1: now.y } : r))
      }
      const stop = () => {
        document.removeEventListener('pointermove', move)
        setRectSelect((r) => {
          if (r) {
            const hits = pointsInRect(r)
            if (hits.length > 0) onSelectMany(hits)
          }
          return null
        })
      }
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', stop, { once: true })
    },
    [toSvgPoint, pointsInRect, onSelectMany],
  )

  // Background gesture branches on Shift (rectangle-select) vs plain
  // (pan) — a limb line or joint under the cursor is its own target, so
  // this never fires for those (joints also stopPropagation on their own
  // pointerdown).
  const onBackgroundPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (event.target !== event.currentTarget) return
      if (event.shiftKey) startRectSelect(event)
      else startPan(event)
    },
    [startRectSelect, startPan],
  )

  const startDrag = useCallback(
    (group: PointGroup, index: number) => (event: ReactPointerEvent<SVGCircleElement>) => {
      event.preventDefault()
      event.stopPropagation()
      // preventDefault() also cancels the browser's default focus-on-click —
      // focus by hand, or the keyboard nudge below never gets the keydown.
      event.currentTarget.focus()
      const key = pointKey(group, index)

      if (event.ctrlKey || event.metaKey) {
        // A pure selection gesture — no drag, matching the OS convention
        // that Ctrl/Cmd+click toggles membership without also moving
        // whatever you clicked.
        onToggleSelect(group, index)
        return
      }

      // Dragging a joint that is ALREADY part of a multi-selection moves
      // the WHOLE group together; dragging anything else (an unselected
      // joint, or the lone member of a single selection) replaces the
      // selection with just this one, same as before multi-select existed.
      const partOfGroup = selected.has(key) && selected.size > 1
      if (!partOfGroup) onSelect(group, index)
      const movingKeys = partOfGroup ? selected : new Set([key])
      // A pinned joint never moves — dropped from the moving set rather
      // than blocking the whole group, so pinning still protects
      // individual members while the rest of a group drag proceeds.
      const draggableKeys = new Set([...movingKeys].filter((k) => !pinned?.has(k)))
      if (draggableKeys.size === 0) return

      const start = toSvgPoint(event.clientX, event.clientY)
      // Snapshot of each moving point's OWN position at drag start — every
      // move below recomputes from THIS fixed snapshot plus the total
      // delta so far, never incrementally, so re-applying it can't
      // compound.
      const origins = new Map<string, Point>()
      for (const k of draggableKeys) {
        const ref = parsePointKey(k)
        origins.set(k, pose[ref.group][ref.index])
      }
      // IK-style rotation (Shift+drag) only makes sense for a SINGLE joint
      // rotating around ITS OWN parent — a whole group has no single
      // shared parent to preserve a bone length against, so it always
      // free-moves regardless of Shift.
      const single = draggableKeys.size === 1 ? index : null
      const orig = pose[group][index]
      const parentIndex = single !== null ? parentIndexOf(group, index) : null
      const parentPoint = parentIndex !== null ? pose[group][parentIndex] : null
      const boneLength = parentPoint ? Math.hypot(orig.x - parentPoint.x, orig.y - parentPoint.y) : 0

      const move = (e: globalThis.PointerEvent) => {
        const now = toSvgPoint(e.clientX, e.clientY)
        const dx = now.x - start.x
        const dy = now.y - start.y
        // Shift = rotate around the parent instead of moving freely — read
        // live off the move event (not captured at drag start), so
        // pressing/releasing Shift mid-drag switches modes on the spot.
        // "Rotate a limb" from this file's own header comment, made
        // literal: the target point is projected onto the circle of the
        // BONE'S OWN current length around the parent, so the bone can
        // swing but never stretch or shrink.
        if (single !== null && e.shiftKey && parentPoint && boneLength > 0) {
          let nx = orig.x + dx
          let ny = orig.y + dy
          const ddx = nx - parentPoint.x
          const ddy = ny - parentPoint.y
          const dist = Math.hypot(ddx, ddy) || 1
          nx = parentPoint.x + (ddx / dist) * boneLength
          ny = parentPoint.y + (ddy / dist) * boneLength
          onChange(withPoint(pose, group, index, nx, ny))
          return
        }
        onChange(withPointsMoved(pose, origins, dx, dy))
      }
      const stop = () => document.removeEventListener('pointermove', move)
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', stop, { once: true })
    },
    [pose, onChange, onSelect, onToggleSelect, toSvgPoint, pinned, selected],
  )

  // Fires only on an explicit "Recentrer" click (the trigger prop bumping),
  // never on selection simply changing — re-centering the view every time
  // the outliner selection moves would fight anyone panning by hand.
  // Frames the SELECTION's bounding box, one point or many alike.
  useEffect(() => {
    if (recenterTrigger === undefined || selected.size === 0) return
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity
    for (const key of selected) {
      const { group, index } = parsePointKey(key)
      const p = pose[group][index]
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setView((v) => {
      const w = pose.canvasWidth / v.scale
      const h = pose.canvasHeight / v.scale
      return { ...v, x: cx - w / 2, y: cy - h / 2 }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterTrigger])

  /** Keyboard selection of a joint (design-pass screen-6, §A1) — Enter/Space
      = `onSelect` (same semantics as a plain click), Ctrl/Cmd+Enter =
      `onToggleSelect` (same as Ctrl/Cmd+click), mirroring `startDrag`'s own
      curried-by-`(group,index)` shape just above. `preventDefault` on Space:
      a `tabIndex={0}` `<circle>` carries no form-control role, so the
      browser's default is to scroll the page on Space — `touch-none` on the
      svg only governs touch, not this. */
  const onJointKeyDown = useCallback(
    (group: PointGroup, index: number) => (event: React.KeyboardEvent<SVGCircleElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) onToggleSelect(group, index)
      else onSelect(group, index)
    },
    [onSelect, onToggleSelect],
  )

  // A focus canvas has no fixed "rest" position to compare against — the fit
  // itself shifts as the hand's own points move, so the reset button just
  // stays available rather than chasing a moving target to disable against.
  const atRest = !focus && view.scale === MIN_SCALE && view.x === 0 && view.y === 0
  const viewBoxWidth = pose.canvasWidth / view.scale
  const viewBoxHeight = pose.canvasHeight / view.scale
  const resetView = () => setView(focus ? fitToHand(pose[focus], pose.canvasWidth, pose.canvasHeight) : IDENTITY_VIEW)

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${viewBoxWidth} ${viewBoxHeight}`}
        className="h-full w-full touch-none rounded-[8px] bg-black"
        data-canvas={focus ?? 'full'}
        onPointerDown={onBackgroundPointerDown}
        role="application"
        aria-label={
          focus
            ? `Main ${focus === 'handLeft' ? 'gauche' : 'droite'} — glisser un point pour le déplacer, molette pour zoomer`
            : 'Squelette — glisser un joint pour le déplacer, flèches pour l\'ajuster au pixel près, molette pour zoomer, glisser le fond pour déplacer la vue, Maj+glisser le fond pour sélectionner un rectangle'
        }
      >
        {referenceImage && (
          <image
            href={referenceImage.url}
            x={0} y={0} width={pose.canvasWidth} height={pose.canvasHeight}
            preserveAspectRatio="xMidYMid meet"
            opacity={referenceImage.opacity}
          />
        )}
        {renderPreviewUrl ? (
          <image
            href={renderPreviewUrl}
            x={0} y={0} width={pose.canvasWidth} height={pose.canvasHeight}
            style={{ mixBlendMode: 'screen' }}
          />
        ) : (
          <>
            {!focus && (
              <BodyLayer
                points={pose.body} selected={selected} startDrag={startDrag}
                onJointKeyDown={onJointKeyDown} pinned={pinned}
              />
            )}
            {(!focus || focus === 'handLeft') && (
              <HandLayer
                points={pose.handLeft} group="handLeft" selected={selected} startDrag={startDrag}
                onJointKeyDown={onJointKeyDown} pinned={pinned}
              />
            )}
            {(!focus || focus === 'handRight') && (
              <HandLayer
                points={pose.handRight} group="handRight" selected={selected} startDrag={startDrag}
                onJointKeyDown={onJointKeyDown} pinned={pinned}
              />
            )}
          </>
        )}
        {rectSelect && (
          <rect
            x={Math.min(rectSelect.x0, rectSelect.x1)}
            y={Math.min(rectSelect.y0, rectSelect.y1)}
            width={Math.abs(rectSelect.x1 - rectSelect.x0)}
            height={Math.abs(rectSelect.y1 - rectSelect.y0)}
            fill="rgba(255,255,255,0.12)"
            stroke="#fff"
            strokeDasharray="4,3"
          />
        )}
      </svg>
      <div className="absolute right-[8px] top-[8px] flex gap-[4px]">
        <button
          type="button"
          className="btn sm"
          aria-label="Zoom arrière"
          disabled={view.scale <= MIN_SCALE}
          onClick={() => zoomBy(1 / BUTTON_ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className="btn sm"
          aria-label="Réinitialiser le zoom"
          disabled={atRest}
          onClick={resetView}
        >
          {Math.round(view.scale * 100)}%
        </button>
        <button
          type="button"
          className="btn sm"
          aria-label="Zoom avant"
          disabled={view.scale >= MAX_SCALE}
          onClick={() => zoomBy(BUTTON_ZOOM_STEP)}
        >
          +
        </button>
      </div>
    </div>
  )
}

/** Selection: solid white ring. Pinned: dashed amber ring, cursor changes to
    say so — visible on a pinned+selected point too (dashed white), since
    selection already owns the color and pinning only needed the dash. */
function jointDecoration(isSelected: boolean, isPinned: boolean) {
  return {
    stroke: isSelected ? '#fff' : isPinned ? '#e8a33d' : 'none',
    strokeDasharray: isPinned ? '2,2' : undefined,
    className: isPinned ? 'cursor-not-allowed outline-none focus-visible:stroke-white'
      : 'cursor-grab outline-none focus-visible:stroke-white',
  }
}

/** Design-pass screen-6, §A3 — `aria-label` was on the `<svg>` as a whole
    before this, never on an individual joint; nothing named WHICH one a
    screen-reader user had tabbed to. Recomputed on every render rather than
    `aria-live` on the `<circle>`: SVG has no native live region, and a
    position changing every pixel of a drag would be announcement noise
    anyway — the next focus/re-read is the right granularity. */
function jointAriaLabel(group: PointGroup, index: number, point: Point, isPinned: boolean): string {
  const where = point.c > 0 ? `x ${Math.round(point.x)}, y ${Math.round(point.y)}` : 'non placé'
  return `${nameOf(group, index)} — ${where}${isPinned ? ', épinglé' : ''}`
}

function BodyLayer({
  points, selected, startDrag, onJointKeyDown, pinned,
}: {
  points: Point[]
  selected: Selected
  startDrag: (group: PointGroup, index: number) => (event: ReactPointerEvent<SVGCircleElement>) => void
  onJointKeyDown: (group: PointGroup, index: number) => (event: React.KeyboardEvent<SVGCircleElement>) => void
  pinned?: ReadonlySet<string>
}) {
  return (
    <g>
      {BODY_LIMBS.map(([a, b], i) => {
        const pa = points[a]
        const pb = points[b]
        if (!pa || !pb || pa.c <= 0 || pb.c <= 0) return null
        return (
          <line
            key={i}
            x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke={BODY_COLORS[i]} strokeWidth={8} strokeOpacity={0.75} strokeLinecap="round"
          />
        )
      })}
      {points.map((p, i) => {
        const isPinned = Boolean(pinned?.has(pointKey('body', i)))
        const deco = jointDecoration(selected.has(pointKey('body', i)), isPinned)
        return (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={JOINT_RADIUS}
            fill={BODY_COLORS[i]}
            opacity={p.c > 0 ? 1 : 0.35}
            stroke={deco.stroke}
            strokeDasharray={deco.strokeDasharray}
            strokeWidth={2}
            tabIndex={0}
            className={deco.className}
            aria-label={jointAriaLabel('body', i, p, isPinned)}
            onPointerDown={startDrag('body', i)}
            onKeyDown={onJointKeyDown('body', i)}
          />
        )
      })}
    </g>
  )
}

function HandLayer({
  points, group, selected, startDrag, onJointKeyDown, pinned,
}: {
  points: Point[]
  group: 'handLeft' | 'handRight'
  selected: Selected
  startDrag: (group: PointGroup, index: number) => (event: ReactPointerEvent<SVGCircleElement>) => void
  onJointKeyDown: (group: PointGroup, index: number) => (event: React.KeyboardEvent<SVGCircleElement>) => void
  pinned?: ReadonlySet<string>
}) {
  return (
    <g>
      {HAND_EDGES.map(([a, b], i) => {
        const pa = points[a]
        const pb = points[b]
        if (!pa || !pb || pa.c <= 0 || pb.c <= 0) return null
        return (
          <line
            key={i}
            x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke={handEdgeColor(i)} strokeWidth={2.5} strokeLinecap="round"
          />
        )
      })}
      {points.map((p, i) => {
        const isPinned = Boolean(pinned?.has(pointKey(group, i)))
        const deco = jointDecoration(selected.has(pointKey(group, i)), isPinned)
        return (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={HAND_JOINT_RADIUS}
            fill={HAND_JOINT_COLOR}
            opacity={p.c > 0 ? 1 : 0.35}
            stroke={deco.stroke}
            strokeDasharray={deco.strokeDasharray}
            strokeWidth={1.5}
            tabIndex={0}
            className={deco.className}
            aria-label={jointAriaLabel(group, i, p, isPinned)}
            onPointerDown={startDrag(group, i)}
            onKeyDown={onJointKeyDown(group, i)}
          />
        )
      })}
    </g>
  )
}
