/* Browser smoke test of the REACT Produire screen — the last one migrated, and
   the one that carries the two remaining coupling traps of AUDIT §5.6.

   Replaces four legacy fumigations: test_ecran_creer, test_apercu_prompt,
   test_panneau_reglages and test_compte_rendu.

   WHAT THIS TEST HOLDS:

     1. THE LINEAR WALK. Blocks 2 and 3 do not exist until the intention is
        chosen. On the tier that EDITS there are TWO blocks instead — source
        image then instruction — and the numbering follows.
     2. TRAP §5.6-2 — /api/plan is REPLAYED on every keystroke, behind a
        debounce, and it carries the count, the prompt preview AND the
        instruction alerts. Counted in requests: typing a sentence fires far
        fewer calls than it has letters, and it fires at least one.
     3. TRAP §5.6-3 — `#btnRun.disabled`. It must stay disabled while the plan
        is not valid, and become available exactly when it is. The test watches
        it across a full second — the window where the two legacy timers used to
        fight — and demands it never flickers.
     4. THE PROMPT PREVIEW shows the fragments with their source and their share,
        and the amendment is only offered on ONE selected scene.
     5. THE SETTINGS PANEL is declarative: every control says what it does, the
        « mesuré » badge follows config.json, and a preset FILLS the panel
        instead of bypassing it. Two buttons open it — the launch bar gear and
        the rail one — and they share ONE state.
     6. NOTHING IS LAUNCHED. The test never clicks « Générer »: it checks the
        guard, not the production. That is what makes it runnable against real
        data with no GPU.

   PREREQUISITES: see test_journal.js — run_browser_tests.py does all of it. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';

/* Les crochets du DOM que la migration Tailwind a deplaces : la carte de scene
   et l'etat ouvert du panneau ne sont plus des classes — une classe utilitaire
   n'est plus un nom d'etat, elle est une declaration. */
