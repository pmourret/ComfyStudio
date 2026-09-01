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

/** Appends one "N: description" line to a wardrobe text — the same shape a
    person would type by hand, so a chip click reads identically to typing
    afterward. Defaults to level 0: `wardrobe_for` walks DOWN from the
    requested level to the first non-empty one, so a level-0 line already
    backs every higher level unless a scene overrides it there. */
export function appendWardrobeLine(text: string, garment: string, level = 0): string {
  const line = `${level}: ${garment}`
  return text.trim() ? `${text}\n${line}` : line
}
