/* Fumigation NAVIGATEUR de la Galerie (30/08/2026 — F1.1 / F1.3).

   CE QUE CE TEST VERROUILLE :

     1. Galerie et Revue sont DEUX destinations du chrome, sur un seul ecran.
        L'onglet Galerie allume le metier « galerie » et le dossier des
        validees ; l'onglet Revue rend la file a juger et ses gestes.
     2. En Galerie, aucun geste de TRI n'est propose — ni bouton Valider /
        Rejeter / Archiver, ni raccourci clavier. Ce n'est pas un grisage :
        les boutons n'existent pas dans ce metier.
     3. Ce qui les remplace y est : Éditer, et un telechargement qui est un
        <a download> sur /img (la route qui sert deja ces octets, bornee au
        personnage) — pas une API neuve.
     4. « Poster sur Instagram » est inerte ET le dit. La destination existe
        dans le metier du pack, pas encore dans le code.
     5. #galerie/<nomfichier> ouvre la Galerie SUR cette image ; un nom absent
        du dossier se dit a l'ecran, sans lever, et sans montrer une autre
        image a la place.
     6. Un onglet du chrome n'entre JAMAIS tout seul en espace NSFW (J7).

   PREREQUIS (hors du repo, qui n'a aucune dependance) :
     1. python web/app.py --no-comfy --no-browser --port 8199
     2. playwright installe hors du repo ; NODE_PATH pointe sur son node_modules
     3. node tests/test_galerie.js */
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }
const B = (process.env.DASHBOARD_URL || 'http://127.0.0.1:8199') + '/?character=lena';
// l'arbre d'un AUTRE personnage, pour l'epreuve d'isolation [6b]. Lu, jamais
// ecrit : aucun test ne laisse de trace dans les donnees reelles.
const OK_AUTRE = path.resolve(__dirname, '..', '..', 'PROD/ABYSSIAELLE/OK');

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1500, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let ko = 0;
  const dire = (ok, txt) => { console.log(`  ${ok ? 'ok  ' : 'KO  '}${txt}`); if (!ok) ko++; };
  const vu = s => page.isVisible(s);
  const metier = () => page.getAttribute('#trier', 'data-metier');
  const tuiles = () => page.$$eval('#triageBody .tile', e => e.length);

  await page.goto(B, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  console.log('\n[1] l\'onglet Galerie existe, a cote de Revue');
  const onglets = await page.$$eval('.tabs button', e => e.map(x => x.dataset.s));
  dire(onglets.includes('galerie'), `nav du studio : ${onglets.join(', ')}`);
  dire(onglets.includes('trier'), 'Revue garde son data-s="trier" (pastille, tests)');
  const lib = (await page.textContent('.tabs button[data-s="galerie"]')).trim();
  dire(lib === 'Galerie', `elle s'appelle « ${lib} »`);
  dire(await page.$eval('.tabs button[data-s="galerie"] .nav-ic', e => !!e),
       'et porte une icone, comme les cinq autres');
  // la pastille de travail en attente reste celle de la Revue : une image
  // validee n'attend rien de personne
  dire((await page.$$('.tabs button[data-s="galerie"] .n')).length === 0,
       'aucun compteur sur Galerie — la pastille est celle de Revue');

  console.log('\n[2] elle allume le metier « galerie » sur le dossier des validees');
  await page.click('.tabs button[data-s="galerie"]');
  await page.waitForTimeout(1300);
  dire(await vu('#trier'), 'l\'ecran de consultation est a l\'ecran');
  dire((await metier()) === 'galerie', `data-metier = ${await metier()}`);
  dire(await page.evaluate(() => location.hash) === '#galerie', 'hash partageable #galerie');
  const bucket = await page.$eval('#bucketSel button.on', b => b.dataset.b);
  dire(bucket === 'OK', `dossier d'entree : ${bucket}`);
  dire(!(await vu('#bucketSel')),
       'le selecteur de dossier est absent : l\'onglet dit deja lequel');
  const espace = await page.$eval('#spaceSel button.on', b => b.dataset.sp);
  dire(espace === 'sfw', `espace ${espace} — un onglet n'entre jamais seul en NSFW (J7)`);
  const nGal = await tuiles();
  console.log(`      ${nGal} image(s) validee(s) dans la galerie de lena`);

  console.log('\n[3] aucun geste de tri, en grille comme en plein cadre');
  const triGrille = await page.$$eval('#triageBody .tacts button[data-a]', e => e.length);
  dire(triGrille === 0, `${triGrille} bouton de tri sous les vignettes`);
  if (nGal){
    dire((await page.$$('#triageBody .tacts button[data-e]')).length === nGal,
         'chaque vignette propose Éditer');
    const dl = await page.$$eval('#triageBody .tacts a.dl',
      e => e.map(a => ({ dl: a.hasAttribute('download'), href: a.getAttribute('href') })));
    dire(dl.length === nGal && dl.every(a => a.dl),
         `et un telechargement, en <a download> (${dl.length})`);
    dire(dl.every(a => /^\/img\?/.test(a.href) && /character=/.test(a.href)),
         `qui pointe sur /img, porteur du personnage : ${(dl[0] || {}).href || '—'}`);

    console.log('\n[3b] plein cadre : Télécharger, Éditer, Instagram inerte');
    await page.click('#viewSel button[data-v="revue"]');
    await page.waitForTimeout(700);
    const actes = await page.$$eval('.acts button[data-a]', e => e.map(b => b.dataset.a));
    dire(!actes.some(a => ['valider', 'rejeter', 'archiver', 'revoir'].includes(a)),
         `aucune action de tri : ${actes.join(', ') || '(aucune)'}`);
    const nVXA = await page.$$eval('.acts .btn',
      e => e.filter(b => /Valider|Rejeter|Archiver|À revoir/.test(b.textContent)).length);
    dire(nVXA === 0, 'aucun bouton Valider / Rejeter / Archiver');
    dire(await vu('#btnOuvrirEditeur'), 'le bouton Éditer est la');
    dire(await page.$eval('.acts a.dl',
      a => a.hasAttribute('download') && /Télécharger/.test(a.textContent)),
      'et un lien Télécharger');
    dire(await vu('#btnInsta'), 'le bouton Instagram est propose');
    dire(await page.$eval('#btnInsta', b => b.disabled), 'il est INERTE');
    const ti = (await page.getAttribute('#btnInsta', 'title')) + ' '
             + (await page.textContent('#btnInsta'));
    dire(/pas encore branch/.test(ti), `et il dit pourquoi : « ${ti.trim().slice(0, 60)} »`);

    console.log('\n[4] le clavier ne trie pas non plus');
    const avant = await page.$eval('#triageBody .meta dd', d => d.textContent.trim());
    const nAvant = await page.textContent('#bOK');
    await page.keyboard.press('x');            // Rejeter, en Revue
    await page.keyboard.press('a');            // Archiver
    await page.waitForTimeout(900);
    dire((await page.$eval('#triageBody .meta dd', d => d.textContent.trim())) === avant,
         `l'image affichee n'a pas bouge (« ${avant} »)`);
    dire((await page.textContent('#bOK')) === nAvant,
         `le compteur des validees non plus (${nAvant})`);

    console.log('\n[5] #galerie/<nom> vise une image par son nom');
    const noms = await page.evaluate(async () => {
      const u = '/api/gallery?bucket=OK&space=sfw&character='
        + encodeURIComponent(new URLSearchParams(location.search).get('character'));
      const r = await (await fetch(u)).json();
      return (r.items || []).map(i => i.name);
    });
    const rang = Math.min(2, noms.length - 1);
    const cible = noms[rang];
    await page.evaluate(n => { location.hash = 'galerie/' + encodeURIComponent(n); }, cible);
    await page.waitForTimeout(1300);
    dire((await metier()) === 'galerie', 'le metier reste galerie');
    dire(await vu('#trier'), 'l\'ecran est bien celui de la consultation');
    const curDansGrille = await page.$$eval('#triageBody .tile.cur',
      e => e.map(x => +x.dataset.k)[0]);
    dire(curDansGrille === rang,
         `le curseur est sur l'item ${curDansGrille} (« ${cible} », rang ${rang})`);
    dire(!(await vu('.empty.avis')), 'aucun avis d\'introuvable pour un nom present');
  } else {
    console.log('  IGNORE — aucune image validee pour lena : [3b] a [5] sautes');
  }

  console.log('\n[6] un nom inconnu se DIT, il ne montre pas une autre image');
  await page.evaluate(() => { location.hash = 'galerie/pas_une_image_de_ce_personnage.png'; });
  await page.waitForTimeout(1300);
  dire(await vu('.empty.avis'), 'un avis explique que le nom n\'est pas dans ce dossier');
  const avis = ((await page.textContent('.empty.avis')) || '').replace(/\s+/g, ' ').trim();
  dire(/pas_une_image_de_ce_personnage\.png/.test(avis), 'il NOMME le fichier demande');
  dire(/autre personnage|trié ailleurs|supprimé/.test(avis),
       `et dit ce qui a pu se passer : « ${avis.slice(0, 110)}… »`);
  dire((await tuiles()) === nGal,
       `la grille du dossier reste affichee dessous (${nGal} vignette(s))`);

  /* [6b] ISOLATION. Un nom qui existe VRAIMENT, mais dans l'arbre d'un autre
     personnage. C'est le cas dangereux : le lien est plausible, le fichier est
     sur le disque, et rien n'empeche de le partager entre deux studios ouverts.
     Il doit rester introuvable ici — /api/gallery ne rend que le personnage
     charge, et le focus ne cherche que dans ce qu'il a rendu. */
  console.log('\n[6b] un nom d\'un AUTRE personnage reste introuvable (isolation)');
  const autres = fs.existsSync(OK_AUTRE)
    ? fs.readdirSync(OK_AUTRE).filter(n => /\.(png|jpg|jpeg)$/i.test(n)) : [];
  if (!autres.length){
    console.log('      IGNORE — aucune image validee chez abyssiaelle sur cette machine');
  } else {
    const volee = autres[0];
    await page.evaluate(n => { location.hash = 'galerie/' + encodeURIComponent(n); }, volee);
    await page.waitForTimeout(1300);
    dire(await vu('.empty.avis'), `« ${volee} » : l'avis d'introuvable est la`);
    const titres = await page.$$eval('#triageBody .tile .m b', e => e.map(x => x.textContent));
    dire(!titres.includes(volee), 'et aucune vignette ne porte ce nom');
    dire((await page.$$('#triageBody .tile.cur')).length <= 1
         && !(await page.$$eval('#triageBody .tile.cur .m b',
                                e => e.map(x => x.textContent))).includes(volee),
         'le curseur n\'a pas ete pose sur une image de remplacement');
  }

  console.log('\n[7] Revue, elle, garde ses gestes');
  await page.click('.tabs button[data-s="trier"]');
  await page.waitForTimeout(1300);
  dire((await metier()) === 'revue', `data-metier = ${await metier()}`);
  dire(await page.evaluate(() => location.hash) === '#trier', 'hash #trier');
  dire(await vu('#bucketSel'), 'son selecteur de dossier est la');
  dire(!(await page.isVisible('#bucketSel button[data-b="OK"]')),
       'sans « Validées » : elles ont leur destination, la Galerie');
  const bRevue = await page.$eval('#bucketSel button.on', b => b.dataset.b);
  dire(bRevue === 'A_REVOIR', `elle ouvre sur la file a juger : ${bRevue}`);
  const nRevue = await tuiles();
  if (nRevue){
    const triRevue = await page.$$eval('#triageBody .tacts button[data-a]', e => e.length);
    dire(triRevue > 0, `${triRevue} gestes de tri sous les vignettes`);
  } else {
    console.log('      (file vide : gestes de tri non observables ici)');
  }

  console.log('\n[8] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
