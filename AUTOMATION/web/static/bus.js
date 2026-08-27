/* Bus d'evenements interne, sur un EventTarget unique.

   Introduit en J3 pour que l'encapsulation par module (etape 2) remplace les
   appels croises directs : un module qui possede un etat emet quand il change,
   ceux que ca concerne s'abonnent — sans se connaitre, et sans variable
   partagee. */
const cible = new EventTarget();

export const on = (evt, fn) =>
  cible.addEventListener(evt, e => fn(e.detail));

export const emit = (evt, detail) =>
  cible.dispatchEvent(new CustomEvent(evt, {detail}));
