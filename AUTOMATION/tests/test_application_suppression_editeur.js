/* Fumigation NAVIGATEUR des quatre ajouts du 26/08/2026 : banque de poses
   (presence UI), suppression definitive, ecran Application, editeur photo.

   PRUDENCE PARTICULIERE : les boutons Arret/Redemarrage de l'ecran Application
   sont REELS. Ce test ouvre leur modale de confirmation pour verifier qu'elle
   existe puis l'ANNULE SYSTEMATIQUEMENT sans jamais confirmer — sinon il
   couperait le serveur qu'il est en train de tester.

   Cree une image jetable dans PROD/LENA/A_REVOIR/ (_TEST_EDITEUR_temp.png),
   l'edite via le vrai canvas, enregistre la copie, puis supprime les DEUX
   fichiers pour de bon via le bouton de suppression — rien ne doit rester sur
   le disque a la fin, verifie en dernier.

   PREREQUIS (hors du repo, qui n'a aucune dependance) :
     1. python web/app.py --no-comfy --no-browser
     2. npm i playwright && npx playwright install chromium
     3. node tests/test_application_suppression_editeur.js

   Le test s'amorce lui-meme : il copie une vraie sortie de PROD/LENA/OK/ vers
   PROD/LENA/A_REVOIR/_TEST_EDITEUR_temp.png (l'editeur a besoin d'une image
   4:5 valide), et supprime tout artefact en `finally` — au cas ou [7] (qui
   supprime via l'UI, ce qu'il teste) n'irait pas au bout. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }
const fs = require('fs');
const path = require('path');
const B = process.env.DASHBOARD_URL || 'http://127.0.0.1:8189';
const TEST_IMG = '_TEST_EDITEUR_temp.png';

const A_REVOIR = path.resolve(__dirname, '../../PROD/LENA/A_REVOIR');
const OK_DIR = path.resolve(__dirname, '../../PROD/LENA/OK');
const nettoyer = () => {
  try {
    for (const n of fs.readdirSync(A_REVOIR))
      if (n.includes('_TEST_EDITEUR_temp')) fs.rmSync(path.join(A_REVOIR, n), { force: true });
  } catch { /* dossier absent : rien a nettoyer */ }
};

// amorce : une vraie image 4:5 (l'editeur canvas + les checks de ratio en ont besoin)
const sources = (() => { try { return fs.readdirSync(OK_DIR).filter(n => n.endsWith('.png')); }
                         catch { return []; } })();
