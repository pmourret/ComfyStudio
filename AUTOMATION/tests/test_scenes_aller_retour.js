/* Aller-retour de la banque de scenes : peindre les cartes, relire les cartes,
   et exiger que rien n'ait bouge.

   POURQUOI CE TEST EXISTE. Le 25/08/2026, collectScenes() reconstruisait chaque
   scene a partir des seuls champs affiches par sa carte. Tout ce que la carte ne
   montrait pas etait donc efface a l'enregistrement : `wardrobe`, `intensity`,
   `tags`, `tones` et `intention` ont disparu des 16 scenes de la banque en une
   sauvegarde. Le cran « Suggestif » est tombe a zero scene et le curseur
   d'intensite a cesse de changer la tenue, sans qu'aucun test ne le dise.

   Le test charge le VRAI advanced.js et la VRAIE banque, peint les cartes, reparse
   le HTML produit pour en refaire des champs de formulaire, puis rappelle
   collectScenes(). Aucun champ n'est simule : ce qui n'est pas peint ne revient
   pas, et le test echoue. */
const fs = require('fs');
const path = require('path');

const OFM = path.resolve(__dirname, '..', '..');
const lire = p => fs.readFileSync(path.join(OFM, p), 'utf8');
const scenes = JSON.parse(lire('AUTOMATION/scenes.json'));
const creative = JSON.parse(lire('AUTOMATION/creative.json'));

let ko = 0;
const dire = (ok, txt) => { console.log(`  ${ok ? 'ok  ' : 'KO  '}${txt}`); if (!ok) ko++; };

/* ---------------------------------------------------------------- DOM stub */
const NOEUDS = new Map();
const faire = id => {
  const n = {id, value: '', textContent: '', innerHTML: '', hidden: false,
             dataset: {}, style: {}, enfants: [],
             classList: {add(){}, remove(){}, toggle(){}, contains(){ return false; }},
             addEventListener(){}, querySelectorAll(){ return []; },
             querySelector(){ return {}; },
             append(el){ this.enfants.push(el); },
             scrollIntoView(){}};
  NOEUDS.set(id, n);
  return n;
};
const SEL_ID = s => s.startsWith('#') ? s.slice(1).split(' ')[0] : s;
global.$ = s => {
  if (s.includes(' ')) return null;
  const id = SEL_ID(s);
  return NOEUDS.get(id) || faire(id);
};
global.$$ = () => [];
global.document = {createElement: () => ({
  className: '', innerHTML: '', dataset: {},
  querySelector(){ return {}; },
})};
global.SC_DIRTY = false;
global.majDirty = () => {};
global.post = async () => ({ok: true});
global.toast = () => {};
global.loadScenes = async () => {};
global.renderScenes = () => {};
global.renderIntentions = () => {};
global.renderTones = () => {};
global.loadCreative = async () => {};
global.nsfwTick = () => {};
global.openLight = () => {};
global.badge = () => '';
global.palier = () => null;
global.api = async () => ({rows: []});
global.NSRC = new Set();
global.VERDICT_LABEL = {};
global.PROPS = [];

// esc() vient de core.js : le test doit utiliser l'implementation reelle, pas
// une copie qui pourrait diverger
const coreSrc = lire('AUTOMATION/web/static/core.js');
const escSrc = coreSrc.match(/const esc = [\s\S]*?\}\[c\]\)\);/);
if (!escSrc) { console.log('  KO  esc() introuvable dans core.js'); process.exit(1); }
eval(escSrc[0] + '\nglobal.esc = esc;');

const src = lire('AUTOMATION/web/static/advanced.js');
try { eval(src); }
catch (e) { console.log('  ECHEC au chargement : ' + e.message); process.exit(1); }

global.CREATIVE = creative;
global.SC = {data: JSON.parse(JSON.stringify(scenes)), previews: {}, meta: {}};

