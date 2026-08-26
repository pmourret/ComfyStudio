/* Socle : raccourcis DOM, appels API, navigation, toasts.
   Extrait de index.html le 24/08/2026 — code inchange.
   Ordre de chargement significatif : voir index.html. */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
// r.json() seul plantait (rejet de promesse non gere) sur toute reponse dont le
// corps n'est pas du JSON — un 500 non intercepte cote serveur renvoie une page
// HTML, pas du JSON. Le repli donne au moins un objet exploitable par un toast.
const api = (u, o) => fetch(u, o).then(r => r.json().catch(
  () => ({ok:false, erreur:`réponse invalide du serveur (${r.status})`})));
const post = (u, b) => api(u, {method:'POST', headers:{'Content-Type':'application/json'},
                              body: JSON.stringify(b || {})});
/* Echappement de tout contenu injecte via innerHTML. Le contenu des scenes vient
   de l'utilisateur ET du modele local (composeur) : ni l'un ni l'autre n'est du
   HTML de confiance, et une simple apostrophe dans une tenue suffit a casser un
   attribut. */
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const mmss = s => s == null ? '' : (s < 90 ? Math.round(s) + ' s'
                : Math.round(s/60) + ' min');

let SC = null;                    // contenu de scenes.json + vignettes
let SEL = new Set();              // scenes selectionnees
let INTENT = null;                // intention choisie (bloc 1), '*' = toutes
let TONE = '';                    // ton choisi (bloc 2)
let CREATIVE = null;              // intentions / tons / echelle d'intensite
let LEVEL = 0;                    // niveau courant du curseur — jamais persiste :
                                  // on rouvre toujours l'app en SFW strict
const CONFIRMED = new Set();      // paliers confirmes pour cette session
let RUNNING = false;
let LASTBATCH = null;             // dernier batch_id deja pris en compte par tick()
let PLAN_OK = false;              // le dernier /api/plan connu a des jobs a lancer
let SC_DIRTY = false;             // scenes.json a des modifications non enregistrees

/* Bandeau permanent tant que scenes.json a des modifications en attente. Un toast
   ne suffit pas : il disparait, et la scene reste ensuite indistinguable d'une
   scene enregistree — jusqu'a ce que la production refuse de la voir. */
function majDirty(){
  const b = $('#dirtyBar');
  if (b) b.hidden = !SC_DIRTY;
}

/* Une reponse d'API n'a pas la forme attendue.

   `api()` ne leve jamais : sur un 500 (corps HTML) il rend {ok:false, erreur}.
   Les chargeurs prenaient donc cet objet pour une banque ou une taxonomie, et le
   premier acces a `.data.scenes` levait — silencieusement, puisque plus rien
   derriere ne tournait. L'ecran Creer se retrouvait sans intention, sans scene
   et sans curseur, sans un mot d'explication. Constate le 26/08/2026 : un
   tableau de bord laisse ouvert pendant une migration de `scenes.json` sert
   l'ancien code contre les nouvelles donnees, et repond 500 sur /api/scenes.

   D'ou : on VERIFIE la forme, et on le dit. */
let PANNES = {};
function signalerPanne(quoi, detail){
  if (detail) PANNES[quoi] = detail; else delete PANNES[quoi];
  const b = $('#panneBar');
  if (!b) return;
  const liste = Object.entries(PANNES);
  b.hidden = !liste.length;
  const t = $('#panneTxt');
  if (t) t.textContent = liste.length
    ? liste.map(([k, v]) => `${k} : ${v}`).join(' · ') +
      ' — si le serveur tourne depuis avant une modification du projet, relance run_web.bat'
    : '';
}
const erreurDe = r => !r || r.ok === false
  ? (r && r.erreur) || 'réponse inattendue du serveur' : null;
let ITEMS_SEQ = 0, NSFW_SEQ = 0;  // jetons anti-reponse-perimee (requetes qui se doublent)
let BUCKET = 'A_REVOIR', SPACE = 'lena', VIEW = 'grille', ITEMS = [], VITEMS = [], CUR = 0;
let SFILTER = 'tout';
let BANDES = {}, JUGES = 0;       // etalonnage du realisme, cote serveur
let REFS = {mesurees: 0, total: 0};
// Bandes de lecture du score, lues dans config.json (jamais en dur : le tri
// disque et l'affichage doivent parler du meme seuil).
let QC = {ok: 0.72, watch: 0.60, high: 0.75};
// Valeurs de reference des reglages de generation, lues dans config.json. Le
// panneau les affiche comme « mesure » et le bouton de remise a zero y revient.
// Jamais de valeur mesuree ecrite en dur dans le front : une seule source.
let PRESET_REF = {}, NSFW_REF = {};
let JROWS = [], JFILTER = '';
let PROPS = [];
// NSRC : images sources cochees au cran NSFW. NSRC_SIG : signature de la
// liste rendue, pour ne pas reconstruire la grille (donc recharger les
// vignettes) a chaque clic. NARMED : etat d'armement de la branche.
let NSRC = new Set(), NSRC_SIG = null, NARMED = false;
const VERDICT_LABEL = {OK:'validées', A_REVOIR:'à revoir', REJET:'rejetées',
                      SANS_VISAGE:'sans visage', ERREUR:'en erreur'};

