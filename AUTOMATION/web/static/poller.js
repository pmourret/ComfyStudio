/* Sonde d'etat : /api/state toutes les 1,5 s (l'intervalle est pose par
   main.js). Met a jour le header, le panneau d'execution, les compteurs, et
   declenche le rechargement des ecrans quand un batch se termine.
   Extrait de boot.js en J3 (bascule en modules ES) ; possede son propre etat
   d'execution depuis J3 etape 2. */
import {$, mmss} from './dom.js';
import {api, erreurDe} from './api.js';
import {signalerPanne} from './health.js';
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
  // /api/state peut revenir malforme (5xx a corps HTML -> api() rend {ok:false}) :
  // sans garde, `s.counts.X` plus bas leve a chaque tick, en console seulement
  const err = erreurDe(s) || (s.counts && typeof s.counts === 'object'
                              ? null : 'réponse illisible du serveur');
  signalerPanne('sonde', err);
  if (err){
    $('#dot').classList.remove('on');
    $('#stTxt').textContent = 'état indisponible';
    return;
  }
  // derniere erreur de batch : visible sur tous les ecrans via le bandeau
  // #panneBar, pas seulement dans le journal de l'ecran Creer (J7bis).
  signalerPanne('production', s.last_error
    ? `dernière production : ${s.last_error.msg} (${s.last_error.at})` : null);
  $('#dot').classList.toggle('on', s.comfy);
  // le compteur de file suit la production meme quand on a quitte l'ecran Creer
  const running = s.running
    ? `production ${s.index}/${s.total}` + (s.eta ? ` · ~${mmss(s.eta)}` : '')
    : 'prêt';
  $('#stTxt').textContent = s.comfy ? running : 'ComfyUI hors ligne';
  // les compteurs du selecteur de bucket suivent l'espace actif de l'ecran
  // #trier ; la pastille d'onglet, elle, reste toujours sur l'espace SFW
  // puisque c'est ce sur quoi les onglets atterrissent
  const bcounts = triageState().space === 'nsfw' ? s.nsfw_counts : s.counts;
  ['OK', 'A_REVOIR', 'REJET', 'SANS_VISAGE', 'ARCHIVE'].forEach(b => {
    const el = $('#b' + b); if (el) el.textContent = (bcounts && bcounts[b]) ?? 0; });
  // `data-zero` : replie, le compteur devient une pastille sur l'icone, et une
  // pastille qui annonce zero est du bruit. Le CSS ne sait pas lire un nombre,
  // on le lui dit ici. Deplie, le compteur garde son « 0 » comme avant.
  const nTri = $('#nTri');
  const aRevoir = s.counts.A_REVOIR ?? 0;
  nTri.textContent = aRevoir;
  nTri.dataset.zero = aRevoir ? '0' : '1';
  // Galerie a son onglet depuis le 30/08/2026 (F1.1) mais PAS de pastille :
  // un compteur annonce du travail en attente, et une image validee n'en
  // attend aucun. Le nombre de validees se lit dans la Galerie elle-meme.
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
