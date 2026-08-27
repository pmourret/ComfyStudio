/* Bandeaux d'etat en haut de l'ecran : panne de chargement, modifications non
   enregistrees. Extrait de core.js en J3 etape 2.

   Une reponse d'API n'a pas la forme attendue : `api()` ne leve jamais (sur un
   500 a corps HTML il rend {ok:false, erreur}), les chargeurs prenaient donc cet
   objet pour une banque ou une taxonomie, et le premier acces a `.data.scenes`
   levait — silencieusement. Constate le 26/08/2026 : un tableau de bord laisse
   ouvert pendant une migration de `scenes.json` sert l'ancien code contre les
   nouvelles donnees et repond 500. D'ou : on VERIFIE la forme, et on le dit. */
import {$} from './dom.js';
import {on} from './bus.js';
import {isDirty} from './scenes-store.js';

const PANNES = {};      // quoi -> detail ; prive au module

export function signalerPanne(quoi, detail){
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

/* Bandeau permanent tant que scenes.json a des modifications en attente. Un toast
   ne suffit pas : il disparait, et la scene reste ensuite indistinguable d'une
   scene enregistree — jusqu'a ce que la production refuse de la voir.
   Repeint des que scenes-store.js emet `scenes:dirty` (plus d'appel explicite
   depuis advanced.js). */
function majDirty(){
  const b = $('#dirtyBar');
  if (b) b.hidden = !isDirty();
}
on('scenes:dirty', majDirty);

$('#btnRecharger').onclick = () => location.reload();
