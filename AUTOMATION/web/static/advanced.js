/* Tiroir Avance : banque de scenes, composeur, branche NSFW, journal.
   Extrait de index.html le 24/08/2026 — code inchange.
   Ordre de chargement significatif : voir index.html. */
/* ==================================================================== SCENES */
/* Vocabulaire du parcours, pour le selecteur d'intention des cartes. Une scene
   qui porte une cle absente de creative.json la GARDE : on l'ajoute a la liste
   plutot que de la faire disparaitre du selecteur — donc de la scene. */
function optionsIntention(courant){
  const cles = (CREATIVE?.intentions || []).map(i => [i.key, i.label]);
  if (courant && !cles.some(([k]) => k === courant)) cles.push([courant, courant]);
  return '<option value="">— aucune —</option>' + cles.map(([k, l]) =>
    `<option value="${esc(k)}"${k === courant ? ' selected' : ''}>${esc(l)}</option>`).join('');
}

/* Squelettes de INPUTS/POSE/, servis par /api/scenes (SC.poses). Une scene qui
   pointe vers un squelette absent (fichier deplace, renomme) le GARDE dans la
   liste plutot que de la faire disparaitre en silence — meme regle que
   optionsIntention pour une intention hors taxonomie. */
function optionsPose(courant){
  const noms = SC?.poses || [];
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
function wardrobeVersTexte(w){
  const lignes = [];
  Object.keys(w || {}).sort().forEach(lv =>
    (Array.isArray(w[lv]) ? w[lv] : [w[lv]]).forEach(t => lignes.push(`${lv}: ${t}`)));
  return lignes.join('\n');
}
function texteVersWardrobe(txt){
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
function tenuesInvalides(){
  const mauvaises = [];
  $$('#sceneCards .sceneCard').forEach(card => {
    const id = card.querySelector('[data-f="id"]').value.trim();
    (card.querySelector('[data-f="wardrobe"]').value || '').split('\n')
      .map(l => l.trim()).filter(Boolean)
      .forEach(l => { if (!/^\d+\s*:\s*.+$/.test(l)) mauvaises.push(`${id} → « ${l} »`); });
  });
  return mauvaises;
}

/* Bande d'une scene : minimum saisi, maximum DEDUIT des tenues declarees.
   Miroir de `lb.scene_band`. Le serveur reste la reference (SC.meta), mais une
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

function renderSceneCards(){
  $('#anchor').value = SC.data.anchor || '';
  $('#direction').value = SC.data.direction || '';
  $('#nScenes').textContent = SC.data.scenes.length + ' scènes';
  const box = $('#sceneCards'); box.innerHTML = '';
  SC.data.scenes.forEach((s, k) => {
    const el = document.createElement('div');
    el.className = 'sceneCard';
    el.dataset.k = k;          // index dans SC.data.scenes : c'est cette ancre qui
                               // permet a collectScenes de FUSIONNER au lieu de
                               // reconstruire (voir sa docstring)
    const band = bandeDe(s);
    el.innerHTML = `
      <div class="top">
        <input class="id" data-f="id" value="${esc(s.id)}">
        <span class="tiny">${(SC.previews[s.id] ? 'déjà produite' : 'jamais produite')}</span>
        <button class="del" title="supprimer">×</button>
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
        <label class="f"><span>guidance (option)</span>
          <input data-f="guidance" type="number" step="0.1" value="${s.guidance ?? ''}" placeholder="défaut"></label>
      </div>
      <div class="rowf">
        <!-- un seul nombre : le maximum se DEDUIT des tenues declarees. Les deux
             champs disaient la meme chose, et la tenue faisait foi de toute
             facon (wardrobe_for prend la plus haute <= niveau). -->
        <label class="f"><span>niveau minimum — jusqu’à <b>${band[1]}</b>, déduit des tenues</span>
          <input data-f="band_lo" type="number" min="0" max="3" value="${band[0]}" style="width:88px"></label>
        <label class="f"><span>tons affins — virgules</span>
          <input data-f="tones" value="${esc((s.tones || []).join(', '))}"
                 placeholder="${esc((CREATIVE?.tones || []).map(t => t.key).join(', '))}"></label>
        <label class="f"><span>tags — virgules</span>
          <input data-f="tags" value="${esc((s.tags || []).join(', '))}"></label>
      </div>
      <label class="f"><span>prompt de scène — décor, cadrage, lumière. Jamais le visage, jamais la tenue.</span>
        <textarea data-f="prompt">${esc(s.prompt || '')}</textarea></label>
      <label class="f" style="margin-top:10px"><span>tenues — une par ligne, préfixée de son niveau
        (<code>0: a linen shirt and jeans</code>) · <b>c’est le niveau le plus haut
        ici qui fixe jusqu’où la scène monte</b></span>
        <textarea data-f="wardrobe" spellcheck="false" style="min-height:52px">${esc(wardrobeVersTexte(s.wardrobe))}</textarea></label>
      <label class="f" style="margin-top:10px"><span>variantes de lumière ou de saison (une par ligne) — jamais une tenue</span>
        <textarea data-f="variants" style="min-height:52px">${esc((s.variants || []).join('\n'))}</textarea></label>
      <div class="rowf" style="margin-top:10px;align-items:flex-start">
        <label class="f"><span>pose imposée (option) — ControlNet, cran SFW
          uniquement<br><span class="tiny">A/B mesuré : 0 image sous la bande
          d'identité sur 15. Un squelette repose
          ou de profil peut ne pas être suivi, vérifier le résultat à l'œil.</span></span>
          <select data-f="pose">${optionsPose(s.pose)}</select></label>
        <div class="posePrev" ${s.pose ? '' : 'hidden'}>
          <img loading="lazy" ${s.pose ? `src="/img/pose?name=${encodeURIComponent(s.pose)}"` : ''}></div>
      </div>`;
    el.querySelector('[data-f="pose"]').onchange = e => {
      const prev = el.querySelector('.posePrev');
      const n = e.target.value;
      prev.hidden = !n;
      prev.querySelector('img').src = n ? `/img/pose?name=${encodeURIComponent(n)}` : '';
    };
    el.querySelector('.del').onclick = () => {
      // on releve d'abord l'etat des champs : renderSceneCards() repeint depuis
      // SC.data.scenes, donc sans ca une saisie en cours dans une AUTRE carte
      // serait perdue en supprimant celle-ci
      SC.data.scenes = collectScenes();
      SC.data.scenes.splice(k, 1);
      SC_DIRTY = true; majDirty(); renderSceneCards(); };
    box.append(el);
  });
  $('#rawJson').value = JSON.stringify(SC.data, null, 2);
}
$('#btnAddScene').onclick = () => {
  // relever la saisie en cours avant de repeindre, sinon ajouter une scene
  // efface ce qui etait tape dans les autres cartes
  SC.data.scenes = collectScenes();
  // une scene neuve nait avec la forme complete : sans bande ni tenue elle
  // n'existerait qu'au niveau 0 et le curseur d'intensite n'aurait pas prise
  SC.data.scenes.push({id:'nouvelle_scene',
                       intention:'lifestyle', tags:[], tones:[],
                       intensity:0, format:'4:5', count:1, prompt:'',
                       wardrobe:{'0':'everyday clothing'}, variants:[]});
  SC_DIRTY = true; majDirty();
  renderSceneCards();
  $('#sceneCards').lastElementChild.scrollIntoView({behavior:'smooth', block:'center'});
};
// n'importe quelle frappe dans une carte de scene (prompt, id, variantes...) compte
// comme une modification non enregistree — sinon seuls l'ajout et le JSON brut
// etaient proteges, pas l'edition d'une scene existante
$('#sceneCards').addEventListener('input', e => {
  SC_DIRTY = true; majDirty();
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
/* Rassemble les cartes en scenes, par FUSION sur l'objet d'origine — jamais par
   reconstruction.

   Le 25/08/2026, cette fonction rebatissait chaque scene a partir des seuls
   champs affiches par la carte. Tout ce que la carte ne montrait pas etait donc
   efface a l'enregistrement : `wardrobe`, `intensity`, `tags`, `tones` et
   `intention` ont disparu des 16 scenes de la banque en une sauvegarde, et le
   bouton « Ajouter et enregistrer » du composeur declenchait precisement cette
   sauvegarde-la, juste apres que compose.clean() ait produit ces metadonnees.

   Regle : toute cle que la carte n'affiche pas doit traverser l'enregistrement
   intacte. Ajouter un champ a la carte, c'est ajouter une ligne `pose(...)` ici,
   pas remplacer l'objet. */
function collectScenes(){
  const out = [];
  $$('#sceneCards .sceneCard').forEach(card => {
    const g = f => (card.querySelector(`[data-f="${f}"]`)?.value ?? '').trim();
    // les tons et les tags sont des cles : la virgule separe. Une variante ou
    // une tenue contient des virgules : seul le saut de ligne separe.
    const cles   = t => t.split(',').map(x => x.trim()).filter(Boolean);
    const lignes = t => t.split('\n').map(x => x.trim()).filter(Boolean);

    const s = {...(SC.data.scenes[+card.dataset.k] || {})};   // <- la fusion
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
    // d'export : enregistrer une scene retire la cle morte, l'intention
    // l'ayant deja reprise (voir optionsIntention, qui la pre-selectionne)
    delete s.category;
    out.push(s);
  });
  return out;
}
async function enregistrerScenes(){
  const mauvaises = tenuesInvalides();
  if (mauvaises.length){
    const msg = 'tenue sans niveau — ' + mauvaises[0] +
      (mauvaises.length > 1 ? ` (+${mauvaises.length - 1} autre(s))` : '') +
      ' · préfixe chaque ligne par « 0: » ou « 1: »';
    $('#scMsg').textContent = msg;
    return {ok: false, erreur: msg};
  }
  SC.data.anchor = $('#anchor').value.trim();
  SC.data.direction = $('#direction').value.trim();
  SC.data.scenes = collectScenes();
  const r = await post('/api/scenes', {data: SC.data});
  $('#scMsg').textContent = r.ok ? 'enregistré · sauvegarde .bak faite' : r.erreur;
  if (r.ok){ SC_DIRTY = false; await loadScenes(); }
  majDirty();
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
  try { SC.data = JSON.parse($('#rawJson').value); SC_DIRTY = true; majDirty();
        renderSceneCards(); renderScenes();
        toast('JSON appliqué — pense à enregistrer'); }
  catch(e){ toast('JSON invalide : ' + e.message); }
};

/* ================================================================= COMPOSEUR */
/* La liste d'intentions vient de creative.json : le composeur ne doit pas
   pouvoir inventer une taxonomie parallele. */
function remplirIntentionsComposeur(){
  const sel = $('#cmpCat');
  if (!sel || !CREATIVE) return;
  sel.innerHTML = '<option value="">— le modèle choisit —</option>' +
    (CREATIVE.intentions || []).map(i => `<option value="${i.key}">${i.label}</option>`).join('');
}

$('#btnCompose').onclick = async () => {
  const intention = $('#intention').value.trim();
  if (!intention) return toast('décris d’abord ce que tu veux');
  $('#btnCompose').disabled = true;
  $('#cmpMsg').textContent = 'le modèle rédige… (~20 s)';
  // `intention` = le texte libre en francais ; `intention_cible` = la cle imposee
  const r = await post('/api/compose', {intention, count: $('#cmpN').value,
                                        intention_cible: $('#cmpCat').value});
  $('#btnCompose').disabled = false;
  if (!r.ok){ $('#cmpMsg').textContent = ''; return toast(r.erreur || 'échec'); }
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
    SC.data.scenes = collectScenes();      // meme raison que dans btnAddScene
    SC.data.scenes.push(sc); SC_DIRTY = true; PROPS.splice(+b.dataset.add, 1);
    renderProps(); renderSceneCards(); majDirty();
    $('#sceneCards').lastElementChild.scrollIntoView({behavior:'smooth', block:'center'});
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
function renderPoses(){
  const noms = SC?.poses || [];
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
    await loadScenes(true); renderPoses();
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
    await loadScenes(true); renderPoses();
  } finally {
    $('#btnPoseExtract').disabled = !$('#poseFile').files.length;
  }
});

/* =================================================================== JOURNAL */
$$('#jFilter button').forEach(b => b.onclick = () => {
  $$('#jFilter button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); JFILTER = b.dataset.f; drawJournal();
});
async function loadJournal(){ JROWS = (await api('/api/journal')).rows; drawJournal(); }
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

