/* Fumigation NAVIGATEUR des quatre ajouts du 26/08/2026 : banque de poses
   (presence UI), suppression definitive, ecran Application, editeur photo.

   PRUDENCE PARTICULIERE : les boutons Arret/Redemarrage de l'ecran Application
   sont REELS. Ce test ouvre leur modale de confirmation pour verifier qu'elle
   existe puis l'ANNULE SYSTEMATIQUEMENT sans jamais confirmer — sinon il
   couperait le serveur qu'il est en train de tester.

   Cree une image jetable dans PROD/LENA/A_REVOIR/ (_TEST_EDITEUR_temp.png),
   l'edite via le vrai canvas, enregistre la copie, puis supprime les DEUX
   fichiers pour de bon via le bouton de suppression — rien ne doit rester sur
   le disque a la fin, verifie en dernier. NI EN BASE : la copie editee y a une
   ligne que /api/delete garde volontairement, et c'est au test de la retirer
   (nettoyer_artefacts_test.py, voir plus bas).

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
const { execFileSync } = require('child_process');
const B = process.env.DASHBOARD_URL || 'http://127.0.0.1:8189';
const TEST_IMG = '_TEST_EDITEUR_temp.png';
const PREFIXE = '_TEST_EDITEUR_temp';

const A_REVOIR = path.resolve(__dirname, '../../PROD/LENA/A_REVOIR');
const OK_DIR = path.resolve(__dirname, '../../PROD/LENA/OK');
const RACINE = path.resolve(__dirname, '../..');

/* NETTOYER LES DEUX FACES, pas seulement le disque. Depuis le 30/08/2026 la
   copie editee existe AUSSI en base ; /api/delete efface le fichier et garde
   la ligne, deliberement (voir sa docstring). Ce test laissait donc une ligne
   sans fichier, sans journal et sans mesure, et test_coherence_base [4] la
   signalait — a raison — comme une ecriture parasite : la suite navigateur
   rendait rouge un test qui passait avant elle.

   L'interprete : n'importe lequel fait l'affaire (sqlite3 est standard, rien
   n'y touche au GPU). run_browser_tests.py passe le sien par
   SOULGLADE_PYTHON ; en lancement manuel on retombe sur `python` du PATH. S'il
   n'y en a aucun, on le DIT sans faire echouer le test : c'est du nettoyage,
   pas ce qu'il verifie. */
const PY = process.env.SOULGLADE_PYTHON || 'python';
const nettoyerBase = () => {
  try {
    execFileSync(PY, [path.join('AUTOMATION', 'tests', 'nettoyer_artefacts_test.py'),
                      PREFIXE], { cwd: RACINE, stdio: 'pipe' });
  } catch (e) {
    const dit = String(e.message).split('\n')[0].trim();
    console.log(`  note  lignes de test non effacees en base (${PY} : ${dit})`);
  }
};

