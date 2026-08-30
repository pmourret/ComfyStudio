/* Confirmation, rendered as a promise. Ported from `static/modal.js`.

   WHY NOT `confirm()`. A native box shows neither formatting nor consequence —
   and consequence is precisely what these gestures have to explain: stopping the
   dashboard, cutting ComfyUI (which Windows cannot do gracefully), unloading the
   VRAM. Every one of them says what it does BEFORE doing it.

   `await confirm({...})` gives true or false. Escape and a backdrop click
   resolve false, like the cancel button. */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { Dialog } from './Dialog'

export type ConfirmRequest = {
  title: string
  /** The body, as JSX: it explains the consequence, so it is rarely one line. */
  body: ReactNode
  /** Label of the confirming button. Says the ACT, never « OK ». */
  button?: string
  /** Marks the confirming button as destructive. */
  danger?: boolean
}

type Pending = ConfirmRequest & { resolve: (value: boolean) => void }

const Ctx = createContext<((request: ConfirmRequest) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  pendingRef.current = pending

  const confirm = useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...request, resolve })
      }),
    [],
  )

  /* Settles ONCE. Escape then a click on the backdrop, or a double click on the
     confirm button, would otherwise resolve the same promise twice — harmless
     for the promise, but it would run the action twice on the second settle
     path if a caller re-armed it. */
  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current
    if (!current) return
    pendingRef.current = null
    setPending(null)
    current.resolve(value)
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog
        id="armBox"
        open={pending !== null}
        onDismiss={() => settle(false)}
        initialFocus="#cfOui"
      >
        {pending && (
          <div
            /* <dialog> does not make Enter mean « confirm » without a <form>:
               wired by hand, except when the focus already carries an action
               (button, link, multi-line field). */
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              if ((event.target as HTMLElement).closest('button,a,textarea')) return
              settle(true)
            }}
          >
            <h3>{pending.title}</h3>
            {pending.body}
            <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                className={`btn ${pending.danger ? 'danger' : 'primary'}`}
                id="cfOui"
                onClick={() => settle(true)}
              >
                {pending.button ?? 'Confirmer'}
              </button>
              <button className="link" id="cfNon" onClick={() => settle(false)}>
                annuler
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </Ctx.Provider>
  )
}

export function useConfirm(): (request: ConfirmRequest) => Promise<boolean> {
  const value = useContext(Ctx)
  if (!value) throw new Error('useConfirm hors de ConfirmProvider')
  return value
}
