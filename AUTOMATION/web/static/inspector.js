/* Inspecteur de l'ecran Creer (29/08/2026) — colonne de droite, collante.

   Ce qu'il repare : l'ecran Creer ne montrait un resultat que PENDANT un batch
   (la bande de #runPanel). Revenir dessus a froid ne disait pas ce que le
   personnage avait deja produit — on partait regler une intensite sans avoir
   sous les yeux la derniere image qu'elle avait donnee.

   Trois sources, dans cet ordre, du plus petit diff au plus couteux :
     1. STATE.recent de /api/state — deja recu a chaque tick par renderRun(),
        aucun appel en plus. Retenu SEULEMENT si STATE.character est le
        personnage de l'URL : `character` y est celui du BATCH en cours, pas
        celui qu'on regarde.
     2. dernier item SFW du bucket OK via /api/gallery — lu une fois, au
        passage sur #creer, quand aucun batch n'est montrable.
     3. /api/character pour le chrome de la fiche (style, monde, pack) — une
        fois aussi.

   Isolation disque (29/08/2026) : les octets ne passent QUE par imgUrl(), et
   les deux routes lues sont deja bornees au personnage. Sans le test sur
   STATE.character, l'inspecteur d'Abyssiaelle afficherait la derniere image
   d'un batch de Lena lance depuis un autre onglet — exactement la panne que
   l'isolation vient de fermer ailleurs. */
import {$, esc} from './dom.js';
import {api, imgUrl, erreurDe} from './api.js';
import {currentCharacter} from './character.js';
import {openLight} from './lightbox.js';
import {emit} from './bus.js';
import {VERDICT_LABEL, hashPourImage} from './constants.js';

let META = null;            // /api/character : nom, style, monde, pack
let FALLBACK = null;        // dernier OK de la banque, si aucun batch a montrer
let FALLBACK_DONE = false;  // la banque n'est lue qu'une fois (rejouable si KO)
let FROM_STATE = null;      // derniere entree retenue de STATE.recent
let SIG = null;             // signature du dernier peint : le tick est a 1,5 s
let FULL = null;            // URL pleine taille de l'image montree (loupe)
let MONTREE = null;         // l'item peint, pour le renvoi « voir cette image »

/* --- entrees du module ------------------------------------------------ */

/* Appelee par renderRun() a chaque tick : meme reponse /api/state, zero appel
   supplementaire. Placee AVANT le retour anticipe de renderRun (panneau masque
   quand rien ne tourne) — sinon l'inspecteur ne vivrait que pendant un batch,
   ce qui est precisement le defaut qu'il corrige. */
export function updateInspector(s){
  FROM_STATE = pickFromState(s);
  render();
}

/* Montage / passage sur #creer (nav.js). Les deux chargements sont idempotents. */
export function inspectorEnter(){
  loadMeta();
  loadFallback();
  render();
}

function pickFromState(s){
  if (!s || s.character !== currentCharacter()) return null;
  const recent = Array.isArray(s.recent) ? s.recent : [];
  return recent.length ? recent[recent.length - 1] : null;
}

/* --- chargements ------------------------------------------------------ */

function loadMeta(){
  if (META) return;
  api('/api/character').then(d => {
    if (erreurDe(d)) return;      // la fiche se tait plutot que d'inventer un pack
    META = d;
    render();
  }).catch(() => {});
}

function loadFallback(){
  if (FALLBACK_DONE) return;
  FALLBACK_DONE = true;
  // /api/gallery est deja borne au personnage et rend ses items du plus recent
  // au plus ancien : le premier suffit, on ne retrie pas une seconde fois
  api('/api/gallery?bucket=OK&space=sfw').then(r => {
    if (erreurDe(r)){ FALLBACK_DONE = false; return; }   // rejouable au prochain passage
    const items = Array.isArray(r.items) ? r.items : [];
    FALLBACK = items[0] || null;
    render();
  }).catch(() => { FALLBACK_DONE = false; });
}

/* --- peinture ---------------------------------------------------------

   #insRole ne bouge jamais : c'est du texte fixe, et son affichage est une
   REGLE CSS accrochee a `.ins-shot.vide` (screens.css). Rien a tenir a jour
   ici, donc rien qui puisse se desynchroniser d'un etat que setShot() decide
   en asynchrone (onload / onerror). */

