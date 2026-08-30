/* One polling primitive, because the studio has two cadences and they must not
   be confused (AUDIT §4.1, §7.3).

     - /api/state         1.5 s — production tick, the heartbeat of the chrome.
     - /api/app/comfy/stats 5 s — memory and thermal probes.

   The probe route queries ComfyUI over HTTP and spawns `nvidia-smi`. Hanging it
   off the 1.5 s tick would replay the event-loop freeze of 24/08, when /api/plan
   went from 1.7 ms to 2005 ms for having probed synchronously. Two timers, never
   one.

   There is no push infrastructure to migrate to, neither in Soulglade nor from
   ComfyUI (AUDIT §7.3): polling IS the contract, not a stopgap.

   `pauseWhenHidden` stops the timer on a background tab — a hidden tab has no
   reason to spawn a subprocess every 5 s, and several can be open at once. */
import { useEffect, useRef } from 'react'

type Options = {
  /** Milliseconds between two runs. */
  intervalMs: number
  /** Skip while the tab is hidden, and run once on the way back. */
  pauseWhenHidden?: boolean
  /** Set false to hold the timer entirely (a screen that is not mounted yet). */
  enabled?: boolean
}

export function usePolling(run: () => void | Promise<void>, options: Options): void {
  const { intervalMs, pauseWhenHidden = false, enabled = true } = options
  /* The callback is read through a ref so a caller does not have to memoise it:
     re-creating the timer on every render would make the real cadence depend on
     render frequency instead of on `intervalMs`. */
  const latest = useRef(run)
  latest.current = run

  useEffect(() => {
    if (!enabled) return
    let stopped = false

    const fire = () => {
      if (stopped) return
      if (pauseWhenHidden && document.hidden) return
      void latest.current()
    }

    fire()
    const timer = window.setInterval(fire, intervalMs)

    /* Coming back to a visible tab must not wait out a full period: the numbers
       on screen are the ones from before the tab was hidden. */
    const onVisibility = () => {
      if (!document.hidden) fire()
    }
    if (pauseWhenHidden) document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stopped = true
      window.clearInterval(timer)
      if (pauseWhenHidden) document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs, pauseWhenHidden, enabled])
}
