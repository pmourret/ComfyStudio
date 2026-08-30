/* Navigation entre ecrans et onglets du chrome. Extrait de core.js en J3
   etape 2.

   "galerie" et "trier" partagent l'ecran #trier, mais sont deux DESTINATIONS du
   chrome depuis le 30/08/2026 (F1.1) : chacune son onglet, son bucket d'entree
   et son `metier` (ROUTES, constants.js). Revue juge la file A_REVOIR ; Galerie
   consulte les validees, sans geste de tri.

   Une route `nomme` accepte un suffixe `/<nomfichier>` — `#galerie/x.png`,
   `#trier/x.png` — resolu par routeFor() : la destination est la meme, avec une
   image visee en plus. Ce module ne construit jamais un hash a la main : la
   forme vit dans constants.js (hashPourImage). */
import {$, $$} from './dom.js';
import {routeFor} from './constants.js';
import {emit, on} from './bus.js';
import {loadItems, syncTriageUi, setTriageEntry, setTriageFocus} from './review.js';
import {loadJournal, setBankView} from './advanced.js';
import {majEtatComfy} from './appli.js';
import {majContenuAdulte} from './nsfw-arm.js';
import {estEdition, nsfwTick} from './create.js';
import {loadRegistre} from './registre.js';
import {loadWizard} from './wizard.js';
import {closeIdMenu} from './character.js';
import {inspectorEnter} from './inspector.js';

$$('.tabs button').forEach(b => b.onclick = () => go(b.dataset.s));

/* `opts.space` : le SEUL moyen d'entrer en espace NSFW par la navigation, et il
   n'est jamais passe par un onglet du chrome — seulement par un geste qui NOMME
   l'espace (le renvoi de fin de lot d'edition, J7). Sans lui, toute destination
   de tri retombe en SFW. */
export function go(name, skipHash, opts){
  let route = routeFor(name);
  let screen = route ? route.screen : name;
  // getElementById et PAS querySelector('#'+screen) : le hash est libre, et
  // depuis « scenes/poses » un nom peut contenir un slash — `#scenes/poses`
  // n'est pas un selecteur CSS valide, querySelector leverait avant d'atteindre
  // le repli. Ici un nom inconnu retombe sur Creer, quelle que soit sa forme.
  if (!document.getElementById(screen)){ name = 'creer'; route = null; screen = 'creer'; }
  closeIdMenu();
  // cliquer un onglet du chrome pendant une retouche photo quitte le mode
  // editeur proprement — sinon le marqueur body.editing resterait colle
  document.body.classList.remove('editing');
  // les onglets Galerie/Revue retombent toujours sur l'espace SFW : ouvrir sur
  // du NSFW sans l'avoir choisi explicitement serait surprenant (ecran partage,
  // capture...) — la bascule NSFW dans l'ecran reste a un clic
  // `bucket` et pas `route` : depuis « scenes/poses », une route peut exister
  // sans etre une entree de tri — la remettre a undefined viderait la file
  if (route && route.bucket){
    setTriageEntry(route.bucket, opts && opts.space, route.metier);
    setTriageFocus(route.focus || null);   // #trier/<nom> : l'image a viser
    syncTriageUi();
  }
  // #galerie et #trier allument DEUX onglets differents sur le meme ecran ;
  // #scenes/poses allume Banque. Tout cela se lit dans ROUTES, plus ici.
  const tabName = (route && route.tab) || name;
  $$('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.s === tabName));
  // #journal est un sous-ecran d'Application : il n'a pas d'onglet propre, on
  // garde l'onglet Application allume pour ne pas laisser le chrome sans repere.
  // `data-s="appli"` reste le contrat — seul le libelle a change (29/08/2026).
  // #wizard n'en a pas non plus (action transitoire du menu identité), assume.
  if (name === 'journal') $('.tabs button[data-s="appli"]').classList.add('on');
  $$('.screen').forEach(x => x.classList.toggle('on', x.id === screen));
  // onglet partageable / bouton retour. On RETIENT ce qu'on ecrit : le
  // navigateur repond a cette ligne par un `hashchange`, qui rappelait go()
  // une seconde fois — sans les options de l'appelant. Une navigation qui
  // demandait l'espace NSFW (fin de lot d'edition) le perdait donc aussitot,
  // ecrasee par sa propre relecture d'URL, et tout clic d'onglet peignait son
  // ecran deux fois.
  if (!skipHash){ HASH_ECRIT = name; location.hash = name; }
  // la banque ouvre toujours sur la sous-vue que la route nomme — donc « scenes »
  // par defaut : arriver par l'onglet Banque ne doit pas rendre la vue laissee
  // au passage precedent, qui ne serait ecrite nulle part dans l'URL
  if (screen === 'scenes') setBankView((route && route.vue) || 'scenes');
  if (route && route.bucket) loadItems();
  if (name === 'registre') loadRegistre();
  if (name === 'wizard') loadWizard();
  if (name === 'journal') loadJournal();
  if (name === 'appli'){ majEtatComfy(); majContenuAdulte(); }
  // l'inspecteur charge sa fiche et son repli banque au premier passage
  // seulement : les ticks suivants lui viennent de renderRun, sans appel en plus
  if (name === 'creer') inspectorEnter();
  // revenir sur Creer au cran NSFW : la grille de sources a pu vieillir
  if (name === 'creer' && estEdition())
    nsfwTick();
  // le rail marque son entree active depuis ici plutot que d'etre appele : nav
  // n'a pas a connaitre ses abonnes, et rail.js peut importer `go` sans que les
  // deux modules s'importent l'un l'autre
  emit('screen:changed', {name, screen, vue: (route && route.vue) || null});
}

/* Le hash qu'on vient d'ecrire soi-meme, en attente de son `hashchange`. Sert a
   ne PAS rejouer la navigation qu'on est en train de faire ; une vraie
   navigation par l'URL (lien colle, bouton retour, saisie a la main) ne
   correspond jamais a cette valeur et passe. */
let HASH_ECRIT = null;
window.addEventListener('hashchange', () => {
  const nom = location.hash.slice(1) || 'creer';
  const propre = nom === HASH_ECRIT;
  HASH_ECRIT = null;
  if (!propre) go(nom, true);
});

/* Naviguer sans importer ce module. L'inspecteur de Creer est deja importe ICI
   (inspectorEnter) : lui faire importer `go` en retour fermerait un cycle entre
   les deux fichiers. Il emet, on route. */
on('nav:go', d => go(d && d.name, false, d && d.opts));

/* Le menu identité (#idMenu) est cable par character.js — il possede la zone.
   Ici : fermeture au clic hors du bloc, et a Echap (overlay du chrome). */
document.addEventListener('click', e => {
  if (!e.target.closest('.idwrap')) closeIdMenu();
  // `closest` sur les DEUX declencheurs : le rail a son propre bouton ⚙, et il
  // porte du texte — un test sur `e.target.id` raterait le clic tombe sur le
  // libelle, et ce handler refermerait le panneau que le bouton vient d'ouvrir
  if (!e.target.closest('#gearPanel, #btnGear, #railGear'))
    $('#gearPanel').classList.remove('on');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeIdMenu(); });
