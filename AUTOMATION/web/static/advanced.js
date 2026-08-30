/* Tiroir Avance : banque de scenes, composeur, poses, journal.
   Bascule en modules ES le 27/08/2026 (J3). Depuis l'etape 2 : composeur et
   journal encapsules ici, la banque de scenes vit dans scenes-store.js, et on
   repeint sur les evenements `scenes:loaded` / `creative:loaded`. */
import {$, $$, esc} from './dom.js';
import {api, post, erreurDe, imgUrl} from './api.js';
import {on} from './bus.js';
import {toast} from './toast.js';
import {confirmer} from './modal.js';
import {creative} from './taxonomy.js';
import {scenes, setDirty, loadScenes} from './scenes-store.js';
import {renderScenes} from './create.js';
import {go} from './nav.js';

/* --- etat du tiroir, prive au module ------------------------------- */
let PROPS = [];              // propositions du composeur
let JROWS = [], JFILTER = '';   // journal de generation

/* --- reactions aux chargements (bus) ------------------------------- */
on('creative:loaded', remplirIntentionsComposeur);
on('scenes:loaded', ({ok, full}) => {
  if (!ok) return;
  if (full) renderSceneCards();
  renderPoses();
});

/* ============================================ SOUS-VUES DE LA BANQUE (29/08)
   Deux enveloppes qu'on montre ou masque — pas deux rendus. La grille de
   scenes, le composeur et l'atelier restent peints par renderSceneGrid() ; la
   banque de squelettes par renderPoses(). Rien ici ne repeint : basculer de vue
   ne doit pas couter un aller-retour serveur ni perdre une saisie en cours.

   La barre « Enregistrer scenes.json » reste visible sur les DEUX vues, et
   c'est voulu : elle enregistre le document de l'ecran, et une edition de scene
   laissee en attente sur l'autre vue doit garder son bouton — la masquer
   cacherait l'action pendant que #dirtyBar continue d'avertir. */
let VUE = 'scenes';          // sous-vue courante de la banque

export function setBankView(vue){
  const poses = vue === 'poses';
  const s = $('#bankScenes'), p = $('#bankPoses');
  if (!s || !p) return;
  VUE = poses ? 'poses' : 'scenes';
  /* Rouvrir la banque REFERME la fiche (F2.1). C'est la contrepartie du choix
     de ne pas mettre le sous-etat dans l'URL : puisque `#scenes` ne peut pas
     dire « j'edite telle scene », aucune navigation ne doit rendre autre chose
     que la grille — sinon la fiche serait un etat invisible qui survit a un
     aller-retour. La saisie n'est pas perdue pour autant : fermerFiche() la
     reprend dans le document en memoire, et #dirtyBar continue de le dire. */
  fermerFiche(true);
  s.hidden = poses;
  p.hidden = !poses;
  $$('#bankView button').forEach(b => {
    const actif = (b.dataset.vue === 'poses') === poses;
    b.classList.toggle('on', actif);
    b.setAttribute('aria-selected', actif ? 'true' : 'false');
  });
  majBarreBanque();
}

/* Ce que la barre d'enregistrement DIT enregistrer, selon l'etat de l'ecran.
   Meme bouton, meme handler, meme fichier : seul le libelle change.

   Sur Poses, « scenes.json » tout court laissait croire qu'on sauvegarde les
   squelettes. Ils sont deja sur le disque au moment ou la grille les montre
   (INPUTS/POSE/, ecrits par l'extraction) ; ce que cette vue fait entrer dans
   scenes.json, ce sont les ATTRIBUTIONS portees par les scenes. La cible disque
   n'a jamais menti — c'est le contexte qui manquait.

   Sur la fiche d'une scene (F2.1), c'est l'inverse qu'il faut dire : le bouton
   n'enregistre pas « cette scene » toute seule, il ecrit tout le document —
   qui la contient. Meme fichier, meme .bak, meme #dirtyBar qu'avant.

   Une table, pas un `if` a rallonge : une quatrieme entree, le jour venu. */
const BARRE_BANQUE = {
  scenes: ['scenes.json',
           'une sauvegarde .bak est faite à chaque enregistrement'],
  poses:  ['Scènes + attributions de pose',
           'Enregistre scenes.json — pas les squelettes (déjà sur le disque). ' +
           'Une .bak à chaque fois.'],
  fiche:  ['scenes.json',
           'Enregistre tout le document — la scène ouverte comprise. ' +
           'Une sauvegarde .bak à chaque fois.'],
};

/* `#scMsg` sert aussi de ligne d'etat a enregistrerScenes() (« enregistré ·
   sauvegarde .bak faite »). C'est voulu : le statut est transitoire, ce texte-ci
   est l'etat de repos, et seul un changement d'etat le repose. */
function majBarreBanque(){
  const cle = VUE === 'poses' ? 'poses' : (ficheOuverte() != null ? 'fiche' : 'scenes');
  const [titre, sous] = BARRE_BANQUE[cle];
  $('#scTitre').textContent = titre;
  $('#scMsg').textContent = sous;
}

/* Le clic passe par go() plutot que d'appeler setBankView : la sous-vue est une
   destination partageable (#scenes/poses), elle doit vivre dans l'URL. La
   FICHE, elle, n'y vit pas — et c'est justifie la ou elle est declaree. */
