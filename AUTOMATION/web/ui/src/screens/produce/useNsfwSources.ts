/* The NSFW source grid: which validated images the editing tier may take back.

   IT POLLS, AND ONLY WHILE IT IS ON SCREEN. That is the only moment a newly
   validated image has to appear in the grid — and the only moment the poll is
   worth its request.

   IT ALSO WATCHES ITS OWN TOOL. Arming lives on the Application screen (J7), so
   a change made there must make the tier APPEAR or DISAPPEAR here. The server
   stops emitting the tier when the tool is unavailable, so re-reading the
   taxonomy is enough — and leaving the tier if it is gone.

   And it prunes: an image re-sorted meanwhile is no longer editable, and the
   server would refuse it at launch (`valid_sources`). Ticking it would have
   been a launch that fails for a reason nothing on screen explained. */
import { useCallback, useEffect, useState } from 'react'

import { errorOf, type ActionLike, type Schema } from '../../api/client'
import { useApi } from '../../api/useApi'
import { usePolling } from '../../state/usePolling'
import type { SourceImage } from './useProduceState'

type NsfwState = Schema<'NsfwStateResponse'>

/* The source grid only refreshes while it is on screen: that is the only moment
   a newly validated image has to appear in it. */
const NSFW_TICK_MS = 4000

export function useNsfwSources({
  editTier,
  reloadCreative,
  onToolGone,
}: {
  editTier: boolean
  reloadCreative: () => Promise<void> | void
  onToolGone: () => void
}) {
  const api = useApi()
  const [sources, setSources] = useState<SourceImage[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [nsfwOut, setNsfwOut] = useState('')

  const nsfwTick = useCallback(async () => {
    let response: (NsfwState & ActionLike) | null = null
    try {
      response = await api.get<NsfwState>('/api/nsfw/state')
    } catch {
      return
    }
    if (errorOf(response)) return
    setSources((response.sources ?? []) as SourceImage[])
    if (response.sortie) setNsfwOut(response.sortie)
    /* The arming gesture lives on the Application screen: a change made there
       must make the tier appear or DISAPPEAR here. The server stops emitting the
       tier when the tool is unavailable, so re-reading the taxonomy is enough —
       and leaving the tier if it is gone. */
    const available = Boolean(response.outil?.available)
    if (!available && editTier) {
      await reloadCreative()
      onToolGone()
      setPicked(new Set())
    }
  }, [api, editTier, reloadCreative, onToolGone])

  usePolling(nsfwTick, { intervalMs: NSFW_TICK_MS, enabled: editTier, pauseWhenHidden: true })

  /* Prune the selection: an image re-sorted meanwhile is no longer editable, and
     the server would refuse it at launch (sources_valides). */
  useEffect(() => {
    const available = new Set(sources.map((s) => s.name))
    setPicked((current) => {
      const next = new Set([...current].filter((n) => available.has(n)))
      return next.size === current.size ? current : next
    })
  }, [sources])

  return { sources, picked, setPicked, nsfwOut }
}
