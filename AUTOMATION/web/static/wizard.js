/* Wizard « nouveau personnage » (J7bis). Parcours type -> style -> monde ->
   base d'identite (fournie ou generee) -> creation. type / style / monde sont
   figes a la creation. A la creation : rechargement simple en
   ?character=<nouvel id> (V1). Etat local au module, aucune globale partagee. */
import {$, esc} from './dom.js';
import {api, post} from './api.js';
import {toast} from './toast.js';

const STEPS = ['type', 'style', 'world', 'base'];
const LABELS = {type: 'Type', style: 'Style', world: 'Monde', base: "Base d'identité"};
const CID_RE = /^[a-z][a-z0-9_-]*$/;
const MAX_UPLOAD = 20 * 1024 * 1024;

let S = null;

function reset(){
  S = {name: '', cid: '', type: null, style: null, world: null,
       base_gelee: null, basePreview: '', step: 0, opts: null,
       gen: null, genState: null, poll: null};
}

export async function loadWizard(){
  if (S && S.opts){ render(); return; }        // deja charge : garder l'etat
  reset();
  const d = await api('/api/wizard/options');
  if (!d || !Array.isArray(d.types)){
    $('#wizBody').innerHTML =
      `<p class="wiz-note wiz-err">Impossible de charger les choix du wizard.</p>`;
    return;
  }
  S.opts = d.types;
  render();
}

const currentType = () => (S.opts || []).find(t => t.id === S.type) || null;
const cidValid = () => CID_RE.test(S.cid);

function pickType(id){
  if (S.type === id) return;
  S.type = id; S.style = null; S.world = null;
  const t = currentType();
  if (t && t.styles.length === 1) S.style = t.styles[0];   // style unique : pris d'office
  render();
}

/* -------------------------------------------------------------------- rendu */
function render(){
  syncIdentity();
  paintCidHint();
  paintStepper();
  paintBody();
  paintBar();
}

function syncIdentity(){
  if ($('#wizName').value !== S.name) $('#wizName').value = S.name;
  if ($('#wizCid').value !== S.cid) $('#wizCid').value = S.cid;
}

function paintCidHint(){
  const h = $('#wizCidHint');
  h.textContent = !S.cid ? '' : cidValid() ? '✓' : '— minuscules, chiffres, - et _';
  h.className = 'tiny ' + (S.cid && !cidValid() ? 'wiz-bad' : 'wiz-ok');
}

function paintStepper(){
  $('#wizSteps').innerHTML = STEPS.map((k, i) => {
    const state = i < S.step ? 'done' : i === S.step ? 'on' : '';
    return `<li class="${state}"><i>${i + 1}</i>${LABELS[k]}</li>`;
  }).join('');
}

/* `hint` : cle d'infobulle (hints.js), posee sur CHAQUE carte de l'etape plutot
   que sur le titre de l'etape. La puce de `#wizSteps` n'est pas focusable — lui
   accrocher la bulle la rendrait inaccessible au clavier, et lui ajouter un
   tabindex mettrait un arret de tabulation sur un element decoratif. */
function optionCard(active, title, sub, hint){
  return `<button class="it${active ? ' on' : ''}" type="button"`
    + `${hint ? ` data-hint="${hint}"` : ''}>`
    + `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</button>`;
}

function paintBody(){
  const b = $('#wizBody');
  const k = STEPS[S.step];

  if (k === 'type'){
    b.innerHTML = `<div class="intents">` + S.opts.map(t =>
      optionCard(S.type === t.id, t.label, `machine : ${t.family}`)).join('') + `</div>`;
    b.querySelectorAll('.it').forEach((el, i) =>
      el.onclick = () => pickType(S.opts[i].id));

  } else if (k === 'style'){
    const t = currentType();
    if (!t){ b.innerHTML = ''; return; }
    if (t.styles.length === 1){
      b.innerHTML = `<p class="wiz-note">Ce type ne produit qu'un style :
        <b>${esc(t.styles[0])}</b>. Il est fixé à la création — en changer
        reviendrait à créer un autre personnage.</p>`;
      return;
    }
    b.innerHTML = `<div class="intents">` + t.styles.map(s =>
      optionCard(S.style === s, s, '', 'wiz.style')).join('') + `</div>`;
    b.querySelectorAll('.it').forEach((el, i) =>
      el.onclick = () => { S.style = t.styles[i]; render(); });

  } else if (k === 'world'){
    const t = currentType();
    if (!t){ b.innerHTML = ''; return; }
    b.innerHTML = t.worlds.length
      ? `<div class="intents">` + t.worlds.map(w =>
          optionCard(S.world === w.id, w.label, w.tone, 'wiz.monde')).join('') + `</div>`
      : `<p class="wiz-note">Aucun monde déclaré pour ce type.</p>`;
    b.querySelectorAll('.it').forEach((el, i) =>
      el.onclick = () => { S.world = t.worlds[i].id; render(); });

  } else if (k === 'base'){
    paintBaseStep(b);
  }
}