$$('#bankView button').forEach(b =>
  b.onclick = () => go(b.dataset.vue === 'poses' ? 'scenes/poses' : 'scenes'));

/* ==================================================================== SCENES */
/* Vocabulaire du parcours, pour le selecteur d'intention de la fiche. Une scene
   qui porte une cle absente de creative.json la GARDE : on l'ajoute a la liste
   plutot que de la faire disparaitre du selecteur — donc de la scene. */
export function optionsIntention(courant){
  const cles = (creative()?.intentions || []).map(i => [i.key, i.label]);
  if (courant && !cles.some(([k]) => k === courant)) cles.push([courant, courant]);
  return '<option value="">— aucune —</option>' + cles.map(([k, l]) =>
    `<option value="${esc(k)}"${k === courant ? ' selected' : ''}>${esc(l)}</option>`).join('');
}

/* Squelettes de INPUTS/POSE/, servis par /api/scenes (SC.poses). Une scene qui
   pointe vers un squelette absent (fichier deplace, renomme) le GARDE dans la
   liste plutot que de la faire disparaitre en silence — meme regle que
   optionsIntention pour une intention hors taxonomie. */
function optionsPose(courant){
  const noms = scenes()?.poses || [];
  const tous = courant && !noms.includes(courant) ? [...noms, courant] : noms;
  return '<option value="">— aucune —</option>' + tous.map(n =>
    `<option value="${esc(n)}"${n === courant ? ' selected' : ''}>${esc(n)}</option>`).join('');
}

/* wardrobe <-> texte, une tenue par ligne prefixee de son niveau :
     0: a beige knit sweater and jeans
     0: wide beige trousers and a simple white shirt
     1: a loose beige cardigan
   Un meme niveau peut porter PLUSIEURS tenues (mode_tenue_jour le fait) : le
   format rend donc indifferemment une chaine ou une liste, et l'aller-retour est
   fidele a la forme d'origine. Une tenue contient des virgules mais jamais de
   saut de ligne — c'est le saut de ligne qui separe, jamais la virgule. */
export function wardrobeVersTexte(w){
  const lignes = [];
  Object.keys(w || {}).sort().forEach(lv =>
    (Array.isArray(w[lv]) ? w[lv] : [w[lv]]).forEach(t => lignes.push(`${lv}: ${t}`)));
  return lignes.join('\n');
}
export function texteVersWardrobe(txt){
  const w = {};
  (txt || '').split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
    const m = l.match(/^(\d+)\s*:\s*(.+)$/);
    if (m) (w[m[1]] = w[m[1]] || []).push(m[2].trim());
  });
  Object.keys(w).forEach(k => { if (w[k].length === 1) w[k] = w[k][0]; });
  return w;
}
/* Une ligne de tenue sans niveau serait jetee en silence par texteVersWardrobe.
   On refuse l'enregistrement plutot que de perdre la tenue : c'est exactement le
   genre de perte discrete qui a coute la banque le 25/08/2026. */
export function tenuesInvalides(){
  const mauvaises = [];
  $$('#sceneCards .sceneCard').forEach(card => {
    const id = card.querySelector('[data-f="id"]').value.trim();
    (card.querySelector('[data-f="wardrobe"]').value || '').split('\n')
      .map(l => l.trim()).filter(Boolean)
      .forEach(l => { if (!/^\d+\s*:\s*.+$/.test(l)) mauvaises.push(`${id} → « ${l} »`); });
  });
  return mauvaises;
}
const messageTenues = m => 'tenue sans niveau — ' + m[0] +
  (m.length > 1 ? ` (+${m.length - 1} autre(s))` : '') +
  ' · préfixe chaque ligne par « 0: » ou « 1: »';

/* Bande d'une scene : minimum saisi, maximum DEDUIT des tenues declarees.
   Miroir de `lb.scene_band`. Le serveur reste la reference (scenes().meta), mais une
   scene ajoutee et pas encore enregistree n'y figure pas — d'ou ce calcul local,
   qui doit rester la copie exacte de la regle serveur. */
function bandeDe(s){
  const b = s.intensity;
  const lo = Array.isArray(b) ? (parseInt(b[0]) || 0)
           : (Number.isInteger(b) ? b : 0);
  const niv = Object.keys(s.wardrobe || {})
                    .filter(k => /^\d+$/.test(k)).map(Number);
  const hi = niv.length ? Math.max(...niv) : Math.max(lo, 1);
  return [lo, Math.max(lo, hi)];
}

