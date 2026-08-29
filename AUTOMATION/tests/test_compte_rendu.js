/* Fumigation NAVIGATEUR du compte rendu de lot et du compteur Revue (J8).

   CE QUE CE TEST VERROUILLE :

     1. La carte d'un lot TERMINÉ se ferme à la main, et le renvoi se retient
        PAR BATCH : fermer, c'est « celui-là, je l'ai lu », pas « ne plus
        jamais montrer ». Un batch différent la ramène.
     2. Une carte de lot EN COURS n'a PAS de croix : elle porte le bouton
        d'arrêt et dit où en est la production — la faire disparaître pendant
        qu'elle tourne cacherait le seul endroit qui le dit.
     3. Le compteur de la Revue survit au mode icônes. C'est la seule valeur du
        chrome qui dise qu'un travail ATTEND, et c'est replié qu'on en a le
        plus besoin. À zéro il s'efface : une pastille qui annonce zéro est du
        bruit.

   Le test PILOTE renderRun avec des états fabriqués plutôt que de lancer une
   vraie production : le comportement testé est celui de la carte, pas celui du
   GPU, et un lot réel prendrait des minutes pour dire la même chose.

   PREREQUIS (hors du repo, qui n'a aucune dépendance) :
     1. python web/app.py --no-comfy --no-browser --port 8199
     2. playwright installé hors du repo ; NODE_PATH pointe sur son node_modules
     3. node tests/test_compte_rendu.js */
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }
const ORIGIN = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';

/* AMORCE. La pastille n'a de sens qu'à compteur NON NUL, et c'est justement le
   cas que la machine ne présente pas toujours : sur un A_REVOIR vide, le test
   ne jouait que la branche « zéro » et se déclarait vert sans avoir rien vu.
   On dépose donc une image le temps du test, retirée quoi qu'il arrive. */
const OFM = path.resolve(__dirname, '..', '..');
const OK_DIR = path.join(OFM, 'PROD/LENA/OK');
const A_REVOIR = path.join(OFM, 'PROD/LENA/A_REVOIR');
const AMORCE = '_TEST_COMPTE_RENDU_temp.png';
const nettoyer = () => { try { fs.rmSync(path.join(A_REVOIR, AMORCE), {force: true}); } catch {} };
let amorcee = false;
try {
  const src = fs.readdirSync(OK_DIR).filter(n => n.endsWith('.png'))[0];
  if (src) {
    fs.mkdirSync(A_REVOIR, {recursive: true});
    fs.copyFileSync(path.join(OK_DIR, src), path.join(A_REVOIR, AMORCE));
    amorcee = true;
    process.on('exit', nettoyer);
  }
} catch { /* pas d'image source : le test jouera la branche « zéro » */ }

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1500, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let ko = 0;
  const dire = (ok, txt) => { console.log(`  ${ok ? 'ok  ' : 'KO  '}${txt}`); if (!ok) ko++; };

  await page.goto(ORIGIN + '/?character=lena', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  /* renderRun est un module ES, donc hors de portée depuis la page. On l'atteint
     par un import dynamique, qui rend le module DÉJÀ chargé — c'est bien la
     même instance que celle du studio, pas une seconde copie. */
  const peindre = etat => page.evaluate(async s => {
    const m = await import('/static/create.js');
    m.renderRun(s);
  }, etat);

  const lot = (id, running) => ({
    running, batch_id: id, index: running ? 2 : 4, total: 4,
    current: running ? 'scene_02' : null, log: ['ligne de journal'],
    stats: running ? {} : {OK: 3, A_REVOIR: 1}, recent: [], eta: null,
    edition: false, last_error: null,
  });
  const visible = () => page.evaluate(() => {
    const p = document.getElementById('runPanel');
    return !!p && p.style.display !== 'none';
  });

  console.log('\n[1] un lot EN COURS n\'a pas de croix');
  await peindre(lot('20260830_100000', true));
  await page.waitForTimeout(200);
  dire(await visible(), 'la carte est affichée');
  dire((await page.$$('#btnRunFermer')).length === 0, 'aucune croix pendant la production');
  dire(await page.isVisible('#btnStop'), 'mais le bouton d\'arrêt est là');

  console.log('\n[2] un lot TERMINÉ porte sa croix, et se ferme');
  await peindre(lot('20260830_100000', false));
  await page.waitForTimeout(200);
  dire(await visible(), 'la carte du lot terminé est affichée');
  dire(await page.isVisible('#btnRunFermer'), 'la croix apparaît une fois terminé');
  dire(await page.isVisible('#btnGoTri'), 'et « Trier les résultats » aussi');
  await page.click('#btnRunFermer');
  await page.waitForTimeout(200);
  dire(!(await visible()), 'la carte se ferme au clic');

  console.log('\n[3] le renvoi tient pour CE lot, pas pour les suivants');
  await peindre(lot('20260830_100000', false));       // le même batch
  await page.waitForTimeout(200);
  dire(!(await visible()), 'le même lot ne revient pas — il a été lu');
  await peindre(lot('20260830_113000', false));       // un autre batch
  await page.waitForTimeout(200);
  dire(await visible(), 'un AUTRE lot ramène la carte');
  dire(await page.isVisible('#btnRunFermer'), 'avec sa croix');

  console.log('\n[4] le compteur Revue en mode icônes');
  const lire = () => page.evaluate(() => {
    const n = document.getElementById('nTri');
    const b = n.getBoundingClientRect();
    return {txt: n.textContent.trim(), zero: n.dataset.zero,
            vu: b.width > 0 && b.height > 0 && getComputedStyle(n).display !== 'none'};
  });
  const deplie = await lire();
  console.log(`      déplié : « ${deplie.txt} » (data-zero=${deplie.zero})`);
  dire(deplie.txt !== '', 'le compteur porte une valeur');

  await page.click('#btnNavPli');                     // replie la navbar
  await page.waitForTimeout(400);
  dire(await page.evaluate(() => document.body.classList.contains('nav-mince')),
       'navbar repliée');
  const replie = await lire();
  dire(!amorcee || replie.zero === '0',
       amorcee ? `l'amorce fait remonter le compteur a ${replie.txt}`
               : '(pas d\'image source : branche « zéro » seulement)');
  if (replie.zero === '1') {
    dire(!replie.vu, 'à zéro, la pastille s\'efface — pas de bruit');
  } else {
    dire(replie.vu, `à ${replie.txt}, la pastille reste visible en mode icônes`);
    const autres = await page.$$eval('.tabs button .n:not(#nTri)', els =>
      els.filter(e => getComputedStyle(e).display !== 'none').length);
    dire(autres === 0, 'et elle est la SEULE : les autres compteurs disparaissent');
  }

  console.log('\n[5] on déplie, rien n\'a bougé');
  await page.click('#btnNavPli');
  await page.waitForTimeout(400);
  const revenu = await lire();
  dire(revenu.txt === deplie.txt, `le compteur est inchangé : « ${revenu.txt} »`);

  console.log('\n[6] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  nettoyer();
  process.exit(ko ? 1 : 0);
})();
