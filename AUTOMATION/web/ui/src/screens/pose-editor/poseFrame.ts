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
