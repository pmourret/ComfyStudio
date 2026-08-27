/* Personnage courant, choisi par ?character= dans l'URL (J3 etape 4).

   V1 : simple rechargement — il n'y a qu'un personnage, donc pas de selecteur
   a l'ecran (le registre multi-personnage est J4). L'id est fige au chargement
   de la page ; changer de personnage = recharger avec un autre ?character=.
   api.js ajoute cet id a chaque appel /api/*. */
const CURRENT = new URLSearchParams(location.search).get('character') || 'lena';

export const currentCharacter = () => CURRENT;
