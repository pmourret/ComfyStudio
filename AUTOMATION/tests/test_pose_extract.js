/* Browser smoke test of pose extraction by the REAL path: file chosen → base64
   → /api/pose/extract → ComfyUI → answer → bank shown WITHOUT a reload.

   `pose_tools.extraire()` is already checked on its own; this checks the wiring
   around it, and it DEMANDS COMFYUI ONLINE — a real GPU job leaves (~20-30 s).
   It ignores itself cleanly without ComfyUI, and without a source image.

   THE SOURCE PHOTO. Any real production output; a precise filename would
   eventually disappear. It is read from `PROD/<CID>/OK/`, which is git-ignored
   (ADR-0005) — hence the clean skip when it is not there, so this test never
   makes the suite depend on data the public repo does not carry.

   IT CLEANS UP. The skeleton it produces is removed through the interface at the
   end, and the bank is checked to be back to its starting list.

   PREREQUISITES: ComfyUI online, plus those of test_journal.js. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';
const OUT_OK = path.resolve(__dirname, '..', '..', 'PROD', 'LENA', 'OK');

const sources = (() => {
  try { return fs.readdirSync(OUT_OK).filter(n => n.endsWith('.png')); }
  catch { return []; }
})();
if (!sources.length) {
  console.log(`  IGNORE — aucune image dans PROD/LENA/OK pour servir de source`);
  process.exit(0);
}
const SOURCE = path.resolve(OUT_OK, sources[0]);

// ComfyUI requis : skip propre s'il ne repond pas, comme les tests d'identite
const comfyUp = () => new Promise(resolve => {
  const req = http.get('http://127.0.0.1:8188/system_stats',
                       res => { res.resume(); resolve(res.statusCode === 200); });
  req.on('error', () => resolve(false));
  req.setTimeout(3000, () => { req.destroy(); resolve(false); });
});

(async () => {
  if (!(await comfyUp())) {
    console.log('  IGNORE — ComfyUI injoignable sur 8188 (extraction = vrai job GPU)');
    process.exit(0);
  }

  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1500, height: 950 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const squelettes = () => page.$$eval('#poseGrid [data-pose-card]', e => e.map(x => x.dataset.n));

  console.log('\n[1] la sous-vue Poses montre la banque de squelettes');
  await page.goto(BASE + '/bank/poses?character=lena', { waitUntil: 'networkidle' });
  await page.waitForSelector('#poseGrid');
  dire(!(await page.isVisible('#sceneCards')), 'et pas les cartes de scene');
  const avant = await squelettes();
  console.log(`      ${avant.length} squelette(s) au depart`);

  console.log('\n[2] extraction par le chemin reel — un vrai job GPU part');
  await page.setInputFiles('#poseFile', SOURCE);
  await page.waitForTimeout(200);
  dire((await page.textContent('#poseFileName')).length > 0, 'le nom du fichier choisi est affiche');
  dire(!(await page.isDisabled('#btnPoseExtract')), 'le bouton d extraction s arme');
  await page.click('#btnPoseExtract');
  dire((await page.textContent('#poseMsg')).includes('extraction'),
       "l'attente est dite a l'ecran, pas laissee muette");

  // ~20-30 s de GPU : on attend l'apparition d'un squelette de plus
  await page.waitForFunction(
    n => document.querySelectorAll('#poseGrid [data-pose-card]').length > n,
    avant.length, { timeout: 120000 });
  const apres = await squelettes();
  const nouveau = apres.find(n => !avant.includes(n));
  dire(Boolean(nouveau), `un squelette est apparu : ${nouveau}`);

  console.log('\n[3] la banque se repeint SANS rechargement de page');
  dire(await page.evaluate(() => location.pathname) === '/bank/poses',
       "on n'a pas quitte la sous-vue");
  dire((await page.textContent('#nPoses')).includes(String(apres.length)),
       `le compteur suit (${await page.textContent('#nPoses')})`);
  dire((await page.textContent('#poseFileName')) === '',
       'le champ de fichier est vide : la photo source a fait son office');
  const img = await page.getAttribute(`[data-pose-card][data-n="${nouveau}"] img`, 'src');
  dire(img.startsWith('/img/pose?name='), `sa vignette vient de /img/pose (${img.slice(0, 40)}…)`);

  console.log('\n[4] il est proposable a une scene, dans la sous-vue Scenes');
  // Depuis la refonte du compositeur (31/08/2026), une carte de la liste ne
  // porte plus aucun champ : le detail vit dans l'inspecteur, sous l'onglet
  // Pose — le selecteur y est une grille de vignettes (boutons), plus un
  // <select> de <option>.
  await page.click('#bankView [data-vue="scenes"]');
  await page.waitForSelector('[data-scene-card]');
  await page.click('[data-scene-card]');
  await page.waitForSelector('#sceneInspector');
  await page.click('[data-tab="pose"]');
  await page.waitForSelector('[data-tabpanel="pose"]');
  const vignettes = await page.$$eval('[data-tabpanel="pose"] [data-f="pose"] button[title]',
                                      e => e.map(x => x.title));
  dire(vignettes.includes(nouveau), 'le nouveau squelette est dans le selecteur de pose');

  console.log('\n[5] NETTOYAGE : le squelette produit est retire');
  await page.click('#bankView [data-vue="poses"]');
  await page.waitForSelector('#poseGrid');
  await page.click(`[data-pose-card][data-n="${nouveau}"] [data-del]`);
  await page.waitForSelector('#armBox[open]');
  dire((await page.textContent('#armBox')).includes('introuvable'),
       'le retrait previent qu une scene qui le reference le perdra');
  await page.click('#cfOui');
  await page.waitForTimeout(1200);
  const final = await squelettes();
  dire(!final.includes(nouveau), 'le squelette est retire de la banque');
  dire(final.length === avant.length && final.every(n => avant.includes(n)),
       `la banque est revenue a son etat de depart (${final.length} squelette(s))`);

  console.log('\n[6] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
