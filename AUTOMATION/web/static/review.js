/* Ecran Revue : tri, sous-scores, jugement, armement, declinaison.
   Bascule en modules ES le 27/08/2026 (J3). Depuis l'etape 2 : l'etat du tri
   (bucket / espace / vue / liste / curseur) est encapsule ici et expose par
   triageState() / setTriageEntry() ; les bandes de score viennent de
   config.js. */
import {$, $$, esc} from './dom.js';
import {api, post, erreurDe} from './api.js';
import {signalerPanne} from './health.js';
import {on} from './bus.js';
import {toast} from './toast.js';
import {confirmer} from './modal.js';
import {openDialog, closeDialog} from './ui-dialog.js';
import {openLight} from './lightbox.js';
import {go} from './nav.js';
import {qc} from './config.js';
import {creative, loadCreative, palier} from './taxonomy.js';
import {setLevel} from './create.js';
import {ouvrirEditeur} from './editor.js';
import {refreshCounts} from './poller.js';

/* --- etat du tri, prive au module ---------------------------------- */
let BUCKET = 'A_REVOIR';
let SPACE = 'lena';          // axe SFW/NSFW (valeur SFW 'lena' — != personnage)
let VIEW = 'grille';
let ITEMS = [];              // liste du dossier courant
let VITEMS = [];             // sous-ensemble affiche (filtre de score)
let CUR = 0;
let SFILTER = 'tout';
let BANDES = {};             // etalonnage du realisme, cote serveur
let JUGES = 0;
let REFS = {mesurees: 0, total: 0};
let ITEMS_SEQ = 0;           // jeton anti-reponse-perimee (loadItems)

// bucket/espace/vue courants, pour poller.js (compteurs) et nav.js
export const triageState = () => ({bucket: BUCKET, space: SPACE, view: VIEW});
// point d'entree depuis un onglet (Galerie/Revue) : bucket impose, retour SFW
// strict, vue grille — ouvrir sur du NSFW sans l'avoir choisi serait surprenant
export function setTriageEntry(bucket){
  BUCKET = bucket; SPACE = 'lena'; VIEW = 'grille';
}

/* Reflete BUCKET/SPACE sur les boutons du selecteur de l'ecran #trier et sur
   l'onglet Galerie/Revue correspondant — appelee depuis nav.go() (clic sur un
   onglet) et depuis les selecteurs bucket/espace eux-memes, pour que les trois
   entrees restent synchronisees. La mise en avant Galerie/Revue ne s'applique
   qu'en espace Léna : le NSFW n'a pas d'onglet propre. */
export function syncTriageUi(){
  $$('#bucketSel button').forEach(x => x.classList.toggle('on', x.dataset.b === BUCKET));
  $$('#spaceSel button').forEach(x => x.classList.toggle('on', x.dataset.sp === SPACE));
  // L'onglet Galerie a disparu du chrome : Revue (#trier) couvre tous les
  // buckets SFW, le hash #galerie (bucket OK) compris. Le NSFW n'a pas d'onglet.
  const surTrier = SPACE === 'lena';
  $$('.tabs button[data-s="trier"]').forEach(x => x.classList.toggle('on', surTrier));
}

