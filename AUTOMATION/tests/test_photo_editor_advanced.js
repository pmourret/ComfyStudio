/* Browser smoke test of the advanced (Lightroom-style) photo editor —
   `/photo-editor/:name?bucket=&space=` (design-pass screen-photo-editor.md,
   §7b, étape 3).

   Covers, in order: opening on a real photo (base layer only, no sidecar
   yet) -> adding a layer (one grouped history step) -> dragging its
   exposition slider (coalesced, but the base layer's own pixels move) ->
   undo/redo walking BOTH the coalesced step and the structural one ->
   clicking a History-panel entry jumps straight to it -> a preset applies
   in one step -> reorder / visibility / delete on a non-base layer -> the
   base layer can never be deleted -> avant/après swaps colour only ->
   "Enregistrer une copie" round-trips through the API for real -> "Écraser
   la source…" confirms and states the same three consequences as the
   simplified modal, then is ALWAYS CANCELLED, exactly like test_editor.js.

   IT WORKS ON ITS OWN IMAGE, same discipline as test_editor.js: a copy of a
   real output under `_TEST_PHOTOEDITORADV_temp`, erased on disk AND in the
   database at the end (via nettoyer_artefacts_test.py, same tool
   test_editor.js already uses) — plus its `.layers.json` sidecar(s), which
   only THIS test's feature ever creates. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';
const RACINE = path.resolve(__dirname, '..', '..');
const OK_DIR = path.join(RACINE, 'PROD', 'LENA', 'OK');

const PREFIXE = '_TEST_PHOTOEDITORADV_temp';
const SOURCE = PREFIXE + '.png';

const PY = process.env.SOULGLADE_PYTHON || 'python';
const nettoyer = () => {
  try {
    for (const n of fs.readdirSync(OK_DIR))
      if (n.startsWith(PREFIXE)) fs.rmSync(path.join(OK_DIR, n), { force: true });
  } catch { /* dossier absent : rien a nettoyer */ }
  try {
    execFileSync(PY, [path.join('AUTOMATION', 'tests', 'nettoyer_artefacts_test.py'), PREFIXE],
                 { cwd: RACINE, stdio: 'pipe' });
  } catch (e) {
    console.log('  note  lignes de test non effacees en base (' + PY + ' : '
                + String(e.message).split(String.fromCharCode(10))[0].trim() + ')');
  }
};

// GARDE DE DESTRUCTION — meme discipline que test_editor.js : ce test touche
// des DONNEES REELLES (la Galerie de lena), et ne doit jamais faire
// disparaitre un fichier qu'il n'a pas cree lui-meme.
const jetables = new Set([SOURCE]);
const volsDeDonnees = [];

const modeles = (() => { try { return fs.readdirSync(OK_DIR)
    .filter(n => n.endsWith('.png') && !n.startsWith(PREFIXE)); } catch { return []; } })();
