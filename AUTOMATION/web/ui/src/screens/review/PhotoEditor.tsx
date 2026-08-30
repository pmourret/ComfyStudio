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
import { useConfirm } from '../../chrome/ConfirmContext'
import { Dialog } from '../../chrome/Dialog'
import { useToast } from '../../chrome/ToastContext'
import type { GalleryItem } from './useTriage'
import './editor.css'

type Crop = { x: number; y: number; w: number; h: number }
type Ratio = { w: number; h: number } | null

type Settings = {
  rot: number // 0..3, steps of 90°
  flip: boolean // horizontal mirror, AFTER rotation
  straighten: number
  bright: number
  contrast: number
  sat: number
  temp: number
  grain: number
}

const NEUTRAL: Settings = {
  rot: 0,
  flip: false,
  straighten: 0,
  bright: 0,
  contrast: 0,
  sat: 0,
  temp: 0,
  grain: 0,
}

/* Share of the available box the frame takes on opening and on every ratio
   change. NOT 100 %: a frame that exactly fills the canvas has ZERO room to
   move — the clamp then locks it at x=0 and the frame looks broken while it is
   obeying (measured 30/08: a +120 px drag moved it by 0). */
const FILL = 0.92

const RATIOS = ['libre', '1:1', '4:5', '2:3', '9:16']

const SLIDERS = [
  { key: 'bright', id: 'edBright', label: 'luminosité', min: -60, max: 60, step: 1 },
  { key: 'contrast', id: 'edContrast', label: 'contraste', min: -60, max: 60, step: 1 },
  { key: 'sat', id: 'edSat', label: 'saturation', min: -100, max: 100, step: 1 },
  { key: 'temp', id: 'edTemp', label: 'température', min: -50, max: 50, step: 1 },
] as const

/* Bruit de LUMINANCE (same value on R/G/B), weighted towards the shadows — the
   same PRINCIPLE as AUTOMATION/grain.py, simplified for an on-the-fly manual
   retouch. This is NOT the calibrated grain of production, which stays governed
   by preset.grain_telephone — hence the label on screen. */
function applyGrain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
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
   a colour space. */