/* ===================================================================== TRIER */
$$('#bucketSel button').forEach(b => b.onclick = () => {
  BUCKET = b.dataset.b; CUR = 0; syncTriageUi(); loadItems();
});
$$('#spaceSel button').forEach(b => b.onclick = () => {
  SPACE = b.dataset.sp; CUR = 0; syncTriageUi(); loadItems();
});
$$('#viewSel button').forEach(b => b.onclick = () => {
  $$('#viewSel button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); VIEW = b.dataset.v; renderTriage();
});
$$('#scoreSel button').forEach(b => b.onclick = () => setScoreFilter(b.dataset.f));
function setScoreFilter(f){ SFILTER = f; CUR = 0; renderTriage(); }

export async function loadItems(){
  // jeton anti-reponse-perimee : deux clics rapproches sur deux buckets
  // differents peuvent voir la reponse du premier arriver apres celle du
  // second et ecraser ITEMS avec des donnees qui ne correspondent plus au
  // bucket actuellement selectionne
  const seq = ++ITEMS_SEQ;
  const d = await api('/api/gallery?bucket=' + BUCKET + '&space=' + SPACE);
  if (seq !== ITEMS_SEQ) return;
  // reponse malformee (5xx a corps HTML) : api() rend {ok:false}. Sans garde,
  // `ITEMS = d.items` (undefined) fait lever applyFilter() -> ecran vide muet
  const err = erreurDe(d) || (Array.isArray(d.items) ? null : 'réponse illisible du serveur');
  signalerPanne('galerie', err);
  if (err){ renderTriage(); return; }   // garde la liste precedente, qui le dit
  ITEMS = d.items;
  BANDES = d.bandes || {};
  JUGES = d.juges || 0;
  REFS = d.references || {mesurees: 0, total: 0};
  const b = $('#btnMesurer');
  b.style.display = d.sans_mesure ? '' : 'none';
  b.disabled = MESURE_EN_COURS;
  b.textContent = MESURE_EN_COURS ? 'mesure…' : `Mesurer (${d.sans_mesure})`;
  renderTriage();                       // applyFilter() y recalcule VITEMS et CUR
}

/* Rattrapage des mesures de realisme, par paquets : une passe InsightFace coute
   ~190 ms, le serveur refuse d'en faire 200 dans une seule requete. */
let MESURE_EN_COURS = false;
$('#btnMesurer').onclick = async () => {
  if (MESURE_EN_COURS) return;
  MESURE_EN_COURS = true;
  $('#btnMesurer').disabled = true;
  try {
    for (let garde = 0; garde < 40; garde++){
      $('#btnMesurer').textContent = 'mesure…';
      const r = await post('/api/mesurer', {bucket: BUCKET, space: SPACE, lot: 20});
      if (!r.ok) { toast(r.erreur || 'mesure impossible'); break; }
      if (!r.restant) break;
      $('#btnMesurer').textContent = `mesure… ${r.restant} restante(s)`;
    }
    toast('mesures à jour');
  } finally {
    MESURE_EN_COURS = false;
    await loadItems();
  }
};

/* Barre d'un sous-score. L'echelle vient de la bande d'etalonnage quand elle
   existe (>= 8 images jugees convaincantes), sinon de l'etendue observee dans le
   dossier courant. Aucun seuil n'est ecrit en dur : le projet n'a pas de corpus
   de vraies photos, la reference c'est le jugement de l'utilisateur. */
/* D'ou vient l'echelle des barres — a dire, sinon on ne sait pas ce qu'on lit. */
function etalon(){
  // Les trois barres peuvent etre calibrees separement : prendre la premiere
  // bande venue faisait annoncer une origine pour une echelle que les autres ne
  // partagent pas forcement. On dit ce qui est vrai des trois.
  const bandes = Object.values(BANDES).filter(Boolean);
  if (!bandes.length) return '· pas de cible, échelle du dossier';
  const partiel = bandes.length < 3 ? ` · ${bandes.length}/3 mesures calibrées` : '';
  const sources = new Set(bandes.map(b => b.source));
  if (sources.size > 1) return `· cibles mixtes (référence et jugements)${partiel}`;
  return (bandes[0].source === 'reference'
    ? `· cible : ${REFS.mesurees} image(s) de référence`
    : `· cible : ${bandes[0].n} image(s) jugées convaincantes`) + partiel;
}

function barre(label, val, champ){
  if (val == null) return '';
  const b = BANDES[champ];
  let lo, hi, cls = '';
  if (b){
    lo = Math.min(b.min, val); hi = Math.max(b.max, val);
    cls = (val >= b.min && val <= b.max) ? 'dans' : 'hors';
  } else {
    const vals = ITEMS.map(i => i[{nettete:'nettete', texture_visage:'texture',
                                   bruit_fond:'fond'}[champ]])
                      .filter(v => v != null);
    lo = Math.min(...vals); hi = Math.max(...vals);
  }
  const pct = hi > lo ? Math.round(100 * (val - lo) / (hi - lo)) : 50;
  const dec = champ === 'nettete' ? 0 : 2;
  return `<div class="b2"><span>${label}</span><u><i class="${cls}"
    style="width:${Math.max(3, pct)}%"></i></u><b>${val.toFixed(dec)}</b></div>`;
}

const flagBtns = i => `
  <button data-f="ok" class="${i.flag === 'ok' ? 'on' : ''}"
    title="Convaincante comme photo (C)">◉</button>
  <button data-f="ia" class="${i.flag === 'ia' ? 'on' : ''}"
    title="Ça se voit que c'est généré (I)">◌</button>`;

/* Les bandes de lecture du score viennent de config.json (module config.js
   depuis J3 etape 2) : le disque et l'ecran parlent du meme seuil. On ne fait
   ici que rafraichir les libelles du filtre quand la config est chargee. */
on('config:loaded', majTitresScore);
function majTitresScore(){
  const t = {tout: 'toutes les images du dossier',
             haut: `score ≥ ${qc().high.toFixed(2)}`,
             moyen:`score ${qc().ok.toFixed(2)} à ${qc().high.toFixed(2)}`,
             bas:  `score < ${qc().ok.toFixed(2)}, ou visage non mesuré`};
  $$('#scoreSel button').forEach(b => b.title = t[b.dataset.f]);
}

// scoreClass est la SEULE fonction qui lit les seuils : scoreBand (filtre par
// bucket) derive de ses memes paliers plutot que de comparer a nouveau contre
// QC avec des bornes differentes — sinon "Correctes" (QC.ok..QC.high) et
// "Excellentes" (>=QC.high) finissent avec le badge vert identique, comme
// c'etait le cas ici avant (scoreBand comparait a QC.high, scoreClass a QC.ok).
const scoreClass = sc => {
  const v = parseFloat(sc);
  if (!sc || isNaN(v)) return 'none';
  return v >= qc().high ? 'high' : v >= qc().ok ? 'ok' : v >= qc().watch ? 'warn' : 'bad';
};
function scoreBand(sc){
  const c = scoreClass(sc);
  return c === 'high' ? 'haut' : c === 'ok' ? 'moyen' : 'bas';    // warn/bad/none -> bas
}
const badge = sc => sc ? `<span class="badge ${scoreClass(sc)}">${parseFloat(sc).toFixed(2)}</span>` : '';

/* VITEMS = ce qui est reellement affiche. ITEMS reste la liste du dossier. */
function applyFilter(){
  VITEMS = SFILTER === 'tout' ? ITEMS.slice()
                              : ITEMS.filter(i => scoreBand(i.score) === SFILTER);
  if (CUR >= VITEMS.length) CUR = Math.max(0, VITEMS.length - 1);
  const c = {tout: ITEMS.length, haut: 0, moyen: 0, bas: 0};
  ITEMS.forEach(i => c[scoreBand(i.score)]++);
  $$('#scoreSel button').forEach(b => {
    b.querySelector('.n').textContent = c[b.dataset.f] || '';
    b.classList.toggle('on', b.dataset.f === SFILTER);
  });
}

function renderTriage(){
  applyFilter();
  const body = $('#triageBody');
  if (!VITEMS.length){
    const vide = !ITEMS.length;
    const done = {A_REVOIR:'Tout est trié.', OK:'Aucune image validée pour l’instant.',
                  REJET:'Aucun rejet.', ARCHIVE:'Aucune image archivée.',
                  SANS_VISAGE:'Aucune image sans visage détecté.'}[BUCKET];
    body.innerHTML = `<div class="empty">
      <b>${vide ? done : 'Aucune image dans cette bande de score.'}</b>
      ${vide
        ? (BUCKET === 'A_REVOIR'
            ? 'Les images dont le score sort de la bande conforme atterrissent ici après chaque batch.'
            : BUCKET === 'SANS_VISAGE'
            ? 'Le contrôle d’identité range ici les images où aucun visage n’a été détecté : dos, plan très large, visage masqué. Elles n’ont pas de score.'
            : 'Rien à afficher dans ce dossier.')
        : `${ITEMS.length} image(s) dans ce dossier, aucune dans cette bande.`}
      <div style="margin-top:16px">${vide
        ? `<button class="btn" id="btnEmptyGo">Produire des images</button>`
        : `<button class="btn" id="btnEmptyAll">Tout afficher</button>`}</div></div>`;
    // plus de handler inline (onclick="go(...)") : en modules ES rien n'est
    // global, il faut cabler apres coup
    $('#btnEmptyGo')?.addEventListener('click', () => go('creer'));
    $('#btnEmptyAll')?.addEventListener('click', () => setScoreFilter('tout'));
    return;
  }
  if (VIEW === 'grille'){
    body.innerHTML = '<div class="grid">' + VITEMS.map((i, k) => `
      <div class="tile${i.flag === 'ia' ? ' ia' : ''}${k === CUR ? ' cur' : ''}" data-k="${k}">
        <img loading="lazy" data-k="${k}"
          src="/img?bucket=${i.bucket}&space=${i.space}&name=${encodeURIComponent(i.name)}&thumb=1">
        <div class="chip ${scoreClass(i.score)}">${i.score ? parseFloat(i.score).toFixed(2) : '—'}</div>
        <div class="m"><b>${esc(i.scene || i.name)}</b><br>${esc(i.format||'')} · ${esc(i.date)}</div>
        ${i.nettete == null
          ? '<div class="nomeas">réalisme non mesuré</div>'
          : `<div class="bars">
              ${barre('net', i.nettete, 'nettete')}
              ${barre('peau', i.texture, 'texture_visage')}
              ${barre('fond', i.fond, 'bruit_fond')}</div>`}
        <div class="tacts">
          <button data-a="valider" title="Garder (V)">♥</button>
          ${i.space === 'nsfw' ? '' : '<button data-d="1" title="Décliner (D)">⟳</button>'}
          <button data-a="rejeter" title="Rejeter (X)">✕</button>
          <button data-a="archiver" title="Archiver (A)">▣</button>
          <span class="sep"></span>${flagBtns(i)}
          <span class="sep"></span>
          <button class="del" data-suppr="1" title="Supprimer définitivement — pas de retour">🗑</button>
        </div>
      </div>`).join('') + '</div>';
    // Le curseur clavier doit se VOIR en grille. Avant, les raccourcis V/X/A
    // etaient actifs ici mais agissaient sur VITEMS[CUR] — soit la premiere
    // image, sans rien a l'ecran pour le dire : on triait a l'aveugle, et un
    // appui repete deroulait toute la file. Le cadre ci-dessous et les fleches
    // rendent le meme raccourci lisible au lieu de le supprimer.
    const courante = body.querySelector('.tile.cur');
    if (courante) courante.scrollIntoView({block: 'nearest'});
    body.querySelectorAll('.tile').forEach(t => t.addEventListener('mousedown', e => {
      if (e.target.closest('.tacts')) return;      // les boutons posent CUR eux-memes
      CUR = +t.dataset.k;                          // cliquer = viser
      viserEnGrille();                             // le cadre suit tout de suite
    }));
    body.querySelectorAll('.tile img').forEach(im => im.onclick = () => {
      CUR = +im.dataset.k; VIEW = 'revue';
      $$('#viewSel button').forEach(x => x.classList.toggle('on', x.dataset.v === 'revue'));
      renderTriage();
    });
    // actions directes : on trie sans jamais ouvrir l'image
    body.querySelectorAll('.tacts button').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const k = +b.closest('.tile').dataset.k;
      if (b.dataset.d) ouvrirDeclinaison(k);
      else if (b.dataset.suppr) supprimerDefinitivement(k);
      else if (b.dataset.a) act(b.dataset.a, k);
      else poserFlag(k, b.dataset.f);
    });
    return;
  }
  const i = VITEMS[CUR];
  const v = parseFloat(i.score || 0);
  const cls = scoreClass(i.score);
  body.innerHTML = `<div class="triage">
    <div class="stage">
      <button class="nav prev">‹</button>
      <img src="/img?bucket=${i.bucket}&space=${i.space}&name=${encodeURIComponent(i.name)}" id="stageImg">
      <button class="nav next">›</button>
    </div>
    <div class="side">
      <div class="meta">
        <div class="score" style="color:var(--${cls})">${i.score ? v.toFixed(3) : '—'}
          <small>similarité à la base gelée${i.score ? (v >= qc().ok ? ' · conforme' : v >= qc().watch ? ' · à surveiller' : ' · hors bande') : ''}</small></div>
        <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
        <dl style="margin:0">
          <dt>scène</dt><dd>${esc(i.scene || '—')}</dd>
          <dt>format · date</dt><dd>${esc(i.format || '—')} · ${esc(i.date)}</dd>
          <dt>seed</dt><dd class="num">${esc(i.seed || '—')}</dd>
        </dl>
        <div class="tiny">${CUR + 1} / ${VITEMS.length}${
          SFILTER === 'tout' ? '' : ` · filtre actif sur ${ITEMS.length}`}</div>
      </div>
      <div class="meta">
        <dt style="margin-bottom:9px">réalisme ${etalon()}</dt>
        ${i.nettete == null ? '<div class="tiny">non mesuré</div>' : `<div class="bars" style="padding:0">
          ${barre('net', i.nettete, 'nettete')}
          ${barre('peau', i.texture, 'texture_visage')}
          ${barre('fond', i.fond, 'bruit_fond')}</div>`}
        <div class="tacts" style="margin-top:11px;border:0;padding:0">${flagBtns(i)}</div>
        <div class="tiny" style="margin-top:7px">◉ convaincante <span class="kbd">C</span>
          · ◌ fait IA <span class="kbd">I</span></div>
      </div>
      <div class="acts">${actionsFor(BUCKET, i.space)}</div>
      <div class="secActs">
        <button class="btn sm" id="btnOuvrirEditeur">✎ Éditer</button>
        <button class="btn sm danger" id="btnSupprDef">🗑 Supprimer définitivement</button>
      </div>
      <details class="adv" style="border:0;padding:0"><summary>prompt utilisé</summary>
        <p class="tiny" style="margin-top:8px">${esc(i.prompt || '')}</p></details>
    </div></div>`;
  body.querySelector('.prev').onclick = () => step(-1);
  body.querySelector('.next').onclick = () => step(1);
  body.querySelector('#stageImg').onclick = () =>
    openLight(`/img?bucket=${i.bucket}&space=${i.space}&name=${encodeURIComponent(i.name)}`);
  body.querySelector('#btnSupprDef').onclick = () => supprimerDefinitivement(CUR);
  const be = body.querySelector('#btnOuvrirEditeur');
  if (be) be.onclick = () => ouvrirEditeur(i);
  body.querySelectorAll('.acts button').forEach(b => b.onclick = () => act(b.dataset.a));
}
function actionsFor(b, space){
  const B = {
    valider: '<button class="btn primary wide" data-a="valider">Valider <span class="kbd">V</span></button>',
    restaurer: '<button class="btn primary wide" data-a="valider">Restaurer <span class="kbd">V</span></button>',
    revoir: '<button class="btn" data-a="revoir">À revoir <span class="kbd">R</span></button>',
    rejeter: '<button class="btn" data-a="rejeter">Rejeter <span class="kbd">X</span></button>',
    skip: '<button class="btn wide" data-a="skip">Suivante <span class="kbd">→</span></button>',
    archiver: '<button class="btn" data-a="archiver">Archiver <span class="kbd">A</span></button>',
    // la declinaison relance depuis le journal SFW (/api/decline) : pas de
    // sens pour une image NSFW, qui se re-edite depuis l'onglet NSFW lui-meme
    decliner: space === 'nsfw' ? ''
      : '<button class="btn wide" data-a="decliner">⟳ Décliner <span class="kbd">D</span></button>',
  };
  if (b === 'OK') return B.decliner + B.skip + B.archiver + B.rejeter;
  if (b === 'REJET') return B.restaurer + B.archiver + B.skip;
  if (b === 'ARCHIVE') return B.restaurer + B.rejeter + B.skip;
  return B.valider + B.decliner + B.rejeter + B.archiver + B.skip;
}

