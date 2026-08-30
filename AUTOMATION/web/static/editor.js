/* Editeur photo OPTIQUE : recadrage, rotation, miroir, redressement,
   colorimetrie, grain manuel. Tout cote navigateur (canvas), aucun calcul GPU,
   resultat instantane. La retouche par instruction (Qwen) est un AUTRE outil,
   celui de la branche NSFW — ce fichier ne s'en occupe pas, et n'aura ni
   pinceau ni masque.

   F3 (30/08/2026), deux changements de comportement :

     - le RECADRAGE s'ouvre ETEINT. Le cadre porte un voile de 2000 px : allume
       d'office, il assombrissait l'image des l'entree pour un geste qu'on ne
       fait pas a chaque retouche. « Recadrer » l'allume, « annuler le
       recadrage » le rend eteint sans rien sauver.
     - enregistrer garde son sens par defaut — une COPIE `<nom>_edit`, la source
       intacte. « Écraser la source » existe desormais, en second rang et sous
       confirmation : c'est le seul chemin de cet ecran qui detruise quelque
       chose, et il dit ce qu'il coute (mesures effacees, export refait).

   Le canvas affiche est a taille d'ECRAN (limite a ~760x620) pour rester
   fluide pendant qu'on ajuste les curseurs ; l'enregistrement re-dessine tout
   a la resolution ORIGINALE dans un canvas hors-ecran separe, pour ne perdre
   aucune qualite. Les coordonnees du cadre de recadrage sont donc toujours en
   pixels d'AFFICHAGE, et converties au facteur d'echelle au moment d'exporter.

   Bascule en modules ES le 27/08/2026 (J3 etape 1) — comportement inchange. */
import {$, $$, esc} from './dom.js';
import {post, imgUrl} from './api.js';
import {openDialog, closeDialog} from './ui-dialog.js';
import {toast} from './toast.js';
import {confirmer} from './modal.js';
import {loadItems} from './review.js';
import {refreshCounts} from './poller.js';

let ED_ITEM = null;      // {name, bucket, space}
let ED_IMG = null;       // HTMLImageElement source, chargee une fois par ouverture
let ED_ROT = 0;           // 0..3 : pas de 90°
let ED_FLIP = false;      // miroir horizontal (apres rotation)
let ED_RATIO = null;      // null = libre, sinon {w, h}
let ED_CROP = null;       // {x,y,w,h} en pixels d'affichage (post-rotation 90°)
let ED_DRAG = null;

/* Part de la boite disponible que le cadre occupe a l'ouverture et a chaque
   changement de ratio. PAS 100 % : un cadre qui remplit exactement le canvas a
   une marge de deplacement NULLE — le clamp de `surDrag` le verrouille alors a
   x=0, et le cadre parait casse alors qu'il obeit (mesure du 30/08 : un tirer
   de +120 px deplacait de 0). On laisse de quoi le saisir tout de suite. */
const REMPLISSAGE = 0.92;

export async function ouvrirEditeur(item){
  if (!item) return;
  ED_ITEM = {name: item.name, bucket: item.bucket, space: item.space};
  // MODALE : <dialog>.showModal() couvre le chrome et prend le focus. On garde
  // `body.editing` — ce n'est plus lui qui affiche l'editeur, mais il tient
  // toujours les raccourcis clavier du studio a l'ecart (review.js, studio.js)
  // et masque le rail et la barre d'intensite sous le voile.
  document.body.classList.add('editing');
  openDialog($('#editorBox'), {initialFocus: '#edClose', onDismiss: fermerEditeur});
  $('#edFichier').textContent = item.name || '';
  $('#edMsg').textContent = 'chargement…';
  $('#edSave').disabled = true;
  const img = new Image();
  img.onload = () => {
    ED_IMG = img;
    resetReglages();          // recadrage compris : on ouvre sans cadre ni voile
    ajusterTailleCanvas();
    dessiner();
    $('#edMsg').textContent = '';
    $('#edSave').disabled = false;
  };
  img.onerror = () => { $('#edMsg').textContent = 'échec du chargement de l’image'; };
  img.src = imgUrl(item);
}

/* Une seule remise a zero, quel que soit le chemin de sortie : bouton, Echap,
   clic sur le voile. Branchee sur l'evenement `close` du <dialog>, elle couvre
   les trois — un handler par bouton en aurait manque deux. */
