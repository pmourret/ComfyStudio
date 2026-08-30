/* Declarative settings panel: the label, the explanation, the bounds and the
   reference value of a setting live in the SAME place. Adding a setting is
   adding a line here. Ported verbatim from `REGLAGES` in `static/create.js`.

   RULE: everything exposed drives something real. Each `key` is consumed either
   by WorkflowRunner.api_for (guidance, steps, refiner, refiner_denoise, sharpen,
   and the facedetailer / upscale_2k / grain_export groups), or by
   appliquer_grain (grain_telephone), or by appliquer_expression (expression,
   expression_budget), or by nsfw_batch (dest 'nsfw'). A control that drives
   nothing would suggest a setting that does not exist — worse than no control.

   `ref` is NOT written here: it comes from config.json through /api/config. The
   measured values have ONE source of truth (CLAUDE.md §8.4). */

export type SettingKind = 'bool' | 'liste' | 'nombre' | 'curseur'
/** Where the value goes in the run payload. */
export type SettingDest = 'job' | 'preset' | 'nsfw'

export type Setting = {
  id: string
  dest: SettingDest
  type: SettingKind
  label: string
  /** What it does, in one sentence. */
  quoi: string
  /** What it costs — said next to what it does, never after the fact. */
  cout?: string
  /** Key in preset/nsfw. Absent for the `job` fields, which travel by id. */
  cle?: string
  min?: number
  max?: number
  pas?: number
  /** Placeholder of an empty numeric field: what the server does without it. */
  vide?: string
  options?: [string, string][]
  bas?: string
  haut?: string
  /** Formatter: 'mp' renders bytes of surface as megapixels. */
  fmt?: 'mp'
  /** Master switch: with it off, this setting has no effect and says so. */
  lieA?: string
}

export type SettingSection = {
  titre: string
  /** Folded by default. */
  replie?: boolean
  /** 'edit': only shown on the tier that edits. */
  niveau?: 'edit'
  items: Setting[]
}