/* Deplace le cadre du curseur en vue grille, sans repeindre.

   Re-rendre les 200 tuiles a chaque fleche ferait clignoter toute la page pour
   un simple deplacement de curseur — et rechargerait les vignettes. On ne
   touche donc que la classe et le defilement ; rend false si la tuile visee
   n'existe pas (filtre qui vient de changer), auquel cas l'appelant repeint. */
function viserEnGrille(){
  if (VIEW !== 'grille') return false;
  const g = $('#triageBody');
  const cible = g.querySelector(`.tile[data-k="${CUR}"]`);
  if (!cible) return false;
  g.querySelectorAll('.tile.cur').forEach(x => x.classList.remove('cur'));
  cible.classList.add('cur');
  cible.scrollIntoView({block: 'nearest'});
  return true;
}

const step = d => { if (!VITEMS.length) return;
  CUR = (CUR + d + VITEMS.length) % VITEMS.length;
  if (viserEnGrille()) return;
  renderTriage(); };

const TARGET = {valider:'OK', revoir:'A_REVOIR', rejeter:'REJET',
                archiver:'ARCHIVE'};
/* Le jugement de realisme ne deplace rien : il est independant du tri. */
async function poserFlag(k, f){
  const it = VITEMS[k];
  if (!it) return;
  const nouveau = it.flag === f ? null : f;    // recliquer retire le jugement
  const r = await post('/api/flag', {name: it.name, flag: nouveau});
  if (!r.ok) return toast(r.erreur || 'jugement impossible');
  it.flag = nouveau;
  const src = ITEMS.find(x => x.name === it.name);
  if (src) src.flag = nouveau;
  renderTriage();
}

