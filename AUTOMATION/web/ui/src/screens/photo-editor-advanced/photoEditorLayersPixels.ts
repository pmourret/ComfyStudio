/* What the advanced editor does to PIXELS, and the shapes it does it to.
   Sibling of `screens/review/photoEditorPixels.ts` — same spirit (arithmetic
   on a canvas, no React, reasoned about without mounting a screen), extended
   to a STACK of layers instead of one flat settings object.

   Types come from the generated OpenAPI schema (`Layer`/`LayerSettings`,
   `api/schemas/photo_editor.py`), never hand-typed — frontend.md.

   ORDERING CONVENTION, not obvious from the shape alone: `layers[0]` is the
   TOPMOST layer (front of the stack, first row of the on-screen list);
   `layers[layers.length - 1]` is always the locked `photo` base layer,
   painted first. A "+ Ajouter un calque" gesture unshifts onto the FRONT
   (new layers appear on top, as in Lightroom/Photoshop); "↑"/"↓" swap
   adjacent array entries; `composeLayers` below walks the array BACKWARDS
   so the base paints before anything stacked on top of it. */
import type { Schema } from '../../api/client'
import { applyTemperature, cssFilter } from '../review/photoEditorPixels'

export type Layer = Schema<'Layer'>
export type LayerSettings = Schema<'LayerSettings'>
export type LayerKind = Layer['kind']

export const NEUTRAL_SETTINGS: LayerSettings = { expo: 0, contrast: 0, sat: 0, temp: 0 }

/* Same 4 adjustments as `screens/review/photoEditorPixels.ts`'s own
   `SLIDERS`, same bounds — `bright` renamed `expo` per the design-pass
   `Layer` shape (screen-photo-editor.md §7b). Curves/levels/HSL/sharpen/
   blur/perspective are not sliders here yet: they are not fields of
   `LayerSettings` yet either (see the schema's own note on why that is
   deliberate, not an oversight). */
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

/** Composites the full stack onto `ctx`, at whatever size `image` is drawn —
    caller sizes the canvas (screen-size for the live preview, full
    resolution only when exporting for save, same split as
    `PhotoEditor.tsx`'s own `sizeCanvas`/`finalCanvas`).

    Every layer draws the SAME source image, re-filtered by its own
    settings — `kind` (`reglage`/`image`/`retouche`) only labels intent and
    the add-menu icon this pass, it does not change what gets painted yet:
    an `image` layer importing its OWN asset, or a `retouche` layer holding
    generated content, are later steps (ROADMAP.md). Nothing here is a
    half-built version of those — it is the honest 4-slider compositor the
    design-pass asks for THIS pass, applied per layer. */
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
    // The base layer's own opacity is ignored (design-pass §7b: nothing
    // sits under it to blend with) — every other layer respects its own.
    const alpha = layer.kind === 'photo' ? 1 : Math.max(0, Math.min(100, layer.opacity)) / 100
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.filter = cssFilter({
      bright: layer.settings.expo, contrast: layer.settings.contrast, sat: layer.settings.sat,
    })
    ctx.drawImage(image, 0, 0, width, height)
    ctx.restore()
    ctx.filter = 'none'
    applyTemperature(ctx, width, height, layer.settings.temp, alpha)
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
