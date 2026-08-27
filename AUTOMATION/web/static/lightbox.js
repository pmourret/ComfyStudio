/* Vue plein cadre d'une image, fermee au clic. Extrait de core.js en J3 etape 2. */
import {$} from './dom.js';

export function openLight(src){
  $('#lightbox img').src = src;
  $('#lightbox').style.display = 'flex';
}

$('#lightbox').onclick = () => $('#lightbox').style.display = 'none';
