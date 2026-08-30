/* Browser smoke test of the REACT Revue and Galerie — the second screen the
   legacy chrome switched by attribute, now two routes.

   Replaces test_galerie.js, and covers what no legacy test did: the two coupling
   traps of AUDIT §5.6 that live here.

   WHAT THIS TEST HOLDS:

     1. TWO DESTINATIONS, TWO ROUTES. /review judges the queue, /gallery
        consults the kept ones. Same grid, same loader — different offer.
     2. NO SORTING GESTURE IN THE GALERIE, and it is not a greying out: the
        buttons DO NOT EXIST, and the V/X/A/D/U shortcuts do nothing there.
        Hiding the buttons and letting the keyboard sort would be the worst of
        both halves.
     3. TRAP §5.6-1 — the `v` token (mtime) on every image URL, alongside
        `?character=`. Consumed verbatim, never reinterpreted: without it the
        browser keeps serving the image from before an overwrite.
     4. TRAP §5.6-4 — /api/mesurer in batches: the client keeps calling while
        `restant > 0`. Checked by counting the requests, not by reading the code.
     5. SORT + UNDO, for real: an image is restored from REJET, the move is
        verified server-side, then UNDONE and verified back. Nothing is left
        moved — counts are checked at the end.
     6. Permanent deletion has NO keyboard shortcut and always confirms. The
        confirmation is opened and ALWAYS cancelled.
     7. /review/<nom> aims at an image; a name absent from the folder is SAID,
        and never replaced by another image.

   PREREQUISITES: see test_journal.js — run_browser_tests.py does all of it. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1600, height: 1000 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
  let mesures = 0;
  page.on('request', r => { if (r.url().includes('/api/mesurer')) mesures++; });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const vu = s => page.isVisible(s).catch(() => false);
  const texte = s => page.textContent(s).catch(() => '');
  const tuiles = () => page.$$eval('.tile', e => e.length);
  const compteurs = () => page.evaluate(async () =>
    (await (await fetch('/api/state?character=lena')).json()).counts);

  console.log('\n[0] etat de depart des dossiers');
  await page.goto(BASE + '/gallery?character=lena', { waitUntil: 'networkidle' });
  await page.waitForSelector('.tile');
  const depart = await compteurs();
  console.log(`      ${JSON.stringify(depart)}`);

  console.log('\n[1] GALERIE : consulter, jamais trier');
  dire(await page.evaluate(() => location.pathname) === '/gallery', 'chemin /gallery');
  dire(await page.$eval('#trier', e => e.dataset.metier) === 'galerie',
       'le metier est marque sur l ecran');
  dire(!(await vu('#bucketSel')),
       "pas de selecteur de dossier : son dossier est dit par son onglet");
  dire(!(await vu('#btnUndo')), "pas d'annulation : rien n'y est trie");
  const gestesG = await page.$$eval('.tile:first-child .tacts [data-a]', e => e.length);
  dire(gestesG === 0, `aucun bouton de tri sous une vignette (${gestesG})`);
  dire(await vu('.tile:first-child .tacts a.dl'), 'un telechargement, lui, est propose');
  dire(await vu('.tile:first-child .tacts [data-e]'), "et l'edition");
  const dl = await page.getAttribute('.tile:first-child .tacts a.dl', 'href');
  dire(dl.startsWith('/img?') && dl.includes('character=lena'),
       'le telechargement est un <a download> sur /img, borne au personnage');

  console.log('\n[2] PIEGE §5.6-1 : le jeton `v` est sur TOUTES les URL d image');
  const srcs = await page.$$eval('.tile img', e => e.map(x => x.getAttribute('src')));
  dire(srcs.every(s => s.includes('character=lena')),
       `${srcs.length} vignette(s), toutes bornees au personnage`);
  const avecV = srcs.filter(s => /[?&]v=\d+/.test(s));
  dire(avecV.length === srcs.length,
       `toutes portent v=<mtime> en secondes entieres (${avecV.length}/${srcs.length})`);
  dire(srcs.every(s => s.includes('thumb=1')), 'la grille demande bien des vignettes');
  // le jeton vient du serveur et n'est pas reinterprete : meme valeur des deux cotes
  const vServeur = await page.evaluate(async () => {
    const d = await (await fetch('/api/gallery?bucket=OK&space=sfw&character=lena')).json();
    return d.items.slice(0, 5).map(i => String(i.v));
  });
  const vEcran = srcs.slice(0, 5).map(s => s.match(/[?&]v=(\d+)/)[1]);
  dire(JSON.stringify(vServeur) === JSON.stringify(vEcran),
       `consomme tel quel, jamais recalcule (${vEcran.join(',')})`);

  console.log('\n[3] les raccourcis de tri N EXISTENT PAS en Galerie');
  const avantClavier = await tuiles();
  for (const k of ['v', 'x', 'a', 'd', 'u']) await page.keyboard.press(k);
  await page.waitForTimeout(600);
  dire(await tuiles() === avantClavier,
       `${avantClavier} vignettes avant et apres V/X/A/D/U — rien n'a bouge`);
  const apresClavier = await compteurs();
  dire(JSON.stringify(apresClavier) === JSON.stringify(depart),
       'et les compteurs de dossier non plus');

  console.log('\n[4] les fleches et Entree, eux, marchent : ce sont des gestes de LECTURE');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const vise = await page.$eval('.tile.cur', e => e.dataset.k);
  dire(vise === '1', `le curseur avance et se VOIT (tuile ${vise})`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  dire(await vu('.triage'), 'Entree ouvre la vue plein cadre');
  dire(await vu('#btnInsta'), "et la Galerie y propose son geste de destination");
  dire(await page.isDisabled('#btnInsta'), 'inerte — la destination n existe pas encore dans le code');
  dire((await texte('#btnInsta')).includes('pas encore branché'), 'et il DIT pourquoi');
  const triG = await page.$$eval('.acts [data-a]', e => e.map(x => x.dataset.a));
  dire(!triG.some(a => ['valider','rejeter','archiver','revoir'].includes(a)),
       `aucun geste de tri en plein cadre non plus (${triG.join(',')})`);

  console.log('\n[5] la loupe s ouvre et se ferme a Echap');
  await page.click('#stageImg');
  await page.waitForTimeout(300);
  dire(await vu('#lightbox img'), 'la loupe est ouverte');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  dire(!(await vu('#lightbox img')), 'Echap la referme');

  console.log('\n[6] REVUE : l autre destination, les gestes de tri reviennent');
  await page.goto(BASE + '/review?character=lena', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  dire(await page.$eval('#trier', e => e.dataset.metier) === 'revue', 'le metier a change');
  dire(await vu('#bucketSel'), 'son selecteur de dossier est la');
  dire(!(await vu('#bucketSel [data-b="OK"]')),
       "sans « Validées » : elles ont leur destination, la Galerie");
  const ouvert = await page.$eval('#bucketSel button.on', e => e.dataset.b);
  dire(ouvert === 'A_REVOIR', `elle ouvre sur la file a juger (${ouvert})`);
  dire(await vu('#btnUndo'), "l'annulation y est proposee");

  console.log('\n[7] TRI + ANNULATION, pour de vrai');
  if (!depart.REJET){
    console.log('      (dossier REJET vide : aller-retour de tri non observable)');
  } else {
    await page.click('#bucketSel [data-b="REJET"]');
    await page.waitForSelector('.tile');
    await page.waitForTimeout(400);
    const nom = await page.$eval('.tile:first-child .thumb img',
      e => new URL(e.src, location.origin).searchParams.get('name'));
    const gestes = await page.$$eval('.tile:first-child .tacts [data-a]', e => e.map(x => x.dataset.a));
    dire(gestes.includes('valider'), `les gestes de tri sont la (${gestes.join(',')})`);
    await page.click('.tile:first-child .tacts [data-a="valider"]');
    await page.waitForTimeout(1600);
    const apresTri = await compteurs();
    dire(apresTri.REJET === depart.REJET - 1 && apresTri.OK === depart.OK + 1,
         `${nom} a bouge : REJET ${depart.REJET}->${apresTri.REJET}, OK ${depart.OK}->${apresTri.OK}`);
    dire((await texte('#toast')).includes('validée'), "le toast dit ce qui s'est passe");

    await page.click('#btnUndo');
    await page.waitForTimeout(1600);
    const apresUndo = await compteurs();
    dire(JSON.stringify(apresUndo) === JSON.stringify(depart),
         `l'annulation remet tout en place (${JSON.stringify(apresUndo)})`);
  }

  console.log('\n[8] la suppression definitive confirme, et n a AUCUN raccourci');
  const nTuiles = await tuiles();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(400);
  dire(!(await vu('dialog[open]')), 'aucune touche ne declenche la suppression');
  dire(await tuiles() === nTuiles, 'et rien n a disparu');
  if (nTuiles){
    await page.click('.tile:first-child .tacts [data-suppr]');
    await page.waitForSelector('dialog[open]');
    const boite = await texte('dialog[open]');
    dire(boite.includes('Aucun retour possible'), 'la confirmation dit qu il n y a pas de retour');
    dire(boite.includes('journal garde la trace'), 'et ce qui subsiste malgre tout');
    await page.click('#cfNon');
    await page.waitForTimeout(300);
    dire(await tuiles() === nTuiles, 'annulee : rien n a ete supprime');
  }

  console.log('\n[9] PIEGE §5.6-4 : /api/mesurer est rappele tant qu il reste des images');
  /* La boucle n'est observable que s'il RESTE des mesures a faire — et la
     rattraper les fait disparaitre. On cherche donc un dossier qui en a du
     retard, quel que soit l'espace ; s'il n'y en a nulle part, on le dit au lieu
     de faire semblant. */
  const retard = await page.evaluate(async () => {
    for (const space of ['sfw', 'nsfw'])
      for (const bucket of ['A_REVOIR', 'REJET', 'OK', 'ARCHIVE', 'SANS_VISAGE']){
        const d = await (await fetch(
          `/api/gallery?bucket=${bucket}&space=${space}&character=lena`)).json();
        if (d.sans_mesure > 0) return {bucket, space, n: d.sans_mesure};
      }
    return null;
  });
  if (!retard){
    console.log('      (tout est mesure partout : la boucle non observable)');
  } else {
    console.log(`      retard trouve : ${retard.n} image(s) dans ${retard.space}/${retard.bucket}`);
    // Le dossier OK n'est pas propose en Revue — les validees ont leur
    // destination. On va donc dans le metier qui OUVRE ce dossier.
    if (retard.bucket === 'OK'){
      await page.goto(BASE + '/gallery?character=lena', { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
    }
    await page.click(`#spaceSel [data-sp="${retard.space}"]`);
    await page.waitForTimeout(700);
    if (await vu(`#bucketSel [data-b="${retard.bucket}"]`)){
      await page.click(`#bucketSel [data-b="${retard.bucket}"]`);
      await page.waitForTimeout(900);
    }
    dire(await vu('#btnMesurer'), 'le bouton « Mesurer » apparait quand il reste du retard');
    const lib = await texte('#btnMesurer');
    const annonce = lib.match(/\((\d+)\)/);
    dire(Boolean(annonce), `le bouton annonce le reste a faire : « ${lib} »`);
    const reste = annonce ? parseInt(annonce[1], 10) : retard.n;
    mesures = 0;
    await page.click('#btnMesurer');
    await page.waitForFunction(() => {
      const b = document.querySelector('#btnMesurer');
      return !b || !b.disabled;
    }, null, { timeout: 180000 });
    await page.waitForTimeout(800);
    const attendu = Math.ceil(reste / 20);
    dire(mesures >= Math.min(attendu, 1) && mesures <= 40,
         `${mesures} requete(s) pour ${reste} image(s) par paquets de 20 (attendu ~${attendu})`);
    dire(!(await vu('#btnMesurer')), 'le bouton disparait quand tout est mesure');
    // retour a la Revue en espace SFW pour la suite du parcours
    await page.goto(BASE + '/review?character=lena', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
  }

  console.log('\n[10] viser une image par son nom, et le dire quand elle n y est pas');
  await page.goto(BASE + '/review/_inexistante_.png?character=lena', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  dire(await vu('.empty.avis'), 'un bandeau annonce que le nom est introuvable');
  const avis = await texte('.empty.avis');
  dire(avis.includes('_inexistante_.png'), 'il NOMME le fichier demande');
  dire(avis.includes('autre personnage'), 'et rappelle que la vue ne montre qu un seul arbre');
  await page.click('#btnAvisFermer');
  await page.waitForTimeout(300);
  dire(!(await vu('.empty.avis')), 'il se ferme');

  console.log('\n[11] un nom REEL ouvre bien sur cette image');
  await page.goto(BASE + '/gallery?character=lena', { waitUntil: 'networkidle' });
  await page.waitForSelector('.tile');
  const cible = await page.$eval('.tile:nth-child(3) .thumb img',
    e => new URL(e.src, location.origin).searchParams.get('name'));
  await page.goto(BASE + `/gallery/${encodeURIComponent(cible)}?character=lena`,
                  { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  dire(!(await vu('.empty.avis')), 'aucun avis : le nom existe');
  const vue = await page.$eval('.tile.cur .thumb img',
    e => new URL(e.src, location.origin).searchParams.get('name'));
  dire(vue === cible, `la vignette visee est bien la sienne (${cible})`);

  console.log('\n[12] l espace SFW/NSFW est un axe a part du personnage');
  await page.click('#spaceSel [data-sp="nsfw"]');
  await page.waitForTimeout(1200);
  const srcsN = await page.$$eval('.tile img', e => e.map(x => x.getAttribute('src')));
  if (srcsN.length){
    dire(srcsN.every(s => s.includes('space=nsfw') && s.includes('character=lena')),
         `les octets viennent de l'espace NSFW DU personnage (${srcsN.length} vignette(s))`);
  } else {
    console.log('      (espace NSFW vide dans ce dossier)');
  }
  await page.click('#spaceSel [data-sp="sfw"]');
  await page.waitForTimeout(800);

  console.log('\n[13] etat des dossiers a la fin — rien ne doit avoir bouge');
  const fin = await compteurs();
  dire(JSON.stringify(fin) === JSON.stringify(depart),
       `${JSON.stringify(fin)}`);

  console.log('\n[14] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
