/* Toast : un message bref en bas d'ecran, avec une action optionnelle.
   Extrait de core.js en J3 etape 2. Aucun etat partage — le minuteur est
   prive au module. */
import {$} from './dom.js';

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

const hideToast = () => $('#toast').classList.remove('on');
