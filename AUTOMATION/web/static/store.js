/* ETAT PARTAGE TRANSITOIRE (J3 etape 1).

   Rassemble les variables autrefois globales implicites entre les 7 fichiers
   <script>. Objet unique importe par tous les modules : `S.LEVEL`, `S.SC`, etc.
   La reaffectation cross-module (`S.LEVEL = 2`) fonctionne, contrairement a un
   export `let` (lien mort, lecture seule chez l'importateur).

   ECHAFAUDAGE : l'etape 2 de J3 dissout ce module — chaque champ rejoint le
   module qui le possede, derriere des accessseurs et le bus d'evenements, et
   `store.js` disparait. Ne rien ajouter ici : un nouvel etat nait deja
   encapsule dans son module. */
export const S = {
  // --- ecran Creer -------------------------------------------------------
  SC: null,                 // contenu de scenes.json + vignettes
  SEL: new Set(),           // scenes selectionnees
  INTENT: null,             // intention choisie (bloc 1), '*' = toutes
  TONE: '',                 // ton choisi (bloc 2)
  CREATIVE: null,           // intentions / tons / echelle d'intensite
  LEVEL: 0,                 // niveau courant du curseur — jamais persiste
  CONFIRMED: new Set(),     // paliers confirmes pour cette session
  PLAN_OK: false,           // le dernier /api/plan connu a des jobs a lancer
  NSRC: new Set(),          // images sources cochees au cran NSFW
  NSRC_SIG: null,           // signature de la grille de sources rendue
  NARMED: false,            // etat d'armement de la branche NSFW
  NSFW_SEQ: 0,              // jeton anti-reponse-perimee (nsfwTick)

  // --- production en cours --------------------------------------------
  RUNNING: false,
  LASTBATCH: null,          // dernier batch_id deja pris en compte par tick()

  // --- banque de scenes --------------------------------------------------
  SC_DIRTY: false,          // scenes.json a des modifications non enregistrees
  PROPS: [],                // propositions du composeur
  JROWS: [], JFILTER: '',   // journal de generation

  // --- bandeau de panne ------------------------------------------------
  PANNES: {},

  // --- ecran Revue / tri ---------------------------------------------
  ITEMS_SEQ: 0,             // jeton anti-reponse-perimee (loadItems)
  BUCKET: 'A_REVOIR',
  SPACE: 'lena',            // axe SFW/NSFW (valeur SFW nommee 'lena' — != personnage)
  VIEW: 'grille',
  ITEMS: [],               // liste du dossier courant
  VITEMS: [],              // sous-ensemble reellement affiche (filtre de score)
  CUR: 0,
  SFILTER: 'tout',
  BANDES: {},              // etalonnage du realisme, cote serveur
  JUGES: 0,
  REFS: {mesurees: 0, total: 0},

  // --- valeurs lues dans config.json ---------------------------------
  // Bandes de lecture du score (jamais en dur : tri disque et affichage
  // doivent parler du meme seuil).
  QC: {ok: 0.72, watch: 0.60, high: 0.75},
  // Valeurs de reference des reglages de generation. Le panneau les affiche
  // comme « mesure » et le bouton de remise a zero y revient.
  PRESET_REF: {},
  NSFW_REF: {},
};
