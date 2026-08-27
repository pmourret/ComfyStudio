/* Taxonomie creative du personnage : intentions, tons, echelle d'intensite
   (/api/creative). Extrait de create.js en J3 etape 2.

   Une taxonomie, c'est une echelle d'intensite : sans elle il n'y a pas de
   curseur, donc pas d'ecran Creer du tout. On ne fait pas semblant — on le dit
   via signalerPanne, et on retombe sur une taxonomie vide. */
import {api, erreurDe} from './api.js';
import {emit} from './bus.js';
import {signalerPanne} from './health.js';

const CREATIVE_VIDE = {intentions: [], tones: [], intensity: []};
let CREATIVE = null;

export const creative = () => CREATIVE;

// un palier de l'echelle d'intensite, par niveau
export const palier = lv => (CREATIVE?.intensity || []).find(p => p.level === lv);

export async function loadCreative(){
  let r;
  try { r = await api('/api/creative'); }
  catch(e){ r = null; }
  const err = erreurDe(r) || (Array.isArray(r.intensity) ? null
                              : 'taxonomie illisible (pas d’échelle d’intensité)');
  signalerPanne('taxonomie', err);
  CREATIVE = err ? CREATIVE_VIDE : r;
  // les abonnes repeignent : curseur d'intensite (create.js), selecteur
  // d'intention du composeur (advanced.js)
  emit('creative:loaded');
}
