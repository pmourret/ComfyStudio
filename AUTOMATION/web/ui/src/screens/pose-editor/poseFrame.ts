/* The wire shape (what pose_tools.py reads/writes — a plain OpenPose frame,
   flat `[x, y, c, x, y, c, ...]` arrays) is awkward to edit point-by-point
   in React state. `PoseFrame` is the editor's own shape — an array of
   `{x, y, c}` per group — and these two functions are the ONLY place the
   conversion happens, at the load/save boundary. */

export type Point = { x: number; y: number; c: number }

export type PoseFrame = {
  body: Point[]       // 18
  handLeft: Point[]   // 21
  handRight: Point[]  // 21
  canvasWidth: number
  canvasHeight: number
  source: 'preset' | 'extraction'
  label: string | null
  createdAt: string | null
}

/* The raw shape a `GET /api/pose/keypoints` or `/api/pose/preset` response
   carries — one frame, `people[0]`, never the OpenPose batch/multi-person
   generality this studio does not use. */
export type RawPoseFrame = {
  people: Array<{
    pose_keypoints_2d?: number[]
    hand_left_keypoints_2d?: number[]
    hand_right_keypoints_2d?: number[]
    face_keypoints_2d?: number[]
  }>
  canvas_width: number
  canvas_height: number
  source?: string
  label?: string | null
  created_at?: string | null
}

function flatToPoints(flat: number[] | undefined, count: number): Point[] {
  const out: Point[] = []
  for (let i = 0; i < count; i++) {
    if (flat && flat.length >= (i + 1) * 3) {
      out.push({ x: flat[i * 3], y: flat[i * 3 + 1], c: flat[i * 3 + 2] })
    } else {
      out.push({ x: 0, y: 0, c: 0 })
    }
  }
  return out
}

function pointsToFlat(points: Point[]): number[] {
  return points.flatMap((p) => [p.x, p.y, p.c])
}

export function frameToEditable(raw: RawPoseFrame): PoseFrame {
  const person = raw.people[0] ?? {}
  return {
    body: flatToPoints(person.pose_keypoints_2d, 18),
    handLeft: flatToPoints(person.hand_left_keypoints_2d, 21),
    handRight: flatToPoints(person.hand_right_keypoints_2d, 21),
    canvasWidth: raw.canvas_width,
    canvasHeight: raw.canvas_height,
    source: raw.source === 'extraction' ? 'extraction' : 'preset',
    label: raw.label ?? null,
    createdAt: raw.created_at ?? null,
  }
}

export function editableToFrame(pose: PoseFrame): RawPoseFrame {
  return {
    people: [{
      pose_keypoints_2d: pointsToFlat(pose.body),
      hand_left_keypoints_2d: pointsToFlat(pose.handLeft),
      hand_right_keypoints_2d: pointsToFlat(pose.handRight),
      face_keypoints_2d: [],
    }],
    canvas_width: pose.canvasWidth,
    canvas_height: pose.canvasHeight,
    source: pose.source,
    label: pose.label,
    created_at: pose.createdAt,
  }
}

export type PointGroup = 'body' | 'handLeft' | 'handRight'

/** A new `PoseFrame` with exactly one point moved — everything else shared,
    not cloned, so callers that skip re-rendering on an unrelated group are
    still correct. Placing a point (drag or nudge) always marks it detected
    (`c: 1`): the user is now deliberately saying where it is. */
export function withPoint(pose: PoseFrame, group: PointGroup, index: number, x: number, y: number): PoseFrame {
  const points = pose[group].slice()
  points[index] = { x, y, c: 1 }
  return { ...pose, [group]: points }
}

/** One joint's identity as a plain string — the shape a `Set` (pinned
    joints) or a `Record` key needs, since `Selected` itself isn't
    comparable across renders. Not saved anywhere: pinning is an editing
    convenience, never part of the PoseFrame that reaches the server. */
export function pointKey(group: PointGroup, index: number): string {
  return `${group}:${index}`
}

/** The inverse of `pointKey` — every caller that needs to walk a `Set` of
    keys back into (group, index) pairs (multi-selection: group-drag,
    group-nudge, group-pin) goes through this ONE place rather than
    re-deriving the split/parse by hand at each call site. */
export function parsePointKey(key: string): { group: PointGroup; index: number } {
  const [group, indexText] = key.split(':')
  return { group: group as PointGroup, index: Number(indexText) }
}

