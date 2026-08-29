/* Confirmation maison, rendue en promesse. Remplace `confirm()` natif : tout le
   reste de l'interface (armement, declinaison) a ses propres modales, et une
   boite native ne sait afficher ni mise en forme ni consequence — or c'est
   precisement ce qu'un changement de palier doit expliquer.
   Extrait de core.js en J3 etape 2 ; branchee sur <dialog> natif (ui-dialog.js)
   en vague 2 : Echap et clic backdrop = annuler, focus rendu au declencheur. */
import {$, esc} from './dom.js';
import {openDialog, closeDialog} from './ui-dialog.js';

export function confirmer({titre, corps, bouton = 'Confirmer'}){
  return new Promise(resolve => {
    const boite = $('#armBox');
    $('#armCard').innerHTML = `<h3>${esc(titre)}</h3>${corps}
      <div style="margin-top:18px;display:flex;gap:12px;align-items:center">
        <button class="btn primary" id="cfOui">${esc(bouton)}</button>
        <button class="link" id="cfNon">annuler</button></div>`;
    let done = false;
    const fin = v => {
      if (done) return;
      done = true;
      boite.removeEventListener('keydown', surEntree);
      closeDialog(boite);
      resolve(v);
    };
    // <dialog> ne fait pas Entree = valider sans <form> : on le cable a la main,
    // sauf quand le focus porte deja une action (bouton / lien / champ multi-ligne)
    const surEntree = e => {
      if (e.key === 'Enter' && !e.target.closest('button,a,textarea')) fin(true);
    };
    $('#cfOui').onclick = () => fin(true);
    $('#cfNon').onclick = () => fin(false);
    boite.addEventListener('keydown', surEntree);
    openDialog(boite, {initialFocus: '#cfOui', onDismiss: () => fin(false)});
  });
}
