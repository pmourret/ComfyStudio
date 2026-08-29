/* Rail d'outils de l'atelier (29/08/2026).

   CE QUE LE RAIL N'EST PAS : une seconde navigation. Les cinq onglets du header
   restent le chrome, et aucune de leurs destinations n'est recopiee ici —
   Personnages, Produire, Revue, Réglages n'y figurent pas.

   CE QU'IL EST : les OUTILS du pack du personnage courant, lus dans
   `UNIVERS/<pack>/tools.json` via /api/universe/tools, plus les raccourcis
   d'atelier qui ne sont pas des destinations primaires.

   Le rail ne sait rien du personnage ni du pack (CLAUDE.md §8.7) : il lit un
   `surface` declare par l'outil et cherche ce que cette surface ouvre dans la
   table SURFACES ci-dessous. Un pack qui declare une surface connue obtient le
   meme bouton, quel que soit son personnage ; une surface inconnue rend un
   bouton INERTE qui dit pourquoi — jamais une destination inventee. */
import {$, esc} from './dom.js';
import {api, erreurDe} from './api.js';
import {on} from './bus.js';
import {go} from './nav.js';
import {toggleGear} from './create.js';

/* Les surfaces que le studio sait ouvrir aujourd'hui. `aller` : une route de
   nav.js. `inerte` : la raison, affichee en title — l'outil existe, il n'a
   simplement pas de point d'entree propre depuis le rail. */
const SURFACES = {
  'bank-poses':      {aller: 'scenes/poses'},
  'bank-scenes':     {aller: 'scenes'},
  'review-lightbox': {inerte: 'depuis une image de la Revue'},
};
const INCONNUE = 'pas encore de surface dans le studio';

/* Raccourcis d'atelier — ils ne viennent d'aucun pack, ils sont la structure du
   studio. Un raccourci dont un OUTIL couvre deja la destination est retire : la
   pose est declaree dans les deux tools.json, elle n'apparait donc qu'une fois. */
const RACCOURCIS = [
  {label: 'Scènes', aller: 'scenes'},
  {label: 'Poses',  aller: 'scenes/poses'},
];

let OUTILS = null;        // null tant que /api/universe/tools n'a pas repondu
let ROUTE = {screen: 'creer', vue: null};

/* --- construction ---------------------------------------------------- */

const ligne = (label, aller, inerte) => `
  <button class="rail-it" ${aller ? `data-go="${esc(aller)}"` : 'disabled'}
          ${inerte ? `title="${esc(inerte)}"` : ''}>${esc(label)}</button>`;

function peindre(){
  const r = $('#toolRail');
  if (!r) return;

  if (OUTILS === null){ r.innerHTML = '<p class="rail-msg">chargement…</p>'; return; }
  if (OUTILS.erreur){
    // frontend.md : une erreur backend se dit a l'ecran. Sans ca le rail
    // paraitrait simplement vide, et un pack sans outil aurait la meme tete.
    r.innerHTML = `<p class="rail-msg rail-ko">outils indisponibles<br>
      <span class="tiny">${esc(OUTILS.erreur)}</span></p>`;
    return;
  }

  const outils = OUTILS.tools || [];
  const rendus = outils.map(o => {
    const s = SURFACES[o.surface] || {inerte: INCONNUE};
    return {label: o.label || o.id, aller: s.aller, inerte: s.aller ? '' : s.inerte};
  });
  // dedoublonnage par destination : un raccourci que le pack couvre deja
  const pris = new Set(rendus.map(x => x.aller).filter(Boolean));
  const courts = RACCOURCIS.filter(x => !pris.has(x.aller));

  r.innerHTML = `
    <div class="rail-grp">
      <div class="rail-lab">Outils</div>
      ${rendus.length ? rendus.map(x => ligne(x.label, x.aller, x.inerte)).join('')
                      : '<p class="rail-msg">aucun outil déclaré pour ce pack</p>'}
    </div>
    ${courts.length ? `<div class="rail-grp">
      <div class="rail-lab">Atelier</div>
      ${courts.map(x => ligne(x.label, x.aller, '')).join('')}
    </div>` : ''}
    <div class="rail-foot">
      <button class="rail-it" id="railGear">⚙ Réglages de génération</button>
    </div>`;

  r.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  // stopPropagation comme #btnGear : sans lui le handler de fermeture globale de
  // nav.js, qui suit dans la phase de bulle, refermerait le panneau aussitot
  $('#railGear').onclick = e => { e.stopPropagation(); toggleGear(); };
  majActif();
}

/* --- etat actif ------------------------------------------------------ */

/* Une entree est active quand la route courante EST sa destination, sous-vue
   comprise : sur #scenes/poses c'est « Poses » qui s'allume, pas « Scènes ». */
function majActif(){
  const r = $('#toolRail');
  if (!r) return;
  const ici = ROUTE.vue ? `${ROUTE.screen}/${ROUTE.vue}` : ROUTE.screen;
  r.querySelectorAll('[data-go]').forEach(b =>
    b.classList.toggle('on', b.dataset.go === ici));
  // les reglages de GENERATION sont ceux de l'ecran Produire : ailleurs le
  // panneau est dans un ecran eteint, donc le bouton le dit au lieu de mentir
  const g = $('#railGear');
  if (g){
    const dispo = ROUTE.screen === 'creer';
    g.disabled = !dispo;
    g.title = dispo ? 'réglages de génération' : 'depuis Produire';
  }
}

on('screen:changed', d => { ROUTE = d; majActif(); });

/* --- chargement ------------------------------------------------------ */

export async function loadRail(){
  peindre();                                   // etat « chargement… »
  let r;
  // `api()` ne leve PAS sur un 500 : il rend {ok:false, erreur} (voir api.js).
  // D'ou les deux filets — le catch ne couvre que le reseau vraiment coupe.
  try { r = await api('/api/universe/tools'); }
  catch { OUTILS = {erreur: 'serveur injoignable'}; return peindre(); }
  const ko = erreurDe(r);
  OUTILS = ko ? {erreur: ko} : {tools: r.tools || []};
  peindre();
}