export function fermerEditeur(){
  closeDialog($('#editorBox'));
  document.body.classList.remove('editing');
  ED_ITEM = null; ED_IMG = null; ED_CROP = null; ED_DRAG = null;
}
$('#editorBox').addEventListener('close', () => {
  document.body.classList.remove('editing');
  ED_ITEM = null; ED_IMG = null; ED_CROP = null; ED_DRAG = null;
});
$('#edCancel').onclick = fermerEditeur;
$('#edClose').onclick = fermerEditeur;

/* Le plan de travail change de taille avec la fenetre : sans ca le canvas
   garderait la taille calculee a l'ouverture, et `max-width:100%` le
   reduirait en CSS — donc une echelle != 1, que `echelleAffichage` absorbe,
   mais au prix d'une image floue. On recalcule plutot. */
addEventListener('resize', () => {
  if (!ED_IMG || !$('#editorBox').open) return;
  ajusterTailleCanvas(); clampCrop(); dessiner();
});

/* --------------------------------------------------- recadrage : on / off
   `ED_CROP === null` EST l'etat « pas de recadrage » — c'est deja ce que lit
   `positionnerCropBox` (cadre masque), `clampCrop` et l'export. Il n'y a donc
   pas de second drapeau a tenir synchronise : allumer, c'est se donner un
   cadre ; eteindre, c'est le reprendre. */
const recadrageActif = () => !!ED_CROP;

function majCropUi(){
  const sec = $('#edCropSec');
  if (sec) sec.dataset.on = recadrageActif() ? '1' : '0';
  positionnerCropBox();
  majNoteRedresser();
}

function activerCrop(){
  if (!ED_IMG) return;
  appliquerRatioCentre();
  majCropUi();
}

/* Eteindre ne sauve rien et ne modifie pas l'image : le recadrage n'existe qu'a
   l'enregistrement. On revient aussi au ratio libre — laisser « 1:1 » allume
   sur un recadrage eteint annoncerait une contrainte qui ne s'applique plus. */
function annulerCrop(){
  ED_CROP = null;
  ED_RATIO = null;
  $$('#edRatio button').forEach(x => x.classList.toggle('on', x.dataset.r === 'libre'));
  majCropUi();
}

$('#edCropOn').onclick = activerCrop;
$('#edCropOff').onclick = annulerCrop;

/* ------------------------------------------------------------- geometrie */
function dimsRotees(){
  // dimensions APRES rotation 90° (le straighten, un angle fin, ne change pas
  // le cadre — voir margeSecurite)
  const w = ED_IMG.naturalWidth, h = ED_IMG.naturalHeight;
  return (ED_ROT % 2) ? {w: h, h: w} : {w, h};
}

function ajusterTailleCanvas(){
  const {w, h} = dimsRotees();
  const stage = $('.edStage');
  // La place REELLE du plan de travail, dans les deux axes. Les plafonds
  // d'avant (760 de large, 560 de haut) etaient ecrits en dur : sur le plan
  // mesure le 30/08 — 1112 x 844 — l'image n'occupait plus que 29 % de la
  // place, ce qui faisait l'essentiel du « mal organise ». La modale ayant une
  // taille connue, mesurer est desormais fiable.
  const pad = 32;                                   // .edStage padding, deux cotes
  const maxW = Math.max(200, (stage?.clientWidth || 760) - pad);
  const maxH = Math.max(200, (stage?.clientHeight || 560) - pad);
  // jamais au-dela de 1 : agrandir une image au-dessus de sa resolution la
  // rendrait floue sans rien montrer de plus
  const echelle = Math.min(maxW / w, maxH / h, 1);
  const cv = $('#edCanvas');
  cv.width = Math.max(40, Math.round(w * echelle));
  cv.height = Math.max(40, Math.round(h * echelle));
  cv.style.width = cv.width + 'px';
  cv.style.height = cv.height + 'px';
}

/* Rapport entre le canvas AFFICHE et le canvas de travail. Il vaut 1 tant que
   `ajusterTailleCanvas` a fait son office, mais `max-width:100%` reste un filet
   (fenetre reduite entre deux rendus) : sans cette conversion, un canvas remis
   a l'echelle par le CSS ferait deriver le cadre et le tirer d'autant. */
