/* Etat du chrome du studio (29/08/2026) : navbar reduite, et mode focus.

   Deux reglages INDEPENDANTS, et c'est le point du module :
     - « reduire »  : une preference durable. On peut vouloir les icones en
                      permanence, sans etre en train de travailler.
     - « focus »    : un mode de travail. Il masque le bandeau et impose les
                      icones le temps qu'il dure, sans ecraser la preference —
                      en sortir rend la navbar telle qu'on l'avait laissee.
   Les melanger aurait fait qu'entrer puis sortir du focus deplierait une navbar
   qu'on avait volontairement reduite.

   Ni l'un ni l'autre ne touche a la NAVIGATION : `data-s`, les routes et les
   hash sont intacts. On ne change que ce que le chrome montre.

   Persistance : localStorage, par navigateur. Un reglage de confort perdu
   (fenetre privee, donnees effacees) doit rendre le chrome NORMAL, jamais un
   studio bloque en focus — d'ou la lecture defensive, et le focus qui n'est
   volontairement PAS retenu (voir plus bas). */
import {$} from './dom.js';

const CLE = 'studio.nav-mince';

/* localStorage leve dans plusieurs contextes reels (fenetre privee, cookies
   tiers bloques, capture de vignette) : jamais un reglage de confort ne doit
   empecher le studio de s'afficher. */
const lire = () => { try { return localStorage.getItem(CLE) === '1'; } catch { return false; } };
const ecrire = v => { try { localStorage.setItem(CLE, v ? '1' : '0'); } catch { /* tant pis */ } };

let MINCE = lire();
let FOCUS = false;

/* Les libelles de la navbar sont retires VISUELLEMENT en mode icones (ils
   restent le nom accessible du bouton) : a l'ecran, il ne reste que l'icone.
   C'est le seul moment ou une infobulle sur une destination apprend quelque
   chose — ailleurs le libelle est ecrit a cote, et UX-6 les excluait pour
   cette raison exacte. On les pose donc quand l'icone est seule, et on les
   retire des que le libelle revient. */
function majBullesNav(iconesSeules){
  document.querySelectorAll('.sidenav .tabs button, .sidenav .nav-chrome').forEach(b => {
    const lab = b.querySelector('.nav-lab');
    if (!lab) return;
    if (iconesSeules) b.dataset.hintText = lab.textContent.trim();
    else delete b.dataset.hintText;
  });
}

function appliquer(){
  const b = document.body;
  b.classList.toggle('nav-mince', MINCE);
  b.classList.toggle('focus', FOCUS);
  // sous 1100 px le CSS impose les icones sans passer par ces classes : la
  // bulle n'y serait pas posee. `matchMedia` lit la MEME borne que la feuille
  // de style plutot que de la redupliquer en dur dans une comparaison.
  const etroit = matchMedia('(max-width:1100px)').matches;
  majBullesNav(MINCE || FOCUS || etroit);

  const pli = $('#btnNavPli');
  if (pli){
    pli.setAttribute('aria-expanded', MINCE ? 'false' : 'true');
    $('#pliLab').textContent = MINCE ? 'Déplier' : 'Réduire';
  }
  const foc = $('#btnFocus');
  if (foc){
    foc.setAttribute('aria-pressed', FOCUS ? 'true' : 'false');
    $('#focusLab').textContent = FOCUS ? 'Quitter le focus' : 'Mode focus';
  }
}

export function basculerPli(){ MINCE = !MINCE; ecrire(MINCE); appliquer(); }

/* Le focus n'est PAS persiste, deliberement. Retrouver au chargement suivant
   une application dont le bandeau a disparu, sans se souvenir de l'avoir
   demande, se lit comme une panne et non comme un reglage. Il dure la session
   de travail, pas plus. */
export function basculerFocus(){ FOCUS = !FOCUS; appliquer(); }

$('#btnNavPli').onclick = basculerPli;
$('#btnFocus').onclick = basculerFocus;

/* « f » pour le focus. Meme garde que les raccourcis de tri (review.js) : on ne
   vole pas une frappe a un champ de saisie, ni a un mode qui a deja les siens.
   Echap n'est pas utilise : il ferme deja le menu d'identite, la loupe et
   l'editeur — un quatrieme sens rendrait la touche imprevisible. */
document.addEventListener('keydown', e => {
  if (e.key !== 'f' && e.key !== 'F') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable) return;
  if (document.body.classList.contains('editing')) return;
  if (document.querySelector('dialog[open]')) return;
  // Le menu d'identite vit DANS le header : entrer en focus le ferait
  // disparaitre au milieu d'une interaction, en le laissant ouvert dans le DOM.
  // La loupe, elle, recouvre l'ecran — basculer le chrome derriere son voile
  // n'aurait aucun sens visible. Dans les deux cas on ne fait rien : Echap
  // ferme d'abord, puis « f » retrouve son sens.
  if ($('#idMenu').classList.contains('on')) return;
  if ($('#lightbox').style.display === 'flex') return;
  e.preventDefault();
  basculerFocus();
});

// le mode icones peut arriver par la largeur seule : les bulles suivent
addEventListener('resize', appliquer);

appliquer();
