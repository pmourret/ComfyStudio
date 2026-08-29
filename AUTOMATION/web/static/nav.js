/* Navigation entre ecrans et onglets du chrome. Extrait de core.js en J3
   etape 2.

   "galerie" et "trier" pointent tous deux sur l'ecran #trier (bucket/vue deja
   filtrables sur place) : la difference n'est que le bucket d'entree. Depuis
   le shell studio, seul "trier" (Revue) a un onglet ; "galerie" reste un hash
   partageable (#galerie -> bucket OK) et le lien "voir la galerie" de Creer. */
import {$, $$} from './dom.js';
import {ROUTES} from './constants.js';
import {loadItems, syncTriageUi, setTriageEntry} from './review.js';
import {loadJournal} from './advanced.js';
import {majEtatComfy} from './appli.js';
import {estEdition, nsfwTick} from './create.js';
import {loadRegistre} from './registre.js';
import {loadWizard} from './wizard.js';
import {closeIdMenu} from './character.js';

$$('.tabs button').forEach(b => b.onclick = () => go(b.dataset.s));

export function go(name, skipHash){
  const route = ROUTES[name];
  const screen = route ? route.screen : name;
  if (!$('#' + screen)) name = 'creer';
  closeIdMenu();
  // cliquer un onglet du chrome pendant une retouche photo quitte le mode
  // editeur proprement — sinon le marqueur body.editing resterait colle
  document.body.classList.remove('editing');
  // les onglets Galerie/Revue retombent toujours sur l'espace SFW : ouvrir sur
  // du NSFW sans l'avoir choisi explicitement serait surprenant (ecran partage,
  // capture...) — la bascule NSFW dans l'ecran reste a un clic
  if (route){ setTriageEntry(route.bucket); syncTriageUi(); }
  // le hash #galerie (bucket OK) partage l'ecran #trier : il allume Revue
  const tabName = name === 'galerie' ? 'trier' : name;
  $$('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.s === tabName));
  // #journal est un sous-ecran de Réglages : il n'a pas d'onglet propre, on
  // garde l'onglet Réglages allume pour ne pas laisser le chrome sans repere.
  // #wizard n'en a pas non plus (action transitoire du menu identité), assume.
  if (name === 'journal') $('.tabs button[data-s="appli"]').classList.add('on');
  $$('.screen').forEach(x => x.classList.toggle('on', x.id === (route ? route.screen : name)));
  if (!skipHash) location.hash = name;          // onglet partageable / bouton retour
  if (route) loadItems();
  if (name === 'registre') loadRegistre();
  if (name === 'wizard') loadWizard();
  if (name === 'journal') loadJournal();
  if (name === 'appli') majEtatComfy();
  // revenir sur Creer au cran NSFW : la grille de sources a pu vieillir
  if (name === 'creer' && estEdition())
    nsfwTick();
}

window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'creer', true));

/* Le menu identité (#idMenu) est cable par character.js — il possede la zone.
   Ici : fermeture au clic hors du bloc, et a Echap (overlay du chrome). */
document.addEventListener('click', e => {
  if (!e.target.closest('.idwrap')) closeIdMenu();
  if (!e.target.closest('#gearPanel') && e.target.id !== 'btnGear')
    $('#gearPanel').classList.remove('on');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeIdMenu(); });