function echelleAffichage(){
  const cv = $('#edCanvas');
  const rendu = cv.getBoundingClientRect().width;
  return (rendu && cv.width) ? rendu / cv.width : 1;
}

function straightenVal(){ return +($('#edStraighten').value || 0); }

/* Un straighten non nul laisse des coins transparents au bord du canvas — le
   cadre (dims exactes du rectangle 90°-tourne, sans marge pour l'angle fin) ne
   couvre plus tout a fait l'image une fois inclinee de quelques degres. On
   n'essaie pas de calculer le rectangle inscrit exact : on inset le cadre de
   recadrage d'une marge proportionnelle a tan(angle), suffisant pour qu'un
   crop a l'interieur ne puisse jamais attraper un coin transparent. */
function margeSecurite(cv){
  const a = Math.abs(straightenVal()) * Math.PI / 180;
  return Math.ceil(Math.tan(a) * Math.max(cv.width, cv.height) / 2);
}

function clampCrop(){
  if (!ED_CROP) return;
  const cv = $('#edCanvas'), m = margeSecurite(cv);
  const minX = m, minY = m, maxX = cv.width - m, maxY = cv.height - m;
  ED_CROP.w = Math.min(ED_CROP.w, Math.max(24, maxX - minX));
  ED_CROP.h = Math.min(ED_CROP.h, Math.max(24, maxY - minY));
  ED_CROP.x = Math.max(minX, Math.min(ED_CROP.x, maxX - ED_CROP.w));
  ED_CROP.y = Math.max(minY, Math.min(ED_CROP.y, maxY - ED_CROP.h));
}

function appliquerRatioCentre(){
  const cv = $('#edCanvas'), m = margeSecurite(cv);
  const dispoW = Math.max(24, cv.width - 2 * m), dispoH = Math.max(24, cv.height - 2 * m);
  let w, h;
  if (ED_RATIO){
    const rr = ED_RATIO.w / ED_RATIO.h;
    if (dispoW / dispoH > rr){ h = dispoH; w = h * rr; } else { w = dispoW; h = w / rr; }
  } else { w = dispoW; h = dispoH; }
  w *= REMPLISSAGE; h *= REMPLISSAGE;
  ED_CROP = {x: (cv.width - w) / 2, y: (cv.height - h) / 2, w, h};
}

/* ----------------------------------------------------------- rendu ecran */
function filtreCss(){
  const b = 1 + (+$('#edBright').value) / 100;
  const c = 1 + (+$('#edContrast').value) / 100;
  const s = 1 + (+$('#edSat').value) / 100;
  return `brightness(${b}) contrast(${c}) saturate(${s})`;
}

/* Bruit de LUMINANCE (meme valeur sur R/G/B), pondere vers les ombres — le
   meme PRINCIPE que AUTOMATION/grain.py (luminance, pas chrominance, plus
   present dans les tons sombres), en version simplifiee pour une retouche
   manuelle a la volee. Ce n'est PAS le grain calibre de la production, qui
   reste gouverne par preset.grain_telephone — voir le libelle dans l'ecran. */
function appliquerGrain(ctx, w, h, quantite){
  if (!quantite) return;
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const force = quantite / 100 * 22;
  for (let i = 0; i < d.length; i += 4){
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3 / 255;
    const poidsOmbres = 0.35 + 0.65 * (1 - lum);
    const bruit = (Math.random() * 2 - 1) * force * poidsOmbres;
    d[i]     = Math.max(0, Math.min(255, d[i]     + bruit));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + bruit));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + bruit));
  }
  ctx.putImageData(id, 0, 0);
}

/* Approximation legere : un survol de couleur chaude/froide en mode "overlay",
   plutot qu'une vraie balance des blancs (hors de portee d'un filtre canvas
   simple sans manipuler chaque pixel en espace colorimetrique). */
