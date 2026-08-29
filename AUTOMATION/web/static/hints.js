/* Infobulles du studio (29/08/2026) — liste FERMEE.

   Ce qu'elles reparent : des controles dont le libelle nomme un reglage sans
   dire ce qu'il fait au lot qu'on prepare. « Rapide » ne disait pas ce qui est
   coupe, « Prompt » pas qu'il montre le texte REELLEMENT envoye, le dernier
   cran du curseur pas qu'il n'engendre rien.

   Ce qu'elles ne reparent pas, et n'ont pas a couvrir : ce qui est deja lisible
   a l'ecran. Pas de bulle sur les cinq onglets, sur « Générer », sur les cartes
   de scene, ni sur les lignes qui portent deja leur explication (#intMode,
   .ins-role). Une bulle qui repete la surface est du bruit, pas de l'aide.

   PRIMITIVE — un attribut, pas un branchement par element. `data-hint="<cle>"`
   dans le markup (statique ou rendu), et la delegation ci-dessous fait le
   reste : rien a re-brancher quand renderIntensity(), le wizard ou le rail
   reconstruisent leur DOM. `brancher()` reste disponible pour stamper depuis du
   JS, et retire `title` au passage — jamais les deux, la bulle native et la
   notre se superposeraient.

   `data-hint-text` est l'echappatoire des libelles PILOTES PAR LES DONNEES : le
   rail tire la raison d'un outil inerte de sa table `SURFACES`, elle n'a pas de
   cle fixe ici. Le texte y est litteral, la table reste pour tout le reste. */

/* Une phrase ≤ 14 mots, une seconde ≤ 10 si elle apprend quelque chose. */
export const HINTS = {
  // --- curseur d'intensite -------------------------------------------------
  // Les trois crans qui ENGENDRENT disent la meme chose : c'est le contraste
  // avec le quatrieme qui porte l'information, pas une nuance entre eux.
  'int.lv0': 'Génère des images nouvelles à ce niveau.',
  'int.lv1': 'Génère des images nouvelles à ce niveau.',
  'int.lv2': 'Génère des images nouvelles à ce niveau.',
  // le cran qui edite. Deux textes, parce que « générer avant d'éditer »
  // change reellement ce que le lancement fait — mentir ici serait pire que
  // se taire (meme regle que la pastille #intMode, §1 du handoff parcours)
  'int.lv3': "N'engendre rien : reprend une image déjà validée.",
  'int.lv3.avant': "Enchaîne une génération Soft puis l'édition.",

  // --- prereglages de rendu (barre de lancement) ---------------------------
  'qual.realisme': 'Pipeline mesuré (peau, grain). Pas le style du personnage.',
  'qual.rapide': 'Coupe la repasse de texture — plus vite, peau plus lisse.',
  'qual.brut': 'Minimum de post-traitement. La scène tient, le rendu se voit.',

  // --- actions de la barre de lancement ------------------------------------
  'btn.apercu': 'Texte réellement envoyé, pas seulement la scène.',
  'btn.gear': "Réglages de CETTE génération. L'onglet Application = serveur.",

  // --- sous-vues de la banque ----------------------------------------------
  'bank.scenes': "Textes de scènes et attribution d'une pose.",
  'bank.poses': "Fabrique un squelette. Pour l'imposer : sous-vue Scènes.",

  // --- Revue : espace et mode de lecture -----------------------------------
  'tri.sfw': 'Galerie de ce personnage, cet espace.',
  'tri.nsfw': 'Galerie de ce personnage, cet espace.',
  'tri.revue': 'Une image à la fois, clavier V/X/A.',
  'tri.grille': 'Toutes les vignettes, actions sous la carte.',

  // --- wizard : les deux axes geles ----------------------------------------
  'wiz.style': 'Figé à la création. Un autre choix = un autre personnage.',
  'wiz.monde': 'Figé à la création. Un autre choix = un autre personnage.',
};

const CIBLE = '[data-hint],[data-hint-text]';

let POP = null;      // une seule bulle pour tout le document
let ANCRE = null;    // l'element qu'elle decrit en ce moment

function bulle(){
  if (POP) return POP;
  POP = document.createElement('div');
  POP.id = 'hintPop';
  POP.setAttribute('role', 'tooltip');
  POP.hidden = true;
  document.body.append(POP);
  return POP;
}