/* ==================================== DEUX ETATS DE LA BANQUE (F2.1, 30/08/2026)
   La sous-vue Scenes montrait le composeur, la note de direction, l'ancre, les
   seize scenes DEPLIEES et le JSON brut sur une seule page : un dump de
   document, ou editer un champ demandait de faire defiler un ecran entier. Elle
   a maintenant deux etats qui s'excluent — la GRILLE (defaut) et la FICHE d'une
   scene. `FICHE` porte l'index de la scene ouverte, ou null.

   POURQUOI L'INDEX, ET PAS UN HASH. `#scenes/edit/<id>` etait l'autre forme
   possible, et ROUTES sait deja porter un suffixe (`#galerie/x.png`). Deux
   raisons de ne pas la prendre :

     1. le nom de la scene est un CHAMP de la fiche. L'URL nommerait donc une
        scene que l'utilisateur est peut-etre en train de renommer : il faudrait
        la reecrire a chaque frappe, ou la laisser mentir ;
     2. rien ne garantit qu'un `<id>` colle existe encore dans la banque ouverte
        — il faudrait un ecran d'erreur pour une adresse qu'on ne partage pas.

   La garantie qui remplace le hash est ailleurs, et c'est elle qui compte :
   TOUTE navigation qui rouvre la banque retombe sur la GRILLE (setBankView
   ci-dessus, appele par go() a chaque entree sur l'ecran). `#scenes` ne montre
   donc jamais autre chose que ce qu'il annonce, et la fiche n'est pas un etat
   invisible qui survit a un aller-retour. Le DOM le dit quand meme, pour qui
   inspecte ou teste : `#bankScenes[data-vue-scene="<id>"]`. */
let FICHE = null;
export const ficheOuverte = () => FICHE;

/* Un seul endroit decide ce qui est visible : les deux enveloppes, le marqueur
   du DOM et le libelle de la barre d'enregistrement. */
function majEtatBanque(){
  const box = $('#bankScenes');
  if (!box) return;
  const s = FICHE != null ? scenes()?.data?.scenes?.[FICHE] : null;
  if (s) box.dataset.vueScene = s.id; else delete box.dataset.vueScene;
  const g = $('#bankGrille'), f = $('#bankFiche');
  if (g) g.hidden = !!s;
  if (f) f.hidden = !s;
  majBarreBanque();
}

/* --- grille ---------------------------------------------------------------- */
/* Ce qu'une carte doit dire, et rien de plus : le titre, la vignette si une
   image existe, la pose liee ou son absence, le format. Le reste est dans la
   fiche — c'est tout l'objet de F2.1. */
function carteBanque(s, k){
  const prev = scenes().previews?.[s.id];
  const st = scenes().stats?.[s.id];
  return `<div class="bankcard" data-k="${k}">
    <div class="ph${prev ? '' : ' empty'}"${prev
      ? ` style="background-image:url('${esc(imgUrl({...prev, thumb: 1}))}')"` : ''}></div>
    <div class="info">
      <button type="button" class="ouvrir"><b>${esc(s.id)}</b></button>
      <span>${esc(s.format || '4:5')} · ${s.count || 1} img${
        (s.variants || []).length ? ' +' + s.variants.length + ' var.' : ''}</span>
      <span class="posetxt${s.pose ? ' liee' : ''}">${s.pose
        ? '⛓ pose · ' + esc(s.pose) : 'sans pose'}</span>
      <span class="tiny">${st ? `${st.n} produite${st.n > 1 ? 's' : ''}`
                              : 'jamais produite'}</span>
    </div>
    <button class="del" title="supprimer cette scène">×</button>
  </div>`;
}

export function renderSceneGrid(){
  $('#anchor').value = scenes().data.anchor || '';
  $('#direction').value = scenes().data.direction || '';
  const liste = scenes().data.scenes;
  $('#nScenes').textContent = liste.length + ' scènes';
  const g = $('#sceneBankGrid');
  if (g){
    g.innerHTML = liste.map(carteBanque).join('')
      || `<div class="empty" style="padding:24px">aucune scène —
          « + Nouvelle scène » pour en écrire une, « Proposer » pour en faire
          rédiger.</div>`;
    g.querySelectorAll('.ouvrir').forEach(b => b.onclick = () =>
      ouvrirFiche(+b.closest('.bankcard').dataset.k));
    /* La suppression vit sur la carte, pas dans la fiche : un seul geste, au
       seul endroit ou l'on voit ce qu'on perd a cote de ce qu'on garde. La
       grille n'est visible que fiche fermee, donc aucune saisie en cours ne
       peut etre effacee par le repeint qui suit. */
    g.querySelectorAll('.del').forEach(b => b.onclick = async () => {
      const k = +b.closest('.bankcard').dataset.k;
      const s = scenes().data.scenes[k];
      if (!s) return;
      const ok = await confirmer({titre: 'Supprimer cette scène ?',
        corps: `<p><code>${esc(s.id)}</code> quittera la banque au prochain
          enregistrement de <code>scenes.json</code>.</p>`,
        bouton: 'Supprimer'});
      if (!ok) return;
      scenes().data.scenes.splice(k, 1);
      setDirty(true);
      renderSceneGrid();
    });
  }
  $('#rawJson').value = JSON.stringify(scenes().data, null, 2);
}

/* --- fiche d'UNE scene ----------------------------------------------------- */
/* Ouvre la fiche de la scene d'index `k`. Rend false si une fiche deja ouverte
   refuse de partir (tenue sans niveau) — l'appelant n'a alors rien a defaire. */
export function ouvrirFiche(k){
  const liste = scenes()?.data?.scenes || [];
  if (!(k >= 0 && k < liste.length)) return false;
  if (!fermerFiche()) return false;
  FICHE = k;
  peindreFiche();
  majEtatBanque();
  const nom = $('#sceneCards').querySelector?.('[data-f="id"]');
  if (nom && nom.focus) nom.focus();
  return true;
}

