/* State and mutations behind the pose bank grid — search/filter/sort/density
   plus the three mutations that go beyond a plain list (rename, duplicate,
   remove). Extraction stays in PosesView.tsx: it is orthogonal to browsing
   an existing bank (file input, not a row action) and does not touch any
   state this hook owns. */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { errorOf, type ActionLike, type Schema } from '../../../api/client'
import { useApi } from '../../../api/useApi'
import { useScenes } from '../../../state/ScenesStoreContext'
import type { RawPoseFrame } from '../../pose-editor/poseFrame'

export type PoseBankEntry = Schema<'PoseBankEntry'>

export type PoseBankRow = {
  name: string
  label: string | null
  source: string | null
  createdAt: string | null
  scenesUsing: string[]
}

export type ProvenanceFilter = 'all' | 'preset' | 'extraction'
export type UsageFilter = 'all' | 'used' | 'unused'
export type SortBy = 'recent' | 'name' | 'usage'
export type Density = 'compact' | 'comfortable'

type MutationResult = { ok: true; name: string } | { ok: false; erreur: string }

const DENSITY_KEY = 'soulglade.poseBank.density'

/* Same guarded-localStorage shape as ChromeContext's rail/focus flags: a
   private window or blocked storage must give a NORMAL (compact) grid,
   never throw. */
function readDensity(): Density {
  try {
    return localStorage.getItem(DENSITY_KEY) === 'comfortable' ? 'comfortable' : 'compact'
  } catch {
    return 'compact'
  }
}
function writeDensity(value: Density): void {
  try {
    localStorage.setItem(DENSITY_KEY, value)
  } catch {
    /* tant pis */
  }
}

