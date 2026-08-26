/* Divers et demarrage. Charge en DERNIER : il appelle tout le reste.
   Extrait de index.html le 24/08/2026 — code inchange.
   Ordre de chargement significatif : voir index.html. */
/* ==================================================================== DIVERS */
function openLight(src){ $('#lightbox img').src = src; $('#lightbox').style.display = 'flex'; }
$('#lightbox').onclick = () => $('#lightbox').style.display = 'none';

function refreshCounts(){ tick(); }
async function tick(){
  let s; try { s = await api('/api/state'); } catch { return; }
  $('#dot').classList.toggle('on', s.comfy);
  $('#stTxt').textContent = s.comfy ? (s.running ? 'production en cours' : 'prêt')
                                    : 'ComfyUI hors ligne';
  // les compteurs du selecteur de bucket suivent l'espace actif de l'ecran
  // #trier (SPACE) ; les badges d'onglet Galerie/Revue, eux, restent toujours
  // sur l'espace SFW puisque c'est ce sur quoi ils atterrissent
  const bcounts = SPACE === 'nsfw' ? s.nsfw_counts : s.counts;
  ['OK','A_REVOIR','REJET','SANS_VISAGE','ARCHIVE'].forEach(b => {
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
  $('#btnRun').disabled = s.running || !s.comfy || !nbSelection() || !PLAN_OK;
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

$('#btnRecharger').onclick = () => location.reload();

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
