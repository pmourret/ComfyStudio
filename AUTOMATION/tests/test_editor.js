/* Browser smoke test of the REACT photo editor.

   Replaces the editor half of test_application_suppression_editeur.js.

   WHAT THIS TEST HOLDS:

     1. THE CROP OPENS OFF (F3.1). The frame carries a 2000 px veil: on by
        default it darkened the image on entry, for a gesture one does not make
        on every retouch. « Recadrer » turns it on; « annuler le recadrage »
        turns it back off AND returns to the free ratio — leaving « 1:1 » lit on
        a crop that is off would announce a constraint that no longer applies.
     2. Picking a FORMAT is itself a crop gesture: it turns the frame on.
     3. The mirror is a SWITCH, and shows as pressed.
     4. Straightening without cropping SAYS what the save will do — the corners
        left empty by the tilt are trimmed. Nothing is said at a zero angle, nor
        when a frame is down: it is then the frame that decides.
     5. « Réinitialiser » gives the image back as it was OPENED, crop off
        included — not a frame put back in the centre.
     6. « Écraser la source » is second rank, confirmed, and states the three
        consequences. This test opens the confirmation and ALWAYS CANCELS: it
        never overwrites a real production image.
     7. SAVING A COPY works end to end — the copy appears in the folder, its
        name is `<nom>_edit`, the SOURCE IS INTACT — and the test then deletes
        the copy through the interface. Folder counts are checked back to their
        starting values.
     8. The editor holds the studio's keyboard shortcuts at bay: V/X/A under the
        veil sort nothing.

   IT WORKS ON ITS OWN IMAGE. The source is seeded as `_TEST_EDITEUR_temp.png`,
   a copy of a real output, and removed at the end — on disk AND in the database,
   where `/api/edit/save` writes a row that `/api/delete` deliberately keeps.
   Exercising a destructive gesture on real data and checking a counter
   afterwards is not a test, it is a hope: a counter that lands right does not
   say WHICH file moved.

   PREREQUISITES: see test_journal.js — run_browser_tests.py does all of it. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';
const RACINE = path.resolve(__dirname, '..', '..');
const OK_DIR = path.join(RACINE, 'PROD', 'LENA', 'OK');

/* IL TRAVAILLE SUR SA PROPRE IMAGE. Le prefixe `_TEST_` est celui que le
   nettoyeur de base accepte, et qu'aucune image de production ne porte : la
   fumigation amorce sa source, l'edite, et efface les deux faces derriere elle.
   Ouvrir l'editeur sur la premiere vignette venue reviendrait a exercer un
   geste destructeur sur des donnees reelles pour se rassurer ensuite avec un
   compteur — or un compteur qui retombe juste ne dit pas QUEL fichier a bouge. */
const PREFIXE = '_TEST_EDITEUR_temp';
const SOURCE = PREFIXE + '.png';

/* NETTOYER LES DEUX FACES, pas seulement le disque. `/api/edit/save` inscrit la
   copie en base ; `/api/delete` efface le fichier et GARDE la ligne — c'est une
   decision, pas un oubli (voir sa docstring). Sans ce nettoyage la fumigation
   laisse une ligne sans fichier, sans journal et sans mesure, et
   test_coherence_base [4] la signale — a raison — comme une ecriture parasite.

   L'interprete : n'importe lequel fait l'affaire (sqlite3 est standard, rien
   ici ne touche au GPU). run_browser_tests.py passe le sien par
   SOULGLADE_PYTHON ; en lancement manuel on retombe sur `python` du PATH. */
const PY = process.env.SOULGLADE_PYTHON || 'python';
const nettoyer = () => {
  try {
    for (const n of fs.readdirSync(OK_DIR))
      if (n.startsWith(PREFIXE)) fs.rmSync(path.join(OK_DIR, n), { force: true });
  } catch { /* dossier absent : rien a nettoyer */ }
  try {
    execFileSync(PY, [path.join('AUTOMATION', 'tests', 'nettoyer_artefacts_test.py'), PREFIXE],
                 { cwd: RACINE, stdio: 'pipe' });
  } catch (e) {
    console.log('  note  lignes de test non effacees en base (' + PY + ' : '
                + String(e.message).split(String.fromCharCode(10))[0].trim() + ')');
  }
};

