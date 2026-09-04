/* Full-screen takeover: the whole dashboard is about to become unreachable
   (the server is stopping or restarting), so there is no point keeping
   tiles and buttons on screen — they would answer nothing.

   Shared by the Application screen and the header's quick-access shutdown
   buttons (`useProcessControls`) — whichever one triggers a stop, the same
   message replaces the same amount of screen. */
import { createPortal } from 'react-dom'

export function Takeover({ children }: { children: React.ReactNode }) {
  /* Portalled to <body> and fixed over everything: the chrome must go too.
     The navbar would otherwise keep offering destinations that answer
     nothing. The legacy screen replaced `document.body.innerHTML` for the
     same reason; a portal does it without destroying the React tree that
     has to poll for the server coming back. */
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center
                 bg-bg p-[40px] text-center text-txt [font:var(--font)]"
      role="status"
    >
      <div>{children}</div>
    </div>,
    document.body,
  )
}
