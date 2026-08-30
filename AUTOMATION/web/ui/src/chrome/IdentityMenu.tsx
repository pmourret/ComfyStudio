/* The identity menu — the ONE place a character is changed.

   WHAT CHANGES (migration brief, point 1). Each entry used to be a link that
   RELOADED the studio on `?character=<id>`. It now calls `selectCharacter`: the
   id is shared React state, the switch is a re-render. The `href` stays on the
   anchor so the entry is still copyable, bookmarkable and middle-clickable into
   a new tab — but it is the click handler that switches, not the URL.

   role=menu, so arrows / Home / End move the focus and Escape closes, exactly as
   the legacy handler did. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useCharacter } from '../character/CharacterContext'
import { PATHS } from '../app/routes'

/* `children` is the brand block. The menu is positioned against `.idwrap`,
   which wraps the character card AND the trigger — so the popup opens under the
   name, not under the little chevron alone. Same markup as the legacy chrome. */
export function IdentityMenu({ children }: { children?: ReactNode }) {
  const { claimed, roster, rosterError, loadRoster, selectCharacter } = useCharacter()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const close = useCallback((giveFocusBack = false) => {
    setOpen(false)
    if (giveFocusBack) buttonRef.current?.focus()
  }, [])

  const toggle = useCallback(() => {
    setOpen((current) => {
      if (!current) loadRoster()
      return !current
    })
  }, [loadRoster])

  // outside click and Escape close it — the chrome's overlay behaviour
  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !wrapRef.current?.contains(event.target)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  // focus the first entry on opening, as role=menu implies
  useEffect(() => {
    if (!open) return
    const first = menuRef.current?.querySelector<HTMLElement>('a')
    first?.focus()
  }, [open, roster])

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('a') ?? [])
    if (!items.length) return
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      items[(index + 1) % items.length].focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      items[(index - 1 + items.length) % items.length].focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      items[0].focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      items[items.length - 1].focus()
    }
  }

  const others = (roster ?? []).filter((entry) => entry.id !== claimed)

  return (
    <div className="idwrap" ref={wrapRef}>
      {children}
      <button
        id="btnId"
        ref={buttonRef}
        className={open ? 'on' : undefined}
        aria-haspopup="true"
        aria-expanded={open}
        title="Changer de personnage"
        onClick={(event) => {
          event.stopPropagation()
          toggle()
        }}
      >
        ▾
      </button>
      <div
        className={`idmenu${open ? ' on' : ''}`}
        id="idMenu"
        role="menu"
        aria-label="Personnages"
        ref={menuRef}
        onKeyDown={onMenuKeyDown}
      >
        <div id="idSwitch" role="none">
          {rosterError ? (
            <span className="tiny">{rosterError}</span>
          ) : roster === null ? (
            <span className="tiny">chargement…</span>
          ) : others.length ? (
            others.map((entry) => (
              <a
                key={entry.id}
                href={`?character=${encodeURIComponent(entry.id)}`}
                role="menuitem"
                tabIndex={-1}
                onClick={(event) => {
                  // plain left click switches in place; a modified click keeps
                  // the browser's own meaning (new tab, new window)
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                  event.preventDefault()
                  selectCharacter(entry.id)
                  close(true)
                }}
              >
                {entry.name || entry.id}
                <small>{entry.type || entry.id}</small>
              </a>
            ))
          ) : (
            <span className="tiny">aucun autre personnage</span>
          )}
        </div>
        <div className="sep" role="separator" />
        <Link to={PATHS.characters} role="menuitem" tabIndex={-1} onClick={() => close()}>
          Registre des personnages
        </Link>
        <Link to={PATHS.wizard} role="menuitem" tabIndex={-1} onClick={() => close()}>
          + Nouveau personnage
        </Link>
      </div>
    </div>
  )
}
