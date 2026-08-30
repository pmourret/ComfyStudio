/* Fumigation NAVIGATEUR de l'ecran #registre — ses DEUX vues.

     [sas]    sans ?character= : la grille de choix (J7bis). L'app s'ouvre la,
              la navbar du studio est absente, aucun personnage n'est
              revendique.
     [fiche]  avec ?character= : la FICHE du personnage charge (F1.2,
              30/08/2026). Elle LIT — nom, id, type, monde, pack, base gelee,
              etat du contenu adulte — et n'arme rien : le seul geste
              d'armement vit dans l'ecran Application (J7, ADR-0010).

   Ce que le test verrouille en plus : `data-s="registre"` ne bouge pas (c'est
   le contrat de navigation), la fiche ne rejoue PAS une grille de choix, et
   « Tous les personnages » rouvre le menu de l'en-tete — un seul endroit ou
   l'on change de personnage.

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

  console.log('\n[1] [sas] sans ?character= : l\'app s\'ouvre sur le registre');
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  dire(erreurs.length === 0, `aucune erreur JS (${erreurs.length})`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));
  dire(await vu('#registre'), 'l\'ecran #registre est visible');
  dire(!(await vu('#creer')), 'l\'ecran #creer n\'est PAS affiche au demarrage');
  dire(/Soulglade/.test((await page.textContent('.brand')).trim()),
       'l\'en-tete est neutre (« Soulglade »), aucun personnage revendique');
  dire((await page.getAttribute('#registre', 'data-vue')) === 'sas',
       'l\'ecran est en vue « sas »');
  dire(await vu('#charGrid'), 'la grille de choix est la');
  dire(!(await vu('#fiche')), 'et la fiche d\'un personnage charge ne l\'est pas');
  // la navbar ENTIERE est masquee sur le sas (body.no-character) : le sas ne
  // propose aucune destination, il fait entrer
  dire(await page.evaluate(() => document.body.classList.contains('no-character')),
       'body.no-character posé');
  const ongletsSas = await page.$$eval('.tabs button',
    e => e.filter(b => b.offsetParent !== null).length);
  dire(ongletsSas === 0, `aucun onglet de studio visible sur le sas (${ongletsSas})`);

  console.log('\n[2] [sas] les cartes du registre');
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

  console.log('\n[3] [sas] la carte « + Nouveau personnage »');
  const neuve = page.locator('#charGrid .char-card--new');
  dire(await neuve.count() === 1, 'une seule carte « nouveau personnage »');
  dire(await neuve.getAttribute('href') === '#wizard', 'elle pointe vers #wizard');

  /* [3b] Le bas du sas doit etre VIDE. Le 29/08/2026 il portait une capsule
     grise de 34x24 sans libelle, centree, collee au bord : le toast au repos.
     `translateY(120%)` ne le sortait pas de l'ecran — 120 % d'un toast vide
     font 29 px, alors qu'il faut franchir sa hauteur PUIS les 26 px de
     `bottom` — et il restait cliquable. Le sas est le seul ecran sans
     `.launch` pour le noyer, d'ou la capture. On verifie la BANDE, pas le seul
     coupable connu : n'importe quelle surface fixed qui percerait demain
     tomberait ici aussi. */
  console.log('\n[3b] [sas] les 48 px bas sont vides (29/08/2026)');
  const intrus = await page.evaluate(() => {
    const H = innerHeight, SEUIL = H - 48, sas = document.querySelector('#registre');
    const out = [];
    for (const e of document.querySelectorAll('*')){
      // les conteneurs qui PORTENT le sas ont le droit d'occuper la bande :
      // c'est l'ecran lui-meme, pas un controle pose dessus
      if (e === sas || e.contains(sas)) continue;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom <= SEUIL || r.top >= H) continue;
      if (!e.checkVisibility({visibilityProperty: true, opacityProperty: true})) continue;
      out.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
               ' [' + Math.round(r.width) + 'x' + Math.round(r.height) + ']');
    }
    return out;
  });
  dire(intrus.length === 0,
       intrus.length ? `intrus dans la bande basse : ${intrus.join(', ')}`
                     : 'aucun element visible dans les 48 px bas');
  // « clic dans cette zone = rien » : ce que le curseur touche au bas du
  // viewport doit etre du decor, jamais un controle
  const sousLeCurseur = await page.evaluate(() => {
    const e = document.elementFromPoint(Math.round(innerWidth / 2), innerHeight - 12);
    return e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') : '(rien)';
  });
  dire(!/^(button|input|a|select|textarea)/.test(sousLeCurseur) &&
       !/#toast/.test(sousLeCurseur),
       `au bas du viewport, le curseur touche : ${sousLeCurseur}`);
  // le coupable nomme, pour que la regression se lise sans deduire
  const repos = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('#toast'));
    return {v: cs.visibility, p: cs.pointerEvents};
  });
  dire(repos.v === 'hidden' && repos.p === 'none',
       `#toast au repos : visibility=${repos.v} pointer-events=${repos.p}`);

  console.log('\n[4] [fiche] ?character= explicite : le sas est court-circuite');
  await page.goto(ORIGIN + '/?character=abyssiaelle', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  dire(await vu('#creer'), 'avec ?character=abyssiaelle, on ouvre directement #creer');
  dire(!(await vu('#registre')), 'le registre n\'est pas affiche');
  const brand = (await page.textContent('.brand')).replace(/\s+/g, ' ').trim();
  dire(/Abyssiaelle/.test(brand), `en-tete = « ${brand} »`);

  /* [4b] LA FICHE (F1.2). L'entree de navbar ouvrait le meme ecran que le sas :
     une seconde porte pour CHOISIR, alors que le menu identite de l'en-tete le
     fait deja — et aucune porte pour LIRE le personnage ouvert. On verifie donc
     les deux moities : ce que la fiche montre, et ce qu'elle ne rejoue pas. */
  console.log('\n[4b] [fiche] la navbar mene a la fiche du personnage charge');
  const libFiche = (await page.textContent('.tabs button[data-s="registre"]')).trim();
  dire(libFiche === 'Fiche', `l'entree de navbar dit « ${libFiche} »`);
  await page.click('.tabs button[data-s="registre"]');
  await page.waitForTimeout(1200);
  dire(await vu('#registre'), 'elle ouvre l\'ecran #registre');
  dire((await page.getAttribute('#registre', 'data-vue')) === 'fiche',
       'en vue « fiche »');
  dire(await vu('#fiche'), 'la fiche est peinte');
  dire(!(await vu('#charGrid')),
       'et la grille de choix N\'EST PAS rejouee dans la fiche');
  dire(await page.evaluate(() => location.hash) === '#registre',
       'hash #registre — `data-s` inchange, c\'est le contrat de navigation');

  const fiche = (await page.textContent('#fiche')).replace(/\s+/g, ' ').trim();
  const dit = re => re.test(fiche);
  dire(dit(/Abyssiaelle/) && dit(/abyssiaelle/), 'elle porte le nom et l\'id');
  dire(dit(/rpg-personnage/), 'le type');
  dire(dit(/Terres sauvages/), 'le monde');
  dire(dit(/RPG \/ personnage/) && dit(/sdxl/), 'le pack et sa famille de modele');
  dire(dit(/Base gelée/) && dit(/présente|absente|introuvable/), 'l\'etat de la base gelée');
  // pas de portrait : aucune route ne sert les octets de la base gelée (elle
  // vit hors de PROD/, cote entrees ComfyUI) — la fiche montre l'initiale
  dire((await page.$$('#fiche img')).length === 0,
       'aucune image : la pastille est l\'initiale, comme dans l\'en-tete');
  dire((await page.textContent('#fiche .fiche-av')).trim() === 'A',
       'la pastille porte l\'initiale du nom');

  console.log('\n[4c] [fiche] contenu adulte : LU, jamais armé depuis ici');
  dire(dit(/Contenu adulte/) && dit(/désactivé/),
       `l'etat est affiche : ${(fiche.match(/État : [^·]+/) || ['(absent)'])[0].trim()}`);
  dire(dit(/n’existe pas encore pour ce pack|n'existe pas encore pour ce pack/),
       'et la raison quand le pack n\'a pas l\'outil');
  dire(dit(/Application → Contenu adulte/),
       'la fiche dit OU se prend la decision, sans la proposer');
  const boutonsFiche = await page.$$eval('#fiche button',
    e => e.map(b => (b.textContent || '').replace(/\s+/g, ' ').trim()));
  dire(!boutonsFiche.some(t => /Activer|Désactiver/i.test(t)),
       `aucun bouton d'armement dans la fiche : ${boutonsFiche.join(' | ') || '(aucun)'}`);
  dire(await page.evaluate(() => !document.querySelector('#armBox').open),
       '#armBox reste fermee');

  console.log('\n[4d] [fiche] « Tous les personnages » rouvre le menu de l\'en-tete');
  await page.click('#ficheAutres');
  await page.waitForTimeout(500);
  dire(await page.evaluate(() => document.getElementById('idMenu').classList.contains('on')),
       'le menu d\'identite du chrome est ouvert');
  dire(!(await vu('#charGrid')), 'toujours pas de seconde grille dans l\'ecran');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  console.log('\n[4e] [fiche] l\'autre personnage, meme structure, ses valeurs');
  await page.goto(ORIGIN + '/?character=lena#registre', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  dire((await page.getAttribute('#registre', 'data-vue')) === 'fiche',
       'la fiche s\'ouvre directement depuis le hash');
  const fl = (await page.textContent('#fiche')).replace(/\s+/g, ' ').trim();
  dire(/Léna/.test(fl) && /instagram-influenceur/.test(fl) && /Slow life/.test(fl),
       'nom, type et monde sont ceux de lena');
  dire(/Instagram \/ influenceur/.test(fl) && /flux/.test(fl),
       'son pack est celui de sa famille de modele, pas celui d\'abyssiaelle');
  dire(!/rpg-personnage|Terres sauvages|Abyssiaelle/.test(fl),
       'et rien de l\'autre personnage n\'y traine');
  dire(/activé/.test(fl), 'sa branche adulte est lue comme activée');
  dire((await page.textContent('#fiche .fiche-av')).trim() === 'L',
       'la pastille suit le personnage');

  console.log('\n[5] [sas] depuis une carte : navigation vers le personnage');
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
