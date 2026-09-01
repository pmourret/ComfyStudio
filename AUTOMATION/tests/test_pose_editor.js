/* Browser smoke test of the pose EDITOR — point-by-point correction, distinct
   from test_pose_extract.js (extraction from a photo). No ComfyUI needed: the
   rendered PNG is pure local drawing (pose_render.py), so this test runs even
   with ComfyUI offline — unlike its extraction sibling.

   Covers, in order: preset → canvas → drag → keyboard nudge → save → the
   bank picks it up → reached again via its OWN "editer" link (not just the
   post-save redirect) → a pose from BEFORE this feature existed (no JSON
   sidecar) fails softly, not with a crash → usable from the scene composer's
   Pose tab modal, without leaving the scene.

   IT CLEANS UP. The pose it creates is removed through the interface at the
   end; the bank is checked to be back to its starting list — the same guard
   as test_pose_extract.js: only ever delete what THIS run created, then
   confirm nothing else moved. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1500, height: 950 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const squelettes = () => page.$$eval('#poseGrid [data-pose-card]', e => e.map(x => x.dataset.n));
  const circles = () => page.$$eval('#poseEditor svg circle', e => e.length);

  console.log('\n[1] la banque de poses propose "+ Nouvelle pose"');
  await page.goto(BASE + '/bank/poses?character=lena', { waitUntil: 'networkidle' });
  await page.waitForSelector('#poseGrid');
  const avant = await squelettes();
  const lienNeuf = await page.$('a:has-text("Nouvelle pose")');
  dire(Boolean(lienNeuf), 'le lien est present');
  await lienNeuf.click();

  console.log('\n[2] choix d un gabarit — aucune photo, coordonnees inventees');
  await page.waitForSelector('#poseEditor');
  await page.waitForTimeout(300);
  const gabarits = await page.$$eval('#poseEditor button', e => e.map(x => x.textContent));
  dire(gabarits.includes('Debout'), `le gabarit "Debout" est propose (${gabarits})`);
  await page.click('button:has-text("Debout")');
  await page.waitForTimeout(500);

  console.log('\n[3] le squelette se dessine au complet (corps + 2 mains)');
  dire(Boolean(await page.$('#poseEditor svg')), 'le canvas SVG est present');
  dire((await circles()) === 18 + 21 + 21, `18+21+21 joints geres (${await circles()})`);

  console.log('\n[4] glisser un joint le deplace et arme "non enregistre"');
  const premier = await page.$('#poseEditor svg circle');
  const boite = await premier.boundingBox();
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  await page.mouse.move(boite.x + boite.width / 2 + 40, boite.y + boite.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  dire(Boolean(await page.$('text=modifications non enregistrées')),
       'le drapeau "modifications non enregistrees" apparait');

  console.log('\n[5] un joint selectionne se corrige aussi au clavier');
  // Regression 2026-09-02 : preventDefault() sur pointerdown annulait le focus
  // par defaut du navigateur -> les fleches ne trouvaient plus de cible. Le
  // drapeau "non enregistre" est deja arme par [4] : on verifie ici que le
  // joint bouge REELLEMENT (cx avance de 2px pour 2x ArrowRight), pas juste
  // que le drapeau reste leve.
  const autreJoint = (await page.$$('#poseEditor svg circle'))[5];
  const cxAvant = await autreJoint.getAttribute('cx');
  const jbox = await autreJoint.boundingBox();
  await page.mouse.click(jbox.x + jbox.width / 2, jbox.y + jbox.height / 2);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const cxApres = await autreJoint.getAttribute('cx');
  dire(Number(cxApres) === Number(cxAvant) + 2,
       `2x fleche droite avance le joint de 2px (${cxAvant} -> ${cxApres})`);

  console.log('\n[6] sauvegarde — redirige vers la pose reellement ecrite');
  await page.click('button:has-text("Enregistrer")');
  await page.waitForFunction(() => location.pathname.includes('/bank/poses/edit/'), null, { timeout: 5000 });
  const nouveau = decodeURIComponent(new URL(page.url()).pathname.split('/').pop());
  dire(nouveau.startsWith('pose__') && nouveau.endsWith('.png'), `nom recu : ${nouveau}`);
  dire((await page.textContent('aside b')) === nouveau, 'le panneau affiche ce nom');

  console.log('\n[7] la banque la montre, AVEC son propre lien "editer"');
  await page.click('a:has-text("Retour à la banque")');
  await page.waitForSelector('#poseGrid');
  await page.waitForTimeout(300);
  const apres = await squelettes();
  dire(apres.includes(nouveau), 'la nouvelle pose est dans la banque');
  const lienEditer = await page.$(`[data-pose-card][data-n="${nouveau}"] a:has-text("éditer")`);
  dire(Boolean(lienEditer), 'sa carte porte un lien "editer"');
  await lienEditer.click();
  await page.waitForSelector('#poseEditor svg');
  dire((await page.textContent('aside b')) === nouveau,
       'suivre ce lien (pas juste la redirection de sauvegarde) rouvre la meme pose');

  console.log('\n[8] une pose SANS points-cles (anterieure a cette fonctionnalite) echoue sans crash');
  // pas de nouvelle pose sans JSON dans ce test : celles deja en banque avant
  // ce chantier n'ont pas de sidecar, s'il en reste au moins une on la prend.
  const sansPoints = avant.find(n => n !== nouveau);
  if (sansPoints) {
    await page.goto(BASE + `/bank/poses/edit/${encodeURIComponent(sansPoints)}?character=lena`,
                     { waitUntil: 'networkidle' });
    await page.waitForSelector('#poseEditor');
    await page.waitForTimeout(400);
    dire(!(await page.$('#poseEditor svg')), 'pas de canvas affiche');
    dire((await page.textContent('.empty')).length > 0, 'un message explicite remplace le crash');
  } else {
    console.log('   (ignore — aucune pose sans sidecar en banque pour ce cas)');
  }

  console.log('\n[9] modale depuis le compositeur : editable sans quitter la scene');
  await page.goto(BASE + '/bank/scenes?character=lena', { waitUntil: 'networkidle' });
  await page.click('[data-scene-card]');
  await page.waitForSelector('#sceneInspector');
  await page.click('[data-tab="pose"]');
  await page.waitForSelector('[data-tabpanel="pose"]');
  const vignette = await page.$(`[data-tabpanel="pose"] button[title="${nouveau}"]`);
  dire(Boolean(vignette), 'la pose creee est choisissable dans le compositeur');
  await vignette.click();
  await page.waitForTimeout(200);
  const crayon = await page.$('[data-tabpanel="pose"] button[aria-label*="point par point"]');
  dire(Boolean(crayon), 'un bouton crayon apparait une fois la pose choisie');
  await crayon.click();
  await page.waitForSelector('#poseEditorModal[open]');
  await page.waitForTimeout(400);
  dire(Boolean(await page.$('#poseEditorModal svg')), 'la modale rend le meme canvas');
  await page.click('#poseModalClose');
  await page.waitForTimeout(200);
  dire(!(await page.isVisible('#poseEditorModal[open]')), 'fermer la modale ne quitte pas la scene');
  dire((await page.evaluate(() => location.pathname)).startsWith('/bank/scenes'), 'toujours sur la scene');

  console.log('\n[10] NETTOYAGE : seule la pose creee ici est retiree');
  await page.click('#bankView [data-vue="poses"]');
  await page.waitForSelector('#poseGrid');
  await page.click(`[data-pose-card][data-n="${nouveau}"] [data-del]`);
  await page.waitForSelector('#armBox[open]');
  await page.click('#cfOui');
  await page.waitForTimeout(800);
  const final = await squelettes();
  dire(!final.includes(nouveau), 'la pose creee par ce test a disparu');
  dire(final.length === avant.length && final.every(n => avant.includes(n)),
       `la banque est revenue a son etat de depart (${final.length} squelette(s))`);

  console.log('\n[11] aucune erreur JS reelle sur tout le parcours');
  /* [8] fait volontairement echouer une requete (pose sans sidecar -> 404) :
     c'est le comportement VERIFIE, pas un incident. Chromium journalise toute
     reponse 4xx comme une erreur de console (meme test_application.js). */
  const reelles = erreurs.filter(e => !/Failed to load resource.*404/.test(e));
  dire(reelles.length === 0, `${reelles.length} erreur(s)`);
  reelles.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
