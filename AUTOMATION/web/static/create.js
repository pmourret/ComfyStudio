/* Ecran Creer : curseur d'intensite, intention, ton, scenes, lancement.
   Bascule en modules ES le 27/08/2026 (J3). Depuis l'etape 2 : l'etat de
   l'ecran est encapsule ici, la taxonomie / la config / la banque de scenes
   sont deleguees a leurs modules, les reactions inter-modules passent par le
   bus. */
import {$, $$, esc, mmss} from './dom.js';
import {api, post, imgUrl} from './api.js';
import {VERDICT_LABEL, hashPourImage} from './constants.js';
import {on, emit} from './bus.js';
import {toast} from './toast.js';
import {confirmer} from './modal.js';
import {openLight} from './lightbox.js';
import {go} from './nav.js';
import {creative, palier, loadCreative} from './taxonomy.js';
import {qc, presetRef, nsfwRef} from './config.js';
import {scenes} from './scenes-store.js';
import {isRunning, markRunning} from './poller.js';
import {updateInspector} from './inspector.js';
import {brancher} from './hints.js';

/* --- etat de l'ecran Creer, prive au module --------------------------- */
let SEL = new Set();          // scenes selectionnees
let INTENT = null;            // intention choisie (bloc 1), '*' = toutes
let TONE = '';                // ton choisi (bloc 2)
let LEVEL = 0;                // niveau courant du curseur — jamais persiste
const CONFIRMED = new Set();  // paliers confirmes pour cette session
let PLAN_OK = false;          // le dernier /api/plan connu a des jobs a lancer
let NSRC = new Set();         // images sources cochees au cran NSFW
let NSRC_SIG = null;          // signature de la grille de sources rendue
let NARMED = false;           // l'outil d'edition est-il disponible ici
let NSFW_SEQ = 0;             // jeton anti-reponse-perimee (nsfwTick)

// lue par poller.js (tick) : seul planOk() est la source commune du
// #btnRun.disabled, pour que les deux minuteurs ne se marchent pas dessus
export const planOk = () => PLAN_OK;

/* --- reactions aux chargements (bus) -------------------------------- */
on('config:loaded', renderReglages);
on('creative:loaded', renderIntensity);
on('scenes:loaded', () => { renderIntentions(); renderTones(); renderScenes(); });

/* ================================================================= INTENSITE */
function renderIntensity(){
  const box = $('#intSel');
  box.innerHTML = (creative().intensity || []).map(p => `
    <button data-lv="${p.level}" class="${estPalierEdition(p) ? 'lvedit' : 'lv' + p.level}${
      p.level === LEVEL ? ' on' : ''}" title="${esc(p.prompt_add || 'aucun ajout de prompt')}">
      ${esc(p.label)}<span class="n">${p.scenes}</span>
    </button>`).join('');
  box.querySelectorAll('button').forEach(b =>
    b.onclick = () => setLevel(+b.dataset.lv));
  majHintCrans();
  const p = palier(LEVEL);
  // `unite` vient du serveur : le cran qui edite compte des IMAGES sources, pas
  // des scenes — il n'en choisit aucune. Annoncer « 16 scènes » y etait faux.
  const u = p?.unite || 'scène';
  const s = p && p.scenes > 1 ? 's' : '';
  $('#intHint').textContent = p
    ? (p.export ? 'exportable' : 'hors export') +
      ` · ${p.scenes} ${u}${s} ${u === 'image' ? 'éditable' : 'disponible'}${s}`
    : '';
  syncNiveauGuards();
}

/* Quelle infobulle porte chaque cran. Une SEULE fonction l'ecrit, appelee des
   deux endroits qui peuvent changer la reponse : renderIntensity() (le curseur
   vient d'etre repeint) et syncEtapes() (le panneau a bouge).

   Le cran qui edite est le seul dont le texte varie, et pour la meme raison que
   la pastille #intMode : « generer avant d'editer » lui fait ENGENDRER d'abord,
   donc « n'engendre rien » y serait faux. On ne se tait pas, on dit l'autre
   chose. Un cran dont le niveau n'a pas de cle — un pack a cinq paliers —
   n'aura pas de bulle plutot qu'une bulle approximative. */
function majHintCrans(){
  (creative().intensity || []).forEach(p => {
    const b = $(`#intSel button[data-lv="${p.level}"]`);
    if (!b) return;
    brancher(b, p.pipeline === 'flux+edit'
      ? (champ('generavant', false) ? 'int.lv3.avant' : 'int.lv3')
      : 'int.lv' + p.level);
  });
}

/* Le palier qui EDITE une image au lieu d'en engendrer une. Un seul endroit
   le reconnait, pour que la reponse soit la meme partout (curseur, blocs,
   pastille, garde-fous). Le serveur a son pendant, `palier_edition`. */
export const estPalierEdition = p => !!(p && p.pipeline === 'flux+edit');

/* Vrai quand le cran courant EDITE une image existante au lieu d'en engendrer
   une. C'est le comportement par defaut du cran NSFW, et la regle du projet : la
   branche edite une image deja validee, elle ne genere jamais de zero.
   `generer_avant` retablit l'enchainement generation -> edition pour le seul cas
   ou il sert — aucune image validee n'existe encore pour la scene voulue.
   Le serveur applique la meme regle dans mode_edition(). */
export const estEdition = () => {
  const p = palier(LEVEL);
  return !!(p && p.pipeline === 'flux+edit' && !champ('generavant', false));
};
/* Nombre d'elements coches, quel que soit le mode : des scenes en generation,
   des images sources en edition. Une seule source pour la barre de lancement et
   pour tick() — sans ca le bouton restait grise en edition, ou SEL est vide. */
export const nbSelection = () => estEdition() ? NSRC.size : SEL.size;

/* Le niveau NSFW (pipeline flux+edit) s'appuie sur le verdict du QC d'identite :
   en mode edition c'est lui qui donne son dossier a chaque sortie, en mode
   `generer_avant` c'est lui qui decide quelles images enchainer (chainage_nsfw).
   Sans qc(), tout verdict devient "OK". Meme chose pour les prereglages
   Rapide/Brut, qui coupent le refiner/grain que la branche NSFW herite du
   preset — desactiver plutot que laisser cliquer sur un controle sans effet
   (garde-fou double, voir guard_intensity cote serveur). */
function syncNiveauGuards(){
  const p = palier(LEVEL);
  const nsfw = !!(p && p.pipeline === 'flux+edit');
  // le panneau est rendu par renderReglages(), qui depend de /api/config :
  // renderIntensity() peut passer ici avant que les controles existent
  const noqc = $('#noqc');
  if (noqc){
    noqc.disabled = nsfw;
    noqc.title = nsfw ? 'indisponible au niveau NSFW — protège l\'enchaînement automatique' : '';
    if (nsfw) noqc.checked = false;
  }
  $$('#qual button').forEach(b => b.disabled = nsfw && b.dataset.q !== 'realisme');
  if (nsfw && $('#qual button.on')?.dataset.q !== 'realisme'){
    $$('#qual button').forEach(x => x.classList.remove('on'));
    $('#qual button[data-q="realisme"]').classList.add('on');
  }
  syncSections();
}

export async function setLevel(lv){
  const p = palier(lv);
  if (!p) return;
  if (p.requires === 'confirm' && !CONFIRMED.has(lv)){
    const ok = await confirmer({
      titre: `Passer en « ${p.label} » ?`,
      corps: `<p>Les images produites à ce niveau <b>ne partent pas dans
        l'export</b> : elles restent consultables, mais hors du dossier de
        publication.</p>
        <ul><li>destination : <code>${esc(p.destination || '—')}</code></li>
        <li>export désactivé pour ce palier</li></ul>`,
      bouton: `Passer en ${p.label}`});
    if (!ok) return;
    CONFIRMED.add(lv);
  }
  LEVEL = lv;
  if (scenes()){    // les scenes hors bande disparaissent : on elague la selection
    const dispo = new Set(visibleScenes().map(s => s.id));
    [...SEL].forEach(id => { if (!dispo.has(id)) SEL.delete(id); });
  }
  renderIntensity();
  if (scenes()){
    // une intention peut devenir vide, ou apparaitre, en changeant de niveau
    renderIntentions();
    if (INTENT && INTENT !== '*' && !scenesOf(INTENT).length) INTENT = null;
    renderTones(); renderScenes();
  }
  syncEtapes();
  if (estEdition()){ nsfwTick(); loadInstructions(); }
  refreshPlan();
}

