/* Fumigation NAVIGATEUR de l'extraction de pose par le chemin REEL : fichier
   choisi -> base64 -> /api/pose/extract -> ComfyUI -> reponse -> banque
   affichee sans recharger. pose_tools.extraire() est deja verifiee seule ;
   ceci verifie le cablage front autour, et DEMANDE UN COMFYUI EN LIGNE
   (~20-30 s, un vrai job GPU part). Nettoie le squelette produit a la fin.

   PREREQUIS :
     1. ComfyUI et python web/app.py --no-comfy --no-browser tous deux actifs
     2. npm i playwright && npx playwright install chromium
     3. node tests/test_pose_extraction.js */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }
const path = require('path');
const B = process.env.LENA_URL || 'http://127.0.0.1:8189';
const SOURCE = path.resolve('h:/ComfyUI/ComfyUI_windows_portable/ComfyUI/output/OFM/PROD/LENA/OK/lifestyle_cuisine_matin_20260824_01.png');

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage();
  const err = []; page.on('pageerror', e => err.push(e.message));
  let ko = 0; const dire = (ok, t) => { console.log(`  ${ok?'ok  ':'KO  '}${t}`); if(!ok) ko++; };

  await page.goto(B, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('#btnAdv');
  await page.click('.advmenu button[data-s="scenes"]');
  await page.waitForTimeout(600);

  const avant = await page.evaluate(() => fetch('/api/scenes').then(r=>r.json()).then(d=>d.poses.length));
  console.log(`  squelettes avant : ${avant}`);

  await page.setInputFiles('#poseFile', SOURCE);
  await page.waitForTimeout(200);
  dire(!(await page.isDisabled('#btnPoseExtract')), 'le bouton s’active après le choix du fichier');

  await page.click('#btnPoseExtract');
  console.log('  extraction lancée, patience (~20 s)…');
  await page.waitForFunction(
    () => document.getElementById('poseMsg').textContent === '',
    { timeout: 60000 });
  await page.waitForTimeout(500);

  const apres = await page.evaluate(() => fetch('/api/scenes').then(r=>r.json()).then(d=>d.poses));
  dire(apres.length === avant + 1, `un squelette de plus dans la banque (${avant} -> ${apres.length})`);
  const nouveau = apres.find(n => !['pose__00001_.png','pose__00002_.png'].includes(n));
  dire(!!nouveau, `nouveau fichier identifié : ${nouveau || 'AUCUN'}`);
  dire((await page.$$eval('#poseGrid .posecard', e => e.length)) === apres.length,
       'la grille affiche le nouveau squelette sans recharger la page');

  console.log('\n  nettoyage du squelette de test');
  if (nouveau) {
    const carte = page.locator('.posecard').filter({ has: page.locator(`img[src*="${nouveau}"]`) });
    await carte.locator('.del').click();
    await page.waitForTimeout(300);
    await page.click('#cfOui');
    await page.waitForTimeout(500);
    const final = await page.evaluate(() => fetch('/api/scenes').then(r=>r.json()).then(d=>d.poses.length));
    dire(final === avant, `retour à l'état initial (${avant} squelette(s))`);
  }

  console.log('\n  erreurs JS : ' + (err.length ? err.join(' | ') : 'aucune'));
  if (err.length) ko++;
  console.log(`\n${ko ? ko + ' ECHEC(S)' : 'tout est vert'}`);
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
