/* The world registry, at /worlds (ADR-0016) — a navbar destination of its
   own, on the same footing as Produire or Revue.

   REGISTRY + A SHORT CREATION FORM, one screen, same shape as
   `CharactersScreen.tsx` (a grid of cards + a dashed "+ new" card). The
   difference: creating a character is a multi-step wizard (identity base,
   frozen forever); creating a world is a SHORT form — id, name, an existing
   pack, an optional tone — because all it does is write an empty catalog.
   No wizard file for something this small.

   THE PACK IS A PROPOSAL, NOT A ROUTING CHOICE (ADR-0016 §2): the form picks
   one only to let the server derive `compatible_families` — it never writes
   a new entry into `universe.resolve()`'s table, and the created world stays
   proposable to any pack of the same family afterwards.

   A NEW WORLD'S CATALOG IS EMPTY: creating one always ends on its places
   editor (`worldPlacesPath`), because an empty catalog is not useful on its
   own — the very next thing to do is add a place to it. */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { errorOf, type Schema } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useToast } from '../../chrome/ToastContext'
import { worldPlacesPath } from '../../app/routes'

type WorldListResponse = Schema<'WorldListResponse'>
type WorldOptionsResponse = Schema<'WorldOptionsResponse'>
type CreateWorldResponse = Schema<'CreateWorldResponse'>
type WorldSummary = Schema<'WorldSummary'>
type PackOption = Schema<'PackOption'>

const CID_RE = /^[a-z][a-z0-9_-]*$/

const CARD =
  'block rounded-card border-2 bg-panel px-[15px] py-[14px] text-txt no-underline ' +
  'hover:border-line2 focus-visible:outline-2 focus-visible:outline-focus ' +
  'focus-visible:outline-offset-2 flex flex-col justify-center gap-[4px]'

function WorldCard({ world }: { world: WorldSummary }) {
  return (
    <a className={`${CARD} border-line`} href={worldPlacesPath(world.id)} data-world-card>
      <b className="block text-[15px] font-semibold">{world.label}</b>
      <code className="font-code text-[12px] leading-[normal] text-dim2">{world.id}</code>
      <div className="mt-[10px] flex flex-wrap gap-[6px]">
        {(world.compatible_families ?? []).map((f) => (
          <span
            key={f}
            className="rounded-[20px] border px-[8px] py-[2px] text-[11px] whitespace-nowrap border-line2 text-dim"
          >
            {f}
          </span>
        ))}
        <span className="rounded-[20px] border px-[8px] py-[2px] text-[11px] whitespace-nowrap border-line2 text-dim">
          {world.places_count} lieu{world.places_count > 1 ? 'x' : ''}
        </span>
      </div>
    </a>
  )
}

function NewWorldCard({
  packs,
  creating,
  onCreate,
}: {
  packs: PackOption[]
  creating: boolean
  onCreate: (fields: { id: string; label: string; pack: string; tone: string }) => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [id, setId] = useState('')
  const [label, setLabel] = useState('')
  const [pack, setPack] = useState(packs[0]?.id ?? '')
  const [tone, setTone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const idValid = CID_RE.test(id)
  const family = packs.find((p) => p.id === pack)?.family ?? null
  const ready = idValid && label.trim() && pack

  if (!open) {
    return (
      <button
        type="button"
        className={`${CARD} border-line border-dashed w-full text-left cursor-pointer`}
        data-new
        onClick={() => setOpen(true)}
      >
        <b className="block text-[15px] font-semibold text-acc">+ Nouveau monde</b>
        <span className="tiny">catalogue vide, pack déjà curaté</span>
      </button>
    )
  }

  return (
    <div className={`${CARD} border-acc`} data-new-open>
      <b className="block text-[15px] font-semibold">Nouveau monde</b>

      <label className="f mt-[8px]">
        <span>nom</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex : Terres sauvages" />
      </label>

      <label className="f mt-[8px]">
        <span>
          identifiant <span className="tiny">{!id ? '' : idValid ? '✓' : '— minuscules, chiffres, - et _'}</span>
        </span>
        <input value={id} onChange={(e) => setId(e.target.value.trim())} placeholder="slug" spellCheck={false} />
      </label>

      <label className="f mt-[8px]">
        <span>
          pack — sert seulement à dériver la famille compatible
          {family && <> · <b>{family}</b></>}
        </span>
        <select value={pack} onChange={(e) => setPack(e.target.value)}>
          {packs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.family})
            </option>
          ))}
        </select>
      </label>

      <label className="f mt-[8px]">
        <span>ton (optionnel)</span>
        <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="ex : calm, natural light" />
      </label>

      {error && (
        <p className="tiny mt-[8px] text-danger-txt" role="alert">
          {error}
        </p>
      )}

      <div className="mt-[10px] flex gap-[8px]">
        <button
          className="btn primary sm"
          disabled={!ready || creating}
          onClick={async () => {
            setError(null)
            const failure = await onCreate({ id, label: label.trim(), pack, tone: tone.trim() })
            if (failure) setError(failure)
          }}
        >
          Créer
        </button>
        <button className="btn sm" onClick={() => setOpen(false)} disabled={creating}>
          Annuler
        </button>
      </div>
    </div>
  )
}

export function WorldsScreen() {
  const api = useApi()
  const toast = useToast()
  const navigate = useNavigate()
  const [worlds, setWorlds] = useState<WorldSummary[] | null>(null)
  const [packs, setPacks] = useState<PackOption[]>([])
  const [failed, setFailed] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const [worldsResponse, optionsResponse] = await Promise.all([
      api.get<WorldListResponse>('/api/worlds').catch(() => null),
      api.get<WorldOptionsResponse>('/api/worlds/options').catch(() => null),
    ])
    const failure =
      !worldsResponse || errorOf(worldsResponse) || !Array.isArray(worldsResponse.worlds)
        ? 'registre des mondes illisible'
        : null
    if (failure) {
      setFailed(true)
      return
    }
    setFailed(false)
    setWorlds(worldsResponse!.worlds)
    setPacks(optionsResponse && !errorOf(optionsResponse) ? (optionsResponse.packs ?? []) : [])
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  const onCreate = async (fields: { id: string; label: string; pack: string; tone: string }) => {
    setCreating(true)
    const response = await api.post<CreateWorldResponse>('/api/worlds', fields)
    setCreating(false)
    const failure = errorOf(response)
    if (failure) return failure
    toast(`monde « ${fields.label} » créé`)
    navigate(worldPlacesPath(response.id))
    return null
  }

  if (failed) {
    return (
      <div className="screen">
        <div className="wrap">
          <div className="empty">
            <b>Registre indisponible</b>
            La liste des mondes n'a pas pu être lue.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen" id="worlds">
      <div className="wrap">
        <h2>Mondes</h2>
        <p className="tiny mt-[6px] mb-[18px]">
          Le cadre que composent les personnages. Ouvrir un monde mène à son catalogue de lieux ;
          le catalogue d'un monde neuf est vide.
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-[14px]">
          {worlds === null && <p className="tiny">chargement du registre…</p>}
          {worlds?.map((world) => (
            <WorldCard key={world.id} world={world} />
          ))}
          {worlds !== null && <NewWorldCard packs={packs} creating={creating} onCreate={onCreate} />}
        </div>
      </div>
    </div>
  )
}
