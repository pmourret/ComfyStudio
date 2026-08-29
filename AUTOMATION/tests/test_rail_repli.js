/* Fumigation NAVIGATEUR du repli du rail d'outils (J8).

   CE QUE CE TEST VERROUILLE :

     1. Le rail se replie en ICONES, pas en rien : ses entrées restent
        cliquables. C'est la différence avec le masquage sous 1100 px, où il
        s'efface faute de place.
     2. `--rail` SUIT la largeur. C'est le piège écrit dans components.css :
        `.launch` est en `position:fixed` et se cale sur `left:var(--rail)` —
        une largeur figée à 200 px laisserait 142 px de vide sous un rail qui
        n'en fait plus que 58.
     3. Les libellés sont retirés VISUELLEMENT, jamais par `display:none` : ils
        restent le nom accessible du bouton, et une infobulle les porte — même
        contrat que la navbar en mode icônes.
     4. La préférence est retenue d'un chargement à l'autre, et le rail est
        REPEINT à chaque chargement d'outils : l'état doit survivre au repaint.

   PREREQUIS (hors du repo, qui n'a aucune dépendance) :
     1. python web/app.py --no-comfy --no-browser --port 8199
     2. playwright installé hors du repo ; NODE_PATH pointe sur son node_modules
     3. node tests/test_rail_repli.js */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }
const ORIGIN = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';

(async () => {
  // au-dessus de 1100 px : sous cette borne le rail disparaît par le CSS, et
  // ce test n'aurait rien à observer
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1500, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let ko = 0;
  const dire = (ok, txt) => { console.log(`  ${ok ? 'ok  ' : 'KO  '}${txt}`); if (!ok) ko++; };
  const railLarg = () => page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue('--rail').trim());
  const entrees = () => page.$$eval('#toolRail .rail-it', els => els.map(b => ({
    nom: (b.textContent || '').trim(),
    aria: b.getAttribute('aria-label') || '',
    ic: !!b.querySelector('.rail-ic'),
    bulle: b.dataset.hintText || '',
    visible: b.offsetParent !== null,
  })));

  console.log('\n[1] rail déplié : icônes ET libellés');
  await page.goto(ORIGIN + '/?character=lena', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  dire(await page.isVisible('#toolRail'), 'le rail est affiché sur Produire');
  const large = await entrees();
  dire(large.length >= 3, `${large.length} entrées dans le rail`);
  dire(large.every(e => e.ic), 'chaque entrée porte une icône');
  dire(large.every(e => e.nom.length > 0), 'et son libellé : ' +
       large.map(e => e.nom).join(' | '));
  dire((await railLarg()) === '200px', `--rail = ${await railLarg()}`);
  dire(await page.isVisible('#btnRailPli'), 'le bouton de repli est au pied du rail');

  console.log('\n[2] replié : icônes seules, largeur suivie');
  await page.click('#btnRailPli');
  await page.waitForTimeout(400);
  dire(await page.evaluate(() => document.body.classList.contains('rail-mince')),
       'body.rail-mince posé');
  dire((await railLarg()) === '58px', `--rail suit : ${await railLarg()}`);
  const larg = await page.locator('#toolRail').evaluate(e => Math.round(e.getBoundingClientRect().width));
  dire(larg <= 60, `le rail mesure ${larg}px`);

  const mince = await entrees();
  dire(mince.length === large.length, `les ${mince.length} entrées sont TOUJOURS là`);
  dire(mince.every(e => e.visible), 'et toutes visibles — replié n\'est pas masqué');
  dire(mince.every(e => e.ic), 'chacune garde son icône');
  // retire VISUELLEMENT : textContent reste, la boîte du libellé fait 1px
  const boite = await page.$eval('#toolRail .rail-lab-it',
    e => Math.round(e.getBoundingClientRect().width));
  dire(boite <= 2, `le libellé est réduit à ${boite}px, pas supprimé du DOM`);
  dire(mince.every(e => e.nom.length > 0),
       'il reste donc le nom accessible du bouton');
  dire(mince.filter(e => e.bulle).length >= 3,
       `${mince.filter(e => e.bulle).length} entrées portent une infobulle en mode icônes`);

  /* LA RAISON D'ETRE de `--rail`. `.launch` est en position:fixed, donc aveugle
     à la grille : elle se cale sur `left:calc(var(--nav) + var(--rail))`. Si la
     variable ne suivait pas le repli, la barre garderait une gouttière de
     200 px et laisserait 142 px de vide sous un rail de 58.
     `#creer .launch` et pas `.launch` : il y en a TROIS dans la page, une par
     écran — un sélecteur ambigu faisait échouer le locator, et le `catch` qui
     l'entourait avalait l'échec en annonçant « absente ». */
  console.log('\n[3] la barre de lancement suit le rail');
  const navLarg = await page.evaluate(() =>
    Math.round(parseFloat(getComputedStyle(document.body).getPropertyValue('--nav'))));
  const gauche = await page.$eval('#creer .launch', e =>
    Math.round(parseFloat(getComputedStyle(e).left)));
  dire(gauche === navLarg + larg,
       `.launch cale a gauche=${gauche}px = navbar ${navLarg} + rail ${larg}`);

  console.log('\n[4] une entrée repliée reste cliquable');
  const avant = await page.evaluate(() => location.hash);
  await page.click('#toolRail .rail-it[data-go="scenes"]');
  await page.waitForTimeout(600);
  const apres = await page.evaluate(() => location.hash);
  dire(apres !== avant && /scenes/.test(apres),
       `elle navigue toujours : ${avant || '(vide)'} -> ${apres}`);
  dire(await page.isVisible('#toolRail'), 'et le rail reste replié sur Banque');

  console.log('\n[5] la préférence survit au rechargement ET au repaint du rail');
  await page.goto(ORIGIN + '/?character=lena', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);          // laisse /api/universe/tools repeindre
  dire(await page.evaluate(() => document.body.classList.contains('rail-mince')),
       'toujours replié après rechargement');
  dire((await railLarg()) === '58px', '--rail toujours suivi');
  const apresRepaint = await entrees();
  dire(apresRepaint.length === large.length && apresRepaint.every(e => e.ic),
       'le rail repeint garde ses icônes et son état');
  dire(await page.locator('#btnRailPli').getAttribute('aria-expanded') === 'false',
       'aria-expanded=false sur le bouton de repli');

  console.log('\n[6] on déplie, et tout revient');
  await page.click('#btnRailPli');
  await page.waitForTimeout(400);
  dire(!(await page.evaluate(() => document.body.classList.contains('rail-mince'))),
       'body.rail-mince retiré');
  dire((await railLarg()) === '200px', '--rail revenu à 200px');
  const rendu = await entrees();
  dire(rendu.every(e => !e.bulle || e.nom !== e.bulle),
       'les infobulles de libellé sont retirées quand le libellé revient');
  const gauche2 = await page.$eval('#creer .launch', e =>
    Math.round(parseFloat(getComputedStyle(e).left)));
  dire(gauche2 === navLarg + 200,
       `.launch reprend sa gouttière : gauche=${gauche2}px = ${navLarg} + 200`);

  console.log('\n[7] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
