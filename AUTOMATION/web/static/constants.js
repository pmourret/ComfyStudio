/* Constantes partagees, figees. Extrait de core.js en J3 (modules ES). */

export const VERDICT_LABEL = {
  OK: 'validées', A_REVOIR: 'à revoir', REJET: 'rejetées',
  SANS_VISAGE: 'sans visage', ERREUR: 'en erreur',
};

/* Destinations qui ne sont PAS simplement « le nom de l'ecran ». Trois cles par
   entree, toutes optionnelles sauf `screen` :

     screen  l'ecran a allumer
     tab     l'onglet du chrome a marquer actif (defaut : le nom de la route)
     bucket  entree de tri — sa presence est ce qui declenche loadItems()
     vue     sous-vue de l'ecran (banque : « scenes » ou « poses »)

   "galerie" et "trier" pointent tous deux sur l'ecran #trier (bucket/vue deja
   filtrables sur place) : la difference n'est que le bucket d'entree, pour que
   Galerie ouvre directement sur les photos gardees (OK) en un clic depuis
   Creer, sans passer par la file de tri (A_REVOIR).

   "scenes/poses" est la sous-vue Poses de la banque, partageable comme les
   autres. Le SLASH est voulu : il dit « sous-vue de », pas « autre ecran » —
   et c'est nav.js, via cette table, qui le resout ; jamais un `#` construit a
   la main quelque part dans le code. */
export const ROUTES = {
  galerie:        {screen: 'trier',  tab: 'trier',  bucket: 'OK'},
  trier:          {screen: 'trier',  tab: 'trier',  bucket: 'A_REVOIR'},
  'scenes/poses': {screen: 'scenes', tab: 'scenes', vue: 'poses'},
};
