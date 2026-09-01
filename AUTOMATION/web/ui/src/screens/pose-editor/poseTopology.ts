/* OpenPose body-18 / hand-21 constants for the editor's own SVG rendering.

   Mirrors AUTOMATION/pose_render.py, itself transcribed from
   comfyui_controlnet_aux's dwpose/util.py (draw_bodypose / draw_handpose) —
   two languages documenting the SAME source, deliberately not shared as
   code across the Python/TypeScript boundary. Keep the two in sync by hand
   if this ever changes; it is a fixed, decades-old visualization
   convention, not something expected to move. */

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
