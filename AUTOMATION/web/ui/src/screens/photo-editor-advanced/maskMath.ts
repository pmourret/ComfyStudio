/* Rasterizes a `Mask` (design-pass §7b "masquage à la Lightroom") into a
   per-pixel alpha (0..1) at whatever resolution the caller is compositing
   at. Own file, same reasoning as the other *Math.ts modules here.

   `pinceau`/`degrade`/`radial` are rendered through Canvas2D's OWN path
   and gradient primitives (`createLinearGradient`/`createRadialGradient`/
   round-capped strokes) — never a hand-rolled rasterizer, matching the
   plan's own decision. `sujet`/`ciel`/`arriere-plan` return `null`: no
   segmentation backend exists yet (same "visibly inert, not pretending to
   work" status as AI retouch itself — design-pass §7b).

   COORDINATES are NORMALIZED (0..1), matching `Mask`'s own Pydantic shape
   (`api/schemas/photo_editor.py`'s header note): a mask drawn on the
   screen-size preview lands in the same place when rendered again at full
   export resolution. */
import type { Mask } from './photoEditorLayersPixels'

/** `null` when the mask has nothing to show yet (an auto-detect mode, or a
    pinceau/dégradé/radial that was selected but never actually placed) —
    callers treat that exactly like "no selective effect", never a crash. */
export function renderMaskAlpha(mask: Mask, width: number, height: number): Float32Array | null {
  if (mask.mode === 'sujet' || mask.mode === 'ciel' || mask.mode === 'arriere-plan') return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  if (mask.mode === 'pinceau') {
    if (!mask.strokes.length) return null
    ctx.strokeStyle = '#fff'
    ctx.fillStyle = '#fff'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const diag = Math.max(width, height)
    for (const stroke of mask.strokes) {
      if (!stroke.points.length) continue
      const r = Math.max(0.5, stroke.radius * diag)
      if (stroke.points.length === 1) {
        const p = stroke.points[0]
        ctx.beginPath()
        ctx.arc(p.x * width, p.y * height, r, 0, Math.PI * 2)
        ctx.fill()
        continue
      }
      ctx.lineWidth = r * 2
      ctx.beginPath()
      stroke.points.forEach((p, i) => {
        const x = p.x * width
        const y = p.y * height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
  } else if (mask.mode === 'degrade') {
    if (!mask.gradient) return null
    const { x1, y1, x2, y2 } = mask.gradient
    const g = ctx.createLinearGradient(x1 * width, y1 * height, x2 * width, y2 * height)
    g.addColorStop(0, '#000')
    g.addColorStop(1, '#fff')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, width, height)
  } else if (mask.mode === 'radial') {
    if (!mask.radial) return null
    const { cx, cy, rx, ry, rotation, feather } = mask.radial
    ctx.save()
    ctx.translate(cx * width, cy * height)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(Math.max(0.001, rx * width), Math.max(0.001, ry * height))
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    const featherStop = Math.max(0, Math.min(0.999, 1 - feather / 100))
    g.addColorStop(0, '#fff')
    g.addColorStop(featherStop, '#fff')
    g.addColorStop(1, '#000')
    ctx.fillStyle = g
    // radius 1 in this SCALED space is the ellipse's own edge — 4 covers
    // it with room to spare; CanvasGradient clamps past its last stop, so
    // anything beyond the ellipse simply stays black.
    ctx.fillRect(-4, -4, 8, 8)
    ctx.restore()
  }

  const { data } = ctx.getImageData(0, 0, width, height)
  const out = new Float32Array(width * height)
  for (let p = 0; p < out.length; p++) out[p] = data[p * 4] / 255
  return out
}