async function act(a, k){
  if (!VITEMS.length) return;
  if (a === 'decliner') return ouvrirDeclinaison(k == null ? CUR : k);
  if (a === 'skip') return step(1);
  if (k != null) CUR = k;
  if (TARGET[a] === BUCKET) return step(1);   // deja dans ce dossier : on avance
  const it = VITEMS[CUR];
  const r = await post('/api/action', {name: it.name, bucket: it.bucket, space: it.space, action: a});
  if (!r.ok) return toast(r.erreur || 'action impossible');
  const pos = ITEMS.indexOf(it);              // retrait dans la liste source
  if (pos >= 0) ITEMS.splice(pos, 1);
  renderTriage(); refreshCounts();            // applyFilter y reborne CUR
  const label = {valider:'validée', revoir:'à revoir', rejeter:'rejetée',
                 archiver:'archivée'}[a];
  toast(`${it.scene || it.name} → ${label}`, 'annuler', undo);
}

/* Suppression DEFINITIVE (26/08/2026) — volontairement HORS de act() : ce
   n'est pas un tri, ca ne va jamais dans UNDO (rien a y remettre, le fichier
   n'existe plus), et melanger les deux dans la meme fonction generique est
   exactement le genre de raccourci qui ferait un jour de la suppression « juste
   un bucket de plus ». Une confirmation explicite a chaque fois, jamais de
   raccourci clavier — c'est le seul geste de l'appli qui n'a pas de porte de
   sortie. */
