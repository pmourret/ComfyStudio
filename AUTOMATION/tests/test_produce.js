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
  await page.waitForSelector('#intentGrid .it');
  const depart = await compteurs();
  console.log(`      ${JSON.stringify(depart)}`);

  console.log('\n[1] le parcours est LINEAIRE : un bloc, une decision');
  dire(await vu('#stepIntent'), 'le bloc 1 (Intention) est la');
  dire(!(await vu('#stepTone')), "le bloc 2 (Ton) n'existe pas encore");
  dire(!(await vu('#stepScenes')), "le bloc 3 (Scènes) non plus");
  dire(await inerte(), '« Générer » est inerte');
  dire((await texte('#sumT')).includes('choisis une intention'),
       'la barre dit ce qui manque, elle ne se contente pas de refuser');

  console.log('\n[2] les intentions VIDES ne restent pas grisees en tete de grille');
  const pleines = await page.$$eval('#intentGrid .it b', e => e.map(x => x.textContent));
  dire(pleines.length > 0, `${pleines.length} intention(s) peuplee(s) : ${pleines.join(', ')}`);
  dire(pleines.includes('Toutes'), '« Toutes » est proposee avec les autres');
  if (await vu('#intentVides')){
    const vides = await page.$$eval('#intentVideGrid .it b', e => e.map(x => x.textContent));
    dire((await texte('#intentVides [data-sep]')).includes('à peupler'),
         `les vides passent sous un separateur (${vides.join(', ')})`);
    dire(await page.$eval('#intentVideGrid .it span:last-child', e => e.textContent) === 'en composer une',
         'et proposent d aller en composer une');
  } else {
    console.log('      (aucune intention vide dans cette banque)');
  }

  console.log('\n[3] choisir une intention ouvre la suite, et elle seule');
  await page.click('#intentGrid .it');
  await page.waitForTimeout(400);
  dire(await vu('#stepTone'), 'le bloc Ton apparait');
  dire(await vu('#stepScenes'), 'le bloc Scènes aussi');
  dire((await texte('#stepTone h2 [data-num]')) === '2', 'numerote 2');
  dire((await texte('#stepScenes h2 [data-num]')) === '3', 'et 3');
  dire(await inerte(), '« Générer » reste inerte : aucune scène cochée');
  dire((await texte('#sumT')).includes('sélectionne au moins une scène'), 'et le dit');

  console.log('\n[4] PIEGE §5.6-3 : le bouton suit le PLAN, sans clignoter');
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

  console.log('\n[5] PIEGE §5.6-2 : /api/plan est rejoue a la frappe, mais debounce');
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

  console.log('\n[6] L APERCU montre le prompt REELLEMENT envoye');
  await page.waitForTimeout(600);
  const frags = await page.$$eval('#apFrags [data-source]', e => e.map(x => x.textContent.trim()));
  dire(frags.length >= 3, `${frags.length} fragments, avec leur source : ${frags.join(' · ')}`);
  const parts = await page.$$eval('#apFrags [data-part]', e => e.map(x => x.textContent.trim()));
  dire(parts.every(p => /%$/.test(p)), `chacun avec sa part (${parts.join(' ')})`);
  dire(await vu('#apFrags [data-fragment][data-own]'),
       "la scène — le seul fragment que l'utilisateur ecrit — est distinguee");
  dire(/\d+ caractères/.test(await texte('#apMeta')), `l'en-tete compte : « ${await texte('#apMeta')} »`);

  console.log('\n[7] l amendement demande UNE scène, et le dit sinon');
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

  console.log('\n[8] LE PANNEAU DE REGLAGES : declaratif, et il dit ce qu il coute');
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

  console.log('\n[9] la pastille « mesuré » suit config.json');
  /* L'etat de la pastille se lit sur un ATTRIBUT, jamais dans son `class` :
     depuis le passage aux utilitaires, la chaine de classes contient des mots
     comme `outline-offset` — un `includes('off')` y serait vrai partout. */
  const mesures = await page.$$eval('#gearBody [data-mes]',
    e => e.map(x => x.hasAttribute('data-off')));
  dire(mesures.length > 0, `${mesures.length} pastille(s) « mesuré »`);
  dire(mesures.every(off => !off),
       'toutes allumees a l ouverture : le panneau part des valeurs mesurees');
  dire((await texte('#gearDiff')) === '', 'et le compteur d ecarts est vide');

  console.log('\n[10] un prereglage REMPLIT le panneau au lieu de le court-circuiter');
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

  console.log('\n[11] DEUX boutons, UN panneau');
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

  console.log('\n[12] le curseur d intensite dit ce que chaque cran FAIT');
  const crans = await page.$$eval('#intSel button', e => e.map(x => x.textContent.trim()));
  dire(crans.length >= 3, `${crans.length} crans : ${crans.join(' · ')}`);
  dire(/exportable|hors export/.test(await texte('#intHint')),
       `le cran courant dit s il exporte : « ${await texte('#intHint')} »`);
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
    dire(!(await vu('#stepIntent')), 'le bloc Intention disparait');
    dire((await texte('#stepSource h2 [data-num]')) === '1', 'la numerotation repart a 1');
    dire((await texte('#stepEdit h2 [data-num]')) === '2', 'et va jusqu a 2');
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

  console.log('\n[13] L INSPECTEUR montre du PASSE, et le dit');
  dire(await vu('#inspector'), 'la colonne de droite est la');
  dire((await texte('#insRole')).includes("pas l'aperçu du prochain run"),
       "elle dit qu'elle ne montre pas l'image a venir");
  const src = await texte('#insSrc');
  dire(/dernier batch|banque/.test(src) || src === '',
       `elle nomme sa source : « ${src || '(rien encore)'} »`);

  console.log('\n[14] rien n a ete lance');
  const fin = await compteurs();
  dire(JSON.stringify(fin) === JSON.stringify(depart),
       `les dossiers sont intacts : ${JSON.stringify(fin)}`);

  console.log('\n[15] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