/* Quels blocs sont a l'ecran, et comment ils sont numerotes.

   Un seul endroit. La visibilite des etapes etait repartie entre setLevel et
   renderTones, qui se contredisaient des qu'un troisieme mode est apparu — le
   cran NSFW montrait une grille de scenes qu'il n'allait pas utiliser. */
const numEtape = (id, n) => {
  const e = $('#' + id + ' .num');
  if (e) e.textContent = n;
};

function syncEtapes(){
  const p = palier(LEVEL);
  const editable = !!(p && p.pipeline === 'flux+edit');
  const edition = estEdition();
  $('#stepSource').hidden = !edition;
  $('#stepIntent').hidden = edition;
  $('#stepTone').hidden   = edition || !INTENT;
  $('#stepScenes').hidden = edition || !INTENT;
  // en generation, l'instruction n'a de sens qu'une fois l'intention choisie ;
  // en edition elle est la deuxieme et derniere decision
  $('#stepEdit').hidden = !editable || (!edition && !INTENT);
  if (edition){ numEtape('stepSource', 1); numEtape('stepEdit', 2); }
  else { numEtape('stepIntent', 1); numEtape('stepTone', 2);
         numEtape('stepScenes', 3); numEtape('stepEdit', 4); }
  majPastilleMode(edition);
  majHintCrans();
}

/* Pastille metier de la barre d'intensite (#intMode). Les crans nommaient une
   intensite, jamais le METIER derriere : au dernier cran, « Générer » ne genere
   pas — il reprend une image deja validee. Le curseur ne le disait nulle part.

   Elle vit dans syncEtapes() et suit `edition` — donc estEdition(), la meme
   source que les blocs — et non `pipeline === 'flux+edit'` : avec « générer
   avant d'éditer » coche, le cran qui edite ENGENDRE d'abord, et la pastille
   dirait le contraire de ce que le lancement fait. Aucune pastille en
   generation : le cas par defaut n'a rien a annoncer, et une pastille permanente
   redeviendrait du decor. */
function majPastilleMode(edition){
  const el = $('#intMode');
  el.hidden = !edition;
  el.textContent = edition
    ? 'Édition — n’engendre rien, reprend une image validée' : '';
}

/* ====================================================================== CREER
   Trois blocs, une decision chacun. Les blocs 2 et 3 n'existent pas tant que
   l'intention n'est pas choisie : c'est tout le principe du parcours lineaire.

   Le chargement de la banque vit dans scenes-store.js depuis J3 etape 2 ; ici
   on ne fait que reagir a `scenes:loaded` (voir en tete de fichier) pour
   repeindre intentions / tons / scenes. */

/* Une scene n'est disponible que si le niveau courant est dans sa bande.
   La bande vient du serveur (scenes().meta), qui applique les memes defauts de
   compatibilite que le runner — le front ne les reimplemente pas. */
/* Niveau auquel la PASSE DE GENERATION tourne. Au niveau 3 la chaine est en deux
   temps : on genere au `base_level` (Soft) puis on edite. Les scenes disponibles
   sont donc celles du niveau de base, pas du niveau affiche — sinon le choix se
   vide, aucune scene ne declarant la bande 3. Le serveur applique la meme regle
   dans niveau_generation(). */
const niveauScenes = () => {
  const p = palier(LEVEL);
  return p && p.base_level != null ? p.base_level : LEVEL;
};
const inBand = s => {
  const b = scenes().meta?.[s.id]?.band || [0, 1];
  const lv = niveauScenes();
  return b[0] <= lv && lv <= b[1];
};
const intentOf = s => scenes().meta?.[s.id]?.intention || s.category;
const scenesOf = key => scenes().data.scenes.filter(
  s => inBand(s) && (key === '*' || intentOf(s) === key));

/* --- bloc 1 : intention ---------------------------------------------------
   Les intentions SANS aucune scene ne restent pas grisees en tete de grille :
   elles descendent sous un separateur « a peupler », et le clic mene au
   composeur avec l'intention deja remplie. Constat du 26/08/2026 : `selfcare` et
   `herbier` etaient a zero scene a tous les crans — deux cartes mortes sur huit,
   a la toute premiere decision du parcours. */
function carteIntention(i, n){
  return `<button type="button" class="it${i.key === INTENT ? ' on' : ''}${n ? '' : ' vide'}"
    data-k="${esc(i.key)}"><span class="ic">${i.icon}</span><b>${esc(i.label)}</b>
    <span>${n ? n + ' scène' + (n > 1 ? 's' : '') : 'en composer une'}</span></button>`;
}

function renderIntentions(){
  if (!scenes() || !creative()) return;
  const items = [...(creative().intentions || [])
                   .filter(i => (i.min_intensity || 0) <= LEVEL),
                 {key: '*', label: 'Toutes', icon: '✳', defaults: {}}];
  const pleines = [], vides = [];
  items.forEach(i => (scenesOf(i.key).length ? pleines : vides)
                       .push([i, scenesOf(i.key).length]));
  $('#intentGrid').innerHTML = pleines.map(([i, n]) => carteIntention(i, n)).join('');
  $('#intentVideGrid').innerHTML = vides.map(([i, n]) => carteIntention(i, n)).join('');
  $('#intentVides').hidden = !vides.length;
  $('#intentGrid').querySelectorAll('.it').forEach(el =>
    el.onclick = () => setIntent(el.dataset.k));
  // une intention vide n'ouvre pas une grille vide : elle ouvre le composeur
  $('#intentVideGrid').querySelectorAll('.it').forEach(el =>
    el.onclick = () => composerPour(el.dataset.k));
}

/* Emmene au composeur avec l'intention deja choisie. Ce que faisait deja la
   carte « + creer une scene » en fin de grille — porte ici, la ou le manque se
   constate.

   Depuis F2.1 (30/08/2026) le composeur est replie derriere « Proposer » : on
   ne peut plus se contenter de pointer #intention, il faut d'abord OUVRIR le
   pli. C'est advanced.js qui possede cet etat, et on l'atteint par le bus —
   il importe deja renderScenes d'ici, l'importer en retour fermerait un cycle
   entre les deux fichiers. */
function composerPour(key){
  go('scenes');
  emit('bank:composer', {key});
}

function setIntent(key){
  if (INTENT === key) return;
  INTENT = key;
  SEL.clear();                       // changer d'intention repart d'une page vierge
  const def = (creative().intentions || []).find(i => i.key === key);
  TONE = def?.defaults?.tone || TONE || (creative().tones?.[0]?.key ?? '');
  renderIntentions(); renderTones(); renderScenes();
}

/* --- bloc 2 : ton --------------------------------------------------------- */
function renderTones(){
  syncEtapes();                      // la visibilite des blocs vit la-bas
  if (!INTENT) return;
  const t = (creative().tones || []).find(x => x.key === TONE);
  $('#toneHint').textContent = t ? '— ' + t.prompt_add : '';
  $('#toneRow').innerHTML = (creative().tones || []).map(x =>
    `<button type="button" class="chip-t${x.key === TONE ? ' on' : ''}" data-k="${x.key}">${x.label}</button>`
  ).join('');
  $('#toneRow').querySelectorAll('.chip-t').forEach(el => el.onclick = () => {
    TONE = el.dataset.k; renderTones(); renderScenes();
  });
}