async function supprimerDefinitivement(k){
  const it = VITEMS[k ?? CUR];
  if (!it) return;
  const ok = await confirmer({
    titre: 'Supprimer définitivement ?',
    corps: `<p><b>${esc(it.scene || it.name)}</b> sera effacée du disque.
      Aucun retour possible — contrairement au tri, il n'y a pas de bouton
      « annuler » pour ce geste.</p>
      <p class="tiny">Le journal garde la trace qu'elle a existé et son
      score ; seul le fichier disparaît.</p>`,
    bouton: 'Supprimer définitivement'});
  if (!ok) return;
  const r = await post('/api/delete', {name: it.name, bucket: it.bucket, space: it.space});
  if (!r.ok) return toast(r.erreur || 'suppression impossible');
  const pos = ITEMS.indexOf(it);
  if (pos >= 0) ITEMS.splice(pos, 1);
  renderTriage(); refreshCounts();
  toast(`${it.scene || it.name} supprimée définitivement`);
}
/* ============================================================== ARMEMENT
   La branche NSFW ne s'arme pas d'un clic : il faut recopier le mot. Le rituel a
   quitte l'onglet Avance pour le cran verrouille du curseur — c'est la que la
   decision se prend, au moment ou on en a besoin. */
export function ouvrirArmement(p){
  $('#armCard').innerHTML = `
    <h3>Niveau « ${p.label} » — branche désarmée</h3>
    <p>Elle est construite et testée. Elle ne produit rien tant qu'elle n'est pas
       armée explicitement.</p>
    <ul>
      <li>la génération part du niveau <b>Soft</b>, puis l'image est éditée</li>
      <li>PuLID + FaceDetailer remettent le visage depuis la base gelée</li>
      <li>sorties isolées dans <code>PROD/_NSFW/</code>, <b>jamais exportées</b></li>
      <li>une image dont la passe SFW sort de la bande d'identité n'est pas éditée</li>
    </ul>
    <label class="f" style="margin-top:14px"><span>pour armer, recopier le mot ARMER</span>
      <input id="armWord2" autocomplete="off" style="max-width:220px"></label>
    <div style="margin-top:16px;display:flex;gap:12px;align-items:center">
      <button class="btn primary" id="btnArm2">Armer la branche</button>
      <button class="link" id="armClose">annuler</button></div>`;
  const armer = async () => {
    const r = await post('/api/nsfw/arm', {arm: true, confirm: $('#armWord2').value});
    if (!r.ok) return toast(r.erreur === 'confirmation manquante'
      ? 'recopie exactement le mot ARMER' : (r.erreur || 'échec'));
    closeDialog($('#armBox'));
    toast('branche armée');
    await loadCreative();
    setLevel(p.level);
  };
  $('#btnArm2').onclick = armer;
  $('#armWord2').addEventListener('keydown', e => { if (e.key === 'Enter') armer(); });
  $('#armClose').onclick = () => closeDialog($('#armBox'));
  openDialog($('#armBox'), {initialFocus: '#armWord2'});
}

