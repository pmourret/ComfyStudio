/* Fumigation NAVIGATEUR du contenu adulte (J7) : le cran d'edition n'apparait
   sur Produire que si le personnage est arme ET si son pack declare un graphe
   d'edition — et le geste qui arme n'a qu'UN endroit, l'ecran Application.

   CE QUE CE TEST VERROUILLE, et que rien d'autre ne verifie :

     1. Sans les deux conditions, le cran est ABSENT du curseur — pas grise.
        Un cran grise reste une invitation ; le NSFW est off par defaut
        (ADR-0003, CLAUDE.md §6). Abyssiaelle sert de cas reel : desarmee, et
        son pack (rpg-personnage) n'a pas de graphe d'edition.
     2. Les autres crans ne bougent pas. Masquer le cran d'edition ne doit pas
        toucher SFW / Soft / Suggestif : ce n'est pas le cran d'un outil.
     3. Lena armee garde son cran : non-regression du chemin qui marche.
     4. Le flux de PRODUCTION ne propose plus d'armer. Ni bouton « désarmer »
        sur le bloc Image source, ni porte dans la modale Decliner : la
        decision se prend sur Application, et nulle part ailleurs.
     5. L'ecran Application dit la RAISON quand le pack n'a pas l'outil, au
        lieu de proposer un interrupteur qui ne ferait rien apparaitre.

   Le test LIT seulement : il n'arme ni ne desarme personne. L'etat reel du
   registre (lena armee, abyssiaelle non) est le materiau du test, et il est
   verifie AVANT de conclure — un registre different fait un IGNORE explicite,
   jamais un faux vert.

   PREREQUIS (hors du repo, qui n'a aucune dependance) :
     1. python web/app.py --no-comfy --no-browser --port 8199
     2. playwright installe hors du repo ; NODE_PATH pointe sur son node_modules
     3. node tests/test_contenu_adulte.js */
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
  const crans = () => page.$$eval('#intSel button',
    els => els.map(b => b.textContent.replace(/\s+/g, ' ').trim()));
  const etat = async cid => (await page.evaluate(async c =>
    (await fetch(`/api/nsfw/state?character=${c}`)).json(), cid));

  // --------------------------------------------------- prerequis du registre
  await page.goto(ORIGIN + '/?character=lena', { waitUntil: 'networkidle' });
  const eLena = await etat('lena');
  const eAby = await etat('abyssiaelle');
  if (!eLena?.outil?.available || eAby?.outil?.available !== false) {
    console.log('  IGNORE — registre attendu : lena avec l\'outil disponible, '
      + 'abyssiaelle sans. Etat lu : '
      + `lena=${!!eLena?.outil?.available} abyssiaelle=${!!eAby?.outil?.available}`);
    await nav.close();
    process.exit(0);
  }

  console.log('\n[1] Lena (armee, pack avec graphe) : le cran est la');
  await page.waitForTimeout(900);
  const cLena = await crans();
  console.log('      crans : ' + cLena.join(' | '));
  dire(cLena.some(t => /NSFW/i.test(t)), 'le cran d\'edition est present');
  dire(cLena.length >= 4, `${cLena.length} crans (echelle complete)`);
  dire(!(await page.$('#intSel button.locked')), 'aucun cran verrouille : le cran est la, ou il n\'y est pas');

  console.log('\n[2] Abyssiaelle (desarmee, pack sans graphe) : le cran est ABSENT');
  await page.goto(ORIGIN + '/?character=abyssiaelle', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const cAby = await crans();
  console.log('      crans : ' + (cAby.join(' | ') || '(aucun)'));
  dire(!cAby.some(t => /NSFW/i.test(t)), 'aucun cran NSFW dans le curseur');
  dire(!(await page.$('#intSel button.locked')), 'ni cran grise : absent, pas desactive');
  dire(cAby.length >= 1, `ses ${cAby.length} cran(s) SFW restent servis`);
  dire(!(await vu('#stepSource')), 'le bloc Image source reste masque');

  console.log('\n[3] le flux de production ne propose plus d\'armer');
  dire((await page.$$('#btnDisarm')).length === 0,
       'plus de bouton « désarmer » sur le bloc Image source');
  const txtCreer = (await page.textContent('#creer')) || '';
  dire(!/recopier le mot ARMER/i.test(txtCreer),
       'le rituel d\'armement n\'est pas dans l\'ecran Produire');

  console.log('\n[4] l\'ecran Application porte la decision, et la raison');
  await page.click('.tabs button[data-s="appli"]');
  await page.waitForTimeout(900);
  dire(await vu('#nsfwBox'), 'la section « Contenu adulte » est visible');
  const qui = ((await page.textContent('#nsfwQui')) || '').trim();
  dire(/Abyssiaelle/i.test(qui), `elle nomme le personnage courant : « ${qui} »`);
  const boite = ((await page.textContent('#nsfwBox')) || '').replace(/\s+/g, ' ');
  dire(/n'existe pas encore pour ce pack/i.test(boite),
       'elle donne la raison du pack, au lieu de promettre un cran');
  console.log('      « ' + boite.slice(0, 190).trim() + ' »');
  dire(/rpg-personnage/.test(boite), 'et nomme le pack en cause');
  dire((await page.$$('#nsfwBox button')).length === 1,
       'un seul geste propose (activer), jamais deux interrupteurs');

  console.log('\n[5] Lena : Application propose le desarmement, au meme endroit');
  await page.goto(ORIGIN + '/?character=lena', { waitUntil: 'networkidle' });
  await page.click('.tabs button[data-s="appli"]');
  await page.waitForTimeout(900);
  const bLena = ((await page.textContent('#nsfwBox')) || '').replace(/\s+/g, ' ');
  dire(/activé/i.test(bLena), 'etat annonce « activé »');
  dire(/PROD\/LENA\/_NSFW/.test(bLena),
       `la sortie nommee porte le personnage : ${(bLena.match(/PROD\/\S+/) || ['(absente)'])[0]}`);
  dire(!/PROD\/_NSFW/.test(bLena), 'jamais un PROD/_NSFW sans personnage');
  dire((await page.$$('#nsfwBox button')).length === 1,
       'un seul geste propose (desactiver)');

  console.log('\n[6] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
