/* The gestures of the Review: judging, sorting, undoing, deleting, measuring.

   WHY THEY LEFT THE SCREEN. `useTriage` already owned the loading; what stayed
   in the component was the other half of the same trade — the five mutations —
   wrapped in 470 lines of JSX. A gesture whose rules are worth reading (the
   toast that offers `annuler`, the confirmation that says there is none, the
   measurement loop) should not have to be found inside a render.

   COUPLING TRAP §5.6-4 — the measurement runs IN BATCHES. One InsightFace pass
   costs ~190 ms and the server refuses 200 in a single request, so the client
   keeps calling while `restant > 0`. That is the contract, not a stopgap: there
   is no push infrastructure to replace it with (AUDIT §7.3). The 40-round guard
   bounds a loop that must never become infinite.

   Nothing here decides WHAT is shown — `shown` and the cursor are handed in.
   These functions act, and report through the toast. */
import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

import { errorOf, type ActionLike } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useConfirm } from '../../chrome/ConfirmContext'
import { useToast } from '../../chrome/ToastContext'
import { useSystemState } from '../../state/SystemStateContext'
import type { GalleryItem, Space } from './useTriage'

/* The folder a sorting action lands in. Sorting into the folder one is already
   looking at is a no-op: we move on rather than write it. */
const SORT_TARGET: Record<string, string> = {
  valider: 'OK',
  revoir: 'A_REVOIR',
  rejeter: 'REJET',
  archiver: 'ARCHIVE',
}
const SORT_LABEL: Record<string, string> = {
  valider: 'validée',
  revoir: 'à revoir',
  rejeter: 'rejetée',
  archiver: 'archivée',
}

