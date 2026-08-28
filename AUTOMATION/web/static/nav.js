/* Navigation entre ecrans, onglets, menu Avance. Extrait de core.js en J3
   etape 2.

   "galerie" et "trier" pointent tous deux sur l'ecran #trier (bucket/vue deja
   filtrables sur place) : la difference n'est que le bucket d'entree, pour que
   Galerie ouvre directement sur les photos gardees (OK) en un clic depuis
   Creer, sans passer par la file de tri (A_REVOIR). */
import {$, $$} from './dom.js';
import {ROUTES} from './constants.js';
import {loadItems, syncTriageUi, setTriageEntry} from './review.js';
import {loadJournal} from './advanced.js';
import {majEtatComfy} from './appli.js';
import {estEdition, nsfwTick} from './create.js';
import {loadRegistre} from './registre.js';
import {loadWizard} from './wizard.js';

$$('.tabs button').forEach(b => b.onclick = () => go(b.dataset.s));

export function go(name, skipHash){
  const route = ROUTES[name];
  const screen = route ? route.screen : name;
  if (!$('#' + screen)) name = 'creer';
  $('#advMenu').classList.remove('on');
  // les onglets Galerie/Revue retombent toujours sur l'espace SFW : ouvrir sur
  // du NSFW sans l'avoir choisi explicitement serait surprenant (ecran partage,
  // capture...) — la bascule NSFW dans l'ecran reste a un clic
  if (route){ setTriageEntry(route.bucket); syncTriageUi(); }
  $$('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.s === name));
  // les ecrans ouverts depuis le menu Avance n'ont pas d'onglet dans la barre
  // principale : sans ca, Créer/Revue restaient tous deux eteints et rien
  // n'indiquait plus quel ecran est actif
  $('#btnAdv').classList.toggle('on',
    ['registre', 'wizard', 'scenes', 'journal', 'appli'].includes(name));
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
