/* Banque de scenes en memoire (/api/scenes) + drapeau « modifications non
   enregistrees ». Extrait de create.js en J3 etape 2.

   Verifier la FORME avant de s'en servir : sur une erreur, `api()` rend
   {ok:false, erreur} et le premier acces a `.data.scenes` levait, ce qui
   interrompait le rendu et laissait l'ecran vide sans un mot. */
import {api, erreurDe} from './api.js';
import {emit} from './bus.js';
import {signalerPanne} from './health.js';

let SC = null;              // {data, meta, previews, stats, poses}
let SC_DIRTY = false;       // scenes.json a des modifications non enregistrees

export const scenes = () => SC;
export const isDirty = () => SC_DIRTY;

export function setDirty(v){
  SC_DIRTY = !!v;
  emit('scenes:dirty');
}

export async function loadScenes(gardeEditeur){
  // proteger par "il y a des modifications non enregistrees" (SC_DIRTY), pas par
  // "l'onglet Scenes est actuellement affiche" : l'ecran reste dans le DOM
  // (juste masque) quand on change d'onglet, donc les valeurs de champ tapees
  // y survivent — le seul vrai risque est de reconstruire #sceneCards depuis
  // le serveur pendant qu'il y a des ajouts ou une application JSON en attente
  const enEdition = gardeEditeur && SC_DIRTY;
  const local = enEdition && SC ? SC.data : null;   // edition non enregistree
  let r;
  try { r = await api('/api/scenes'); }
  catch(e){ r = null; }
  const err = erreurDe(r) || (r.data && Array.isArray(r.data.scenes) ? null
                              : 'banque de scènes illisible');
  signalerPanne('banque de scènes', err);
  if (err){
    // garder la banque precedente si on en avait une : mieux vaut un ecran
    // peut-etre perime, qui le dit, qu'un ecran vide qui ne dit rien
    if (!SC) SC = {data: {scenes: []}, meta: {}, previews: {}, stats: {}};
    emit('scenes:loaded', {ok: false, full: false});
    return;
  }
  SC = r;
  if (local) SC.data = local;                       // on ne l'ecrase jamais
  emit('scenes:loaded', {ok: true, full: !enEdition});
}
