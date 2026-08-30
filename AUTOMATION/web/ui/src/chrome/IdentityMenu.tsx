/* The identity menu — the ONE place a character is changed.

   WHAT CHANGES (migration brief, point 1). Each entry used to be a link that
   RELOADED the studio on `?character=<id>`. It now calls `selectCharacter`: the
   id is shared React state, the switch is a re-render. The `href` stays on the
   anchor so the entry is still copyable, bookmarkable and middle-clickable into
   a new tab — but it is the click handler that switches, not the URL.

   role=menu, so arrows / Home / End move the focus and Escape closes, exactly as
   the legacy handler did. */
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useCharacter } from '../character/CharacterContext'
import { characterPath, PATHS } from '../app/routes'
import { useChrome } from './ChromeContext'

/* `children` is the brand block. The menu is positioned against `.idwrap`,
   which wraps the character card AND the trigger — so the popup opens under the
   name, not under the little chevron alone. Same markup as the legacy chrome. */
export function IdentityMenu({ children }: { children?: ReactNode }) {
  const { claimed, isClaimed, roster, rosterError, loadRoster, selectCharacter } = useCharacter()
  /* Open state lives in the chrome context, not here: the character sheet
     reopens this menu from inside the screen (F1.2 — one door to change
     character, and it is this one). */
  const { identityMenuOpen: open, openIdentityMenu, closeIdentityMenu } = useChrome()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const close = useCallback(
    (giveFocusBack = false) => {
      closeIdentityMenu()
      if (giveFocusBack) buttonRef.current?.focus()
    },
    [closeIdentityMenu],
  )

  const toggle = useCallback(() => {
    if (open) close()
    else {
      loadRoster()
      openIdentityMenu()
    }
  }, [open, close, loadRoster, openIdentityMenu])

  /* Opened from elsewhere (the sheet's « Tous les personnages »): the roster
     still has to be there, and the focus still has to land in the menu. */
  useEffect(() => {
    if (open) loadRoster()
  }, [open, loadRoster])

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
        {/* Leads to the sheet of the loaded character, or to the entry gate
            when none is claimed — the destination the navbar entry has. The
            LABEL follows it: calling it « registre » while it opens a sheet was
            a mismatch the legacy chrome carried because both lived on one
            screen switched by attribute. */}
        <Link to={characterPath(isClaimed)} role="menuitem" tabIndex={-1} onClick={() => close()}>
          {isClaimed ? 'Fiche du personnage' : 'Registre des personnages'}
        </Link>
        <Link to={PATHS.wizard} role="menuitem" tabIndex={-1} onClick={() => close()}>
          + Nouveau personnage
        </Link>
      </div>
    </div>
  )
}
