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

/* Les crochets du DOM ont change de forme avec la migration Tailwind : une
   classe utilitaire n'est plus un nom d'etat. `.tile` -> [data-tile], `.cur` ->
   [data-cur], `.tacts` -> [data-tacts], `.thumb` -> [data-thumb], `.acts` ->
   [data-acts], `a.dl` -> a[data-dl], `.avis` -> [data-avis], `.triage` -> [data-triage]. */

/* GARDE DE DESTRUCTION. Cette fumigation touche des DONNEES REELLES : elle ne
   doit jamais supprimer une image qu'elle n'a pas creee elle-meme. Le filet
   n'est pas une relecture de code — il intercepte les requetes : tout
   /api/delete dont le nom n'est pas dans `jetables` fait ECHOUER le test,
   immediatement et bruyamment, au lieu de passer inapercu derriere un compteur
   qui retombe juste.

   Ecrit apres un incident du 30/08/2026 : une image de production a disparu
   pendant une campagne de fumigations sans qu'aucune assertion ne le voie. */
const jetables = new Set();
const volsDeDonnees = [];
/* Cette fumigation ne cree aucun fichier : `jetables` reste VIDE, donc toute
   suppression, quelle qu'elle soit, la fait echouer. Sa confirmation de
   suppression est ouverte puis systematiquement annulee. */


