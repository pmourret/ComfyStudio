/* Socle : navigation, bandeau de panne, toasts, confirmation, lightbox.
   Bascule en modules ES le 27/08/2026 (J3 etape 1) — comportement inchange,
   l'etat autrefois global vit dans store.js le temps de l'etape 2. */
import {$, $$, esc} from './dom.js';
import {S} from './store.js';
import {ROUTES} from './constants.js';
import {loadItems} from './review.js';
import {loadJournal} from './advanced.js';
import {majEtatComfy} from './appli.js';
import {estEdition, nsfwTick} from './create.js';

/* ---------------------------------------------------------------- lightbox */
export function openLight(src){
  $('#lightbox img').src = src;
  $('#lightbox').style.display = 'flex';
}
$('#lightbox').onclick = () => $('#lightbox').style.display = 'none';

/* Bandeau permanent tant que scenes.json a des modifications en attente. Un toast
   ne suffit pas : il disparait, et la scene reste ensuite indistinguable d'une
   scene enregistree — jusqu'a ce que la production refuse de la voir. */
export function majDirty(){
  const b = $('#dirtyBar');
  if (b) b.hidden = !S.SC_DIRTY;
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
export function signalerPanne(quoi, detail){
  if (detail) S.PANNES[quoi] = detail; else delete S.PANNES[quoi];
  const b = $('#panneBar');
  if (!b) return;
  const liste = Object.entries(S.PANNES);
  b.hidden = !liste.length;
  const t = $('#panneTxt');
  if (t) t.textContent = liste.length
    ? liste.map(([k, v]) => `${k} : ${v}`).join(' · ') +
      ' — si le serveur tourne depuis avant une modification du projet, relance run_web.bat'
    : '';
}
$('#btnRecharger').onclick = () => location.reload();

/* --------------------------------------------------------------- navigation */
// "galerie" et "trier" pointent tous deux sur l'ecran #trier (bucket/vue deja
// filtrables sur place) : la difference n'est que le bucket d'entree, pour que
// Galerie ouvre directement sur les photos gardees (OK) en un clic depuis
// Creer, sans passer par la file de tri (A_REVOIR).
$$('.tabs button').forEach(b => b.onclick = () => go(b.dataset.s));
export function go(name, skipHash){
  const route = ROUTES[name];
  const screen = route ? route.screen : name;
  if (!$('#' + screen)) name = 'creer';
  $('#advMenu').classList.remove('on');
  // les onglets Galerie/Revue retombent toujours sur l'espace SFW : ouvrir sur
  // du NSFW sans l'avoir choisi explicitement serait surprenant (ecran partage,
  // capture...) — la bascule NSFW dans l'ecran reste a un clic
  if (route){ S.BUCKET = route.bucket; S.SPACE = 'lena'; S.VIEW = 'grille'; syncTriageUi(); }
  $$('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.s === name));
  // les ecrans ouverts depuis le menu Avance n'ont pas d'onglet dans la barre
  // principale : sans ca, Créer/Revue restaient tous deux eteints et rien
  // n'indiquait plus quel ecran est actif
  $('#btnAdv').classList.toggle('on', ['scenes', 'journal', 'appli'].includes(name));
  $$('.screen').forEach(x => x.classList.toggle('on', x.id === (route ? route.screen : name)));
  if (!skipHash) location.hash = name;          // onglet partageable / bouton retour
  if (route) loadItems();
  if (name === 'journal') loadJournal();
  if (name === 'appli') majEtatComfy();
  // revenir sur Creer au cran NSFW : la grille de sources a pu vieillir
  if (name === 'creer' && estEdition())
    nsfwTick();
}
/* Reflete BUCKET/SPACE sur les boutons du selecteur de l'ecran #trier et sur
   l'onglet Galerie/Revue correspondant — appelee a la fois depuis go() (clic
   sur un onglet) et depuis les selecteurs bucket/espace eux-memes (clic dans
   l'ecran), pour que les trois entrees restent synchronisees quel que soit le
   chemin pris. La mise en avant Galerie/Revue ne s'applique qu'en espace Léna :
   le NSFW n'a pas d'onglet propre, les deux tabs s'eteignent alors ensemble. */
export function syncTriageUi(){
  $$('#bucketSel button').forEach(x => x.classList.toggle('on', x.dataset.b === S.BUCKET));
  $$('#spaceSel button').forEach(x => x.classList.toggle('on', x.dataset.sp === S.SPACE));
  const routeName = S.SPACE !== 'lena' ? null
    : S.BUCKET === 'OK' ? 'galerie' : S.BUCKET === 'A_REVOIR' ? 'trier' : null;
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
export function toast(msg, actLabel, actFn){
  $('#toastTxt').textContent = msg;
  const a = $('#toastAct');
  a.style.display = actLabel ? '' : 'none';
  a.textContent = actLabel || '';
  a.onclick = () => { hideToast(); actFn && actFn(); };
  $('#toast').classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 4500);
}
export const hideToast = () => $('#toast').classList.remove('on');

/* ------------------------------------------------------------ confirmation */
/* Confirmation maison, rendue en promesse. Remplace `confirm()` natif : tout le
   reste de l'interface (armement, declinaison) a ses propres modales, et une
   boite native ne sait afficher ni mise en forme ni consequence — or c'est
   precisement ce qu'un changement de palier doit expliquer. */
export function confirmer({titre, corps, bouton = 'Confirmer'}){
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