export function usePoseBank() {
  const api = useApi()
  const { poses, load: reloadScenes, drafts } = useScenes()
  const [bankDetail, setBankDetail] = useState<Record<string, PoseBankEntry>>({})
  const [search, setSearch] = useState('')
  const [provenanceFilter, setProvenanceFilter] = useState<ProvenanceFilter>('all')
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('recent')
  const [density, setDensityState] = useState<Density>(() => readDensity())
  const [busyNames, setBusyNames] = useState<ReadonlySet<string>>(new Set())

  const setDensity = useCallback((value: Density) => {
    setDensityState(value)
    writeDensity(value)
  }, [])

  // Label/provenance/date live outside the plain `poses: string[]` every
  // OTHER pose picker reads (ScenesStoreContext) — refetched whenever that
  // list itself changes (extract/delete/duplicate), AND exposed standalone
  // for rename, which changes a label WITHOUT the filename list changing.
  const reloadBankDetail = useCallback(async () => {
    const response = await api.get<{ poses?: PoseBankEntry[] }>('/api/pose/bank')
    const map: Record<string, PoseBankEntry> = {}
    for (const entry of response.poses ?? []) map[entry.nom] = entry
    setBankDetail(map)
  }, [api])

  useEffect(() => {
    void reloadBankDetail()
  }, [reloadBankDetail, poses])

  const withBusy = useCallback(async (name: string, fn: () => Promise<MutationResult>): Promise<MutationResult> => {
    setBusyNames((prev) => new Set(prev).add(name))
    try {
      return await fn()
    } finally {
      setBusyNames((prev) => {
        const next = new Set(prev)
        next.delete(name)
        return next
      })
    }
  }, [])

  const rows = useMemo<PoseBankRow[]>(
    () =>
      poses.map((name) => {
        const entry = bankDetail[name]
        return {
          name,
          label: entry?.label ?? null,
          source: entry?.source ?? null,
          createdAt: entry?.created_at ?? null,
          scenesUsing: drafts.filter((d) => d.pose === name).map((d) => d.id || '(sans nom)'),
        }
      }),
    [poses, bankDetail, drafts],
  )

  const rowsFiltered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const kept = rows.filter((row) => {
      if (needle && !`${row.label ?? ''} ${row.name}`.toLowerCase().includes(needle)) return false
      if (provenanceFilter !== 'all' && row.source !== provenanceFilter) return false
      if (usageFilter === 'used' && row.scenesUsing.length === 0) return false
      if (usageFilter === 'unused' && row.scenesUsing.length > 0) return false
      return true
    })
    return kept.sort((a, b) => {
      if (sortBy === 'name') return (a.label || a.name).localeCompare(b.label || b.name, 'fr')
      if (sortBy === 'usage') return b.scenesUsing.length - a.scenesUsing.length
      // 'recent': most recently created first; a pose with no known date
      // (no sidecar) sorts last rather than first — it is not "brand new",
      // its date is simply unknown.
      const ta = a.createdAt ? Date.parse(a.createdAt) : -Infinity
      const tb = b.createdAt ? Date.parse(b.createdAt) : -Infinity
      return tb - ta
    })
  }, [rows, search, provenanceFilter, usageFilter, sortBy])

  /** Renaming reuses the plain save path: load the raw frame, patch its
      `label`, save it back under its OWN name. No dedicated route — the
      same reasoning as duplicate below, `/api/pose/save` already does
      exactly this for any other edit. Unavailable for a sidecar-less
      legacy pose (nothing to load) — the caller gates the menu item on
      `source !== null` before ever calling this. */
  const rename = useCallback(
    (name: string, label: string): Promise<MutationResult> => {
      const trimmed = label.trim()
      if (!trimmed) return Promise.resolve({ ok: false, erreur: 'un libellé ne peut pas être vide' })
      return withBusy(name, async () => {
        const raw = await api.get<RawPoseFrame & ActionLike>(
          `/api/pose/keypoints?name=${encodeURIComponent(name)}`,
        )
        const loadFailure = errorOf(raw)
        if (loadFailure) return { ok: false, erreur: loadFailure }
        const response = await api.post<{ ok?: boolean; erreur?: string; name?: string }>('/api/pose/save', {
          name, keypoints: { ...raw, label: trimmed },
        })
        const saveFailure = errorOf(response)
        if (saveFailure || !response.name) return { ok: false, erreur: saveFailure || 'échec' }
        await reloadBankDetail()
        return { ok: true, name: response.name }
      })
    },
    [api, reloadBankDetail, withBusy],
  )

  /** Loads the frame, clears `created_at` (a duplicate is a NEW pose, born
      now — keeping the original's timestamp would misdate it and confuse
      "recent first" sorting), suffixes the label, saves under a fresh
      auto-numbered name. Same "no dedicated route" reasoning as rename. */
  const duplicate = useCallback(
    (name: string): Promise<MutationResult> =>
      withBusy(name, async () => {
        const raw = await api.get<RawPoseFrame & ActionLike>(
          `/api/pose/keypoints?name=${encodeURIComponent(name)}`,
        )
        const loadFailure = errorOf(raw)
        if (loadFailure) return { ok: false, erreur: loadFailure }
        const label = raw.label ? `${raw.label} (copie)` : null
        const response = await api.post<{ ok?: boolean; erreur?: string; name?: string }>('/api/pose/save', {
          name: null, keypoints: { ...raw, label, created_at: null },
        })
        const saveFailure = errorOf(response)
        if (saveFailure || !response.name) return { ok: false, erreur: saveFailure || 'échec' }
        // ORDER MATTERS. `bankDetail` first, `poses` second — not the other
        // way round, and not `Promise.all`. `poses` updating is what makes
        // the new card appear at all (`rows` maps over it); `poses`
        // changing ALSO retriggers this hook's own effect to refetch bank
        // detail, but that effect is async and unawaited from here, so if
        // `poses` updated FIRST the new card would mount for one render
        // with no label yet (`bankDetail` still missing the fresh entry) —
        // caught live, the duplicate's own label flashed the raw filename
        // right after creation. Fetching bank detail first means it
        // already HAS the new entry by the time the card is born.
        await reloadBankDetail()
        await reloadScenes(true)
        return { ok: true, name: response.name }
      }),
    [api, reloadScenes, reloadBankDetail, withBusy],
  )

  const remove = useCallback(
    (name: string): Promise<MutationResult> =>
      withBusy(name, async () => {
        const response = await api.post<ActionLike>('/api/pose/delete', { name })
        const failure = errorOf(response)
        if (failure) return { ok: false, erreur: failure }
        await reloadScenes(true)
        return { ok: true, name }
      }),
    [api, reloadScenes, withBusy],
  )

  return {
    rows: rowsFiltered,
    totalCount: poses.length,
    search, setSearch,
    provenanceFilter, setProvenanceFilter,
    usageFilter, setUsageFilter,
    sortBy, setSortBy,
    density, setDensity,
    busyNames,
    rename, duplicate, remove,
    /** For the extraction flow (PosesView's own file input) — orthogonal to
        this hook's own mutations, but it lands a NEW filename in `poses`
        the exact same way `duplicate` does, so it needs the same reload. */
    reload: reloadScenes,
  }
}
