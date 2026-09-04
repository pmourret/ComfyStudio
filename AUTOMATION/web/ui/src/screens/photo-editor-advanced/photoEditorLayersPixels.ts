/* What the advanced editor does to PIXELS, and the shapes it does it to.
   Sibling of `screens/review/photoEditorPixels.ts` — same spirit (arithmetic
   on a canvas, no React, reasoned about without mounting a screen), extended
   to a STACK of layers instead of one flat settings object. Curve splines
   (curvesMath.ts) and HSL-by-band (hslMath.ts) are split into their own
   files — genuinely separate concerns, easier to reason about (and test)
   in isolation.

   Types come from the generated OpenAPI schema (`Layer`/`LayerSettings`/…,
   `api/schemas/photo_editor.py`), never hand-typed — frontend.md.

   ORDERING CONVENTION, not obvious from the shape alone: `layers[0]` is the
   TOPMOST layer (front of the stack, first row of the on-screen list);
   `layers[layers.length - 1]` is always the locked `photo` base layer,
   painted first. A "+ Ajouter un calque" gesture unshifts onto the FRONT
   (new layers appear on top, as in Lightroom/Photoshop); "↑"/"↓" swap
   adjacent array entries; `composeLayers` below walks the array BACKWARDS
   so the base paints before anything stacked on top of it.

   PER-LAYER OFFSCREEN CANVAS. Earlier this drew every layer straight onto
   the shared canvas with a plain `ctx.filter`. Curves/levels/HSL need pixel
   access `ctx.filter` cannot give — each layer therefore renders fully
   (basic sliders, then the combined tone pass) onto its OWN canvas first,
   and that finished canvas is composited onto the shared one with the
   layer's opacity — the physically correct way to alpha-blend a layer,
   rather than scaling each individual paint op's own alpha as before (the
   two are only equivalent when opacity is 100%, which is why the base
   layer — always rendered at full strength — never showed the difference). */
import type { Schema } from '../../api/client'
import { buildCurveLut, isIdentityCurve, type CurvePoint } from './curvesMath'
import { applyHslShift, isHslNeutral } from './hslMath'
import { warpPerspective } from './perspectiveMath'
import { applyTemperature, cssFilter } from '../review/photoEditorPixels'

export type Layer = Schema<'Layer'>
export type LayerSettings = Schema<'LayerSettings'>
export type LayerKind = Layer['kind']
export type Curves = Schema<'Curves'>

const IDENTITY_CURVE: CurvePoint[] = [{ x: 0, y: 0 }, { x: 255, y: 255 }]

export const NEUTRAL_SETTINGS: LayerSettings = {
  expo: 0, contrast: 0, sat: 0, temp: 0,
  curveChannel: 'rgb',
  curves: { rgb: IDENTITY_CURVE, r: IDENTITY_CURVE, g: IDENTITY_CURVE, b: IDENTITY_CURVE },
  levelBlack: 0, levelMid: 0, levelWhite: 0,
  hsl: {},
  sharpen: 0, blurOn: false, blurRadius: 0.02, blurStrength: 50,
  perspH: 0, perspV: 0, aiBrushSize: 0.05, aiPrompt: '',
}

/* Same 4 adjustments as `screens/review/photoEditorPixels.ts`'s own
   `SLIDERS`, same bounds — `bright` renamed `expo` per the design-pass
   `Layer` shape (screen-photo-editor.md §7b). */
export const LAYER_SLIDERS = [
  { key: 'expo', id: 'peExpo', label: 'exposition', min: -60, max: 60, step: 1 },
  { key: 'contrast', id: 'peContrast', label: 'contraste', min: -60, max: 60, step: 1 },
  { key: 'sat', id: 'peSat', label: 'saturation', min: -100, max: 100, step: 1 },
  { key: 'temp', id: 'peTemp', label: 'température', min: -50, max: 50, step: 1 },
] as const satisfies readonly { key: keyof LayerSettings; id: string; label: string; min: number; max: number; step: number }[]

