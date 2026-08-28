/* Fumigation NAVIGATEUR de l'ecran Creer, apres la refonte du cran NSFW
   (26/08/2026). Charge la page pour de vrai, note toute erreur JS, puis parcourt
   les deux modes du curseur et verifie que les bons blocs sont a l'ecran.

   Ce que les autres tests ne couvrent pas : test_panneau_reglages.js n'evalue que
   create.js dans un DOM stub, donc il ne voit ni le HTML, ni le CSS, ni les trois
   autres fichiers, ni une erreur au chargement. Or une erreur JS au demarrage
   casse toute l'interface en silence.

   PREREQUIS, et c'est volontaire qu'ils ne soient pas dans le projet :
     1. un tableau de bord qui tourne, de preference sur un port de test
          python web/app.py --no-comfy --no-browser --port 8199
     2. playwright, installe hors du repo (le projet n'a aucune dependance)
          npm i playwright && npx playwright install chromium
     3. node tests/test_ecran_creer.js

   Le test LIT seulement : il coche une source et regarde la barre de lancement,
   il ne clique jamais sur Generer. Regle du projet — aucun test ne laisse de
   trace dans les donnees reelles. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }
// Depuis J7bis, l'app s'ouvre sur le registre quand l'URL n'a pas de
// ?character= : ce test porte sur l'ecran Creer d'un personnage precis, il
// nomme donc lena explicitement (comme le ferait un lien du registre).
const B = (process.env.DASHBOARD_URL || 'http://127.0.0.1:8199') + '/?character=lena';

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
  page.on('requestfailed', r => erreurs.push('requete KO: ' + r.url()));

  await page.goto(B, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  let ko = 0;
  const dire = (ok, txt) => { console.log(`  ${ok ? 'ok  ' : 'KO  '}${txt}`); if (!ok) ko++; };
  const vu = s => page.isVisible(s);

  console.log('\n[1] chargement');
  dire(erreurs.length === 0, `aucune erreur JS (${erreurs.length})`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));
  dire(await vu('#intSel'), 'le curseur d\'intensite est peint');
  const crans = await page.$$eval('#intSel button', bs => bs.map(b => b.textContent.trim()));
  dire(crans.length === 4, `4 crans : ${crans.join(' | ')}`);

  console.log('\n[1b] en-tete reflete le registre personnage (J4 + chrome J7bis)');
  const brand = (await page.textContent('.brand')).replace(/\s+/g, ' ').trim();
  dire(/Léna/.test(brand), `.brand porte le nom lisible du registre : « ${brand} »`);
  const bid = ((await page.textContent('.brand .brand-id')) || '').trim();
  dire(bid === 'lena', `l'identifiant reel est affiche a cote du nom : « ${bid} »`);
  const tags = await page.$$eval('.brand .brand-tag', e => e.map(x => x.textContent.trim()));
  dire(tags.some(t => /instagram/i.test(t)), `tag type peint : ${tags.join(' | ')}`);
  dire(tags.some(t => /slow life/i.test(t)), 'tag monde peint');
  const titre = await page.title();
  dire(/Léna — production/.test(titre), `titre d'onglet = « ${titre} »`);

  console.log('\n[1c] les selecteurs sont operables au clavier (grille E)');
  const semantique = await page.$$eval(
    '#intentGrid .it, #toneRow .chip-t',
    els => els.map(e => e.tagName));
  dire(semantique.length > 0 && semantique.every(t => t === 'BUTTON'),
       `intentions + tons sont des <button> (${[...new Set(semantique)].join(', ')})`);
  const focusable = await page.evaluate(() => {
    const b = document.querySelector('#intentGrid .it');
    if (!b) return false;
    b.focus();
    return document.activeElement === b;
  });
  dire(focusable, 'une carte d\'intention prend le focus');

  console.log('\n[2] cran SFW — parcours par scenes');
  dire(await vu('#stepIntent'), 'bloc Intention visible');
  dire(!(await vu('#stepSource')), 'bloc Image source masque');
  const vides = await page.$$eval('#intentVideGrid .it', e => e.map(x => x.textContent.trim()));
  dire(await vu('#intentVides'), `intentions vides isolees : ${vides.length}`);
  vides.forEach(v => console.log('      ' + v.replace(/\s+/g, ' ')));

  console.log('\n[3] passage au cran NSFW');
  await page.click('#intSel button[data-lv="3"]');
  await page.waitForTimeout(1200);
  dire(await vu('#stepSource'), 'bloc Image source visible');
  dire(await vu('#stepEdit'), 'bloc Instruction visible');
  dire(!(await vu('#stepIntent')), 'bloc Intention masque');
  dire(!(await vu('#stepScenes')), 'bloc Scenes masque');
  const nsrc = await page.$$eval('#srcGrid .src', e => e.length);
  dire(nsrc > 0, `${nsrc} images sources proposees`);
  const num = await page.textContent('#stepSource .num');
  dire(num === '1', `numerotation contextuelle : source = ${num}`);

  console.log('\n[4] preambule et bibliotheque');
  const pre = (await page.textContent('#preambule')) || '';
  dire(pre.includes('Keep unchanged'), `preambule reel affiche (${pre.length} car.)`);
  const bib = await page.$$eval('#biblioList .bib', e => e.length);
  dire(bib > 0, `${bib} instructions deja employees proposees`);

  console.log('\n[5] alertes d\'instruction, en direct');
  await page.fill('#editInstr', 'head tilted back, eyes closed');
  await page.waitForTimeout(900);
  const al = await page.$$eval('#instrAlertes .alerte', e => e.map(x => x.textContent.trim()));
  dire(al.length === 2, `${al.length} alertes sur une instruction fautive`);
  al.forEach(a => console.log('      ' + a.slice(0, 96)));
  await page.fill('#editInstr', 'unbuttoned linen shirt');
  await page.waitForTimeout(900);
  dire((await page.$$eval('#instrAlertes .alerte', e => e.length)) === 0,
       'aucune alerte sur une instruction propre');

  console.log('\n[6] barre de lancement en mode edition');
  await page.click('#srcGrid .src');
  await page.waitForTimeout(900);
  const lib = (await page.textContent('#btnRun')).trim();
  const som = (await page.textContent('#sumT')).trim();
  dire(/Éditer/.test(lib), `le bouton dit « ${lib} »`);
  console.log('      resume : ' + som);
  dire(!(await page.isDisabled('#btnRun')), 'bouton actif une fois source + instruction');

  console.log('\n[7] retour au cran SFW');
  await page.click('#intSel button[data-lv="0"]');
  await page.waitForTimeout(900);
  dire(await vu('#intentGrid'), 'bloc Intention revenu');
  dire(!(await vu('#stepSource')), 'bloc Image source reparti');
  dire((await page.textContent('#btnRun')).trim() === 'Générer', 'le bouton redit « Générer »');

  console.log('\n[8] onglet NSFW parallele');
  const adv = await page.$$eval('.advmenu button', e => e.map(x => x.dataset.s));
  dire(!adv.includes('nsfw'), `menu Avance : ${adv.join(', ')}`);
  dire((await page.$$('#nsfw')).length === 0, 'l\'ecran #nsfw n\'existe plus');

  console.log('\n[9] editeur de scenes — schema simplifie');
  await page.click('#btnAdv');
  await page.click('.advmenu button[data-s="scenes"]');
  await page.waitForTimeout(700);
  const cartes = await page.$$('#sceneCards .sceneCard');
  dire(cartes.length > 0, `${cartes.length} cartes de scene`);
  dire((await page.$$('#sceneCards [data-f="category"]')).length === 0,
       'le champ « categorie » a disparu des cartes');
  dire((await page.$$('#sceneCards [data-f="band_hi"]')).length === 0,
       'la borne haute de la bande a disparu');
  dire((await page.$$('#sceneCards [data-f="band_lo"]')).length === cartes.length,
       'le niveau minimum reste saisissable');
  // le plafond affiche doit suivre la saisie des tenues, sans repeindre la carte
  const carte1 = cartes[0];
  const plafond = () => carte1.$eval('[data-f="band_lo"]',
    e => e.closest('.f').querySelector('span b').textContent);
  const avantP = await plafond();
  const wd = await carte1.$('[data-f="wardrobe"]');
  const texteWd = await wd.inputValue();
  await wd.fill(texteWd + '\n2: a thin slip');
  await page.waitForTimeout(250);
  const apresP = await plafond();
  dire(avantP === '1' && apresP === '2',
       `plafond deduit des tenues, en direct : ${avantP} -> ${apresP}`);
  await wd.fill(texteWd);            // on ne laisse aucune trace : rien n'est enregistre
  await page.waitForTimeout(200);
  dire((await plafond()) === avantP, 'retour a l etat initial, rien n est enregistre');

  console.log('\n[10] panneau de reglages replie');
  await page.click('.tabs button[data-s="creer"]');
  await page.waitForTimeout(400);
  await page.click('#btnGear');
  await page.waitForTimeout(300);
  const plis = await page.$$('#gearBody .rgs.pli');
  dire(plis.length === 3, `${plis.length} sections de rendu repliees`);
  const ouverts = await page.$$eval('#gearBody .rgs.pli details',
                                    e => e.filter(d => d.open).length);
  dire(ouverts === 0, 'elles sont fermees par defaut');
  // checkVisibility() et pas offsetParent : #gearPanel est en position fixed, et
  // sous un ancetre fixe Chromium rend un offsetParent non nul meme pour un
  // element replie dans un <details> ferme
  const visibles = await page.$$eval('#gearBody .rg',
    e => e.filter(x => x.checkVisibility()).length);
  dire(visibles === 6, `${visibles} reglages visibles au repos, sur 23 (5 du lot + 1 de contrôle)`);

  /* [11] Rejoue la panne du 26/08/2026 : un tableau de bord laisse ouvert
     pendant une migration de scenes.json sert l'ancien code contre les nouvelles
     donnees et repond 500. `api()` ne leve jamais — il rend {ok:false} — donc les
     chargeurs prenaient cet objet pour une banque, le premier acces a
     .data.scenes levait, et l'ecran Creer restait VIDE sans un mot : ni
     intention, ni scene, ni curseur. Il doit desormais le dire. */
  console.log('\n[11] panne serveur — l\'ecran doit le dire');
  const p2 = await nav.newPage();
  const err2 = [];
  p2.on('pageerror', e => err2.push(e.message));
  const cinqCents = r => r.fulfill({status: 500, contentType: 'text/html',
                                    body: '500 Internal Server Error'});
  // depuis J3 etape 4 chaque appel porte ?character=lena : le glob doit
  // laisser passer une chaine de requete (sinon la route n'intercepte plus rien)
  await p2.route('**/api/scenes?*', cinqCents);
  await p2.route('**/api/creative?*', cinqCents);
  await p2.goto(B, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1500);
  dire(await p2.isVisible('#panneBar'), 'le bandeau de panne s\'affiche');
  dire(await p2.isVisible('#btnRecharger'), 'un bouton « Réessayer » est proposé');
  dire(err2.length === 0,
       `aucune erreur JS non gérée pendant la panne (${err2.length})`);
  err2.forEach(e => console.log('      ' + e.slice(0, 150)));
  const txt = ((await p2.textContent('#panneBar')) || '').replace(/\s+/g, ' ');
  dire(/500/.test(txt), 'le message porte l\'erreur réelle du serveur');
  console.log('      ' + txt.trim().slice(0, 140));
  await p2.close();

  console.log(`\n${ko ? ko + ' ECHEC(S)' : 'tout est vert'}`);
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
