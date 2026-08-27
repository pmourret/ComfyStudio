/* Personnage courant, choisi par ?character= dans l'URL (J3 etape 4).

   V1 : simple rechargement — il n'y a qu'un personnage, donc pas de selecteur
   a l'ecran (le registre multi-personnage est J4). L'id est fige au chargement
   de la page ; changer de personnage = recharger avec un autre ?character=.
   api.js ajoute cet id a chaque appel /api/*. */
import {esc} from './dom.js';

const CURRENT = new URLSearchParams(location.search).get('character') || 'lena';

export const currentCharacter = () => CURRENT;

/* Reflete le personnage courant dans le chrome (en-tete + titre d'onglet), pour
   qu'un rechargement en ?character=<x> se voie a l'oeil et pas seulement dans la
   trace reseau. V1 : pas de registre, donc pas de nom d'affichage lisible ni
   d'univers — l'id brut suffit a confirmer quel personnage recoit les appels
   (J4 apportera le nom lisible et l'univers). */
export function reflectCharacter(){
  const brand = document.querySelector('.brand');
  if (brand) brand.innerHTML = `Production <i>${esc(CURRENT)}</i>`;
  document.title = `${CURRENT} — production`;
}
