/* The scene bank in memory (/api/scenes) + the « unsaved changes » flag.
   Ported from `static/scenes-store.js` and the bank half of `static/advanced.js`.

   WHY THE EDIT STATE LIVES HERE AND NOT IN THE SCREEN. The legacy frontend kept
   every screen in the DOM, so the values typed into the scene cards survived
   navigating away. React unmounts. Holding the drafts in the store keeps that:
   `#dirtyBar` warns that "des scènes existent seulement dans cette page", and
   the page has to still have them when one comes back.

   THE MERGE INVARIANT (25/08/2026). `collectScenes()` used to rebuild each scene
   from the fields the card displays. Everything the card did NOT display was
   therefore erased on save: `wardrobe`, `intensity`, `tags`, `tones` and
   `intention` disappeared from the bank's 16 scenes in one save. Here a draft
   carries `base` — the scene object as the server sent it — and saving SPREADS
   it. A key the form does not know traverses the save untouched by construction,
   not by discipline.

   RAW TEXT, CONVERTED ON SAVE. The wardrobe, variants, tones and tags fields
   hold their TEXT, exactly as the DOM did. Converting on every keystroke would
   destroy what is being typed: `0` alone is not a valid wardrobe line, and a
   round trip through the parser would erase it under the cursor. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { errorOf, type ActionLike, type Schema } from '../api/client'
import { useApi } from '../api/useApi'
import { useCharacter } from '../character/CharacterContext'
import { useFaults } from './FaultsContext'

export type SceneBank = Schema<'SceneBankResponse'>

/* `data` is scenes.json VERBATIM — the backend relays it unmodelled on purpose
   (the file belongs to the character, not to that layer). This is the shape the
   BANK SCREEN reads and writes; every other key rides along in `base`. */
export type Scene = {
  id: string
  intention?: string
  category?: string
  format?: string
  count?: number
  guidance?: number
  prompt?: string
  intensity?: number | number[]
  wardrobe?: Record<string, string | string[]>
  variants?: string[]
  tones?: string[]
  tags?: string[]
  pose?: string
  [key: string]: unknown
}

export type SceneDocument = {
  scenes: Scene[]
  anchor?: string
  direction?: string
  [key: string]: unknown
}

/** One card's form state. `base` is what the merge rests on. */
export type SceneDraft = {
  /* Stable identity of the DRAFT, never of the scene. `id` is edited keystroke
     by keystroke and two scenes can briefly carry the same one, so it makes a
     poor React key and a worse selection key: removing the third scene shifted
     every following one onto its neighbour's DOM state. The workbench selects
     on this. */
  uid: string
  base: Scene
  id: string
  intention: string
  format: string
  count: string
  guidance: string
  bandLo: string
  tones: string
  tags: string
  prompt: string
  wardrobe: string
  variants: string
  pose: string
}

/* ---------------------------------------------------------------- wardrobe
   wardrobe <-> text, one outfit per line prefixed by its level:
     0: a beige knit sweater and jeans
     0: wide beige trousers and a simple white shirt
     1: a loose beige cardigan
   One level can carry SEVERAL outfits (mode_tenue_jour does), so the format
   renders a string or a list indifferently and the round trip is faithful to
   the original shape. An outfit contains commas but never a line break — the
   line break separates, never the comma. */
export function wardrobeToText(wardrobe: Scene['wardrobe']): string {
  const lines: string[] = []
  Object.keys(wardrobe ?? {})
    .sort()
    .forEach((level) => {
      const value = wardrobe![level]
      ;(Array.isArray(value) ? value : [value]).forEach((outfit) =>
        lines.push(`${level}: ${outfit}`),
      )
    })
  return lines.join('\n')
}

export function textToWardrobe(text: string): Record<string, string | string[]> {
  const out: Record<string, string[]> = {}
  ;(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^(\d+)\s*:\s*(.+)$/)
      if (match) (out[match[1]] = out[match[1]] ?? []).push(match[2].trim())
    })
  const collapsed: Record<string, string | string[]> = {}
  Object.keys(out).forEach((k) => {
    collapsed[k] = out[k].length === 1 ? out[k][0] : out[k]
  })
  return collapsed
}

/* A wardrobe line without a level would be dropped in silence by
   textToWardrobe. We refuse the save rather than lose the outfit: that is
   exactly the kind of quiet loss that cost the bank on 25/08/2026. */
