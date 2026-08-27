/* Confirmation maison, rendue en promesse. Remplace `confirm()` natif : tout le
   reste de l'interface (armement, declinaison) a ses propres modales, et une
   boite native ne sait afficher ni mise en forme ni consequence — or c'est
   precisement ce qu'un changement de palier doit expliquer.
   Extrait de core.js en J3 etape 2. */
import {$, esc} from './dom.js';

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