const CARTE = '#sceneGrid [data-scene-card]';
// Same grid, minus the "+" tile (NewSceneCard) — it always stays, search or
// sort or not, so a count/order/content check on the REAL scenes excludes it.
const CARTE_REELLE = '#sceneGrid [data-scene-card]:not([data-new])';
const PANNEAU = '#gearPanel[data-open]';

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1700, height: 1050 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
  let plans = 0;
  page.on('request', r => { if (r.url().includes('/api/plan')) plans++; });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const vu = s => page.isVisible(s).catch(() => false);
  const texte = s => page.textContent(s).catch(() => '');
  const inerte = () => page.isDisabled('#btnRun');
  const compteurs = () => page.evaluate(async () =>
    (await (await fetch('/api/state?character=lena')).json()).counts);

  console.log('\n[0] etat de depart');
  await page.goto(BASE + '/produce?character=lena', { waitUntil: 'networkidle' });
  await page.waitForSelector('#railIntent button');
  const depart = await compteurs();
  console.log(`      ${JSON.stringify(depart)}`);

  console.log('\n[1] LE RAIL EST PERMANENT : intention/ton et scenes sont la sans un clic');
  /* screen-3-produire §S : la premiere intention peuplee est presilectionnee
     au montage, donc la grille de scenes est deja le hero — plus un mur a
     franchir avant d'en voir une. */
  dire(await vu('#railIntent'), 'le rail Intention est la');
  dire(await vu('#stepScenes'), 'la grille de scenes aussi, sans avoir rien clique');
  const premiereChoisie = await page.$eval('#railIntent button[aria-checked="true"]',
    e => e.getAttribute('data-k')).catch(() => null);
  dire(!!premiereChoisie, `une intention est deja choisie par defaut (« ${premiereChoisie} »)`);
  dire(await inerte(), '« Générer » reste inerte : aucune scène cochée');
  dire((await texte('#sumT')).includes('sélectionne au moins une scène'),
       'la barre dit ce qui manque desormais — pas « choisis une intention », deja fait');
  dire(!(await vu('#queueRail')), 'la bande de file (QueueRail) ne se peint pas sans rien a montrer — permanente, pas decorative');

  console.log('\n[2] les intentions VIDES ne restent pas grisees dans le rail');
  const pleines = await page.$$eval('#railIntent button',
    e => e.map(x => x.querySelector('span:nth-child(2)').textContent));
  dire(pleines.length > 0, `${pleines.length} intention(s) peuplee(s) : ${pleines.join(', ')}`);
  dire(pleines.includes('Toutes'), '« Toutes » est proposee avec les autres');
  if (await vu('#railIntentVides')){
    const vides = await page.$$eval('#railIntentVides button',
      e => e.map(x => x.querySelector('span:nth-child(2)').textContent));
    dire((await texte('#railIntentVides [data-sep]')).includes('à peupler'),
         `les vides passent sous un separateur (${vides.join(', ')})`);
    dire(await page.$eval('#railIntentVides button span:nth-child(3)', e => e.textContent) === 'en composer une',
         'et proposent d aller en composer une');
  } else {
    console.log('      (aucune intention vide dans cette banque)');
  }

  console.log('\n[3] changer d intention dans le rail change la grille, rien d autre');
  if (pleines.length > 1){
    const avant = await page.$$eval(CARTE, e => e.length);
    await page.click('#railIntent button:nth-child(2)');
    await page.waitForTimeout(400);
    dire(await page.$eval('#railIntent button:nth-child(2)', e => e.getAttribute('aria-checked')) === 'true',
         'la 2e intention est maintenant cochee');
    dire(await vu('#stepScenes'), 'le bloc Scènes reste affiche — jamais reconstruit depuis zero');
    const apres = await page.$$eval(CARTE, e => e.length);
    console.log(`      ${avant} -> ${apres} scène(s) dans la grille`);
  } else {
    console.log('      (une seule intention peuplee dans cette banque, rien a changer)');
  }

  console.log('\n[4] recherche et tri dans la grille (design pass ecran 3, §S)');
  const avantRecherche = await page.$$eval(CARTE_REELLE, e => e.length);
  const id0 = await page.$eval(CARTE_REELLE + ' b', e => e.textContent).catch(() => null);
  if (id0 && avantRecherche > 1){
    const aiguille = id0.slice(0, Math.min(4, id0.length));
    await page.fill('#sceneSearch', aiguille);
    await page.waitForTimeout(200);
    const filtres = await page.$$eval(CARTE_REELLE + ' b', e => e.map(x => x.textContent));
    dire(filtres.length > 0 && filtres.every(t => t.toLowerCase().includes(aiguille.toLowerCase())),
         `« ${aiguille} » ne garde que les scènes qui la contiennent (${filtres.join(', ')})`);
    dire(await vu(CARTE + '[data-new]'), 'la tuile « + » reste offerte pendant la recherche');
    await page.fill('#sceneSearch', 'kxzkxzkxz-introuvable');
    await page.waitForTimeout(200);
    dire(await vu('#stepScenes .empty'), 'une recherche sans resultat le dit, plutot qu une grille vide muette');
    await page.fill('#sceneSearch', '');
    await page.waitForTimeout(200);
    const apresRecherche = await page.$$eval(CARTE_REELLE, e => e.length);
    dire(apresRecherche === avantRecherche, 'vider la recherche redonne la grille complete');

    await page.selectOption('#sceneSortBy', 'name');
    await page.waitForTimeout(200);
    const parNom = await page.$$eval(CARTE_REELLE + ' b', e => e.map(x => x.textContent));
    const tries = [...parNom].sort((a, b) => a.localeCompare(b));
    dire(JSON.stringify(parNom) === JSON.stringify(tries), `tri « nom » est bien alphabetique (${parNom.join(', ')})`);
    await page.selectOption('#sceneSortBy', 'affinity');
    await page.waitForTimeout(200);
  } else {
    console.log('      (pas assez de scenes pour exercer la recherche/le tri)');
  }

  // §A2 : le badge "pose imposee" d'une carte de scene, s'il y en a une dans
  // ce lot, doit etre joignable au clavier — plus seulement au survol.
  const badgePose = await page.$(CARTE + ' [data-hint-text*="pose imposée"]');
  if (badgePose){
    dire((await badgePose.getAttribute('tabindex')) === '0', 'le badge pose est dans l ordre de tabulation');
    dire(!(await badgePose.evaluate(e => e.hasAttribute('title'))), 'sans le title redondant');
  } else {
    console.log('      (aucune scene a pose imposee dans ce lot)');
  }

  console.log('\n[5] PIEGE §5.6-3 : le bouton suit le PLAN, sans clignoter');
  plans = 0;
  await page.click(CARTE);
  // le plan est debounce : on attend qu'il ait repondu
  await page.waitForFunction(() => {
    const b = document.querySelector('#btnRun');
    return b && !b.disabled;
  }, null, { timeout: 15000 }).catch(() => {});
  dire(!(await inerte()), '« Générer » s arme une fois une scène cochée et le plan rendu');
  dire(/\d+ image/.test(await texte('#sumN')), `la barre compte : « ${await texte('#sumN')} »`);
  /* La fenetre exacte ou les deux minuteurs de l'ancien frontend se disputaient
     l'attribut : le tick de production (1,5 s) et refreshPlan. On regarde
     l'etat du bouton 20 fois sur une seconde et demie — il ne doit jamais
     osciller. */
  const etats = [];
  for (let i = 0; i < 20; i++){
    etats.push(await inerte());
    await page.waitForTimeout(80);
  }
  dire(new Set(etats).size === 1,
       `etat stable sur 1,6 s couvrant deux ticks (${[...new Set(etats)].join(',')})`);

  console.log('\n[6] LE PANNEAU DE DEVELOPPEMENT suit la scène pointee (design pass ecran 3, §S)');
  const carteCliquee = await page.$(CARTE);
  const idCliquee = await carteCliquee.$eval('b', e => e.textContent);
  dire(await vu('#developScene'), 'une scène pointee affiche son detail');
  dire((await texte('#developScene h2')) === idCliquee,
       `c est bien la scène cliquee (« ${idCliquee} »)`);
  dire((await texte('#developSelect')) === 'Retirer de la sélection',
       'elle est deja cochee pour ce lot — le bouton le dit');
  await page.click('#developSelect');
  await page.waitForTimeout(200);
  dire((await carteCliquee.getAttribute('aria-pressed')) === 'false',
       'retirer via le panneau decoche vraiment la carte dans la grille');
  dire((await texte('#sumT')).includes('sélectionne au moins une scène'),
       'la barre de lancement le sait aussitot');
  dire((await texte('#developSelect')) === 'Sélectionner', 'et le bouton change de libelle');
  await page.click('#developSelect');
  await page.waitForTimeout(200);
  dire((await carteCliquee.getAttribute('aria-pressed')) === 'true',
       'la re-cocher depuis le panneau la remet dans la selection');

  console.log('\n[6b] COMPARAISON cote a cote (design pass ecran 3, §S)');
  const secondId = await page.$$eval(CARTE_REELLE + ' b', (e, exclu) =>
    e.map(x => x.textContent).find(t => t !== exclu), idCliquee);
  if (secondId){
    await page.click(`${CARTE_REELLE}:has(b:text-is("${secondId}"))`);
    await page.waitForTimeout(400);
    dire((await texte('#btnCompare')).includes('(2)'), 'le bouton Comparer compte les scènes cochées');
    await page.click('#btnCompare');
    await page.waitForSelector('#compareGrid');
    const cartes = await page.$$eval('#compareGrid [data-compare-card] b', e => e.map(x => x.textContent));
    dire(cartes.length === 2 && cartes.includes(idCliquee) && cartes.includes(secondId),
         `les deux candidates sont la (${cartes.join(', ')})`);
    dire(!(await vu('#sceneGrid')), 'la grille normale cede la place a la comparaison');
    // Retenir sur la carte de la scène cliquee au [6] : la suite du parcours
    // (section [8]) attend `cafe_terrasse` comme SEULE scène cochee.
    await page.click(`#compareGrid [data-compare-card]:has(b:text-is("${idCliquee}")) button:has-text("Retenir")`);
    await page.waitForTimeout(400);
    dire(!(await vu('#compareGrid')), 'Retenir referme la comparaison — un seul candidat, plus rien a comparer');
    dire(await vu('#sceneGrid'), 'la grille normale revient');
    const restantes = await page.$$eval(CARTE_REELLE + '[aria-pressed="true"] b', e => e.map(x => x.textContent));
    dire(JSON.stringify(restantes) === JSON.stringify([idCliquee]),
         `seule « ${idCliquee} » reste cochee`);
  } else {
    console.log('      (une seule scène disponible a ce niveau, rien a comparer)');
  }

  console.log('\n[7] PIEGE §5.6-2 : /api/plan est rejoue a la frappe, mais debounce');
  await page.click('#btnApercu');
  await page.waitForSelector('#apercuPanel');
  await page.waitForTimeout(600);
  dire(await vu('#sceneOverride'), "le champ d'amendement est la (une seule scène cochée)");
  plans = 0;
  await page.type('#sceneOverride', 'soft window light', { delay: 25 });
  await page.waitForTimeout(1200);
  const lettres = 'soft window light'.length;
  dire(plans >= 1, `${plans} appel(s) a /api/plan pour ${lettres} frappes — il est bien rejoue`);
  dire(plans < lettres, `et debounce : ${plans} < ${lettres}`);

  console.log('\n[8] L APERCU montre le prompt REELLEMENT envoye');
  await page.waitForTimeout(600);
  const frags = await page.$$eval('#apFrags [data-source]', e => e.map(x => x.textContent.trim()));
  dire(frags.length >= 3, `${frags.length} fragments, avec leur source : ${frags.join(' · ')}`);
  const parts = await page.$$eval('#apFrags [data-part]', e => e.map(x => x.textContent.trim()));
  dire(parts.every(p => /%$/.test(p)), `chacun avec sa part (${parts.join(' ')})`);
  dire(await vu('#apFrags [data-fragment][data-own]'),
       "la scène — le seul fragment que l'utilisateur ecrit — est distinguee");
  dire(/\d+ caractères/.test(await texte('#apMeta')), `l'en-tete compte : « ${await texte('#apMeta')} »`);

  console.log('\n[9] l amendement demande UNE scène, et le dit sinon');
  /* Le panneau d'apercu se pose AU-DESSUS de la barre de lancement et recouvre
     le bas de la grille : on le referme pour cocher, comme le ferait quelqu'un
     qui defile. Ce n'est pas un contournement — c'est le geste reel. */
  const combien = await page.$$eval(CARTE, e => e.length);
  if (combien > 2){
    await page.click('#apFermer');
    await page.waitForTimeout(300);
    await page.click(CARTE + ':nth-child(2)');
    await page.waitForTimeout(1000);
    await page.click('#btnApercu');
    await page.waitForSelector('#apercuPanel');
    await page.waitForTimeout(700);
    dire(await page.isDisabled('#sceneOverride'), 'avec deux scènes, le champ est inerte');
    dire((await texte('#apAmdLbl')).includes('une seule scène'), 'et la raison est ecrite');
    await page.click('#apFermer');
    await page.waitForTimeout(300);
    await page.click(CARTE + ':nth-child(2)');
    await page.waitForTimeout(1000);
    await page.click('#btnApercu');
    await page.waitForSelector('#apercuPanel');
    await page.waitForTimeout(700);
    dire(!(await page.isDisabled('#sceneOverride')), 'revenir a une seule le rearme');
  }
  await page.click('#apFermer');
  await page.waitForTimeout(300);
  dire(!(await vu('#apercuPanel')), "l'apercu se ferme");

  console.log('\n[10] LE PANNEAU DE REGLAGES : declaratif, et il dit ce qu il coute');
  await page.click('#btnGear');
  await page.waitForSelector(PANNEAU);
  const sections = await page.$$eval('#gearBody [data-rgs] h4', e => e.map(x => x.textContent));
  dire(sections.length >= 4, `${sections.length} sections : ${sections.join(' · ')}`);
  const controles = await page.$$eval('#gearBody [data-rg]', e => e.length);
  dire(controles >= 15, `${controles} reglages exposes`);
  const sansTexte = await page.$$eval('#gearBody [data-rg]',
    e => e.filter(x => !x.querySelector('[data-rgq]')
                    || !x.querySelector('[data-rgq]').textContent.trim()).length);
  dire(sansTexte === 0, 'chacun dit ce qu il fait');
  const couts = await page.$$eval('#gearBody [data-rgq] [data-cout]', e => e.length);
  dire(couts > 0, `${couts} disent aussi ce qu ils coutent`);
  const html = await page.$eval('#gearBody', e => e.innerHTML);
  dire(!/undefined|NaN/.test(html), 'aucun « undefined » ni « NaN » dans le panneau peint');
  dire(!(await vu('#gearBody [data-rgs][data-niveau="edit"]')),
       "la section NSFW est absente hors du cran qui edite");

  console.log('\n[11] la pastille « mesuré » suit config.json');
  /* L'etat de la pastille se lit sur un ATTRIBUT, jamais dans son `class` :
     depuis le passage aux utilitaires, la chaine de classes contient des mots
     comme `outline-offset` — un `includes('off')` y serait vrai partout. */
  const mesures = await page.$$eval('#gearBody [data-mes]',
    e => e.map(x => x.hasAttribute('data-off')));
  dire(mesures.length > 0, `${mesures.length} pastille(s) « mesuré »`);
  dire(mesures.every(off => !off),
       'toutes allumees a l ouverture : le panneau part des valeurs mesurees');
  dire((await texte('#gearDiff')) === '', 'et le compteur d ecarts est vide');
  // §A3 : la valeur de reference passe par data-hint-text + tabIndex, plus
  // par un `title` qui ne reagit qu'a la souris (design pass ecran 3).
  const badgesMesures = await page.$$eval('#gearBody [data-mes]',
    e => e.map(x => ({ hint: x.dataset.hintText || '', tab: x.getAttribute('tabindex'), title: x.hasAttribute('title') })));
  dire(badgesMesures.every(b => b.hint.includes('valeur mesurée du projet')),
       'chaque pastille porte sa valeur de reference en data-hint-text');
  dire(badgesMesures.every(b => b.tab === '0'), 'et un tabIndex qui la rend joignable au clavier');
  dire(badgesMesures.every(b => !b.title), 'sans le title redondant');

  console.log('\n[12] un prereglage REMPLIT le panneau au lieu de le court-circuiter');
  const refiner = () => page.isChecked('#refiner');
  dire(await refiner(), '« Repasse de texture » est active au depart');
  await page.click('#qual button[data-q="rapide"]');
  await page.waitForTimeout(600);
  dire(!(await refiner()), '« Rapide » la coupe — et ca se VOIT dans le panneau');
  dire((await texte('#gearDiff')).includes('hors valeur mesurée'),
       `le compteur d ecarts le signale : « ${await texte('#gearDiff')} »`);
  await page.click('#btnReset');
  await page.waitForTimeout(500);
  dire(await refiner(), '« Valeurs mesurées » remet tout en place');
  dire((await texte('#gearDiff')) === '', 'et le compteur repart a zero');

  console.log('\n[13] DEUX boutons, UN panneau');
  dire(await vu(PANNEAU), 'le panneau est ouvert');
  await page.click('#btnGear');
  await page.waitForTimeout(300);
  dire(!(await vu(PANNEAU)), "l'engrenage de la barre le referme");
  dire(!(await page.isDisabled('#railGear')), "l'engrenage du RAIL est actif sur Produire");
  await page.click('#railGear');
  await page.waitForTimeout(300);
  dire(await vu(PANNEAU), 'et il ouvre LE MEME panneau');
  await page.click('#railGear');
  await page.waitForTimeout(300);

  console.log('\n[14] le curseur d intensite dit ce que chaque cran FAIT');
  const crans = await page.$$eval('#intSel button', e => e.map(x => x.textContent.trim()));
  dire(crans.length >= 3, `${crans.length} crans : ${crans.join(' · ')}`);
  dire(/exportable|hors export/.test(await texte('#intHint')),
       `le cran courant dit s il exporte : « ${await texte('#intHint')} »`);
  // §A1 : le fragment de prompt du palier actif, s'il y en a un, se lit
  // desormais dans cette meme ligne visible — plus seulement au survol.
  const sansTitleIntensite = await page.$$eval('#intSel button', e => e.every(x => !x.hasAttribute('title')));
  dire(sansTitleIntensite, 'aucun bouton de palier ne porte plus le title redondant');
  const hintActif = await texte('#intHint');
  if (hintActif.includes('ajoute :')){
    dire(true, `le palier actif dit aussi ce qu il ajoute au prompt (« ${hintActif} »)`);
  } else {
    console.log(`      (le palier actif n ajoute rien au prompt : « ${hintActif} »)`);
  }
  const edit = await page.$('#intSel button[data-edit]');
  if (edit){
    await edit.click();
    await page.waitForTimeout(1500);
    // un palier `requires:confirm` ouvre une confirmation : on la valide, elle
    // ne produit rien — elle ne fait que changer le cran affiche
    if (await vu('#armBox[open]')){
      await page.click('#cfOui');
      await page.waitForTimeout(1200);
    }
    dire(await vu('#intMode'), 'au cran qui EDITE, une pastille metier apparait');
    dire((await texte('#intMode')).includes("n'engendre rien"),
         "elle dit que le cran n'engendre rien");
    dire(await vu('#stepSource'), 'le bloc « Image source » remplace les intentions');
    dire(!(await vu('#railIntent')), 'le rail Intention/Ton disparait — rien a y choisir sur ce cran');
    // screen-3-produire §S : plus de pas-a-pas numerote sur ce cran — la
    // grille de sources est le hero, l'instruction est LE panneau, verifie
    // en detail a la section [15].
    dire(!(await vu('#stepSource h2 [data-num]')), "« Image source » n'est plus numerotee");
    dire(await inerte(), '« Éditer » est inerte tant que rien n est coche');
    dire(await page.isDisabled('#qual button[data-q="rapide"]'),
         "les prereglages qui coupent la repasse sont inertes ici");
    // le panneau a ete referme en [11] : on le rouvre pour lire ses sections
    await page.click('#btnGear');
    await page.waitForSelector(PANNEAU);
    dire(await vu('#gearBody [data-rgs][data-niveau="edit"]'),
         'la section NSFW du panneau apparait a ce cran');
    dire(await page.isDisabled('#noqc'),
         "« Sans contrôle d'identité » est inerte ici : le cran s'appuie sur le verdict");
    dire(((await page.getAttribute('#noqc', 'title')) || '').includes('NSFW'),
         'et il DIT pourquoi');
    await page.click('#btnGear');
    await page.waitForTimeout(250);
  } else {
    console.log("      (aucun cran d'edition : personnage desarme ou pack sans graphe)");
  }

  console.log('\n[15] LE PANNEAU DE DROITE bascule sur l instruction d edition (design pass ecran 3, §S)');
  dire(!(await vu('#inspector')), "l'inspecteur n'existe plus sur ce cran — EditStep le remplace");
  dire(await vu('#stepEdit'), "le panneau d'instruction est la, a droite");
  dire((await texte('#stepEdit h2')).includes("Instruction d'édition"), 'et dit ce qu il est');
  dire(!(await vu('#stepEdit h2 [data-num]')),
       "sans numero d'etape — ce n'est plus un pas parmi d'autres, c'est LE panneau");
  dire(await vu('#editInstr'), "le champ d'instruction est utilisable depuis le panneau");

  const nSources = await page.$$eval('#srcGrid [data-src]', e => e.length);
  if (nSources > 0){
    dire(await vu('#btnAllSources'), 'Tout cocher/décocher est proposé (§B2)');
    await page.click('#btnAllSources');
    await page.waitForTimeout(200);
    const cochees = await page.$$eval('#srcGrid [data-src][aria-pressed="true"]', e => e.length);
    dire(cochees === nSources, `Tout cocher coche vraiment les ${nSources} source(s)`);
    dire((await texte('#btnAllSources')) === 'Tout décocher', 'et le bouton change de libellé');
    await page.click('#btnAllSources');
    await page.waitForTimeout(200);
    const decochees = await page.$$eval('#srcGrid [data-src][aria-pressed="true"]', e => e.length);
    dire(decochees === 0, 'Tout décocher les retire toutes');
  } else {
    console.log('      (aucune image source à ce niveau, §B2 non exercé)');
  }

  console.log('\n[16] rien n a ete lance');
  const fin = await compteurs();
  dire(JSON.stringify(fin) === JSON.stringify(depart),
       `les dossiers sont intacts : ${JSON.stringify(fin)}`);

  console.log('\n[17] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