export function invalidOutfits(drafts: SceneDraft[]): string[] {
  const bad: string[] = []
  drafts.forEach((draft) => {
    ;(draft.wardrobe || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        if (!/^\d+\s*:\s*.+$/.test(line)) bad.push(`${draft.id} → « ${line} »`)
      })
  })
  return bad
}

/* A scene's band: minimum typed, maximum DEDUCED from the declared outfits.
   Mirror of `lb.scene_band`. The server stays the reference (bank.meta), but a
   scene added and not yet saved is not in it — hence this local computation,
   which must remain the exact copy of the server rule. */
export function bandOf(scene: { intensity?: number | number[]; wardrobe?: Scene['wardrobe'] }): [number, number] {
  const raw = scene.intensity
  const lo = Array.isArray(raw)
    ? Number.parseInt(String(raw[0]), 10) || 0
    : Number.isInteger(raw)
      ? (raw as number)
      : 0
  const levels = Object.keys(scene.wardrobe ?? {})
    .filter((k) => /^\d+$/.test(k))
    .map(Number)
  const hi = levels.length ? Math.max(...levels) : Math.max(lo, 1)
  return [lo, Math.max(lo, hi)]
}

/* Draft identity, handed out in order. A counter and not a random id: it makes
   the fumigation reproducible, and nothing outside this module reads it. */
let uidCounter = 0
const nextUid = () => `d${++uidCounter}`

export function draftOf(scene: Scene): SceneDraft {
  const band = bandOf(scene)
  return {
    uid: nextUid(),
    base: scene,
    id: scene.id ?? '',
    // `category` was a duplicate of the intention that doubled as the export
    // folder: the card preselects the intention, and saving drops the dead key
    intention: scene.intention ?? scene.category ?? '',
    format: scene.format ?? '4:5',
    count: String(scene.count ?? 1),
    guidance: scene.guidance == null ? '' : String(scene.guidance),
    bandLo: String(band[0]),
    tones: (scene.tones ?? []).join(', '),
    tags: (scene.tags ?? []).join(', '),
    prompt: scene.prompt ?? '',
    wardrobe: wardrobeToText(scene.wardrobe),
    variants: (scene.variants ?? []).join('\n'),
    pose: scene.pose ?? '',
  }
}

/* Turns the drafts back into scenes, by MERGING onto the original object —
   never by rebuilding. An optional field is SET or REMOVED: without the removal
   one could no longer empty a value from the interface once it existed. */
export function draftsToScenes(drafts: SceneDraft[]): Scene[] {
  const keys = (text: string) =>
    text
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  const lines = (text: string) =>
    text
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
  const empty = (value: unknown) =>
    value == null ||
    value === '' ||
    (Array.isArray(value) && !value.length) ||
    (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length)

  return drafts.map((draft) => {
    const scene: Scene = { ...draft.base } // <- the merge
    const put = (key: string, value: unknown) => {
      if (empty(value)) delete scene[key]
      else scene[key] = value
    }
    scene.id = draft.id.trim()
    scene.format = draft.format
    scene.count = Number.parseInt(draft.count, 10) || 1
    scene.prompt = draft.prompt.trim()
    put('intention', draft.intention)
    put('guidance', draft.guidance ? Number.parseFloat(draft.guidance) : null)
    put('tones', keys(draft.tones))
    put('tags', keys(draft.tags))
    put('wardrobe', textToWardrobe(draft.wardrobe))
    put('variants', lines(draft.variants))
    const lo = Number.parseInt(draft.bandLo, 10)
    // the maximum is deduced from the outfits: only the minimum is written
    put('intensity', Number.isInteger(lo) ? Math.max(0, lo) : null)
    // imposed skeleton (ControlNet): a filename from INPUTS/POSE/, or nothing
    put('pose', draft.pose)
    delete scene.category
    return scene
  })
}

/** A brand-new scene is born with the COMPLETE shape: without a band or an
    outfit it would exist only at level 0 and the intensity slider would have no
    grip on it. The world is NOT here — it belongs to the character, and
    `stampWorld` puts it on at the moment the scene is added. */
export const NEW_SCENE: Scene = {
  id: 'nouvelle_scene',
  intention: 'lifestyle',
  tags: [],
  tones: [],
  intensity: 0,
  format: '4:5',
  count: 1,
  prompt: '',
  wardrobe: { '0': 'everyday clothing' },
  variants: [],
}