function appliquerTemperature(ctx, w, h, val){
  if (!val) return;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = Math.min(0.18, Math.abs(val) / 50 * 0.18);
  ctx.fillStyle = val > 0 ? '#ff9d3d' : '#3daaff';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function dessiner(){
  if (!ED_IMG) return;
  const cv = $('#edCanvas'), ctx = cv.getContext('2d');
  const echelle = cv.width / dimsRotees().w;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save();
  ctx.filter = filtreCss();
  ctx.translate(cv.width / 2, cv.height / 2);
  ctx.rotate((ED_ROT * 90 + straightenVal()) * Math.PI / 180);
  // le miroir s'applique APRES la rotation, sur l'image telle qu'on la voit :
  // inverser avant ferait basculer le sens du retournement une fois sur deux
  if (ED_FLIP) ctx.scale(-1, 1);
  ctx.drawImage(ED_IMG, -ED_IMG.naturalWidth * echelle / 2, -ED_IMG.naturalHeight * echelle / 2,
               ED_IMG.naturalWidth * echelle, ED_IMG.naturalHeight * echelle);
  ctx.restore();
  ctx.filter = 'none';
  appliquerGrain(ctx, cv.width, cv.height, +$('#edGrain').value);
  appliquerTemperature(ctx, cv.width, cv.height, +$('#edTemp').value);
  positionnerCropBox();
}

function positionnerCropBox(){
  const box = $('#edCropBox');
  if (!box) return;
  if (!ED_CROP){ box.style.display = 'none'; return; }
  box.style.display = '';
  // ED_CROP est en pixels de TRAVAIL ; la boite est posee en pixels D'ECRAN.
  // Le parent (.edCanvasWrap) donne l'origine, cette echelle donne l'unite.
  const k = echelleAffichage();
  box.style.left = (ED_CROP.x * k) + 'px'; box.style.top = (ED_CROP.y * k) + 'px';
  box.style.width = (ED_CROP.w * k) + 'px'; box.style.height = (ED_CROP.h * k) + 'px';
}

/* --------------------------------------------------------------- controles */
/* Redresser sans recadrer rogne les coins a l'enregistrement (voir
   rectDecoupe). L'ecran, lui, montre l'image inclinee avec ses coins vides : on
   DIT donc ce que la sauvegarde fera, plutot que de laisser decouvrir l'ecart
   sur le fichier. Rien a dire tant que l'angle est nul, ou si un cadre est
   pose — c'est alors lui qui decide. */
function majNoteRedresser(){
  const note = $('#edStraightenNote');
  if (note) note.hidden = !(straightenVal() && !recadrageActif());
}

function majEtiquettesSliders(){
  ['edBright', 'edContrast', 'edSat', 'edTemp', 'edGrain'].forEach(id => {
    const el = $('#v_' + id); if (el) el.textContent = $('#' + id).value;
  });
  $('#v_edStraighten').textContent = straightenVal() + '°';
  majNoteRedresser();
}

function resetReglages(){
  ED_ROT = 0; ED_RATIO = null; ED_CROP = null; ED_FLIP = false;
  $('#edStraighten').value = 0;
  ['edBright', 'edContrast', 'edSat', 'edTemp', 'edGrain'].forEach(id => $('#' + id).value = 0);
  $$('#edRatio button').forEach(x => x.classList.toggle('on', x.dataset.r === 'libre'));
  $('#edFlip').setAttribute('aria-pressed', 'false');
  $('#edFlip').classList.remove('on');
  majEtiquettesSliders();
  majCropUi();
}
// « Réinitialiser » rend l'image telle qu'elle a ete ouverte — recadrage
// ETEINT compris : c'est bien l'etat d'ouverture, pas un cadre remis au centre.
$('#edReset').onclick = () => {
  resetReglages(); ajusterTailleCanvas(); dessiner();
};

$$('#edRatio button').forEach(b => b.onclick = () => {
  $$('#edRatio button').forEach(x => x.classList.toggle('on', x === b));
  const r = b.dataset.r;
  ED_RATIO = r === 'libre' ? null
    : (([a, c]) => ({w: +a, h: +c}))(r.split(':'));
  // choisir un format EST un geste de recadrage : s'il etait eteint, il
  // s'allume — sinon le clic ne ferait rien de visible
  appliquerRatioCentre();
  majCropUi();
});

$('#edRotL').onclick = () => { ED_ROT = (ED_ROT + 3) % 4; apresRotation(); };
$('#edRotR').onclick = () => { ED_ROT = (ED_ROT + 1) % 4; apresRotation(); };
$('#edFlip').onclick = () => {
  ED_FLIP = !ED_FLIP;
  $('#edFlip').setAttribute('aria-pressed', ED_FLIP ? 'true' : 'false');
  $('#edFlip').classList.toggle('on', ED_FLIP);
  dessiner();     // le miroir ne change ni les dimensions ni le cadre
};
/* Une rotation 90° echange largeur et hauteur : le canvas est recalcule, et un
   cadre existant n'a plus de sens dans le nouveau repere — on le recentre.
   Recadrage eteint, il le RESTE : tourner n'est pas recadrer. */
function apresRotation(){
  ajusterTailleCanvas();
  if (recadrageActif()) appliquerRatioCentre();
  dessiner();
  majCropUi();
}

['edBright', 'edContrast', 'edSat', 'edTemp', 'edGrain', 'edStraighten'].forEach(id => {
  $('#' + id)?.addEventListener('input', () => {
    majEtiquettesSliders();
    if (id === 'edStraighten') clampCrop();
    dessiner();
  });
});

/* -------------------------------------------------- cadre de recadrage */
function surDrag(e){
  if (!ED_DRAG) return;
  // la souris parle en pixels d'ecran, ED_CROP en pixels de travail
  const k = echelleAffichage() || 1;
  const dx = (e.clientX - ED_DRAG.sx) / k, dy = (e.clientY - ED_DRAG.sy) / k;
  const o = ED_DRAG.orig, cv = $('#edCanvas'), m = margeSecurite(cv);
  const minX = m, minY = m, maxX = cv.width - m, maxY = cv.height - m;
  if (ED_DRAG.mode === 'move'){
    ED_CROP.x = Math.max(minX, Math.min(o.x + dx, maxX - o.w));
    ED_CROP.y = Math.max(minY, Math.min(o.y + dy, maxY - o.h));
  } else {
    let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
    if (ED_DRAG.mode.includes('e')) nw = o.w + dx;
    if (ED_DRAG.mode.includes('w')){ nx = o.x + dx; nw = o.w - dx; }
    if (ED_DRAG.mode.includes('s')) nh = o.h + dy;
    if (ED_DRAG.mode.includes('n')){ ny = o.y + dy; nh = o.h - dy; }
    if (ED_RATIO){
      const rr = ED_RATIO.w / ED_RATIO.h;
      nh = nw / rr;
      if (ED_DRAG.mode.includes('n')) ny = o.y + o.h - nh;
    }
    nw = Math.max(24, nw); nh = Math.max(24, nh);
    nx = Math.max(minX, Math.min(nx, maxX - 24));
    ny = Math.max(minY, Math.min(ny, maxY - 24));
    nw = Math.min(nw, maxX - nx); nh = Math.min(nh, maxY - ny);
    ED_CROP = {x: nx, y: ny, w: nw, h: nh};
  }
  positionnerCropBox();
}
function finDrag(){
  document.removeEventListener('pointermove', surDrag);
  ED_DRAG = null;
}
$('#edCropBox').addEventListener('pointerdown', e => {
  if (e.target.classList.contains('edHandle')) return;
  e.preventDefault();
  ED_DRAG = {mode: 'move', sx: e.clientX, sy: e.clientY, orig: {...ED_CROP}};
  document.addEventListener('pointermove', surDrag);
  document.addEventListener('pointerup', finDrag, {once: true});
});
$$('.edHandle').forEach(h => h.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation();
  ED_DRAG = {mode: h.dataset.h, sx: e.clientX, sy: e.clientY, orig: {...ED_CROP}};
  document.addEventListener('pointermove', surDrag);
  document.addEventListener('pointerup', finDrag, {once: true});
}));

