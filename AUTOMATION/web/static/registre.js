/* Ecran #registre — DEUX vues, un ecran (F1.2, 30/08/2026).

     data-vue="sas"     la grille de choix (J7bis). Sans ?character= dans
                        l'URL, l'application s'ouvre la : aucun personnage
                        n'est revendique, la navbar est masquee.
     data-vue="fiche"   la fiche du personnage CHARGE. C'est ce que l'entree
                        de navbar ouvre des qu'un personnage est ouvert.

   Pourquoi : la navbar ouvrait le meme ecran que le sas, c'est-a-dire une
   SECONDE porte pour CHOISIR un personnage — alors que le menu identite de
   l'en-tete fait deja changer / creer / lister. Il y avait donc deux portes
   pour choisir, et aucune pour LIRE le personnage ouvert. La fiche est cette
   lecture, et rien d'autre : elle n'edite rien, elle n'arme rien.

   Ce qu'elle ne fait pas, exprimes :
     - elle ne rejoue pas la grille : « Tous les personnages » rouvre le menu
       de l'en-tete, seul endroit ou l'on change de personnage ;
     - elle n'ouvre jamais #armBox. L'armement du contenu adulte a UN seul
       geste, dans l'ecran Application (J7, ADR-0010) — ici on lit son etat et
       on dit ou il se prend. */
import {$, esc} from './dom.js';
import {api, erreurDe} from './api.js';
import {signalerPanne} from './health.js';
import {currentCharacter, characterIsExplicit, openIdMenu} from './character.js';

let LOADED = false;      // la grille du sas, chargee une fois
let FICHE = null;        // /api/character, lu une fois par chargement de page

/* Entree unique depuis nav.go('registre'). La vue ne se choisit pas a la main :
   elle suit ce que l'URL revendique — un personnage explicite, ou rien. */
export function openRegistre(){
  const ecran = $('#registre');
  if (!ecran) return;
  const fiche = characterIsExplicit();
  ecran.dataset.vue = fiche ? 'fiche' : 'sas';
  if (fiche) loadFiche();
  else loadRegistre();
}

/* Le libelle de l'entree de navbar suit ce qu'elle ouvre. `data-s="registre"`
   ne bouge PAS : c'est le contrat de navigation (nav.js, `body.no-character`,
   les fumigations). Sur le sas le bouton garde « Personnages » — il y est de
   toute facon masque avec le reste de la navbar. */
if (characterIsExplicit()){
  const lab = document.querySelector('.tabs button[data-s="registre"] .nav-lab');
  if (lab) lab.textContent = 'Fiche';
}

/* --------------------------------------------------------------- LE SAS ---
   Liste le registre des personnages (/api/characters) ; ouvrir une carte =
   recharger en ?character=<id> (rechargement simple, V1). Aucune landing :
   une liste dense. Chargee une fois, a la premiere visite de l'ecran. */
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

/* ------------------------------------------------------------- LA FICHE ---
   UN appel, /api/character, deja borne au personnage de l'URL : il porte le
   registre (nom, type, monde, pack), la base gelee et l'etat de l'outil
   d'edition. Aucune route neuve — la fiche ne montre rien que le serveur ne
   dise deja a l'en-tete et a l'ecran Application. */
async function loadFiche(){
  const box = $('#fiche');
  if (!box) return;
  if (FICHE){ peindre(FICHE); return; }
  box.innerHTML = `<p class="tiny">chargement de la fiche…</p>`;
  let d;
  try { d = await api('/api/character'); }
  catch { d = null; }
  const err = !d ? 'serveur injoignable' : erreurDe(d);
  signalerPanne('fiche', err);
  if (err){
    // Le repli n'invente rien : l'id vient de l'URL, il est vrai meme quand le
    // reste manque. Dire ce qu'on ne sait pas vaut mieux qu'une fiche vide.
    box.innerHTML = `<div class="empty"><b>Fiche indisponible</b>
      Le serveur n'a pas rendu la fiche de <code>${esc(currentCharacter())}</code> :
      ${esc(err)}.</div>`;
    return;
  }
  FICHE = d;
  peindre(d);
}

// premiere lettre du nom lisible, majuscule — meme regle que le chrome
// (character.js) : `[...str]` et pas charAt, un nom hors BMP se couperait en
// deux demi-unites.
const initiale = d => ([...String(d.name || d.id || '?').trim()][0] || '?').toUpperCase();

const ligne = (k, v) => `<dt>${esc(k)}</dt><dd>${v}</dd>`;

/* Contenus actifs : le registre de CREATION (ADR-0004), axe transversal aux
   packs. En V1 seul `image` est actif partout ; video et voix sont declares et
   inactifs, pour que les activer soit un changement de valeur. La fiche le dit
   plutot que de faire croire a une lacune. */
const CONTENUS = {image: 'image', video: 'vidéo', voice: 'voix', staging: 'mise en scène'};

