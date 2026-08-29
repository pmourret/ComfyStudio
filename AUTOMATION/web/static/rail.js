/* Rail d'outils de l'atelier (29/08/2026).

   CE QUE LE RAIL N'EST PAS : une seconde navigation. Les cinq onglets du header
   restent le chrome, et aucune de leurs destinations n'est recopiee ici —
   Personnages, Produire, Revue, Application n'y figurent pas.

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
import {basculerRailPli, appliquerRailPli} from './studio.js';

/* Les surfaces que le studio sait ouvrir aujourd'hui. `aller` : une route de
   nav.js. `inerte` : la raison, affichee en infobulle (hints.js, via
   `data-hint-text` : elle vient des donnees, pas de la table de cles) —
   l'outil existe, il n'a simplement pas de point d'entree propre depuis le
   rail. */
const SURFACES = {
  'bank-poses':      {aller: 'scenes/poses', icone: 'pose'},
  'bank-scenes':     {aller: 'scenes',       icone: 'scenes'},
  'review-lightbox': {inerte: 'depuis une image de la Revue', icone: 'image'},
};
const INCONNUE = 'pas encore de surface dans le studio';

/* ICONES — attachees a la SURFACE, jamais au libelle de l'outil (J8).

   Le libelle vient du tools.json d'un pack : c'est du texte libre, qu'on ne
   connait pas d'avance. La surface, elle, est le vocabulaire que le rail sait
   deja interpreter — c'est donc elle qui porte l'icone, dans la meme table de
   donnees, pour la meme raison (CLAUDE.md §8.7 : jamais un test sur le
   personnage ou le pack).

   Une surface sans icone declaree, ou inconnue, prend `defaut` : un rail
   replie ne doit jamais montrer un bouton VIDE. Meme grille et memes attributs
   que les icones de la navbar (20x20, trait 1.5, currentColor), pour que les
   deux colonnes se lisent comme un seul chrome. */
const ICONES = {
  pose:   '<circle cx="10" cy="4.5" r="2"/><path d="M10 6.5v6M10 12.5l-3 4.5M10 12.5l3 4.5M5.5 8.5L10 7.5l4.5 1"/>',
  scenes: '<rect x="2.5" y="4.5" width="15" height="11" rx="1.5"/><path d="M2.5 12l4-3.5 3.5 3 3-2.5 4.5 4"/><circle cx="7" cy="8" r="1"/>',
  image:  '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 13l4-4 3 3 2.5-2 4.5 4.5"/>',
  gear:   '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"/>',
  defaut: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="1.6"/>',
};

const icone = nom => `<svg class="rail-ic" viewBox="0 0 20 20" aria-hidden="true"
  focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" stroke-linejoin="round">${ICONES[nom] || ICONES.defaut}</svg>`;

/* Raccourcis d'atelier — ils ne viennent d'aucun pack, ils sont la structure du
   studio. Un raccourci dont un OUTIL couvre deja la destination est retire : la
   pose est declaree dans les deux tools.json, elle n'apparait donc qu'une fois. */
const RACCOURCIS = [
  {label: 'Scènes', aller: 'scenes',       icone: 'scenes'},
  {label: 'Poses',  aller: 'scenes/poses', icone: 'pose'},
];

let OUTILS = null;        // null tant que /api/universe/tools n'a pas repondu
let ROUTE = {screen: 'creer', vue: null};

/* --- construction ---------------------------------------------------- */

/* Le libelle est dans un <span> a part, pas en texte nu : replie, il est retire
   VISUELLEMENT (clip-path) et reste le nom accessible du bouton — meme
   traitement que `.nav-lab` dans la navbar, meme raison. */
const ligne = (label, aller, inerte, ic) => `
  <button class="rail-it" ${aller ? `data-go="${esc(aller)}"` : 'disabled'}
          ${inerte ? `data-hint-text="${esc(inerte)}"` : ''}>${icone(ic)}<span
          class="rail-lab-it">${esc(label)}</span></button>`;

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
    return {label: o.label || o.id, aller: s.aller, ic: s.icone,
            inerte: s.aller ? '' : s.inerte};
  });
  // dedoublonnage par destination : un raccourci que le pack couvre deja
  const pris = new Set(rendus.map(x => x.aller).filter(Boolean));
  const courts = RACCOURCIS.filter(x => !pris.has(x.aller));

  r.innerHTML = `
    <div class="rail-grp">
      <div class="rail-lab">Outils</div>
      ${rendus.length ? rendus.map(x => ligne(x.label, x.aller, x.inerte, x.ic)).join('')
                      : '<p class="rail-msg">aucun outil déclaré pour ce pack</p>'}
    </div>
    ${courts.length ? `<div class="rail-grp">
      <div class="rail-lab">Atelier</div>
      ${courts.map(x => ligne(x.label, x.aller, '', x.icone)).join('')}
    </div>` : ''}
    <div class="rail-foot">
      <button class="rail-it" id="railGear">${icone('gear')}<span
        class="rail-lab-it">Réglages de génération</span></button>
      <button class="rail-it rail-pli" id="btnRailPli" aria-expanded="true">
        <svg class="rail-ic rail-chev" viewBox="0 0 20 20" aria-hidden="true"
          focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"
          stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l-5 5 5 5"/></svg>
        <span class="rail-lab-it" id="railPliLab">Réduire</span></button>
    </div>`;

  r.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  // stopPropagation comme #btnGear : sans lui le handler de fermeture globale de
  // nav.js, qui suit dans la phase de bulle, refermerait le panneau aussitot
  $('#railGear').onclick = e => { e.stopPropagation(); toggleGear(); };
  // le rail est REPEINT a chaque chargement d'outils : le bouton de repli est
  // recree, donc rebranche ici, et l'etat retenu reapplique
  $('#btnRailPli').onclick = basculerRailPli;
  appliquerRailPli();
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
