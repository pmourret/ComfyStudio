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
    // Pastille d'identite : l'INITIALE, pas le portrait de base gelee. Aucune
    // route ne sert les octets de config.json/base_gelee (le fichier vit hors
    // de PROD/, cote entrees ComfyUI) et en inventer une qui lise ce dossier
    // sans borne character_id rouvrirait la fuite que l'isolation du
    // 29/08/2026 vient de fermer. Reporte, pas oublie.
    const parts = [`<span class="brand-av" aria-hidden="true">${esc(initiale(d))}</span>`,
                   `<i>${esc(d.name || d.id)}</i>`,
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

// premiere lettre du nom lisible, majuscule. `[...str]` et pas charAt : un nom
// qui commencerait par un caractere hors BMP se couperait en deux demi-unites.
const initiale = d => ([...String(d.name || d.id || '?').trim()][0] || '?').toUpperCase();

/* Menu identité du chrome (#btnId / #idMenu) : changer de personnage, revenir
   au registre, en creer un. La zone appartient a ce module ; nav.js n'en
   appelle que la fermeture (closeIdMenu). */
let switcherLoaded = false;

// entrees navigables du menu : les <a> injectes (#idSwitch) + les 2 statiques
const idMenuItems = menu => [...menu.querySelectorAll('a')];

function wireIdMenu(){
  const btn = document.getElementById('btnId');
  const menu = document.getElementById('idMenu');
  if (!btn || !menu || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.classList.contains('on') ? closeIdMenu() : openIdMenu();
  });
  // role=menu : fleches / Home / End deplacent le focus, Echap ferme
  menu.addEventListener('keydown', e => {
    const items = idMenuItems(menu);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown'){ e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home'){ e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End'){ e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Escape'){ closeIdMenu(); }
  });
}

function openIdMenu(){
  const btn = document.getElementById('btnId');
  const menu = document.getElementById('idMenu');
  if (!btn || !menu) return;
  menu.classList.add('on');
  btn.classList.add('on');
  btn.setAttribute('aria-expanded', 'true');
  fillSwitcher();                       // remplit #idSwitch (une seule fois)
  idMenuItems(menu)[0]?.focus();        // focus sur la premiere entree
}

export function closeIdMenu(){
  const btn = document.getElementById('btnId');
  const menu = document.getElementById('idMenu');
  const dansMenu = menu && menu.contains(document.activeElement);
  if (menu) menu.classList.remove('on');
  if (btn){
    btn.classList.remove('on');
    btn.setAttribute('aria-expanded', 'false');
    if (dansMenu) btn.focus();          // rendre le focus au declencheur
  }
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
        `<a href="?character=${encodeURIComponent(c.id)}" role="menuitem" tabindex="-1">${esc(c.name || c.id)}`
        + `<small>${esc(c.type || c.id)}</small></a>`).join('')
        || `<span class="tiny">aucun autre personnage</span>`;
    })
    .catch(() => {
      switcherLoaded = false;
      box.innerHTML = `<span class="tiny">liste indisponible</span>`;
    });
}
