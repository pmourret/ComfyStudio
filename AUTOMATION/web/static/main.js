/* Point d'entree unique (J3). Remplace boot.js.

   Importe les modules a effet de bord (leurs gestionnaires d'evenements et
   leurs abonnements au bus se posent au chargement) puis lance la sequence
   d'init dans l'ordre historique de index.html : config et taxonomie d'abord
   (elles conditionnent les deux ecrans), puis navigation, banque, sonde
   d'etat, grille NSFW. */
import {$} from './dom.js';
import './lightbox.js';
import './health.js';
import './nav.js';
import './advanced.js';
import './appli.js';
import './editor.js';
import {reflectCharacter, characterIsExplicit} from './character.js';
import {go} from './nav.js';
import {loadConfig} from './config.js';
import {loadCreative} from './taxonomy.js';
import {loadScenes} from './scenes-store.js';
import {nsfwTick, estEdition} from './create.js';
import {tick} from './poller.js';

// personnage courant reflete dans l'en-tete avant tout le reste : un
// rechargement en ?character=<x> doit se voir, pas seulement passer dans /api/*
reflectCharacter();
// sas d'entree : sans ?character=, le chrome ne revendique aucun personnage —
// `body.no-character` masque les onglets studio, le menu de perso et la barre
// d'intensité (CSS). Un rechargement en ?character=<id> les fait apparaitre.
document.body.classList.toggle('no-character', !characterIsExplicit());

// config (bandes de score, valeurs mesurees) et taxonomie d'abord : elles
// conditionnent les deux ecrans ; leurs `*:loaded` declenchent les repeints
Promise.all([loadConfig(), loadCreative()]).then(() => {
  // sas d'entree (J7bis) : sans ?character= explicite dans l'URL, on ouvre le
  // registre, pas la production d'un personnage par defaut. Un lien
  // ?character=<id> (ou #hash) reste honore.
  go(characterIsExplicit() ? (location.hash.slice(1) || 'creer') : 'registre', true);
  loadScenes(); tick(); nsfwTick();
});
setInterval(tick, 1500);
// la grille de sources ne se rafraichit que quand elle est a l'ecran : c'est le
// seul moment ou une image nouvellement validee doit y apparaitre
setInterval(() => { if (estEdition() && $('#creer').classList.contains('on')) nsfwTick(); },
            4000);