/* GARDE DE DESTRUCTION. Cette fumigation touche des DONNEES REELLES : elle ne
   doit jamais supprimer une image qu'elle n'a pas creee elle-meme. Le filet
   n'est pas une relecture de code — il intercepte les requetes : tout
   /api/delete dont le nom n'est pas dans `jetables` fait ECHOUER le test,
   immediatement et bruyamment, au lieu de passer inapercu derriere un compteur
   qui retombe juste.

   Ecrit apres un incident du 30/08/2026 : une image de production a disparu
   pendant une campagne de fumigations sans qu'aucune assertion ne le voie. */
const jetables = new Set([SOURCE]);
const volsDeDonnees = [];


/* Amorce : une VRAIE sortie de production, recopiee sous le nom jetable — le
   canvas et les controles de ratio ont besoin d'une image reelle, pas d'un
   carre uni. Elle vit et meurt avec ce test. */
const modeles = (() => { try { return fs.readdirSync(OK_DIR)
    .filter(n => n.endsWith('.png') && !n.startsWith(PREFIXE)); } catch { return []; } })();
if (!modeles.length){
  console.log('  IGNORE — aucune image dans PROD/LENA/OK pour amorcer le test');
  process.exit(0);
}
nettoyer();
fs.copyFileSync(path.join(OK_DIR, modeles[0]), path.join(OK_DIR, SOURCE));
// filet : [11] supprime par l'interface (c'est ce qu'il teste) ; ceci rattrape
// un artefact laisse par un echec en cours de route, quoi qu'il arrive.
process.on('exit', nettoyer);

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


  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const vu = s => page.isVisible(s).catch(() => false);
  const compteurs = () => page.evaluate(async () =>
    (await (await fetch('/api/state?character=lena')).json()).counts);
  const noms = () => page.evaluate(async () =>
    (await (await fetch('/api/gallery?bucket=OK&space=sfw&character=lena')).json())
      .items.map(i => i.name));
  const cropOn = () => page.$eval('#edCropSec', e => e.dataset.on);
  /* Poser la valeur d'un <input> controle par React. Une affectation directe de
     `value` est IGNOREE : React remplace l'accesseur du prototype pour suivre la
     valeur lui-meme, et ne voit donc pas l'ecriture. On passe par le setter
     natif, comme le fait un vrai geste utilisateur. */
  const regler = (sel, valeur) => page.$eval(sel, (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, valeur);

  console.log('\n[0] amorce : le test travaille sur SA propre image');
  await page.goto(BASE + '/gallery?character=lena', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-tile]');
  const depart = await compteurs();
  const nomsAvant = await noms();
  dire(nomsAvant.includes(SOURCE), `l'image jetable est en Galerie : ${SOURCE}`);
  console.log(`      ${nomsAvant.length} image(s) validee(s), dont la jetable`);

  console.log('\n[1] l editeur s ouvre sur ELLE, pas sur la premiere venue');
  const kSource = await page.$$eval('[data-tile]', (tiles, nom) =>
    tiles.findIndex(t => (t.querySelector('img')?.src || '').includes(encodeURIComponent(nom))),
    SOURCE);
  dire(kSource >= 0, `elle est visible (tuile ${kSource})`);
  await page.click(`[data-tile][data-k="${kSource}"] [data-tacts] [data-e]`);
  await page.waitForSelector('#editorBox[open]');
  await page.waitForFunction(() => {
    const c = document.querySelector('#edCanvas');
    return c && c.width > 40;
  }, null, { timeout: 20000 });
  const source = await page.textContent('#edFichier');
  dire(source.length > 0, `il nomme le fichier ouvert : ${source}`);
  dire(await page.evaluate(() => document.body.classList.contains('editing')),
       "le studio se marque « en edition »");
  dire(!(await vu('#toolRail')), "le rail passe sous le voile : il n'a rien a y faire");

  console.log('\n[2] LE RECADRAGE S OUVRE ETEINT (F3.1)');
  dire(await cropOn() === '0', 'aucun cadre a l ouverture');
  dire(!(await vu('#edCropBox')), 'et donc aucun voile sur l image');
  dire(await vu('#edCropOn'), '« Recadrer » est le seul geste propose');
  dire(!(await vu('#edCropOff')), "et pas la sortie d'un recadrage qui n'existe pas");
  await page.click('#edCropOn');
  await page.waitForTimeout(300);
  dire(await cropOn() === '1', '« Recadrer » l allume');
  dire(await vu('#edCropBox'), 'le cadre apparait');
  const boite = await page.$eval('#edCropBox', e => {
    const r = e.getBoundingClientRect(); return {w: Math.round(r.width), h: Math.round(r.height)};
  });
  dire(boite.w > 40 && boite.h > 40, `il a une taille reelle (${boite.w}x${boite.h})`);
  // le cadre ne remplit PAS tout : sans marge il serait verrouille par le clamp
  const toile = await page.$eval('#edCanvas', e => {
    const r = e.getBoundingClientRect(); return {w: Math.round(r.width), h: Math.round(r.height)};
  });
  dire(boite.w < toile.w && boite.h < toile.h,
       `il laisse de quoi le saisir (${boite.w}x${boite.h} dans ${toile.w}x${toile.h})`);

  console.log('\n[3] les FORMATS ne sont proposes que le recadrage allume');
  // Recadrage ETEINT, l'ecran ne montre que le geste qui l'allume : les formats
  // et la sortie sont absents, pas grises — le recadrage n'est pas
  // indisponible, il n'est simplement pas en cours.
  dire(await vu('#edRatio button[data-r="1:1"]'), 'allume, les formats sont la');
  // a11y (design-pass ecran 5) : vrai radiogroup, additif a data-r/'on'
  dire((await page.getAttribute('#edRatio', 'role')) === 'radiogroup',
       '#edRatio est un role=radiogroup');
  dire((await page.getAttribute('#edRatio button[data-r="libre"]', 'role')) === 'radio',
       'chaque format est un role=radio');
  dire((await page.getAttribute('#edRatio button[data-r="libre"]', 'aria-checked')) === 'true',
       '« Libre », actif au premier affichage, porte aria-checked=true');
  dire((await page.getAttribute('#edRatio button[data-r="1:1"]', 'aria-checked')) === 'false',
       'les autres formats portent aria-checked=false');
  await page.click('#edRatio button[data-r="1:1"]');
  await page.waitForTimeout(350);
  dire((await page.getAttribute('#edRatio button[data-r="1:1"]', 'aria-checked')) === 'true',
       'aria-checked suit le clic, comme la classe \'on\'');
  const carre = await page.$eval('#edCropBox', e => {
    const r = e.getBoundingClientRect(); return Math.abs(r.width - r.height);
  });
  dire(carre < 3, `1:1 recentre un cadre carre (ecart ${carre.toFixed(1)} px)`);
  await page.click('#edRatio button[data-r="9:16"]');
  await page.waitForTimeout(350);
  const vertical = await page.$eval('#edCropBox', e => {
    const r = e.getBoundingClientRect(); return r.height / r.width;
  });
  dire(Math.abs(vertical - 16 / 9) < 0.05,
       `9:16 aussi (rapport ${vertical.toFixed(2)} pour ${(16 / 9).toFixed(2)})`);

  console.log('\n[4] eteindre le recadrage retire aussi la contrainte de format');
  await page.click('#edCropOff');
  await page.waitForTimeout(300);
  dire(await cropOn() === '0', 'le cadre est eteint');
  dire(!(await vu('#edRatio button[data-r="1:1"]')),
       'les formats disparaissent avec lui — rien n est grise');
  await page.click('#edCropOn');
  await page.waitForTimeout(300);
  const libre = await page.$eval('#edRatio button[data-r="libre"]', e => e.className);
  dire(libre.includes('on'),
       'et en le rallumant le ratio est revenu a « Libre » : plus de contrainte annoncee a tort');
  await page.click('#edCropOff');
  await page.waitForTimeout(250);

  console.log('\n[5] le miroir est un interrupteur');
  dire(await page.getAttribute('#edFlip', 'aria-pressed') === 'false', 'relache au depart');
  await page.click('#edFlip');
  await page.waitForTimeout(200);
  dire(await page.getAttribute('#edFlip', 'aria-pressed') === 'true', 'enfonce apres un clic');
  await page.click('#edFlip');
  await page.waitForTimeout(200);
  dire(await page.getAttribute('#edFlip', 'aria-pressed') === 'false', 'relache apres le second');

  console.log('\n[6] redresser sans recadrer DIT ce que la sauvegarde fera');
  dire(!(await vu('#edStraightenNote')), 'rien a dire a angle nul');
  await regler('#edStraighten', 6);
  await page.waitForTimeout(400);
  dire((await page.textContent('#v_edStraighten')).includes('6'), "l'angle s'affiche");
  dire(await vu('#edStraightenNote'),
       'la note apparait : les coins vides seront rognes');

  console.log('\n[7] « Réinitialiser » rend l etat D OUVERTURE');
  await page.click('#edCropOn');                 // un cadre, un format, un angle
  await page.waitForTimeout(250);
  await page.click('#edRatio button[data-r="4:5"]');
  await page.waitForTimeout(250);
  dire(await cropOn() === '1', 'on part d un etat charge : cadre 4:5 et angle pose');
  await page.click('#edReset');
  await page.waitForTimeout(400);
  dire(await cropOn() === '0', 'recadrage eteint, comme a l ouverture');
  dire((await page.textContent('#v_edStraighten')) === '0°', 'angle remis a zero');
  dire((await page.textContent('#v_edGrain')) === '0', 'grain remis a zero');

  console.log('\n[8] les raccourcis du studio ne percolent pas sous le voile');
  for (const k of ['v', 'x', 'a']) await page.keyboard.press(k);
  await page.waitForTimeout(500);
  const pendant = await compteurs();
  dire(JSON.stringify(pendant) === JSON.stringify(depart),
       'V/X/A n ont rien trie pendant la retouche');
  dire(await vu('#editorBox[open]'), "et l'editeur est toujours ouvert");

  console.log('\n[9] « Écraser la source » confirme — et on ANNULE toujours');
  await page.click('#edSaveOver');
  await page.waitForSelector('#armBox[open]');
  const conf = await page.textContent('#armBox');
  dire(conf.includes('plus récupérable'), "elle dit que l'original est perdu");
  dire(conf.includes('non mesurée'), 'que les mesures de realisme sont effacees');
  dire(conf.includes('garde l’original intact') || conf.includes("garde l'original intact"),
       'et rappelle que la copie, elle, ne detruit rien');
  await page.click('#cfNon');
  await page.waitForTimeout(400);
  const apresAnnul = await noms();
  dire(JSON.stringify(apresAnnul) === JSON.stringify(nomsAvant),
       'annulee : le dossier est inchange');

  console.log('\n[10] ENREGISTRER UNE COPIE : aller-retour complet');
  await regler('#edBright', 20);
  await page.waitForTimeout(300);

  console.log('\n[10bis] avant/apres (design pass ecran 5, §E) : geometrie intacte, couleur revient, ET la sauvegarde garde le VRAI reglage');
  const pixelCentre = () => page.evaluate(() => {
    const c = document.querySelector('#edCanvas');
    const ctx = c.getContext('2d');
    return Array.from(ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data);
  });
  const dimsCanvas = () => page.evaluate(() => {
    const c = document.querySelector('#edCanvas');
    return [c.width, c.height];
  });
  dire((await page.getAttribute('#edBeforeAfter', 'aria-pressed')) === 'false', 'relache au depart');

  // La rotation d'ABORD : le pixel « edite » de reference et celui du FICHIER
  // ECRIT plus bas doivent porter sur la MEME composition (le centre change
  // de contenu selon l'angle) -- sinon la comparaison de luminosite compare
  // deux pixels d'image differents, pas deux etats du meme pixel.
  await page.click('#edRotR'); // geometrie -- doit survivre au bascule ci-dessous
  await page.waitForTimeout(400);
  const dimsApresRotation = await dimsCanvas();
  const pixelEdite = await pixelCentre();

  await page.click('#edBeforeAfter');
  await page.waitForTimeout(300);
  dire((await page.getAttribute('#edBeforeAfter', 'aria-pressed')) === 'true', 'enfonce apres un clic');
  dire((await page.textContent('#edMsg')).includes('original'), 'edMsg dit lequel des deux s affiche');
  const dimsPendantBascule = await dimsCanvas();
  dire(JSON.stringify(dimsPendantBascule) === JSON.stringify(dimsApresRotation),
       `la rotation (geometrie) survit au bascule (${dimsPendantBascule} vs ${dimsApresRotation})`);
  const pixelAvant = await pixelCentre();
  dire(pixelAvant[0] < pixelEdite[0],
       `la couleur revient vers le neutre (rouge ${pixelAvant[0]} < ${pixelEdite[0]} edite)`);

  // SAUVEGARDE DEPUIS L'ETAT "avant" (bouton toujours enfonce) : le fichier
  // ecrit doit porter le VRAI reglage (luminosite +20 + rotation), jamais le
  // neutre affiche a l'ecran a cet instant precis -- c'est le risque exact
  // que ce bouton introduit s'il touchait `setSettings`.
  await page.click('#edSave');
  await page.waitForTimeout(3500);
  dire(!(await vu('#editorBox[open]')), "l'editeur se ferme apres l'enregistrement");
  dire(!(await page.evaluate(() => document.body.classList.contains('editing'))),
       'le marqueur d edition est retire');
  const apres = await noms();
  const copie = apres.find(n => !nomsAvant.includes(n));
  // la copie que CE test vient de creer : le seul fichier qu'il a le droit
  // d'effacer. La garde du haut refuse tout le reste.
  if (copie) jetables.add(copie);
  dire(Boolean(copie), `une copie est apparue : ${copie}`);
  dire(Boolean(copie) && copie.includes('_edit'), 'son nom porte bien `_edit`');
  dire(apres.includes(SOURCE), "et la SOURCE est intacte, elle n'a pas ete remplacee");

  if (copie) {
    const pixelFichier = await page.evaluate(async (nom) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const url = `/img?bucket=OK&space=sfw&name=${encodeURIComponent(nom)}&character=lena`;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data);
    }, copie);
    dire(pixelFichier[0] >= pixelEdite[0] - 12,
         `le FICHIER ECRIT sur le disque porte le vrai reglage, pas le neutre affiche a la sauvegarde (rouge ${pixelFichier[0]}, edite ${pixelEdite[0]})`);
  }

  console.log('\n[11] NETTOYAGE : la copie est supprimee par l interface');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-tile]');
  const k = await page.$$eval('[data-tile]', (tiles, nom) => {
    const i = tiles.findIndex(t => (t.querySelector('img')?.src || '').includes(encodeURIComponent(nom)));
    return i;
  }, copie);
  dire(k >= 0, `la copie est visible en Galerie (tuile ${k})`);
  await page.click(`[data-tile][data-k="${k}"] [data-tacts] [data-suppr]`);
  await page.waitForSelector('#armBox[open]');
  await page.click('#cfOui');
  await page.waitForTimeout(2000);
  const final = await noms();
  dire(!final.includes(copie), 'la copie est supprimee du disque');
  dire(JSON.stringify(final.sort()) === JSON.stringify([...nomsAvant].sort()),
       'le dossier est revenu a son etat de depart');
  const fin = await compteurs();
  dire(JSON.stringify(fin) === JSON.stringify(depart), `compteurs : ${JSON.stringify(fin)}`);

  console.log('\n[12] aucune erreur JS sur tout le parcours');
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
