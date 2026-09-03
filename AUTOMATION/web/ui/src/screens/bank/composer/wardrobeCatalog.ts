/* A small, static starter vocabulary for the wardrobe quick-add chips
   (ClothingPanel, in SceneComposer.tsx). NOT a real illustrated asset catalog
   — no images, no backend, no `INPUTS/WARDROBE/` — just descriptive fragments
   grouped by garment, in the exact "N: description" syntax the wardrobe
   textarea already reads (`textToWardrobe`). Growing this list is a content
   edit; a real illustrated catalog (the composer's "Sélecteur de vêtement"
   empty state before this list existed) would replace it wholesale rather
   than extend it — see the composer's architecture Q&A for why that catalog
   was deferred. */
export const WARDROBE_CATALOG: { category: string; items: string[] }[] = [
  {
    category: 'Haut',
    items: [
      'a beige knit sweater',
      'a white cotton t-shirt',
      'a linen button-up shirt',
      'a fitted turtleneck',
    ],
  },
  {
    category: 'Bas',
    items: [
      'light blue denim jeans',
      'a pleated midi skirt',
      'tailored wide-leg trousers',
      'jersey shorts',
    ],
  },
  {
    category: 'Une pièce',
    items: ['a wrap dress', 'a linen jumpsuit', 'a slip dress'],
  },
  {
    category: 'Sous-vêtements',
    items: [
      'a simple cotton bra and briefs set',
      'a lace bralette',
      'a seamless nude underwear set',
    ],
  },
  {
    category: 'Chaussures',
    items: ['white canvas sneakers', 'leather ankle boots', 'simple leather sandals'],
  },
  {
    category: 'Accessoires',
    items: ['a delicate gold necklace', 'a wide-brim straw hat', 'a canvas tote bag'],
  },
]

/** The 4 levels the composer edits as separate fields (design pass écran 7,
    §V2) — `wardrobe_for` (backend) reads whichever of these a scene
    declares, walking down to the first non-empty one it finds. */
export const WARDROBE_LEVELS = [0, 1, 2, 3] as const

/** Splits the flat "N: description" wardrobe text (`draft.wardrobe`, one
    outfit per line) into one text block per level, prefix stripped — what
    each of `ClothingPanel`'s 4 fields shows. A line that does not parse as
    "0-3: description" lands in `extra` rather than being dropped: it may
    already be malformed via the Recap tab's raw mirror field
    (`PromptField` on `wardrobe_recap`, same underlying state), and a visit
    to this panel must not silently erase it — same "never lose an outfit in
    silence" rule `invalidOutfits` enforces at save time. */
export function splitWardrobeByLevel(text: string): { byLevel: Record<number, string>; extra: string[] } {
  const grouped: Record<number, string[]> = {}
  const extra: string[] = []
  ;(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^([0-3])\s*:\s*(.+)$/)
      if (match) {
        const level = Number(match[1])
        ;(grouped[level] ??= []).push(match[2].trim())
      } else {
        extra.push(line)
      }
    })
  const byLevel: Record<number, string> = {}
  WARDROBE_LEVELS.forEach((level) => {
    byLevel[level] = (grouped[level] ?? []).join('\n')
  })
  return { byLevel, extra }
}

/** Inverse of `splitWardrobeByLevel`: one "N: description" line per non-empty
    line of each level field, level order first, any unparsed leftover last
    (never dropped) — the same syntax `textToWardrobe`
    (ScenesStoreContext.tsx) reads back into the scene's `wardrobe` object. */
export function joinWardrobeByLevel(byLevel: Record<number, string>, extra: string[] = []): string {
  const lines = WARDROBE_LEVELS.flatMap((level) =>
    (byLevel[level] ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `${level}: ${line}`),
  )
  return [...lines, ...extra].join('\n')
}