/* ------------------------------------------------------------- export plein */
function rendreCanvasComplet(){
  const {w, h} = dimsRotees();
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const ctx = off.getContext('2d');
  ctx.save();
  ctx.filter = filtreCss();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((ED_ROT * 90 + straightenVal()) * Math.PI / 180);
  if (ED_FLIP) ctx.scale(-1, 1);
  ctx.drawImage(ED_IMG, -ED_IMG.naturalWidth / 2, -ED_IMG.naturalHeight / 2);
  ctx.restore();
  ctx.filter = 'none';
  appliquerGrain(ctx, w, h, +$('#edGrain').value);
  appliquerTemperature(ctx, w, h, +$('#edTemp').value);
  return off;
}

/* Rectangle a decouper, en pixels du canvas AFFICHE. Recadrage eteint = toute
   l'image : `null` n'est pas un cas d'erreur, c'est le cas normal depuis F3.1.
   Le facteur d'echelle vers la resolution reelle est applique par l'appelant. */
function rectDecoupe(){
  const cv = $('#edCanvas');
  if (ED_CROP) return ED_CROP;
  // Sans cadre, on ne prend pas betement tout le canvas : un redressement
  // incline l'image et laisse des COINS TRANSPARENTS. `margeSecurite` est
  // justement la marge qui les evite — elle vaut 0 a angle nul, donc a plat le
  // rectangle est bien l'image entiere, au pixel pres. Sans ca, redresser sans
  // recadrer enregistrait un PNG a coins vides.
  const m = margeSecurite(cv);
  return {x: m, y: m, w: cv.width - 2 * m, h: cv.height - 2 * m};
}