(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1600, height: 1000 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
  page.on('request', r => {
    if (r.method() !== 'POST' || !r.url().includes('/api/delete')) return;
    const nom = (r.postDataJSON() || {}).name;
    if (!jetables.has(nom)) volsDeDonnees.push(nom);
  });

  let mesures = 0;
  page.on('request', r => { if (r.url().includes('/api/mesurer')) mesures++; });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const vu = s => page.isVisible(s).catch(() => false);
  const texte = s => page.textContent(s).catch(() => '');
  const tuiles = () => page.$$eval('[data-tile]', e => e.length);
  const compteurs = () => page.evaluate(async () =>
    (await (await fetch('/api/state?character=lena')).json()).counts);

  console.log('\n[0] etat de depart des dossiers');
  await page.goto(BASE + '/gallery?character=lena', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-tile]');
  const depart = await compteurs();
  console.log(`      ${JSON.stringify(depart)}`);

  console.log('\n[1] GALERIE : consulter, jamais trier');
  dire(await page.evaluate(() => location.pathname) === '/gallery', 'chemin /gallery');
  dire(await page.$eval('#trier', e => e.dataset.metier) === 'galerie',
       'le metier est marque sur l ecran');
  dire(!(await vu('#bucketSel')),
       "pas de selecteur de dossier : son dossier est dit par son onglet");
  dire(!(await vu('#btnUndo')), "pas d'annulation : rien n'y est trie");
  const gestesG = await page.$$eval('[data-tile]:first-child [data-tacts] [data-a]', e => e.length);
  dire(gestesG === 0, `aucun bouton de tri sous une vignette (${gestesG})`);
  dire(await vu('[data-tile]:first-child [data-tacts] a[data-dl]'), 'un telechargement, lui, est propose');
  dire(await vu('[data-tile]:first-child [data-tacts] [data-e]'), "et l'edition");
  const dl = await page.getAttribute('[data-tile]:first-child [data-tacts] a[data-dl]', 'href');
  dire(dl.startsWith('/img?') && dl.includes('character=lena'),
       'le telechargement est un <a download> sur /img, borne au personnage');

  console.log('\n[2] PIEGE §5.6-1 : le jeton `v` est sur TOUTES les URL d image');
  const srcs = await page.$$eval('[data-tile] img', e => e.map(x => x.getAttribute('src')));
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
  const vise = await page.$eval('[data-tile][data-cur]', e => e.dataset.k);
  dire(vise === '1', `le curseur avance et se VOIT (tuile ${vise})`);
  dire((await page.getAttribute('[data-tile][data-cur]', 'aria-current')) === 'true',
       'et l annonce (aria-current), pas seulement une bordure de couleur');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  dire(await vu('[data-triage]'), 'Entree ouvre la vue plein cadre');
  dire(await vu('#btnInsta'), "et la Galerie y propose son geste de destination");
  dire(await page.isDisabled('#btnInsta'), 'inerte — la destination n existe pas encore dans le code');
  dire((await texte('#btnInsta')).includes('pas encore branché'), 'et il DIT pourquoi');
  const triG = await page.$$eval('[data-acts] [data-a]', e => e.map(x => x.dataset.a));
  dire(!triG.some(a => ['valider','rejeter','archiver','revoir'].includes(a)),
       `aucun geste de tri en plein cadre non plus (${triG.join(',')})`);

  console.log('\n[4bis] a11y : les jugements de realisme exposent leur etat (aria-pressed)');
  dire((await page.getAttribute('[data-f="ok"]', 'aria-pressed')) === 'false',
       'relache au depart (aucun jugement encore pose)');
  await page.click('[data-f="ok"]');
  await page.waitForTimeout(300);
  dire((await page.getAttribute('[data-f="ok"]', 'aria-pressed')) === 'true',
       'enfonce apres un clic, pas seulement une couleur');
  dire((await page.getAttribute('[data-f="ia"]', 'aria-pressed')) === 'false',
       "l'autre jugement reste relache");
  // REVERT : un second clic retire le jugement (« clicking again removes it »,
  // useSortActions.tsx) — cette fumigation touche une image reelle de la
  // Galerie, elle ne doit rien y laisser de change.
  await page.click('[data-f="ok"]');
  await page.waitForTimeout(300);
  dire((await page.getAttribute('[data-f="ok"]', 'aria-pressed')) === 'false',
       'et le second clic le retire : rien de laisse sur une image reelle');

  console.log('\n[4ter] filmstrip (design-pass ecran 5, §A) : role, clic, et UN SEUL pas au clavier');
  dire((await page.getAttribute('#filmstrip', 'role')) === 'listbox', '#filmstrip est un role=listbox');
  const optionsAvant = await page.$$eval('#filmstrip [role="option"]', e => e.length);
  dire(optionsAvant === avantClavier, `autant d options que de vignettes de la grille (${optionsAvant})`);
  dire((await page.getAttribute('#filmstrip [role="option"]:nth-child(2)', 'aria-selected')) === 'true',
       "l'option courante suit le curseur (tuile 1, deja avance par la fleche de [4])");

  const srcAvant = await page.getAttribute('#stageImg', 'src');
  await page.click('#filmstrip [role="option"]:nth-child(4)');
  await page.waitForTimeout(300);
  const srcApresClic = await page.getAttribute('#stageImg', 'src');
  dire(srcApresClic !== srcAvant, 'un clic sur une vignette du filmstrip change bien l image plein cadre');
  dire((await page.getAttribute('#filmstrip [role="option"]:nth-child(4)', 'aria-selected')) === 'true',
       'et la vignette cliquee devient l option selectionnee');

  await page.focus('#filmstrip [role="option"][aria-selected="true"]');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  const selectionnees = await page.$$eval('#filmstrip [role="option"]',
    e => e.map((x, i) => [i, x.getAttribute('aria-selected')]).filter(([, s]) => s === 'true'));
  dire(selectionnees.length === 1 && selectionnees[0][0] === 4,
       `UNE fleche = UN pas, jamais deux (useReviewKeys.ts et le filmstrip ne se marchent pas dessus) : ${JSON.stringify(selectionnees)}`);

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

  console.log('\n[6bis] a11y (design-pass ecran 5) : quatre groupes en roving radiogroup');
  for (const [id, actif] of [['spaceSel', 'sfw'], ['bucketSel', 'A_REVOIR'],
                              ['scoreSel', 'tout'], ['viewSel', 'grille']]) {
    dire((await page.getAttribute(`#${id}`, 'role')) === 'radiogroup', `#${id} est un radiogroup`);
    const etats = await page.$$eval(`#${id} button`, (els, actif) => els.map(e => ({
      role: e.getAttribute('role'),
      checked: e.getAttribute('aria-checked'),
      on: e.classList.contains('on'),
    })), actif);
    dire(etats.every(e => e.role === 'radio'), `#${id} : chaque bouton est role=radio`);
    dire(etats.every(e => (e.checked === 'true') === e.on),
         `#${id} : aria-checked suit exactement la classe 'on' (${JSON.stringify(etats)})`);
    dire(etats.filter(e => e.checked === 'true').length === 1, `#${id} : un seul actif`);
  }
  dire((await page.getAttribute('#scoreSel button[data-f="tout"]', 'aria-label'))
         ?.includes('toutes les images'),
       '#scoreSel : le seuil exact est aussi en aria-label, pas seulement en title');

  console.log('\n[7] TRI + ANNULATION, pour de vrai');
  if (!depart.REJET){
    console.log('      (dossier REJET vide : aller-retour de tri non observable)');
  } else {
    await page.click('#bucketSel [data-b="REJET"]');
    await page.waitForSelector('[data-tile]');
    await page.waitForTimeout(400);
    const nom = await page.$eval('[data-tile]:first-child [data-thumb] img',
      e => new URL(e.src, location.origin).searchParams.get('name'));
    const gestes = await page.$$eval('[data-tile]:first-child [data-tacts] [data-a]', e => e.map(x => x.dataset.a));
    dire(gestes.includes('valider'), `les gestes de tri sont la (${gestes.join(',')})`);
    await page.click('[data-tile]:first-child [data-tacts] [data-a="valider"]');
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

  console.log('\n[7bis] SELECTION MULTIPLE + ACTIONS GROUPEES (design pass ecran 5, §D)');
  await page.goto(BASE + '/gallery?character=lena', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-tile]');
  const avantSelection = await compteurs();

  const noms = await page.$$eval('[data-tile]', els => els.slice(0, 3).map(e => {
    const src = e.querySelector('[data-thumb] img').getAttribute('src');
    return decodeURIComponent(new URL(src, location.origin).searchParams.get('name'));
  }));
  const cases = await page.$$('[data-select]');
  dire(!(await vu('#bulkBar')), 'pas de barre groupee tant que rien n est coche');

  await cases[0].click();
  await page.waitForTimeout(200);
  await page.keyboard.down('Shift');
  await cases[2].click();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  const cocheesApresPlage = await page.$$eval('[data-select]', e => e.slice(0, 3).map(x => x.checked));
  dire(cocheesApresPlage.join(',') === 'true,true,true',
       `Maj-clic etend la plage (ancre -> celle-ci), jamais un retrait (${cocheesApresPlage.join(',')})`);
  dire(await vu('#bulkBar'), 'la barre groupee apparait des le premier coche');
  dire(!(await vu('#scoreSel')), 'et remplace la ligne de filtres, pas s y ajouter');
  dire((await texte('#bulkBar')).includes('3 sélectionnées'), 'elle dit combien');

  console.log('\n[7ter] Echap vide la selection et rend le focus a la grille');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  dire(!(await vu('#bulkBar')), 'la barre disparait');
  const coucheesApresEchap = await page.$$eval('[data-select]', e => e.some(x => x.checked));
  dire(!coucheesApresEchap, 'plus rien de coche');
  const focusTag = await page.evaluate(() => document.activeElement.tagName);
  dire(focusTag !== 'INPUT', 'le focus a quitte la case (rendu a la grille), pas laisse dans le vide');

  console.log('\n[7quater] actMany : UN SEUL toast recapitulatif, et un aller-retour reel VERIFIE puis restaure');
  await cases[0].click();
  await page.waitForTimeout(150);
  await cases[1].click();
  await page.waitForTimeout(150);
  await page.click('#bulkBar [data-a="archiver"]');
  await page.waitForTimeout(900);
  dire((await texte('#toast')) === '2/2 archivées', `un seul toast recapitulatif ("${await texte('#toast')}")`);
  const apresArchivage = await compteurs();
  dire(apresArchivage.ARCHIVE === avantSelection.ARCHIVE + 2 && apresArchivage.OK === avantSelection.OK - 2,
       `les DEUX images ont bouge en un seul geste (OK ${avantSelection.OK}->${apresArchivage.OK}, ARCHIVE ${avantSelection.ARCHIVE}->${apresArchivage.ARCHIVE})`);
  dire(!(await vu('#bulkBar')), 'la selection est videe apres le geste');

  // RESTAURATION : actMany n'a pas d'annulation groupee (/api/undo ne defait
  // qu'UNE action) — cette fumigation ne doit rien laisser bouge sur les
  // donnees reelles, donc restauration manuelle des DEUX images, verifiee.
  await page.goto(BASE + '/review?character=lena', { waitUntil: 'networkidle' });
  await page.click('#bucketSel [data-b="ARCHIVE"]');
  await page.waitForTimeout(500);
  for (const nom of noms.slice(0, 2)) {
    const tuile = page.locator(`[data-tile]:has([data-thumb] img[src*="${encodeURIComponent(nom)}"])`).first();
    await tuile.locator('[data-tacts] [data-a="valider"]').click();
    await page.waitForTimeout(500);
  }
  const apresRestauration = await compteurs();
  dire(JSON.stringify(apresRestauration) === JSON.stringify(avantSelection),
       `les deux images restaurees, rien de reste change (${JSON.stringify(apresRestauration)})`);

  // section [8] continue dans Revue, dossier REJET — meme etat qu a la fin de [7]
  await page.click('#bucketSel [data-b="REJET"]');
  await page.waitForSelector('[data-tile]');
  await page.waitForTimeout(400);

  console.log('\n[8] la suppression definitive confirme, et n a AUCUN raccourci');
  const nTuiles = await tuiles();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(400);
  dire(!(await vu('dialog[open]')), 'aucune touche ne declenche la suppression');
  dire(await tuiles() === nTuiles, 'et rien n a disparu');
  if (nTuiles){
    await page.click('[data-tile]:first-child [data-tacts] [data-suppr]');
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
  dire(await vu('.empty[data-avis]'), 'un bandeau annonce que le nom est introuvable');
  const avis = await texte('.empty[data-avis]');
  dire(avis.includes('_inexistante_.png'), 'il NOMME le fichier demande');
  dire(avis.includes('autre personnage'), 'et rappelle que la vue ne montre qu un seul arbre');
  await page.click('#btnAvisFermer');
  await page.waitForTimeout(300);
  dire(!(await vu('.empty[data-avis]')), 'il se ferme');

  console.log('\n[11] un nom REEL ouvre bien sur cette image');
  await page.goto(BASE + '/gallery?character=lena', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-tile]');
  const cible = await page.$eval('[data-tile]:nth-child(3) [data-thumb] img',
    e => new URL(e.src, location.origin).searchParams.get('name'));
  await page.goto(BASE + `/gallery/${encodeURIComponent(cible)}?character=lena`,
                  { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  dire(!(await vu('.empty[data-avis]')), 'aucun avis : le nom existe');
  const vue = await page.$eval('[data-tile][data-cur] [data-thumb] img',
    e => new URL(e.src, location.origin).searchParams.get('name'));
  dire(vue === cible, `la vignette visee est bien la sienne (${cible})`);

  console.log('\n[12] l espace SFW/NSFW est un axe a part du personnage');
  await page.click('#spaceSel [data-sp="nsfw"]');
  await page.waitForTimeout(1200);
  const srcsN = await page.$$eval('[data-tile] img', e => e.map(x => x.getAttribute('src')));
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

  console.log('\n' + '[garde] aucune image reelle supprimee');
  dire(volsDeDonnees.length === 0,
       volsDeDonnees.length
         ? 'SUPPRESSION NON PREVUE : ' + volsDeDonnees.join(', ')
         : 'aucun /api/delete hors des fichiers crees par le test');

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