/* Mirror of `stamp_world()` in api/services/bank.py (ADR-0014 §4). A scene is a
   composition INSIDE the character's world, and one born in the browser has no
   way to know it — the server accepts it untagged and stamps it, which is the
   one tolerance of the lock. Stamping here too means the draft on screen says
   what will be written, instead of the interface and the file disagreeing until
   the next reload.

   It only fills what is ABSENT: a scene that already carries a world keeps it,
   and the save then refuses it if it is a foreign one. Repairing it silently
   here would hide exactly what the lock exists to show. */
export function stampWorld(scene: Scene, world: string | null): Scene {
  if (!world) return scene
  const stamped = { ...scene }
  if (!stamped.world) stamped.world = world
  if (!stamped.origin) stamped.origin = 'manual'
  return stamped
}

type SaveResult = { ok: boolean; erreur?: string }

type ScenesStoreValue = {
  bank: SceneBank | null
  drafts: SceneDraft[]
  anchor: string
  direction: string
  dirty: boolean
  /** Skeleton names of INPUTS/POSE/, served alongside the bank. */
  poses: string[]
  setAnchor: (value: string) => void
  setDirection: (value: string) => void
  patchDraft: (index: number, patch: Partial<SceneDraft>) => void
  /** Adds a scene and returns its draft uid, so the caller can open it. */
  addScene: (scene?: Scene) => string
  removeScene: (index: number) => void
  /** Replaces the whole document from the raw JSON panel. Throws on bad JSON. */
  applyRawJson: (text: string) => void
  rawJson: string
  /** World of the CHARACTER, frozen at its creation. Null before the sheet lands. */
  world: { id: string; label: string } | null
  /* World the DOCUMENT on disk carries, which is normally the same one. They
     part company on a bank predating ADR-0014 (none) or one pasted from another
     character (a foreign one) — the banner says so rather than letting the save
     be the first to mention it. */
  documentWorld: string | null
  load: (guardEditor?: boolean) => Promise<void>
  save: () => Promise<SaveResult>
}

const Ctx = createContext<ScenesStoreValue | null>(null)