/* --- bloc 3 : scenes ------------------------------------------------------ */
/* Le ton n'enleve aucune scene — il remonte celles qui lui vont bien. Filtrer
   dur menait a des culs-de-sac (lifestyle + elegant : zero scene). */
const visibleScenes = () => {
  if (!INTENT) return [];
  const affine = s => (scenes().meta?.[s.id]?.tones || []).includes(TONE) ? 0 : 1;
  return scenesOf(INTENT).slice()
    .sort((a, b) => affine(a) - affine(b) || a.id.localeCompare(b.id));
};

const scoreDot = v => v == null ? 'var(--dim2)'
  : v >= qc().high ? 'var(--ok)' : v >= qc().ok ? 'var(--warn)' : 'var(--bad)';

export function renderScenes(){
  if (!scenes()) return;
  const list = visibleScenes();
  $('#sceneHint').textContent = INTENT
    ? `${list.length} disponible${list.length > 1 ? 's' : ''} à ce niveau`
    : '';
  const g = $('#sceneGrid'); g.innerHTML = '';
  list.forEach(s => {
    const prev = scenes().previews[s.id], st = scenes().stats?.[s.id];
    const aff = (scenes().meta?.[s.id]?.tones || []).includes(TONE);
    const tags = (scenes().meta?.[s.id]?.tags || []).slice(0, 3).join(' · ');
    const pose = scenes().meta?.[s.id]?.pose;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'sc' + (SEL.has(s.id) ? ' on' : '');
    el.setAttribute('aria-pressed', SEL.has(s.id) ? 'true' : 'false');
    el.innerHTML = `
      <div class="ph ${prev ? '' : 'empty'}" ${prev ? `style="background-image:url('${imgUrl({...prev, thumb: 1})}')"` : ''}>
        ${aff ? '<div class="aff">ce ton</div>' : ''}
        ${pose ? `<div class="posebadge" title="pose imposée : ${esc(pose)}">⛓ pose</div>` : ''}
        ${scenes().meta?.[s.id] ? '' : '<div class="nonsauv">non enregistrée</div>'}
        <div class="tick">✓</div></div>
      <div class="info"><b>${s.id}</b>
        <span>${s.format || '4:5'} · ${s.count || 1} img${(s.variants||[]).length ? ' +' + s.variants.length + ' var.' : ''}</span>
        <div class="stat"><span class="dotm" style="background:${scoreDot(st?.avg ?? null)}"></span>
          ${st ? `${st.avg != null ? st.avg.toFixed(2) : '—'} · ${st.n} produite${st.n > 1 ? 's' : ''}`
               : '<span style="color:var(--dim2)">jamais produite</span>'}</div>
        ${tags ? `<div class="tags">${tags}</div>` : ''}</div>`;
    el.onclick = () => {
      SEL.has(s.id) ? SEL.delete(s.id) : SEL.add(s.id);
      // un amendement est ecrit POUR une scene : changer la selection le rend
      // caduc, et l'appliquer en silence a une autre scene serait pire que tout
      SCENE_OVERRIDE = '';
      const ta = $('#sceneOverride'); if (ta) ta.value = '';
      renderScenes();
    };
    g.append(el);
  });
  // creer une scene reste possible, mais ce n'est plus le point d'entree : c'est
  // une carte en fin de grille, qui emmene au composeur avec l'intention deja mise
  const neuf = document.createElement('button');
  neuf.type = 'button';
  neuf.className = 'sc';
  neuf.style.cssText = 'border-style:dashed;display:flex;align-items:center;' +
    'justify-content:center;min-height:150px;text-align:center';
  neuf.innerHTML = '<div class="info"><b style="font-size:20px">+</b>' +
                   '<span>créer une scène</span></div>';
  neuf.onclick = () => composerPour(INTENT);
  g.append(neuf);
  refreshPlan();
}

/* ============================================ CRAN NSFW — images sources
   L'ecran de l'ancien onglet « Branche NSFW », devenu le cran NSFW du curseur.
   Une seule grille, un seul champ d'instruction, un seul bouton de lancement. */
let NSFW_SRC = [];                 // [{name, bucket}] rendues par /api/nsfw/state

export async function nsfwTick(){
  // jeton anti-reponse-perimee : appelee depuis plusieurs sources independantes
  const seq = ++NSFW_SEQ;
  let d; try { d = await api('/api/nsfw/state'); } catch { return; }
  if (seq !== NSFW_SEQ) return;
  const dispo = !!(d.outil && d.outil.available);
  if (dispo !== NARMED){
    // Le geste d'armement vit sur l'ecran Application : un changement fait
    // la-bas doit faire apparaitre ou DISPARAITRE le cran ici. Le serveur
    // n'emet plus le palier quand l'outil n'est pas disponible, il suffit
    // donc de relire la taxonomie — et de quitter le cran s'il n'est plus la.
    await rebasculerSiCranPerdu();
    if (seq !== NSFW_SEQ) return;
  }
  NARMED = dispo;
  NSFW_SRC = d.sources || [];
  const sortie = $('#sortieNsfw');
  if (sortie && d.sortie) sortie.textContent = d.sortie;
  if (estEdition()) renderSources();
}

function renderSources(){
  const g = $('#srcGrid');
  if (!g) return;
  // elaguer la selection : une image retriee entre-temps n'est plus editable,
  // et le serveur la refuserait au lancement (sources_valides)
  const dispo = new Set(NSFW_SRC.map(s => s.name));
  let elague = false;
  [...NSRC].forEach(n => { if (!dispo.has(n)){ NSRC.delete(n); elague = true; } });
  const sig = NSFW_SRC.map(s => s.name).join('|');
  if (sig !== NSRC_SIG){
    NSRC_SIG = sig;
    g.innerHTML = NSFW_SRC.map(s => `
      <button type="button" class="src${NSRC.has(s.name) ? ' on' : ''}" data-n="${esc(s.name)}"
        aria-pressed="${NSRC.has(s.name)}">
        <img loading="lazy" src="${imgUrl({...s, thumb: 1})}">
        ${s.bucket === 'OK' ? '' : '<div class="aff">à revoir</div>'}
        <div class="tick">✓</div></button>`).join('')
      || '<div class="empty">aucune image à éditer — produis d’abord au cran Soft, '
       + 'puis reviens ici</div>';
  } else {
    // ne pas reconstruire pour un simple clic : les vignettes se rechargeraient
    g.querySelectorAll('.src').forEach(el => {
      const on = NSRC.has(el.dataset.n);
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on);
    });
  }
  $('#srcHint').textContent = NSFW_SRC.length
    ? `— ${NSRC.size} cochée${NSRC.size > 1 ? 's' : ''} sur ${NSFW_SRC.length} éditable${
        NSFW_SRC.length > 1 ? 's' : ''}`
    : '';
  if (elague) refreshPlan();
}

// delegation : les vignettes sont remplacees, pas les ecouteurs
$('#srcGrid').onclick = e => {
  const el = e.target.closest('.src');
  if (!el) return;
  const n = el.dataset.n;
  NSRC.has(n) ? NSRC.delete(n) : NSRC.add(n);
  el.classList.toggle('on');
  el.setAttribute('aria-pressed', el.classList.contains('on'));
  renderSources(); refreshPlan();
};

/* Le cran d'edition vient de disparaitre (desarmement fait ailleurs, ou pack
   sans graphe) : on ne reste pas sur un cran qui n'existe plus. Appele par
   nsfwTick quand /api/nsfw/state change d'avis. */
export async function rebasculerSiCranPerdu(){
  const avant = LEVEL;
  await loadCreative();
  if (palier(avant)) return;
  LEVEL = 0;
  NSRC.clear(); NSRC_SIG = null;
  if (scenes()){ renderIntentions(); renderTones(); renderScenes(); }
  renderIntensity(); syncEtapes(); refreshPlan();
}

