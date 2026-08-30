/* THE route table. One place, like `static/constants.js` was — never a path
   assembled by hand somewhere else.

   WHAT CHANGES FROM THE LEGACY FRONTEND (migration brief, point 2). Hash routing
   is gone: every screen has a real path. The two screens that used to switch
   behaviour through an attribute get distinct routes instead of that switch —
   `#registre[data-vue]` becomes /characters (the entry gate) and /character (the
   sheet); `#trier[data-metier]` becomes /review (judging the A_REVOIR queue) and
   /gallery (consulting the kept ones). Same behaviour for the user, two honest
   URLs. Sub-views that already had a composed hash keep their shape as a path:
   `#scenes/poses` -> /bank/poses.

   Paths are in English, like the rest of the new code. UI copy stays French. */

export const PATHS = {
  /** Entry gate: the choice grid, shown when no character is claimed. */
  characters: '/characters',
  /** Read-only sheet of the claimed character. */
  character: '/character',
  wizard: '/characters/new',
  produce: '/produce',
  review: '/review',
  gallery: '/gallery',
  bankScenes: '/bank/scenes',
  bankPoses: '/bank/poses',
  application: '/app',
  journal: '/app/journal',
} as const

export type ScreenKey =
  | 'character'
  | 'produce'
  | 'review'
  | 'gallery'
  | 'bank'
  | 'application'

/* The six destinations of the studio navbar, in their order on screen.

   `key` is written to `data-s` on the button, exactly as the legacy frontend
   did: the navigation contract stays an explicit attribute rather than an
   assumption about markup. The VALUES are the new English screen keys, since
   the routes they designate changed name in this migration.

   `legacyHash` is what the same destination answers to in the old frontend,
   served in parallel at /legacy. A screen still marked `migrated: false` sends
   the user there instead of silently disappearing — nothing becomes
   unreachable while the migration runs. */
export type Destination = {
  key: ScreenKey
  label: string
  /* Label to use when a character is loaded, when the entry then opens
     something else. « Personnages » leads to the entry gate; once a character
     is open the same entry reads its SHEET, and says so. */
  labelWhenClaimed?: string
  path: string
  icon: string
  legacyHash: string
  migrated: boolean
  /** Shows the count of work WAITING (the A_REVOIR queue). Review only. */
  badge?: boolean
  /* Path prefix that lights this entry, when it is wider than the destination
     itself. Banque opens on /bank/scenes but owns /bank/poses too, exactly as
     the legacy tab stayed lit on `#scenes/poses`. */
  activePrefix?: string
}

export const DESTINATIONS: Destination[] = [
  {
    key: 'character',
    label: 'Personnages',
    labelWhenClaimed: 'Fiche',
    path: PATHS.character,
    icon: 'character',
    legacyHash: 'registre',
    migrated: true,
  },
  {
    key: 'produce',
    label: 'Produire',
    path: PATHS.produce,
    icon: 'produce',
    legacyHash: 'creer',
    migrated: false,
  },
  {
    key: 'review',
    label: 'Revue',
    path: PATHS.review,
    icon: 'review',
    legacyHash: 'trier',
    migrated: true,
    badge: true,
  },
  {
    key: 'gallery',
    label: 'Galerie',
    path: PATHS.gallery,
    icon: 'gallery',
    legacyHash: 'galerie',
    migrated: true,
  },
  {
    key: 'bank',
    label: 'Banque',
    path: PATHS.bankScenes,
    icon: 'bank',
    legacyHash: 'scenes',
    migrated: true,
    activePrefix: '/bank',
  },
  {
    key: 'application',
    label: 'Application',
    path: PATHS.application,
    icon: 'application',
    legacyHash: 'appli',
    migrated: true,
  },
]

/* Where the legacy frontend lives while the migration runs. It keeps its own
   `?character=` contract — it reads the id once at load, so the link has to
   carry it (that is precisely what point 1 fixes on the React side). */
export function legacyUrl(hash: string, characterId: string | null): string {
  const query = characterId ? `?character=${encodeURIComponent(characterId)}` : ''
  return `/legacy${query}#${hash}`
}

/* Is this destination the one currently open?

   A plain `startsWith` would light « Personnages » (/character) on the entry
   gate (/characters) as well — one path is a prefix of the other as a STRING,
   not as a route. Matching on the segment boundary is what separates them.

   Computed here rather than left to NavLink, because a destination not migrated
   yet is a plain <a> out of the SPA: /app/journal is React while /app is still
   legacy, and the Application entry must light up all the same. */
export function isDestinationActive(destination: Destination, pathname: string): boolean {
  const base = destination.activePrefix ?? destination.path
  return pathname === base || pathname.startsWith(base + '/')
}

/* The navbar entry « Personnages » leads to the sheet of the claimed character,
   or to the entry gate when none is claimed. That switch used to be an attribute
   written inside one screen; it is now a route choice, made here. */
export function characterPath(isClaimed: boolean): string {
  return isClaimed ? PATHS.character : PATHS.characters
}