/* =============================================================== DECLINER
   Repartir d'une image gardee plutot que relancer un batch. Le serveur
   reconstruit le job depuis la ligne de journal — le seed y est justement pour
   ca. `dry` demande d'abord ce qui a un sens sur CETTE image, pour ne jamais
   proposer un bouton qui echouera. */
let DECLINE_SRC = null, DECLINE_DRY = null;

async function ouvrirDeclinaison(k){
  const it = VITEMS[k];
  if (!it) return;
  // /api/decline ne connait que le journal SFW ; le bouton est deja masque en
  // NSFW (actionsFor / tuile grille), ce garde couvre le raccourci clavier D
  if (it.space === 'nsfw') return toast('déclinaison indisponible ici — passe par l’onglet NSFW');
  const d = await post('/api/decline', {name: it.name, dry: true, n: 3});
  if (!d.ok) return toast(d.erreur || 'déclinaison impossible');
  DECLINE_SRC = it;
  DECLINE_DRY = d;
  const m = d.modes || {};
  const btn = (mode, libelle, dispo, sfx) =>
    `<button class="btn dm" data-m="${mode}" ${dispo ? '' : 'disabled'}>${libelle}
       <span class="n">${sfx}</span></button>`;
  // le palier suivant demande l'armement NSFW et elle ne l'est pas : mener
  // directement au rituel d'armement plutot que de laisser cliquer un bouton
  // qui echouera cote serveur (guard_intensity) avec un toast generique
  const boutonIntensite = d.suivant_verrouille
    ? `<button class="btn dm" data-arm-suivant="1">\u{1F512} Armer la branche NSFW
         <span class="n">requis pour ${d.niveau_suivant}</span></button>`
    : btn('intensite', d.niveau_suivant ? 'Monter en ' + d.niveau_suivant : 'Monter d\'un cran',
          m.intensite, m.intensite ? '1 image' : 'niveau max');
  /* « Éditer » ne monte pas d'un cran : elle part de CETTE image, quel que soit
     son niveau, et ne regenere rien. C'est le geste « j'aime celle-ci, édite-la »,
     qui obligeait jusqu'ici a passer par un onglet a part — ou a decliner deux
     fois, avec une regeneration complete a chaque fois. */
  const boutonEdition = !d.edition_label ? ''
    : d.edition_verrouillee
      ? `<button class="btn dm" data-arm-edition="1">\u{1F512} Armer la branche NSFW
           <span class="n">requis pour éditer</span></button>`
      : btn('editer', 'Éditer en ' + d.edition_label, m.editer,
            m.editer ? 'cette image, sans régénérer' : 'image non éditable');
  // un seul champ d'instruction : les deux boutons qui editent le partagent
  const besoinInstr = (d.suivant_instruction && m.intensite) || m.editer;
  $('#declineCard').innerHTML = `
    <h3>Décliner</h3>
    <div class="src">${esc(d.scene || it.name)} · ${esc(it.score || '—')}${
      d.ton ? ' · ton ' + esc(d.ton) : ''}</div>
    ${btn('lumiere', 'Autre lumière', m.lumiere,
          m.lumiere ? m.lumiere + ' variante(s)' : 'aucune variante')}
    ${btn('seeds', 'Même scène, 3 autres tirages', m.seeds, '3 images')}
    ${boutonIntensite}
    ${boutonEdition}
    ${besoinInstr ? `<input id="dInstr"
        placeholder="instruction d'édition, en anglais — requise pour éditer"
        style="margin:-4px 0 10px">` : ''}
    ${(m.ton || []).length ? '<div class="lab">Autre ton</div><div class="chips">' +
      m.ton.map(t => `<button type="button" class="chip-t" data-t="${t.key}">${t.label}</button>`).join('') +
      '</div>' : ''}
    <div style="margin-top:18px;display:flex;align-items:center;gap:12px">
      <button class="link" id="dclose">fermer</button>
      <span class="tiny">même seed sauf pour les tirages</span></div>`;
  openDialog($('#declineBox'), {onDismiss: fermerDeclinaison});
  $('#dclose').onclick = fermerDeclinaison;
  $('#declineCard').querySelectorAll('.dm').forEach(b =>
    b.onclick = () => lancerDeclinaison(b.dataset.m));
  $('#declineCard').querySelectorAll('.chip-t').forEach(c =>
    c.onclick = () => lancerDeclinaison('ton', c.dataset.t));
  const armer = (el, niveau) => {
    if (!el) return;
    el.onclick = () => {
      const cible = niveau == null
        ? (creative()?.intensity || []).find(p => p.pipeline === 'flux+edit')
        : palier(niveau);
      fermerDeclinaison();
      if (cible) ouvrirArmement(cible);
    };
  };
  armer($('#declineCard').querySelector('[data-arm-suivant]'), d.intensite + 1);
  armer($('#declineCard').querySelector('[data-arm-edition]'), null);
}