const nettoyer = () => {
  try {
    for (const n of fs.readdirSync(A_REVOIR))
      if (n.includes(PREFIXE)) fs.rmSync(path.join(A_REVOIR, n), { force: true });
  } catch { /* dossier absent : rien a nettoyer */ }
  nettoyerBase();
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
  // MODALE depuis le 30/08/2026 : <dialog>.showModal(), donc l'attribut `open`
  // et non plus la classe `.on` d'un .screen
  dire(await page.isVisible('#editorBox'), 'la modale éditeur s’ouvre');
  dire(await page.locator('#editorBox').evaluate(e => e.open), 'le <dialog> est ouvert');
  // une modale couvre le chrome : elle doit donc porter SA sortie, sinon on
  // enferme l'utilisateur (c'est la raison qui faisait de l'editeur un mode)
  dire(await page.isVisible('#edClose'), 'la modale porte sa propre sortie (#edClose)');
  dire(await page.evaluate(() => document.body.classList.contains('editing')), 'body.editing posé');
  dire((await page.evaluate(() => location.search)).includes('character=lena'),
       'le contexte personnage (?character=lena) est conservé');
  const cvW = await page.locator('#edCanvas').evaluate(c => c.width);
  dire(cvW > 0, `le canvas est dimensionné (${cvW}px de large)`);

  /* F3.1 (30/08/2026) — L'EDITEUR S'OUVRE SANS RECADRAGE. Le cadre porte un
     voile de 2000 px : allume d'office, il assombrissait l'image des l'entree,
     pour un geste qu'on ne fait pas a chaque retouche. Le test exigeait
     l'inverse ; c'est la ligne qui a change de sens, pas le reste. */
  dire(!(await page.isVisible('#edCropBox')),
       "a l'ouverture, AUCUN cadre de recadrage — donc aucun voile sur l'image");
  dire((await page.getAttribute('#edCropSec', 'data-on')) === '0',
       'la section Recadrage est en etat « eteint »');
  dire(await page.isVisible('#edCropOn'), 'elle propose le geste « Recadrer »');
  dire(!(await page.isVisible('#edRatio')),
       'et ne montre pas encore les formats');
  // l'action principale se trouve sans defiler : le panneau de reglages est
  // plus haut que la modale, son pied est colle en bas
  const pied = await page.evaluate(() => {
    const s = document.getElementById('edSave').getBoundingClientRect();
    const p = document.querySelector('.edSide').getBoundingClientRect();
    return {dedans: s.bottom <= p.bottom + 1 && s.top >= p.top, bas: Math.round(s.bottom)};
  });
  dire(pied.dedans, `« Enregistrer une copie » est visible sans defiler (bas=${pied.bas})`);

  console.log("\n[6b] « Recadrer » allume le cadre, « annuler » l'éteint");
  await page.click('#edCropOn');
  await page.waitForTimeout(300);
  dire(await page.isVisible('#edCropBox'), 'le cadre de recadrage est affiché');

  /* LE CADRE EST SUR L'IMAGE, pas à côté. Rien ne le vérifiait : le test ne
     comparait #edCropBox qu'à lui-même (avant/après), donc un cadre ancré sur
     le mauvais parent restait invisible pour lui. Mesuré le 30/08 : 332 px de
     décalage, le voile assombrissait toute l'image. */
  const surImage = async () => {
    const cv = await page.locator('#edCanvas').boundingBox();
    const cb = await page.locator('#edCropBox').boundingBox();
    return {cv, cb, dedans: cb.x >= cv.x - 1 && cb.y >= cv.y - 1
      && cb.x + cb.width <= cv.x + cv.width + 1
      && cb.y + cb.height <= cv.y + cv.height + 1};
  };
  const pose = await surImage();
  dire(pose.dedans, `le cadre est dans le canvas — cadre x=${pose.cb.x.toFixed(0)} `
    + `canvas x=${pose.cv.x.toFixed(0)} (décalage ${(pose.cb.x - pose.cv.x).toFixed(0)}px)`);

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

  console.log("\n[6c] miroir : un interrupteur, pas une action à répéter");
  dire((await page.getAttribute('#edFlip', 'aria-pressed')) === 'false',
       "le miroir est relache a l'ouverture");
  await page.click('#edFlip');
  await page.waitForTimeout(200);
  dire((await page.getAttribute('#edFlip', 'aria-pressed')) === 'true',
       "un clic l'enfonce — l'etat se lit, il ne se devine pas");
  await page.click('#edFlip');
  await page.waitForTimeout(200);
  dire((await page.getAttribute('#edFlip', 'aria-pressed')) === 'false',
       'un second clic le relache');

  /* DEPLACEMENT DU CADRE. Le test d'avant acceptait qu'UN SEUL axe bouge
     (`||`) : le ratio 1:1 posé plus haut sur une image 4:5 laisse de la marge
     verticale, donc il passait au vert pendant que l'axe horizontal était
     verrouillé. On exige les DEUX, et on se donne d'abord de la marge par une
     poignée — un cadre qui remplit l'image n'a nulle part où aller, et c'est
     de la géométrie, pas un bug. */
  const grand = await page.locator('#edCropBox').boundingBox();
  await page.mouse.move(grand.x + grand.width, grand.y + grand.height);
  await page.mouse.down();
  await page.mouse.move(grand.x + grand.width - 160, grand.y + grand.height - 200, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const box = await page.locator('#edCropBox').boundingBox();
  dire(box.width < grand.width - 100,
       `la poignée redimensionne (${grand.width.toFixed(0)} -> ${box.width.toFixed(0)}px)`);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 25, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const boxApres = await page.locator('#edCropBox').boundingBox();
  const dx = boxApres.x - box.x, dy = boxApres.y - box.y;
  dire(Math.abs(dx - 40) < 4 && Math.abs(dy - 25) < 4,
       `le cadre suit la souris au pixel près : demandé +40/+25, obtenu ${dx.toFixed(0)}/${dy.toFixed(0)}`);
  dire((await surImage()).dedans, 'et il reste dans le canvas après déplacement');

  /* [6d] VERSIONS (F3.3). Le geste primaire fait un DERIVÉ : deux fichiers
     après, pas un. La source doit rester listée — c'est tout l'intérêt de ne
     pas écraser, et rien ne le vérifiait. */
  console.log('\n[6d] enregistrer une copie : deux noms, la source intacte');
  const lister = () => page.evaluate(() =>
    fetch('/api/gallery?bucket=A_REVOIR&space=sfw&character=lena').then(r => r.json())
      .then(d => d.items.filter(i => i.name.includes('_TEST_EDITEUR_temp')).map(i => i.name)));
  const avantSave = await lister();
  await page.click('#edSave');
  await page.waitForTimeout(1500);
  dire(!(await page.locator('#editorBox').evaluate(e => e.open)),
       'la modale se ferme après enregistrement');
  dire(await page.isVisible('#trier'), 'la Revue est de nouveau accessible dessous');
  dire(!(await page.evaluate(() => document.body.classList.contains('editing'))),
       'body.editing retiré à la fermeture');
  const apresSave = await lister();
  const nouveauxFichiers = apresSave.filter(n => n.includes('_TEST_EDITEUR_temp_edit'));
  dire(nouveauxFichiers.length > 0, `copie éditée créée : ${nouveauxFichiers.join(', ') || 'AUCUNE'}`);
  dire(apresSave.includes(TEST_IMG),
       `la SOURCE est toujours listée (${avantSave.length} -> ${apresSave.length} fichiers)`);

  /* [6e] ÉCRASER LA SOURCE : second rang, et sous confirmation. On vérifie les
     deux moitiés — la porte (une confirmation qui dit ce qu'elle coûte, et un
     refus qui ne touche à rien) puis l'effet (même nom, octets remplacés). Le
     test opère sur SA copie de test, jamais sur une image de production. */
  console.log('\n[6e] écraser la source : confirmé, jamais primaire');
  const cible = nouveauxFichiers[0] || TEST_IMG;
  await page.click('.tabs button[data-s="trier"]');
  await page.waitForTimeout(700);
  const tuileEdit = page.locator('.tile').filter({ has: page.locator(`img[src*="${cible}"]`) });
  await tuileEdit.first().locator('img').click();
  await page.waitForTimeout(600);
  await page.click('#btnOuvrirEditeur');
  await page.waitForTimeout(1200);
  dire(!(await page.locator('#edSave').evaluate(b => b.classList.contains('danger'))) &&
       await page.locator('#edSaveOver').evaluate(b => b.classList.contains('danger')),
       'le geste destructeur n\'est pas le bouton primaire');
  await page.fill('#edBright', '25');
  await page.dispatchEvent('#edBright', 'input');
  await page.click('#edSaveOver');
  await page.waitForTimeout(600);
  dire(await page.locator('#armBox').evaluate(e => e.open),
       'une confirmation s\'ouvre — l\'écrasement n\'est jamais direct');
  const dit = (await page.textContent('#armCard')).replace(/\s+/g, ' ');
  dire(/ne sera plus récupérable/.test(dit) && /mesures/.test(dit),
       'elle dit ce que ça coûte, pas « êtes-vous sûr ? »');
  await page.click('#cfNon');
  await page.waitForTimeout(400);
  dire(await page.locator('#editorBox').evaluate(e => e.open),
       'refuser laisse l\'éditeur ouvert, sans rien écrire');
  const avantEcras = await lister();
  await page.click('#edSaveOver');
  await page.waitForTimeout(500);
  await page.click('#cfOui');
  await page.waitForTimeout(1600);
  const apresEcras = await lister();
  dire(apresEcras.length === avantEcras.length,
       `aucun fichier de plus : ${avantEcras.length} -> ${apresEcras.length}`);
  dire(apresEcras.includes(cible), `« ${cible} » existe toujours, sous le même nom`);
  // le jeton `v` (mtime) suit les octets : sans lui, le navigateur reservirait
  // l'image d'avant sur une URL identique
  const versions = await page.evaluate(n => fetch(
    '/api/gallery?bucket=A_REVOIR&space=sfw&character=lena').then(r => r.json())
      .then(d => (d.items.find(i => i.name === n) || {}).v), cible);
  dire(Number.isFinite(versions) && versions > 0,
       `l'item porte une version d'octets (v=${versions})`);

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
