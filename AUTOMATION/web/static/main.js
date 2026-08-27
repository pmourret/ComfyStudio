/* Point d'entree unique (J3 etape 1). Remplace boot.js.

   Importe tous les modules — leurs gestionnaires d'evenements se posent au
   chargement — puis lance la sequence d'init dans l'ordre historique de
   index.html : bandes de score et taxonomie d'abord (elles conditionnent les
   deux ecrans), puis navigation, banque, sonde d'etat, grille NSFW. */
import {$} from './dom.js';
import './core.js';
import './advanced.js';
import './appli.js';
import './editor.js';
import {go} from './core.js';
import {loadCreative, loadScenes, nsfwTick, estEdition} from './create.js';
import {loadQc} from './review.js';
import {tick} from './poller.js';

// bandes de score et taxonomie d'abord : elles conditionnent les deux ecrans
Promise.all([loadQc(), loadCreative()]).then(() => {
  go(location.hash.slice(1) || 'creer', true);
  loadScenes(); tick(); nsfwTick();
});
setInterval(tick, 1500);
// la grille de sources ne se rafraichit que quand elle est a l'ecran : c'est le
// seul moment ou une image nouvellement validee doit y apparaitre
setInterval(() => { if (estEdition() && $('#creer').classList.contains('on')) nsfwTick(); },
            4000);
