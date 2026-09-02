/* ExpressionEditor (comfyui-advancedliveportrait) parameter bounds, mirrored
   from AUTOMATION/expression.py's `BORNES` — a fixed node contract, not a
   business threshold (CLAUDE.md §4 does not apply, same reasoning as
   poseTopology.ts mirroring OpenPose's own fixed joint layout). Keep the two
   in sync by hand if the node's own bounds ever change; they have not since
   this editor was scoped (2026-09-02, ComfyUI node survey). */
import type { Schema } from '../../api/client'

export type ExpressionParamName = keyof Schema<'ExpressionParams'>

export const PARAM_BOUNDS: Record<ExpressionParamName, readonly [number, number]> = {
  smile: [-0.3, 1.3],
  aaa: [-30, 120],
  eee: [-20, 15],
  woo: [-20, 15],
  blink: [-20, 5],
  wink: [0, 25],
  eyebrow: [-10, 15],
  pupil_x: [-15, 15],
  pupil_y: [-15, 15],
  rotate_pitch: [-20, 20],
  rotate_yaw: [-20, 20],
  rotate_roll: [-20, 20],
}

/* Grouped for display — same spirit as PoseInspector's 60 joints grouped by
   body part, not a flat list of 12. */
export const PARAM_GROUPS: readonly { label: string; params: readonly ExpressionParamName[] }[] = [
  { label: 'Bouche', params: ['smile', 'aaa', 'eee', 'woo'] },
  { label: 'Regard', params: ['blink', 'wink', 'pupil_x', 'pupil_y'] },
  { label: 'Sourcils', params: ['eyebrow'] },
  { label: 'Rotation de la tête', params: ['rotate_pitch', 'rotate_yaw', 'rotate_roll'] },
]

export const PARAM_LABELS: Record<ExpressionParamName, string> = {
  smile: 'sourire',
  aaa: 'bouche ouverte (a)',
  eee: 'bouche étirée (e)',
  woo: 'bouche arrondie (o)',
  blink: 'clignement',
  wink: 'clin d’œil',
  eyebrow: 'sourcils',
  pupil_x: 'pupilles — horizontal',
  pupil_y: 'pupilles — vertical',
  rotate_pitch: 'tangage (haut/bas)',
  rotate_yaw: 'lacet (gauche/droite)',
  rotate_roll: 'roulis (inclinaison)',
}