/* ------------------------------------------------------------- base d'identite */
function paintBaseStep(b){
  if (!cidValid()){
    b.innerHTML = `<p class="wiz-note">Renseigne d'abord un <b>identifiant</b>
      valide en haut : la base d'identité est enregistrée sous ce nom.</p>`;
    return;
  }
  b.innerHTML = `
    <p class="wiz-note">Le visage de référence, figé à la création : le verrou
      d'identité s'y accroche pour toute la production.
      <b>Personnage fictif — jamais la photo d'une personne réelle.</b></p>
    <div class="wiz-base">
      <div class="wiz-base-col">
        <h3>Fournir une image</h3>
        <label class="btn sm" for="wizFile">Choisir un fichier…</label>
        <input type="file" id="wizFile" accept="image/png,image/jpeg,image/webp" hidden>
        <p class="tiny" id="wizFileMsg"></p>
      </div>
      <div class="wiz-base-col">
        <h3>Générer un portrait</h3>
        <button class="btn sm" id="wizGen">Générer 4 portraits</button>
        <p class="tiny" id="wizGenMsg"></p>
        <div class="wiz-cands" id="wizCands"></div>
      </div>
    </div>
    <div class="wiz-base-preview" id="wizBasePreview"></div>`;
  $('#wizFile').onchange = onFilePicked;
  $('#wizGen').onclick = onGenerate;
  paintCands();
  paintBasePreview();
}

function paintBasePreview(){
  const el = $('#wizBasePreview');
  if (!el) return;
  el.innerHTML = S.base_gelee
    ? `<div class="wiz-frozen"><img alt="base d'identité" src="${esc(S.basePreview)}">`
      + `<span>base gelée : <code>${esc(S.base_gelee)}</code></span></div>`
    : '';
}

function candImgUrl(file){
  return `/api/characters/base/image?file=${encodeURIComponent(file)}`;
}

async function onFilePicked(e){
  const f = e.target.files[0];
  if (!f) return;
  const msg = $('#wizFileMsg');
  if (f.size > MAX_UPLOAD){ msg.textContent = 'Image trop lourde (max 20 Mo).'; return; }
  msg.textContent = 'envoi…';
  const b64 = await new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(f);
  });
  const r = await post('/api/characters/base/upload',
    {cid: S.cid, image_base64: b64});
  if (!r.ok){ msg.textContent = ''; return toast(r.erreur || 'échec de l’envoi'); }
  stopPoll();
  S.base_gelee = r.base_gelee; S.basePreview = b64;
  S.gen = null; S.genState = null;
  msg.textContent = 'image enregistrée.';
  paintCands(); paintBasePreview(); paintBar();
}

async function onGenerate(){
  const msg = $('#wizGenMsg');
  msg.textContent = 'mise en file…';
  const r = await post('/api/characters/base/generate',
    {cid: S.cid, type: S.type, style: S.style, world: S.world, n: 4});
  if (!r.ok){ msg.textContent = ''; return toast(r.erreur || 'échec de la génération'); }
  S.gen = {pack: r.pack, items: r.candidates};
  S.genState = r.candidates.map(c => ({...c, state: 'pending'}));
  msg.textContent = 'génération en cours… (≈ 1 à 2 min par portrait)';
  paintCands();
  startPoll();
}

