/* Browser smoke test of the REACT scene bank — both sub-views, plus the tool
   rail that appears on Poses.

   Replaces three legacy fumigations: test_scenes_aller_retour (nothing is lost
   on a round trip), test_pose_scene_card (the pose selector on a scene card),
   and test_rail_repli (the rail collapses to icons).

   WHY THE ROUND TRIP IS THE HEART OF IT. On 25/08/2026 the save rebuilt each
   scene from the fields the card displays. Everything the card did NOT display
   was erased: `wardrobe`, `intensity`, `tags`, `tones` and `intention`
   disappeared from the bank's 16 scenes in ONE save, the « Suggestif » tier fell
   to zero scenes, and no test said a word. This one reads the bank, edits it
   through the interface, saves, reloads, and demands that nothing moved but what
   was touched.

   SINCE 31/08/2026 THE SCREEN IS A WORKBENCH — a grid of scenes and an
   inspector — so the walk it exercises is OPEN, EDIT, SAVE, and no longer « type
   into the third form down ». Three things it now also holds:
     - the world of the bank is SHOWN and not editable (ADR-0014);
     - a scene created in the browser reaches the disk STAMPED with that world,
       which is what lets the server lock be strict;
     - the fields did not move house without moving their names: the same
       `data-f` controls, in the inspector instead of in the card.

   THE COMPOSER IS SEVEN TABS, NOT ONE FORM (31/08/2026, wireframe-driven,
   `bank/composer/SceneComposer.tsx`). A `data-f` control now only exists in
   the DOM while ITS tab is open — the `onglet()` helper below switches tabs
   the same way a person would, by clicking the icon. The scene's `prompt` is
   no longer one field: it is composed from up to four fragments
   (`prompt_base`/`prompt_light`/`prompt_wardrobe`/`prompt_pose`, edited in the
   "Prompt global" tab), joined with `, ` on save exactly like `build_jobs`
   joins its own fragments — see the round-trip in [11] and the "never the
   outfit" guard in [12].

   THE 31/08/2026 CONSOLIDATION PASS moved « + Ajouter une scène » from a card
   in the grid to a toolbar button (same id, `#btnAddScene`, so most of this
   file did not need to change) and turned OFF the tool rail on `/bank/scenes`
   — the screen's own toolbar covers what it offered there. The rail checks
   that used to run here now run once the walk switches to `/bank/poses`,
   where the rail still appears.

   IT RESTORES WHAT IT CHANGES. The bank is real user data: the test snapshots
   scenes.json through the API, does its round trip, then writes the snapshot
   back and checks it matches. Nothing is left behind — verified at the end,
   including the scene it creates itself.

   test_pose_extraction stays separate: it needs ComfyUI online and a real GPU
   job, and it ignores itself without one.

   PREREQUISITES: see test_journal.js — run_browser_tests.py does all of it. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';
const SCENES = BASE + '/bank/scenes?character=lena';

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1500, height: 950 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const vu = s => page.isVisible(s).catch(() => false);
  const texte = s => page.textContent(s).catch(() => '');
  // lecture de la banque par l'API, hors de l'interface : c'est la reference
  const banque = () => page.evaluate(async () =>
    (await (await fetch('/api/scenes?character=lena')).json()).data);

  // une carte de la grille — le carrousel n'a plus de carte « ajouter » depuis
  // le 31/08/2026, mais le selecteur reste tolerant si elle revenait un jour
  const CARTE = '[data-scene-card]:not([data-new])';
  const champ = f => `#sceneInspector [data-f="${f}"]`;
  // le compositeur (31/08/2026) est un tablist : un champ n'est dans le DOM
  // que si son onglet est ouvert — voir bank/composer/SceneComposer.tsx
  const onglet = async cle => {
    await page.click(`#scene-tab-${cle}`);
    await page.waitForSelector(`#scene-panel-${cle}`);
  };

  await page.goto(SCENES, { waitUntil: 'networkidle' });
  await page.waitForSelector(CARTE);

  console.log('\n[0] instantane de scenes.json — il sera REECRIT a la fin');
  const avant = await banque();
  dire(Array.isArray(avant.scenes) && avant.scenes.length > 0,
       `${avant.scenes.length} scene(s) en banque au depart`);

  console.log('\n[1] la banque ouvre sur sa sous-vue, et l autre est une destination');
  dire(await page.evaluate(() => location.pathname) === '/bank/scenes', 'chemin /bank/scenes');
  dire(await vu('#bankScenes'), 'la sous-vue Scenes est montee');
  dire(!(await vu('#bankPoses')), 'la sous-vue Poses ne l est pas — une route, pas un attribut');
  const onglets = await page.$$eval('#bankView [data-vue]', e => e.map(x => x.dataset.vue));
  dire(onglets.join(',') === 'scenes,poses', 'les deux sous-vues sont offertes');
  const allume = await page.$$eval('.tabs .nav-item.on', e => e.map(x => x.dataset.s));
  dire(allume.join(',') === 'bank', "l'entree Banque de la navbar est allumee");

  console.log('\n[2] LE RAIL D OUTILS n apparait PAS sur Scenes (31/08/2026)');
  dire(!(await vu('#toolRail')),
       "l'ecran createur de scenes a son propre outillage — le rail n'y ajoute rien");

  console.log('\n[3] LE MONDE de la banque est dit, et il ne s edite pas (ADR-0014)');
  dire(await vu('#worldBanner'), 'le bandeau monde est present');
  const monde = await page.$eval('#worldBanner [data-world]', e => e.dataset.world);
  dire(monde === avant.world, `il porte le monde du document (${monde})`);
  dire((await page.$$('#worldBanner input, #worldBanner select, #worldBanner textarea')).length === 0,
       'aucun controle : le monde est fige a la creation, pas un reglage');
  dire(!(await vu('#worldBanner [data-world-drift]')),
       'et aucune derive signalee — la fiche et le fichier disent le meme monde');

  console.log('\n[4] la GRILLE montre l essentiel, une carte par scene');
  const nCartes = await page.$$eval(CARTE, e => e.length);
  dire(nCartes === avant.scenes.length, `${nCartes} cartes pour ${avant.scenes.length} scenes`);
  dire(await vu('#btnAddScene'), "le bouton « + Ajouter une scene » est dans la barre d'outils");
  dire((await page.$eval(CARTE + ' [data-card-id]', e => e.textContent)) === avant.scenes[0].id,
       'la premiere carte porte l identifiant de la premiere scene');
  dire((await page.$$(CARTE + ' [data-f]')).length === 0,
       "une carte ne porte AUCUN champ : le detail vit dans l'inspecteur");
  dire((await texte(CARTE + ' [data-card-produced]')).length > 0,
       'elle dit en toutes lettres si la scene a deja ete produite');

  console.log('\n[5] OUVRIR une carte remplit l inspecteur');
  dire(await vu('#bankDocument'),
       'sans selection, l inspecteur tient les reglages de la banque (ancre, direction)');
  dire(await vu('#anchor') && await vu('#direction'),
       "l'ancre d'identite et la note de direction y sont");
  await page.click(CARTE);
  await page.waitForSelector('#sceneInspector');
  dire(!(await vu('#bankDocument')), 'la scene ouverte remplace les reglages de banque');
  // le compositeur doit remplir la HAUTEUR disponible (demande explicite),
  // pas seulement la largeur de son propre contenu — verifie que le panneau
  // visible (bordure + fond) atteint bien la hauteur de son conteneur
  // `#bankInspector`, pas seulement celle de l'onglet General (le plus court)
  const hAside = await page.$eval('#bankInspector', e => e.getBoundingClientRect().height);
  const hPanel = await page.$eval('#sceneInspector', e => e.getBoundingClientRect().height);
  dire(Math.abs(hAside - hPanel) < 2,
       `le panneau (${Math.round(hPanel)}px) remplit son conteneur (${Math.round(hAside)}px), pas seulement son contenu`);
  dire((await page.$$eval('#sceneInspector [role="tab"]', e => e.length)) === 7,
       'le compositeur ouvre sur ses 7 onglets (wireframe 31/08/2026)');
  // les champs du compositeur sont repartis par onglet — un champ absent du
  // DOM tant que son onglet n'est pas ouvert, contrairement a l'ancien
  // formulaire plat qui les montrait tous a la fois
  const parOnglet = {
    general: ['id', 'intention', 'format', 'count', 'guidance', 'band_lo', 'tones', 'tags'],
    light: ['prompt_light', 'variants'],
    clothing: ['wardrobe'],
    pose: ['prompt_pose', 'pose'],
    recap: ['prompt_base', 'prompt_light_recap', 'prompt_pose_recap', 'wardrobe_recap'],
  };
  for (const [cle, champsAttendus] of Object.entries(parOnglet)) {
    await onglet(cle);
    const presents = await page.$$eval('#sceneInspector [data-f]', e => e.map(x => x.dataset.f));
    champsAttendus.forEach(f => dire(presents.includes(f), `onglet ${cle} : champ « ${f} »`));
  }
  await onglet('general');
  dire((await page.$eval(champ('id'), e => e.value)) === avant.scenes[0].id,
       'et c est bien LA scene ouverte qui est editee');
  dire(await page.$eval(CARTE, e => e.getAttribute('aria-pressed')) === 'true',
       'la carte ouverte se dit selectionnee (pas seulement par sa bordure)');

  console.log('\n[5bis] le tablist se pilote au clavier — fleches + roving tabindex');
  await page.focus('#scene-tab-general');
  await page.keyboard.press('ArrowRight');
  dire((await page.$eval('#scene-tab-light', e => e.getAttribute('aria-selected'))) === 'true',
       'fleche droite selectionne l onglet suivant');
  dire((await page.evaluate(() => document.activeElement?.id)) === 'scene-tab-light',
       'et deplace le focus AVEC la selection (roving tabindex)');
  await page.keyboard.press('Home');
  dire((await page.$eval('#scene-tab-general', e => e.getAttribute('aria-selected'))) === 'true',
       'Home revient au premier onglet');

  console.log('\n[6] Echap referme et rend le focus a sa carte');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  dire(await vu('#bankDocument'), "l'inspecteur revient aux reglages de la banque");
  dire(await page.evaluate(() => document.activeElement?.dataset?.uid !== undefined),
       'le focus est revenu sur la carte, pas en haut du document');
  await page.click(CARTE);
  await page.waitForSelector('#sceneInspector');

  console.log('\n[7] le plafond de niveau se DEDUIT des tenues, a la frappe — meme lu depuis un AUTRE onglet');
  await onglet('clothing');
  const tenues = await page.$eval(champ('wardrobe'), e => e.value);
  await page.fill(champ('wardrobe'), tenues + '\n3: a test outfit');
  await page.waitForTimeout(200);
  await onglet('general');
  const plafond = () => page.$eval(champ('band_lo'),
    e => e.closest('.f').querySelector('span b').textContent);
  dire(await plafond() === '3', `le plafond (onglet General) suit la tenue tapee (onglet Vetements) (${await plafond()})`);
  await onglet('clothing');
  await page.fill(champ('wardrobe'), tenues);
  await page.waitForTimeout(200);

  console.log('\n[7bis] le selecteur de vetement : filtre, SELECTION puis "+" — jamais un ajout au simple survol/clic de la piece');
  const filtre = 'select#wardrobeFilter';
  const options = await page.$$eval(`${filtre} option`, e => e.map(o => o.value).filter(Boolean));
  dire(options.length > 0, `${options.length} categorie(s) au filtre (Haut, Bas, ...)`);
  await page.selectOption(filtre, options[0]);
  await page.waitForTimeout(100);
  const boutonAjout = '#sceneInspector button[aria-label="Ajouter la pièce sélectionnée comme nouvelle ligne"]';
  dire(await page.isDisabled(boutonAjout), 'le bouton "+" est INACTIF tant qu aucune piece n est choisie');
  const [piece] = await page.$$(`#sceneInspector [aria-pressed]`);
  const libellePiece = (await piece.textContent()).trim();
  await piece.click();
  await page.waitForTimeout(100);
  dire(await piece.getAttribute('aria-pressed') === 'true', 'cliquer une piece la SELECTIONNE (ne touche pas encore la tenue)');
  const avantAjout = await page.$eval(champ('wardrobe'), e => e.value);
  dire(avantAjout === tenues, 'la selection seule n a rien ecrit dans le prompt de vetement');
  dire(!(await page.isDisabled(boutonAjout)), 'le bouton "+" s active une fois une piece choisie');
  await page.click(boutonAjout);
  await page.waitForTimeout(150);
  const apresAjout = await page.$eval(champ('wardrobe'), e => e.value);
  dire(apresAjout === `${avantAjout}\n0: ${libellePiece}`,
       `« + » a ajoute la ligne "0: ${libellePiece}" sans toucher au reste`);
  await page.fill(champ('wardrobe'), tenues);
  await page.waitForTimeout(200);
  await onglet('general');

  console.log('\n[8] une frappe arme le bandeau « modifications non enregistrees »');
  dire(await vu('#dirtyBar'), 'le bandeau est la');
  dire((await texte('#dirtyBar')).includes('production ne les voit pas'),
       'il dit pourquoi ca compte, pas seulement qu il y a des changements');
  dire(await vu('#btnDirtySave'), 'et il porte l enregistrement');

  console.log('\n[9] il survit a la navigation — l ecran demonte, pas la saisie');
  await page.click('.tabs [data-s="application"]');
  await page.waitForTimeout(400);
  dire(await vu('#dirtyBar'), "le bandeau suit sur l'ecran Application");
  await page.click('.tabs [data-s="bank"]');
  await page.waitForTimeout(500);
  await page.waitForSelector(CARTE);
  await page.click(CARTE);
  await page.waitForSelector('#sceneInspector');
  await onglet('clothing');
  dire(await page.$eval(champ('wardrobe'), e => e.value) === tenues,
       'la saisie est intacte au retour');

  console.log('\n[10] FILTRER retrecit la grille, jamais le document');
  const cible = avant.scenes[0];
  await page.fill('#sceneFilter', cible.id);
  await page.waitForTimeout(200);
  const filtrees = await page.$$eval(CARTE, e => e.length);
  dire(filtrees < avant.scenes.length && filtrees >= 1,
       `${filtrees} carte(s) pour « ${cible.id} »`);
  dire((await texte('#nScenes')).includes(String(avant.scenes.length)),
       'le compte rappelle le total du document, pas seulement ce qui est montre');
  await page.fill('#sceneFilter', '');
  await page.waitForTimeout(200);
  dire(await page.$$eval(CARTE, e => e.length) === avant.scenes.length,
       'vider le filtre rend toute la banque');

  console.log('\n[11] ALLER-RETOUR : on modifie 2 fragments dans 2 onglets, et rien d autre ne bouge');
  await page.click(CARTE);
  await page.waitForSelector('#sceneInspector');
  await onglet('recap');
  const marque = (cible.prompt || '') + ' _FUMIGATION_';
  await page.fill(champ('prompt_base'), marque);
  const eclairage = 'fumigation lumiere marker';
  await page.fill(champ('prompt_light_recap'), eclairage);
  await page.waitForTimeout(150);
  const promptAttendu = `${marque}, ${eclairage}`;
  dire((await page.$eval('#sceneInspector textarea[readonly]', e => e.value)) === promptAttendu,
       'le "prompt compose" affiche deja la jointure des 2 fragments, virgule separee');
  await page.click('#btnSaveScenes');
  await page.waitForTimeout(1400);
  dire((await texte('#scMsg')).includes('enregistré'), `la barre le confirme : « ${await texte('#scMsg')} »`);
  dire(!(await vu('#dirtyBar')), 'le bandeau disparait : plus rien en attente');

  const apres = await banque();
  dire(apres.scenes.length === avant.scenes.length,
       `toujours ${apres.scenes.length} scenes — aucune perdue`);
  dire(apres.scenes[0].prompt === promptAttendu,
       'les 2 fragments tapes dans des onglets differents ont bien ete joints, virgule separee');

  // LE POINT DU TEST : tout ce que l'inspecteur ne montre pas doit avoir traverse
  const ecarts = [];
  avant.scenes.forEach((s, i) => {
    const a = apres.scenes[i] || {};
    Object.keys(s).forEach(k => {
      if (k === 'prompt' && i === 0) return;               // le champ modifie
      if (k === 'category') return;                        // cle morte, retiree a l'enregistrement
      if (JSON.stringify(s[k]) !== JSON.stringify(a[k]))
        ecarts.push(`${s.id}.${k} : ${JSON.stringify(s[k])} -> ${JSON.stringify(a[k])}`);
    });
  });
  dire(ecarts.length === 0, `aucune cle perdue ni alteree (${ecarts.length} ecart(s))`);
  ecarts.slice(0, 6).forEach(e => console.log('      ' + e));
  dire(apres.world === avant.world, 'le monde du document a traverse');
  dire(apres.scenes.every(s => s.world === avant.world),
       'et chaque scene porte toujours le sien');
  dire(JSON.stringify(apres.anchor) === JSON.stringify(avant.anchor),
       "l'ancre d'identite a traverse");
  dire(JSON.stringify(apres.direction) === JSON.stringify(avant.direction),
       'la note de direction aussi');

  console.log('\n[12] AJOUTER une scene : un draft perso, tamponne du monde du perso');
  await page.click('#btnAddScene');
  await page.waitForSelector('#sceneInspector');
  dire(await vu('#sceneInspector'), 'la scene neuve ouvre dans l inspecteur — pas creee a l aveugle');
  dire((await page.$eval('#scene-tab-general', e => e.getAttribute('aria-selected'))) === 'true',
       'une scene neuve (comme une autre) ouvre sur l onglet General');
  const idNeuf = 'fumigation_scene_neuve';
  await page.fill(champ('id'), idNeuf);
  await onglet('recap');
  await page.fill(champ('prompt_base'), 'a quiet corner used by the smoke test');
  await page.waitForTimeout(150);
  dire(await vu('#dirtyBar'),
       'elle n existe que dans la page tant qu on n enregistre pas — le bandeau le dit');
  await page.click('#btnSaveScenes');
  await page.waitForTimeout(1400);
  const avecNeuve = await banque();
  const neuve = avecNeuve.scenes.find(s => s.id === idNeuf);
  dire(Boolean(neuve), 'la scene neuve est bien arrivee sur le disque');
  dire(neuve && neuve.world === avant.world,
       `elle porte le monde du personnage (${neuve && neuve.world})`);
  dire(neuve && neuve.origin === 'manual', 'et son origine dit d ou elle vient');
  dire(avecNeuve.scenes.length === avant.scenes.length + 1,
       'une scene de plus, aucune de moins');
  dire(neuve && neuve.prompt === 'a quiet corner used by the smoke test',
       'seul le fragment de base tape a ete ecrit — les 3 autres, restes vides, ne rejoignent rien');
  // NEW_SCENE nait avec `wardrobe: {"0": "everyday clothing"}` (ScenesStoreContext) :
  // une valeur connue, pas une donnee reelle imprevisible, pour verifier que la
  // tenue ne se glisse JAMAIS dans le prompt (elle est injectee a part, par
  // niveau — voir le commentaire de SceneDraft).
  dire(neuve && !neuve.prompt.includes('everyday clothing'),
       'et la tenue par defaut de la scene neuve n a jamais rejoint le prompt');

  console.log('\n[13] une tenue sans niveau REFUSE l enregistrement');
  await page.click(CARTE);
  await page.waitForSelector('#sceneInspector');
  await onglet('clothing');
  await page.fill(champ('wardrobe'), 'une tenue sans niveau');
  await page.waitForTimeout(150);
  await page.click('#btnSaveScenes');
  await page.waitForTimeout(600);
  dire((await texte('#scMsg')).includes('tenue sans niveau'),
       `le refus est dit a l'ecran : « ${(await texte('#scMsg')).slice(0, 70)}… »`);
  const pendant = await banque();
  dire(JSON.stringify(pendant.scenes[0].wardrobe) === JSON.stringify(apres.scenes[0].wardrobe),
       "et rien n'a ete ecrit : la tenue d'origine est toujours en banque");
  dire(await vu('#dirtyBar'), 'le bandeau reste : le travail est toujours en attente');

  console.log('\n[14] sous-vue POSES : une route, un libelle de barre qui suit');
  await page.click('#bankView [data-vue="poses"]');
  await page.waitForTimeout(400);
  dire(await page.evaluate(() => location.pathname) === '/bank/poses', 'chemin /bank/poses');
  dire(await vu('#bankPoses'), 'la sous-vue Poses est montee');
  dire(!(await vu('#bankScenes')), 'la sous-vue Scenes ne l est plus');
  dire((await texte('#scTitre')).includes('attributions de pose'),
       `la barre dit ce qu elle enregistre ICI : « ${await texte('#scTitre')} »`);
  dire((await texte('#scMsg')).includes('pas les squelettes'),
       'et precise ce qu elle N enregistre PAS');
  dire(await vu('#btnSaveScenes'), "le bouton reste : une edition en attente garde son action");
  dire(await vu('#dirtyBar'), 'et le bandeau aussi');
  dire((await texte('#bankPoses')).includes('ne reste jamais sur le disque'),
       'la vue dit que la photo source n est jamais gardee');

  console.log('\n[15] LE RAIL D OUTILS apparait ici (Poses), et vient du pack');
  dire(await vu('#toolRail'), 'le rail est present sur Poses');
  const outils = await page.$$eval('#toolRail .rail-it .rail-lab-it', e => e.map(x => x.textContent));
  dire(outils.length > 0, `entrees du rail : ${outils.join(' · ')}`);
  dire(!(await vu('#toolRail [data-s]')),
       "il ne recopie aucune destination de la navbar : ce n'est pas une seconde navigation");
  const inertes = await page.$$eval('#toolRail .rail-it:disabled',
    e => e.map(x => x.dataset.hintText || ''));
  dire(inertes.every(r => r.length > 0),
       `un outil inerte DIT pourquoi (${inertes.length} inerte(s))`);

  console.log('\n[16] le rail se replie en ICONES, pas en rien');
  const cle = () => page.evaluate(() => localStorage.getItem('studio.rail-mince'));
  const largeur = () => page.$eval('#toolRail', e => e.getBoundingClientRect().width);
  const large = await largeur();
  await page.click('#btnRailPli');
  await page.waitForTimeout(250);
  dire(await cle() === '1', 'studio.rail-mince = 1');
  const etroit = await largeur();
  dire(etroit < large && etroit > 20, `le rail retrecit sans disparaitre (${large} -> ${etroit} px)`);
  dire(await page.isVisible('#toolRail .rail-it'), 'ses entrees restent cliquables');
  const lab = await page.$('#toolRail .rail-lab-it');
  dire(await lab.evaluate(e => getComputedStyle(e).display) !== 'none',
       'les libelles restent le nom accessible des entrees');
  dire(await lab.evaluate(e => e.getBoundingClientRect().width <= 2),
       'mais ils sont retires VISUELLEMENT');
  // `--rail` suit la largeur : sinon la barre de lancement garde sa gouttiere
  const gouttiere = await page.$eval('.launch', e => e.getBoundingClientRect().left);
  const railDroite = await page.$eval('#toolRail', e => e.getBoundingClientRect().right);
  dire(Math.abs(gouttiere - railDroite) < 3,
       `la barre de lancement suit le rail replie (${Math.round(gouttiere)} vs ${Math.round(railDroite)} px)`);
  await page.click('#btnRailPli');
  await page.waitForTimeout(250);
  dire(await cle() === '0', 'deplier reecrit la cle');

  console.log('\n[17] le rail marque l entree de la sous-vue courante');
  const actives = await page.$$eval('#toolRail .rail-it.on .rail-lab-it', e => e.map(x => x.textContent));
  dire(actives.includes('Poses'), `l entree active suit la sous-vue (${actives.join(',') || 'aucune'})`);

  console.log('\n[18] REMISE EN ETAT : scenes.json revient a son instantane');
  const remis = await page.evaluate(async avant => {
    const r = await fetch('/api/scenes?character=lena', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({data: avant})});
    return (await r.json()).ok;
  }, avant);
  dire(remis === true, 'la banque d origine est reecrite');
  await page.goto(SCENES, { waitUntil: 'networkidle' });
  const final = await banque();
  dire(!final.scenes.some(s => s.id === idNeuf),
       'la scene creee par la fumigation a bien disparu');
  const restant = [];
  avant.scenes.forEach((s, i) => {
    const a = final.scenes[i] || {};
    Object.keys(s).forEach(k => {
      if (k === 'category') return;
      if (JSON.stringify(s[k]) !== JSON.stringify(a[k])) restant.push(`${s.id}.${k}`);
    });
  });
  dire(restant.length === 0,
       `aucune trace laissee par la fumigation (${restant.length} ecart(s))`);
  restant.slice(0, 6).forEach(e => console.log('      ' + e));

  console.log('\n[19] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
