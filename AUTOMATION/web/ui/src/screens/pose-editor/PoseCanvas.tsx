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
   `viewBox` units regardless of how large the element is drawn on screen. */
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import {
  BODY_COLORS, BODY_LIMBS, HAND_EDGES, HAND_JOINT_COLOR, handEdgeColor,
} from './poseTopology'
import { withPoint, type Point, type PointGroup, type PoseFrame } from './poseFrame'

const JOINT_RADIUS = 7
const HAND_JOINT_RADIUS = 4
const NUDGE = 1
const NUDGE_FAST = 10

type Selected = { group: PointGroup; index: number } | null

export function PoseCanvas({
  pose,
  onChange,
}: {
  pose: PoseFrame
  onChange: (pose: PoseFrame) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [selected, setSelected] = useState<Selected>(null)

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

  const startDrag = useCallback(
    (group: PointGroup, index: number) => (event: ReactPointerEvent<SVGCircleElement>) => {
      event.preventDefault()
      event.stopPropagation()
      // preventDefault() also cancels the browser's default focus-on-click —
      // focus by hand, or the keyboard nudge below never gets the keydown.
      event.currentTarget.focus()
      setSelected({ group, index })
      const start = toSvgPoint(event.clientX, event.clientY)
      const orig = pose[group][index]
      const move = (e: globalThis.PointerEvent) => {
        const now = toSvgPoint(e.clientX, e.clientY)
        onChange(withPoint(pose, group, index, orig.x + (now.x - start.x), orig.y + (now.y - start.y)))
      }
      const stop = () => document.removeEventListener('pointermove', move)
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', stop, { once: true })
    },
    [pose, onChange, toSvgPoint],
  )

  const onNudge = useCallback(
    (event: React.KeyboardEvent) => {
      if (!selected) return
      const step = event.shiftKey ? NUDGE_FAST : NUDGE
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0],
        ArrowUp: [0, -step], ArrowDown: [0, step],
      }
      const d = delta[event.key]
      if (!d) return
      event.preventDefault()
      const point = pose[selected.group][selected.index]
      onChange(withPoint(pose, selected.group, selected.index, point.x + d[0], point.y + d[1]))
    },
    [pose, selected, onChange],
  )

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${pose.canvasWidth} ${pose.canvasHeight}`}
      className="h-full w-full rounded-[8px] bg-black"
      onKeyDown={onNudge}
      role="application"
      aria-label="Squelette — glisser un joint pour le déplacer, flèches pour l'ajuster au pixel près"
    >
      <BodyLayer points={pose.body} selected={selected} startDrag={startDrag} />
      <HandLayer points={pose.handLeft} group="handLeft" selected={selected} startDrag={startDrag} />
      <HandLayer points={pose.handRight} group="handRight" selected={selected} startDrag={startDrag} />
    </svg>
  )
}

function BodyLayer({
  points, selected, startDrag,
}: {
  points: Point[]
  selected: Selected
  startDrag: (group: PointGroup, index: number) => (event: ReactPointerEvent<SVGCircleElement>) => void
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
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x} cy={p.y} r={JOINT_RADIUS}
          fill={BODY_COLORS[i]}
          opacity={p.c > 0 ? 1 : 0.35}
          stroke={selected?.group === 'body' && selected.index === i ? '#fff' : 'none'}
          strokeWidth={2}
          tabIndex={0}
          className="cursor-grab outline-none focus-visible:stroke-white"
          onPointerDown={startDrag('body', i)}
        />
      ))}
    </g>
  )
}

function HandLayer({
  points, group, selected, startDrag,
}: {
  points: Point[]
  group: 'handLeft' | 'handRight'
  selected: Selected
  startDrag: (group: PointGroup, index: number) => (event: ReactPointerEvent<SVGCircleElement>) => void
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
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x} cy={p.y} r={HAND_JOINT_RADIUS}
          fill={HAND_JOINT_COLOR}
          opacity={p.c > 0 ? 1 : 0.35}
          stroke={selected?.group === group && selected.index === i ? '#fff' : 'none'}
          strokeWidth={1.5}
          tabIndex={0}
          className="cursor-grab outline-none focus-visible:stroke-white"
          onPointerDown={startDrag(group, i)}
        />
      ))}
    </g>
  )
}