/* ------------------------------- preambule visible et bibliotheque d'instructions
   Le preambule etait DECRIT par une phrase (« la pose et le decor sont deja
   proteges ») sans jamais etre montre : 5 des 16 instructions posterieures a la
   refonte du 24/08 reecrivaient quand meme `same pose`. On montre le texte.
   Et le journal porte deja instruction + score : 25 editions pour 15 instructions
   distinctes, la plus frequente retapee 6 fois. On la repropose. */
let INSTR_CHARGEES = false;

async function loadInstructions(){
  let d; try { d = await api('/api/nsfw/instructions'); } catch { return; }
  INSTR_CHARGEES = true;
  $('#preambule').textContent = d.preambule || '';
  const h = d.historique || [];
  $('#biblioN').textContent = h.length
    ? `— ${h.length}, la meilleure identité d’abord`
    : '— aucune pour l’instant';
  $('#biblioList').innerHTML = h.map(e => `
    <div class="bib" data-t="${esc(e.texte)}" title="${
        esc(e.alertes.join(' · ') || 'aucune alerte')}">
      <span class="sc" style="color:${scoreDot(e.identite)}">${
        e.identite != null ? e.identite.toFixed(3) : '—'}</span>
      <span class="tx">${esc(e.texte)}</span>
      ${e.alertes.length ? '<span class="warn">!</span>' : ''}
      <span class="n">${e.n}×</span></div>`).join('')
    || '<div class="empty">le journal d’édition est vide</div>';
};

$('#biblioList').onclick = e => {
  const el = e.target.closest('.bib');
  if (!el) return;
  $('#editInstr').value = el.dataset.t;
  $('#instrBiblio').open = false;
  refreshPlan();
};

/* ================================================ APERCU DU PROMPT ENVOYE
   Mesure du 26/08/2026 : sur `cuisine_matin`, le prompt final fait 578
   caracteres dont 179 ecrits par l'utilisateur — 31 %. Le reste (ancre, texture,
   tenue, ton, intention, palier) etait assemble sans jamais etre montre. Un
   resultat rate ne se diagnostiquait donc pas : impossible de savoir si c'est la
   scene, le ton, ou deux fragments qui se contredisent.

   Le panneau montre chaque fragment avec sa source et sa part, signale les mots
   qui reviennent d'un fragment a l'autre, et laisse amender la scene POUR CE
   LANCEMENT (sans toucher scenes.json). */
let APERCU_OUVERT = false, APERCU_BATI = false, APERCU_SIG = null;
let SCENE_OVERRIDE = '';

$('#btnApercu').onclick = e => {
  e.stopPropagation();
  APERCU_OUVERT = !APERCU_OUVERT;
  refreshPlan();
};

/* Squelette pose UNE fois. Le champ d'amendement n'est jamais recree : taper
   dedans change le prompt, donc l'apercu, donc la signature — le repeindre
   ferait sauter le curseur a chaque frappe. Seules les parties calculees
   (fragments, echos, en-tete) sont rafraichies. */
function batirApercu(){
  $('#apercuPanel').innerHTML = `
    <div class="ap">
      <div class="aph"><b>Prompt envoyé</b>
        <span class="tiny" id="apMeta"></span>
        <span class="spacer" style="flex:1"></span>
        <button class="link" id="apFermer">fermer</button></div>
      <div id="apFrags"></div>
      <div id="apEchos"></div>
      <div class="amd">
        <label class="f"><span id="apAmdLbl">amender la scène pour ce lancement —
          n'enregistre rien dans <code>scenes.json</code></span>
          <textarea id="sceneOverride" spellcheck="false"
            placeholder="laisser vide pour garder le texte de la scène"></textarea></label>
      </div>
    </div>`;
  $('#apFermer').onclick = () => { APERCU_OUVERT = false; renderApercu(null); };
  $('#sceneOverride').addEventListener('input', e => {
    SCENE_OVERRIDE = e.target.value; refreshPlan();
  });
  APERCU_BATI = true;
}

function renderApercu(a){
  const box = $('#apercuPanel');
  if (!box) return;
  $('#btnApercu').classList.toggle('on', APERCU_OUVERT);
  if (!APERCU_OUVERT || !a){ box.hidden = true; return; }
  if (!APERCU_BATI) batirApercu();
  box.hidden = false;
  const sig = JSON.stringify(a) + SEL.size;
  if (sig === APERCU_SIG) return;
  APERCU_SIG = sig;

  $('#apMeta').textContent = `${a.total_car} caractères · ${a.scene}` +
    (a.n_jobs > 1 ? ` · ${a.n_jobs} images, aperçu de la première` : '');
  $('#apFrags').innerHTML = a.fragments.map(f => `
    <div class="fr${f.source === 'scène' ? ' sc' : ''}">
      <span class="pc">${f.part}%</span>
      <span class="src">${esc(f.source)}</span>
      <span class="tx">${esc(f.texte)}</span>
    </div>`).join('');
  $('#apEchos').innerHTML = a.echos.length ? `
    <div class="ech"><b>mots partagés par plusieurs fragments</b>
      ${a.echos.map(e => `<span class="e">${esc(e.mot)}
        <i>${esc(e.sources.join(' · '))}</i></span>`).join('')}
      <p class="tiny">Une répétition n'est pas forcément une faute — mais deux
        fragments qui parlent du même sujet se disputent. C'est ce qui a fait
        cohabiter « close intimate framing » et « full figure in frame ».</p>
    </div>` : '';
  // l'amendement n'a de sens que sur UNE scene : avec plusieurs, « la » scene ne
  // designe rien. Le serveur applique la meme regle (scene_override).
  const uneSeule = SEL.size === 1 && !estEdition();
  $('#apercuPanel .amd').classList.toggle('inerte', !uneSeule);
  $('#sceneOverride').disabled = !uneSeule;
  $('#apAmdLbl').innerHTML = uneSeule
    ? 'amender la scène pour ce lancement — n’enregistre rien dans <code>scenes.json</code>'
    : 'amendement indisponible — il demande une seule scène sélectionnée';
}

/* Alertes de l'instruction. Calculees par le SERVEUR (nsfw_batch), pas ici : la
   CLI et l'ecran de revue doivent avoir le meme avertissement, et il n'y a
   qu'une definition du vocabulaire surveille. */
function renderAlertes(liste){
  const box = $('#instrAlertes');
  if (!box) return;
  box.innerHTML = (liste || []).map(a =>
    `<div class="alerte">${esc(a)}</div>`).join('');
}

/* ==================================================== REGLAGES DE GENERATION
   Panneau declaratif : libelle, explication, bornes et valeur de reference d'un
   reglage vivent au MEME endroit. Ajouter un reglage = ajouter une ligne ici.

   Regle : tout ce qui est expose pilote quelque chose de reel. Chaque `cle` est
   consommee soit par WorkflowRunner.api_for (guidance, steps, refiner,
   refiner_denoise, sharpen, et les groupes facedetailer / upscale_2k /
   grain_export), soit par appliquer_grain (grain_telephone), soit par
   appliquer_expression (expression, expression_budget), soit par nsfw_batch
   (dest 'nsfw'). Un controle qui ne pilote rien ferait croire a un reglage qui
   n'existe pas — c'est pire que pas de controle du tout.

   `ref` n'est PAS ecrit ici : il vient de config.json via /api/config. Les
   valeurs mesurees n'ont qu'une seule source de verite. */
