/* Sonde d'etat : /api/state toutes les 1,5 s (l'intervalle est pose par
   main.js). Met a jour le header, le panneau d'execution, les compteurs, et
   declenche le rechargement des ecrans quand un batch se termine.
   Extrait de boot.js en J3 (bascule en modules ES) — logique inchangee. */
import {$} from './dom.js';
import {api} from './api.js';
import {S} from './store.js';
import {renderRun, nbSelection, loadScenes, nsfwTick, estEdition} from './create.js';
import {loadItems} from './review.js';

export function refreshCounts(){ tick(); }

export async function tick(){
  let s; try { s = await api('/api/state'); } catch { return; }
  $('#dot').classList.toggle('on', s.comfy);
  $('#stTxt').textContent = s.comfy ? (s.running ? 'production en cours' : 'prêt')
                                    : 'ComfyUI hors ligne';
  // les compteurs du selecteur de bucket suivent l'espace actif de l'ecran
  // #trier (SPACE) ; les badges d'onglet Galerie/Revue, eux, restent toujours
  // sur l'espace SFW puisque c'est ce sur quoi ils atterrissent
  const bcounts = S.SPACE === 'nsfw' ? s.nsfw_counts : s.counts;
  ['OK', 'A_REVOIR', 'REJET', 'SANS_VISAGE', 'ARCHIVE'].forEach(b => {
    const el = $('#b' + b); if (el) el.textContent = (bcounts && bcounts[b]) ?? 0; });
  $('#nTri').textContent = s.counts.A_REVOIR ?? 0;
  $('#nGal').textContent = s.counts.OK ?? 0;
  $('#btnUndo').disabled = !s.undo;
  renderRun(s);
  // memes criteres que refreshPlan() (create.js), plus PLAN_OK qu'elle seule
  // calcule : les deux minuteurs ecrivaient #btnRun.disabled avec des criteres
  // differents et se marchaient dessus (l'un reactivait ce que l'autre avait
  // correctement desactive). PLAN_OK est la source commune.
  // nbSelection() et pas SEL.size : au cran NSFW ce sont des images sources qui
  // sont cochees (NSRC), pas des scenes — SEL y est vide par construction.
  $('#btnRun').disabled = s.running || !s.comfy || !nbSelection() || !S.PLAN_OK;
  S.RUNNING = s.running;
  // suivi par batch_id, pas par une transition running -> stoppe observee sur
  // deux polls consecutifs : un job court (ex. une seule declinaison) peut
  // demarrer ET finir dans la meme fenetre de 1,5 s, invisible a la transition
  if (!s.running && s.batch_id && s.batch_id !== S.LASTBATCH){
    S.LASTBATCH = s.batch_id;
    loadScenes(true);
    if ($('#trier').classList.contains('on')) loadItems();
  }
}
