/* The permanent banner: who is loaded, and whether the machine can produce.

   The five destinations left this bar for the side navbar; what stays is what
   answers « where am I » — the application, the character, and the state of
   ComfyUI followed by the machine probes.

   The identity badge is the INITIAL, never the frozen base portrait: no route
   serves those bytes (the file lives outside PROD/, on the ComfyUI input side)
   and inventing one that reads that folder without a character_id bound would
   reopen the leak the isolation of 29/08/2026 closed. Deferred, not forgotten. */
import { useEffect } from 'react'

import { initialOf, useCharacter } from '../character/CharacterContext'
import { useSystemState } from '../state/SystemStateContext'
import { Icon } from './Icon'
import { IdentityMenu } from './IdentityMenu'
import { ProbeStrip } from './ProbeStrip'
import { Takeover } from './Takeover'
import { useProcessControls } from './useProcessControls'

const APP = 'Soulglade'

/** Seconds as the studio writes them: rounded, and in minutes past 90 s. */
export const mmss = (seconds: number | null | undefined): string =>
  seconds == null ? '' : seconds < 90 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`

function Brand() {
  const { claimed, sheet } = useCharacter()

  /* The application name is present in BOTH states. It used to disappear as
     soon as a character loaded, because painting the brand replaced everything:
     one no longer knew which tool one was in, only whose. */
  if (!claimed) {
    return (
      <div className="brand" id="brand">
        <span className="brand-app">{APP}</span>
      </div>
    )
  }

  /* Falls back immediately on the raw id, enriched (name, type, world) as soon
     as /api/character answers. A failed call leaves the fallback — never a
     broken screen, and the failure itself is said by the fault banner. */
  const shown = sheet ?? { id: claimed, name: claimed, type: null, world: null }
  const world = (shown as { world?: { label?: string } | null }).world

  return (
    <div className="brand" id="brand">
      <span className="brand-app">{APP}</span>
      {/* a VISUAL separator, hence aria-hidden — a screen reader already has
          the breathing of the markup */}
      <span className="brand-sep" aria-hidden="true">
        ·
      </span>
      <span className="brand-av" aria-hidden="true">
        {initialOf(shown)}
      </span>
      <i>{shown.name || shown.id}</i>
      <code className="brand-id">{shown.id}</code>
      {shown.type && <span className="brand-tag">{shown.type}</span>}
      {world?.label && <span className="brand-tag">{world.label}</span>}
    </div>
  )
}

/* Quick-access shutdown, icon-only. Same confirmation, same consequence as
   the Application screen's own buttons (`useProcessControls`) — this is the
   « I'm done, cut it now » path for someone who does not want to leave
   Produire to reach it. Danger colours only on hover/focus: at rest it
   reads as a neutral chrome control, not a permanent warning sign next to
   probes one glances at all day. */
function ShutdownButton({
  id,
  label,
  hint,
  onClick,
}: {
  id: string
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      id={id}
      /* `[border:0] p-0 bg-transparent`: without this reset a bare <button>
         falls back to the browser's own UA chrome (Chromium: ~1px 6px
         padding, a 2px outset border, a light face) — found live (audit,
         2026-09-04): that padding alone left only 8px of content width in a
         24px box, and the flex layout SHRANK the icon's SVG down to fit,
         rendering it all but invisible. `border border-transparent` (not
         `border-0`) so the hover border adds no layout shift — same
         zero-shift idiom already used for `.btn`'s own hover state. */
      className="flex h-[24px] w-[24px] flex-none items-center justify-center
                 rounded-[6px] border border-transparent bg-transparent p-0
                 text-dim hover:border-danger-line hover:bg-danger-bg
                 hover:text-danger-txt
                 focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
      aria-label={label}
      data-hint-text={hint}
      onClick={onClick}
    >
      <Icon name="power" className="h-[15px] w-[15px]" />
    </button>
  )
}

/* ComfyUI reachable or not (the dot) plus the progress of the running batch,
   straight from /api/state. A queue of pending jobs does not exist server-side
   yet. */
function StatusZone() {
  const { state } = useSystemState()
  const { stopApp, stopComfy, takeover } = useProcessControls()

  const offline = state === null
  const running = state?.running
    ? `production ${state.index}/${state.total}` + (state.eta ? ` · ~${mmss(state.eta)}` : '')
    : 'prêt'
  const text = offline ? 'état indisponible' : state?.comfy ? running : 'ComfyUI hors ligne'

  return (
    <div className="status">
      {/* a small label lifts the ambiguity of the dot (ComfyUI up or down) */}
      <span className="status-lab">Comfy</span>
      <span className={`dot${!offline && state?.comfy ? ' on' : ''}`} id="dot" />
      <span id="stTxt">{text}</span>
      {/* the rule that separates the state of the DASHBOARD from that of the
          MACHINE: without it, « prêt » and « 45 % » read as one sentence */}
      <span className="status-sep" aria-hidden="true" />
      <ProbeStrip />
      <span className="status-sep" aria-hidden="true" />
      <ShutdownButton
        id="btnHeaderComfyStop"
        label="Arrêter ComfyUI"
        hint="Arrêter ComfyUI — coupe net, sans le temps de finir un job."
        onClick={stopComfy}
      />
      <ShutdownButton
        id="btnHeaderAppStop"
        label="Arrêter le tableau de bord"
        hint="Arrêter le tableau de bord — cette page ne répondra plus."
        onClick={stopApp}
      />
      {takeover && <Takeover>{takeover}</Takeover>}
    </div>
  )
}

export function Header() {
  const { claimed, sheet } = useCharacter()

  /* The tab title says whose studio this is. A switch to another character must
     be visible to the eye, not only in the network trace. */
  useEffect(() => {
    document.title = claimed ? `${sheet?.name || claimed} — production` : APP
  }, [claimed, sheet])

  return (
    <header>
      {/* the entry gate claims no character: nothing to switch away from, so
          the brand stands alone */}
      {claimed ? (
        <IdentityMenu>
          <Brand />
        </IdentityMenu>
      ) : (
        <div className="idwrap">
          <Brand />
        </div>
      )}
      <StatusZone />
    </header>
  )
}
