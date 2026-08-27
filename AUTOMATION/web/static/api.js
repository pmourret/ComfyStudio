/* Appels API et lecture tolerante des reponses — aucun etat.
   Extrait de core.js en J3 (bascule en modules ES). */
import {currentCharacter} from './character.js';

// Chaque appel /api/* porte ?character=<id> (J3 etape 4) — seul point de
// passage de la couche API JSON. /img et /static n'en ont pas besoin : ils
// sont construits en dur dans les templates, et leur chemin disque reste sur
// le personnage unique de V1 (J4 partitionnera PROD/ par personnage).
const avecPersonnage = u => {
  const sep = u.includes('?') ? '&' : '?';
  return `${u}${sep}character=${encodeURIComponent(currentCharacter())}`;
};

// r.json() seul plantait (rejet de promesse non gere) sur toute reponse dont le
// corps n'est pas du JSON — un 500 non intercepte cote serveur renvoie une page
// HTML, pas du JSON. Le repli donne au moins un objet exploitable par un toast.
export const api = (u, o) => fetch(avecPersonnage(u), o).then(r => r.json().catch(
  () => ({ok: false, erreur: `réponse invalide du serveur (${r.status})`})));

export const post = (u, b) => api(u, {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(b || {})});

/* Une reponse d'API n'a pas la forme attendue. `api()` ne leve jamais : sur un
   500 (corps HTML) il rend {ok:false, erreur}. Les chargeurs prenaient donc cet
   objet pour une banque ou une taxonomie, et le premier acces a `.data.scenes`
   levait — silencieusement. D'ou : on VERIFIE la forme, et on le dit. */
export const erreurDe = r => !r || r.ok === false
  ? (r && r.erreur) || 'réponse inattendue du serveur' : null;
