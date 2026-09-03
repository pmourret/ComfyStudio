/* Browser smoke test of the pose EDITOR — point-by-point correction, distinct
   from test_pose_extract.js (extraction from a photo). No ComfyUI needed: the
   rendered PNG is pure local drawing (pose_render.py), so this test runs even
   with ComfyUI offline — unlike its extraction sibling.

   Covers, in order: the "+ Nouvelle pose" MODAL (name + template, 2026-09-02
   — no more full-screen picker) → canvas → drag → keyboard nudge → save → the
   bank picks it up → reached again via its OWN "editer" link (not just the
   post-save redirect) → a pose from BEFORE this feature existed (no JSON
   sidecar) fails softly, not with a crash → usable from the scene composer's
   Pose tab modal, without leaving the scene.

   IT CLEANS UP. The pose it creates is removed through the interface at the
   end; the bank is checked to be back to its starting list — the same guard
   as test_pose_extract.js: only ever delete what THIS run created, then
   confirm nothing else moved. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1500, height: 950 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const squelettes = () => page.$$eval('#poseGrid [data-pose-card]', e => e.map(x => x.dataset.n));
  // `[data-canvas]` distingue le canvas plein cadre (corps + 2 mains) des
  // deux panneaux mains en gros plan (2026-09-02) — les trois vivent sous
  // #poseEditor en meme temps, un simple `svg circle` compterait les trois.
  const circles = (canvas) => page.$$eval(`#poseEditor svg[data-canvas="${canvas}"] circle`, e => e.length);

  console.log('\n[1] la banque de poses propose "+ Nouvelle pose" — une modale, plus un ecran');
  await page.goto(BASE + '/bank/poses?character=lena', { waitUntil: 'networkidle' });
  await page.waitForSelector('#poseGrid');
  const avant = await squelettes();
  const boutonNeuf = await page.$('button:has-text("+ Nouvelle pose")');
  dire(Boolean(boutonNeuf), 'le bouton est present');
  await boutonNeuf.click();
  await page.waitForSelector('#newPoseBox[open]');
  dire((await page.evaluate(() => location.pathname)).startsWith('/bank/poses')
       && !(await page.evaluate(() => location.pathname)).includes('/edit'),
       'ouvrir la modale ne navigue PAS — toujours sur la banque');

  console.log('\n[2] la modale demande un nom et un gabarit — aucune photo, coordonnees inventees');
  // La liste des gabarits arrive par /api/pose/presets, apres le premier
  // rendu de la modale ("chargement…") — attendre le bouton lui-meme plutot
  // qu'un delai fixe, pour ne pas dependre de la vitesse du serveur de test.
  await page.waitForSelector('#newPoseBox button:has-text("Debout")');
  const gabarits = await page.$$eval('#newPoseBox button', e => e.map(x => x.textContent));
  dire(gabarits.some(t => (t || '').includes('Debout')), `le gabarit "Debout" est propose (${gabarits})`);
  dire(await page.isDisabled('#newPoseBox button:has-text("Créer")'),
       'Créer reste desactive tant qu aucun nom n est saisi');
  const NOM_POSE = 'Pose de test automatisé';
  await page.fill('#newPoseName', NOM_POSE);
  await page.click('#newPoseBox button:has-text("Debout")');
  dire(await page.isEnabled('#newPoseBox button:has-text("Créer")'), 'Créer s active une fois le nom saisi');
  await page.click('#newPoseBox button:has-text("Créer")');
  await page.waitForSelector('#poseEditor svg');
  await page.waitForTimeout(300);
  dire((await page.evaluate(() => location.pathname)) === '/bank/poses/edit',
       'la creation navigue vers l editeur (sans nom de pose dans l url, encore non enregistree)');

  console.log('\n[3] le squelette se dessine au complet (corps + 2 mains), et ses deux gros plans');
  dire(Boolean(await page.$('#poseEditor svg[data-canvas="full"]')), 'le canvas plein cadre est present');
  dire((await circles('full')) === 18 + 21 + 21, `18+21+21 joints geres sur le plein cadre (${await circles('full')})`);
  dire((await circles('handLeft')) === 21, `le panneau main gauche rend ses 21 joints (${await circles('handLeft')})`);
  dire((await circles('handRight')) === 21, `le panneau main droite rend ses 21 joints (${await circles('handRight')})`);

  console.log('\n[4] glisser un joint le deplace et arme "non enregistre"');
  const premier = await page.$('#poseEditor svg[data-canvas="full"] circle');
  const boite = await premier.boundingBox();
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  await page.mouse.move(boite.x + boite.width / 2 + 40, boite.y + boite.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  dire(Boolean(await page.$('text=modifications non enregistrées')),
       'le drapeau "modifications non enregistrees" apparait');

  console.log('\n[5] un joint selectionne se corrige aussi au clavier');
  // Regression 2026-09-02 : preventDefault() sur pointerdown annulait le focus
  // par defaut du navigateur -> les fleches ne trouvaient plus de cible. Le
  // drapeau "non enregistre" est deja arme par [4] : on verifie ici que le
  // joint bouge REELLEMENT (cx avance de 2px pour 2x ArrowRight), pas juste
  // que le drapeau reste leve.
  const autreJoint = (await page.$$('#poseEditor svg[data-canvas="full"] circle'))[5];
  const cxAvant = await autreJoint.getAttribute('cx');
  const jbox = await autreJoint.boundingBox();
  await page.mouse.click(jbox.x + jbox.width / 2, jbox.y + jbox.height / 2);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const cxApres = await autreJoint.getAttribute('cx');
  dire(Number(cxApres) === Number(cxAvant) + 2,
       `2x fleche droite avance le joint de 2px (${cxAvant} -> ${cxApres})`);

  console.log('\n[5bis] a11y (design pass ecran 6, §A1) : selection clavier des joints');
  const stroke = (loc) => loc.evaluate((el) => getComputedStyle(el).stroke);
  const tousJoints = await page.$$('#poseEditor svg[data-canvas="full"] circle');
  const jointA = tousJoints[6];
  const jointB = tousJoints[7];
  await jointA.evaluate((el) => el.focus());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  dire((await stroke(page.locator('#poseEditor svg[data-canvas="full"] circle').nth(6))) === 'rgb(255, 255, 255)',
       'Entree selectionne le joint focus (meme semantique que le clic simple)');

  await jointB.evaluate((el) => el.focus());
  await page.keyboard.down('Control');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Control');
  await page.waitForTimeout(150);
  dire((await stroke(page.locator('#poseEditor svg[data-canvas="full"] circle').nth(6))) === 'rgb(255, 255, 255)'
       && (await stroke(page.locator('#poseEditor svg[data-canvas="full"] circle').nth(7))) === 'rgb(255, 255, 255)',
       'Ctrl+Entree AJOUTE a la selection (meme semantique que Ctrl+clic), ne la remplace pas');

  await jointB.evaluate((el) => el.focus());
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  dire((await stroke(page.locator('#poseEditor svg[data-canvas="full"] circle').nth(6))) === 'none'
       && (await stroke(page.locator('#poseEditor svg[data-canvas="full"] circle').nth(7))) === 'rgb(255, 255, 255)',
       'Espace REMPLACE la selection (comme un clic simple), pas de scroll de page declenche');

  console.log('\n[5bis2] a11y (design pass ecran 6, §A3/§A4) : nom + position + epingle annonces');
  const label7 = await jointB.getAttribute('aria-label');
  dire(Boolean(label7) && / — x -?\d+, y -?\d+/.test(label7),
       `le joint porte son nom et sa position (« ${label7} »)`);
  await page.locator('button:has-text("Épingler")').first().click();
  await page.waitForTimeout(150);
  const label7Pinned = await jointB.getAttribute('aria-label');
  dire(Boolean(label7Pinned) && label7Pinned.includes('épinglé'),
       `l'etat epingle rejoint le label (« ${label7Pinned} »)`);
  // La ligne de l'outliner correspondant au MEME joint (7e de la liste
  // "Corps", ordre BODY_JOINT_NAMES) porte le meme etat, pas seulement le
  // glyphe 📌 aria-hidden.
  const rangeeVisible = page.locator('aside button.btn.sm.justify-start[aria-pressed="true"]').first();
  dire(await rangeeVisible.count() > 0, "l'outliner porte au moins une ligne selectionnee");
  const ariaLabelRangee = await rangeeVisible.getAttribute('aria-label');
  dire(Boolean(ariaLabelRangee) && ariaLabelRangee.includes('épinglé') && ariaLabelRangee.includes('sélectionné'),
       `la ligne de l'outliner annonce nom + epingle + selectionne, pas que le glyphe (« ${ariaLabelRangee} »)`);
  await page.locator('button:has-text("Libérer")').first().click(); // desepingle, pour ne pas fausser [6]
  await page.waitForTimeout(150);

  console.log('\n[5ter] a11y (design pass ecran 6, §A2) : Ctrl+Z marche SANS clic prealable dans le canvas');
  const cxAvantDrag2 = await tousJoints[0].getAttribute('cx');
  const boite2 = await tousJoints[0].boundingBox();
  await page.mouse.move(boite2.x + boite2.width / 2, boite2.y + boite2.height / 2);
  await page.mouse.down();
  await page.mouse.move(boite2.x + boite2.width / 2 + 30, boite2.y + boite2.height / 2 + 10, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const cxApresDrag2 = await tousJoints[0].getAttribute('cx');
  dire(cxApresDrag2 !== cxAvantDrag2, 'le glisser deplace bien le joint (avant de tester l annulation)');
  dire(await page.evaluate(() => {
    const el = [...document.querySelectorAll('p,span')].find((e) => e.textContent === 'Modifications non enregistrées');
    return el?.getAttribute('role') === 'status';
  }), 'a11y §A5 : "Modifications non enregistrees" porte role=status');

  // Focus deplace vers un VRAI bouton du panneau, hors du canvas -- jamais
  // clique (aucun effet de bord), juste focus -- le scenario exact du
  // document : "cliquer Annuler/Retablir/Epingler/Miroir puis Ctrl+Z".
  await page.locator('button:has-text("Copier depuis la main droite")').first().focus();
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const cxApresUndo2 = await tousJoints[0].getAttribute('cx');
  dire(cxApresUndo2 === cxAvantDrag2,
       `Ctrl+Z annule sans avoir clique dans le canvas (${cxApresDrag2} -> ${cxApresUndo2}, attendu ${cxAvantDrag2})`);

  console.log('\n[5quater] les fleches dans un champ numerique ne nudgent pas le joint EN PLUS du champ lui-meme');
  // Le glisser de [5ter] a remplace la selection par le SEUL joint glisse
  // (tousJoints[0]) -- son panneau x/y est donc affiche. Taper dans le champ
  // x change legitimement cx (c'est son role) ; la question est de savoir si
  // la fleche Haut, une fois le focus dans ce champ, DEBORDE en plus vers le
  // nudge clavier du canvas (qui bouge cy, un axe que ce champ ne touche
  // jamais) -- exactement le risque que la garde de saisie de texte doit
  // couper avant qu'il atteigne handlePoseKeyDown.
  const champX = page.locator('label:has-text("x") input[type="number"]').first();
  if (await champX.count()) {
    const cyAvant = await tousJoints[0].getAttribute('cy');
    await champX.click();
    await page.keyboard.press('ArrowUp'); // pas natif du <input number>, jamais un nudge de joint
    await page.waitForTimeout(150);
    const cyApres = await tousJoints[0].getAttribute('cy');
    dire(cyApres === cyAvant,
         `la fleche dans le champ ne nudge pas le joint sur l'axe Y (garde de saisie de texte) (${cyAvant} -> ${cyApres})`);
  } else {
    console.log('      (champ x introuvable — selection differente, verification sautee)');
  }

  console.log('\n[5quinquies] a11y (design pass ecran 6, §A6) : repli motif de trait, hors couleur');
  const traitsCorps = await page.$$eval(
    '#poseEditor svg[data-canvas="full"] line',
    (els) => els.map((e) => e.getAttribute('stroke-dasharray')),
  );
  dire(traitsCorps.length >= 17, `au moins les 17 membres du corps sont dessines (${traitsCorps.length} traits)`);
  // Les 5 membres incidents au cou (joint 1, BODY_LIMBS[0,1,6,9,12]) : avec
  // seulement 3 motifs pour 5 membres, un doublon est mathematiquement
  // inevitable (nid de pigeon) -- mais pas plus qu'un doublon par motif
  // (regression du bug trouve en verifiant : le regroupement naif par
  // position dans le tableau en avait mis 4 sur le meme motif).
  const traitsCou = [0, 1, 6, 9, 12].map((i) => traitsCorps[i]);
  const occurrences = {};
  for (const t of traitsCou) occurrences[t] = (occurrences[t] || 0) + 1;
  const pireCollision = Math.max(...Object.values(occurrences));
  dire(pireCollision <= 2,
       `au cou (5 membres, 3 motifs), aucun motif ne se repete plus de 2 fois (${JSON.stringify(traitsCou)})`);
  dire(traitsCorps.some((t) => t !== traitsCorps[0]),
       'les membres du corps ne portent pas tous le meme motif');
  const traitsMainD = await page.$$eval(
    '#poseEditor svg[data-canvas="handRight"] line',
    (els) => els.map((e) => e.getAttribute('stroke-dasharray')),
  );
  dire(traitsMainD.length === 20, `la main droite dessine ses 20 aretes (${traitsMainD.length})`);
  dire(traitsMainD[0] === traitsMainD[1] && traitsMainD[1] === traitsMainD[2] && traitsMainD[2] === traitsMainD[3],
       `les 4 aretes du pouce partagent le meme motif, pas un motif par arete (${traitsMainD.slice(0, 4)})`);
  dire(traitsMainD[0] !== traitsMainD[4],
       `le pouce et l'index n'ont pas le meme motif (${traitsMainD[0]} vs ${traitsMainD[4]})`);

  console.log('\n[5sexies] capacite (design pass ecran 6, §B1) : lecture angle/longueur EN DIRECT pendant le drag');
  const texteFlottant = () => page.$eval(
    '#poseEditor svg[data-canvas="full"] text', (el) => el.textContent,
  ).catch(() => null);
  dire(!(await texteFlottant()), 'aucun texte flottant avant tout glisser');
  // tousJoints[3] = Relb (a un parent, Rsho) ; tousJoints[1] = neck (racine,
  // aucun parent -- rien a mesurer).
  const boiteRelb = await tousJoints[3].boundingBox();
  await page.mouse.move(boiteRelb.x + boiteRelb.width / 2, boiteRelb.y + boiteRelb.height / 2);
  await page.mouse.down();
  await page.mouse.move(boiteRelb.x + boiteRelb.width / 2 + 60, boiteRelb.y + boiteRelb.height / 2 + 40, { steps: 8 });
  await page.waitForTimeout(80);
  const texteEnCours = await texteFlottant();
  dire(Boolean(texteEnCours) && /-?\d+° · \d+px/.test(texteEnCours),
       `le texte flottant affiche angle/longueur pendant le glisser (« ${texteEnCours} »)`);
  await page.mouse.up();
  await page.waitForTimeout(150);
  dire(!(await texteFlottant()), 'le texte flottant disparait au relachement');
  // La lecture affichee pendant le drag doit correspondre a celle, apres
  // coup, du panneau lateral pour le MEME joint -- pas juste "un texte
  // apparait", la bonne valeur.
  const texteInspecteur = await page.evaluate(() => {
    const p = [...document.querySelectorAll('aside p.tiny')].find((e) => /° · \d+px/.test(e.textContent || ''));
    return p ? p.textContent.trim() : null;
  });
  dire(Boolean(texteInspecteur) && texteInspecteur.startsWith(texteEnCours),
       `la valeur pendant le drag correspond a celle de l'inspecteur apres coup (« ${texteEnCours} » vs « ${texteInspecteur} »)`);

  const boiteCou = await tousJoints[1].boundingBox();
  await page.mouse.move(boiteCou.x + boiteCou.width / 2, boiteCou.y + boiteCou.height / 2);
  await page.mouse.down();
  await page.mouse.move(boiteCou.x + boiteCou.width / 2 + 40, boiteCou.y + boiteCou.height / 2 + 20, { steps: 5 });
  await page.waitForTimeout(80);
  dire(!(await texteFlottant()), 'glisser la racine (aucun parent a mesurer) ne montre aucun texte flottant');
  await page.mouse.up();
  await page.waitForTimeout(150);

  console.log('\n[6] sauvegarde — redirige vers la pose reellement ecrite');
  await page.click('button:has-text("Enregistrer")');
  await page.waitForFunction(() => location.pathname.includes('/bank/poses/edit/'), null, { timeout: 5000 });
  const nouveau = decodeURIComponent(new URL(page.url()).pathname.split('/').pop());
  dire(nouveau.startsWith('pose__') && nouveau.endsWith('.png'), `nom recu : ${nouveau}`);
  dire((await page.textContent('aside b')).trim() === NOM_POSE,
       'le panneau affiche le nom saisi dans la modale, pas le nom de fichier');

  console.log('\n[7] la banque la montre, AVEC son propre lien "editer"');
  await page.click('a:has-text("Retour à la banque")');
  await page.waitForSelector('#poseGrid');
  await page.waitForTimeout(300);
  const apres = await squelettes();
  dire(apres.includes(nouveau), 'la nouvelle pose est dans la banque');
  // 2026-09-02 : "editer" est passe derriere le menu « ⋯ » de la carte
  // (un seul declencheur pour editer/dupliquer/renommer/retirer).
  await page.click(`[data-pose-card][data-n="${nouveau}"] [data-pose-menu]`);
  await page.waitForSelector(`[data-pose-card][data-n="${nouveau}"] [role="menu"]`);
  const lienEditer = await page.$(`[data-pose-card][data-n="${nouveau}"] [role="menu"] a:has-text("éditer")`);
  dire(Boolean(lienEditer), 'sa carte porte un lien "editer"');
  await lienEditer.click();
  await page.waitForSelector('#poseEditor svg');
  dire((await page.textContent('aside b')).trim() === NOM_POSE,
       'suivre ce lien (pas juste la redirection de sauvegarde) rouvre la meme pose, avec son nom');

  console.log('\n[8] une pose SANS points-cles (anterieure a cette fonctionnalite) echoue sans crash');
  // Pas de nouvelle pose sans JSON dans ce test : on cherche parmi celles
  // deja en banque une qui n'a VRAIMENT pas de sidecar (2026-09-02 : toute
  // extraction en ecrit un desormais, donc « plus vieille que nouveau » ne
  // suffit plus a le garantir — verifie via l'API plutot que suppose).
  let sansPoints = null;
  for (const n of avant.filter(x => x !== nouveau)) {
    const dispo = await page.evaluate(
      async (name) => (await fetch(`/api/pose/keypoints?name=${encodeURIComponent(name)}&character=lena`)).ok,
      n,
    );
    if (!dispo) { sansPoints = n; break; }
  }
  if (sansPoints) {
    await page.goto(BASE + `/bank/poses/edit/${encodeURIComponent(sansPoints)}?character=lena`,
                     { waitUntil: 'networkidle' });
    await page.waitForSelector('#poseEditor');
    await page.waitForTimeout(400);
    dire(!(await page.$('#poseEditor svg')), 'pas de canvas affiche');
    dire((await page.textContent('.empty')).length > 0, 'un message explicite remplace le crash');
  } else {
    console.log('   (ignore — aucune pose sans sidecar en banque pour ce cas)');
  }

  console.log('\n[9] modale depuis le compositeur : editable sans quitter la scene');
  await page.goto(BASE + '/bank/scenes?character=lena', { waitUntil: 'networkidle' });
  await page.click('[data-scene-card]');
  await page.waitForSelector('#sceneInspector');
  await page.click('[data-tab="pose"]');
  await page.waitForSelector('[data-tabpanel="pose"]');
  const vignette = await page.$(`[data-tabpanel="pose"] button[title="${nouveau}"]`);
  dire(Boolean(vignette), 'la pose creee est choisissable dans le compositeur');
  await vignette.click();
  await page.waitForTimeout(200);
  const crayon = await page.$('[data-tabpanel="pose"] button[aria-label*="point par point"]');
  dire(Boolean(crayon), 'un bouton crayon apparait une fois la pose choisie');
  await crayon.click();
  await page.waitForSelector('#poseEditorModal[open]');
  await page.waitForTimeout(400);
  dire(Boolean(await page.$('#poseEditorModal svg')), 'la modale rend le meme canvas');
  await page.click('#poseModalClose');
  await page.waitForTimeout(200);
  dire(!(await page.isVisible('#poseEditorModal[open]')), 'fermer la modale ne quitte pas la scene');
  dire((await page.evaluate(() => location.pathname)).startsWith('/bank/scenes'), 'toujours sur la scene');

  console.log('\n[10] NETTOYAGE : seule la pose creee ici est retiree');
  await page.click('#bankView [data-vue="poses"]');
  await page.waitForSelector('#poseGrid');
  await page.click(`[data-pose-card][data-n="${nouveau}"] [data-pose-menu]`);
  await page.waitForSelector(`[data-pose-card][data-n="${nouveau}"] [role="menu"]`);
  await page.click(`[data-pose-card][data-n="${nouveau}"] [role="menu"] [data-del]`);
  await page.waitForSelector('#armBox[open]');
  await page.click('#cfOui');
  await page.waitForTimeout(800);
  const final = await squelettes();
  dire(!final.includes(nouveau), 'la pose creee par ce test a disparu');
  dire(final.length === avant.length && final.every(n => avant.includes(n)),
       `la banque est revenue a son etat de depart (${final.length} squelette(s))`);

  console.log('\n[11] aucune erreur JS reelle sur tout le parcours');
  /* [8] fait volontairement echouer une requete (pose sans sidecar -> 404) :
     c'est le comportement VERIFIE, pas un incident. Chromium journalise toute
     reponse 4xx comme une erreur de console (meme test_application.js). */
  const reelles = erreurs.filter(e => !/Failed to load resource.*404/.test(e));
  dire(reelles.length === 0, `${reelles.length} erreur(s)`);
  reelles.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
