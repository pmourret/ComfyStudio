/* Fumigation NAVIGATEUR du selecteur de pose sur la carte de scene (26/08/2026).

   Couvre le chemin complet : /api/scenes expose SC.poses -> le select se peint
   -> choisir un squelette montre sa vignette (/img/pose) -> enregistrer ecrit
   `pose` dans scenes.json -> le badge apparait sur la carte de l'ecran Creer ->
   vider le champ RETIRE la cle (ne la laisse pas a '') -> aller-retour complet,
   la banque revient identique.

   PREREQUIS (hors du repo, qui n'a aucune dependance) :
     1. python web/app.py --no-comfy --no-browser
     2. npm i playwright && npx playwright install chromium
     3. node tests/test_pose_scene_card.js

   Le test enregistre reellement dans scenes.json (c'est ce qu'il verifie), mais
   remet la banque a son etat initial avant de finir — verifie a l'octet pres. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }
(async () => {
  const nav = await chromium.launch(); const page = await nav.newPage();
  const err = []; page.on('pageerror', e => err.push(e.message));
  let ko = 0; const dire = (ok, t) => { console.log(`  ${ok?'ok  ':'KO  '}${t}`); if(!ok) ko++; };
  await page.goto(process.env.LENA_URL || 'http://127.0.0.1:8189', {waitUntil:'networkidle'});
  await page.waitForTimeout(1200);

  console.log('\n[1] onglet Scenes, champ pose');
  await page.click('#btnAdv');
  await page.click('.advmenu button[data-s="scenes"]');
  await page.waitForTimeout(700);
  const selects = await page.$$('#sceneCards [data-f="pose"]');
  dire(selects.length > 0, `${selects.length} selecteurs de pose rendus`);
  const opts = await selects[0].evaluate(e => [...e.options].map(o => o.value));
  dire(opts.includes('pose__00002_.png'), `options : ${opts.join(', ')}`);

  console.log('\n[2] selection -> vignette -> sauvegarde -> aller-retour');
  const avant = await page.evaluate(() => fetch('/api/scenes').then(r=>r.json()).then(d=>d.data));
  await selects[0].selectOption('pose__00002_.png');
  await page.waitForTimeout(300);
  const prevVisible = await page.locator('#sceneCards .sceneCard').first().locator('.posePrev').isVisible();
  dire(prevVisible, 'la vignette du squelette apparait au choix');
  const src = await page.locator('#sceneCards .sceneCard').first().locator('.posePrev img').getAttribute('src');
  dire((src||'').includes('/img/pose?name=pose__00002_.png'), `src vignette : ${src}`);

  await page.click('#btnSaveScenes');
  await page.waitForTimeout(1200);
  const apres = await page.evaluate(() => fetch('/api/scenes').then(r=>r.json()).then(d=>d.data));
  const sceneId = apres.scenes[0].id;
  dire(apres.scenes[0].pose === 'pose__00002_.png',
       `scene ${sceneId} porte pose=${apres.scenes[0].pose}`);

  console.log('\n[3] badge sur la vignette de l ecran Creer');
  await page.click('.tabs button[data-s="creer"]');
  await page.waitForTimeout(700);
  // trouver l intention de la scene modifiee et l'ouvrir
  const intent = apres.scenes[0].intention;
  await page.evaluate(k => [...document.querySelectorAll('#intentGrid .it')]
    .find(e => e.dataset.k === k)?.click(), intent);
  await page.waitForTimeout(500);
  const badge = await page.locator('#sceneGrid .sc').filter({hasText: sceneId}).locator('.posebadge');
  dire(await badge.count() > 0, 'le badge « pose » est visible sur la carte de scene');

  console.log('\n[4] retour a vide, aller-retour propre');
  await page.click('#btnAdv');
  await page.click('.advmenu button[data-s="scenes"]');
  await page.waitForTimeout(700);
  await page.locator('#sceneCards [data-f="pose"]').first().selectOption('');
  await page.waitForTimeout(300);
  dire(!(await page.locator('#sceneCards .sceneCard').first().locator('.posePrev').isVisible()),
       'la vignette disparait quand on vide le choix');
  await page.click('#btnSaveScenes');
  await page.waitForTimeout(1200);
  const final = await page.evaluate(() => fetch('/api/scenes').then(r=>r.json()).then(d=>d.data));
  dire(final.scenes[0].pose === undefined, 'la cle « pose » est bien RETIREE, pas juste videe');
  dire(JSON.stringify(final) === JSON.stringify(avant),
       'la banque est revenue a son etat initial, octet pour octet');

  console.log('\n  erreurs JS : ' + (err.length ? err.join(' | ') : 'aucune'));
  if (err.length) ko++;
  console.log(`\n${ko ? ko + ' ECHEC(S)' : 'tout est vert'}`);
  await nav.close(); process.exit(ko ? 1 : 0);
})();