/* ------------------------------------- HTML peint -> champs de formulaire */
const unesc = s => String(s)
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function champsDe(html){
  const out = {};
  let m;
  const reInput = /<input([^>]*?)>/g;
  while ((m = reInput.exec(html))){
    const f = /data-f="([^"]+)"/.exec(m[1]);
    if (!f) continue;
    const v = /value="([^"]*)"/.exec(m[1]);
    out[f[1]] = unesc(v ? v[1] : '');
  }
  const reTa = /<textarea([^>]*?)>([\s\S]*?)<\/textarea>/g;
  while ((m = reTa.exec(html))){
    const f = /data-f="([^"]+)"/.exec(m[1]);
    if (f) out[f[1]] = unesc(m[2]);
  }
  const reSel = /<select([^>]*?)>([\s\S]*?)<\/select>/g;
  while ((m = reSel.exec(html))){
    const f = /data-f="([^"]+)"/.exec(m[1]);
    if (!f) continue;
    const avecValeur = /<option value="([^"]*)"[^>]*\sselected[^>]*>/.exec(m[2]);
    if (avecValeur){ out[f[1]] = unesc(avecValeur[1]); continue; }
    const nu = /<option\s+selected>([^<]*)<\/option>/.exec(m[2]);   // selecteur de format
    out[f[1]] = nu ? unesc(nu[1]) : '';
  }
  return out;
}

function peindreEtRelire(){
  const box = $('#sceneCards');
  box.enfants = [];
  renderSceneCards();
  const cartes = box.enfants.map((el, k) => {
    const f = champsDe(el.innerHTML);
    return {
      dataset: {k: String(k)},
      champs: f,
      querySelector(sel){
        const m = /\[data-f="([^"]+)"\]/.exec(sel);
        return m && f[m[1]] !== undefined ? {value: f[m[1]]} : null;
      },
    };
  });
  global.$$ = s => s === '#sceneCards .sceneCard' ? cartes : [];
  return cartes;
}

const canon = v => Array.isArray(v) ? v.map(canon)
  : (v && typeof v === 'object'
      ? Object.keys(v).sort().reduce((o, k) => (o[k] = canon(v[k]), o), {})
      : v);
const meme = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/* ============================================================ [1] fidelite */
console.log('\n[1] aller-retour sans rien changer');
const cartes = peindreEtRelire();
dire(cartes.length === scenes.scenes.length,
     `${cartes.length} carte(s) peinte(s) pour ${scenes.scenes.length} scene(s)`);

const relu = collectScenes();
dire(meme(relu, scenes.scenes), 'la banque revient identique apres un aller-retour');

if (!meme(relu, scenes.scenes)){
  scenes.scenes.forEach((s, i) => {
    if (!meme(s, relu[i])){
      const perdues = Object.keys(s).filter(k => !(k in (relu[i] || {})));
      const changees = Object.keys(s).filter(k => k in (relu[i] || {}) && !meme(s[k], relu[i][k]));
      console.log(`      ${s.id} : perdues=[${perdues}] changees=[${changees}]`);
    }
  });
}

// le coeur du bug : ces cles n'existent que dans le fichier, jamais dans un
// champ « simple » — ce sont elles qui avaient disparu
['wardrobe', 'intensity', 'tags', 'tones', 'intention'].forEach(cle => {
  const attendu = scenes.scenes.filter(s => s[cle] !== undefined).length;
  const obtenu = relu.filter(s => s[cle] !== undefined).length;
  dire(obtenu === attendu, `« ${cle} » survit sur ${obtenu}/${attendu} scene(s)`);
});

/* ================================================= [2] forme des tenues */
console.log('\n[2] wardrobe : chaine et liste doivent survivre telles quelles');
const multi = scenes.scenes.find(s => Object.values(s.wardrobe || {}).some(Array.isArray));
if (multi){
  const apres = relu.find(s => s.id === multi.id);
  dire(meme(apres.wardrobe, multi.wardrobe),
       `${multi.id} : plusieurs tenues sur un meme niveau conservees`);
} else {
  dire(true, '(aucune scene multi-tenues dans la banque, cas non couvert ici)');
}
const txt = wardrobeVersTexte({'0': ['a shirt, open', 'trousers'], '1': 'a slip dress'});
dire(meme(texteVersWardrobe(txt), {'0': ['a shirt, open', 'trousers'], '1': 'a slip dress'}),
     'aller-retour direct chaine/liste, virgule dans la tenue comprise');

