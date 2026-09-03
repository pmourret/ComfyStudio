/* OpenPose body-18 / hand-21 constants for the editor's own SVG rendering.

   Mirrors AUTOMATION/pose_render.py, itself transcribed from
   comfyui_controlnet_aux's dwpose/util.py (draw_bodypose / draw_handpose) —
   two languages documenting the SAME source, deliberately not shared as
   code across the Python/TypeScript boundary. Keep the two in sync by hand
   if this ever changes; it is a fixed, decades-old visualization
   convention, not something expected to move. */
import type { PointGroup } from './poseFrame'

export const BODY_JOINT_NAMES = [
  'nose', 'neck', 'Rsho', 'Relb', 'Rwri', 'Lsho', 'Lelb', 'Lwri', 'Rhip',
  'Rknee', 'Rank', 'Lhip', 'Lknee', 'Lank', 'Reye', 'Leye', 'Rear', 'Lear',
] as const

/* 0-based pairs — the source's 1-based `limbSeq` minus 1 on each index. */
export const BODY_LIMBS: readonly [number, number][] = [
  [1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10],
  [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16], [0, 15], [15, 17],
]

/* One color per LIMB (by position in BODY_LIMBS) and per JOINT (by index) —
   18 colors covering both, same double use as the source. */
export const BODY_COLORS = [
  '#ff0000', '#ff5500', '#ffaa00', '#ffff00', '#aaff00', '#55ff00', '#00ff00',
  '#00ff55', '#00ffaa', '#00ffff', '#00aaff', '#0055ff', '#0000ff', '#5500ff',
  '#aa00ff', '#ff00ff', '#ff00aa', '#ff0055',
]

/* Wrist (0) + five fingers of four joints each, same topology both hands. */
export const HAND_EDGES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9],
  [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
]

/* The source colors each hand edge by a full HSV sweep rather than a fixed
   palette — same rainbow here, computed instead of listed. */
export function handEdgeColor(index: number): string {
  return `hsl(${(index / HAND_EDGES.length) * 360}, 100%, 50%)`
}

export const HAND_JOINT_COLOR = '#0000ff'

export const HAND_JOINT_NAMES = [
  'wrist',
  'thumb1', 'thumb2', 'thumb3', 'thumb4',
  'index1', 'index2', 'index3', 'index4',
  'middle1', 'middle2', 'middle3', 'middle4',
  'ring1', 'ring2', 'ring3', 'ring4',
  'pinky1', 'pinky2', 'pinky3', 'pinky4',
] as const

export type JointGroup = { label: string; indices: readonly number[] }

/* Anatomical groupings for the outliner (PoseInspector) — collapsible so 18
   or 21 flat rows don't have to stay on screen at once. Purely a display
   grouping: doesn't change BODY_LIMBS/HAND_EDGES or anything the renderer
   or the save format depend on. */
export const BODY_JOINT_GROUPS: readonly JointGroup[] = [
  { label: 'Tête', indices: [0, 14, 15, 16, 17] },
  { label: 'Tronc', indices: [1] },
  { label: 'Bras droit', indices: [2, 3, 4] },
  { label: 'Bras gauche', indices: [5, 6, 7] },
  { label: 'Jambe droite', indices: [8, 9, 10] },
  { label: 'Jambe gauche', indices: [11, 12, 13] },
]

/* Same grouping for either hand — HAND_JOINT_NAMES/HAND_EDGES are already
   shared between handLeft and handRight, this just follows suit. */
export const HAND_JOINT_GROUPS: readonly JointGroup[] = [
  { label: 'Poignet', indices: [0] },
  { label: 'Pouce', indices: [1, 2, 3, 4] },
  { label: 'Index', indices: [5, 6, 7, 8] },
  { label: 'Majeur', indices: [9, 10, 11, 12] },
  { label: 'Annulaire', indices: [13, 14, 15, 16] },
  { label: 'Auriculaire', indices: [17, 18, 19, 20] },
]

/** The joint one step closer to the root along `edges` — BODY_LIMBS and
    HAND_EDGES both list the more distal joint second (an elbow's edge is
    `[shoulder, elbow]`, never the reverse), so "whoever has `index` as their
    SECOND element" is the parent. `null` for a root joint (body's neck,
    each hand's wrist): nothing to measure an angle or bone length against. */
export function parentOf(edges: readonly [number, number][], index: number): number | null {
  const edge = edges.find(([, b]) => b === index)
  return edge ? edge[0] : null
}

