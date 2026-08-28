/* Fumigation NAVIGATEUR du wizard « nouveau personnage » (#wizard, J7bis).
   Parcourt type -> style -> monde -> base et verifie le GATING a chaque pas
   (le bouton « Suivant » / « Créer » ne s'active qu'aux bonnes conditions),
   la validation de l'identifiant, et le cas du type mono-style.

   Le test NE CREE AUCUN personnage : il ne clique jamais « Créer », ne
   televerse rien, ne lance aucune generation. Il verifie la mecanique du
   parcours, pas la production.

   PREREQUIS (hors du repo) :
     1. python web/app.py --no-comfy --no-browser --port 8199
     2. playwright hors du repo ; NODE_PATH pointe sur son node_modules
     3. node tests/test_ecran_wizard.js */
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
  const nextOff = () => page.isDisabled('#wizNext');
  const stepTitles = () => page.$$eval('#wizSteps li', els =>
    els.map(l => ({ label: l.textContent.replace(/\s+/g, ' ').trim(), on: l.classList.contains('on') })));

  console.log('\n[1] on arrive au wizard depuis le registre');
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.click('#charGrid .char-card--new');
  await page.waitForTimeout(600);
  dire(await page.isVisible('#wizard'), 'l\'ecran #wizard est visible');
  const steps = await stepTitles();
  dire(steps.length === 4 && steps[0].on,
       `4 pas, « Type » actif : ${steps.map(s => s.label).join(' > ')}`);

  console.log('\n[2] identifiant : validation en direct');
  await page.fill('#wizName', 'Sonde Test');
  await page.fill('#wizCid', 'Sonde Test');            // invalide : espace + majuscule
  await page.waitForTimeout(200);
  dire(/minuscules/.test(await page.textContent('#wizCidHint')),
       'un cid non-slug est signale');
  await page.fill('#wizCid', 'sonde-test');
  await page.waitForTimeout(200);
  dire((await page.textContent('#wizCidHint')).includes('✓'), 'un cid valide passe');

  console.log('\n[3] pas 1 — type : le bouton ne s\'active qu\'apres un choix');
  dire(await nextOff(), '« Suivant » desactive tant qu\'aucun type n\'est choisi');
  const types = await page.$$eval('#wizBody .it b', b => b.map(x => x.textContent.trim()));
  dire(types.length >= 2, `${types.length} types proposes : ${types.join(', ')}`);
  await page.click('#wizBody .it:has-text("RPG")');
  await page.waitForTimeout(200);
  dire(!(await nextOff()), '« Suivant » actif apres le choix du type');

  console.log('\n[4] pas 2 — style (rpg-personnage : plusieurs styles)');
  await page.click('#wizNext');
  await page.waitForTimeout(300);
  dire((await stepTitles())[1].on, 'pas « Style » actif');
  dire(await nextOff(), '« Suivant » desactive tant qu\'aucun style n\'est choisi');
  const styles = await page.$$eval('#wizBody .it b', b => b.map(x => x.textContent.trim()));
  dire(styles.length >= 2, `${styles.length} styles : ${styles.join(', ')}`);
  await page.click('#wizBody .it:has-text("realiste")');
  await page.waitForTimeout(200);
  dire(!(await nextOff()), '« Suivant » actif apres le choix du style');

  console.log('\n[5] pas 3 — monde');
  await page.click('#wizNext');
  await page.waitForTimeout(300);
  dire((await stepTitles())[2].on, 'pas « Monde » actif');
  dire(await nextOff(), '« Suivant » desactive tant qu\'aucun monde n\'est choisi');
  const mondes = await page.$$eval('#wizBody .it b', b => b.map(x => x.textContent.trim()));
  dire(mondes.length >= 1, `${mondes.length} monde(s) : ${mondes.join(', ')}`);
  await page.click('#wizBody .it');
  await page.waitForTimeout(200);
  dire(!(await nextOff()), '« Suivant » actif apres le choix du monde');

  console.log('\n[6] pas 4 — base : « Créer » reste bloque sans base gelee');
  await page.click('#wizNext');
  await page.waitForTimeout(300);
  dire((await stepTitles())[3].on, 'pas « Base d\'identité » actif');
  const btn = (await page.textContent('#wizNext')).trim();
  dire(/Créer/.test(btn), `le bouton devient « ${btn} »`);
  dire(await nextOff(), '« Créer » desactive tant qu\'aucune base n\'est gelee');
  dire(await page.isVisible('#wizFile') || await page.isVisible('label[for="wizFile"]'),
       'le choix de fichier (base fournie) est present');
  dire(await page.isVisible('#wizGen'), 'le bouton « Générer 4 portraits » est present');

  console.log('\n[7] retour arriere');
  await page.click('#wizBack');
  await page.waitForTimeout(300);
  dire((await stepTitles())[2].on, '« Retour » ramene au pas Monde');

  console.log('\n[8] type mono-style : le style est pris d\'office');
  await page.click('#wizBack'); await page.waitForTimeout(200);   // -> style
  await page.click('#wizBack'); await page.waitForTimeout(200);   // -> type
  await page.click('#wizBody .it:has-text("Instagram")');
  await page.waitForTimeout(200);
  await page.click('#wizNext');                                   // -> style
  await page.waitForTimeout(300);
  dire(/un style/.test(await page.textContent('#wizBody')),
       'le pas Style explique qu\'il n\'y a qu\'un style');
  dire(!(await nextOff()), '« Suivant » deja actif (style unique pris automatiquement)');

  dire(erreurs.length === 0, `aucune erreur JS sur tout le parcours (${erreurs.length})`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log(`\n${ko ? ko + ' ECHEC(S)' : 'tout est vert'}`);
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
