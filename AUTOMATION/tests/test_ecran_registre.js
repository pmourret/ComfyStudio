/* Fumigation NAVIGATEUR du sas d'entree (#registre, J7bis). Charge la page
   pour de vrai : sans ?character= l'app doit s'ouvrir sur le registre, pas sur
   la production d'un personnage. Verifie les cartes, la carte « + Nouveau
   personnage », et qu'un ?character= explicite court-circuite le sas.

   Le test LIT seulement : il ne crée aucun personnage, ne mute rien.

   PREREQUIS (hors du repo, qui n'a aucune dependance) :
     1. python web/app.py --no-comfy --no-browser --port 8199
     2. playwright installe hors du repo ; NODE_PATH pointe sur son node_modules
     3. node tests/test_ecran_registre.js */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }
const ORIGIN = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let ko = 0;
  const dire = (ok, txt) => { console.log(`  ${ok ? 'ok  ' : 'KO  '}${txt}`); if (!ok) ko++; };
  const vu = s => page.isVisible(s);

  console.log('\n[1] sans ?character= : l\'app s\'ouvre sur le registre');
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  dire(erreurs.length === 0, `aucune erreur JS (${erreurs.length})`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));
  dire(await vu('#registre'), 'l\'ecran #registre est visible');
  dire(!(await vu('#creer')), 'l\'ecran #creer n\'est PAS affiche au demarrage');
  dire(/Studio/.test((await page.textContent('.brand')).trim()),
       'l\'en-tete est neutre (« Studio »), aucun personnage revendique');

  console.log('\n[2] les cartes du registre');
  const cartes = await page.$$eval('#charGrid .char-card:not(.char-card--new)',
    els => els.map(a => ({
      href: a.getAttribute('href'),
      id: a.querySelector('code')?.textContent.trim(),
      tags: [...a.querySelectorAll('.char-tag')].map(t => t.textContent.trim()),
    })));
  dire(cartes.length >= 2, `${cartes.length} personnages listes`);
  const lena = cartes.find(c => c.id === 'lena');
  dire(!!lena && lena.href === '?character=lena', 'carte lena -> ?character=lena');
  dire(!!lena && lena.tags.some(t => /instagram/i.test(t))
       && lena.tags.some(t => /slow life/i.test(t)),
       `carte lena porte type + monde : ${lena ? lena.tags.join(' | ') : '(absente)'}`);

  console.log('\n[3] la carte « + Nouveau personnage »');
  const neuve = page.locator('#charGrid .char-card--new');
  dire(await neuve.count() === 1, 'une seule carte « nouveau personnage »');
  dire(await neuve.getAttribute('href') === '#wizard', 'elle pointe vers #wizard');

  console.log('\n[4] ?character= explicite : le sas est court-circuite');
  await page.goto(ORIGIN + '/?character=abyssiaelle', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  dire(await vu('#creer'), 'avec ?character=abyssiaelle, on ouvre directement #creer');
  dire(!(await vu('#registre')), 'le registre n\'est pas affiche');
  const brand = (await page.textContent('.brand')).replace(/\s+/g, ' ').trim();
  dire(/Abyssiaelle/.test(brand), `en-tete = « ${brand} »`);

  console.log('\n[5] depuis une carte : navigation vers le personnage');
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await Promise.all([
    page.waitForURL(/character=lena/, { timeout: 8000 }),
    page.click('#charGrid .char-card[href="?character=lena"]'),
  ]);
  await page.waitForTimeout(1000);
  dire(await vu('#creer'), 'la carte lena ouvre sa production');
  dire(erreurs.length === 0, `toujours aucune erreur JS (${erreurs.length})`);

  console.log(`\n${ko ? ko + ' ECHEC(S)' : 'tout est vert'}`);
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