function applyTemperature(ctx: CanvasRenderingContext2D, w: number, h: number, value: number) {
  if (!value) return
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = Math.min(0.18, (Math.abs(value) / 50) * 0.18)
  ctx.fillStyle = value > 0 ? '#ff9d3d' : '#3daaff'
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

const cssFilter = (s: Settings) =>
  `brightness(${1 + s.bright / 100}) contrast(${1 + s.contrast / 100}) saturate(${1 + s.sat / 100})`

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
  const [message, setMessage] = useState('chargement…')
  const [busy, setBusy] = useState(false)

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
    const pad = 32 // .edStage padding, both sides
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
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.filter = cssFilter(settings)
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
    applyGrain(ctx, canvas.width, canvas.height, settings.grain)
    applyTemperature(ctx, canvas.width, canvas.height, settings.temp)
  }, [ready, settings, sizeCanvas, rotatedDims])

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
    <Dialog id="editorBox" open onDismiss={onClose} initialFocus="#edClose">
      <div className="edWrap">
        <div className="edStage" ref={stageRef}>
          <div className="edCanvasWrap">
            <canvas id="edCanvas" ref={canvasRef} />
            <div
              id="edCropBox"
              style={cropStyle}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).classList.contains('edHandle')) return
                startDrag('move', event)
              }}
            >
              {['nw', 'ne', 'sw', 'se'].map((handle) => (
                <div
                  key={handle}
                  className="edHandle"
                  data-h={handle}
                  onPointerDown={(event) => startDrag(handle, event)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="edSide">
          <div className="edHead">
            <h3>Éditer</h3>
            <button className="edClose" id="edClose" aria-label="Fermer l'éditeur" onClick={onClose}>
              ✕
            </button>
          </div>
          <p className="tiny edFichier" id="edFichier">
            {item.name}
          </p>

          <div className="edSec" id="edCropSec" data-on={crop ? '1' : '0'}>
            <div className="edLab">Recadrage</div>
            <button
              className="btn sm edCropOn"
              id="edCropOn"
              disabled={!ready}
              onClick={() => setCrop(centredCrop())}
            >
              Recadrer
            </button>
            <div className="seg edCropOnly" id="edRatio">
              {RATIOS.map((entry) => (
                <button
                  key={entry}
                  className={
                    (entry === 'libre' ? !ratio : ratio && `${ratio.w}:${ratio.h}` === entry)
                      ? 'on'
                      : undefined
                  }
                  data-r={entry}
                  onClick={() => {
                    const next =
                      entry === 'libre'
                        ? null
                        : { w: Number(entry.split(':')[0]), h: Number(entry.split(':')[1]) }
                    setRatio(next)
                    // picking a format IS a crop gesture: if it was off it turns
                    // on, otherwise the click would do nothing visible
                    setCrop(centredCrop())
                  }}
                >
                  {entry === 'libre' ? 'Libre' : entry}
                </button>
              ))}
            </div>
            {/* Turning it off saves nothing and does not modify the image: the
                crop only exists at save time. We also come back to the free
                ratio — leaving « 1:1 » lit on a crop that is off would announce
                a constraint that no longer applies. */}
            <button
              className="link edCropOnly"
              id="edCropOff"
              onClick={() => {
                setCrop(null)
                setRatio(null)
              }}
            >
              annuler le recadrage
            </button>
          </div>

          <div className="edSec">
            <div className="edLab">Rotation</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn sm" id="edRotL" onClick={() => rotate(-1)}>
                ↺ 90°
              </button>
              <button className="btn sm" id="edRotR" onClick={() => rotate(1)}>
                90° ↻
              </button>
              <button
                className={`btn sm${settings.flip ? ' on' : ''}`}
                id="edFlip"
                aria-pressed={settings.flip}
                onClick={() => patch('flip', !settings.flip)}
              >
                ⇄ Miroir
              </button>
            </div>
            <div className="edRow">
              <span>redresser</span>
              <span className="edVal" id="v_edStraighten">
                {settings.straighten}°
              </span>
            </div>
            <input
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

          <div className="edSec">
            <div className="edLab">Colorimétrie</div>
            {SLIDERS.map((slider) => (
              <div key={slider.key}>
                <div className="edRow">
                  <span>{slider.label}</span>
                  <span className="edVal" id={`v_${slider.id}`}>
                    {settings[slider.key]}
                  </span>
                </div>
                <input
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

          <div className="edSec">
            <div className="edLab">
              Grain{' '}
              <span className="tiny">
                — manuel, sans rapport avec le grain calibré de la production
              </span>
            </div>
            <div className="edRow">
              <span>quantité</span>
              <span className="edVal" id="v_edGrain">
                {settings.grain}
              </span>
            </div>
            <input
              type="range"
              id="edGrain"
              min={0}
              max={100}
              step={1}
              value={settings.grain}
              onChange={(e) => patch('grain', Number(e.target.value))}
            />
          </div>

          <div className="edSpacer" />

          {/* STICKY FOOT. The panel scrolls — settings included — but not its
              actions: measured 30/08, the content is 1089 px for 872 of height
              and « Enregistrer une copie » fell below the fold. The main action
              of a screen is not looked for by scrolling.

              The COPY is the primary gesture: the source stays intact by
              default. « Écraser la source » is second rank and confirmed. */}
          <div className="edActions">
            <p className="tiny" id="edMsg">
              {message}
            </p>
            <div className="edBtns">
              <button className="btn sm" id="edReset" onClick={reset}>
                Réinitialiser
              </button>
              <button className="link" id="edCancel" onClick={onClose}>
                annuler
              </button>
              <button
                className="btn primary"
                id="edSave"
                disabled={!ready || busy}
                onClick={() => save(false)}
              >
                Enregistrer une copie
              </button>
            </div>
            <div className="edBtns edBtns2">
              <button
                className="btn sm danger"
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
