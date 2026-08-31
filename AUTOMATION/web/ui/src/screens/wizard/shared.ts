/* What the wizard's two halves both need: the shape of a choice, and the look
   of the identity base.

   It exists because `StepBody` renders the four steps and `WizardScreen` drives
   them — these types and class chains sit exactly on that seam. A constant
   exported from either side would make one depend on the other for a reason
   unrelated to what it does. */
import type { Schema } from '../../api/client'

export type CharacterType = Schema<'WizardType'>
export const STEPS = ['type', 'style', 'world', 'base'] as const
export type Step = (typeof STEPS)[number]
export const candidateUrl = (file: string) =>
  `/api/characters/base/image?file=${encodeURIComponent(file)}`

export type CandidateState = { file: string; state: string; detail?: string | null }
export const NOTE = 'rounded-card border px-[16px] py-[14px] text-[13px] leading-[1.55] bg-panel'
export const NOTE_OK = NOTE + ' border-line text-dim'
export const NOTE_ERR = NOTE + ' border-danger-line text-danger-txt'
/* ------------------------------------------------------- identity base */
export const BASE_GRID = 'mt-[14px] grid grid-cols-2 gap-[20px] max-[720px]:grid-cols-1'
export const COL_TITLE = 'mt-0 mb-[10px] text-[11.5px] uppercase tracking-[.5px] text-dim'
export const CANDS = 'mt-[12px] grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-[8px]'
/* `.wiz-cand:focus-visible` is not ported: it restated the ring `base.css`
   already gives every <button>, and the two cards that are not buttons cannot
   take focus. */
export const CAND =
  'flex aspect-square items-center justify-center overflow-hidden ' +
  'rounded-[8px] border-2 p-0 text-[11px]'
/* THE CURSOR IS IN THE STATES, not in the base chain — exactly like the colours,
   and for the same reason: `cursor-pointer` and `cursor-default` are two single
   classes, so the emitted order decides, not the order they are written in. The
   capture caught it: the failed card was announcing itself clickable.

   The chosen card does NOT take the hover border either: in the sheet
   `.wiz-cand.chosen` came after `.wiz-cand:hover` and won the tie, so the accent
   held under the pointer. Written as three exclusive chains rather than as a
   `!`. */
export const CAND_IDLE = 'cursor-pointer border-line bg-panel2 text-dim2 hover:border-line2'
export const CAND_CHOSEN = 'cursor-pointer border-acc bg-panel2 text-dim2'
export const CAND_ERR = 'cursor-default border-line bg-panel2 text-danger-txt hover:border-line2'
/* THE SPINNER. Each side names its own colour: `border-line2` + `border-t-acc`
   would be a shorthand/longhand pair, and Tailwind emits `border-top-color`
   BEFORE `border-color` — the accent would be wiped by the grey. */
export const SPIN =
  'h-[16px] w-[16px] rounded-[50%] border-2 border-t-acc border-r-line2 border-b-line2 ' +
  'border-l-line2 animate-[wizspin_.8s_linear_infinite] motion-reduce:animate-none'

/* The accent border says WHICH image is frozen — the only one that will ever
   carry the identity lock. */
export const FROZEN_IMG = 'h-[150px] w-[120px] rounded-card border-2 border-acc object-cover'
export const FROZEN_HINT = 'Figé à la création. Un autre choix = un autre personnage.'