function startPoll(){
  stopPoll();
  let tries = 0;
  S.poll = setInterval(async () => {
    if (!S.gen || ++tries > 150){ stopPoll(); return; }
    const r = await post('/api/characters/base/candidates',
      {pack: S.gen.pack, items: S.gen.items});
    if (!r.ok || !Array.isArray(r.results)) return;
    S.genState = r.results;
    paintCands();
    if (r.results.every(x => x.state === 'ready' || x.state === 'error')){
      stopPoll();
      $('#wizGenMsg').textContent = r.results.some(x => x.state === 'ready')
        ? 'choisis un portrait ci-dessous.'
        : 'la génération a échoué — réessaie, ou fournis une image.';
    }
  }, 4000);
}
function stopPoll(){ if (S && S.poll){ clearInterval(S.poll); S.poll = null; } }

function paintCands(){
  const el = $('#wizCands');
  if (!el) return;
  el.innerHTML = (S.genState || []).map(c => {
    if (c.state === 'ready'){
      const url = candImgUrl(c.file);
      const chosen = S.basePreview === url ? ' chosen' : '';
      return `<button class="wiz-cand${chosen}" type="button" data-file="${esc(c.file)}">`
        + `<img alt="portrait candidat" src="${esc(url)}"></button>`;
    }
    if (c.state === 'error')
      return `<div class="wiz-cand err" title="${esc(c.detail || '')}">échec</div>`;
    return `<div class="wiz-cand pending"><span class="spin"></span></div>`;
  }).join('');
  el.querySelectorAll('.wiz-cand[data-file]').forEach(node =>
    node.onclick = () => freezeCand(node.dataset.file));
}

async function freezeCand(file){
  const r = await post('/api/characters/base/freeze', {cid: S.cid, file});
  if (!r.ok) return toast(r.erreur || 'échec du gel');
  S.base_gelee = r.base_gelee;
  S.basePreview = candImgUrl(file);
  paintCands(); paintBasePreview(); paintBar();
}

/* --------------------------------------------------------------- barre + nav */
function stepOk(){
  return {type: !!S.type, style: !!S.style, world: !!S.world,
          base: !!S.base_gelee}[STEPS[S.step]];
}
function readyToCreate(){
  return S.name.trim() && cidValid() && S.type && S.style && S.world && S.base_gelee;
}

function paintBar(){
  const last = S.step === STEPS.length - 1;
  const bits = [S.type, S.style, S.world, S.base_gelee ? 'base ✓' : null].filter(Boolean);
  $('#wizSumN').textContent = `${S.step + 1}/${STEPS.length}`;
  $('#wizSumT').textContent = bits.join(' · ') || 'choisis un type';
  $('#wizBack').disabled = S.step === 0;
  const next = $('#wizNext');
  if (last){
    next.textContent = S.name.trim() ? `Créer ${S.name.trim()}` : 'Créer le personnage';
    next.disabled = !readyToCreate();
  } else {
    next.textContent = 'Suivant';
    next.disabled = !stepOk();
  }
}

/* champs d'identite + boutons de barre : cables une fois, ils existent des le
   chargement de la page (index.html). L'etat S peut ne pas encore exister. */
$('#wizName').oninput = e => { if (S){ S.name = e.target.value; paintBar(); } };
$('#wizCid').oninput = e => {
  if (!S) return;
  S.cid = e.target.value.trim();
  if (S.base_gelee){ S.base_gelee = null; S.basePreview = ''; }   // base liee a l'ancien cid
  paintCidHint();
  if (STEPS[S.step] === 'base') paintBody();
  paintBar();
};
$('#wizBack').onclick = () => { if (S && S.step > 0){ S.step--; render(); } };
$('#wizNext').onclick = async () => {
  if (!S) return;
  if (S.step < STEPS.length - 1){ if (stepOk()){ S.step++; render(); } return; }
  if (!readyToCreate()) return;
  $('#wizNext').disabled = true;
  const r = await post('/api/characters', {
    cid: S.cid, name: S.name.trim(), type: S.type, style: S.style,
    world: S.world, base_gelee: S.base_gelee});
  if (!r.ok){ paintBar(); return toast(r.erreur || 'échec de la création'); }
  stopPoll();
  location.href = `?character=${encodeURIComponent(r.id)}`;
};
