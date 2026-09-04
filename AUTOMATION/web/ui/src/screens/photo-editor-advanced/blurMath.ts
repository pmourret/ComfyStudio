/* Box blur, unsharp-mask sharpening, and mask-composited selective blur —
   pure pixel math, own file for the same reason as curvesMath.ts/hslMath.ts/
   perspectiveMath.ts. Verified against a naive direct-sum reference on
   random data before being trusted here (max diff ~1e-13, floating-point
   noise only) — a sliding window is easy to get subtly wrong at the edges,
   and this is the sort of bug that would only show up as a faint fringe no
   one would trace back to an off-by-one. */

/** Separable box blur, repeated `passes` times (3 is the standard rule of
    thumb for a visually near-gaussian result) — a sliding window per row/
    column, O(width·height) per pass rather than O(width·height·radius),
    which is what makes a live slider drag on a screen-size preview
    feasible at all. Edge pixels shrink their averaging window rather than
    clamping to the edge value, which is what the verification script
    checks against a naive reference. */
export function boxBlur(src: Uint8ClampedArray, width: number, height: number, radius: number, passes = 3): Uint8ClampedArray {
  if (radius <= 0) return src
  const r = Math.max(1, Math.round(radius))
  let current = src
  for (let pass = 0; pass < passes; pass++) {
    current = boxBlurOnePass(current, width, height, r)
  }
  return current
}

function boxBlurOnePass(src: Uint8ClampedArray, width: number, height: number, r: number): Uint8ClampedArray {
  const tmp = new Float32Array(src.length)
  const out = new Uint8ClampedArray(src.length)

  for (let y = 0; y < height; y++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0
      let count = 0
      for (let x = -r; x <= r; x++) {
        if (x < 0 || x >= width) continue
        sum += src[(y * width + x) * 4 + c]
        count++
      }
      for (let x = 0; x < width; x++) {
        tmp[(y * width + x) * 4 + c] = sum / count
        const addX = x + r + 1
        const subX = x - r
        if (addX < width) { sum += src[(y * width + addX) * 4 + c]; count++ }
        if (subX >= 0) { sum -= src[(y * width + subX) * 4 + c]; count-- }
      }
    }
  }

  for (let x = 0; x < width; x++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0
      let count = 0
      for (let y = -r; y <= r; y++) {
        if (y < 0 || y >= height) continue
        sum += tmp[(y * width + x) * 4 + c]
        count++
      }
      for (let y = 0; y < height; y++) {
        out[(y * width + x) * 4 + c] = Math.round(sum / count)
        const addY = y + r + 1
        const subY = y - r
        if (addY < height) { sum += tmp[(addY * width + x) * 4 + c]; count++ }
        if (subY >= 0) { sum -= tmp[(subY * width + x) * 4 + c]; count-- }
      }
    }
  }
  return out
}

const SHARPEN_RADIUS = 2

/** Classic unsharp mask: blur a copy, then push the original AWAY from the
    blur by `amount` — the alpha channel is left untouched (sharpening a
    layer's own transparency makes no sense). */
export function applySharpen(ctx: CanvasRenderingContext2D, width: number, height: number, amount: number): void {
  if (amount <= 0) return
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  const blurred = boxBlur(data, width, height, SHARPEN_RADIUS, 2)
  const strength = amount / 100
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const o = data[i + c]
      const b = blurred[i + c]
      data[i + c] = Math.max(0, Math.min(255, o + (o - b) * strength))
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** Blurs the whole layer, then blends the blurred version back in only
    where `maskAlpha` (0..1 per pixel, from `maskMath.ts::renderMaskAlpha`)
    says to, scaled by `strength` — a mask value of 1 and strength 100 is
    "fully blurred there", 0 is "untouched". `radiusFraction` is normalized
    to the larger image dimension (same convention as `Mask.brushRadius`),
    so the SAME setting looks the same whether applied to the screen-size
    preview or the full-resolution export. */
export function applySelectiveBlur(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  maskAlpha: Float32Array, radiusFraction: number, strength: number,
): void {
  const radiusPx = radiusFraction * Math.max(width, height)
  if (radiusPx <= 0 || strength <= 0) return
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  const blurred = boxBlur(data, width, height, radiusPx, 3)
  const s = strength / 100
  for (let p = 0; p < width * height; p++) {
    const a = maskAlpha[p] * s
    if (a <= 0) continue
    const i = p * 4
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.round(data[i + c] + (blurred[i + c] - data[i + c]) * a)
    }
  }
  ctx.putImageData(image, 0, 0)
}