/** A curated, hand-authored set — same status as `photoEditorPixels.ts`'s own
    `RATIOS`: a studio constant (CLAUDE.md §4 is about a business/quality
    threshold, not an aesthetic preset value), not a business threshold, so
    it stays in code rather than behind a config endpoint. */
export type Preset = { id: string; label: string; settings: Partial<LayerSettings> }
export const PRESETS: Preset[] = [
  { id: 'lumineux', label: 'Lumineux', settings: { expo: 20, contrast: 8 } },
  { id: 'contraste', label: 'Contrasté', settings: { contrast: 25, sat: 10 } },
  { id: 'doux', label: 'Doux', settings: { expo: 8, contrast: -10, sat: -8 } },
  { id: 'chaud', label: 'Chaud', settings: { temp: 20 } },
  { id: 'froid', label: 'Froid', settings: { temp: -20 } },
]

let _seq = 0
/** Client-only id — never sent as meaningful to anything but this session's
    own history/selection; the server persists whatever id the client hands
    it, it never generates one of its own. */
export function makeLayerId(): string {
  _seq += 1
  return `layer-${Date.now().toString(36)}-${_seq}`
}

export function newLayer(kind: LayerKind, name: string): Layer {
  return {
    id: makeLayerId(), name, kind, visible: true, opacity: 100, locked: false,
    settings: { ...NEUTRAL_SETTINGS },
  }
}

export function baseLayer(): Layer {
  return { id: 'base', name: 'Photo', kind: 'photo', visible: true, opacity: 100,
           locked: true, settings: { ...NEUTRAL_SETTINGS } }
}

/** Classic black/mid/white point remap — `t=(v-bp)/(wp-bp)` clamped to
    [0,1], then a gamma computed from `mid` (positive mid = brighter
    midtones: gamma>1, so `t^(1/gamma)` lifts values above the straight
    line). Slider range is -50..50 for all three (design-pass), scaled here
    into the pixel/gamma ranges the formula actually needs. */
function buildLevelsLut(black: number, mid: number, white: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256)
  const bp = black * (128 / 50)
  const wp = 255 - white * (128 / 50)
  const gamma = Math.pow(2, mid / 50)
  const span = wp - bp
  for (let v = 0; v < 256; v++) {
    if (span <= 0) {
      lut[v] = v >= bp ? 255 : 0
      continue
    }
    const t = Math.max(0, Math.min(1, (v - bp) / span))
    lut[v] = Math.round(255 * Math.pow(t, 1 / gamma))
  }
  return lut
}

const isLevelsNeutral = (s: LayerSettings) => s.levelBlack === 0 && s.levelMid === 0 && s.levelWhite === 0

/** Composes levels + the RGB curve into one shared LUT, then layers each
    per-channel curve (R/V/B) on top — exactly the design-pass's own
    ordering ("niveaux d'abord, courbes ensuite", RGB curve then per-channel). */
function buildToneLuts(settings: LayerSettings): { r: Uint8ClampedArray; g: Uint8ClampedArray; b: Uint8ClampedArray } | null {
  const curves = settings.curves
  const levelsNeutral = isLevelsNeutral(settings)
  const rgbIdentity = isIdentityCurve(curves.rgb)
  const rIdentity = isIdentityCurve(curves.r)
  const gIdentity = isIdentityCurve(curves.g)
  const bIdentity = isIdentityCurve(curves.b)
  if (levelsNeutral && rgbIdentity && rIdentity && gIdentity && bIdentity) return null

  const levelsLut = levelsNeutral ? null : buildLevelsLut(settings.levelBlack, settings.levelMid, settings.levelWhite)
  const rgbLut = rgbIdentity ? null : buildCurveLut(curves.rgb)
  const base = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    let x = v
    if (levelsLut) x = levelsLut[x]
    if (rgbLut) x = rgbLut[x]
    base[v] = x
  }
  const rLut = rIdentity ? null : buildCurveLut(curves.r)
  const gLut = gIdentity ? null : buildCurveLut(curves.g)
  const bLut = bIdentity ? null : buildCurveLut(curves.b)
  const r = new Uint8ClampedArray(256)
  const g = new Uint8ClampedArray(256)
  const b = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    const x = base[v]
    r[v] = rLut ? rLut[x] : x
    g[v] = gLut ? gLut[x] : x
    b[v] = bLut ? bLut[x] : x
  }
  return { r, g, b }
}