const REGLAGES = [
 {titre:'Ce qu’on produit', items:[
   {id:'count', dest:'job', type:'nombre', min:1, max:12, vide:'défaut de la scène',
    label:'Images par scène',
    quoi:'Combien de photos tirer de chaque scène cochée. Chacune a sa propre graine, donc son cadrage et sa lumière à elle.'},
   {id:'format', dest:'job', type:'liste',
    options:[['', '— celui de la scène —'], ['4:5','4:5 — feed Instagram'],
             ['2:3','2:3 — portrait classique'], ['9:16','9:16 — story'], ['1:1','1:1 — carré']],
    label:'Format imposé',
    quoi:'Force le cadrage de tout le lot. Par défaut chaque scène garde le sien, qui a été choisi pour elle.'},
   {id:'limit', dest:'job', type:'nombre', min:1, max:200, vide:'aucune',
    label:'Plafond du lot',
    quoi:'Coupe le lot après ce nombre d’images. Pratique pour goûter une série avant de la lancer en entier.'},
   {id:'seed', dest:'job', type:'nombre', vide:'aléatoire',
    label:'Graine fixe',
    quoi:'Rejoue exactement la même image. Laisse vide pour du hasard. C’est la seule façon honnête de comparer deux réglages : même graine, même scène, une seule chose qui change.'},
   {id:'novar', dest:'job', type:'bool',
    label:'Ignorer les variantes',
    quoi:'Les scènes proposent des variantes de lumière ou de météo. Coché, on ne garde que la version principale.'},
 ]},

 {titre:'Fidélité et calcul', replie:true, items:[
   {id:'guidance', cle:'guidance', dest:'preset', type:'curseur', min:1, max:5, pas:0.1,
    label:'Liberté du modèle', bas:'il improvise', haut:'il obéit au texte',
    quoi:'À quel point le modèle s’accroche au texte de la scène.',
    cout:'Plus bas, le rendu est plus naturel mais la scène peut dériver. Plus haut, la scène est respectée mais la peau se lisse et l’image commence à se dénoncer comme générée. Au-delà de 3, ça se voit.'},
   {id:'steps', cle:'steps', dest:'preset', type:'curseur', min:8, max:36, pas:1,
    label:'Temps de calcul', bas:'rapide et grossier', haut:'fin et lent',
    quoi:'Nombre de passes du modèle sur l’image.',
    cout:'Le gain devient invisible au-delà d’une vingtaine de passes, alors que le temps, lui, continue de monter.'},
 ]},

 {titre:'Peau et détail', replie:true, items:[
   {id:'refiner', cle:'refiner', dest:'preset', type:'bool',
    label:'Repasse de texture',
    quoi:'Une seconde passe qui redonne du grain de peau. PuLID verrouille le visage mais le lisse au passage : c’est le principal remède au « rendu IA ».'},
   {id:'rdenoise', cle:'refiner_denoise', dest:'preset', type:'curseur', min:0.1, max:0.8, pas:0.05,
    label:'Ampleur de la repasse', bas:'retouche discrète', haut:'réécrit l’image',
    quoi:'Jusqu’où la repasse a le droit de modifier l’image.',
    cout:'Trop haut, elle ne retouche plus, elle réinvente — et le personnage bouge avec.',
    lieA:'refiner'},
   {id:'facedetailer', cle:'facedetailer', dest:'preset', type:'bool',
    label:'Reprise du visage',
    quoi:'Re-rend le visage en grand puis le recolle. C’est ce qui sauve les yeux et la bouche sur les plans larges, où le visage ne fait que quelques dizaines de pixels.'},
   {id:'upscale', cle:'upscale_2k', dest:'preset', type:'bool',
    label:'Passage en 2K',
    quoi:'Agrandit puis redescend en 2K. Mesuré : +31 % de netteté, 4 secondes de plus, et quasiment rien de perdu sur l’identité. Il y a peu de raisons de le couper.'},
   {id:'sharpen', cle:'sharpen', dest:'preset', type:'curseur', min:0, max:1, pas:0.05,
    label:'Accentuation', bas:'doux', haut:'piqué',
    quoi:'Dernier coup de netteté, tout en fin de chaîne.',
    cout:'Trop haut, les cheveux se hérissent et les contours se mettent à croustiller — un défaut très reconnaissable.'},
 ]},

 {titre:'Vie et matière', replie:true, items:[
   {id:'expression', cle:'expression', dest:'preset', type:'bool',
    label:'Expression du visage',
    quoi:'Fait jouer la mine selon le ton choisi, après le contrôle d’identité. Sans elle, Léna porte rigoureusement le même visage sur toutes ses photos.'},
   {id:'exprbudget', cle:'expression_budget', dest:'preset', type:'curseur', min:0, max:0.15, pas:0.01,
    label:'Marge d’identité accordée', bas:'visage très stable', haut:'plus de vie',
    quoi:'Ce qu’on accepte de perdre en ressemblance pour gagner en expression. Au-delà, l’expression est atténuée puis abandonnée.',
    cout:'Les photos réelles varient environ deux fois plus que la production actuelle. Monter ce curseur est le seul moyen de s’en rapprocher — et il se paie en ressemblance. C’est un arbitrage, pas un réglage optimal.',
    lieA:'expression'},
   {id:'graintel', cle:'grain_telephone', dest:'preset', type:'bool',
    label:'Grain de téléphone',
    quoi:'Ajoute le bruit d’un vrai capteur : de la luminance, pesée vers les ombres, presque rien dans les hautes lumières. C’est lui qui fait « photo prise sur l’instant » plutôt que « image de synthèse propre ».'},
   {id:'grainexp', cle:'grain_export', dest:'preset', type:'bool',
    label:'Mise à la taille de publication',
    quoi:'Redimensionne en fin de chaîne à la taille du réseau visé. Coupé, les images sortent à leur taille de génération.'},
   {id:'grainstr', cle:'grain_strength', dest:'preset', type:'curseur', min:0, max:0.05, pas:0.002,
    label:'Ancien grain du graphe', bas:'coupé', haut:'fort',
    quoi:'Laissé à zéro volontairement.',
    cout:'Mesuré structurellement faux : autant de bruit de couleur que de luminance, et à plat sur toute la plage tonale — ce qu’aucun capteur ne fait. Le grain de téléphone ci-dessus le remplace. Le remonter superpose deux grains et salit l’image sans la rendre plus réelle.'},
 ]},

 {titre:'Contrôle', items:[
   {id:'noqc', dest:'job', type:'bool',
    label:'Sans contrôle d’identité',
    quoi:'Produit sans mesurer ni trier : tout atterrit dans « à revoir ». Réservé aux essais de rendu, où seule l’image compte. Indisponible au niveau NSFW, qui s’appuie sur le verdict pour décider quoi éditer.'},
 ]},

 {titre:'Édition NSFW', niveau:'edit', items:[
   {id:'generavant', dest:'job', type:'bool',
    label:'Générer l’image avant de l’éditer',
    quoi:'Par défaut ce cran édite une image déjà validée — la branche n’engendre jamais de zéro, c’est la règle du projet. Coché, elle produit d’abord une image au cran Soft puis l’édite : utile seulement quand aucune image validée n’existe encore pour la scène voulue. Coûte une passe Flux complète (~55 s) de plus par image.'},
   {id:'nsfwsteps', cle:'steps', dest:'nsfw', type:'curseur', min:4, max:20, pas:1,
    label:'Passes d’édition', bas:'rapide', haut:'lent',
    quoi:'Le modèle d’édition est un modèle rapide, conçu pour 4 à 8 passes.',
    cout:'Le monter ne l’améliore pas, ça ne fait que rallonger le temps.'},
   {id:'nsfwcfg', cle:'cfg', dest:'nsfw', type:'curseur', min:1, max:4, pas:0.1,
    label:'Adhérence à l’instruction', bas:'souple', haut:'littéral',
    quoi:'Imposé à 1.0 par le modèle rapide.',
    cout:'Le monter dégrade au lieu d’aider : ce modèle est distillé, il n’attend pas de guidage.'},
   {id:'nsfwpix', cle:'max_pixels', dest:'nsfw', type:'curseur', min:600000, max:2100000, pas:50000,
    label:'Surface de travail', bas:'petit et net', haut:'grand et mou', fmt:'mp',
    quoi:'Taille à laquelle l’édition travaille avant d’être remontée à la taille d’origine.',
    cout:'Contre-intuitif et mesuré : au-delà d’environ 1,15 MP la zone éditée ressort molle. À graine fixe, 1,14 MP donne presque deux fois la netteté de 2,06 MP, pour la même identité et un quart de temps en moins.'},
   {id:'nsfwface', cle:'face_denoise', dest:'nsfw', type:'curseur', min:0.1, max:0.7, pas:0.05,
    label:'Re-rendu du visage', bas:'retouche', haut:'reconstruction',
    quoi:'À quel point le visage est refait après l’édition.',
    cout:'Plus haut qu’en SFW, et c’est voulu : ici on reconstruit un visage que l’édition a abîmé, on ne se contente pas de le retoucher.'},
 ]},
];