if (!sources.length) {
  console.log('  IGNORE — aucune image dans PROD/LENA/OK/ pour amorcer le test');
  process.exit(0);
}
nettoyer();
fs.mkdirSync(A_REVOIR, { recursive: true });
fs.copyFileSync(path.join(OK_DIR, sources[0]), path.join(A_REVOIR, TEST_IMG));
// filet de securite : [7] supprime via l'UI (ce qu'il teste) ; ceci rattrape
// un artefact laisse par un echec en cours de route, quoi qu'il arrive.
process.on('exit', nettoyer);

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage();
  const err = []; page.on('pageerror', e => err.push(e.message));
  let ko = 0; const dire = (ok, t) => { console.log(`  ${ok?'ok  ':'KO  '}${t}`); if(!ok) ko++; };

  await page.goto(B + '/?character=lena', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // ============================================================== POSES
  console.log('\n[1] banque de poses (ecran Scenes, sous-vue Poses)');
  await page.click('.tabs button[data-s="scenes"]');
  await page.waitForTimeout(700);
  // Depuis le 29/08/2026 la banque a deux sous-vues : l'onglet Banque ouvre
  // toujours « Scenes », les squelettes vivent sous « Poses ».
  await page.click('#bankView button[data-vue="poses"]');
  await page.waitForTimeout(400);
  dire(await page.isVisible('#poseGrid'), 'la grille de squelettes est visible');
  const nPoses = await page.$$eval('#poseGrid .posecard', e => e.length);
  dire(nPoses >= 2, `${nPoses} squelette(s) affiché(s)`);
  dire(await page.isVisible('label[for="poseFile"]'), 'le sélecteur de fichier est présent');
  dire(await page.isDisabled('#btnPoseExtract'), 'le bouton extraire est inactif sans fichier choisi');

  // ============================================================ APPLICATION
  console.log('\n[2] écran Application — présence, PAS d\'exécution');
  await page.click('.tabs button[data-s="appli"]');
  await page.waitForTimeout(500);
  dire(await page.isVisible('#btnAppRestart'), 'bouton redémarrer (dashboard)');
  dire(await page.isVisible('#btnAppStop'), 'bouton arrêter (dashboard)');
  dire(await page.isVisible('#btnComfyRestart'), 'bouton redémarrer (ComfyUI)');
  dire(await page.isVisible('#btnComfyStop'), 'bouton arrêter (ComfyUI)');
  const etat = (await page.textContent('#comfyEtat') || '').trim();
  dire(/en ligne|hors ligne/.test(etat), `état de ComfyUI affiché : « ${etat} »`);

  console.log('\n[3] le bouton "Arrêter le tableau de bord" ouvre une confirmation — ANNULÉE');
  await page.click('#btnAppStop');
  await page.waitForTimeout(400);
  dire(await page.isVisible('#armBox[open], #armCard'), 'une modale de confirmation apparaît');
  const texteConfirm = (await page.textContent('#armCard') || '');
  dire(/Coupe le serveur/.test(texteConfirm), 'le texte prévient des conséquences');
  await page.click('#cfNon');   // ANNULER — ne jamais confirmer dans ce test
  await page.waitForTimeout(300);
  dire(await page.isVisible('#appli'), 'toujours sur le tableau de bord — rien n’a été coupé');

  console.log('\n[4] le bouton "Arrêter ComfyUI" ouvre aussi une confirmation — ANNULÉE');
  await page.click('#btnComfyStop');
  await page.waitForTimeout(400);
  dire(await page.isVisible('#armCard'), 'confirmation affichée');
  await page.click('#cfNon');
  await page.waitForTimeout(300);

  // Verifier via l'API que rien n'a bouge (aucun appel n'est parti)
  const etatServeur = await page.evaluate(() => fetch('/api/state').then(r => r.ok));
  dire(etatServeur, 'le serveur répond toujours normalement après les deux annulations');

  // =================================================================== REVUE
  console.log('\n[5] ouverture de la Revue sur l’image de test');
  await page.click('.tabs button[data-s="trier"]');
  await page.waitForTimeout(600);
  // bascule sur A_REVOIR si pas deja dessus, et vue Grille -> chercher la tuile
  await page.evaluate(() => { if (typeof setScoreFilter === 'function') setScoreFilter('tout'); });
  await page.waitForTimeout(400);
  const tuile = page.locator('.tile').filter({ has: page.locator(`img[src*="${TEST_IMG}"]`) });
  const compteTuile = await tuile.count();
  dire(compteTuile > 0, `la tuile de test est visible en grille (${compteTuile})`);
  if (compteTuile > 0) {
    await tuile.first().locator('img').click();
    await page.waitForTimeout(500);
    dire(await page.isVisible('#btnOuvrirEditeur'), 'bouton Éditer visible en vue loupe');
    dire(await page.isVisible('#btnSupprDef'), 'bouton Supprimer définitivement visible en vue loupe');
  }

  // =================================================================== EDITEUR
  console.log('\n[6] éditeur — ouverture, ajustements, recadrage, enregistrement');
  await page.click('#btnOuvrirEditeur');
  await page.waitForTimeout(900);
  dire(await page.isVisible('#editorBox.on, #editorBox'), 'le panneau éditeur s’ouvre');
  dire(await page.locator('#editorBox').evaluate(e => e.classList.contains('on')), 'classe .on posée');
  // l'editeur est un MODE, pas une overlay : le chrome reste visible et le
  // contexte personnage n'est pas perdu
  dire(await page.isVisible('.tabs'), 'la nav du chrome reste visible pendant l’édition');
  dire(await page.evaluate(() => document.body.classList.contains('editing')), 'body.editing posé');
  dire((await page.evaluate(() => location.search)).includes('character=lena'),
       'le contexte personnage (?character=lena) est conservé');
  const cvW = await page.locator('#edCanvas').evaluate(c => c.width);
  dire(cvW > 0, `le canvas est dimensionné (${cvW}px de large)`);
  dire(await page.isVisible('#edCropBox'), 'le cadre de recadrage est affiché');

  // ratio 1:1 — depuis J3 (modules ES) l'etat de l'editeur n'est plus global :
  // on lit la geometrie rendue de #edCropBox au lieu de ED_CROP
  await page.click('#edRatio button[data-r="1:1"]');
  await page.waitForTimeout(200);
  const cropDims = await page.locator('#edCropBox').boundingBox();
  dire(Math.abs(cropDims.width - cropDims.height) < 2,
       `ratio 1:1 respecté (${cropDims.width.toFixed(1)}x${cropDims.height.toFixed(1)})`);

  // rotation — sur une image non carrée (1080x1350), une rotation 90° inverse
  // l'orientation du canvas (le cadre est re-ajuste au stage, donc les dims ne
  // sont pas simplement echangees, mais le rapport L/H, lui, s'inverse) ;
  // c'est l'effet observable de ED_ROT
  const cvAvant = await page.locator('#edCanvas').evaluate(c => ({ w: c.width, h: c.height }));
  await page.click('#edRotR');
  await page.waitForTimeout(250);
  const cvApres = await page.locator('#edCanvas').evaluate(c => ({ w: c.width, h: c.height }));
  const ratioAvant = cvAvant.w / cvAvant.h, ratioApres = cvApres.w / cvApres.h;
  dire(Math.abs(ratioApres - 1 / ratioAvant) < 0.08,
       `rotation appliquée : canvas ${cvAvant.w}x${cvAvant.h} (${ratioAvant.toFixed(2)}) -> ` +
       `${cvApres.w}x${cvApres.h} (${ratioApres.toFixed(2)})`);

  // curseurs
  await page.fill('#edBright', '30');
  await page.dispatchEvent('#edBright', 'input');
  await page.waitForTimeout(150);
  dire((await page.textContent('#v_edBright')).trim() === '30', 'étiquette luminosité suit le curseur');

  await page.fill('#edGrain', '50');
  await page.dispatchEvent('#edGrain', 'input');
  await page.waitForTimeout(150);
  dire((await page.textContent('#v_edGrain')).trim() === '50', 'étiquette grain suit le curseur');

  // deplacement du cadre de recadrage (drag) — position rendue de #edCropBox
  const box = await page.locator('#edCropBox').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 15, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const boxApres = await page.locator('#edCropBox').boundingBox();
  dire(Math.abs(boxApres.x - box.x) > 2 || Math.abs(boxApres.y - box.y) > 2,
       `le cadre de recadrage se déplace au glisser (${box.x.toFixed(0)},${box.y.toFixed(0)} -> ${boxApres.x.toFixed(0)},${boxApres.y.toFixed(0)})`);

  // enregistrement
  await page.click('#edSave');
  await page.waitForTimeout(1500);
  dire(!(await page.locator('#editorBox').evaluate(e => e.classList.contains('on'))),
       'le panneau se ferme après enregistrement');
  dire(await page.isVisible('#trier'), 'retour sur l’écran d’où l’éditeur a été ouvert (Revue)');
  dire(!(await page.evaluate(() => document.body.classList.contains('editing'))),
       'body.editing retiré à la fermeture');
  const nouveauxFichiers = await page.evaluate(() =>
    fetch('/api/gallery?bucket=A_REVOIR&space=lena').then(r => r.json())
      .then(d => d.items.filter(i => i.name.includes('_TEST_EDITEUR_temp_edit')).map(i => i.name)));
  dire(nouveauxFichiers.length > 0, `copie éditée créée : ${nouveauxFichiers.join(', ') || 'AUCUNE'}`);

  // =================================================== SUPPRESSION DEFINITIVE
  console.log('\n[7] suppression définitive — nettoyage des artefacts de test');
  let restant = 999, boucle = 0;
  while (restant > 0 && boucle < 6) {
    await page.click('.tabs button[data-s="trier"]');
    await page.waitForTimeout(500);
    const cible = page.locator('.tile').filter({ hasText: '' })
      .locator('img[src*="_TEST_EDITEUR_temp"]');
    const n = await cible.count();
    restant = n;
    if (n === 0) break;
    // cliquer le bouton supprimer (poubelle) de la premiere tuile de test trouvee
    const tileEl = page.locator('.tile').filter({ has: page.locator('img[src*="_TEST_EDITEUR_temp"]') }).first();
    await tileEl.locator('[data-suppr]').click();
    await page.waitForTimeout(300);
    dire(await page.isVisible('#armCard'), `confirmation de suppression affichée (passage ${boucle + 1})`);
    await page.click('#cfOui');   // ICI on confirme : ce sont nos fichiers de test
    await page.waitForTimeout(700);
    boucle++;
  }
  const resteApres = await page.evaluate(() =>
    fetch('/api/gallery?bucket=A_REVOIR&space=lena').then(r => r.json())
      .then(d => d.items.filter(i => i.name.includes('_TEST_EDITEUR_temp')).length));
  dire(resteApres === 0, 'plus aucun artefact de test sur le disque après nettoyage');

  console.log('\n  erreurs JS : ' + (err.length ? err.join(' | ') : 'aucune'));
  if (err.length) ko++;
  console.log(`\n${ko ? ko + ' ECHEC(S)' : 'tout est vert'}`);
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
