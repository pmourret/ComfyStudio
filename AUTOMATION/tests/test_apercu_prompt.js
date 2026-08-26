/* Fumigation NAVIGATEUR de l'apercu du prompt (26/08/2026).

   Ce qu'il garde : le prompt final est assemble a partir de 8 fragments dont
   l'utilisateur n'ecrit que la scene — 179 caracteres sur 578 mesures sur
   `cuisine_matin`, soit 31 %. Tant que le reste n'etait pas montre, un resultat
   rate ne se diagnostiquait pas, et deux fragments pouvaient se contredire sans
   que rien ne le signale.

   PREREQUIS (volontairement hors du projet, qui n'a aucune dependance) :
     1. python web/app.py --no-comfy --no-browser
     2. npm i playwright && npx playwright install chromium
     3. node tests/test_apercu_prompt.js

   Le test LIT et tape dans un champ de lancement, il ne clique JAMAIS sur
   Generer : aucune trace dans les donnees reelles. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }
(async () => {
  const nav = await chromium.launch(); const page = await nav.newPage();
  const err = []; page.on('pageerror', e => err.push(e.message));
  let ko = 0; const dire = (ok, t) => { console.log(`  ${ok?'ok  ':'KO  '}${t}`); if(!ok) ko++; };
  await page.goto(process.env.LENA_URL || 'http://127.0.0.1:8189', {waitUntil:'networkidle'});
  await page.waitForTimeout(1200);

  // cran Suggestif -> Boudoir -> une scene
  await page.click('#intSel button[data-lv="2"]'); await page.waitForTimeout(400);
  const cf = await page.$('#cfOui'); if (cf) { await cf.click(); await page.waitForTimeout(700); }
  await page.evaluate(() => [...document.querySelectorAll('#intentGrid .it')]
    .find(e => e.textContent.includes('Boudoir'))?.click());
  await page.waitForTimeout(400);
  await page.click('#sceneGrid .sc'); await page.waitForTimeout(900);

  console.log('\n[1] ouverture de l apercu');
  dire(!(await page.isVisible('#apercuPanel')), 'ferme par defaut');
  await page.click('#btnApercu'); await page.waitForTimeout(900);
  dire(await page.isVisible('#apercuPanel'), 'le panneau s ouvre');
  const frs = await page.$$eval('#apFrags .fr', e => e.map(x => ({
    pc: x.querySelector('.pc').textContent, src: x.querySelector('.src').textContent })));
  console.log('      ' + frs.map(f => `${f.src} ${f.pc}`).join(' | '));
  dire(frs.length >= 6, `${frs.length} fragments etiquetes`);
  dire(frs.some(f => f.src === 'scène'), 'la scene est identifiee comme telle');
  const meta = await page.textContent('#apMeta');
  dire(/caractères/.test(meta), `en-tete : ${meta.trim()}`);

  console.log('\n[2] echos entre fragments');
  const ech = await page.$$eval('#apEchos .e', e => e.map(x => x.textContent.replace(/\s+/g,' ').trim()));
  dire(ech.length > 0, `${ech.length} mots partages signales`);
  ech.slice(0,4).forEach(x => console.log('      ' + x));

  console.log('\n[3] amendement pour ce lancement');
  const ta = await page.$('#sceneOverride');
  dire(ta && !(await ta.isDisabled()), 'champ actif avec une seule scene');
  const avant = (await page.$$eval('#apFrags .fr', e =>
    e.find(x => x.querySelector('.src').textContent === 'scène').querySelector('.tx').textContent));
  await ta.click();
  await page.keyboard.type('standing by a window, full body, backlit');
  await page.waitForTimeout(1000);
  // le curseur doit avoir survecu au rafraichissement
  const focus = await page.evaluate(() => document.activeElement.id);
  dire(focus === 'sceneOverride', `le focus reste dans le champ (${focus})`);
  const apres = (await page.$$eval('#apFrags .fr', e =>
    e.find(x => x.querySelector('.src').textContent === 'scène').querySelector('.tx').textContent));
  dire(avant !== apres, 'le prompt affiche suit l amendement');
  console.log('      avant : ' + avant.slice(0,58));
  console.log('      apres : ' + apres.slice(0,58));

  console.log('\n[4] garde-fous');
  await ta.fill('close shot of her green eyes and full lips');
  await page.waitForTimeout(1000);
  const sumT = await page.textContent('#sumT');
  dire(/visage|PuLID|refus/i.test(sumT) || await page.isDisabled('#btnRun'),
       `un amendement qui decrit le visage est refuse : ${sumT.trim().slice(0,80)}`);
  dire(await page.isVisible('#apercuPanel'),
       'le panneau RESTE ouvert malgre le refus');
  dire(await page.isVisible('#sceneOverride'),
       'le champ amende reste visible et relisible');
  await ta.fill(''); await page.waitForTimeout(900);
  dire(!(await page.isDisabled('#btnRun')), 'vider l amendement relance le plan');

  console.log('\n  erreurs JS : ' + (err.length ? err.join(' | ') : 'aucune'));
  if (err.length) ko++;
  console.log(`\n${ko ? ko + ' ECHEC(S)' : 'tout est vert'}`);
  await nav.close(); process.exit(ko ? 1 : 0);
})();