const fermerDeclinaison = () => {
  closeDialog($('#declineBox')); DECLINE_SRC = null; DECLINE_DRY = null;
};

async function lancerDeclinaison(mode, ton){
  if (!DECLINE_SRC) return;
  const corps = {name: DECLINE_SRC.name, mode, n: 3};
  if (mode === 'editer'){
    // l'edition ne monte pas d'un cran : elle ne demande donc pas la
    // confirmation « hors export » d'un palier qu'on ne traverse pas. Le
    // serveur, lui, verifie l'armement et l'instruction (guard_intensity).
    corps.confirm_intensity = true;
    if (!String($('#dInstr')?.value || '').trim())
      return toast('écris l’instruction d’édition');
  }
  if (mode === 'intensite'){
    // meme confirmation que le curseur principal (setLevel, create.js) pour la
    // meme transition — ce chemin l'envoyait jusqu'ici sans condition, ce qui
    // sautait l'avertissement "hors export" des paliers requires:confirm
    if (DECLINE_DRY?.suivant_requires === 'confirm'){
      const ok = await confirmer({
        titre: `Passer en ${DECLINE_DRY.niveau_suivant} ?`,
        corps: `<p>Les images produites à ce niveau <b>ne partent pas dans
                l'export</b>.</p>`,
        bouton: `Passer en ${DECLINE_DRY.niveau_suivant}`});
      if (!ok) return;
    }
    corps.confirm_intensity = true;
  }
  if (ton) corps.tone = ton;
  const inst = $('#dInstr');
  if (inst) corps.edit_instruction = inst.value;
  const r = await post('/api/decline', corps);
  if (!r.ok) return toast(r.erreur || 'échec');
  fermerDeclinaison();
  toast(`${r.libelle} — ${r.total} image(s) en production`, 'voir',
        () => go('creer'));
  go('creer');
}