/* ============================================ [3] une variante a virgules */
console.log('\n[3] les separateurs ne se marchent pas dessus');
const avecVirgule = scenes.scenes.find(s => (s.variants || []).some(v => v.includes(',')));
if (avecVirgule){
  const apres = relu.find(s => s.id === avecVirgule.id);
  dire(meme(apres.variants, avecVirgule.variants),
       `${avecVirgule.id} : variante contenant une virgule non coupee`);
} else {
  dire(true, '(aucune variante a virgule dans la banque)');
}

/* ===================================================== [4] edition ciblee */
console.log('\n[4] modifier un champ ne touche que lui');
const c0 = cartes[0];
c0.champs.prompt = 'un tout autre prompt';
const apresEdition = collectScenes();
dire(apresEdition[0].prompt === 'un tout autre prompt', 'le prompt modifie est bien repris');
const sansPrompt = o => { const c = {...o}; delete c.prompt; return c; };
dire(meme(sansPrompt(apresEdition[0]), sansPrompt(scenes.scenes[0])),
     'aucun autre champ de la scene n a bouge');
c0.champs.prompt = scenes.scenes[0].prompt;

/* ================================================ [5] retrait d un champ */
console.log('\n[5] vider un champ le retire vraiment');
const avecTags = cartes.findIndex(c => (c.champs.tags || '').trim() !== '');
if (avecTags >= 0){
  cartes[avecTags].champs.tags = '';
  const r = collectScenes();
  dire(!('tags' in r[avecTags]), 'un champ vide est retire, pas laisse a l ancienne valeur');
  cartes[avecTags].champs.tags = (scenes.scenes[avecTags].tags || []).join(', ');
} else {
  dire(true, '(aucune scene avec tags)');
}

/* =================================== [6] garde sur une tenue sans niveau */
console.log('\n[6] une tenue sans niveau bloque l enregistrement');
const cible = cartes[0];
const sauve = cible.champs.wardrobe;
cible.champs.wardrobe = 'a red dress';            // niveau absent
dire(tenuesInvalides().length === 1, 'la ligne sans niveau est signalee');
cible.champs.wardrobe = '0: a red dress';
dire(tenuesInvalides().length === 0, 'la meme ligne prefixee passe');
cible.champs.wardrobe = sauve;

/* ============================== [7] l invariant : ce qui n est pas peint survit
   C'est LE test du bug du 25/08/2026, et le seul qui distingue une fusion d'une
   reconstruction. Les blocs precedents restent verts meme en reconstruisant,
   puisque la carte affiche desormais tous les champs qu'elle connait — ils
   gardent le rendu et la relecture d'accord entre eux, rien de plus.

   Ici on donne a une scene une cle que la carte NE MONTRE PAS. C'est la situation
   de `wardrobe` avant qu'on l'expose, et celle de tout champ qu'on ajoutera au
   format sans toucher a l'interface. Elle doit traverser l'enregistrement. */
console.log('\n[7] une cle absente de la carte traverse quand meme');
const sauvegarde = SC.data.scenes;
SC.data.scenes = JSON.parse(JSON.stringify(sauvegarde));
SC.data.scenes[0].cle_non_affichee = {garde: 'moi', niveaux: [1, 2]};
SC.data.scenes[1].autre_cle_future = 'valeur a preserver';
peindreEtRelire();
const apresInconnues = collectScenes();
dire(meme(apresInconnues[0].cle_non_affichee, {garde: 'moi', niveaux: [1, 2]}),
     'une cle objet que la carte ignore est conservee intacte');
dire(apresInconnues[1].autre_cle_future === 'valeur a preserver',
     'une cle texte que la carte ignore est conservee intacte');
SC.data.scenes = sauvegarde;
peindreEtRelire();

console.log();
console.log(ko ? `  ${ko} PROBLEME(S)` : '  tout est vert');
process.exit(ko ? 1 : 0);
