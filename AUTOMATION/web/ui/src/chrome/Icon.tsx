/* The studio's icon set, verbatim from the legacy chrome (index.html navbar,
   rail.js, sondes.js). Same 20x20 grid, same 1.5 stroke, same currentColor, so
   the navbar and the rail keep reading as one chrome.

   Icons are attached to a SURFACE or a destination, never to a free-text label:
   a pack's tools.json writes its own labels, and the surface is the vocabulary
   the studio already knows how to interpret (CLAUDE.md §8.7 — never a test on
   the character or the pack). */
const PATHS: Record<string, string> = {
  // --- navbar destinations
  character: '<circle cx="10" cy="7" r="3"/><path d="M4 17c0-3.3 2.7-5 6-5s6 1.7 6 5"/>',
  produce:
    '<rect x="3" y="3.5" width="14" height="13" rx="2"/><circle cx="7.3" cy="7.3" r="1.3"/><path d="M4 13.5l3.4-3.6 2.6 2.7L12.6 10l3.4 3.8"/>',
  review: '<path d="M3 10.2l4.2 4.3L17 5"/>',
  gallery:
    '<rect x="3" y="3" width="6" height="6" rx="1.4"/><rect x="11" y="3" width="6" height="6" rx="1.4"/><rect x="3" y="11" width="6" height="6" rx="1.4"/><rect x="11" y="11" width="6" height="6" rx="1.4"/>',
  bank: '<path d="M10 3l7 3.5-7 3.5-7-3.5z"/><path d="M3 11.2l7 3.5 7-3.5"/>',
  worlds:
    '<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c2.5 2.2 2.5 11.8 0 14M10 3c-2.5 2.2-2.5 11.8 0 14"/>',
  application:
    '<path d="M3.5 6h13M3.5 10h13M3.5 14h13"/><circle cx="7.5" cy="6" r="1.7"/><circle cx="13" cy="10" r="1.7"/><circle cx="6.5" cy="14" r="1.7"/>',
  // --- chrome controls
  focus: '<path d="M7.5 3H3v4.5M12.5 3H17v4.5M17 12.5V17h-4.5M3 12.5V17h4.5"/>',
  chevron: '<path d="M12 5l-5 5 5 5"/>',
  search: '<circle cx="8.5" cy="8.5" r="5.2"/><path d="M12.6 12.6L17 17"/>',
  // --- rail surfaces
  pose: '<circle cx="10" cy="4.5" r="2"/><path d="M10 6.5v6M10 12.5l-3 4.5M10 12.5l3 4.5M5.5 8.5L10 7.5l4.5 1"/>',
  scenes:
    '<rect x="2.5" y="4.5" width="15" height="11" rx="1.5"/><path d="M2.5 12l4-3.5 3.5 3 3-2.5 4.5 4"/><circle cx="7" cy="8" r="1"/>',
  image: '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 13l4-4 3 3 2.5-2 4.5 4.5"/>',
  gear:
    '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"/>',
  // --- scene composer (bank/composer)
  bulb: '<path d="M10 3.5a4.4 4.4 0 00-2.5 8c.5.35.8.9.8 1.5v.6h3.4v-.6c0-.6.3-1.15.8-1.5a4.4 4.4 0 00-2.5-8z"/><path d="M8.5 16.3h3"/>',
  shirt:
    '<path d="M7.2 3.3L4 5.8l1.7 2.3 1.3-1v9.4h6V7.1l1.3 1 1.7-2.3-3.2-2.5-1.4 1.1H8.6z"/>',
  pencil: '<path d="M13.3 3.7l3 3-9.1 9.1-3.5.6.6-3.5z"/><path d="M11.6 5.4l3 3"/>',
  robot:
    '<rect x="5" y="6.2" width="10" height="7.8" rx="2"/><path d="M10 3.5v2.7M4 9.5v3M16 9.5v3"/><circle cx="7.6" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="12.4" cy="10" r=".9" fill="currentColor" stroke="none"/>',
  terminal:
    '<rect x="2.5" y="4" width="15" height="12" rx="1.5"/><path d="M5.8 8.3l3 2.4-3 2.4M10.8 13.1h3.4"/>',
  info: '<circle cx="10" cy="10" r="7.2"/><path d="M10 9.3v4.3"/><circle cx="10" cy="6.5" r=".9" fill="currentColor" stroke="none"/>',
  save: '<rect x="4" y="3" width="12" height="14" rx="1.5"/><path d="M7.2 3v4h5.6V3"/><rect x="6.5" y="11" width="7" height="5"/>',
  // A surface with no declared icon, or an unknown one, takes this: a collapsed
  // rail must never show an EMPTY button.
  default: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="1.6"/>',
  // --- probes
  ram: '<rect x="2.5" y="6" width="15" height="8" rx="1.5"/><path d="M5.5 14v2.5M10 14v2.5M14.5 14v2.5M6 9h8"/>',
  vram: '<rect x="2" y="5" width="16" height="10" rx="1.5"/><circle cx="7" cy="10" r="2.4"/><path d="M12 8.5h3.5M12 11.5h3.5"/>',
  temp: '<path d="M12 11.5V4a2 2 0 10-4 0v7.5a3.5 3.5 0 104 0z"/><path d="M10 7.5v6"/>',
}

export type IconName = keyof typeof PATHS

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? PATHS.default }}
    />
  )
}
