/* Toast: a brief message at the bottom of the screen, with an optional action.
   Ported from `static/toast.js`.

   It is the studio's way of ACKNOWLEDGING an action, never its way of reporting
   a fault that persists — that is the banner's job (FaultsContext). A toast that
   said something important would say it for 4.5 seconds and then lie by
   omission. */
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

const VISIBLE_MS = 4500

type ToastAction = { label: string; run: () => void }
type ToastState = { message: string; action?: ToastAction; key: number } | null

type ToastContextValue = {
  toast: (message: string, action?: ToastAction) => void
}

const Ctx = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastState>(null)
  const counter = useRef(0)

  const toast = useCallback((message: string, action?: ToastAction) => {
    counter.current += 1
    setCurrent({ message, action, key: counter.current })
  }, [])

  /* The timer restarts on each new toast — `key` changes even when the same
     text comes twice, so a repeated message gets its full time rather than
     inheriting the tail of the previous one. */
  useEffect(() => {
    if (!current) return
    const timer = window.setTimeout(() => setCurrent(null), VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [current])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* `role="status"` and not `alert`: it acknowledges, it does not warn, and
          an assertive live region would interrupt a screen reader mid-sentence
          for a confirmation. */}
      <div id="toast" className={current ? 'on' : undefined} role="status">
        <span id="toastTxt">{current?.message ?? ''}</span>
        {current?.action && (
          <button
            className="link"
            id="toastAct"
            onClick={() => {
              setCurrent(null)
              current.action?.run()
            }}
          >
            {current.action.label}
          </button>
        )}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): (message: string, action?: ToastAction) => void {
  const value = useContext(Ctx)
  if (!value) throw new Error('useToast hors de ToastProvider')
  return value.toast
}
