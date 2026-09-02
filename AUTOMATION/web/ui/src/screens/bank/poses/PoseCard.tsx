/* One pose in the bank grid — purely presentational (frontend.md: a
   sub-component never calls the API), everything it shows or triggers
   arrives as props from PosesView/usePoseBank. Owns only its OWN transient
   UI state: whether the actions menu or the rename field is open. */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { PATHS } from '../../../app/routes'

/** `gabarit` and `photo` are the only two provenances the data actually
    distinguishes (`source: "preset" | "extraction"`) — a from-scratch pose
    hand-adjusted from a template is still `"preset"`, same as an untouched
    one, since nothing separates "started as a template" from "and then
    hand-edited" once saved. No badge at all for a pose extracted before the
    JSON sidecar existed: fabricating a provenance for it would be a lie. */
function provenanceLabel(source: string | null): string | null {
  if (source === 'preset') return 'gabarit'
  if (source === 'extraction') return 'photo'
  return null
}

export function PoseCard({
  name, label, source, scenesUsing, busy, onDelete, onDuplicate, onRename,
}: {
  name: string
  label: string | null
  source: string | null
  scenesUsing: string[]
  busy: boolean
  onDelete: () => void
  onDuplicate: () => void
  onRename: (label: string) => void
}) {
  const badge = provenanceLabel(source)
  // A sidecar-less legacy pose has no frame to load — rename/duplicate both
  // start with `GET /api/pose/keypoints`, which 404s for these (see
  // usePoseBank's own doc). `source` is never null for a pose WITH a
  // sidecar (enregistrer_points always stamps one), so this is the same
  // signal the hook already relies on, not a second guess at it.
  const hasFrame = source !== null
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label || '')
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !wrapRef.current?.contains(event.target)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLElement>('a,button')?.focus()
  }, [menuOpen])

  // Roving focus for role="menu" — same contract as IdentityMenu's own
  // onMenuKeyDown: arrows/Home/End move focus, matching what role=menu
  // implies. Without this, every item but the first (tabIndex={-1}, focused
  // only by the effect above) was unreachable by keyboard: Tab skips them
  // entirely and jumps past the still-open menu.
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('a,button') ?? [])
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

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEditing = () => {
    if (!hasFrame || busy) return
    setDraft(label || '')
    setEditing(true)
    setMenuOpen(false)
  }
  const commitEditing = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== (label || '')) onRename(trimmed)
  }

  return (
    <div
      className="relative rounded-[8px] border border-line2 bg-black"
      data-pose-card
      data-n={name}
      ref={wrapRef}
    >
      <div className="relative aspect-square overflow-hidden rounded-t-[8px]">
        <img
          className="h-full w-full object-contain"
          loading="lazy"
          src={`/img/pose?name=${encodeURIComponent(name)}`}
          alt={label || name}
        />
      </div>
      {/* Single trigger for all 4 actions, agreed over 3 alternatives
          (icon row / hover-only icons) — keeps the card visually calm at
          its narrowest, scales to a future 5th action without a redesign.
          Sibling of the CLIPPED image div, not nested in it, so the popup
          is never cut off by `overflow-hidden` on the thumbnail. */}
      <div className="absolute top-[4px] right-[4px]">
        <button
          ref={triggerRef}
          type="button"
          className="m-0 flex h-[24px] w-[24px] cursor-pointer items-center justify-center
                     rounded-[50%] border border-line2 bg-scrim text-[13px] leading-none
                     text-dim hover:bg-panel2 focus-visible:outline-2
                     focus-visible:outline-focus focus-visible:outline-offset-2
                     disabled:cursor-not-allowed disabled:opacity-40"
          data-pose-menu
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label={`Actions — ${label || name}`}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation()
            setMenuOpen((v) => !v)
          }}
        >
          ⋯
        </button>
        {menuOpen && (
          <div
            className="absolute top-[28px] right-0 z-10 flex w-[132px] flex-col gap-[1px]
                       rounded-[8px] border border-line2 bg-panel py-[4px] shadow-lg"
            role="menu"
            aria-label={`Actions — ${label || name}`}
            ref={menuRef}
            onKeyDown={onMenuKeyDown}
          >
            <Link
              className="px-[10px] py-[6px] text-[12px] text-txt no-underline hover:bg-panel2"
              role="menuitem"
              tabIndex={-1}
              to={`${PATHS.poseEditor}/${encodeURIComponent(name)}`}
              onClick={() => setMenuOpen(false)}
            >
              éditer
            </Link>
            <button
              type="button"
              className="border-0 bg-transparent px-[10px] py-[6px] text-left text-[12px]
                         text-txt hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-40"
              role="menuitem"
              tabIndex={-1}
              disabled={!hasFrame}
              title={hasFrame ? undefined : 'squelette sans points-clés — extrait avant cette fonctionnalité'}
              onClick={() => {
                setMenuOpen(false)
                onDuplicate()
              }}
            >
              dupliquer
            </button>
            <button
              type="button"
              className="border-0 bg-transparent px-[10px] py-[6px] text-left text-[12px]
                         text-txt hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-40"
              role="menuitem"
              tabIndex={-1}
              disabled={!hasFrame}
              title={hasFrame ? undefined : 'squelette sans points-clés — extrait avant cette fonctionnalité'}
              onClick={startEditing}
            >
              renommer
            </button>
            <button
              type="button"
              className="border-0 bg-transparent px-[10px] py-[6px] text-left text-[12px]
                         text-danger-txt hover:bg-danger-bg"
              role="menuitem"
              tabIndex={-1}
              data-del
              onClick={() => {
                setMenuOpen(false)
                onDelete()
              }}
            >
              retirer
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-[5px] px-[6px] py-[4px] text-[11px] text-dim">
        {badge && !editing && (
          <span
            className="shrink-0 rounded-[4px] border border-line2 px-[4px] py-[1px]
                       text-[9px] uppercase tracking-[.4px] text-dim2"
            tabIndex={0}
            data-hint-text={
              badge === 'gabarit'
                ? 'Coordonnées inventées, jamais issues d’une photo.'
                : 'Extraite d’une photo — la photo elle-même n’est jamais gardée.'
            }
          >
            {badge}
          </span>
        )}
        {editing ? (
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent px-0 py-0 text-[11px] text-txt"
            data-pose-label-input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitEditing}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitEditing()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setEditing(false)
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 cursor-text truncate border-0 bg-transparent p-0 text-left
                       text-[11px] text-dim hover:text-txt focus-visible:outline-2
                       focus-visible:outline-focus focus-visible:outline-offset-2
                       disabled:cursor-default"
            data-pose-label
            disabled={!hasFrame}
            title={scenesUsing.length ? `Utilisée par : ${scenesUsing.join(', ')}` : undefined}
            onClick={startEditing}
          >
            {label || name}
          </button>
        )}
      </div>
    </div>
  )
}
