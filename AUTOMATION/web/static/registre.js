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

  // <a href="#wizard"> : la navigation passe par le hashchange de nav.js, ce
  // qui evite un cycle d'import registre <-> nav. Presente MEME registre vide :
  // sinon une machine neuve (CHARACTERS/ absent, cas prevu) ouvre un sas sans
  // aucun chemin vers le wizard.
  const newCard = `<a class="char-card char-card--new" href="#wizard">`
    + `<b>+ Nouveau personnage</b>`
    + `<span class="tiny">type, style et monde — figés à la création</span></a>`;

  if (!d.characters.length){
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Aucun personnage</b>`
      + `Le dossier CHARACTERS/ est vide sur cette machine.</div>` + newCard;
    return;
  }

  const here = new URLSearchParams(location.search).get('character');
  const cards = d.characters.map(c => {
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
  });
  cards.push(newCard);
  grid.innerHTML = cards.join('');
}
