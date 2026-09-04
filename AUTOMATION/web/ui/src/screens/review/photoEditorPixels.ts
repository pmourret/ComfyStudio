/* What the editor does to PIXELS, and the shapes it does it to.

   Everything here is arithmetic on an ImageData — no React, no DOM beyond the
   2D context it is handed. It is the half of the editor that can be reasoned
   about without opening a modal.

   THE GRAIN IS NOT THE PRODUCTION GRAIN. This is LUMINANCE noise (the same
   value on R/G/B), weighted towards the shadows — the same PRINCIPLE as
   AUTOMATION/grain.py, simplified for a manual retouch on the fly. The
   calibrated grain of production stays governed by `preset.grain_telephone`,
   which is why the panel says so on screen. */

export type Crop = { x: number; y: number; w: number; h: number }
export type Ratio = { w: number; h: number } | null

export type Settings = {
  rot: number // 0..3, steps of 90°
  flip: boolean // horizontal mirror, AFTER rotation
  straighten: number
  bright: number
  contrast: number
  sat: number
  temp: number
  grain: number
}

export const NEUTRAL: Settings = {
  rot: 0,
  flip: false,
  straighten: 0,
  bright: 0,
  contrast: 0,
  sat: 0,
  temp: 0,
  grain: 0,
}

/* ------------------------------------------------------------- appearance
   The editor's own sheet is gone; what it said is here, beside the markup it
   dresses. Only the rail rule left the file — it is about the RAIL, and it now
   lives beside the other rail rules in `chrome.css`.

   THE BOX IS NOT A MESSAGE. `dialog{…}` of `chrome.css` sizes a question
   (560 px, hugging its content); a work surface is sized in vw/vh and fills
   what it takes. Those are element selectors, so a plain utility outweighs
   them — but `dialog .card` is element + class, and the plate we are undoing
   here needs `!` to lose. `.edWrap` is the real frame; the plate underneath is
   reduced to a full-size transparent box.

   `[border:0]` and `[box-shadow:…]` rather than `border-0` / `shadow-none` /
   `shadow-[…]`: those three utilities write the LONGHAND — a `solid` style on a
   0 px border — and Tailwind's five-layer shadow chain. Same pixels, but the
   arbitrary property leaves the same COMPUTED STYLE too, and this migration is
   checked on the computed styles, state by state. */

export const FILL = 0.92

export const RATIOS = ['libre', '1:1', '4:5', '2:3', '9:16']

export const SLIDERS = [
  { key: 'bright', id: 'edBright', label: 'luminosité', min: -60, max: 60, step: 1 },
  { key: 'contrast', id: 'edContrast', label: 'contraste', min: -60, max: 60, step: 1 },
  { key: 'sat', id: 'edSat', label: 'saturation', min: -100, max: 100, step: 1 },
  { key: 'temp', id: 'edTemp', label: 'température', min: -50, max: 50, step: 1 },
] as const

/* Bruit de LUMINANCE (same value on R/G/B), weighted towards the shadows — the
   same PRINCIPLE as AUTOMATION/grain.py, simplified for an on-the-fly manual
   retouch. This is NOT the calibrated grain of production, which stays governed
   by preset.grain_telephone — hence the label on screen. */
export function applyGrain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (!amount) return
  const image = ctx.getImageData(0, 0, w, h)
  const data = image.data
  const force = (amount / 100) * 22
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255
    const shadowWeight = 0.35 + 0.65 * (1 - lum)
    const noise = (Math.random() * 2 - 1) * force * shadowWeight
    data[i] = Math.max(0, Math.min(255, data[i] + noise))
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise))
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise))
  }
  ctx.putImageData(image, 0, 0)
}

/* Light approximation: a warm/cold overlay wash rather than a true white
   balance, which a simple canvas filter cannot do without walking every pixel in
   a colour space.

   `strength` (default 1, unused by every existing caller): the advanced
   editor's layer compositor (photoEditorLayersPixels.ts) scales it by a
   layer's own opacity, so a half-opacity layer's wash reads as half as
   strong once composited — same formula, reused rather than duplicated. */
export function applyTemperature(
  ctx: CanvasRenderingContext2D, w: number, h: number, value: number, strength = 1,
) {
  if (!value) return
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = Math.min(0.18, (Math.abs(value) / 50) * 0.18) * strength
  ctx.fillStyle = value > 0 ? '#ff9d3d' : '#3daaff'
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

/* `Pick`, not the full `Settings`: the advanced editor's layer compositor
   (photoEditorLayersPixels.ts) has no `rot`/`flip`/`straighten`/`grain` of
   its own to fabricate just to satisfy this signature — and a real
   `Settings` object still satisfies the narrower type structurally, so
   this is not a breaking change for the one existing caller below. */
export const cssFilter = (s: Pick<Settings, 'bright' | 'contrast' | 'sat'>) =>
  `brightness(${1 + s.bright / 100}) contrast(${1 + s.contrast / 100}) saturate(${1 + s.sat / 100})`
