/* Browser smoke test of the pose BANK's own tooling (2026-09-02) — search,
   provenance/usage filters, sort, a compact/comfortable density toggle, and
   the two mutations beyond a plain list: rename in place and duplicate.
   Distinct from test_pose_editor.js (the editor itself) and
   test_pose_extract.js (extraction) — this one never opens the editor.

   No ComfyUI needed: everything here works off a from-scratch pose (a
   template, never a photo).

   IT CLEANS UP, DETERMINISTICALLY. Every pose this run creates is removed
   through the interface at the end, identified by SET DIFFERENCE against
   the bank's state at the very start — never by name pattern or list
   position. A first version of this exact test guessed instead, matched
   the wrong "duplicate" candidate, and deleted a real, pre-existing pose
   during a live session (2026-09-02). Never again: the guard here compares
   the full name list before and after each mutation. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1400, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const cartes = () => page.$$eval('#poseGrid [data-pose-card]', e => e.map(x => x.dataset.n));

  await page.goto(BASE + '/bank/poses?character=lena', { waitUntil: 'networkidle' });
  await page.waitForSelector('#poseGrid');
  const avant = await cartes();

  console.log('\n[1] créer une pose de test via la modale, pour avoir quelque chose à manipuler');
  await page.click('button:has-text("+ Nouvelle pose")');
  await page.waitForSelector('#newPoseBox button:has-text("Debout")');
  await page.fill('#newPoseName', 'Pose banque test');
  await page.click('#newPoseBox button:has-text("Créer")');
  await page.waitForSelector('#poseEditor svg');
  await page.click('button:has-text("Enregistrer")');
  await page.waitForFunction(() => location.pathname.includes('/bank/poses/edit/'), null, { timeout: 5000 });
  const nom = decodeURIComponent(new URL(page.url()).pathname.split('/').pop());
  dire(nom.startsWith('pose__'), `pose créée : ${nom}`);

  await page.goto(BASE + '/bank/poses?character=lena', { waitUntil: 'networkidle' });
  await page.waitForSelector('#poseGrid');

  console.log('\n[2] recherche — filtre par nom/libellé, un résultat vide le dit explicitement');
  await page.fill('#poseToolbar input', 'Pose banque test');
  await page.waitForTimeout(300);
  let visibles = await cartes();
  dire(visibles.length === 1 && visibles[0] === nom, `seule la pose recherchée reste (${visibles})`);
  await page.fill('#poseToolbar input', 'zzz_ne_correspond_a_rien');
  await page.waitForTimeout(300);
  dire((await page.textContent('#poseGrid')).includes('aucun squelette ne correspond'),
       'un filtre sans résultat le dit — pas une grille juste vide, sans explication');
  await page.fill('#poseToolbar input', '');
  await page.waitForTimeout(300);

  console.log('\n[3] filtre provenance — "gabarit" garde une pose from-scratch (source preset)');
  await page.selectOption('#poseToolbar select >> nth=0', 'preset');
  await page.waitForTimeout(300);
  visibles = await cartes();
  dire(visibles.includes(nom), `la pose "gabarit" reste visible sous le filtre (${visibles})`);
  await page.selectOption('#poseToolbar select >> nth=0', 'all');

  console.log('\n[4] filtre utilisation — "non utilisées" garde une pose sans scène');
  await page.selectOption('#poseToolbar select >> nth=1', 'unused');
  await page.waitForTimeout(300);
  visibles = await cartes();
  dire(visibles.includes(nom), `non assignée à une scène, elle reste visible (${visibles})`);
  await page.selectOption('#poseToolbar select >> nth=1', 'all');

  console.log('\n[5] densité — bascule vers "confortable" et survit à un rechargement (localStorage)');
  await page.click('button:has-text("confortable")');
  await page.waitForTimeout(200);
  const colsAvant = await page.$eval('#poseGrid', e => getComputedStyle(e).gridTemplateColumns);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#poseGrid');
  dire((await page.getAttribute('button:has-text("confortable")', 'aria-pressed')) === 'true',
       'la densité "confortable" a survécu au rechargement');
  const colsApres = await page.$eval('#poseGrid', e => getComputedStyle(e).gridTemplateColumns);
  // computed style resolves to one pixel width PER TRACK ("183px 183px …"),
  // not the CSS source text — comparing the string to itself only proves
  // the reload didn't change anything; the real assertion is on the WIDTH.
  const largeurColonne = parseFloat(colsApres.split(' ')[0]);
  dire(colsAvant === colsApres && largeurColonne >= 140,
       `la grille utilise bien des colonnes plus larges (${colsApres})`);
  await page.click('button:has-text("compact")'); // repli propre pour la suite

  console.log('\n[6] renommer en place — clic sur le libellé, Entrée valide');
  await page.click(`[data-pose-card][data-n="${nom}"] [data-pose-label]`);
  const input = page.locator(`[data-pose-card][data-n="${nom}"] [data-pose-label-input]`);
  await input.fill('Pose banque renommée');
  await input.press('Enter');
  await page.waitForTimeout(400);
  const labelApres = (await page.textContent(`[data-pose-card][data-n="${nom}"] [data-pose-label]`)).trim();
  dire(labelApres === 'Pose banque renommée', `le libellé a changé (${labelApres})`);

  console.log('\n[6bis] Échap annule un renommage en cours, sans rien enregistrer');
  await page.click(`[data-pose-card][data-n="${nom}"] [data-pose-label]`);
  await page.locator(`[data-pose-card][data-n="${nom}"] [data-pose-label-input]`).fill('ceci ne doit jamais être enregistré');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const labelInchange = (await page.textContent(`[data-pose-card][data-n="${nom}"] [data-pose-label]`)).trim();
  dire(labelInchange === 'Pose banque renommée', `Échap a bien annulé, le libellé n'a pas bougé (${labelInchange})`);

  console.log('\n[7] dupliquer — une nouvelle pose apparaît, libellé suffixé " (copie)"');
  const avantDup = await cartes();
  await page.click(`[data-pose-card][data-n="${nom}"] [data-pose-menu]`);
  await page.waitForSelector(`[data-pose-card][data-n="${nom}"] [role="menu"]`);
  await page.click(`[data-pose-card][data-n="${nom}"] [role="menu"] button:has-text("dupliquer")`);
  await page.waitForFunction(
    (n) => document.querySelectorAll('#poseGrid [data-pose-card]').length > n,
    avantDup.length, { timeout: 5000 },
  );
  const apresDup = await cartes();
  // Jamais deviné par motif de nom ou position de liste — exactement ce
  // qui a mal tourné la première fois. La seule preuve valable est la
  // différence d'ensemble entre avant et après.
  const nouveaux = apresDup.filter((n) => !avantDup.includes(n));
  dire(nouveaux.length === 1, `exactement une nouvelle carte est apparue (${nouveaux})`);
  const copie = nouveaux[0];
  const labelCopie = copie
    ? (await page.textContent(`[data-pose-card][data-n="${copie}"] [data-pose-label]`)).trim()
    : '';
  dire(labelCopie === 'Pose banque renommée (copie)',
       `son libellé porte "(copie)" — pas un instant le nom de fichier brut (${labelCopie})`);
  dire(nom !== copie, 'la pose d\'origine et sa copie restent deux fichiers distincts');
  const original = (await page.textContent(`[data-pose-card][data-n="${nom}"] [data-pose-label]`)).trim();
  dire(original === 'Pose banque renommée', 'et l\'originale garde son propre libellé, intact');

  console.log('\n[8] tri "plus utilisées" — la banque ne casse pas sans aucune pose utilisée');
  await page.selectOption('#poseToolbar select >> nth=2', 'usage');
  await page.waitForTimeout(200);
  dire((await cartes()).length >= 2, 'le tri ne fait disparaître aucune carte');
  await page.selectOption('#poseToolbar select >> nth=2', 'recent');

  console.log('\n[9] NETTOYAGE : retrait UNIQUEMENT des poses absentes de l\'état de départ');
  const aRetirer = (await cartes()).filter((n) => !avant.includes(n));
  console.log('   à retirer :', aRetirer);
  for (const n of aRetirer) {
    await page.click(`[data-pose-card][data-n="${n}"] [data-pose-menu]`);
    await page.waitForSelector(`[data-pose-card][data-n="${n}"] [role="menu"]`);
    await page.click(`[data-pose-card][data-n="${n}"] [role="menu"] [data-del]`);
    await page.waitForSelector('#armBox[open]');
    await page.click('#cfOui');
    await page.waitForTimeout(500);
  }
  const final = await cartes();
  dire(final.length === avant.length && avant.every((n) => final.includes(n)),
       `la banque est revenue exactement à son état de départ (${final})`);

  console.log('\n[10] aucune erreur JS réelle sur tout le parcours');
  const reelles = erreurs.filter(e => !/Failed to load resource.*404/.test(e));
  dire(reelles.length === 0, `${reelles.length} erreur(s)`);
  reelles.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