/* Referme la fiche en REPRENANT la saisie dans le document en memoire.
   `force` : la navigation (setBankView) ne peut pas etre refusee — mais une
   tenue sans niveau serait jetee en silence par texteVersWardrobe, alors on
   prefere ne rien reprendre du tout et le dire. C'est la lecon du 25/08/2026 :
   une perte annoncee vaut mieux qu'une perte discrete. */
export function fermerFiche(force){
  if (FICHE == null) return true;
  const mauvaises = tenuesInvalides();
  if (mauvaises.length){
    const msg = messageTenues(mauvaises);
    if (!force){ $('#ficheMsg').textContent = msg; toast(msg); return false; }
    toast('modifications non reprises — ' + msg);
  } else {
    scenes().data.scenes = collectScenes();
  }
  FICHE = null;
  $('#ficheMsg').textContent = '';
  $('#sceneCards').innerHTML = '';
  renderSceneGrid();
  majEtatBanque();
  return true;
}

/* Peint l'editeur de la scene ouverte. L'ESSENTIEL est a plat — nom, intention,
   format, images, texte de scene, tenues, pose ; l'AVANCE est replie —
   variantes, niveau, guidance, tons, tags, et le JSON de CETTE scene seulement.

   `data-k` porte l'index dans scenes().data.scenes : c'est cette ancre qui
   permet a collectScenes de FUSIONNER au lieu de reconstruire (voir sa
   docstring). Le conteneur reste `#sceneCards`, au pluriel : la fiche n'en
   peint qu'une, mais rien dans la relecture ne suppose ce nombre. */
