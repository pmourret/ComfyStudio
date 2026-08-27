/* Valeurs lues dans config.json, une seule source (J3 etape 2, ex-loadQc de
   review.js). Les bandes de lecture du score et les valeurs de reference des
   reglages ne sont jamais ecrites en dur dans le front : le tri disque et
   l'affichage doivent parler du meme seuil. */
import {api} from './api.js';
import {emit} from './bus.js';

// bandes de lecture du score
let QC = {ok: 0.72, watch: 0.60, high: 0.75};
// valeurs de reference des reglages de generation ; le panneau les affiche
// comme « mesure » et le bouton de remise a zero y revient
let PRESET_REF = {}, NSFW_REF = {};

export const qc = () => QC;
export const presetRef = () => PRESET_REF;
export const nsfwRef = () => NSFW_REF;

export async function loadConfig(){
  try {
    const c = await api('/api/config');
    if (c && c.qc) QC = {ok: +c.qc.threshold_ok, watch: +c.qc.threshold_watch,
                         high: +(c.qc.threshold_high ?? (+c.qc.threshold_ok + 0.03))};
    if (c && c.preset) PRESET_REF = c.preset;
    if (c && c.nsfw)   NSFW_REF   = c.nsfw;
  } catch(e){ /* on garde les valeurs par defaut */ }
  // les abonnes repeignent : panneau de reglages (create.js), libelles du
  // filtre de score (review.js)
  emit('config:loaded');
}
