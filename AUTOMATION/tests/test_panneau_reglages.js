/* Fumigation du panneau de reglages : on charge create.js (module ES) pour de
   vrai, avec un DOM stub, et on regarde le HTML produit par renderReglages().

   Ce qu'on cherche : un « undefined » ou un « NaN » dans la sortie (interpolation
   ratee), un controle manquant, une pastille « mesure » mal calee. Un panneau qui
   ne se peint pas est invisible autrement qu'a l'oeil.

   Depuis J3 (bascule en modules ES) : create.js s'importe au lieu de s'eval-er.
   Le stub n'installe plus `$`/`$$` en global — il pose `document.querySelector`,
   sur lequel dom.js repose. L'etat n'est plus des globals mais l'objet `S` de
   store.js, qu'on amorce apres l'import (meme singleton que create.js voit). */
const fs = require('fs');
const path = require('path');

const OFM = path.resolve(__dirname, '..', '..');   // AUTOMATION/tests -> OFM
const STATIC = path.join(OFM, 'AUTOMATION/web/static');
const cfg = JSON.parse(fs.readFileSync(path.join(OFM, 'CHARACTERS/lena/config.json'), 'utf8'));
const url = p => 'file://' + path.join(STATIC, p).replace(/\\/g, '/');

/* ---------------------------------------------------------------- DOM stub */
const NOEUDS = new Map();
function faire(id){
  const n = {
    id, value: '', checked: false, textContent: '', innerHTML: '', hidden: false,
    dataset: {}, type: id === 'novar' || id === 'noqc' ? 'checkbox' : '',
    style: {}, title: '', disabled: false,
    classList: {c: new Set(),
      toggle(k, force){
        const on = force === undefined ? !this.c.has(k) : !!force;
        on ? this.c.add(k) : this.c.delete(k);
        return on;
      },
      add(k){ this.c.add(k); }, remove(k){ this.c.delete(k); },
      contains(k){ return this.c.has(k); }},
    addEventListener(){}, removeEventListener(){},
    closest(){ return {classList: {toggle(){}, add(){}, remove(){}}}; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    append(){}, remove(){}, focus(){}, scrollIntoView(){},
  };
  NOEUDS.set(id, n);
  return n;
}
const idDe = s => s.startsWith('#') ? s.slice(1) : s;
globalThis.window = globalThis;
globalThis.document = {
  querySelector(s){
    if (/\s/.test(s)) return null;                 // '#qual button.on' etc.
    const id = idDe(s);
    return NOEUDS.get(id) || faire(id);
  },
  querySelectorAll(){ return []; },
  addEventListener(){}, createElement(){ return faire('tmp'); },
};
globalThis.location = {hash: '', search: '', reload(){}};
globalThis.addEventListener = () => {};
globalThis.fetch = async () => ({json: async () => ({}), status: 200});
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};

let ko = 0;
const dire = (ok, txt) => { console.log(`  ${ok ? 'ok  ' : 'KO  '}${txt}`); if (!ok) ko++; };