/** Moves every point in `origins` (its OWN key -> its position AT DRAG
    START) by the SAME (dx, dy) — a rigid group translation, so dragging one
    member of a multi-selection carries the rest along without losing their
    relative shape. Takes the ORIGINAL positions, not `pose`'s current ones:
    every pointermove during a drag recomputes from the same fixed start,
    exactly like the single-point drag it generalizes — applying a delta to
    an already-moved position would double it up. */
export function withPointsMoved(
  pose: PoseFrame,
  origins: ReadonlyMap<string, Point>,
  dx: number,
  dy: number,
): PoseFrame {
  let next = pose
  for (const [key, orig] of origins) {
    const { group, index } = parsePointKey(key)
    next = withPoint(next, group, index, orig.x + dx, orig.y + dy)
  }
  return next
}

/** Snaps every PLACED point in `keys` to the mean of their own current
    position on `axis` — the doc's own call for design-pass screen-6 §B2
    ("trancher pour la moyenne"): the mean of the points actually being
    aligned, not an anchor/last-point notion. The OTHER axis is untouched
    per point (this straightens a row/column, it doesn't collapse the
    selection to one spot). An unplaced point (`c<=0`) is skipped both from
    the average and from being written — same rule `mirrorBody` above
    already applies to a source it can't read a real position from. A
    single-or-empty `keys` is a no-op: nothing to align relative to. */
export function alignSelection(pose: PoseFrame, keys: Iterable<string>, axis: 'x' | 'y'): PoseFrame {
  const placed = [...keys]
    .map(parsePointKey)
    .filter(({ group, index }) => pose[group][index].c > 0)
  if (placed.length < 2) return pose
  const mean = placed.reduce((sum, { group, index }) => sum + pose[group][index][axis], 0) / placed.length
  let next = pose
  for (const { group, index } of placed) {
    const p = next[group][index]
    next = withPoint(next, group, index, axis === 'x' ? mean : p.x, axis === 'y' ? mean : p.y)
  }
  return next
}

/* Right/left index pairs among BODY_JOINT_NAMES — same order as the source
   in poseTopology.ts. Nose(0) and neck(1) sit ON the mirror axis, not
   paired with anything. */
const BODY_MIRROR_PAIRS: readonly [number, number][] = [
  [2, 5], [3, 6], [4, 7], [8, 11], [9, 12], [10, 13], [14, 15], [16, 17],
]

/** Copies one side's placed body points onto the other, reflected around
    the NECK's own x — body-18 has no single spine/pelvis point to mirror
    against (that is body-25's addition), and the neck is already every
    limb's root (poseTopology's `parentOf`), so it is the practical stand-in
    for a mirror axis. Y is untouched: an anatomically mirrored joint sits
    at the same height, only x flips. A source point that is not placed
    (`c<=0`) is skipped — its target keeps whatever it already had, rather
    than being overwritten with nothing. */
export function mirrorBody(pose: PoseFrame, direction: 'rightToLeft' | 'leftToRight'): PoseFrame {
  const axisX = pose.body[1].x
  const points = pose.body.slice()
  for (const [r, l] of BODY_MIRROR_PAIRS) {
    const [sourceIndex, targetIndex] = direction === 'rightToLeft' ? [r, l] : [l, r]
    const source = points[sourceIndex]
    if (source.c <= 0) continue
    points[targetIndex] = { x: 2 * axisX - source.x, y: source.y, c: 1 }
  }
  return { ...pose, body: points }
}

/** Copies one hand's SHAPE onto the other, mirrored around the SOURCE
    hand's own wrist and re-anchored at the TARGET hand's CURRENT wrist —
    the target hand stays where it physically is, only its finger splay
    changes. Copying raw coordinates across would be meaningless: the two
    hands can sit anywhere on the canvas, unrelated to each other. A no-op
    if either wrist isn't placed yet — nothing to anchor the copy to. */
export function mirrorHand(pose: PoseFrame, from: 'handLeft' | 'handRight'): PoseFrame {
  const to = from === 'handLeft' ? 'handRight' : 'handLeft'
  const source = pose[from]
  const targetWrist = pose[to][0]
  if (source[0].c <= 0 || targetWrist.c <= 0) return pose
  const points = source.map((p) => {
    if (p.c <= 0) return p
    return { x: targetWrist.x - (p.x - source[0].x), y: targetWrist.y + (p.y - source[0].y), c: 1 }
  })
  points[0] = targetWrist
  return { ...pose, [to]: points }
}