function contenus(d){
  const ct = d.content_types || {};
  const actifs = Object.keys(CONTENUS).filter(k => ct[k]);
  const dorm = Object.keys(CONTENUS).filter(k => k in ct && !ct[k]);
  return (actifs.map(k => CONTENUS[k]).join(', ') || '—')
    + (dorm.length ? ` <span class="tiny">· déclarés, pas encore branchés :
       ${dorm.map(k => CONTENUS[k]).join(', ')}</span>` : '');
}

function peindre(d){
  const box = $('#fiche');
  const u = d.universe || {};
  const base = d.base || {};
  box.innerHTML = `
    <div class="fiche-hd">
      <span class="fiche-av" aria-hidden="true">${esc(initiale(d))}</span>
      <div>
        <h2>${esc(d.name || d.id)}</h2>
        <code class="fiche-id">${esc(d.id)}</code>
      </div>
      <div class="spacer" style="flex:1"></div>
      <button class="link" id="ficheAutres">Tous les personnages</button>
    </div>
    <p class="tiny fiche-intro">Fiche du personnage ouvert — en lecture. Pour en
      ouvrir un autre ou en créer un, passe par le menu d'identité de l'en-tête.</p>

    <div class="fiche-grid">
      <div class="meta">
        <dl style="margin:0">
          ${ligne('Type de personnage', esc(d.type || '—'))}
          ${ligne('Style de sortie', esc(d.output_style || '—'))}
          ${ligne('Monde', esc((d.world && d.world.label) || '—'))}
        </dl>
        <p class="tiny" style="margin:2px 0 0">Trois choix humains, <b>figés à la
          création</b> : en changer, c'est créer un autre personnage.</p>
      </div>
      <div class="meta">
        <dl style="margin:0">
          ${ligne('Pack', esc(u.label || u.id || '—')
            + (u.model_family ? ` <span class="tiny">· ${esc(u.model_family)}</span>` : ''))}
          ${ligne('Base gelée', base.present
            ? `présente <span class="tiny">· <code>${esc(base.name || '')}</code></span>`
            : (base.name
                ? `<b>introuvable</b> <span class="tiny">· <code>${esc(base.name)}</code>
                   attendue dans les entrées de ComfyUI</span>`
                : '<b>absente</b>'))}
          ${ligne('Contenus actifs', contenus(d))}
        </dl>
        <p class="tiny" style="margin:2px 0 0">Le pack n'est pas choisi : il est
          <b>déduit</b> du type et du style, et il porte le verrou d'identité.</p>
      </div>
    </div>

    <div class="meta fiche-nsfw">
      <dt style="margin-bottom:9px">Contenu adulte</dt>
      ${etatNsfw(d)}
      <p class="tiny" style="margin:10px 0 0">${d.nsfw
        ? 'Se désactive au même endroit :' : 'Pour l’activer :'}
        <b>Application → Contenu adulte</b>.</p>
    </div>`;
  // « Tous les personnages » rouvre le menu de l'EN-TETE — il n'y a pas deux
  // endroits ou l'on change de personnage. stopPropagation : le clic hors de
  // `.idwrap` referme ce menu (character.js), y compris celui qui l'ouvre.
  $('#ficheAutres').onclick = e => { e.stopPropagation(); openIdMenu(); };
}

/* Etat de la branche adulte, en LECTURE. Trois etats distincts, jamais fondus
   en « indisponible » : l'interrupteur du personnage, le graphe d'edition du
   pack, et les deux ensemble. Un personnage arme dont le pack n'a pas l'outil
   n'a pas le meme probleme qu'un personnage simplement eteint — et la fiche
   sert justement a lire lequel des deux.

   Deux conditions, deux phrases : ce que l'etat VAUT, puis ce qu'il CHANGE sur
   l'ecran Produire. Sans la seconde, « activé » ne dit pas si un cran apparait
   quelque part, ce qui est la seule question qu'on se pose en lisant la fiche. */
function etatNsfw(d){
  const t = d.nsfw_tool || {};
  const arme = !!(d.nsfw || t.armed);
  const graphe = !!t.has_graph;
  const etat = arme
    ? (graphe ? 'activé' : 'activé, sans outil d’édition dans ce pack')
    : 'désactivé';
  const effet = !arme
    ? 'aucun cran d’édition sur Produire, aucune sortie NSFW'
    : graphe ? 'le cran d’édition est proposé sur Produire'
             : 'aucun cran sur Produire tant que le pack n’a pas son graphe';
  // la raison vient du serveur (edit_tool_state) : la meme phrase que l'ecran
  // Application, pas une seconde formulation a tenir a jour ici
  const raison = !graphe && t.reason
    ? `<p class="tiny" style="margin:8px 0 0">${esc(t.reason)}</p>` : '';
  return `<p class="tiny" style="margin:0">État : <b>${esc(etat)}</b>
    <span class="tiny">· ${effet}</span></p>${raison}`;
}