if (!modeles.length) {
  console.log('  IGNORE — aucune image dans PROD/LENA/OK pour amorcer le test');
  process.exit(0);
}
nettoyer();
fs.copyFileSync(path.join(OK_DIR, modeles[0]), path.join(OK_DIR, SOURCE));
process.on('exit', nettoyer);

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1600, height: 1000 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
  page.on('request', r => {
    if (r.method() !== 'POST' || !r.url().includes('/api/delete')) return;
    const nom = (r.postDataJSON() || {}).name;
    if (!jetables.has(nom)) volsDeDonnees.push(nom);
  });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const vu = s => page.isVisible(s).catch(() => false);
  const layerIds = () => page.$$eval('[data-layer-list] [data-layer]', e => e.map(x => x.dataset.layer));
  const pixelCentre = () => page.evaluate(() => {
    const c = document.querySelector('#peCanvas');
    const ctx = c.getContext('2d');
    return Array.from(ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data);
  });
  const noms = () => page.evaluate(async () =>
    (await (await fetch('/api/gallery?bucket=OK&space=sfw&character=lena')).json())
      .items.map(i => i.name));
  // Poser la valeur d'un <input type="range"> controle par React — une
  // affectation directe de `value` (ou Playwright `.fill()`, qui refuse
  // meme les inputs range) est IGNOREE : React remplace l'accesseur du
  // prototype pour suivre la valeur lui-meme. Meme technique que
  // test_editor.js's own `regler()`.
  const regler = (sel, valeur) => page.$eval(sel, (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, valeur);

  console.log('\n[1] ouverture sur SA propre image : un seul calque, la base, aucun sidecar');
  await page.goto(`${BASE}/photo-editor/${encodeURIComponent(SOURCE)}?bucket=OK&space=sfw&character=lena`,
                  { waitUntil: 'networkidle' });
  await page.waitForSelector('#photoEditorAdvanced');
  await page.waitForFunction(() => {
    const c = document.querySelector('#peCanvas');
    return c && c.width > 40;
  }, null, { timeout: 20000 });
  dire((await layerIds()).length === 1, 'un seul calque au chargement');
  dire(!(await vu('text=modifications non enregistrées')), 'rien a signaler, ecran tout juste charge');
  dire(await vu('button:has-text("+ Ajouter un calque")'), 'le geste d ajout est propose');

  console.log('\n[2] ajouter un calque : un seul geste d historique, calque selectionne');
  const pixelAvant = await pixelCentre();
  await page.click('button:has-text("+ Ajouter un calque")');
  await page.waitForSelector('#addLayerBox[open]');
  await page.click('#addLayerBox button[role="menuitem"]:has-text("Réglage")');
  await page.waitForTimeout(200);
  const idsApresAjout = await layerIds();
  dire(idsApresAjout.length === 2, `deux calques desormais (${idsApresAjout.length})`);
  dire(await vu('text=modifications non enregistrées'), 'l ajout marque l ecran dirty');
  const nouveauId = idsApresAjout.find(id => id !== 'base');
  dire(Boolean(nouveauId), 'le nouveau calque a son propre id');

  console.log('\n[3] Historique : « Ouverture » + « Calque ajouté » — deux entrees structurantes');
  await page.click('[role="tab"]:has-text("Historique")');
  await page.waitForSelector('[data-history]');
  const entreesHistorique = await page.$$eval('[data-history] button', e => e.map(x => x.textContent));
  dire(entreesHistorique.length === 2, `deux entrees visibles (${JSON.stringify(entreesHistorique)})`);
  dire(entreesHistorique[0].includes('Ouverture'), 'la premiere est l ouverture');
  dire(entreesHistorique[1].includes('Calque ajouté'), 'la seconde nomme l ajout');
  await page.click('[role="tab"]:has-text("Préréglages")');

  console.log('\n[4] regler l exposition du nouveau calque bouge vraiment les pixels');
  await regler('#peExpo', 40);
  await page.waitForTimeout(300);
  const pixelExpo = await pixelCentre();
  dire(pixelExpo[0] > pixelAvant[0], `plus lumineux (rouge ${pixelExpo[0]} > ${pixelAvant[0]})`);

  console.log('\n[5] Ctrl+Z annule le curseur PUIS l ajout (deux etapes distinctes)');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const pixelApresUnUndo = await pixelCentre();
  dire(Math.abs(pixelApresUnUndo[0] - pixelExpo[0]) > 5,
       'le premier Ctrl+Z annule deja le reglage (retour vers la valeur neutre)');
  dire((await layerIds()).length === 2, 'le calque, lui, est encore la apres ce seul undo');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  dire((await layerIds()).length === 1, 'le second Ctrl+Z retire le calque ajoute');

  console.log('\n[6] Ctrl+Maj+Z retablit les deux etapes dans l ordre inverse');
  await page.keyboard.press('Control+Shift+Z');
  await page.waitForTimeout(200);
  dire((await layerIds()).length === 2, 'le calque revient');
  await page.keyboard.press('Control+Shift+Z');
  await page.waitForTimeout(200);
  const pixelApresRedo = await pixelCentre();
  dire(Math.abs(pixelApresRedo[0] - pixelExpo[0]) < 3, 'et le reglage d exposition avec lui');

  console.log('\n[7] cliquer une entree de l Historique saute directement a cet etat');
  await page.click('[role="tab"]:has-text("Historique")');
  await page.click('[data-history] button:has-text("Ouverture")');
  await page.waitForTimeout(200);
  dire((await layerIds()).length === 1, 'retour au calque de base seul, en un clic');
  await page.click('[role="tab"]:has-text("Préréglages")');

  console.log('\n[8] un preregle s applique au calque selectionne en un seul geste groupe');
  const idBase = (await layerIds())[0];
  await page.click(`[data-layer="${idBase}"] button[aria-pressed]`);
  const avantPreset = await pixelCentre();
  await page.click('[data-presets] button:has-text("Chaud")');
  await page.waitForTimeout(200);
  const apresPreset = await pixelCentre();
  dire(JSON.stringify(avantPreset) !== JSON.stringify(apresPreset), 'le preregle change vraiment le rendu');
  await page.click('[role="tab"]:has-text("Historique")');
  const histoApresPreset = await page.$$eval('[data-history] button', e => e.map(x => x.textContent));
  dire(histoApresPreset.some(t => t.includes('Préréglage appliqué')), 'et porte son propre libelle d historique');
  await page.click('[role="tab"]:has-text("Préréglages")');

  console.log('\n[8bis] Colorimétrie avancée : courbes (RGB + par canal), niveaux, HSL par bande');
  const details = page.locator('details.adv:has-text("Colorimétrie avancée")');
  await details.locator('summary').click();
  await page.waitForTimeout(200);
  dire(await vu('details.adv[open]'), 'le panneau se déplie');

  const svg = details.locator('svg[role="img"]').first();
  // le panneau scrolle (aside overflow-y-auto) — sans ce scroll explicite,
  // le SVG mesure une position hors du viewport visible et un clic à ses
  // coordonnées nominales n'atteint rien (piège trouvé en testant : aucun
  // point ajouté, aucune erreur non plus, juste un geste qui ne fait rien).
  await svg.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const curveBox = await svg.boundingBox();
  const dragCurveMidpointUp = async () => {
    const midX = curveBox.x + curveBox.width * 0.5;
    const midY = curveBox.y + curveBox.height * 0.5;
    await page.mouse.move(midX, midY);
    await page.mouse.down();
    await page.mouse.move(midX, midY - curveBox.height * 0.25, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  };

  const avantCourbeRgb = await pixelCentre();
  await dragCurveMidpointUp();
  const apresCourbeRgb = await pixelCentre();
  dire(JSON.stringify(avantCourbeRgb) !== JSON.stringify(apresCourbeRgb),
       `la courbe RGB change vraiment les pixels (${avantCourbeRgb} -> ${apresCourbeRgb})`);
  const circlesRgb = await svg.locator('circle').count();
  dire(circlesRgb === 6, `un point ajouté (2 cercles par point — visible + cible tactile), ${circlesRgb} cercles pour 3 points`);

  await details.getByRole('tab', { name: 'R', exact: true }).click();
  await page.waitForTimeout(150);
  const avantCourbeR = await pixelCentre();
  await dragCurveMidpointUp();
  const apresCourbeR = await pixelCentre();
  dire(apresCourbeR[0] > avantCourbeR[0] && apresCourbeR[2] === avantCourbeR[2],
       `la courbe du canal R n'affecte QUE le rouge (rouge ${avantCourbeR[0]}->${apresCourbeR[0]}, bleu ${avantCourbeR[2]}->${apresCourbeR[2]} inchangé)`);

  const avantNiveaux = await pixelCentre();
  const blackSlider = page.locator('#pe-levelBlack');
  await blackSlider.scrollIntoViewIfNeeded();
  await regler('#pe-levelBlack', 20);
  await page.waitForTimeout(250);
  const apresNiveaux = await pixelCentre();
  dire(JSON.stringify(avantNiveaux) !== JSON.stringify(apresNiveaux), 'le point noir des niveaux change aussi les pixels');

  const hueField = page.locator('[data-hsl-band="rouges"] input').first();
  await hueField.scrollIntoViewIfNeeded();
  await hueField.fill('12');
  await hueField.blur();
  await page.waitForTimeout(200);
  dire((await hueField.inputValue()) === '12', 'le champ teinte de la bande "rouges" retient la valeur saisie');

  console.log('\n[8ter] Recadrage avancé : perspective H/V deforme et laisse des coins transparents');
  const perspDetails = page.locator('details.adv:has-text("Recadrage avancé")');
  await perspDetails.locator('summary').click();
  await page.waitForTimeout(200);
  const cornerAlpha = () => page.evaluate(() => {
    const c = document.querySelector('#peCanvas');
    return c.getContext('2d').getImageData(2, 2, 1, 1).data[3];
  });
  const alphaAvant = await cornerAlpha();
  dire(alphaAvant === 255, `coin plein avant toute perspective (alpha ${alphaAvant})`);
  const perspHSlider = page.locator('#pe-perspH');
  await perspHSlider.scrollIntoViewIfNeeded();
  await regler('#pe-perspH', 30);
  await page.waitForTimeout(300);
  const alphaApres = await cornerAlpha();
  dire(alphaApres === 0, `coin transparent a l extreme (alpha ${alphaApres}) — pas de recadrage automatique`);
  await regler('#pe-perspH', 0);
  await page.waitForTimeout(300);
  const alphaReset = await cornerAlpha();
  dire(alphaReset === 255, `revient plein a 0° (alpha ${alphaReset})`);

  console.log('\n[8quater] Netteté / flou sélectif : contraste local monte, masque pinceau limite le flou a sa zone');
  // variance locale d'un patch 5x5 — netteté ET flou changent le CONTRASTE
  // local, une seule valeur de pixel ne le montre pas de façon fiable
  const patchVariance = (x, y) => page.evaluate(([x, y]) => {
    const c = document.querySelector('#peCanvas');
    const { data } = c.getContext('2d').getImageData(x - 2, y - 2, 5, 5);
    const vals = [];
    for (let i = 0; i < data.length; i += 4) vals.push(data[i]);
    const moyenne = vals.reduce((a, b) => a + b, 0) / vals.length;
    return vals.reduce((a, b) => a + (b - moyenne) ** 2, 0) / vals.length;
  }, [x, y]);
  const cxCanvas = await page.evaluate(() => Math.floor(document.querySelector('#peCanvas').width / 2));
  const cyCanvas = await page.evaluate(() => Math.floor(document.querySelector('#peCanvas').height / 2));

  const netteteDetails = page.locator('details.adv:has-text("Netteté / flou sélectif")');
  await netteteDetails.locator('summary').click();
  await page.waitForTimeout(200);
  const varAvantNettete = await patchVariance(cxCanvas, cyCanvas);
  const sharpenSlider = page.locator('#pe-sharpen');
  await sharpenSlider.scrollIntoViewIfNeeded();
  await regler('#pe-sharpen', 100);
  await page.waitForTimeout(300);
  const varApresNettete = await patchVariance(cxCanvas, cyCanvas);
  dire(varApresNettete > varAvantNettete,
       `la nettete accentue le contraste local (variance ${varAvantNettete.toFixed(1)} -> ${varApresNettete.toFixed(1)})`);
  await regler('#pe-sharpen', 0);
  await page.waitForTimeout(200);

  await page.locator('label:has-text("flou sélectif") input[type=checkbox]').check();
  await page.waitForTimeout(200);
  const blurStrengthSlider = page.locator('#pe-blur-strength');
  await blurStrengthSlider.scrollIntoViewIfNeeded();
  await regler('#pe-blur-strength', 100);
  await regler('#pe-blur-radius', 12);
  await page.waitForTimeout(200);
  const varZonePeinteAvant = await patchVariance(cxCanvas, cyCanvas);
  const varZoneLoinAvant = await patchVariance(20, 20);

  // scope au panneau Netteté/flou : la Retouche IA porte le MEME bouton
  // (sélecteur de masque partagé), `page.locator` seul matcherait les deux
  const editBtn = netteteDetails.locator('button:has-text("Modifier sur l’aperçu")');
  await editBtn.scrollIntoViewIfNeeded();
  await editBtn.click();
  await page.waitForTimeout(200);
  dire(await vu('text=glisser sur l’image'), 'le bandeau de mode edition de masque apparait');
  const canvasBox = await page.locator('#peCanvas').boundingBox();
  const cxEcran = canvasBox.x + cxCanvas;
  const cyEcran = canvasBox.y + cyCanvas;
  await page.mouse.move(cxEcran - 40, cyEcran);
  await page.mouse.down();
  await page.mouse.move(cxEcran, cyEcran, { steps: 6 });
  await page.mouse.move(cxEcran + 40, cyEcran, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Terminé")').click();
  await page.waitForTimeout(300);

  const varZonePeinteApres = await patchVariance(cxCanvas, cyCanvas);
  const varZoneLoinApres = await patchVariance(20, 20);
  dire(varZonePeinteApres < varZonePeinteAvant,
       `la zone peinte est floutee (variance ${varZonePeinteAvant.toFixed(1)} -> ${varZonePeinteApres.toFixed(1)})`);
  dire(Math.abs(varZoneLoinApres - varZoneLoinAvant) < 5,
       `une zone hors du trait n'est pas affectee (${varZoneLoinAvant.toFixed(1)} -> ${varZoneLoinApres.toFixed(1)})`);

  // scope au meme panneau, pour la meme raison que editBtn ci-dessus
  await netteteDetails.locator('text=effacer le masque').click();
  await page.waitForTimeout(300);
  const varApresEffacement = await patchVariance(cxCanvas, cyCanvas);
  dire(Math.abs(varApresEffacement - varZonePeinteAvant) < 5,
       'effacer le masque retire le flou (variance revenue proche de l originale)');

  console.log('\n[8quinquies] Retouche IA : maquettee, VOLONTAIREMENT inerte (design-pass §7b)');
  const iaDetails = page.locator('details.adv:has-text("Retouche IA")');
  await iaDetails.locator('summary').click();
  await page.waitForTimeout(200);
  dire(await vu('text=bientôt'), 'badge "bientôt" visible');
  const genererBtn = page.locator('button:has-text("Générer la retouche")');
  dire(await genererBtn.isDisabled(), 'bouton "Générer la retouche" desactive');
  const hintIa = await genererBtn.getAttribute('data-hint-text');
  dire(hintIa === "Backend d'édition IA pas encore branché (F5.2) — l'interface est prête à recevoir le résultat",
       `data-hint-text porte la raison exacte du design-pass (${hintIa})`);
  dire(!(await genererBtn.getAttribute('title')), 'jamais un `title` (CLAUDE.md §3) — data-hint-text seulement');
  await page.locator('textarea#pe-ai-prompt').fill('retirer la tache sur le mur');
  dire((await page.locator('textarea#pe-ai-prompt').inputValue()) === 'retirer la tache sur le mur',
       'le champ instruction retient le texte saisi (sans consequence, le bouton reste inerte)');

  console.log('\n[9] reordonner, masquer, supprimer un calque non-base — jamais la base elle-meme');
  await page.click('button:has-text("+ Ajouter un calque")');
  await page.waitForSelector('#addLayerBox[open]');
  await page.click('#addLayerBox button[role="menuitem"]:has-text("Image")');
  await page.waitForTimeout(200);
  let ids = await layerIds();
  dire(ids.length === 2 && ids[0] !== idBase, 'le nouveau calque arrive EN HAUT de la liste');
  const idHaut = ids[0];
  dire(!(await vu(`[data-layer="${idBase}"] button[aria-label="Supprimer le calque"]`)),
       'la base ne propose aucun bouton supprimer');
  await page.click(`[data-layer="${idHaut}"] button[aria-label="Masquer le calque"]`);
  await page.waitForTimeout(200);
  dire(await vu(`[data-layer="${idHaut}"] button[aria-label="Afficher le calque"]`),
       'masquer bascule bien l icone (◉ -> ◌)');
  await page.click(`[data-layer="${idHaut}"] button[aria-label="Afficher le calque"]`);
  await page.waitForTimeout(200);
  await page.click(`[data-layer="${idHaut}"] button[aria-label="Supprimer le calque"]`);
  await page.waitForTimeout(200);
  ids = await layerIds();
  dire(ids.length === 1 && ids[0] === idBase, 'supprime : un seul calque restant, la base');

  console.log('\n[10] avant/après (design-pass, meme contrat que le modal simplifie) : colorimetrie seule');
  await page.click('[data-presets] button:has-text("Chaud")'); // re-applique un reglage visible sur la base
  await page.waitForTimeout(200);
  const pixelRegle = await pixelCentre();
  dire((await page.getAttribute('button:has-text("Avant / après")', 'aria-pressed')) === 'false',
       'relache au depart');
  await page.click('button:has-text("Avant / après")');
  await page.waitForTimeout(200);
  dire((await page.getAttribute('button:has-text("Afficher les réglages")', 'aria-pressed')) === 'true',
       'enfonce apres un clic, le libelle change');
  const pixelAvantApres = await pixelCentre();
  dire(JSON.stringify(pixelAvantApres) !== JSON.stringify(pixelRegle), 'le rendu redevient neutre');
  await page.click('button:has-text("Afficher les réglages")');
  await page.waitForTimeout(200);

  console.log('\n[11] "Écraser la source…" confirme, dit les memes 3 consequences que le modal — et on ANNULE toujours');
  await page.click('button:has-text("Écraser la source…")');
  await page.waitForSelector('#armBox[open]');
  const conf = await page.textContent('#armBox');
  dire(conf.includes('plus récupérable'), "elle dit que l'original est perdu");
  dire(conf.includes('non mesurée'), 'que les mesures de realisme sont effacees');
  dire(conf.includes('garde l’original intact') || conf.includes("garde l'original intact"),
       'et rappelle que la copie, elle, ne detruit rien');
  await page.click('#cfNon');
  await page.waitForTimeout(300);
  dire(!(await vu('#armBox[open]')), 'annulee : la boite se referme');
  dire(await noms().then(n => n.includes(SOURCE)), 'et le fichier source est intact');

  console.log('\n[12] "Enregistrer une copie" : aller-retour complet par l API reelle');
  const avantCopie = await noms();
  await page.click('button:has-text("Enregistrer une copie")');
  await page.waitForTimeout(2500);
  dire(!(await vu('text=modifications non enregistrées')), 'la copie enregistree efface l indicateur dirty');
  const apresCopie = await noms();
  const copie = apresCopie.find(n => !avantCopie.includes(n));
  if (copie) jetables.add(copie);
  dire(Boolean(copie), `une copie est apparue : ${copie}`);
  dire(Boolean(copie) && copie.includes('_edit'), 'son nom porte bien `_edit`');
  dire(apresCopie.includes(SOURCE), "la SOURCE reste intacte, ce n'est jamais un ecrasement");

  console.log('\n[13] NETTOYAGE : la copie est supprimee via l API (aucun bouton dedie sur cet ecran)');
  if (copie) {
    const suppression = await page.evaluate(async (nom) => {
      const r = await fetch('/api/delete?character=lena', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nom, bucket: 'OK', space: 'sfw' }),
      });
      return r.ok;
    }, copie);
    dire(suppression, 'suppression acceptee par le serveur');
    const final = await noms();
    dire(!final.includes(copie), 'la copie a bien disparu de la Galerie');
  }

  console.log('\n[14] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '[garde] aucune image reelle supprimee');
  dire(volsDeDonnees.length === 0,
       volsDeDonnees.length
         ? 'SUPPRESSION NON PREVUE : ' + volsDeDonnees.join(', ')
         : 'aucun /api/delete hors des fichiers crees par le test');

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