export function ScenesStoreProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const { claimed, sheet } = useCharacter()
  const { report } = useFaults()
  const [bank, setBank] = useState<SceneBank | null>(null)
  const [drafts, setDrafts] = useState<SceneDraft[]>([])
  const [anchor, setAnchorState] = useState('')
  const [direction, setDirectionState] = useState('')
  const [dirty, setDirty] = useState(false)
  /* Keys the raw document carries beyond scenes/anchor/direction. scenes.json
     belongs to the character; this layer must not drop what it does not know. */
  const extra = useRef<Record<string, unknown>>({})
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty

  /* THE LIVE COPY, and why it exists. `save` is a `useCallback`: it closes over
     the document of the render that built it. The composer adds a scene and
     saves it IN THE SAME TICK — so it was posting the bank as it stood BEFORE
     the addition, then reloading over the draft. The scene vanished while the
     toast said « enregistrée dans scenes.json ».
     Every mutation writes here as well as into state; `save` reads here. */
  const draftsRef = useRef<SceneDraft[]>([])
  const anchorRef = useRef('')
  const directionRef = useRef('')

  const putDrafts = useCallback(
    (next: SceneDraft[] | ((current: SceneDraft[]) => SceneDraft[])) => {
      const value = typeof next === 'function' ? next(draftsRef.current) : next
      draftsRef.current = value
      setDrafts(value)
    },
    [],
  )

  const markDirty = useCallback(() => setDirty(true), [])

  /* The character's world, frozen at its creation (ADR-0012 §4). Read, never
     chosen: no screen writes a sheet. */
  const world = (sheet?.world as { id: string; label: string } | null) ?? null

  const load = useCallback(
    async (guardEditor = false) => {
      /* Guarded by "there are unsaved changes", not by "the Scenes screen is
         showing": rebuilding the cards from the server while additions or a raw
         JSON application are pending is the only real risk. */
      const editing = guardEditor && dirtyRef.current
      let response: (SceneBank & ActionLike) | null = null
      try {
        response = await api.get<SceneBank>('/api/scenes')
      } catch {
        response = null
      }
      const document_ = response?.data as SceneDocument | undefined
      const failure =
        !response
          ? 'serveur injoignable'
          : errorOf(response) ||
            (document_ && Array.isArray(document_.scenes) ? null : 'banque de scènes illisible')
      report('banque de scènes', failure)
      if (failure) {
        /* Keep the previous bank if we had one: a possibly stale screen that
           SAYS so beats an empty one that says nothing. */
        if (!bank) setBank({ data: { scenes: [] }, poses: [] } as unknown as SceneBank)
        return
      }
      setBank(response!)
      if (editing) return // never overwrite unsaved work
      const { scenes, anchor: a, direction: d, ...rest } = document_!
      extra.current = rest
      putDrafts(scenes.map(draftOf))
      anchorRef.current = a ?? ''
      directionRef.current = d ?? ''
      setAnchorState(a ?? '')
      setDirectionState(d ?? '')
    },
    [api, bank, report],
  )

  // the bank belongs to a character: switching reloads it, and drops the drafts
  // of the previous one — they were that character's scenes, not these
  useEffect(() => {
    setDirty(false)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimed])

  const setAnchor = useCallback((value: string) => {
    anchorRef.current = value
    setAnchorState(value)
    setDirty(true)
  }, [])
  const setDirection = useCallback((value: string) => {
    directionRef.current = value
    setDirectionState(value)
    setDirty(true)
  }, [])

  /* Any keystroke in a scene card counts as an unsaved change — otherwise only
     adding and the raw JSON were protected, not editing an existing scene. */
  const patchDraft = useCallback((index: number, patch: Partial<SceneDraft>) => {
    putDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    )
    markDirty()
  }, [markDirty, putDrafts])

  /* Adds and RETURNS the draft's uid: the workbench opens the new scene in the
     inspector, and a scene created blind in a grid of twenty is not created.
     The world is stamped here — a draft that says on screen what will be
     written (ADR-0014 §4). */
  const addScene = useCallback((scene: Scene = NEW_SCENE) => {
    const draft = draftOf(stampWorld({ ...scene }, world?.id ?? null))
    putDrafts((current) => [...current, draft])
    markDirty()
    return draft.uid
  }, [markDirty, putDrafts, world])

  const removeScene = useCallback((index: number) => {
    putDrafts((current) => current.filter((_, i) => i !== index))
    markDirty()
  }, [markDirty, putDrafts])

  const document_ = useMemo<SceneDocument>(
    () => ({ ...extra.current, anchor, direction, scenes: draftsToScenes(drafts) }),
    [drafts, anchor, direction],
  )

  const applyRawJson = useCallback((text: string) => {
    const parsed = JSON.parse(text) as SceneDocument
    if (!parsed || !Array.isArray(parsed.scenes)) throw new Error('pas de liste `scenes`')
    const { scenes, anchor: a, direction: d, ...rest } = parsed
    extra.current = rest
    putDrafts(scenes.map(draftOf))
    anchorRef.current = a ?? ''
    directionRef.current = d ?? ''
    setAnchorState(a ?? '')
    setDirectionState(d ?? '')
    markDirty()
  }, [markDirty, putDrafts])

  const save = useCallback(async (): Promise<SaveResult> => {
    /* From the refs, not from this closure — see THE LIVE COPY above. */
    const live = draftsRef.current
    const bad = invalidOutfits(live)
    if (bad.length) {
      const message =
        'tenue sans niveau — ' +
        bad[0] +
        (bad.length > 1 ? ` (+${bad.length - 1} autre(s))` : '') +
        ' · préfixe chaque ligne par « 0: » ou « 1: »'
      return { ok: false, erreur: message }
    }
    const payload: SceneDocument = {
      ...extra.current,
      anchor: anchorRef.current,
      direction: directionRef.current,
      scenes: draftsToScenes(live),
    }
    const response = await api.post<ActionLike>('/api/scenes', { data: payload })
    const failure = errorOf(response)
    if (failure) return { ok: false, erreur: failure }
    setDirty(false)
    await load()
    return { ok: true }
  }, [api, load])

  const value = useMemo<ScenesStoreValue>(
    () => ({
      bank,
      drafts,
      anchor,
      direction,
      dirty,
      poses: bank?.poses ?? [],
      setAnchor,
      setDirection,
      patchDraft,
      addScene,
      removeScene,
      applyRawJson,
      rawJson: JSON.stringify(document_, null, 2),
      world,
      documentWorld: (extra.current.world as string | undefined) ?? null,
      load,
      save,
    }),
    [
      bank,
      drafts,
      anchor,
      direction,
      dirty,
      setAnchor,
      setDirection,
      patchDraft,
      addScene,
      removeScene,
      applyRawJson,
      document_,
      world,
      load,
      save,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useScenes(): ScenesStoreValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('useScenes hors de ScenesStoreProvider')
  return value
}