const texteDe = el => HINTS[el.dataset.hint] || el.dataset.hintText || '';

/* Sous l'ancre, recentree dessus, et retournee AU-DESSUS si le bas manque.
   On mesure la bulle une fois posee mais non contrainte : sa largeur depend de
   son texte, la calculer d'avance demanderait de reimplementer le rendu. */
function placer(el){
  const p = bulle();
  p.style.left = '0px';
  p.style.top = '0px';
  const a = el.getBoundingClientRect(), b = p.getBoundingClientRect();
  const x = Math.max(8, Math.min(a.left + a.width / 2 - b.width / 2,
                                innerWidth - b.width - 8));
  let y = a.bottom + 8;
  if (y + b.height > innerHeight - 8) y = a.top - b.height - 8;   // flip
  p.style.left = Math.round(x) + 'px';
  p.style.top = Math.round(Math.max(8, y)) + 'px';
}

function montrer(el){
  const t = texteDe(el);
  if (!t || el === ANCRE) return;
  const p = bulle();
  p.textContent = t;
  p.hidden = false;
  placer(el);
  // la classe au cadre suivant : sans ca la transition part d'un element qui
  // vient d'apparaitre, et le fondu ne joue pas
  requestAnimationFrame(() => p.classList.add('on'));
  // aria-describedby et pas aria-label : la bulle COMPLETE le libelle du
  // bouton, elle ne le remplace pas — un lecteur d'ecran doit lire les deux
  el.setAttribute('aria-describedby', 'hintPop');
  ANCRE = el;
}

/* Sortie immediate, sans fondu : `hidden` sort la bulle de l'arbre
   d'accessibilite, ce qu'un simple `opacity:0` ne ferait pas. Un fondu de
   sortie demanderait de retarder `hidden`, donc de laisser 150 ms une bulle
   annoncee pour un element qu'on a quitte. */
function cacher(){
  if (!ANCRE) return;
  ANCRE.removeAttribute('aria-describedby');
  ANCRE = null;
  const p = bulle();
  p.classList.remove('on');
  p.hidden = true;
}

/* Stampe une cle sur un element depuis du JS. Retire `title` : la bulle native
   du navigateur et celle-ci se superposeraient, avec deux textes a maintenir. */
export function brancher(el, id){
  if (!el) return;
  if (HINTS[id]) el.dataset.hint = id;
  el.removeAttribute('title');
}

/* Delegation au document : une paire d'ecouteurs pour toute l'application, et
   surtout rien a re-brancher quand un ecran repeint ses controles. */
const ancreDe = e => (e.target instanceof Element ? e.target.closest(CIBLE) : null);

/* `quitte` : on ne ferme QUE si le pointeur (ou le focus) sort vraiment de
   l'ancre. Sans ce test, passer sur un enfant du bouton — le compteur d'un cran,
   le <b> d'une carte — declencherait mouseout puis mouseover, donc une bulle qui
   clignote sous un curseur immobile. */
const quitte = e => !ANCRE
  || !(e.relatedTarget instanceof Element)
  || !ANCRE.contains(e.relatedTarget);

document.addEventListener('mouseover', e => { const a = ancreDe(e); if (a) montrer(a); });
// `ANCRE &&` d'abord : un mouseout hors de toute ancre donne `ancreDe(e)` a null,
// et `null === ANCRE` est VRAI quand aucune bulle n'est ouverte — on entrait alors
// dans quitte() sans ancre a interroger. Le survol du fond levait l'erreur.
document.addEventListener('mouseout', e => {
  if (ANCRE && ancreDe(e) === ANCRE && quitte(e)) cacher();
});
// focusin / focusout remontent, contrairement a focus / blur : la delegation
// au document est possible, et le parcours au clavier ouvre les memes bulles
document.addEventListener('focusin', e => { const a = ancreDe(e); if (a) montrer(a); else cacher(); });
document.addEventListener('focusout', e => { if (ANCRE && quitte(e)) cacher(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') cacher(); });
// une bulle est positionnee en coordonnees de viewport : elle ne suit ni un
// defilement ni un redimensionnement, elle se ferme
addEventListener('scroll', cacher, true);
addEventListener('resize', cacher);