/* Le rendu final, a la resolution ORIGINALE : le canvas affiche est reduit pour
   rester fluide sous les curseurs, on ne sauve jamais ces pixels-la. */
function imageFinale(){
  const plein = rendreCanvasComplet();
  const facteur = plein.width / $('#edCanvas').width;   // affichage -> reel
  const c = rectDecoupe();
  const rx = c.x * facteur, ry = c.y * facteur, rw = c.w * facteur, rh = c.h * facteur;
  const finale = document.createElement('canvas');
  finale.width = Math.max(1, Math.round(rw));
  finale.height = Math.max(1, Math.round(rh));
  finale.getContext('2d').drawImage(plein, rx, ry, rw, rh, 0, 0, finale.width, finale.height);
  return finale;
}

/* Un seul chemin d'enregistrement, deux destinations. `remplacer` ne change pas
   ce qui est calcule — seulement ou ca atterrit, et ce que le serveur doit
   defaire derriere (mesures, export, vignette : voir api_edit_save). */
async function enregistrer(remplacer){
  if (!ED_IMG || !ED_ITEM) return;
  const btns = [$('#edSave'), $('#edSaveOver')];
  btns.forEach(b => b.disabled = true);
  $('#edMsg').textContent = 'enregistrement…';
  try {
    const data_base64 = imageFinale().toDataURL('image/png').split(',')[1];
    const r = await post('/api/edit/save', {
      name: ED_ITEM.name, bucket: ED_ITEM.bucket, space: ED_ITEM.space,
      remplacer, data_base64});
    if (!r.ok){ $('#edMsg').textContent = ''; toast(r.erreur || 'échec'); return; }
    toast(r.remplace ? `${r.name} remplacée` : `copie enregistrée : ${r.name}`);
    fermerEditeur();
    loadItems();
    refreshCounts();
  } finally {
    btns.forEach(b => { if (b) b.disabled = false; });
  }
}

$('#edSave').onclick = () => enregistrer(false);

/* ÉCRASER LA SOURCE. Le seul geste destructeur de l'editeur, donc : jamais le
   bouton primaire, et une confirmation qui dit les trois consequences plutot
   qu'un « êtes-vous sûr ? ». La ligne de journal de la generation, elle, ne
   bouge pas — elle raconte ce que le pipeline a produit, ce qui reste vrai. */
$('#edSaveOver').onclick = async () => {
  if (!ED_IMG || !ED_ITEM) return;
  const ok = await confirmer({
    titre: 'Écraser la source ?',
    corps: `<p><b>${esc(ED_ITEM.name)}</b> sera remplacée sur le disque par la
      version retouchée. La version d'origine ne sera plus récupérable.</p>
      <p class="tiny">Ses mesures de réalisme portaient sur les anciens pixels :
      elles sont effacées, l'image redevient « non mesurée ». Le jugement
      ◉ / ◌, lui, est conservé, et l'export publiable est refait. La ligne de
      journal de la génération reste telle quelle.</p>
      <p class="tiny">« Enregistrer une copie » garde l'original intact.</p>`,
    bouton: 'Écraser la source'});
  if (!ok) return;
  enregistrer(true);
};
