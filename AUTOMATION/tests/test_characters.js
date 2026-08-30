/* Browser smoke test of the REACT registry and character sheet — the two halves
   of the legacy `#registre`, now two routes.

   WHAT THIS TEST HOLDS:

     1. /characters is the ENTRY GATE. Without a claimed character the navbar
        does not exist: there is no workshop to navigate, the registry takes the
        whole screen, and choosing a character is what MAKES you enter.
     2. Choosing one DOES NOT RELOAD the page (migration brief, point 1), while
        `?character=` follows in the URL so the link stays shareable.
     3. /character is the SHEET of the loaded character, and it READS. It does
        not replay a choice grid — « Tous les personnages » reopens the header
        menu, the one place a character is changed (F1.2) — and it arms nothing:
        adult content has a single gesture, on the Application screen (ADR-0010).
     4. The sheet says the three frozen axes (type, style, monde) AND that the
        pack is derived from them, never chosen (ADR-0012).
     5. The adult state is read PER CHARACTER, and its two conditions stay
        distinct: the character's switch, and the pack's edit graph. Léna
        (armed) and Abyssiaelle (not) are the two real cases.
     6. Switching character on the sheet repaints it without a reload, and shows
        the OTHER character's data — the isolation the whole platform rests on.
     7. No JS error over the whole run.

   NOT COVERED HERE, because these screens do not touch them: the three coupling
   traps of AUDIT §5.6. Neither screen shows an image (`v`), plans a run
   (/api/plan) or drives #btnRun.

   PREREQUISITES: see test_journal.js — run_browser_tests.py does all of it. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1500, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const vu = s => page.isVisible(s).catch(() => false);

  console.log('\n[1] sans ?character=, la racine ouvre le SAS');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  dire(await page.evaluate(() => location.pathname) === '/characters',
       'la racine redirige vers /characters');
  dire(await vu('#charGrid'), 'la grille de choix est la');
  dire(!(await vu('.sidenav')), 'la navbar est ABSENTE : aucun atelier a naviguer');
  dire(!(await vu('#btnId')), "le menu d'identite aussi : aucun personnage revendique");

  console.log('\n[2] la grille liste le registre, plus une carte de creation');
  const cartes = await page.$$eval('.char-card:not(.char-card--new)',
                                   e => e.map(c => c.querySelector('code').textContent));
  dire(cartes.includes('lena') && cartes.includes('abyssiaelle'),
       `les deux personnages sont la : ${cartes.join(', ')}`);
  dire(await vu('.char-card--new'), '« + Nouveau personnage » est present');
  dire(await page.$$eval('.char-card--current', e => e.length) === 0,
       'aucune carte marquee « courante » : rien n est encore ouvert');
  const tags = await page.$eval('.char-card:not(.char-card--new)',
                                c => [...c.querySelectorAll('.char-tag')].map(t => t.textContent));
  dire(tags.length >= 2, `chaque carte porte son type et son monde (${tags.join(' · ')})`);

  console.log('\n[3] choisir un personnage FAIT ENTRER, sans rechargement');
  await page.evaluate(() => { window.__temoinSansRechargement = 'vivant'; });
  await page.click('.char-card[href*="abyssiaelle"]');
  await page.waitForTimeout(700);
  dire(await page.evaluate(() => window.__temoinSansRechargement) === 'vivant',
       'le temoin a survecu : aucun rechargement');
  dire((await page.evaluate(() => location.search)).includes('character=abyssiaelle'),
       '?character= est dans l URL (le lien reste partageable)');
  dire(await vu('.sidenav'), 'la navbar apparait : on est entre dans l atelier');
  dire(await vu('#btnId'), "le menu d'identite aussi");

  console.log('\n[4] l entree de navbar dit ce qu elle ouvre');
  const lab = await page.textContent('.tabs [data-s="character"] .nav-lab');
  dire(lab.trim() === 'Fiche',
       `un personnage etant charge, elle lit « ${lab.trim()} » et non « Personnages »`);

  console.log('\n[5] la FICHE lit le personnage charge');
  await page.click('.tabs [data-s="character"]');
  await page.waitForTimeout(500);
  dire(await page.evaluate(() => location.pathname) === '/character',
       'chemin /character, distinct du sas');
  dire(await vu('#fiche'), 'la fiche est peinte');
  // elle ne rejoue PAS une grille de choix : c'etait tout l'objet de F1.2
  dire(!(await vu('#charGrid')), 'elle ne rejoue pas la grille de choix');
  const fiche = await page.textContent('#fiche');
  dire(fiche.includes('Abyssiaelle'), 'le nom du personnage');
  ['Type de personnage', 'Style de sortie', 'Monde', 'Pack', 'Base gelée', 'Contenus actifs']
    .forEach(k => dire(fiche.includes(k), `ligne « ${k} »`));
  dire(fiche.includes('figés à la création'),
       'elle dit que les trois axes humains sont figes');
  dire(fiche.includes('déduit'), "elle dit que le pack n'est pas choisi mais deduit");
  dire(fiche.includes('rpg-personnage'), 'le type reel du personnage, pas un exemple');

  console.log('\n[6] elle N ARME RIEN : le geste vit ailleurs (ADR-0010)');
  dire(fiche.includes('Contenu adulte'), "elle LIT l'etat du contenu adulte");
  dire(fiche.includes('désactivé'), 'Abyssiaelle est desarmee — etat lu, pas suppose');
  dire(fiche.includes('Application'), "elle dit ou le geste se prend : l'ecran Application");
  const armants = await page.$$eval('#fiche button, #fiche input',
    e => e.filter(x => /armer|activer|désactiver/i.test(x.textContent + x.value)).length);
  dire(armants === 0, 'aucun controle d armement dans la fiche');
  dire(!(await vu('#armBox')), "aucune boite d'armement ouverte");

  console.log('\n[7] « Tous les personnages » rouvre le menu de l en-tete');
  dire(await vu('#ficheAutres'), 'le renvoi est present');
  await page.click('#ficheAutres');
  await page.waitForTimeout(300);
  dire(await vu('#idMenu.on'), "il ouvre le menu d'identite du chrome, pas une seconde grille");
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  console.log('\n[8] changer de personnage repeint la fiche, sans rechargement');
  await page.evaluate(() => { window.__temoin2 = 'vivant'; });
  await page.click('#btnId');
  await page.waitForSelector('#idMenu.on a[href*="lena"]');
  await page.click('#idMenu a[href*="lena"]');
  await page.waitForTimeout(800);
  dire(await page.evaluate(() => window.__temoin2) === 'vivant', 'aucun rechargement');
  dire(await page.evaluate(() => location.pathname) === '/character', 'on est reste sur la fiche');
  const ficheLena = await page.textContent('#fiche');
  dire(ficheLena.includes('Léna'), 'la fiche montre le nouveau personnage');
  dire(ficheLena.includes('instagram-influenceur'), 'son type, pas celui du precedent');
  dire(!ficheLena.includes('rpg-personnage'), "rien du personnage precedent n'est reste");

  console.log('\n[9] l etat adulte est celui de CE personnage');
  dire(/État\s*:\s*activé/.test(ficheLena.replace(/\s+/g, ' ')),
       'Léna est armee — la lecture suit le personnage, pas un reglage global');

  console.log('\n[10] le sas reste atteignable, et marque le personnage courant');
  await page.goto(BASE + '/characters?character=lena', { waitUntil: 'networkidle' });
  const courante = await page.$$eval('.char-card--current', e => e.map(c => c.querySelector('code').textContent));
  dire(courante.length === 1 && courante[0] === 'lena',
       `la carte du personnage ouvert est marquee (${courante.join(',') || 'aucune'})`);

  console.log('\n[11] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