/* --------------------------------------------------------------- navigation */
// "galerie" et "trier" pointent tous deux sur l'ecran #trier (bucket/vue deja
// filtrables sur place) : la difference n'est que le bucket d'entree, pour que
// Galerie ouvre directement sur les photos gardees (OK) en un clic depuis
// Creer, sans passer par la file de tri (A_REVOIR).
const ROUTES = {
  galerie: {screen: 'trier', bucket: 'OK'},
  trier:   {screen: 'trier', bucket: 'A_REVOIR'},
};
$$('.tabs button').forEach(b => b.onclick = () => go(b.dataset.s));
function go(name, skipHash){
  const route = ROUTES[name];
  const screen = route ? route.screen : name;
  if (!$('#' + screen)) name = 'creer';
  $('#advMenu').classList.remove('on');
  // les onglets Galerie/Revue retombent toujours sur l'espace SFW : ouvrir sur
  // du NSFW sans l'avoir choisi explicitement serait surprenant (ecran partage,
  // capture...) — la bascule NSFW dans l'ecran reste a un clic
  if (route){ BUCKET = route.bucket; SPACE = 'lena'; VIEW = 'grille'; syncTriageUi(); }
  $$('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.s === name));
  // les ecrans ouverts depuis le menu Avance n'ont pas d'onglet dans la barre
  // principale : sans ca, Créer/Revue restaient tous deux eteints et rien
  // n'indiquait plus quel ecran est actif
  $('#btnAdv').classList.toggle('on', ['scenes', 'journal', 'appli'].includes(name));
  $$('.screen').forEach(x => x.classList.toggle('on', x.id === (route ? route.screen : name)));
  if (!skipHash) location.hash = name;          // onglet partageable / bouton retour
  if (route) loadItems();
  if (name === 'journal') loadJournal();
  if (name === 'appli' && typeof majEtatComfy === 'function') majEtatComfy();
  // revenir sur Creer au cran NSFW : la grille de sources a pu vieillir
  if (name === 'creer' && typeof estEdition === 'function' && estEdition())
    nsfwTick();
}
/* Reflete BUCKET/SPACE sur les boutons du selecteur de l'ecran #trier et sur
   l'onglet Galerie/Revue correspondant — appelee a la fois depuis go() (clic
   sur un onglet) et depuis les selecteurs bucket/espace eux-memes (clic dans
   l'ecran), pour que les trois entrees restent synchronisees quel que soit le
   chemin pris. La mise en avant Galerie/Revue ne s'applique qu'en espace Léna :
   le NSFW n'a pas d'onglet propre, les deux tabs s'eteignent alors ensemble. */
function syncTriageUi(){
  $$('#bucketSel button').forEach(x => x.classList.toggle('on', x.dataset.b === BUCKET));
  $$('#spaceSel button').forEach(x => x.classList.toggle('on', x.dataset.sp === SPACE));
  const routeName = SPACE !== 'lena' ? null
    : BUCKET === 'OK' ? 'galerie' : BUCKET === 'A_REVOIR' ? 'trier' : null;
  $$('.tabs button[data-s="galerie"], .tabs button[data-s="trier"]').forEach(x =>
    x.classList.toggle('on', x.dataset.s === routeName));
}
window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'creer', true));

/* menu Avance — tout ce qui n'est plus dans le chemin par defaut */
$$('.advmenu button').forEach(b => b.onclick = () => go(b.dataset.s));
$('#btnAdv').onclick = e => {
  e.stopPropagation(); $('#advMenu').classList.toggle('on');
};
document.addEventListener('click', e => {
  if (!e.target.closest('.advwrap')) $('#advMenu').classList.remove('on');
  if (!e.target.closest('#gearPanel') && e.target.id !== 'btnGear')
    $('#gearPanel').classList.remove('on');
});

/* ------------------------------------------------------------------- toasts */
let toastTimer;
function toast(msg, actLabel, actFn){
  $('#toastTxt').textContent = msg;
  const a = $('#toastAct');
  a.style.display = actLabel ? '' : 'none';
  a.textContent = actLabel || '';
  a.onclick = () => { hideToast(); actFn && actFn(); };
  $('#toast').classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 4500);
}
const hideToast = () => $('#toast').classList.remove('on');

/* ------------------------------------------------------------ confirmation */
/* Confirmation maison, rendue en promesse. Remplace `confirm()` natif : tout le
   reste de l'interface (armement, declinaison) a ses propres modales, et une
   boite native ne sait afficher ni mise en forme ni consequence — or c'est
   precisement ce qu'un changement de palier doit expliquer. */
function confirmer({titre, corps, bouton = 'Confirmer'}){
  return new Promise(resolve => {
    const boite = $('#armBox'), carte = $('#armCard');
    const ancienClic = boite.onclick;      // review.js en pose un : on le rend
    carte.innerHTML = `<h3>${esc(titre)}</h3>${corps}
      <div style="margin-top:18px;display:flex;gap:12px;align-items:center">
        <button class="btn primary" id="cfOui">${esc(bouton)}</button>
        <button class="link" id="cfNon">annuler</button></div>`;
    boite.classList.add('on');
    const fin = v => {
      boite.classList.remove('on');
      boite.onclick = ancienClic;
      document.removeEventListener('keydown', auClavier);
      resolve(v);
    };
    const auClavier = e => {
      if (e.key === 'Escape') fin(false);
      else if (e.key === 'Enter') fin(true);
    };
    $('#cfOui').onclick = () => fin(true);
    $('#cfNon').onclick = () => fin(false);
    boite.onclick = e => { if (e.target.id === 'armBox') fin(false); };
    document.addEventListener('keydown', auClavier);
    $('#cfOui').focus();
  });
}