export function useSortActions({
  shown,
  safeCursor,
  bucket,
  space,
  setItems,
  setCursor,
  setDeclineFor,
  step,
  reload,
}: {
  shown: GalleryItem[]
  safeCursor: number
  bucket: string
  space: Space
  setItems: Dispatch<SetStateAction<GalleryItem[]>>
  setCursor: Dispatch<SetStateAction<number>>
  setDeclineFor: (item: GalleryItem | null) => void
  step: (delta: number) => void
  reload: () => Promise<void> | void
}) {
  const api = useApi()
  const toast = useToast()
  const confirm = useConfirm()
  const { refresh: refreshCounts } = useSystemState()
  const [measuring, setMeasuring] = useState(false)
  const [measureLeft, setMeasureLeft] = useState<number | null>(null)

  const setFlag = useCallback(
    async (item: GalleryItem, flag: string) => {
      const next = item.flag === flag ? null : flag // clicking again removes it
      const response = await api.post<ActionLike>('/api/flag', { name: item.name, flag: next })
      const failure = errorOf(response)
      if (failure) {
        toast(failure || 'jugement impossible')
        return
      }
      setItems((list) => list.map((i) => (i.name === item.name ? { ...i, flag: next } : i)))
    },
    [api, toast, setItems],
  )

  /* The POST core of a sort, shared by `act` (one image, toasts immediately,
     offers `annuler`) and `actMany` (a batch, one summary toast at the end —
     design-pass screen-5, §D). Neither the no-op guard (already in this
     bucket) nor `decliner`/`skip` belong here: those are gestures of `act`
     alone, and `actMany`'s own scope is Garder/Rejeter/Archiver only (the
     document's own wording), so it applies its own no-op guard per item
     instead of sharing this one. */
  const postSort = useCallback(
    async (item: GalleryItem, action: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const response = await api.post<ActionLike>('/api/action', {
        name: item.name,
        bucket: item.bucket,
        space: item.space,
        action,
      })
      const failure = errorOf(response)
      return failure ? { ok: false, reason: failure || 'action impossible' } : { ok: true }
    },
    [api],
  )

  const act = useCallback(
    async (action: string, index?: number) => {
      if (!shown.length) return
      const at = index ?? safeCursor
      const item = shown[at]
      if (!item) return
      if (action === 'decliner') {
        /* /api/decline only knows the SFW journal; the button is already hidden
           in NSFW, this guard covers the D shortcut. */
        if (item.space === 'nsfw') {
          toast("déclinaison indisponible ici — passe par l'espace NSFW")
          return
        }
        setDeclineFor(item)
        return
      }
      if (action === 'skip') {
        step(1)
        return
      }
      if (index != null) setCursor(index)
      // already in this folder: we move on rather than write a no-op
      if (SORT_TARGET[action] === bucket) {
        step(1)
        return
      }
      const result = await postSort(item, action)
      if (!result.ok) {
        toast(result.reason)
        return
      }
      setItems((list) => list.filter((i) => i.name !== item.name))
      refreshCounts()
      toast(`${item.scene || item.name} → ${SORT_LABEL[action]}`, {
        label: 'annuler',
        run: () => void undo(),
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, bucket, shown, safeCursor, step, toast, setItems, setCursor, refreshCounts, postSort],
  )

  /* Bulk sort (design-pass screen-5, §D) — sequential, one item at a time
     (same discipline as `measure()` below: no hammering the server, and the
     per-item no-op guard stays correct without racing `setItems`). ONE
     summary toast, distinguishing full/partial/zero success — never per
     item, never an `annuler` attached: `/api/undo` only ever undoes the
     LAST action, nothing batch-aware exists server-side to bind here
     honestly. */
  const actMany = useCallback(
    async (action: string, names: string[]) => {
      const byName = new Map(shown.map((item) => [item.name, item]))
      const succeeded: GalleryItem[] = []
      const failed: { item: GalleryItem; reason: string }[] = []
      for (const name of names) {
        const item = byName.get(name)
        if (!item) continue
        if (SORT_TARGET[action] === bucket) continue // already there: not a failure, just skipped
        const result = await postSort(item, action)
        if (result.ok) succeeded.push(item)
        else failed.push({ item, reason: result.reason })
      }
      if (succeeded.length) {
        const succeededNames = new Set(succeeded.map((i) => i.name))
        setItems((list) => list.filter((i) => !succeededNames.has(i.name)))
        refreshCounts()
      }
      const total = succeeded.length + failed.length
      if (!total) return
      const verb = `${SORT_LABEL[action] || action}${total > 1 ? 's' : ''}`
      let message = `${succeeded.length}/${total} ${verb}`
      if (failed.length) message += `, ${failed.length} échec${failed.length > 1 ? 's' : ''} : ${failed[0].reason}`
      toast(message)
    },
    [shown, bucket, postSort, setItems, refreshCounts, toast],
  )

  const undo = useCallback(async () => {
    const response = await api.post<ActionLike>('/api/undo')
    const failure = errorOf(response)
    if (failure) {
      toast(failure || 'rien à annuler')
      return
    }
    toast('action annulée')
    void reload()
    refreshCounts()
  }, [api, toast, reload, refreshCounts])

  /* PERMANENT DELETION — deliberately OUTSIDE act(): it is not a sort, it never
     goes into UNDO (there is nothing to put back, the file is gone), and mixing
     the two in one generic function is exactly the shortcut that would one day
     make deletion « just one more bucket ». An explicit confirmation every time,
     and NEVER a keyboard shortcut — it is the one gesture of the app with no way
     out. */
  const deleteForever = useCallback(
    async (index?: number) => {
      const item = shown[index ?? safeCursor]
      if (!item) return
      const ok = await confirm({
        title: 'Supprimer définitivement ?',
        button: 'Supprimer définitivement',
        body: (
          <>
            <p>
              <b>{item.scene || item.name}</b> sera effacée du disque. Aucun retour
              possible — contrairement au tri, il n'y a pas de bouton « annuler »
              pour ce geste.
            </p>
            <p className="tiny">
              Le journal garde la trace qu'elle a existé et son score ; seul le
              fichier disparaît.
            </p>
          </>
        ),
      })
      if (!ok) return
      const response = await api.post<ActionLike>('/api/delete', {
        name: item.name,
        bucket: item.bucket,
        space: item.space,
      })
      const failure = errorOf(response)
      if (failure) {
        toast(failure || 'suppression impossible')
        return
      }
      setItems((list) => list.filter((i) => i.name !== item.name))
      refreshCounts()
      toast(`${item.scene || item.name} supprimée définitivement`)
    },
    [api, confirm, shown, safeCursor, toast, setItems, refreshCounts],
  )

  /* COUPLING TRAP §5.6-4. Catching up the realism measurements, IN BATCHES: one
     InsightFace pass costs ~190 ms and the server refuses to do 200 in a single
     request. The client must keep calling while `restant > 0` — that is the
     contract, not a stopgap, and there is no push infrastructure to replace it
     with (AUDIT §7.3). The 40-round guard bounds a loop that must never become
     infinite. */
  const measure = async () => {
    if (measuring) return
    setMeasuring(true)
    /* A failure mid-loop must NOT be followed by « mesures à jour ». The legacy
       handler toasted the error, broke, and then toasted the success line
       anyway — which overwrote the only thing that said what went wrong, a
       fraction of a second after it appeared. */
    let failed = false
    try {
      for (let guard = 0; guard < 40; guard += 1) {
        const response = await api.post<ActionLike & { restant?: number }>('/api/mesurer', {
          bucket,
          space,
          lot: 20,
        })
        const failure = errorOf(response)
        if (failure) {
          failed = true
          toast(failure || 'mesure impossible')
          break
        }
        if (!response.restant) break
        setMeasureLeft(response.restant)
      }
      if (!failed) toast('mesures à jour')
    } finally {
      setMeasuring(false)
      setMeasureLeft(null)
      await reload()
    }
  }

  return { setFlag, act, actMany, undo, deleteForever, measure, measuring, measureLeft }
}