async function undo(){
  const r = await post('/api/undo');
  if (!r.ok) return toast(r.erreur || 'rien à annuler');
  toast('action annulée'); loadItems(); refreshCounts();
}
$('#btnUndo').onclick = undo;

document.addEventListener('keydown', e => {
  // #armBox / #declineBox sont des <dialog> natifs : Echap y est gere par le
  // navigateur (ui-dialog.js). #editorBox est un mode : sa sortie Echap vit
  // dans editor.js. Ne reste ici que la loupe, qui n'est pas un <dialog>.
  if (e.key === 'Escape' && $('#lightbox').style.display === 'flex'){
    $('#lightbox').style.display = 'none'; return;
  }
  if (/input|textarea/i.test(e.target.tagName)) return;
  // un <dialog> modal ouvert avale la page : ses raccourcis ne doivent pas
  // percoler jusqu'au tri (les curseurs de l'editeur non plus — body.editing)
  if ($('#armBox').open || $('#declineBox').open) return;
  if ($('#lightbox').style.display === 'flex') return;
  if (document.body.classList.contains('editing')) return;
  if (!$('#trier').classList.contains('on')) return;
  const k = e.key.toLowerCase();
  if (k === 'arrowright') step(1);
  else if (k === 'arrowleft') step(-1);
  // Entrée en grille = ouvrir la loupe sur la tuile visée (l'équivalent
  // clavier du clic sur la vignette). Pas quand le focus est sur un bouton :
  // sinon Entrée validerait/rejetterait ET ouvrirait la loupe.
  else if (k === 'enter' && VIEW === 'grille' && !e.target.closest('button, a')){
    VIEW = 'revue';
    $$('#viewSel button').forEach(x => x.classList.toggle('on', x.dataset.v === 'revue'));
    renderTriage();
  }
  else if (k === 'v') act('valider');
  else if (k === 'r') act('revoir');
  else if (k === 'x') act('rejeter');
  else if (k === 'a') act('archiver');
  else if (k === 'd') act('decliner');
  else if (k === 'c') poserFlag(CUR, 'ok');
  else if (k === 'i') poserFlag(CUR, 'ia');
  else if (k === 'u') undo();
});