(async () => {
  let mod, store;
  try {
    store = await import(url('store.js'));
    mod = await import(url('create.js'));
  } catch (e) {
    console.log('  ECHEC au chargement : ' + (e && e.stack || e));
    process.exit(1);
  }
  const {S} = store;
  const {renderReglages, majAffichage, valeursDe, appliquerPreset} = mod;

  // etat amorce : create.js lit ces champs sur le meme S
  S.PRESET_REF = cfg.preset;
  S.NSFW_REF = cfg.nsfw;
  S.LEVEL = 0;
  S.CREATIVE = {intensity: [], intentions: [], tones: []};

  /* ------------------------------------------------------------------- peint */
  renderReglages();
  const html = NOEUDS.get('gearBody').innerHTML;

  dire(html.length > 2000, `le panneau produit du HTML (${html.length} caracteres)`);
  dire(!/undefined/.test(html), 'aucun « undefined » dans la sortie');
  dire(!/NaN/.test(html), 'aucun « NaN » dans la sortie');
  dire((html.match(/type="range"/g) || []).length === 10, '10 curseurs rendus');
  // 9 et 23 depuis le 26/08/2026 : « generer avant d'editer » est le seul reglage
  // ajoute par la refonte, et c'est lui qui distingue les deux modes du cran NSFW
  dire((html.match(/type="checkbox"/g) || []).length === 9, '9 interrupteurs rendus');
  dire((html.match(/class="rgq"/g) || []).length === 23, '23 explications rendues');
  dire((html.match(/<section class="rgs/g) || []).length === 6, '6 sections rendues');
  dire(/data-niveau="edit"/.test(html), 'la section NSFW existe et est marquee');
  // P7 (26/08/2026) : les 3 sections de RENDU se replient, celles qui decrivent le
  // lot et le controle restent depliees
  dire((html.match(/<section class="rgs pli"/g) || []).length === 3,
       '3 sections de rendu repliees');
  dire((html.match(/class="ecart"/g) || []).length === 3,
       'chaque section repliee annonce ses ecarts');

  // les valeurs mesurees arrivent-elles dans les controles ?
  const g = NOEUDS.get('guidance'), b = NOEUDS.get('exprbudget'), p = NOEUDS.get('nsfwpix');
  dire(+g.value === cfg.preset.guidance, `guidance chargee a la valeur mesuree (${g.value})`);
  dire(+b.value === cfg.preset.expression_budget, `budget d'expression charge (${b.value})`);
  dire(+p.value === cfg.nsfw.max_pixels, `surface NSFW chargee (${p.value})`);
  dire(NOEUDS.get('refiner').checked === cfg.preset.refiner, 'interrupteur refiner charge');

  // l'ecart est-il detecte ?
  g.value = 3.5; majAffichage();
  dire(/1 réglage hors valeur mesurée/.test(NOEUDS.get('gearDiff').textContent),
       'un ecart est signale en tete de panneau');
  dire(NOEUDS.get('m_guidance').classList.contains('off'),
       'la pastille « mesure » s eteint sur le reglage modifie');
  g.value = cfg.preset.guidance; majAffichage();
  dire(NOEUDS.get('gearDiff').textContent === '', 'retour a la reference : plus d ecart signale');

  // le payload emporte-t-il tout ?
  const vp = valeursDe('preset'), vn = valeursDe('nsfw');
  dire(Object.keys(vp).length === 12, `12 cles preset dans le payload (${Object.keys(vp).length})`);
  dire(Object.keys(vn).length === 4, `4 cles nsfw dans le payload (${Object.keys(vn).length})`);
  dire(vp.guidance === cfg.preset.guidance && vp.expression === true,
       'les valeurs du payload correspondent aux controles');

  // un prereglage remplit-il bien le panneau ?
  appliquerPreset('brut');
  const gBrut = +NOEUDS.get('guidance').value;
  dire(NOEUDS.get('refiner').checked === false,
       'le prereglage « Brut » coupe bien le refiner');
  // On verifie la REGLE, pas le nombre : ce test codait 3.5 en dur et a du etre
  // corrige le 25/08/2026 quand « Brut » est passe a 3.0. L'explication du
  // panneau dit « au-dela de 3, ca se voit » — un prereglage ne doit pas
  // contredire le texte affiche juste a cote.
  dire(gBrut > cfg.preset.guidance && gBrut <= 3,
       `« Brut » remonte la guidance sans depasser 3 (${gBrut})`);
  appliquerPreset('realisme');
  dire(NOEUDS.get('refiner').checked === cfg.preset.refiner,
       'le prereglage « Realisme » revient aux valeurs mesurees');

  console.log();
  console.log(ko ? `  ${ko} PROBLEME(S)` : '  tout est vert');
  process.exit(ko ? 1 : 0);
})();
