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
  wireIdMenu();
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

/* Menu identité du chrome (#btnId / #idMenu) : changer de personnage, revenir
   au registre, en creer un. La zone appartient a ce module ; nav.js n'en
   appelle que la fermeture (closeIdMenu). */
let switcherLoaded = false;

function wireIdMenu(){
  const btn = document.getElementById('btnId');
  const menu = document.getElementById('idMenu');
  if (!btn || !menu || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = menu.classList.toggle('on');
    btn.classList.toggle('on', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) fillSwitcher();
  });
}

export function closeIdMenu(){
  const btn = document.getElementById('btnId');
  const menu = document.getElementById('idMenu');
  if (menu) menu.classList.remove('on');
  if (btn){ btn.classList.remove('on'); btn.setAttribute('aria-expanded', 'false'); }
}

/* Liste des AUTRES personnages, chargee au premier ouverture du menu (une
   seule fois). Chaque entree recharge en ?character=<id> — contrat V1. Echec
   -> message dans le menu, jamais un menu vide muet ; reessayable. */
function fillSwitcher(){
  if (switcherLoaded) return;
  const box = document.getElementById('idSwitch');
  if (!box) return;
  switcherLoaded = true;
  fetch('/api/characters')
    .then(r => r.json())
    .then(d => {
      const others = (Array.isArray(d && d.characters) ? d.characters : [])
        .filter(c => c.id !== CURRENT);
      box.innerHTML = others.map(c =>
        `<a href="?character=${encodeURIComponent(c.id)}">${esc(c.name || c.id)}`
        + `<small>${esc(c.type || c.id)}</small></a>`).join('')
        || `<span class="tiny">aucun autre personnage</span>`;
    })
    .catch(() => {
      switcherLoaded = false;
      box.innerHTML = `<span class="tiny">liste indisponible</span>`;
    });
}