/** Same as `parentOf`, but picks BODY_LIMBS or HAND_EDGES from `group` —
    the lookup every caller outside this module actually wants, now that
    there are two of them (PoseInspector's readout, PoseCanvas's Shift-drag
    rotation): duplicating the `group === 'body' ? BODY_LIMBS : HAND_EDGES`
    ternary a third time would be the sign to extract it, so it's done at
    the second. */
export function parentIndexOf(group: PointGroup, index: number): number | null {
  return parentOf(group === 'body' ? BODY_LIMBS : HAND_EDGES, index)
}

/** A joint's human-readable name. Moved here from `PoseInspector.tsx`
    (design-pass screen-6, §A3) — `PoseCanvas.tsx` needs it too (per-joint
    `aria-label`), and `PoseInspector.tsx` already imports `type Selected`
    FROM `PoseCanvas.tsx`, so importing this the other way would invert
    that. Both files import the one copy here instead. */
export function nameOf(group: PointGroup, index: number): string {
  return group === 'body' ? BODY_JOINT_NAMES[index] : HAND_JOINT_NAMES[index]
}

/* Non-colour fallback for limbs/fingers (design-pass screen-6, §A6) — colour
   alone (adjacent red/green on the body, a continuous HSL sweep on the
   hands) is the only differentiator today, a real problem for colour-blind
   use. Additive: `BODY_COLORS`/`handEdgeColor` are untouched (historical
   choice, mirrors `pose_render.py`). Three patterns are enough, repeated —
   the doc's own explicit call: "l'info redondante avec la couleur
   désambiguïse localement", not a claim that every pattern is unique
   everywhere. `undefined` (not `'0'` or `''`) for solid: an explicit empty
   dasharray still renders correctly in every browser tested, but omitting
   the attribute entirely is what a plain solid `<line>` already does
   elsewhere in this file. */
const DASH_PATTERNS: readonly (string | undefined)[] = [undefined, '10 4', '4 3']

/* `BODY_LIMBS` is a tree, not a chain — hub joints (the neck has 5 incident
   limbs, the nose 3) mean `limbIndex % DASH_PATTERNS.length` can put every
   Nth limb sharing a hub on the same pattern by pure accident of how far
   apart they land in the array (measured: 4 of the neck's 5 limbs on the
   same pattern that way — [1,2]/[1,8]/[1,11]/[1,0] are all 3 (or a
   multiple of 3) apart). Counting per-hub instead — same idea
   `handEdgeDash` already gets "for free" from `HAND_JOINT_GROUPS`' flat
   indexing — spreads a hub's own children evenly first: worst case a
   2-way tie, the best 3 patterns can do for 5 siblings. */
const bodyHubDashCounts = new Map<number, number>()
const BODY_LIMB_DASH: readonly (string | undefined)[] = BODY_LIMBS.map(([hub]) => {
  const seen = bodyHubDashCounts.get(hub) ?? 0
  bodyHubDashCounts.set(hub, seen + 1)
  return DASH_PATTERNS[seen % DASH_PATTERNS.length]
})

/** One pattern per LIMB, by its position in `BODY_LIMBS`. */
export function limbDash(limbIndex: number): string | undefined {
  return BODY_LIMB_DASH[limbIndex]
}

/** Which finger a `HAND_EDGES` entry belongs to — the edge's CHILD joint
    (`edges[i][1]`, always the more distal one, see `parentOf`'s own
    comment) is never the wrist (`HAND_JOINT_GROUPS[0]`, "Poignet": nothing
    in `HAND_EDGES` has it as a child), so this always resolves to one of
    the five actual fingers. */
export function handEdgeFinger(edgeIndex: number): JointGroup {
  const child = HAND_EDGES[edgeIndex][1]
  // Non-null by construction, per the comment above.
  return HAND_JOINT_GROUPS.find((g) => g.indices.includes(child))!
}

/** One pattern per FINGER (not per edge — the doc's own distinction, §A6):
    every one of a finger's 4 edges shares the same dash, matching how
    `HAND_JOINT_GROUPS` already groups them for the outliner. Three
    patterns repeated over five fingers. */
export function handEdgeDash(edgeIndex: number): string | undefined {
  const fingerPosition = HAND_JOINT_GROUPS.indexOf(handEdgeFinger(edgeIndex)) - 1 // 0-based among fingers (wrist excluded)
  return DASH_PATTERNS[fingerPosition % DASH_PATTERNS.length]
}
