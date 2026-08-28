/* Personnage courant, choisi par ?character= dans l'URL (J3 etape 4).

   V1 : simple rechargement — changer de personnage = recharger avec un autre
   ?character=. api.js ajoute cet id a chaque appel /api/*. Le registre donne un
   nom lisible, un type et un monde (figes a la creation, ADR-0012) ; l'en-tete
   les reflete (reflectCharacter). Sans ?character= dans l'URL, aucun personnage
   n'est revendique : c'est le sas d'entree (main.js ouvre alors le registre). */
import {esc} from './dom.js';

const PARAMS = new URLSearchParams(location.search);
const CURRENT = PARAMS.get('character') || 'lena';

export const currentCharacter = () => CURRENT;
export const characterIsExplicit = () => PARAMS.has('character');

/* Reflete le personnage courant dans le chrome (en-tete + titre d'onglet). Un
   rechargement en ?character=<x> doit se voir a l'oeil, pas seulement dans la
   trace reseau. Repli immediat sur l'id brut ; on l'enrichit (nom, type, monde)
   des que /api/character repond. Ne jette jamais : si l'appel echoue, le repli
   reste (regle frontend : jamais un echec silencieux, mais pas d'ecran casse).
   fetch direct plutot que api() pour ne pas creer de cycle d'import avec api.js. */
export function reflectCharacter(){
  if (!characterIsExplicit()){ paintNeutral(); return; }
  paint({id: CURRENT});
  fetch(`/api/character?character=${encodeURIComponent(CURRENT)}`)
    .then(r => r.json())
    .then(d => { if (d && d.ok !== false) paint(d); })
    .catch(() => {});
}

function paintNeutral(){
  const brand = document.querySelector('.brand');
  if (brand) brand.textContent = 'Studio';
  document.title = 'Studio';
}

function paint(d){
  const brand = document.querySelector('.brand');
  if (brand){
    const parts = [`<i>${esc(d.name || d.id)}</i>`,
                   `<code class="brand-id">${esc(d.id)}</code>`];
    if (d.type) parts.push(`<span class="brand-tag">${esc(d.type)}</span>`);
    if (d.world && d.world.label)
      parts.push(`<span class="brand-tag">${esc(d.world.label)}</span>`);
    // jointes par une espace : l'espacement visuel vient du `gap` flex, mais
    // sans separateur textuel le nom et les tags se collent pour un lecteur
    // d'ecran (« Lénalenainstagram-influenceur »).
    brand.innerHTML = parts.join(' ');
  }
  document.title = `${d.name || d.id} — production`;
}
