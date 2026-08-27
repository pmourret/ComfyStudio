/* Personnage courant, choisi par ?character= dans l'URL (J3 etape 4).

   V1 : simple rechargement — changer de personnage = recharger avec un autre
   ?character=. api.js ajoute cet id a chaque appel /api/*. Le registre J4
   donne un nom lisible et un univers ; l'en-tete les reflete (reflectCharacter). */
import {esc} from './dom.js';

const CURRENT = new URLSearchParams(location.search).get('character') || 'lena';

export const currentCharacter = () => CURRENT;

/* Reflete le personnage courant dans le chrome (en-tete + titre d'onglet). Un
   rechargement en ?character=<x> doit se voir a l'oeil, pas seulement dans la
   trace reseau. Repli immediat sur l'id brut ; on l'enrichit avec le nom lisible
   et l'univers des que /api/character repond. Ne jette jamais : si l'appel
   echoue, le repli reste (regle frontend : jamais un echec silencieux, mais pas
   d'ecran casse non plus). fetch direct plutot que api() pour ne pas creer de
   cycle d'import avec api.js. */
export function reflectCharacter(){
  peindre(CURRENT, null);
  fetch(`/api/character?character=${encodeURIComponent(CURRENT)}`)
    .then(r => r.json())
    .then(d => { if (d && d.ok !== false) peindre(d.name || CURRENT, d.universe); })
    .catch(() => {});
}

function peindre(nom, univers){
  const brand = document.querySelector('.brand');
  if (brand){
    const tag = univers && (univers.label || univers.id);
    brand.innerHTML = `Production <i>${esc(nom)}</i>`
      + (tag ? ` <span class="brand-uni">${esc(tag)}</span>` : '');
  }
  document.title = `${nom} — production`;
}