export const SECTIONS: SettingSection[] = [
  {
    titre: "Ce qu'on produit",
    items: [
      {
        id: 'count', dest: 'job', type: 'nombre', min: 1, max: 12, vide: 'défaut de la scène',
        label: 'Images par scène',
        quoi: 'Combien de photos tirer de chaque scène cochée. Chacune a sa propre graine, donc son cadrage et sa lumière à elle.',
      },
      {
        id: 'format', dest: 'job', type: 'liste',
        options: [
          ['', '— celui de la scène —'],
          ['4:5', '4:5 — feed Instagram'],
          ['2:3', '2:3 — portrait classique'],
          ['9:16', '9:16 — story'],
          ['1:1', '1:1 — carré'],
        ],
        label: 'Format imposé',
        quoi: 'Force le cadrage de tout le lot. Par défaut chaque scène garde le sien, qui a été choisi pour elle.',
      },
      {
        id: 'limit', dest: 'job', type: 'nombre', min: 1, max: 200, vide: 'aucune',
        label: 'Plafond du lot',
        quoi: "Coupe le lot après ce nombre d'images. Pratique pour goûter une série avant de la lancer en entier.",
      },
      {
        id: 'seed', dest: 'job', type: 'nombre', vide: 'aléatoire',
        label: 'Graine fixe',
        quoi: "Rejoue exactement la même image. Laisse vide pour du hasard. C'est la seule façon honnête de comparer deux réglages : même graine, même scène, une seule chose qui change.",
      },
      {
        id: 'novar', dest: 'job', type: 'bool',
        label: 'Ignorer les variantes',
        quoi: 'Les scènes proposent des variantes de lumière ou de météo. Coché, on ne garde que la version principale.',
      },
    ],
  },

  {
    titre: 'Fidélité et calcul', replie: true,
    items: [
      {
        id: 'guidance', cle: 'guidance', dest: 'preset', type: 'curseur', min: 1, max: 5, pas: 0.1,
        label: 'Liberté du modèle', bas: 'il improvise', haut: 'il obéit au texte',
        quoi: "À quel point le modèle s'accroche au texte de la scène.",
        cout: "Plus bas, le rendu est plus naturel mais la scène peut dériver. Plus haut, la scène est respectée mais la peau se lisse et l'image commence à se dénoncer comme générée. Au-delà de 3, ça se voit.",
      },
      {
        id: 'steps', cle: 'steps', dest: 'preset', type: 'curseur', min: 8, max: 36, pas: 1,
        label: 'Temps de calcul', bas: 'rapide et grossier', haut: 'fin et lent',
        quoi: "Nombre de passes du modèle sur l'image.",
        cout: "Le gain devient invisible au-delà d'une vingtaine de passes, alors que le temps, lui, continue de monter.",
      },
    ],
  },

  {
    titre: 'Peau et détail', replie: true,
    items: [
      {
        id: 'refiner', cle: 'refiner', dest: 'preset', type: 'bool',
        label: 'Repasse de texture',
        quoi: "Une seconde passe qui redonne du grain de peau. Le verrou d'identité fige le visage mais le lisse au passage : c'est le principal remède au « rendu IA ».",
      },
      {
        id: 'rdenoise', cle: 'refiner_denoise', dest: 'preset', type: 'curseur', min: 0.1, max: 0.8, pas: 0.05,
        label: 'Ampleur de la repasse', bas: 'retouche discrète', haut: "réécrit l'image",
        quoi: "Jusqu'où la repasse a le droit de modifier l'image.",
        cout: "Trop haut, elle ne retouche plus, elle réinvente — et le personnage bouge avec.",
        lieA: 'refiner',
      },
      {
        id: 'facedetailer', cle: 'facedetailer', dest: 'preset', type: 'bool',
        label: 'Reprise du visage',
        quoi: "Re-rend le visage en grand puis le recolle. C'est ce qui sauve les yeux et la bouche sur les plans larges, où le visage ne fait que quelques dizaines de pixels.",
      },
      {
        id: 'upscale', cle: 'upscale_2k', dest: 'preset', type: 'bool',
        label: 'Passage en 2K',
        quoi: "Agrandit puis redescend en 2K. Mesuré : +31 % de netteté, 4 secondes de plus, et quasiment rien de perdu sur l'identité. Il y a peu de raisons de le couper.",
      },
      {
        id: 'sharpen', cle: 'sharpen', dest: 'preset', type: 'curseur', min: 0, max: 1, pas: 0.05,
        label: 'Accentuation', bas: 'doux', haut: 'piqué',
        quoi: 'Dernier coup de netteté, tout en fin de chaîne.',
        cout: "Trop haut, les cheveux se hérissent et les contours se mettent à croustiller — un défaut très reconnaissable.",
      },
    ],
  },

  {
    titre: 'Vie et matière', replie: true,
    items: [
      {
        id: 'expression', cle: 'expression', dest: 'preset', type: 'bool',
        label: 'Expression du visage',
        quoi: "Fait jouer la mine selon le ton choisi, après le contrôle d'identité. Sans elle, le personnage porte rigoureusement le même visage sur toutes ses photos.",
      },
      {
        id: 'exprbudget', cle: 'expression_budget', dest: 'preset', type: 'curseur', min: 0, max: 0.15, pas: 0.01,
        label: "Marge d'identité accordée", bas: 'visage très stable', haut: 'plus de vie',
        quoi: "Ce qu'on accepte de perdre en ressemblance pour gagner en expression. Au-delà, l'expression est atténuée puis abandonnée.",
        cout: "Les photos réelles varient environ deux fois plus que la production actuelle. Monter ce curseur est le seul moyen de s'en rapprocher — et il se paie en ressemblance. C'est un arbitrage, pas un réglage optimal.",
        lieA: 'expression',
      },
      {
        id: 'graintel', cle: 'grain_telephone', dest: 'preset', type: 'bool',
        label: 'Grain de téléphone',
        quoi: "Ajoute le bruit d'un vrai capteur : de la luminance, pesée vers les ombres, presque rien dans les hautes lumières. C'est lui qui fait « photo prise sur l'instant » plutôt que « image de synthèse propre ».",
      },
      {
        id: 'grainexp', cle: 'grain_export', dest: 'preset', type: 'bool',
        label: 'Mise à la taille de publication',
        quoi: 'Redimensionne en fin de chaîne à la taille du réseau visé. Coupé, les images sortent à leur taille de génération.',
      },
      {
        id: 'grainstr', cle: 'grain_strength', dest: 'preset', type: 'curseur', min: 0, max: 0.05, pas: 0.002,
        label: 'Ancien grain du graphe', bas: 'coupé', haut: 'fort',
        quoi: 'Laissé à zéro volontairement.',
        cout: "Mesuré structurellement faux : autant de bruit de couleur que de luminance, et à plat sur toute la plage tonale — ce qu'aucun capteur ne fait. Le grain de téléphone ci-dessus le remplace. Le remonter superpose deux grains et salit l'image sans la rendre plus réelle.",
      },
    ],
  },

  {
    titre: 'Contrôle',
    items: [
      {
        id: 'noqc', dest: 'job', type: 'bool',
        label: "Sans contrôle d'identité",
        quoi: "Produit sans mesurer ni trier : tout atterrit dans « à revoir ». Réservé aux essais de rendu, où seule l'image compte. Indisponible au niveau NSFW, qui s'appuie sur le verdict pour décider quoi éditer.",
      },
    ],
  },

  {
    titre: 'Édition NSFW', niveau: 'edit',
    items: [
      {
        id: 'generavant', dest: 'job', type: 'bool',
        label: "Générer l'image avant de l'éditer",
        quoi: "Par défaut ce cran édite une image déjà validée — la branche n'engendre jamais de zéro, c'est la règle du projet. Coché, elle produit d'abord une image au cran Soft puis l'édite : utile seulement quand aucune image validée n'existe encore pour la scène voulue. Coûte une passe Flux complète (~55 s) de plus par image.",
      },
      {
        id: 'nsfwsteps', cle: 'steps', dest: 'nsfw', type: 'curseur', min: 4, max: 20, pas: 1,
        label: "Passes d'édition", bas: 'rapide', haut: 'lent',
        quoi: "Le modèle d'édition est un modèle rapide, conçu pour 4 à 8 passes.",
        cout: "Le monter ne l'améliore pas, ça ne fait que rallonger le temps.",
      },
      {
        id: 'nsfwcfg', cle: 'cfg', dest: 'nsfw', type: 'curseur', min: 1, max: 4, pas: 0.1,
        label: "Adhérence à l'instruction", bas: 'souple', haut: 'littéral',
        quoi: 'Imposé à 1.0 par le modèle rapide.',
        cout: "Le monter dégrade au lieu d'aider : ce modèle est distillé, il n'attend pas de guidage.",
      },
      {
        id: 'nsfwpix', cle: 'max_pixels', dest: 'nsfw', type: 'curseur', min: 600000, max: 2100000, pas: 50000,
        label: 'Surface de travail', bas: 'petit et net', haut: 'grand et mou', fmt: 'mp',
        quoi: "Taille à laquelle l'édition travaille avant d'être remontée à la taille d'origine.",
        cout: "Contre-intuitif et mesuré : au-delà d'environ 1,15 MP la zone éditée ressort molle. À graine fixe, 1,14 MP donne presque deux fois la netteté de 2,06 MP, pour la même identité et un quart de temps en moins.",
      },
      {
        id: 'nsfwface', cle: 'face_denoise', dest: 'nsfw', type: 'curseur', min: 0.1, max: 0.7, pas: 0.05,
        label: 'Re-rendu du visage', bas: 'retouche', haut: 'reconstruction',
        quoi: "À quel point le visage est refait après l'édition.",
        cout: "Plus haut qu'en SFW, et c'est voulu : ici on reconstruit un visage que l'édition a abîmé, on ne se contente pas de le retoucher.",
      },
    ],
  },
]

/** id -> descriptor, for quick lookups. */
export const BY_ID: Record<string, Setting> = {}
SECTIONS.forEach((section) => section.items.forEach((item) => (BY_ID[item.id] = item)))

/* Launch-bar presets. They no longer short-circuit the panel: they FILL it.
   Before, picking « Rapide » silently threw away the fine settings; now one sees
   exactly what the preset changes, and can retouch it right after. */
export const PRESETS: Record<string, Record<string, number | boolean>> = {
  realisme: {}, // the measured values
  rapide: { refiner: false },
  /* guidance 3.0 and not 3.5: the panel's own explanation says « au-delà de 3,
     ça se voit », and a preset that contradicts the text displayed next to it
     cannot be explained. Raising the guidance speeds nothing up anyway — the
     number of passes is what costs — it only holds the scene here. */
  brut: { refiner: false, facedetailer: false, grain_export: false, guidance: 3.0 },
}

export const fmtVal = (item: Setting, value: number | string): string =>
  item.fmt === 'mp'
    ? `${(Number(value) / 1e6).toFixed(2).replace('.', ',')} MP`
    : item.pas && item.pas < 1
      ? Number(value).toFixed(String(item.pas).split('.')[1].length)
      : String(value)
