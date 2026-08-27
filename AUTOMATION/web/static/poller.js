/* Sonde d'etat : /api/state toutes les 1,5 s (l'intervalle est pose par
   main.js). Met a jour le header, le panneau d'execution, les compteurs, et
   declenche le rechargement des ecrans quand un batch se termine.
   Extrait de boot.js en J3 (bascule en modules ES) ; possede son propre etat
   d'execution depuis J3 etape 2. */
import {$} from './dom.js';
import {api} from './api.js';
import {renderRun, nbSelection, planOk, nsfwTick, estEdition} from './create.js';
import {loadItems, triageState} from './review.js';
import {loadScenes} from './scenes-store.js';

let RUNNING = false;        // dernier `running` connu de /api/state
let LASTBATCH = null;       // dernier batch_id deja pris en compte

export const isRunning = () => RUNNING;
// lancement optimiste : create.js pose l'etat avant meme le prochain tick(),
// sinon un refreshPlan() intermediaire reactiverait le bouton
export function markRunning(v){ RUNNING = !!v; }

export function refreshCounts(){ tick(); }

export async function tick(){
  let s; try { s = await api('/api/state'); } catch { return; }
  $('#dot').classList.toggle('on', s.comfy);
  $('#stTxt').textContent = s.comfy ? (s.running ? 'production en cours' : 'prêt')
                                    : 'ComfyUI hors ligne';
  // les compteurs du selecteur de bucket suivent l'espace actif de l'ecran
  // #trier ; les badges d'onglet Galerie/Revue, eux, restent toujours sur
  // l'espace SFW puisque c'est ce sur quoi ils atterrissent
  const bcounts = triageState().space === 'nsfw' ? s.nsfw_counts : s.counts;
  ['OK', 'A_REVOIR', 'REJET', 'SANS_VISAGE', 'ARCHIVE'].forEach(b => {
    const el = $('#b' + b); if (el) el.textContent = (bcounts && bcounts[b]) ?? 0; });
  $('#nTri').textContent = s.counts.A_REVOIR ?? 0;
  $('#nGal').textContent = s.counts.OK ?? 0;
  $('#btnUndo').disabled = !s.undo;
  renderRun(s);
  // memes criteres que refreshPlan() (create.js), plus planOk() qu'elle seule
  // calcule : les deux minuteurs ecrivaient #btnRun.disabled avec des criteres
  // differents et se marchaient dessus. planOk() est la source commune.
  // nbSelection() et pas la selection de scenes : au cran NSFW ce sont des
  // images sources qui sont cochees, pas des scenes.
  $('#btnRun').disabled = s.running || !s.comfy || !nbSelection() || !planOk();
  RUNNING = s.running;
  // suivi par batch_id, pas par une transition running -> stoppe observee sur
  // deux polls consecutifs : un job court (ex. une seule declinaison) peut
  // demarrer ET finir dans la meme fenetre de 1,5 s, invisible a la transition
  if (!s.running && s.batch_id && s.batch_id !== LASTBATCH){
    LASTBATCH = s.batch_id;
    loadScenes(true);
    if ($('#trier').classList.contains('on')) loadItems();
  }
}
