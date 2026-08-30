/* Browser smoke test of the REACT scene bank — both sub-views, plus the tool
   rail that appears with them.

   Replaces three legacy fumigations: test_scenes_aller_retour (nothing is lost
   on a round trip), test_pose_scene_card (the pose selector on a scene card),
   and test_rail_repli (the rail collapses to icons).

   WHY THE ROUND TRIP IS THE HEART OF IT. On 25/08/2026 the save rebuilt each
   scene from the fields the card displays. Everything the card did NOT display
   was erased: `wardrobe`, `intensity`, `tags`, `tones` and `intention`
   disappeared from the bank's 16 scenes in ONE save, the « Suggestif » tier fell
   to zero scenes, and no test said a word. This one reads the bank, edits it
   through the interface, saves, reloads, and demands that nothing moved but what
   was touched.

   IT RESTORES WHAT IT CHANGES. The bank is real user data: the test snapshots
   scenes.json through the API, does its round trip, then writes the snapshot
   back and checks it matches. Nothing is left behind — verified at the end.

   test_pose_extraction stays separate: it needs ComfyUI online and a real GPU
   job, and it ignores itself without one.

   PREREQUISITES: see test_journal.js — run_browser_tests.py does all of it. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';
const SCENES = BASE + '/bank/scenes?character=lena';

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1500, height: 950 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const vu = s => page.isVisible(s).catch(() => false);
  const texte = s => page.textContent(s).catch(() => '');
  // lecture de la banque par l'API, hors de l'interface : c'est la reference
  const banque = () => page.evaluate(async () =>
    (await (await fetch('/api/scenes?character=lena')).json()).data);

  await page.goto(SCENES, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sceneCard');

  console.log('\n[0] instantane de scenes.json — il sera REECRIT a la fin');
  const avant = await banque();
  dire(Array.isArray(avant.scenes) && avant.scenes.length > 0,
       `${avant.scenes.length} scene(s) en banque au depart`);

  console.log('\n[1] la banque ouvre sur sa sous-vue, et l autre est une destination');
  dire(await page.evaluate(() => location.pathname) === '/bank/scenes', 'chemin /bank/scenes');
  dire(await vu('#bankScenes'), 'la sous-vue Scenes est montee');
  dire(!(await vu('#bankPoses')), 'la sous-vue Poses ne l est pas — une route, pas un attribut');
  const onglets = await page.$$eval('#bankView [data-vue]', e => e.map(x => x.dataset.vue));
  dire(onglets.join(',') === 'scenes,poses', 'les deux sous-vues sont offertes');
  const allume = await page.$$eval('.tabs .nav-item.on', e => e.map(x => x.dataset.s));
  dire(allume.join(',') === 'bank', "l'entree Banque de la navbar est allumee");

  console.log('\n[2] LE RAIL D OUTILS apparait ici, et vient du pack');
  dire(await vu('#toolRail'), 'le rail est present sur la Banque');
  const outils = await page.$$eval('#toolRail .rail-it .rail-lab-it', e => e.map(x => x.textContent));
  dire(outils.length > 0, `entrees du rail : ${outils.join(' · ')}`);
  dire(!(await vu('#toolRail [data-s]')),
       "il ne recopie aucune destination de la navbar : ce n'est pas une seconde navigation");
  const inertes = await page.$$eval('#toolRail .rail-it:disabled',
    e => e.map(x => x.dataset.hintText || ''));
  dire(inertes.every(r => r.length > 0),
       `un outil inerte DIT pourquoi (${inertes.length} inerte(s))`);

  console.log('\n[3] le rail se replie en ICONES, pas en rien');
  const cle = () => page.evaluate(() => localStorage.getItem('studio.rail-mince'));
  const largeur = () => page.$eval('#toolRail', e => e.getBoundingClientRect().width);
  const large = await largeur();
  await page.click('#btnRailPli');
  await page.waitForTimeout(250);
  dire(await cle() === '1', 'studio.rail-mince = 1');
  const etroit = await largeur();
  dire(etroit < large && etroit > 20, `le rail retrecit sans disparaitre (${large} -> ${etroit} px)`);
  dire(await page.isVisible('#toolRail .rail-it'), 'ses entrees restent cliquables');
  const lab = await page.$('#toolRail .rail-lab-it');
  dire(await lab.evaluate(e => getComputedStyle(e).display) !== 'none',
       'les libelles restent le nom accessible des entrees');
  dire(await lab.evaluate(e => e.getBoundingClientRect().width <= 2),
       'mais ils sont retires VISUELLEMENT');
  // `--rail` suit la largeur : sinon la barre de lancement garde sa gouttiere
  const gouttiere = await page.$eval('.launch', e => e.getBoundingClientRect().left);
  const railDroite = await page.$eval('#toolRail', e => e.getBoundingClientRect().right);
  dire(Math.abs(gouttiere - railDroite) < 3,
       `la barre de lancement suit le rail replie (${Math.round(gouttiere)} vs ${Math.round(railDroite)} px)`);
  await page.click('#btnRailPli');
  await page.waitForTimeout(250);
  dire(await cle() === '0', 'deplier reecrit la cle');

  console.log('\n[4] une carte de scene montre ce qu une scene PORTE');
  const nCartes = await page.$$eval('.sceneCard', e => e.length);
  dire(nCartes === avant.scenes.length, `${nCartes} cartes pour ${avant.scenes.length} scenes`);
  const champs = await page.$$eval('.sceneCard:first-child [data-f]', e => e.map(x => x.dataset.f));
  ['id','intention','format','count','guidance','band_lo','tones','tags','prompt','wardrobe','variants','pose']
    .forEach(f => dire(champs.includes(f), `champ « ${f} »`));

  console.log('\n[5] le plafond de niveau se DEDUIT des tenues, a la frappe');
  const plafond = () => page.$eval('.sceneCard:first-child [data-f="band_lo"]',
    e => e.closest('.f').querySelector('span b').textContent);
  const tenues = await page.$eval('.sceneCard:first-child [data-f="wardrobe"]', e => e.value);
  await page.fill('.sceneCard:first-child [data-f="wardrobe"]', tenues + '\n3: a test outfit');
  await page.waitForTimeout(200);
  dire(await plafond() === '3', `le plafond suit la tenue tapee (${await plafond()})`);
  await page.fill('.sceneCard:first-child [data-f="wardrobe"]', tenues);
  await page.waitForTimeout(200);

  console.log('\n[6] une frappe arme le bandeau « modifications non enregistrees »');
  dire(await vu('#dirtyBar'), 'le bandeau est la');
  dire((await texte('#dirtyBar')).includes('production ne les voit pas'),
       'il dit pourquoi ca compte, pas seulement qu il y a des changements');
  dire(await vu('#btnDirtySave'), 'et il porte l enregistrement');

  console.log('\n[7] il survit a la navigation — l ecran demonte, pas la saisie');
  await page.click('.tabs [data-s="application"]');
  await page.waitForTimeout(400);
  dire(await vu('#dirtyBar'), "le bandeau suit sur l'ecran Application");
  await page.click('.tabs [data-s="bank"]');
  await page.waitForTimeout(500);
  await page.waitForSelector('.sceneCard');
  dire(await page.$eval('.sceneCard:first-child [data-f="wardrobe"]', e => e.value) === tenues,
       'la saisie est intacte au retour');

  console.log('\n[8] ALLER-RETOUR : on modifie UN champ, et rien d autre ne bouge');
  const cible = avant.scenes[0];
  const marque = (cible.prompt || '') + ' _FUMIGATION_';
  await page.fill('.sceneCard:first-child [data-f="prompt"]', marque);
  await page.waitForTimeout(150);
  await page.click('#btnSaveScenes');
  await page.waitForTimeout(1400);
  dire((await texte('#scMsg')).includes('enregistré'), `la barre le confirme : « ${await texte('#scMsg')} »`);
  dire(!(await vu('#dirtyBar')), 'le bandeau disparait : plus rien en attente');

  const apres = await banque();
  dire(apres.scenes.length === avant.scenes.length,
       `toujours ${apres.scenes.length} scenes — aucune perdue`);
  dire(apres.scenes[0].prompt === marque, 'le champ modifie a bien ete ecrit');

  // LE POINT DU TEST : tout ce que la carte ne montre pas doit avoir traverse
  const ecarts = [];
  avant.scenes.forEach((s, i) => {
    const a = apres.scenes[i] || {};
    Object.keys(s).forEach(k => {
      if (k === 'prompt' && i === 0) return;               // le champ modifie
      if (k === 'category') return;                        // cle morte, retiree a l'enregistrement
      if (JSON.stringify(s[k]) !== JSON.stringify(a[k]))
        ecarts.push(`${s.id}.${k} : ${JSON.stringify(s[k])} -> ${JSON.stringify(a[k])}`);
    });
  });
  dire(ecarts.length === 0, `aucune cle perdue ni alteree (${ecarts.length} ecart(s))`);
  ecarts.slice(0, 6).forEach(e => console.log('      ' + e));
  dire(JSON.stringify(apres.anchor) === JSON.stringify(avant.anchor),
       "l'ancre d'identite a traverse");
  dire(JSON.stringify(apres.direction) === JSON.stringify(avant.direction),
       'la note de direction aussi');

  console.log('\n[9] une tenue sans niveau REFUSE l enregistrement');
  await page.fill('.sceneCard:first-child [data-f="wardrobe"]', 'une tenue sans niveau');
  await page.waitForTimeout(150);
  await page.click('#btnSaveScenes');
  await page.waitForTimeout(600);
  dire((await texte('#scMsg')).includes('tenue sans niveau'),
       `le refus est dit a l'ecran : « ${(await texte('#scMsg')).slice(0, 70)}… »`);
  const pendant = await banque();
  dire(JSON.stringify(pendant.scenes[0].wardrobe) === JSON.stringify(apres.scenes[0].wardrobe),
       "et rien n'a ete ecrit : la tenue d'origine est toujours en banque");
  dire(await vu('#dirtyBar'), 'le bandeau reste : le travail est toujours en attente');

  console.log('\n[10] sous-vue POSES : une route, un libelle de barre qui suit');
  await page.click('#bankView [data-vue="poses"]');
  await page.waitForTimeout(400);
  dire(await page.evaluate(() => location.pathname) === '/bank/poses', 'chemin /bank/poses');
  dire(await vu('#bankPoses'), 'la sous-vue Poses est montee');
  dire(!(await vu('#bankScenes')), 'la sous-vue Scenes ne l est plus');
  dire((await texte('#scTitre')).includes('attributions de pose'),
       `la barre dit ce qu elle enregistre ICI : « ${await texte('#scTitre')} »`);
  dire((await texte('#scMsg')).includes('pas les squelettes'),
       'et precise ce qu elle N enregistre PAS');
  dire(await vu('#btnSaveScenes'), "le bouton reste : une edition en attente garde son action");
  dire(await vu('#dirtyBar'), 'et le bandeau aussi');
  dire((await texte('#bankPoses')).includes('ne reste jamais sur le disque'),
       'la vue dit que la photo source n est jamais gardee');

  console.log('\n[11] le rail marque l entree de la sous-vue courante');
  const actives = await page.$$eval('#toolRail .rail-it.on .rail-lab-it', e => e.map(x => x.textContent));
  dire(actives.includes('Poses'), `l entree active suit la sous-vue (${actives.join(',') || 'aucune'})`);

  console.log('\n[12] REMISE EN ETAT : scenes.json revient a son instantane');
  const remis = await page.evaluate(async avant => {
    const r = await fetch('/api/scenes?character=lena', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({data: avant})});
    return (await r.json()).ok;
  }, avant);
  dire(remis === true, 'la banque d origine est reecrite');
  await page.goto(SCENES, { waitUntil: 'networkidle' });
  const final = await banque();
  const restant = [];
  avant.scenes.forEach((s, i) => {
    const a = final.scenes[i] || {};
    Object.keys(s).forEach(k => {
      if (k === 'category') return;
      if (JSON.stringify(s[k]) !== JSON.stringify(a[k])) restant.push(`${s.id}.${k}`);
    });
  });
  dire(restant.length === 0,
       `aucune trace laissee par la fumigation (${restant.length} ecart(s))`);
  restant.slice(0, 6).forEach(e => console.log('      ' + e));

  console.log('\n[13] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