function ensureShell(){
  const box = $('#inspector');
  if (!box || box.dataset.ready) return box;
  box.dataset.ready = '1';
  // Deux calques d'image : le fondu croise a besoin que la sortante reste a
  // l'ecran pendant que l'entrante monte. Le shell n'est bati QU'UNE FOIS —
  // le reconstruire a chaque tick reinitialiserait la transition.
  box.innerHTML = `<h2>Dernière image <span class="tiny" id="insSrc"></span></h2>
    <p class="tiny ins-role" id="insRole">Dernière sortie de ce personnage —
      pas l'aperçu du prochain run.</p>
    <div class="ins-shot vide" id="insShot">
      <img class="ins-layer prev" alt="" aria-hidden="true">
      <img class="ins-layer cur" id="insImg" alt="">
      <p class="ins-void" id="insVoid"></p>
    </div>
    <dl class="meta ins-meta" id="insMeta"></dl>
    <p class="tiny ins-voir" id="insVoirLigne" hidden>
      <button class="link" id="insVoir">voir cette image</button></p>`;
  $('#insImg').onclick = () => { if (FULL) openLight(FULL); };
  /* La loupe montre les octets ; ce lien mene a l'ECRAN ou l'image se travaille,
     et c'est son bucket qui decide lequel — une validee en Galerie, tout le
     reste en Revue (hashPourImage). On emet plutot que d'importer nav.js : ce
     module est deja importe PAR nav.js (inspectorEnter), l'importer en retour
     fermerait un cycle. */
  $('#insVoir').onclick = () => {
    if (MONTREE) emit('nav:go', {name: hashPourImage(MONTREE)});
  };
  return box;
}

function render(){
  const box = ensureShell();
  if (!box) return;
  const item = FROM_STATE || FALLBACK;
  const src = FROM_STATE ? 'dernier batch' : (item ? 'banque · validées' : '');
  const sig = JSON.stringify([item && item.name, item && item.space,
                              item && item.bucket, item && item.scene,
                              item && item.format, item && item.score, src,
                              META && META.name, META && META.output_style]);
  if (sig === SIG) return;
  SIG = sig;
  MONTREE = item;
  $('#insSrc').textContent = src;
  // pas d'image montree = rien a aller voir : le lien part, il ne se grise pas
  $('#insVoirLigne').hidden = !item;
  setShot(item);
  $('#insMeta').innerHTML = metaRows(item)
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
}

function setShot(item){
  const shot = $('#insShot');
  const cur = $('#insImg'), prev = shot.querySelector('.prev');
  FULL = item ? imgUrl(item) : null;
  if (!item){
    vider(shot, cur, prev,
          'rien encore pour ' + ((META && META.name) || currentCharacter()));
    return;
  }
  // thumb : 420x560, largement au-dessus de la colonne (340 px) et deja en
  // cache si la bande de #runPanel l'a demandee. Le plein format ne part que
  // pour la loupe.
  const src = imgUrl({...item, thumb: 1});
  if (cur.getAttribute('src') === src) return;
  if (cur.getAttribute('src')) prev.src = cur.getAttribute('src');
  cur.style.opacity = '0';
  cur.alt = item.scene ? `dernière image — ${item.scene}` : 'dernière image';
  // la sortante reste a l'opacite 1 SOUS l'entrante : les deux calques se
  // recouvrent exactement, on ne voit jamais le fond au travers du fondu
  cur.onload = () => { shot.classList.remove('vide'); cur.style.opacity = '1'; };
  // L'echec est dit, jamais avale — mais SANS en nommer la cause : un onerror
  // d'<img> ne distingue pas un 404 (fichier trie ou supprime entre deux ticks)
  // d'un 500 (vignette impossible a fabriquer, Pillow absent de l'interpreteur
  // qui sert). Annoncer « supprimee » sur un 500 enverrait chercher au mauvais
  // endroit ; le journal technique de #runPanel porte le detail.
  cur.onerror = () => vider(shot, cur, prev, 'image indisponible pour le moment');
  cur.src = src;
}

function vider(shot, cur, prev, texte){
  shot.classList.add('vide');
  cur.removeAttribute('src');
  prev.removeAttribute('src');
  $('#insVoid').textContent = texte;
}

/* Fiche. `format` n'existe que sur la source banque (STATE.recent ne le porte
   pas) : on omet la ligne plutot que d'afficher un tiret, qui laisserait croire
   a une donnee absente du fichier. Le nom du .json de workflow n'est jamais
   montre : c'est de la mecanique de pack, pas une caracteristique d'image. */
function metaRows(item){
  const rows = [];
  if (item){
    if (item.scene) rows.push(['Scène', item.scene]);
    if (item.format) rows.push(['Format', item.format]);
    const sc = scoreTxt(item.score);
    if (sc) rows.push(['Score identité', sc]);
    // le verdict en toutes lettres : la bande de #runPanel ne le porte qu'en
    // couleur de bordure, et « statut jamais par la couleur seule »
    if (item.bucket) rows.push(['Tri', VERDICT_LABEL[item.bucket] || item.bucket]);
    if (item.space === 'nsfw') rows.push(['Espace', 'NSFW']);
  }
  if (META){
    if (META.output_style) rows.push(['Style', META.output_style]);
    if (META.world && META.world.label) rows.push(['Monde', META.world.label]);
    if (META.universe && META.universe.label) rows.push(['Pack', META.universe.label]);
  }
  return rows;
}

// /api/state rend un flottant, /api/gallery une chaine deja formatee (ou '')
const scoreTxt = v => {
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(3) : '';
};
