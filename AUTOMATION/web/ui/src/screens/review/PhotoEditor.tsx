/* OPTICAL photo editor: crop, rotation, mirror, straighten, colorimetry, manual
   grain. All in the browser (canvas), no GPU pass, instant result. Editing by
   INSTRUCTION (Qwen) is ANOTHER tool, the one of the adult branch — this file
   knows nothing about it, and will have neither brush nor mask.

   Ported from `static/editor.js`. THE MATHS ARE UNCHANGED, on purpose: canvas
   work is imperative, and rewriting it « the React way » would have meant
   re-deriving every geometry decision below. React owns the SETTINGS; the
   drawing stays a function of them, run in a layout effect.

   The displayed canvas is at SCREEN size to stay fluid while the sliders move;
   saving redraws everything at the ORIGINAL resolution in a separate offscreen
   canvas, so no quality is lost. Crop coordinates are therefore always in
   DISPLAY pixels and converted by the scale factor at export time.

   TWO BEHAVIOURS THAT ARE NOT DEFAULTS BY ACCIDENT (F3):
     - CROP OPENS OFF. The frame carries a 2000 px veil: on by default it
       darkened the image on entry, for a gesture one does not make on every
       retouch.
     - SAVING KEEPS ITS DEFAULT MEANING — a COPY `<name>_edit`, source intact.
       « Écraser la source » exists, in second rank and under confirmation: it is
       the only path of this screen that destroys anything, and it says what it
       costs. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { errorOf, type ActionLike } from '../../api/client'
import { useApi } from '../../api/useApi'
import {
  applyGrain,
  applyTemperature,
  cssFilter,
  FILL,
  NEUTRAL,
  RATIOS,
  SLIDERS,
  type Crop,
  type Ratio,
  type Settings,
} from './photoEditorPixels'
import {
  ACTIONS, BOX, BTNS, BTNS2, CANVAS, CANVAS_WRAP, CARD, CLOSE, CROP_BOX, FLIP_ON,
  FRAME, HANDLE, HANDLES, HEAD, LAB, ROW, SEC, SIDE, SLIDER, STAGE, VAL,
} from './photoEditorStyles'
import { useConfirm } from '../../chrome/ConfirmContext'
import { Dialog } from '../../chrome/Dialog'
import { useRovingChoice } from '../../chrome/useRovingChoice'
import { useToast } from '../../chrome/ToastContext'
import type { GalleryItem } from './useTriage'

export function PhotoEditor({
  item,
  src,
  onClose,
  onSaved,
}: {
  item: GalleryItem
  src: string
  onClose: () => void
  onSaved: () => void
}) {
  const api = useApi()
  const confirm = useConfirm()
  const toast = useToast()

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{ mode: string; sx: number; sy: number; orig: Crop } | null>(null)

  const [settings, setSettings] = useState<Settings>(NEUTRAL)
  const [ratio, setRatio] = useState<Ratio>(null)
  /* `crop === null` IS the « no crop » state — it is already what the frame, the
     clamp and the export read. There is no second flag to keep in sync: turning
     it on is giving oneself a frame, turning it off is taking it back. */
  const [crop, setCrop] = useState<Crop | null>(null)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState("chargement de l'image…")
  const [busy, setBusy] = useState(false)

  /* Avant/après (design-pass screen-5, §E) — a TRANSIENT preview toggle,
     never routed through `setSettings`/`patch`/`reset`: those persist real
     edits, this only changes what the canvas DRAWS. `reset()` below is the
     precedent for what NOT to imitate — it already calls `setSettings
     (NEUTRAL)`, which zeroes `rot`/`flip`/`straighten` right along with the
     colour fields, because `Settings` bundles geometry and colorimetry in
     one flat type. Swapping to NEUTRAL that way here would silently reset
     rotation/mirror/straighten too — exactly what "sans recadrage ni
     rotation" forbids. */
  const [beforeAfter, setBeforeAfter] = useState(false)

  /* #edRatio, roving radiogroup (a11y audit, design-pass screen-5) — same
     gabarit as the other four groups of ReviewScreen.tsx. `data-r` and the
     `'on'` class are unchanged, additive only (test_editor.js reads both). */
  const activeRatioId = !ratio ? 'libre' : `${ratio.w}:${ratio.h}`
  const ratioRoving = useRovingChoice(RATIOS, activeRatioId)

  /* `body.editing` is kept: it is no longer what DISPLAYS the editor (the
     <dialog> does), but it still holds the studio's keyboard shortcuts at bay
     (the review handler tests it) and hides the rail under the veil. */
  useEffect(() => {
    document.body.classList.add('editing')
    return () => document.body.classList.remove('editing')
  }, [])

  useEffect(() => {
    const image = new Image()
    image.onload = () => {
      imageRef.current = image
      setReady(true)
      setMessage('')
    }
    image.onerror = () => setMessage("échec du chargement de l'image")
    image.src = src
    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [src])

  // --- geometry -----------------------------------------------------------
  /** Dimensions AFTER the 90° rotation. The straighten, a fine angle, does not
      change the frame — see safetyMargin. */
  const rotatedDims = useCallback(() => {
    const image = imageRef.current!
    const w = image.naturalWidth
    const h = image.naturalHeight
    return settings.rot % 2 ? { w: h, h: w } : { w, h }
  }, [settings.rot])

  /* A non-zero straighten leaves transparent corners at the canvas edge. We do
     not compute the exact inscribed rectangle: the crop frame is inset by a
     margin proportional to tan(angle), enough that a crop inside can never catch
     a transparent corner. */
  const safetyMargin = useCallback(
    (width: number, height: number) => {
      const a = (Math.abs(settings.straighten) * Math.PI) / 180
      return Math.ceil((Math.tan(a) * Math.max(width, height)) / 2)
    },
    [settings.straighten],
  )

  /* Ratio between the DISPLAYED canvas and the working canvas. It is 1 as long
     as the sizing did its job, but `max-width:100%` stays a safety net: without
     this conversion a canvas rescaled by CSS would make the frame drift and drag
     by as much. */
  const displayScale = () => {
    const canvas = canvasRef.current
    if (!canvas) return 1
    const rendered = canvas.getBoundingClientRect().width
    return rendered && canvas.width ? rendered / canvas.width : 1
  }

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imageRef.current) return
    const { w, h } = rotatedDims()
    /* The REAL room of the work surface, on both axes. The old ceilings were
       written as constants and left the image at 29 % of the available room on a
       measured 1112 x 844 stage. The modal having a known size, measuring is
       reliable. */
    const pad = 32 // the stage's p-[16px], both sides
    const maxW = Math.max(200, (stageRef.current?.clientWidth || 760) - pad)
    const maxH = Math.max(200, (stageRef.current?.clientHeight || 560) - pad)
    // never above 1: enlarging an image past its resolution blurs it without
    // showing anything more
    const scale = Math.min(maxW / w, maxH / h, 1)
    canvas.width = Math.max(40, Math.round(w * scale))
    canvas.height = Math.max(40, Math.round(h * scale))
    canvas.style.width = `${canvas.width}px`
    canvas.style.height = `${canvas.height}px`
  }, [rotatedDims])

  const centredCrop = useCallback((): Crop => {
    const canvas = canvasRef.current!
    const m = safetyMargin(canvas.width, canvas.height)
    const availW = Math.max(24, canvas.width - 2 * m)
    const availH = Math.max(24, canvas.height - 2 * m)
    let w: number
    let h: number
    if (ratio) {
      const r = ratio.w / ratio.h
      if (availW / availH > r) {
        h = availH
        w = h * r
      } else {
        w = availW
        h = w / r
      }
    } else {
      w = availW
      h = availH
    }
    w *= FILL
    h *= FILL
    return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h }
  }, [ratio, safetyMargin])

  // --- drawing ------------------------------------------------------------
  useLayoutEffect(() => {
    if (!ready) return
    sizeCanvas()
    const canvas = canvasRef.current!
    const image = imageRef.current!
    const ctx = canvas.getContext('2d')!
    const scale = canvas.width / rotatedDims().w
    /* Avant/après ONLY swaps colorimetry/grain for the NEUTRAL constant —
       geometry (`rot`/`flip`/`straighten`, read straight off `settings`
       below, never off this) stays the real one whether toggled or not. A
       fresh object each render, deliberately not lifted out of the effect:
       `useLayoutEffect`'s own dependency array already tracks `settings`
       and `beforeAfter`, tracking a THIRD derived object too would just be
       the same two dependencies spelled out twice. */
    const displaySettings: Settings = beforeAfter
      ? { ...settings, bright: NEUTRAL.bright, contrast: NEUTRAL.contrast, sat: NEUTRAL.sat, temp: NEUTRAL.temp, grain: NEUTRAL.grain }
      : settings
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.filter = cssFilter(displaySettings)
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate(((settings.rot * 90 + settings.straighten) * Math.PI) / 180)
    // the mirror applies AFTER the rotation, on the image as it is seen:
    // flipping before would reverse the direction every other quarter turn
    if (settings.flip) ctx.scale(-1, 1)
    ctx.drawImage(
      image,
      (-image.naturalWidth * scale) / 2,
      (-image.naturalHeight * scale) / 2,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    )
    ctx.restore()
    ctx.filter = 'none'
    applyGrain(ctx, canvas.width, canvas.height, displaySettings.grain)
    applyTemperature(ctx, canvas.width, canvas.height, displaySettings.temp)
  }, [ready, settings, beforeAfter, sizeCanvas, rotatedDims])

  /* A 90° rotation swaps width and height: the canvas is recomputed, and an
     existing frame no longer means anything in the new frame of reference — so
     it is recentred. Crop off, it STAYS off: rotating is not cropping. */
  const rotate = (delta: number) => {
    setSettings((s) => ({ ...s, rot: (s.rot + delta + 4) % 4 }))
    setCrop((c) => (c ? c : null))
  }
  useLayoutEffect(() => {
    if (crop) setCrop(centredCrop())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.rot, ratio])

  /* The straighten changes the safety margin: an existing frame is re-clamped so
     it can never end up over a transparent corner. */
  useLayoutEffect(() => {
    if (!crop || !canvasRef.current) return
    const canvas = canvasRef.current
    const m = safetyMargin(canvas.width, canvas.height)
    const maxX = canvas.width - m
    const maxY = canvas.height - m
    const w = Math.min(crop.w, Math.max(24, maxX - m))
    const h = Math.min(crop.h, Math.max(24, maxY - m))
    const x = Math.max(m, Math.min(crop.x, maxX - w))
    const y = Math.max(m, Math.min(crop.y, maxY - h))
    if (w !== crop.w || h !== crop.h || x !== crop.x || y !== crop.y) setCrop({ x, y, w, h })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.straighten])

  // --- crop frame dragging -------------------------------------------------
  const onDragMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current
      const canvas = canvasRef.current
      if (!drag || !canvas) return
      // the mouse speaks in screen pixels, the crop in working pixels
      const k = displayScale() || 1
      const dx = (event.clientX - drag.sx) / k
      const dy = (event.clientY - drag.sy) / k
      const o = drag.orig
      const m = safetyMargin(canvas.width, canvas.height)
      const maxX = canvas.width - m
      const maxY = canvas.height - m

      if (drag.mode === 'move') {
        setCrop({
          ...o,
          x: Math.max(m, Math.min(o.x + dx, maxX - o.w)),
          y: Math.max(m, Math.min(o.y + dy, maxY - o.h)),
        })
        return
      }
      let nx = o.x
      let ny = o.y
      let nw = o.w
      let nh = o.h
      if (drag.mode.includes('e')) nw = o.w + dx
      if (drag.mode.includes('w')) {
        nx = o.x + dx
        nw = o.w - dx
      }
      if (drag.mode.includes('s')) nh = o.h + dy
      if (drag.mode.includes('n')) {
        ny = o.y + dy
        nh = o.h - dy
      }
      if (ratio) {
        nh = nw / (ratio.w / ratio.h)
        if (drag.mode.includes('n')) ny = o.y + o.h - nh
      }
      nw = Math.max(24, nw)
      nh = Math.max(24, nh)
      nx = Math.max(m, Math.min(nx, maxX - 24))
      ny = Math.max(m, Math.min(ny, maxY - 24))
      nw = Math.min(nw, maxX - nx)
      nh = Math.min(nh, maxY - ny)
      setCrop({ x: nx, y: ny, w: nw, h: nh })
    },
    [ratio, safetyMargin],
  )

  const startDrag = (mode: string, event: React.PointerEvent) => {
    if (!crop) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { mode, sx: event.clientX, sy: event.clientY, orig: { ...crop } }
    const stop = () => {
      document.removeEventListener('pointermove', onDragMove)
      dragRef.current = null
    }
    document.addEventListener('pointermove', onDragMove)
    document.addEventListener('pointerup', stop, { once: true })
  }

  // --- export --------------------------------------------------------------
  /** The full render, at the ORIGINAL resolution: the displayed canvas is scaled
      down to stay fluid under the sliders, those pixels are never saved. */
  const finalCanvas = () => {
    const image = imageRef.current!
    const canvas = canvasRef.current!
    const { w, h } = rotatedDims()
    const full = document.createElement('canvas')
    full.width = w
    full.height = h
    const ctx = full.getContext('2d')!
    ctx.save()
    ctx.filter = cssFilter(settings)
    ctx.translate(w / 2, h / 2)
    ctx.rotate(((settings.rot * 90 + settings.straighten) * Math.PI) / 180)
    if (settings.flip) ctx.scale(-1, 1)
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
    ctx.restore()
    ctx.filter = 'none'
    applyGrain(ctx, w, h, settings.grain)
    applyTemperature(ctx, w, h, settings.temp)

    /* Rectangle to cut out, in DISPLAYED canvas pixels. Crop off = the whole
       image: `null` is not an error case, it is the normal one since F3.1.
       Without a frame we do not naively take the whole canvas: a straighten
       tilts the image and leaves TRANSPARENT CORNERS. The safety margin is
       exactly what avoids them — it is 0 at zero angle, so flat the rectangle is
       the entire image to the pixel. */
    const m = safetyMargin(canvas.width, canvas.height)
    const rect = crop ?? { x: m, y: m, w: canvas.width - 2 * m, h: canvas.height - 2 * m }
    const factor = full.width / canvas.width // display -> real
    const out = document.createElement('canvas')
    out.width = Math.max(1, Math.round(rect.w * factor))
    out.height = Math.max(1, Math.round(rect.h * factor))
    out
      .getContext('2d')!
      .drawImage(
        full,
        rect.x * factor,
        rect.y * factor,
        rect.w * factor,
        rect.h * factor,
        0,
        0,
        out.width,
        out.height,
      )
    return out
  }

  /* ONE save path, two destinations. `replace` does not change what is computed
     — only where it lands, and what the server has to undo behind it (measures,
     export, thumbnail). */
  const save = async (replace: boolean) => {
    if (!ready || busy) return
    setBusy(true)
    setMessage('enregistrement…')
    try {
      const base64 = finalCanvas().toDataURL('image/png').split(',')[1]
      const response = await api.post<ActionLike & { name?: string; remplace?: boolean }>(
        '/api/edit/save',
        {
          name: item.name,
          bucket: item.bucket,
          space: item.space,
          remplacer: replace,
          data_base64: base64,
        },
      )
      const failure = errorOf(response)
      if (failure) {
        setMessage('')
        toast(failure || 'échec')
        return
      }
      toast(response.remplace ? `${response.name} remplacée` : `copie enregistrée : ${response.name}`)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  /* OVERWRITE THE SOURCE. The editor's only destructive gesture, so: never the
     primary button, and a confirmation that states the three consequences rather
     than an « are you sure? ». The generation's journal line does not move — it
     tells what the pipeline produced, which stays true. */
  const overwrite = async () => {
    const ok = await confirm({
      title: 'Écraser la source ?',
      button: 'Écraser la source',
      body: (
        <>
          <p>
            <b>{item.name}</b> sera remplacée sur le disque par la version
            retouchée. La version d'origine ne sera plus récupérable.
          </p>
          <p className="tiny">
            Ses mesures de réalisme portaient sur les anciens pixels : elles sont
            effacées, l'image redevient « non mesurée ». Le jugement ◉ / ◌, lui,
            est conservé, et l'export publiable est refait. La ligne de journal de
            la génération reste telle quelle.
          </p>
          <p className="tiny">« Enregistrer une copie » garde l'original intact.</p>
        </>
      ),
    })
    if (ok) await save(true)
  }

  const reset = () => {
    setSettings(NEUTRAL)
    setRatio(null)
    setCrop(null)
  }

  const k = displayScale()
  const cropStyle = crop
    ? { left: crop.x * k, top: crop.y * k, width: crop.w * k, height: crop.h * k }
    : { display: 'none' }

  const patch = (key: keyof Settings, value: number | boolean) =>
    setSettings((s) => ({ ...s, [key]: value }))

  return (
    <Dialog
      id="editorBox"
      open
      onDismiss={onClose}
      initialFocus="#edClose"
      className={BOX}
      cardClassName={CARD}
    >
      <div className={FRAME}>
        <div className={STAGE} ref={stageRef}>
          <div className={CANVAS_WRAP}>
            <canvas className={CANVAS} id="edCanvas" ref={canvasRef} />
            <div
              className={CROP_BOX}
              id="edCropBox"
              style={cropStyle}
              onPointerDown={(event) => {
                // a handle carries `data-h`; the box itself does not
                if ((event.target as HTMLElement).dataset.h) return
                startDrag('move', event)
              }}
            >
              {['nw', 'ne', 'sw', 'se'].map((handle) => (
                <div
                  key={handle}
                  className={HANDLE + ' ' + HANDLES[handle]}
                  data-h={handle}
                  onPointerDown={(event) => startDrag(handle, event)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className={SIDE}>
          <div className={HEAD}>
            <h3 className="m-0 text-[16px]">Éditer</h3>
            <button className={CLOSE} id="edClose" aria-label="Fermer l'éditeur" onClick={onClose}>
              ✕
            </button>
          </div>
          <p className="tiny mt-[4px] mb-[16px] break-all" id="edFichier">
            {item.name}
          </p>

          {/* CROP OFF / ON (F3.1). Off, the panel shows only the gesture that
              turns it on; on, the formats and the way out. Nothing is greyed —
              cropping is not unavailable, it is simply not under way.

              The sheet said this with two `display:none` rules under
              `[data-on]`; React says it by mounting one branch or the other.
              Same screen, and the attribute stays: it is what the fumigation
              reads to know which state it is in. */}
          <div className={SEC} id="edCropSec" data-on={crop ? '1' : '0'}>
            <div className={LAB}>Recadrage</div>
            {!crop ? (
              <button
                className="btn sm mt-[2px]"
                id="edCropOn"
                disabled={!ready}
                onClick={() => setCrop(centredCrop())}
              >
                Recadrer
              </button>
            ) : (
              <>
                <div className="seg" id="edRatio" role="radiogroup" aria-label="Format de recadrage">
                  {RATIOS.map((entry) => {
                    const pick = (id: string) => {
                      const next =
                        id === 'libre'
                          ? null
                          : { w: Number(id.split(':')[0]), h: Number(id.split(':')[1]) }
                      setRatio(next)
                      // picking a format IS a crop gesture: if it was off it
                      // turns on, otherwise the click would do nothing visible
                      setCrop(centredCrop())
                    }
                    return (
                      <button
                        key={entry}
                        ref={ratioRoving.registerRef(entry)}
                        role="radio"
                        aria-checked={entry === activeRatioId}
                        tabIndex={ratioRoving.tabIndexFor(entry)}
                        className={entry === activeRatioId ? 'on' : undefined}
                        data-r={entry}
                        onClick={() => pick(entry)}
                        onKeyDown={(event) => ratioRoving.onKeyDown(event, entry, pick)}
                      >
                        {entry === 'libre' ? 'Libre' : entry}
                      </button>
                    )
                  })}
                </div>
                {/* Turning it off saves nothing and does not modify the image:
                    the crop only exists at save time. We also come back to the
                    free ratio — leaving « 1:1 » lit on a crop that is off would
                    announce a constraint that no longer applies. */}
                <button
                  className="link mt-[10px] block text-left"
                  id="edCropOff"
                  onClick={() => {
                    setCrop(null)
                    setRatio(null)
                  }}
                >
                  annuler le recadrage
                </button>
              </>
            )}
          </div>

          <div className={SEC}>
            <div className={LAB}>Rotation</div>
            <div className="flex items-center gap-[10px]">
              <button className="btn sm" id="edRotL" onClick={() => rotate(-1)}>
                <span aria-hidden="true">↺</span> 90°
              </button>
              <button className="btn sm" id="edRotR" onClick={() => rotate(1)}>
                90° <span aria-hidden="true">↻</span>
              </button>
              <button
                className={`btn sm${settings.flip ? FLIP_ON : ''}`}
                id="edFlip"
                aria-pressed={settings.flip}
                onClick={() => patch('flip', !settings.flip)}
              >
                <span aria-hidden="true">⇄</span> Miroir
              </button>
            </div>
            <div className={ROW}>
              <label htmlFor="edStraighten">redresser</label>
              <span className={VAL} id="v_edStraighten">
                {settings.straighten}°
              </span>
            </div>
            <input
              className={SLIDER}
              type="range"
              id="edStraighten"
              min={-15}
              max={15}
              step={0.5}
              value={settings.straighten}
              onChange={(e) => patch('straighten', Number(e.target.value))}
            />
            {/* Straightening without cropping trims the corners at save time.
                The screen shows the tilted image WITH its empty corners: we say
                what the save will do rather than let the gap be discovered on
                the file. Nothing to say at a zero angle, or when a frame is
                down — it is then the frame that decides. */}
            <p className="tiny" id="edStraightenNote" hidden={!(settings.straighten && !crop)}>
              Les coins laissés vides par l'inclinaison seront rognés à
              l'enregistrement.
            </p>
          </div>

          <div className={SEC}>
            <div className={LAB}>Colorimétrie</div>
            {SLIDERS.map((slider) => (
              <div key={slider.key}>
                <div className={ROW}>
                  <label htmlFor={slider.id}>{slider.label}</label>
                  <span className={VAL} id={`v_${slider.id}`}>
                    {settings[slider.key]}
                  </span>
                </div>
                <input
                  className={SLIDER}
                  type="range"
                  id={slider.id}
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={settings[slider.key]}
                  onChange={(e) => patch(slider.key, Number(e.target.value))}
                />
              </div>
            ))}
          </div>

          <div className={SEC}>
            <div className={LAB}>
              Grain{' '}
              <span className="tiny">
                — manuel, sans rapport avec le grain calibré de la production
              </span>
            </div>
            <div className={ROW}>
              <label htmlFor="edGrain">quantité</label>
              <span className={VAL} id="v_edGrain">
                {settings.grain}
              </span>
            </div>
            <input
              className={SLIDER}
              type="range"
              id="edGrain"
              min={0}
              max={100}
              step={1}
              value={settings.grain}
              onChange={(e) => patch('grain', Number(e.target.value))}
            />
          </div>

          <div className="min-h-[10px] flex-1" />

          {/* STICKY FOOT. The panel scrolls — settings included — but not its
              actions: measured 30/08, the content is 1089 px for 872 of height
              and « Enregistrer une copie » fell below the fold. The main action
              of a screen is not looked for by scrolling.

              The COPY is the primary gesture: the source stays intact by
              default. « Écraser la source » is second rank and confirmed. */}
          <div className={ACTIONS}>
            {/* Avant/après (§E) — a real toggle button, `aria-pressed`
                (edFlip's own precedent), never a held key alone. Crop and
                rotation are untouched by construction (see `beforeAfter`'s
                declaration above): only colorimetry/grain swap to NEUTRAL. */}
            <button
              className={`btn sm w-full mb-[10px]${beforeAfter ? FLIP_ON : ''}`}
              id="edBeforeAfter"
              aria-pressed={beforeAfter}
              onClick={() => setBeforeAfter((v) => !v)}
            >
              {beforeAfter ? 'Afficher les réglages' : 'Avant / après'}
            </button>
            <p className="tiny" id="edMsg" role="status">
              {message || (beforeAfter ? 'original — réglages non appliqués' : '')}
            </p>
            <div className={BTNS}>
              <button className="btn sm w-full" id="edReset" onClick={reset}>
                Réinitialiser
              </button>
              <button className="link" id="edCancel" onClick={onClose}>
                annuler
              </button>
              <button
                className="btn primary w-full"
                id="edSave"
                disabled={!ready || busy}
                onClick={() => save(false)}
              >
                Enregistrer une copie
              </button>
            </div>
            <div className={BTNS2}>
              <button
                className="btn sm danger w-auto self-end"
                id="edSaveOver"
                disabled={!ready || busy}
                onClick={overwrite}
              >
                Écraser la source…
              </button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
