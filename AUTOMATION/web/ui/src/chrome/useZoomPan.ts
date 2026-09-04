/* Shared zoom for a canvas-in-a-scrollable-stage layout — used by both photo
   editors (`screens/review/PhotoEditor.tsx`, `screens/photo-editor-advanced/
   PhotoEditorAdvancedScreen.tsx`). Generic on purpose (no photo/canvas
   coupling beyond "a stage element and the natural size of its content"),
   same spirit as `useRovingChoice.ts` in this folder.

   Panning is deliberately NOT a custom drag gesture: the stage becomes
   `overflow:auto` and native scroll does the job. A hand-rolled pan-drag
   would have to coexist with the crop-box drag (PhotoEditor.tsx) and the
   mask-paint drag (PhotoEditorAdvancedScreen.tsx), both of which already
   claim pointerdown on/near the canvas — native scroll sidesteps that
   entirely.

   `displayScale` (zoomPct / 100) is the only output each screen needs: it
   decides on its own what to DO with it (PhotoEditor.tsx only touches
   canvas.style.width/height — the crop math already reads
   getBoundingClientRect() and stays correct for free; the advanced editor
   additionally redraws canvas.width/height, capped at 1, for real pixel
   detail up to native resolution). */
import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_PCT = 400
const BUTTON_STEP = 1.25
const WHEEL_STEP = 1.15

type PendingScrollAdjust = {
  contentX: number
  contentY: number
  pointerX: number
  pointerY: number
  prevPct: number
}

export function useZoomPan({
  stageRef,
  naturalWidth,
  naturalHeight,
  padding = 32,
}: {
  stageRef: React.RefObject<HTMLElement | null>
  naturalWidth: number
  naturalHeight: number
  padding?: number
}) {
  const computeFitPct = useCallback(() => {
    const stage = stageRef.current
    if (!stage || !naturalWidth || !naturalHeight) return 100
    const maxW = Math.max(200, stage.clientWidth - padding)
    const maxH = Math.max(200, stage.clientHeight - padding)
    const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight, 1)
    return Math.max(1, scale * 100)
  }, [stageRef, naturalWidth, naturalHeight, padding])

  const [fitPct, setFitPct] = useState(computeFitPct)
  const [zoomPct, setZoomPct] = useState(computeFitPct)
  const pending = useRef<PendingScrollAdjust | null>(null)
  /* True once the user has actually zoomed. Before that, `naturalWidth`/
     `naturalHeight` are 0 on first render (the image hasn't loaded yet),
     so the first REAL computeFitPct() (once they arrive) can land well
     below the "100" placeholder `useState`'s one-time initializer used —
     re-snap to it exactly in that case. Once touched, only raise the
     floor (a 90° rotation changing the fit baseline must never yank an
     already-chosen zoom back to fit). */
  const touched = useRef(false)

  useEffect(() => {
    const next = computeFitPct()
    setFitPct(next)
    setZoomPct((z) => (touched.current ? Math.max(next, Math.min(z, MAX_PCT)) : next))
  }, [computeFitPct])

  const clamp = useCallback((pct: number) => Math.max(fitPct, Math.min(MAX_PCT, pct)), [fitPct])

  /** Zoom by `factor`, keeping the point at (pointerX, pointerY) — stage-
      relative CSS px — visually fixed. Falls back to the stage's own
      centre when no pointer position is given (button clicks). */
  const zoomBy = useCallback(
    (factor: number, pointer?: { x: number; y: number }) => {
      const stage = stageRef.current
      if (!stage) return
      touched.current = true
      const pointerX = pointer?.x ?? stage.clientWidth / 2
      const pointerY = pointer?.y ?? stage.clientHeight / 2
      setZoomPct((z) => {
        const next = clamp(z * factor)
        if (next !== z) {
          pending.current = {
            contentX: stage.scrollLeft + pointerX,
            contentY: stage.scrollTop + pointerY,
            pointerX,
            pointerY,
            prevPct: z,
          }
        }
        return next
      })
    },
    [stageRef, clamp],
  )

  const zoomIn = useCallback(() => zoomBy(BUTTON_STEP), [zoomBy])
  const zoomOut = useCallback(() => zoomBy(1 / BUTTON_STEP), [zoomBy])
  const zoomToFit = useCallback(() => {
    touched.current = true
    setZoomPct(fitPct)
    const stage = stageRef.current
    if (stage) {
      stage.scrollLeft = 0
      stage.scrollTop = 0
    }
  }, [fitPct, stageRef])

  /* Ctrl/Cmd+wheel = zoom toward the cursor (Photoshop/Figma/Lightroom
     convention). Plain wheel keeps its native meaning — scroll, which IS
     pan once zoomed past "fit" and the stage overflows.

     A NATIVE listener, deliberately not React's `onWheel` prop: React
     attaches its synthetic wheel handler as PASSIVE by default, so
     event.preventDefault() inside a JSX onWheel silently no-ops (confirmed
     via a real console warning while testing: "Unable to preventDefault
     inside passive event listener invocation") — the browser's own
     page-zoom/scroll would fire right alongside the in-app zoom. Only a
     directly-attached, {passive:false} listener can actually suppress it. */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = stage.getBoundingClientRect()
      zoomBy(event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    }
    stage.addEventListener('wheel', handler, { passive: false })
    return () => stage.removeEventListener('wheel', handler)
  }, [stageRef, zoomBy])

  /* Must run AFTER the canvas has been resized to the new `displayScale`
     — the caller's own draw layout effect calls this as its last step, so
     ordering is explicit rather than relying on cross-hook effect order. */
  const applyPendingScrollAdjust = useCallback(() => {
    const stage = stageRef.current
    const adjust = pending.current
    if (!stage || !adjust) return
    pending.current = null
    const ratio = zoomPct / adjust.prevPct
    stage.scrollLeft = adjust.contentX * ratio - adjust.pointerX
    stage.scrollTop = adjust.contentY * ratio - adjust.pointerY
  }, [stageRef, zoomPct])

  return {
    zoomPct: Math.round(zoomPct),
    fitPct: Math.round(fitPct),
    displayScale: zoomPct / 100,
    zoomIn,
    zoomOut,
    zoomToFit,
    applyPendingScrollAdjust,
  }
}