const RG = {};                    // id -> descripteur, pour lecture rapide
REGLAGES.forEach(s => s.items.forEach(i => RG[i.id] = i));

/* Valeur de reference d'un reglage : celle de config.json, jamais une constante
   ecrite dans le front. Un reglage sans reference (champs de lot) rend ''. */
function refDe(it){
  if (it.dest === 'preset') return presetRef()[it.cle];
  if (it.dest === 'nsfw')   return nsfwRef()[it.cle] ?? presetRef()[it.cle];
  return '';
}

const fmtVal = (it, v) =>
  it.fmt === 'mp' ? (v / 1e6).toFixed(2).replace('.', ',') + ' MP'
  : it.pas && it.pas < 1 ? (+v).toFixed(String(it.pas).split('.')[1].length)
  : String(v);

export function renderReglages(){
  const box = $('#gearBody');
  if (!box) return;
  box.innerHTML = REGLAGES.map(sec => {
    const items = sec.items.map(it => {
      const ref = refDe(it);
      if (it.type === 'bool')
        return `<div class="rg b" data-id="${it.id}">
          <label class="check"><input type="checkbox" id="${it.id}"> <b>${it.label}</b></label>
          <p class="rgq">${it.quoi}</p></div>`;
      if (it.type === 'liste')
        return `<div class="rg" data-id="${it.id}">
          <div class="rgh"><b>${it.label}</b></div>
          <select id="${it.id}">${it.options.map(
            ([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
          <p class="rgq">${it.quoi}</p></div>`;
      if (it.type === 'nombre')
        return `<div class="rg" data-id="${it.id}">
          <div class="rgh"><b>${it.label}</b></div>
          <input type="number" id="${it.id}"${it.min != null ? ` min="${it.min}"` : ''}${
            it.max != null ? ` max="${it.max}"` : ''} placeholder="${it.vide || ''}">
          <p class="rgq">${it.quoi}</p></div>`;
      // curseur
      return `<div class="rg" data-id="${it.id}">
        <div class="rgh"><b>${it.label}</b>
          <span class="spacer" style="flex:1"></span>
          <span class="rgv" id="v_${it.id}"></span>
          <span class="mes" id="m_${it.id}" title="valeur mesurée du projet : ${
            ref === '' ? '—' : fmtVal(it, ref)}">mesuré</span></div>
        <input type="range" id="${it.id}" min="${it.min}" max="${it.max}" step="${it.pas}">
        <div class="rge"><span>${it.bas}</span><span>${it.haut}</span></div>
        <p class="rgq">${it.quoi}${it.cout ? ` <span class="cout">${it.cout}</span>` : ''}</p></div>`;
    }).join('');
    /* Les sections de RENDU se replient. Elles portent 13 des 23 reglages, et
       le prereglage « Réalisme » les remet toutes aux valeurs mesurees : les
       laisser depliees en permanence donnait un panneau de 23 controles pour
       trois decisions reelles. Rien n'est supprime, et le compteur d'ecarts en
       tete du panneau continue de signaler ce qui s'ecarte du mesure — donc on
       sait qu'il faut ouvrir sans avoir a chercher. */
    if (!sec.replie)
      return `<section class="rgs" data-niveau="${sec.niveau || ''}">
        <h4>${sec.titre}</h4>${items}</section>`;
    return `<section class="rgs pli" data-niveau="${sec.niveau || ''}">
      <details><summary><h4>${sec.titre}</h4>
        <span class="ecart" data-sec="${esc(sec.titre)}"></span></summary>
        ${items}</details></section>`;
  }).join('');
  appliquerValeurs(presetRef(), nsfwRef());
  syncSections();
}

/* Ecrit un jeu de valeurs dans les controles. Sert au chargement, au bouton
   « valeurs mesurees » et aux prereglages de la barre de lancement. */
export function appliquerValeurs(preset, nsfw){
  REGLAGES.forEach(s => s.items.forEach(it => {
    const el = $('#' + it.id);
    if (!el) return;
    let v;
    if (it.dest === 'preset') v = preset?.[it.cle];
    else if (it.dest === 'nsfw') v = nsfw?.[it.cle] ?? preset?.[it.cle];
    else return;                                  // champs de lot : intacts
    if (v === undefined) return;
    if (it.type === 'bool') el.checked = !!v; else el.value = v;
  }));
  majAffichage();
}

/* Pastille « mesuré » allumee quand la valeur est celle de config.json, et
   compteur d'ecarts en tete de panneau. C'est tout l'interet : on voit d'un
   coup d'oeil de combien on s'est eloigne des valeurs validees. */
export function majAffichage(){
  let ecarts = 0;
  const parSection = {};        // titre -> nb d'ecarts, pour les sections repliees
  REGLAGES.forEach(s => s.items.forEach(it => {
    const el = $('#' + it.id);
    if (!el) return;
    const ref = refDe(it);
    const val = it.type === 'bool' ? el.checked : el.value;
    if (it.type === 'curseur'){
      const lbl = $('#v_' + it.id);
      if (lbl) lbl.textContent = fmtVal(it, el.value);
    }
    const chip = $('#m_' + it.id);
    if (ref !== '' && ref !== undefined){
      const meme = it.type === 'bool' ? (!!ref === !!val)
                                      : Math.abs(+ref - +val) < 1e-9;
      if (chip) chip.classList.toggle('off', !meme);
      const bloc = el.closest('.rg');
      if (bloc) bloc.classList.toggle('modif', !meme);
      if (!meme){ ecarts++; parSection[s.titre] = (parSection[s.titre] || 0) + 1; }
    }
    // un reglage dependant d'un interrupteur coupe n'a plus d'effet : le dire
    if (it.lieA){
      const maitre = $('#' + it.lieA);
      const bloc = el.closest('.rg');
      if (maitre && bloc) bloc.classList.toggle('inerte', !maitre.checked);
    }
  }));
  const d = $('#gearDiff');
  if (d) d.textContent = ecarts ? `${ecarts} réglage${ecarts > 1 ? 's' : ''} hors valeur mesurée` : '';
  const g = $('#btnGear');
  if (g) g.classList.toggle('modif', ecarts > 0);
  // une section repliee doit dire qu'elle cache un ecart, sinon replier revient
  // a masquer l'information que le compteur global sert justement a donner
  $$('#gearBody .ecart').forEach(el => {
    const n = parSection[el.dataset.sec] || 0;
    el.textContent = n ? `${n} hors mesuré` : '';
    el.classList.toggle('on', n > 0);
  });
}

/* La section NSFW n'a de sens qu'au niveau qui edite. */
function syncSections(){
  const p = palier(LEVEL);
  const edit = !!(p && p.pipeline === 'flux+edit');
  $$('#gearBody .rgs').forEach(s => {
    if (s.dataset.niveau === 'edit') s.hidden = !edit;
  });
}

/* Prereglages de la barre de lancement. Ils ne court-circuitent plus le
   panneau : ils le REMPLISSENT. Avant, choisir « Rapide » jetait silencieusement
   les reglages fins ; maintenant on voit exactement ce que le prereglage change,
   et on peut le retoucher juste apres. */