/** The one combined pixel pass for a layer: tone (levels+curves) LUTs, then
    HSL-by-band — a SINGLE getImageData/putImageData round trip rather than
    one per feature, and skipped ENTIRELY when both are neutral (the common
    case: most layers never touch these tabs), which is why this is a
    function of its own rather than inlined into `renderLayerToCanvas`. */
function applyTonePass(ctx: CanvasRenderingContext2D, width: number, height: number, settings: LayerSettings): void {
  const toneLuts = buildToneLuts(settings)
  const hsl = settings.hsl
  const hslNeutral = isHslNeutral(hsl)
  if (!toneLuts && hslNeutral) return
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]
    let g = data[i + 1]
    let b = data[i + 2]
    if (toneLuts) {
      r = toneLuts.r[r]
      g = toneLuts.g[g]
      b = toneLuts.b[b]
    }
    if (!hslNeutral) {
      ;[r, g, b] = applyHslShift(r, g, b, hsl)
    }
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
  ctx.putImageData(image, 0, 0)
}

/** Renders ONE layer, fully, onto its own transparent-backed canvas —
    basic sliders via `ctx.filter` (fast, native), the combined tone pass,
    then the perspective warp (geometric — must run AFTER colour so it
    moves already-graded pixels, not raw ones). Sharpen/selective-blur join
    this pipeline in their own step (ROADMAP.md); nothing here is a
    half-built stand-in for them. */
function renderLayerToCanvas(image: CanvasImageSource, width: number, height: number, layer: Layer): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.filter = cssFilter({
    bright: layer.settings.expo, contrast: layer.settings.contrast, sat: layer.settings.sat,
  })
  ctx.drawImage(image, 0, 0, width, height)
  ctx.filter = 'none'
  // Full strength (1) here, not the layer's opacity: opacity is applied
  // ONCE, when this whole canvas is composited below — see this file's own
  // header note on why that replaces scaling each paint op individually.
  applyTemperature(ctx, width, height, layer.settings.temp, 1)
  applyTonePass(ctx, width, height, layer.settings)
  warpPerspective(ctx, width, height, layer.settings.perspH, layer.settings.perspV)
  return canvas
}

/** Composites the full stack onto `ctx`, at whatever size `image` is drawn —
    caller sizes the canvas (screen-size for the live preview, full
    resolution only when exporting for save, same split as
    `PhotoEditor.tsx`'s own `sizeCanvas`/`finalCanvas`). */
export function composeLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  image: CanvasImageSource,
  layers: readonly Layer[],
): void {
  ctx.clearRect(0, 0, width, height)
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]
    if (!layer.visible) continue
    const layerCanvas = renderLayerToCanvas(image, width, height, layer)
    // The base layer's own opacity is ignored (design-pass §7b: nothing
    // sits under it to blend with) — every other layer respects its own.
    const alpha = layer.kind === 'photo' ? 1 : Math.max(0, Math.min(100, layer.opacity)) / 100
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.drawImage(layerCanvas, 0, 0)
    ctx.restore()
  }
}

const HISTOGRAM_BINS = 48

/** Luminance histogram of whatever is currently painted on `ctx` — read
    straight off the already-composited preview canvas, no second render.
    Downsamples every 4th pixel: a histogram's SHAPE does not need every
    pixel counted, and walking all of them on a wide canvas on every drag
    tick would be the wrong cost for a decorative read-out. */
export function computeHistogram(ctx: CanvasRenderingContext2D, width: number, height: number): number[] {
  const bins = new Array(HISTOGRAM_BINS).fill(0)
  if (width <= 0 || height <= 0) return bins
  const { data } = ctx.getImageData(0, 0, width, height)
  for (let i = 0; i < data.length; i += 16) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    bins[Math.min(HISTOGRAM_BINS - 1, Math.floor((lum / 256) * HISTOGRAM_BINS))] += 1
  }
  return bins
}
