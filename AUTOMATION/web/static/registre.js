/* Sas d'entree (J7bis). Liste le registre des personnages (/api/characters) ;
   ouvrir une carte = recharger en ?character=<id> (rechargement simple, V1).
   Aucune landing : une liste dense. Chargee une fois, a la premiere visite de
   l'ecran (nav.js). */
import {esc} from './dom.js';
import {signalerPanne} from './health.js';

let LOADED = false;

export async function loadRegistre(){
  if (LOADED) return;
  const grid = document.getElementById('charGrid');
  if (!grid) return;

  let d;
  try { d = await fetch('/api/characters').then(r => r.json()); }
  catch { d = null; }
  if (!d || !Array.isArray(d.characters)){
    signalerPanne('registre', 'liste des personnages illisible');
    return;
  }
  signalerPanne('registre', null);
  LOADED = true;

  if (!d.characters.length){
    grid.innerHTML = `<div class="empty"><b>Aucun personnage</b>`
      + `Le dossier CHARACTERS/ est vide sur cette machine.</div>`;
    return;
  }

  const here = new URLSearchParams(location.search).get('character');
  grid.innerHTML = d.characters.map(c => {
    const current = c.id === here ? ' char-card--current' : '';
    const world = c.world && c.world.label ? esc(c.world.label) : '—';
    const tags = [
      `<span class="char-tag">${esc(c.type || '—')}</span>`,
      `<span class="char-tag">${world}</span>`,
      c.nsfw ? `<span class="char-tag char-tag--nsfw">NSFW</span>` : '',
      c.known_universe === false
        ? `<span class="char-tag char-tag--warn">pack inconnu</span>` : '',
    ].join('');
    return `<a class="char-card${current}" href="?character=${encodeURIComponent(c.id)}">`
      + `<b>${esc(c.name || c.id)}</b><code>${esc(c.id)}</code>`
      + `<div class="char-tags">${tags}</div></a>`;
  }).join('');
}
