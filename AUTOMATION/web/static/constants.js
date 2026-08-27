/* Constantes partagees, figees. Extrait de core.js en J3 (modules ES). */

export const VERDICT_LABEL = {
  OK: 'validées', A_REVOIR: 'à revoir', REJET: 'rejetées',
  SANS_VISAGE: 'sans visage', ERREUR: 'en erreur',
};

/* "galerie" et "trier" pointent tous deux sur l'ecran #trier (bucket/vue deja
   filtrables sur place) : la difference n'est que le bucket d'entree, pour que
   Galerie ouvre directement sur les photos gardees (OK) en un clic depuis
   Creer, sans passer par la file de tri (A_REVOIR). */
export const ROUTES = {
  galerie: {screen: 'trier', bucket: 'OK'},
  trier:   {screen: 'trier', bucket: 'A_REVOIR'},
};
