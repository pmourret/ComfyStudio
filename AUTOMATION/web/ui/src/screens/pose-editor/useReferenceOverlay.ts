/* State and gestures for the "Corps complet" panel's reference photo and
   on-demand render preview (phase 4). Kept out of PoseEditorScreen.tsx per
   the project's own screen convention — this is a self-contained slice of
   state with cleanup obligations (object URLs), not view composition. */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { BoundApi } from '../../api/useApi'
import { editableToFrame, type PoseFrame } from './poseFrame'

const DEFAULT_OPACITY = 0.6

export function useReferenceOverlay(pose: PoseFrame | null, api: BoundApi) {
  const [referenceUrl, setReferenceUrlState] = useState<string | null>(null)
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY)
  const [previewUrl, setPreviewUrlState] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const referenceUrlRef = useRef<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  /* Never uploaded: `URL.createObjectURL` keeps the picked file's bytes
     entirely inside this tab. Revoking the PREVIOUS url before minting a
     new one (and on unmount) is the price of that — nothing else releases
     it, unlike a normal <img src> pointing at a server URL. */
  const setReferenceFile = useCallback((file: File | null) => {
    if (referenceUrlRef.current) URL.revokeObjectURL(referenceUrlRef.current)
    const next = file ? URL.createObjectURL(file) : null
    referenceUrlRef.current = next
    setReferenceUrlState(next)
  }, [])

  const clearReference = useCallback(() => setReferenceFile(null), [setReferenceFile])

  const refreshPreview = useCallback(async () => {
    if (!pose) return
    setRendering(true)
    try {
      const blob = await api.postForBlob('/api/pose/render', { keypoints: editableToFrame(pose) })
      if (!blob) return
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const next = URL.createObjectURL(blob)
      previewUrlRef.current = next
      setPreviewUrlState(next)
    } finally {
      setRendering(false)
    }
  }, [pose, api])

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreviewUrlState(null)
  }, [])

  useEffect(
    () => () => {
      if (referenceUrlRef.current) URL.revokeObjectURL(referenceUrlRef.current)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    [],
  )

  return {
    referenceUrl, opacity, setOpacity, setReferenceFile, clearReference,
    previewUrl, rendering, refreshPreview, clearPreview,
  }
}
