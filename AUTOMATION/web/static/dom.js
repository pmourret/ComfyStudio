/* Raccourcis DOM et formatage — aucun etat.
   Extrait de core.js en J3 (bascule en modules ES). */
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];

/* Echappement de tout contenu injecte via innerHTML. Le contenu des scenes vient
   de l'utilisateur ET du modele local (composeur) : ni l'un ni l'autre n'est du
   HTML de confiance, et une simple apostrophe dans une tenue suffit a casser un
   attribut. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export const mmss = s => s == null ? '' : (s < 90 ? Math.round(s) + ' s'
                : Math.round(s / 60) + ' min');