function peindreFiche(){
  const s = scenes().data.scenes[FICHE];
  const box = $('#sceneCards');
  box.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'sceneCard';
  el.dataset.k = FICHE;
  const band = bandeDe(s);
  el.innerHTML = `
    <div class="top">
      <label class="f" style="flex:1"><span>nom de la scène — sert d’identifiant
        et de préfixe de fichier</span>
        <input class="id" data-f="id" value="${esc(s.id)}"></label>
      <span class="tiny">${scenes().previews[s.id] ? 'déjà produite' : 'jamais produite'}</span>
    </div>
    <div class="rowf">
      <!-- la categorie a disparu le 26/08/2026 : c'etait un doublon de
           l'intention (14 scenes sur 16 identiques) qui servait AUSSI de
           dossier d'export — les 2 divergences rangeaient les fichiers
           ailleurs que sous l'intention affichee. -->
      <label class="f"><span>intention — sert aussi de dossier d’export</span>
        <select data-f="intention">${optionsIntention(s.intention || s.category)}</select></label>
      <label class="f"><span>format</span>
        <select data-f="format">${['4:5','2:3','9:16','1:1'].map(f =>
          `<option ${f === (s.format||'4:5') ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
      <label class="f"><span>images</span><input data-f="count" type="number" min="1" value="${s.count || 1}"></label>
    </div>
    <label class="f"><span>prompt de scène — décor, cadrage, lumière. Jamais le visage, jamais la tenue.</span>
      <textarea data-f="prompt">${esc(s.prompt || '')}</textarea></label>
    <label class="f" style="margin-top:10px"><span>tenues — une par ligne, préfixée de son niveau
      (<code>0: a linen shirt and jeans</code>) · <b>c’est le niveau le plus haut
      ici qui fixe jusqu’où la scène monte</b></span>
      <textarea data-f="wardrobe" spellcheck="false" style="min-height:52px">${esc(wardrobeVersTexte(s.wardrobe))}</textarea></label>
    <div class="rowf" style="margin-top:10px;align-items:flex-start">
      <label class="f"><span>pose imposée (option) — ControlNet, cran SFW
        uniquement<br><span class="tiny">A/B mesuré : 0 image sous la bande
        d'identité sur 15. Un squelette repose
        ou de profil peut ne pas être suivi, vérifier le résultat à l'œil.</span></span>
        <select data-f="pose">${optionsPose(s.pose)}</select></label>
      <div class="posePrev" ${s.pose ? '' : 'hidden'}>
        <img loading="lazy" ${s.pose ? `src="/img/pose?name=${encodeURIComponent(s.pose)}"` : ''}></div>
    </div>

    <details class="adv fadv">
      <summary>Avancé — variantes, niveau, tons, tags, JSON de cette scène</summary>
      <div class="rowf" style="margin-top:14px">
        <!-- un seul nombre : le maximum se DEDUIT des tenues declarees. Les deux
             champs disaient la meme chose, et la tenue faisait foi de toute
             facon (wardrobe_for prend la plus haute <= niveau). -->
        <label class="f"><span>niveau minimum — jusqu’à <b>${band[1]}</b>, déduit des tenues</span>
          <input data-f="band_lo" type="number" min="0" max="3" value="${band[0]}" style="width:88px"></label>
        <label class="f"><span>guidance (option)</span>
          <input data-f="guidance" type="number" step="0.1" value="${s.guidance ?? ''}" placeholder="défaut"></label>
        <label class="f"><span>tons affins — virgules</span>
          <input data-f="tones" value="${esc((s.tones || []).join(', '))}"
                 placeholder="${esc((creative()?.tones || []).map(t => t.key).join(', '))}"></label>
        <label class="f"><span>tags — virgules</span>
          <input data-f="tags" value="${esc((s.tags || []).join(', '))}"></label>
      </div>
      <label class="f"><span>variantes de lumière ou de saison (une par ligne) — jamais une tenue</span>
        <textarea data-f="variants" style="min-height:52px">${esc((s.variants || []).join('\n'))}</textarea></label>
      <label class="f" style="margin-top:14px"><span>JSON de <b>cette scène</b> —
        ce que l’enregistrement écrirait, champs avancés compris</span>
        <textarea class="fjson" spellcheck="false" style="min-height:200px"></textarea></label>
      <button class="btn sm fjson-go" type="button">Remplacer la scène par ce JSON</button>
    </details>`;
  el.querySelector('[data-f="pose"]').onchange = e => {
    const prev = el.querySelector('.posePrev');
    const n = e.target.value;
    prev.hidden = !n;
    prev.querySelector('img').src = n ? `/img/pose?name=${encodeURIComponent(n)}` : '';
  };
  /* Le JSON de la fiche se regenere a l'OUVERTURE du pli, depuis collectScenes()
     — donc depuis ce qui est tape, pas depuis ce qui a ete charge. Un JSON fige
     au peint aurait menti des la premiere frappe dans un champ au-dessus. */
  const pli = el.querySelector('details.fadv');
  if (pli) pli.ontoggle = () => { if (pli.open) majFicheJson(); };
  const appliquer = el.querySelector('.fjson-go');
  if (appliquer) appliquer.onclick = () => appliquerFicheJson();
  box.append(el);
}

function majFicheJson(){
  const ta = $('#sceneCards').querySelector?.('.fjson');
  if (!ta || FICHE == null) return;
  ta.value = JSON.stringify(collectScenes()[FICHE], null, 2);
}

/* Remplace CETTE scene, jamais le document. Le JSON brut de tout `scenes.json`
   reste dans l'atelier de la grille — deux portees, deux endroits. */
function appliquerFicheJson(){
  const ta = $('#sceneCards').querySelector?.('.fjson');
  if (!ta || FICHE == null) return;
  let o;
  try { o = JSON.parse(ta.value); }
  catch(e){ $('#ficheMsg').textContent = 'JSON invalide : ' + e.message; return; }
  if (!o || typeof o !== 'object' || Array.isArray(o)){
    $('#ficheMsg').textContent = 'JSON invalide : un objet de scène est attendu';
    return;
  }
  scenes().data.scenes[FICHE] = o;
  setDirty(true);
  peindreFiche();
  majEtatBanque();
  $('#ficheMsg').textContent = 'scène remplacée — pense à enregistrer';
  toast('scène remplacée — pense à enregistrer');
}

/* Repeint ce qui est a l'ecran, quel que soit l'etat. Point d'entree unique du
   bus (`scenes:loaded`) et de l'application du JSON brut : les appelants n'ont
   pas a savoir si une fiche est ouverte. */
export function renderSceneCards(){
  renderSceneGrid();
  if (FICHE != null){
    // la banque rechargee peut etre plus courte : une fiche qui pointerait dans
    // le vide se referme, elle ne peint pas une scene qui n'existe plus
    if (FICHE < scenes().data.scenes.length) peindreFiche();
    else { FICHE = null; $('#sceneCards').innerHTML = ''; }
  }
  majEtatBanque();
}

$('#btnFicheRetour').onclick = () => fermerFiche();

$('#btnAddScene').onclick = () => {
  if (!fermerFiche()) return;
  // une scene neuve nait avec la forme complete : sans bande ni tenue elle
  // n'existerait qu'au niveau 0 et le curseur d'intensite n'aurait pas prise
  scenes().data.scenes.push({id:'nouvelle_scene',
                       intention:'lifestyle', tags:[], tones:[],
                       intensity:0, format:'4:5', count:1, prompt:'',
                       wardrobe:{'0':'everyday clothing'}, variants:[]});
  setDirty(true);
  renderSceneGrid();
  ouvrirFiche(scenes().data.scenes.length - 1);
};
// n'importe quelle frappe dans la fiche (prompt, nom, variantes...) compte
// comme une modification non enregistree — sinon seuls l'ajout et le JSON brut
// etaient proteges, pas l'edition d'une scene existante
$('#sceneCards').addEventListener('input', e => {
  setDirty(true);
  // le marqueur du DOM porte le nom de la scene ouverte : renommer dans la
  // fiche doit le suivre, sinon il designerait une scene qui n'existe plus
  if (e.target.dataset.f === 'id')
    $('#bankScenes').dataset.vueScene = e.target.value;
  // le plafond affiche est deduit des tenues : le tenir a jour a la frappe,
  // sans repeindre la carte (ce qui ferait perdre le curseur de saisie)
  if (e.target.dataset.f === 'wardrobe'){
    const carte = e.target.closest('.sceneCard');
    const b = bandeDe({intensity: parseInt(carte.querySelector('[data-f="band_lo"]').value) || 0,
                       wardrobe: texteVersWardrobe(e.target.value)});
    const lbl = carte.querySelector('[data-f="band_lo"]').closest('.f').querySelector('span b');
    if (lbl) lbl.textContent = b[1];
  }
});
/* Rassemble les cartes peintes en scenes, par FUSION sur l'objet d'origine —
   jamais par reconstruction, et jamais sur une scene qui n'est PAS peinte.

   Le 25/08/2026, cette fonction rebatissait chaque scene a partir des seuls
   champs affiches par sa carte. Tout ce que la carte ne montrait pas etait donc
   efface a l'enregistrement : `wardrobe`, `intensity`, `tags`, `tones` et
   `intention` ont disparu des 16 scenes de la banque en une sauvegarde, et le
   bouton « Ajouter et enregistrer » du composeur declenchait precisement cette
   sauvegarde-la, juste apres que compose.clean() ait produit ces metadonnees.

   Depuis F2.1 (30/08/2026) une seule scene est peinte a la fois : la fonction
   part donc du DOCUMENT et n'y superpose que les cartes presentes dans le DOM.
   Une scene fermee traverse intacte, sans meme passer par le formatage — c'est
   la meme garantie qu'avant, rendue plus forte par la fiche. Rien ici ne
   suppose qu'il y ait exactement une carte : c'est la fiche qui n'en peint
   qu'une, pas la relecture qui l'exige.

   Regle inchangee : toute cle que la carte n'affiche pas doit traverser
   l'enregistrement intacte. Ajouter un champ a la fiche, c'est ajouter une
   ligne `pose(...)` ici, pas remplacer l'objet. */
export function collectScenes(){
  const out = scenes().data.scenes.map(s => ({...s}));
  $$('#sceneCards .sceneCard').forEach(card => {
    const k = +card.dataset.k;
    if (!(k >= 0 && k < out.length)) return;
    const g = f => (card.querySelector(`[data-f="${f}"]`)?.value ?? '').trim();
    // les tons et les tags sont des cles : la virgule separe. Une variante ou
    // une tenue contient des virgules : seul le saut de ligne separe.
    const cles   = t => t.split(',').map(x => x.trim()).filter(Boolean);
    const lignes = t => t.split('\n').map(x => x.trim()).filter(Boolean);

    const s = out[k];                                       // <- la fusion
    s.id = g('id'); s.format = g('format');
    s.count = parseInt(g('count')) || 1; s.prompt = g('prompt');

    // un champ optionnel est POSE ou RETIRE : sans le retrait, on ne pourrait
    // plus vider une valeur depuis l'interface une fois qu'elle existe
    const vide = v => v == null || v === ''
      || (Array.isArray(v) && !v.length)
      || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
    const pose = (cle, v) => { if (vide(v)) delete s[cle]; else s[cle] = v; };

    pose('intention', g('intention'));
    pose('guidance', g('guidance') ? parseFloat(g('guidance')) : null);
    pose('tones', cles(g('tones')));
    pose('tags', cles(g('tags')));
    pose('wardrobe', texteVersWardrobe(g('wardrobe')));
    pose('variants', lignes(g('variants')));
    const lo = parseInt(g('band_lo'));
    // le maximum se deduit des tenues : on n'ecrit plus que le minimum
    pose('intensity', Number.isInteger(lo) ? Math.max(0, lo) : null);
    // squelette impose (ControlNet) : nom de fichier de INPUTS/POSE/, ou rien
    pose('pose', g('pose'));
    // `category` etait un doublon de l'intention qui servait de dossier
    // d'export : editer une scene retire la cle morte, l'intention l'ayant
    // deja reprise (voir optionsIntention, qui la pre-selectionne)
    delete s.category;
  });
  return out;
}
async function enregistrerScenes(){
  const mauvaises = tenuesInvalides();
  if (mauvaises.length){
    const msg = messageTenues(mauvaises);
    $('#scMsg').textContent = msg;
    $('#ficheMsg').textContent = msg;
    return {ok: false, erreur: msg};
  }
  scenes().data.anchor = $('#anchor').value.trim();
  scenes().data.direction = $('#direction').value.trim();
  scenes().data.scenes = collectScenes();
  const r = await post('/api/scenes', {data: scenes().data});
  $('#scMsg').textContent = r.ok ? 'enregistré · sauvegarde .bak faite' : r.erreur;
  if (r.ok){ setDirty(false); await loadScenes(); }
  return r;
}
$('#btnSaveScenes').onclick = async () => {
  const r = await enregistrerScenes();
  if (r.ok) toast('scenes.json enregistré');
};
$('#btnDirtySave').onclick = async () => {
  const r = await enregistrerScenes();
  toast(r.ok ? 'scenes.json enregistré' : (r.erreur || 'échec de l’enregistrement'));
};
$('#btnRawApply').onclick = () => {
  try { scenes().data = JSON.parse($('#rawJson').value); setDirty(true);
        // le document a change SOUS la fiche : son index ne designe plus rien
        // de sur, on repart de la grille plutot que de peindre au hasard
        FICHE = null; $('#sceneCards').innerHTML = '';
        renderSceneCards(); renderScenes();
        toast('JSON appliqué — pense à enregistrer'); }
  catch(e){ toast('JSON invalide : ' + e.message); }
};

/* ================================================================= COMPOSEUR
   INCHANGE dans sa mecanique (30/08/2026) : meme route /api/compose, meme
   #btnCompose, meme rendu de propositions, meme « Ajouter » qui enregistre. Le
   modele n'ecrit JAMAIS scenes.json tout seul — le clic reste obligatoire.

   Ce qui a change est la PORTE. Le composeur etait le premier ecran de la
   banque : on tombait sur un champ de redaction avant d'avoir vu ce qu'on
   possedait deja. C'est maintenant un geste de la grille (#btnProposer), replie
   par defaut, et les propositions se posent en tete de grille — une proposition
   et une scene de la banque se lisent au meme endroit. */
export function remplirIntentionsComposeur(){
  const sel = $('#cmpCat');
  if (!sel || !creative()) return;
  sel.innerHTML = '<option value="">— le modèle choisit —</option>' +
    (creative().intentions || []).map(i => `<option value="${i.key}">${i.label}</option>`).join('');
}

function afficherComposeur(ouvert){
  const box = $('#composeur'), b = $('#btnProposer');
  if (!box || !b) return;
  box.hidden = !ouvert;
  b.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
  b.classList.toggle('primary', ouvert);
}
$('#btnProposer').onclick = () => {
  const ouvrir = $('#composeur').hidden;
  afficherComposeur(ouvrir);
  if (ouvrir) $('#intention').focus();
};
/* create.js emmene ici depuis la carte « + créer une scène » de l'ecran
   Produire. Par le BUS : advanced.js importe deja create.js (renderScenes), lui
   faire importer advanced en retour fermerait un cycle entre les deux fichiers. */
on('bank:composer', d => {
  fermerFiche(true);
  afficherComposeur(true);
  const sel = $('#cmpCat');
  if (sel && d && d.key && d.key !== '*') sel.value = d.key;
  $('#intention').focus();
  $('#intention').scrollIntoView({behavior: 'smooth', block: 'center'});
});

$('#btnCompose').onclick = async () => {
  const intention = $('#intention').value.trim();
  if (!intention) return toast('décris d’abord ce que tu veux');
  $('#btnCompose').disabled = true;
  $('#cmpMsg').textContent = 'le modèle rédige… (~20 s)';
  // `intention` = le texte libre en francais ; `intention_cible` = la cle imposee
  // Le modele local passe par ComfyUI : hors ligne, `fetch` peut REJETER, et un
  // rejet non intercepte ne serait qu'une ligne de console. Le contrat frontend
  // veut une erreur A L'ECRAN — et #cmpMsg la garde, contrairement au toast.
  let r;
  try { r = await post('/api/compose', {intention, count: $('#cmpN').value,
                                        intention_cible: $('#cmpCat').value}); }
  catch(e){ r = {ok: false, erreur: 'serveur injoignable — ' + (e?.message || e)}; }
  $('#btnCompose').disabled = false;
  if (!r.ok){
    const m = r.erreur || 'échec — le modèle local n’a rien rendu';
    $('#cmpMsg').textContent = m;
    return toast(m);
  }
  PROPS = r.scenes;
  $('#cmpMsg').textContent = PROPS.length + ' proposition(s)';
  renderProps();
};

function renderProps(){
  $('#props').innerHTML = PROPS.map((s, k) => `
    <div class="prop">
      <div class="h"><b>${esc(s.id)}</b>
        <span class="tiny">${esc(s.intention || s.category)} · ${esc(s.format)} · ${s.count} img
          · niveaux ${(s.intensity||[0,1]).join('-')}</span>
        <div class="spacer" style="flex:1"></div>
        <button class="btn sm" data-add="${k}">Ajouter et enregistrer</button>
        <button class="link" data-drop="${k}">ignorer</button></div>
      <div class="v" style="margin-bottom:6px">
        ${(s.tags||[]).map(t => `<span class="kbd">${esc(t)}</span>`).join(' ')}
        ${(s.tones||[]).length ? ' · va bien en ' + esc(s.tones.join(', ')) : ''}</div>
      ${Object.entries(s.wardrobe || {}).map(([lv, w]) =>
        `<div class="v">tenue n${esc(lv)} · ${esc(w)}</div>`).join('')}
      ${(s.alertes||[]).length ? `<div class="v" style="color:var(--warn);margin-top:6px">
        ⚠ à relire — ${esc(s.alertes.join(' · '))}</div>` : ''}
      <p class="p">${esc(s.prompt)}</p>
      ${s.variants.length ? '<div class="v">variantes · ' + esc(s.variants.join(' | ')) + '</div>' : ''}
    </div>`).join('');
  $('#props').querySelectorAll('[data-add]').forEach(b => b.onclick = async () => {
    const sc = PROPS[+b.dataset.add];
    scenes().data.scenes.push(sc); setDirty(true); PROPS.splice(+b.dataset.add, 1);
    renderProps(); renderSceneGrid();
    // la proposition est devenue une CARTE : on l'amene sous les yeux plutot que
    // de laisser croire qu'il ne s'est rien passe
    $('#sceneBankGrid').lastElementChild?.scrollIntoView({behavior:'smooth', block:'center'});
    // on enregistre TOUT DE SUITE : une scene qui n'existe que dans la page est
    // invisible pour la production et perdue au rechargement. L'ancien parcours
    // en deux temps ne se signalait que par un toast passager.
    b.disabled = true;
    const r = await enregistrerScenes();
    toast(r.ok ? `${sc.id} enregistrée dans scenes.json`
               : `${sc.id} ajoutée mais NON enregistrée — ${r.erreur || 'échec'}`);
  });
  $('#props').querySelectorAll('[data-drop]').forEach(b => b.onclick = () => {
    PROPS.splice(+b.dataset.drop, 1); renderProps(); });
}

/* ====================================================================== NSFW
   L'onglet parallele a disparu le 26/08/2026 : la grille de sources, le champ
   d'instruction et le lancement vivent desormais sur le cran NSFW du curseur
   (create.js). Il n'en reste rien ici — c'etait le doublon, pas la reference.
   Mesure qui a motive le retrait : 21 batches NSFW pour 3 champs d'instruction
   independants, dont aucun ne retenait ce qui avait ete tape la fois d'avant. */

/* ============================================================= POSES (26/08/2026)
   Banque de squelettes OpenPose (INPUTS/POSE/), consommee par le selecteur de
   pose des cartes de scene. Seul endroit du tableau de bord ou une photo REELLE
   peut transiter — jamais conservee : voir AUTOMATION/pose_tools.py, qui la
   retire de ComfyUI/input a la fin de l'extraction, succes ou echec. */
export function renderPoses(){
  const noms = scenes()?.poses || [];
  const g = $('#poseGrid');
  if (!g) return;
  $('#nPoses').textContent = noms.length ? `— ${noms.length}` : '';
  g.innerHTML = noms.map(n => `
    <div class="posecard" data-n="${esc(n)}">
      <img loading="lazy" src="/img/pose?name=${encodeURIComponent(n)}">
      <button class="del" title="retirer de la banque">×</button>
    </div>`).join('')
    || '<div class="empty" style="padding:24px">aucun squelette pour l’instant</div>';
  g.querySelectorAll('.del').forEach(b => b.onclick = async () => {
    const nom = b.closest('.posecard').dataset.n;
    const ok = await confirmer({titre: 'Retirer ce squelette ?',
      corps: `<p>Une scène qui le référence encore le perdra au prochain
        enregistrement — <code>${esc(nom)}</code> deviendra introuvable, ce
        que la validation signalera.</p>`,
      bouton: 'Retirer'});
    if (!ok) return;
    const r = await post('/api/pose/delete', {name: nom});
    if (!r.ok) return toast(r.erreur || 'échec');
    toast('squelette retiré');
    await loadScenes(true);
  });
}

const fileToBase64 = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result.split(',')[1]);   // retire "data:...;base64,"
  r.onerror = reject;
  r.readAsDataURL(file);
});

$('#poseFile')?.addEventListener('change', () => {
  const f = $('#poseFile').files[0];
  $('#poseFileName').textContent = f ? f.name : '';
  $('#btnPoseExtract').disabled = !f;
});
$('#btnPoseExtract')?.addEventListener('click', async () => {
  const f = $('#poseFile').files[0];
  if (!f) return;
  $('#btnPoseExtract').disabled = true;
  $('#poseMsg').textContent = 'extraction en cours… (~20 s)';
  try {
    const data_base64 = await fileToBase64(f);
    const r = await post('/api/pose/extract', {filename: f.name, data_base64});
    if (!r.ok){ $('#poseMsg').textContent = ''; toast(r.erreur || 'échec'); return; }
    $('#poseMsg').textContent = '';
    $('#poseFile').value = ''; $('#poseFileName').textContent = '';
    toast(`squelette extrait : ${r.name}`);
    await loadScenes(true);
  } finally {
    $('#btnPoseExtract').disabled = !$('#poseFile').files.length;
  }
});

/* =================================================================== JOURNAL */
$$('#jFilter button').forEach(b => b.onclick = () => {
  $$('#jFilter button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); JFILTER = b.dataset.f; drawJournal();
});
export async function loadJournal(){
  const d = await api('/api/journal');
  // reponse malformee : sans garde, `.rows` undefined -> drawJournal() leve
  // (JROWS.filter) et le journal reste vide sans un mot
  const err = erreurDe(d) || (Array.isArray(d.rows) ? null : 'réponse illisible du serveur');
  if (err){ $('#jInfo').textContent = 'journal : ' + err; return; }
  JROWS = d.rows;
  drawJournal();
}
function drawJournal(){
  const rows = JROWS.filter(r => !JFILTER || r.verdict === JFILTER);
  $('#jInfo').textContent = rows.length + ' ligne(s)';
  $('#jt tbody').innerHTML = rows.map(r => `<tr>
    <td>${(r.date||'').replace('T',' ').slice(5,16)}</td>
    <td>${esc(r.scene||'')}${r.variante ? ' <span class="tiny">('+esc(r.variante.slice(0,28))+')</span>' : ''}</td>
    <td>${esc(r.format||'')}</td><td class="num">${esc(r.seed||'')}</td>
    <td class="num">${esc(r.score_identite||'')}</td><td>${esc(r.verdict||'')}</td>
    <td class="num">${r.duree_s ? r.duree_s + ' s' : ''}</td></tr>`).join('')
    || '<tr><td colspan="7" class="empty">aucune ligne</td></tr>';
}