const PRESETS = {
  realisme: () => ({}),                                   // les valeurs mesurees
  rapide:   () => ({refiner: false}),
  // guidance 3.0 et non 3.5 : l'explication du panneau dit « au-delà de 3, ça
  // se voit », et un préréglage qui contredit le texte affiché juste à côté ne
  // s'explique pas. Monter la guidance n'accélère rien de toute façon — c'est
  // le nombre de passes qui coûte — elle ne sert ici qu'à tenir la scène.
  brut:     () => ({refiner: false, facedetailer: false, grain_export: false,
                    guidance: 3.0}),
};

export function appliquerPreset(q){
  appliquerValeurs({...presetRef(), ...(PRESETS[q] || PRESETS.realisme)()}, nsfwRef());
}

/* Un seul ecouteur pour tout le panneau : les controles sont rendus en JS et
   peuvent etre reconstruits, donc on ecoute le conteneur, pas les champs.
   syncEtapes() en fait partie : « generer avant d'editer » vit dans le panneau
   et change les blocs affiches a l'ecran. */
function panneauChange(){
  majAffichage(); syncEtapes();
  if (estEdition()){
    if (!INSTR_CHARGEES) loadInstructions();
    renderSources();
  }
  refreshPlan();
}
$('#gearPanel').addEventListener('input', panneauChange);
$('#gearPanel').addEventListener('change', panneauChange);
$('#btnReset').onclick = () => {
  appliquerValeurs(presetRef(), nsfwRef());
  $$('#qual button').forEach(x => x.classList.toggle('on', x.dataset.q === 'realisme'));
  refreshPlan();
};

/* Ce que le panneau envoie au serveur. Les controles sont la source de verite :
   il n'y a plus de jeu de valeurs reconstruit ailleurs. */
export function valeursDe(dest){
  const out = {};
  REGLAGES.forEach(s => s.items.forEach(it => {
    if (it.dest !== dest) return;
    const el = $('#' + it.id);
    if (!el) return;
    out[it.cle] = it.type === 'bool' ? el.checked : parseFloat(el.value);
  }));
  return out;
}

/* Lecture tolerante : le panneau peut ne pas encore etre peint au tout premier
   refreshPlan() declenche par renderScenes(). */
const champ = (id, def) => {
  const e = $('#' + id);
  if (!e) return def;
  return e.type === 'checkbox' ? e.checked : e.value;
};

function payload(){
  return {
    scenes:[...SEL], categories:[],
    count: champ('count', ''), format: champ('format', ''),
    limit: champ('limit', ''), seed: champ('seed', ''),
    no_variants: champ('novar', false), no_qc: champ('noqc', false),
    preset: valeursDe('preset'), nsfw: valeursDe('nsfw'),
    intensity: LEVEL, confirm_intensity: CONFIRMED.has(LEVEL),
    tone: TONE, intention: INTENT === '*' ? null : INTENT,
    edit_instruction: champ('editInstr', ''),
    // cran NSFW : les images a editer, et le mode. Le serveur retranche ce qui
    // n'est plus editable (sources_valides) — la liste peut avoir vieilli.
    sources: [...NSRC], generer_avant: champ('generavant', false),
    // amendement de scene pour CE lancement : le serveur ne le retient que si
    // une seule scene est cochee, et le passe au meme controle de visage
    scene_override: SCENE_OVERRIDE
  };
}

