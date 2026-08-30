/* Constantes partagees, figees. Extrait de core.js en J3 (modules ES). */

export const VERDICT_LABEL = {
  OK: 'validées', A_REVOIR: 'à revoir', REJET: 'rejetées',
  SANS_VISAGE: 'sans visage', ERREUR: 'en erreur',
};

/* Destinations qui ne sont PAS simplement « le nom de l'ecran ». Cinq cles par
   entree, toutes optionnelles sauf `screen` :

     screen  l'ecran a allumer
     tab     l'onglet du chrome a marquer actif (defaut : le nom de la route)
     bucket  entree de tri — sa presence est ce qui declenche loadItems()
     metier  ce que l'ecran #trier laisse FAIRE : 'revue' (juger) ou 'galerie'
             (consulter). Deux destinations du chrome, un seul ecran.
     vue     sous-vue de l'ecran (banque : « scenes » ou « poses »)

   "galerie" et "trier" partagent l'ecran #trier — mais plus le meme metier
   (30/08/2026, F1.1). Revue ouvre la file a juger (A_REVOIR) avec ses gestes
   V/X/A ; Galerie ouvre les images gardees (OK) sans aucun geste de tri : on y
   regarde, on edite, on telecharge. Un seul `loadItems`, un seul rendu de
   grille : c'est `metier` qui change ce qui est propose, pas une copie de
   l'ecran.

   "scenes/poses" est la sous-vue Poses de la banque, partageable comme les
   autres. Le SLASH est voulu : il dit « sous-vue de », pas « autre ecran » —
   et c'est nav.js, via cette table, qui le resout ; jamais un `#` construit a
   la main quelque part dans le code. */
export const ROUTES = {
  galerie:        {screen: 'trier',  tab: 'galerie', bucket: 'OK',       metier: 'galerie', nomme: true},
  trier:          {screen: 'trier',  tab: 'trier',   bucket: 'A_REVOIR', metier: 'revue',   nomme: true},
  'scenes/poses': {screen: 'scenes', tab: 'scenes',  vue: 'poses'},
};

/* Resolution d'un nom de destination, ROUTES d'abord.

   `nomme: true` dit qu'une route accepte un SUFFIXE `/<nomfichier>` — la meme
   famille de hash que « scenes/poses », pas un second langage : `#galerie/x.png`
   ouvre la Galerie sur cette image, `#trier/x.png` la Revue. Le nom ne peut pas
   etre une cle en dur (il y en a autant que de fichiers), d'ou cette fonction —
   mais la FORME reste declaree ici, avec les autres, et nulle part ailleurs. */
export function routeFor(name){
  const exacte = ROUTES[name];
  if (exacte) return exacte;
  const coupe = name.indexOf('/');
  if (coupe < 0) return null;
  const base = ROUTES[name.slice(0, coupe)];
  if (!base || !base.nomme) return null;
  // le hash est percent-encode par le navigateur : on rend le nom de fichier
  // reel, celui que /api/gallery renvoie. Un encodage invalide ne leve pas —
  // il donnera juste un nom introuvable, dit a l'ecran (review.js).
  let focus = name.slice(coupe + 1);
  try { focus = decodeURIComponent(focus); } catch { /* nom garde tel quel */ }
  return {...base, focus};
}

/* La forme partageable d'UNE image, construite a UN seul endroit : le bucket
   decide la destination — une validee se lit en Galerie, tout le reste se juge
   en Revue. Les appelants (inspecteur, fin de lot) n'ont pas a la deviner. */
export const hashPourImage = it =>
  (it && it.bucket === 'OK' ? 'galerie/' : 'trier/')
  + encodeURIComponent((it && it.name) || '');