let planTimer;
function refreshPlan(){
  clearTimeout(planTimer);
  planTimer = setTimeout(async () => {
    // Mode edition : pas de scene, pas d'intention — des images et une phrase.
    // Le plan sert quand meme, parce que c'est lui qui rend les alertes de
    // l'instruction : il tourne donc meme quand rien n'est encore coche.
    if (estEdition()){
      const p = await post('/api/plan', payload());
      renderAlertes(p.alertes);
      renderApercu(null);        // au cran NSFW il n'y a pas de prompt de scene
      const instr = String(champ('editInstr', '')).trim();
      PLAN_OK = p.total > 0 && !!instr;
      $('#sumN').textContent = p.total
        ? p.total + (p.total > 1 ? ' images' : ' image') : '—';
      $('#sumT').textContent = !NSRC.size ? 'coche au moins une image source'
        : !instr ? 'écris l’instruction d’édition'
        : `${p.total} édition${p.total > 1 ? 's' : ''} · environ ${mmss(p.total * 82)}`;
      $('#btnRun').textContent = PLAN_OK
        ? `Éditer ${p.total} image${p.total > 1 ? 's' : ''}` : 'Éditer';
      $('#btnRun').disabled = !PLAN_OK || isRunning() || !$('#dot').classList.contains('on');
      return;
    }
    $('#btnRun').textContent = 'Générer';
    // en `generer_avant` l'instruction sert quand meme : ses alertes aussi.
    // Les sorties courtes ci-dessous partent sans appeler le plan, donc sans
    // alerte a montrer — on les vide plutot que de laisser une alerte perimee.
    renderAlertes([]);
    if (!INTENT || !SEL.size){
      $('#sumN').textContent = '—';
      $('#sumT').textContent = !INTENT ? 'choisis une intention'
                                       : 'sélectionne au moins une scène';
      renderApercu(null);
      PLAN_OK = false; $('#btnRun').disabled = true; return; }
    // Une scene ajoutee mais pas encore enregistree existe dans SC.data (donc
    // dans la grille) mais PAS dans scenes.json, que lit /api/plan. Sans ce
    // message, le plan revenait a zero et le bouton restait grise sans un mot.
    const inconnues = [...SEL].filter(id => !scenes().meta?.[id]);
    if (inconnues.length){
      $('#sumN').textContent = '—';
      $('#sumT').textContent = inconnues.join(', ') +
        (inconnues.length > 1 ? ' ne sont pas enregistrées' : ' n’est pas enregistrée') +
        ' — onglet Scènes, bouton Enregistrer';
      renderApercu(null);
      PLAN_OK = false; $('#btnRun').disabled = true; return; }
    const p = await post('/api/plan', payload());
    renderAlertes(p.alertes);
    // Garder le dernier apercu valide quand le plan echoue : un amendement
    // refuse (par ex. il decrit le visage) faisait disparaitre le panneau — donc
    // le champ ou on venait d'ecrire, au moment precis ou il faut le relire.
    // L'erreur est portee par #sumT, pas par l'escamotage du panneau.
    if (p.apercu) renderApercu(p.apercu);
    if (p.erreur){ $('#sumN').textContent = '—'; $('#sumT').textContent = p.erreur;
      PLAN_OK = false; $('#btnRun').disabled = true; return; }
    const q = $('#qual button.on').dataset.q;
    const unit = q === 'realisme' ? (scenes().avg_duration || 55) : q === 'rapide' ? 32 : 22;
    const niv = palier(LEVEL);
    $('#sumN').textContent = p.total + (p.total > 1 ? ' images' : ' image');
    const ton = (creative()?.tones || []).find(x => x.key === TONE);
    $('#sumT').textContent = `${SEL.size} scène${SEL.size>1?'s':''} · ` +
      `${niv ? niv.label : ''}${ton ? ' · ' + ton.label : ''} · ` +
      `environ ${mmss(p.total*unit)}`;
    // PLAN_OK est la seule source lue par tick() (boot.js) : les deux minuteurs
    // qui se disputent #btnRun.disabled s'accordent ainsi sur la validite du
    // plan, au lieu que l'un re-active un bouton que l'autre venait de couper
    PLAN_OK = p.total > 0;
    $('#btnRun').disabled = p.total === 0 || isRunning() || !$('#dot').classList.contains('on');
  }, 220);
}
$$('#qual button').forEach(b => b.onclick = () => {
  if (b.disabled) return;
  $$('#qual button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  // le prereglage ecrit dans les controles : on VOIT ce qu'il change, et on
  // peut le retoucher juste apres. Avant, il jetait les reglages fins en
  // silence — un panneau qu'on remplissait pour rien.
  appliquerPreset(b.dataset.q);
  refreshPlan();
});
// l'instruction d'edition conditionne le lancement au niveau 3 : le plan doit
// se rafraichir a la frappe, pas seulement en quittant le champ
$('#editInstr').addEventListener('input', refreshPlan);

/* Exporte : le rail d'outils ouvre le MEME panneau que l'engrenage de la barre
   de lancement. Deux boutons, un seul etat — pas une seconde surface de
   reglages, qui pourrait diverger de celle-ci. */
export function toggleGear(){ $('#gearPanel').classList.toggle('on'); }

$('#btnGear').onclick = e => { e.stopPropagation(); toggleGear(); };
$('#btnRun').onclick = async () => {
  $('#btnRun').disabled = true;
  // optimiste : sans ca, RUNNING reste faux jusqu'au prochain tick() (1,5 s),
  // et un refreshPlan() declenche entre-temps par un changement de champ peut
  // reactiver le bouton avant que le serveur ait confirme le lancement
  markRunning(true);
  const r = await post('/api/run', payload());
  if (!r.ok){
    markRunning(false);
    toast(r.erreur || 'échec du lancement');
    refreshPlan();
  }
};

/* --------------------------------------------------------- panneau execution
   La carte d'un lot TERMINE est un compte rendu : ce qui a tourne, ce que ca a
   donne, et le journal technique dessous. Elle restait jusqu'au lot suivant,
   sans moyen de la refermer une fois lue — sur un ecran de travail elle
   occupait le haut de Produire pour ne plus rien apprendre.

   On la ferme A LA MAIN, et le renvoi se retient PAR BATCH : le lot suivant
   ramene la carte. Fermer n'est donc pas « ne plus jamais montrer », c'est
   « celui-la, je l'ai lu ». Un lot EN COURS n'a pas de croix : il a deja son
   bouton d'arret, et une carte de production qu'on peut faire disparaitre
   pendant qu'elle tourne cacherait le seul endroit qui dit ou elle en est. */
let RUN_SIG = null;
let RUN_FERME = null;         // batch_id de la carte que l'utilisateur a fermee
export function renderRun(s){
  const p = $('#runPanel');
  // l'inspecteur AVANT le retour anticipe : il lit le meme /api/state, mais il
  // doit vivre aussi quand rien ne tourne — c'est justement l'ecran a froid
  // qu'il repare. #runPanel garde la bande de vignettes et l'arret ; la grande
  // image, elle, n'est peinte qu'une fois, a droite (voir inspector.js).
  updateInspector(s);
  if (!s.running && !s.total){ p.style.display = 'none'; RUN_SIG = null; return; }
  // lot termine et deja lu : on n'y revient pas tant qu'un autre n'a pas tourne
  if (!s.running && s.batch_id && s.batch_id === RUN_FERME){
    p.style.display = 'none'; RUN_SIG = null; return;
  }
  p.style.display = '';
  // ne rien reconstruire tant que rien n'a bouge : sinon le bloc "journal
  // technique" se replierait tout seul a chaque tick
  const sig = [s.running, s.index, s.total, s.edition, (s.recent || []).length,
               (s.log || []).length, JSON.stringify(s.stats)].join('|');
  if (sig === RUN_SIG) return;
  RUN_SIG = sig;
  const wasOpen = !!p.querySelector('details[open]');
  // Fin d'un lot d'EDITION : le geste suivant du flux NSFW est la retouche, et
  // elle vit dans l'editeur photo, joignable depuis la Revue (ADR-0003 : le
  // NSFW recompose deux outils globaux, il n'en ajoute aucun). On nomme le
  // chemin plutot que d'ouvrir une route qui sauterait par-dessus la Revue.
  const finiEnEdition = !s.running && !!s.edition && !!s.total;
  // La derniere sortie du lot, pour NOMMER la destination du renvoi : le lot
  // d'edition range ses images selon leur verdict (OK ou A_REVOIR), donc tantot
  // en Galerie tantot en Revue. On lit le bucket plutot que de le supposer —
  // supposer OK envoyait sur un dossier ou l'image n'etait pas.
  const derniere = (s.recent || [])[(s.recent || []).length - 1] || null;
  const ouRetoucher = derniere && derniere.bucket === 'OK' ? 'Galerie' : 'Revue';
  // pendant la generation, l'image en cours n'est pas encore acquise
  const doneN = Math.max(0, s.index - (s.running ? 1 : 0));
  const pct = s.total ? Math.round(100 * doneN / s.total) : 0;
  // `space` : au niveau 3 la bande montre aussi la sortie NSFW, qui vit dans
  // PROD/<CID>/_NSFW. Sans lui, /img cherche du cote SFW et rend un 404.
  const strip = (s.recent || []).slice().reverse().map(r =>
    `<img class="${r.bucket}" src="${imgUrl({...r, thumb: 1})}" data-full="${imgUrl(r)}"
      title="${esc(r.scene)}${r.score ? ' · ' + r.score.toFixed(3) : ''}">`).join('');
  p.innerHTML = `<div class="run">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <b>${s.running ? 'Production en cours' : 'Batch terminé'}</b>
        <span class="muted">${s.running
          ? `image ${s.index}/${s.total}${s.current ? ' · ' + esc(s.current) : ''}${s.eta ? ' · reste ~' + mmss(s.eta) : ''}`
          : Object.entries(s.stats || {}).filter(([,v]) => v)
              .map(([k,v]) => `${v} ${VERDICT_LABEL[k] || k.toLowerCase()}`).join(' · ')}</span>
        <div class="spacer" style="flex:1"></div>
        ${s.running ? '<button class="btn sm" id="btnStop">Arrêter</button>'
                    : '<button class="btn sm" id="btnGoTri">Trier les résultats</button>'}
        ${s.running ? '' : `<button class="run-x" id="btnRunFermer"
          aria-label="Fermer le compte rendu">✕</button>`}
      </div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="strip">${strip}</div>
      ${finiEnEdition ? `<p class="tiny" style="margin:8px 0 0">
        Retouche : <b>${ouRetoucher}, espace NSFW</b> → l'image → <b>Éditer</b>.
        <button class="link" id="btnGoNsfw">ouvrir ${derniere
          ? 'cette image' : 'la ' + ouRetoucher} en NSFW</button></p>` : ''}
      <details class="adv" style="margin-top:6px;border:0;padding:0" ${wasOpen ? 'open' : ''}>
        <summary>journal technique</summary>
        <pre class="log">${esc((s.log || []).slice(-40).join('\n'))}</pre>
      </details>
    </div>`;
  const stop = $('#btnStop'); if (stop) stop.onclick = async () => {
    stop.disabled = true;
    const r = await post('/api/stop');
    if (!r.ok){ stop.disabled = false; toast(r.erreur || 'arrêt impossible'); }
  };
  const gt = $('#btnGoTri'); if (gt) gt.onclick = () => go('trier');
  const fx = $('#btnRunFermer'); if (fx) fx.onclick = () => {
    RUN_FERME = s.batch_id;
    p.style.display = 'none';
    RUN_SIG = null;
  };
  /* Le seul geste de l'application qui entre en espace NSFW par la navigation :
     il SAIT de quel espace sort le lot (J7 — jamais un onglet du chrome). Il
     nomme aussi le fichier (#galerie/<nom>), pour ouvrir sur l'image qu'on
     vient de produire plutot que sur un dossier ou la retrouver.
     Poser l'entree de tri AVANT `go` ne suffisait pas : la route la repose en
     arrivant, et l'espace demande etait perdu — il passe donc par `go`, qui le
     tient de l'appelant. */
  const gn = $('#btnGoNsfw'); if (gn) gn.onclick = () => {
    if (derniere) return go(hashPourImage(derniere), false, {space: 'nsfw'});
    go(ouRetoucher === 'Galerie' ? 'galerie' : 'trier', false, {space: 'nsfw'});
  };
  p.querySelectorAll('.strip img').forEach(im => im.onclick = () => openLight(im.dataset.full));
}

