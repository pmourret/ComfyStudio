/* Browser smoke test of the REACT Application screen.

   Replaces three legacy fumigations at once: test_sondes_comfy (probe cadence
   and the single source), test_contenu_adulte (the arming ritual and its two
   conditions), and the Application half of
   test_application_suppression_editeur (lifecycle buttons).

   WHAT THIS TEST HOLDS:

     1. ONE CALL FOR TWO SURFACES. The banner and the Application gauges read the
        same /api/app/comfy/stats result. Two fetches would double the
        nvidia-smi spawns and could show two truths.
     2. THE PROBES HAVE THEIR OWN CADENCE, never the 1.5 s production tick, and
        they PAUSE on a hidden tab — the route queries ComfyUI over HTTP and
        spawns a subprocess.
     3. THE LIFECYCLE BUTTONS ARE REAL. Each opens a confirmation that states the
        consequence; this test opens them and ALWAYS cancels — confirming would
        kill the very server under test.
     4. « Décharger la mémoire » is inert when ComfyUI does not answer, AND SAYS
        WHY. The dashboard under test runs --no-comfy, so that is the real case.
     5. ADULT CONTENT HAS ONE GESTURE, HERE. Arming needs the word ARMER copied
        out — a wrong word is refused and said. TWO CONDITIONS, never one: a pack
        with no edit graph says so before the switch (Abyssiaelle / rpg-personnage
        is the real case).
     6. Nothing is armed or disarmed for real. The arming dialog is opened and
        cancelled, and the wrong-word attempt is REFUSED SERVER-SIDE — that is
        the assertion, and it writes nothing.

   NOT COVERED HERE: the three coupling traps of AUDIT §5.6. This screen shows no
   image (`v`), plans no run (/api/plan) and does not drive #btnRun.

   PREREQUISITES: see test_journal.js — run_browser_tests.py does all of it. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1500, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  // compte les appels de sonde : c'est la seule facon de voir qu'il n'y a
  // qu'UNE source pour les deux surfaces, et que la cadence se met en pause
  let sondes = 0;
  page.on('request', r => { if (r.url().includes('/api/app/comfy/stats')) sondes++; });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const vu = s => page.isVisible(s).catch(() => false);
  const texte = s => page.textContent(s).catch(() => '');

  console.log('\n[1] l ecran Application s ouvre sur sa route');
  await page.goto(BASE + '/app?character=lena', { waitUntil: 'networkidle' });
  dire(await vu('#appli'), "l'ecran est monte");
  dire(await page.evaluate(() => location.pathname) === '/app', 'chemin /app');
  const allume = await page.$$eval('.tabs .nav-item.on', e => e.map(x => x.dataset.s));
  dire(allume.join(',') === 'application', `l'entree Application est allumee (${allume})`);

  console.log('\n[2] les deux surfaces de sonde montrent LE MEME etat');
  /* `--no-comfy` veut dire « ne le demarre pas », pas « fais comme s'il etait
     absent » : selon la machine, ComfyUI repond ou non. Le test ne suppose donc
     PAS un etat — il exige que les deux surfaces racontent le MEME. */
  const enLigne = (await texte('#comfyEtat')).includes('en ligne');
  console.log(`      ComfyUI : ${enLigne ? 'en ligne' : 'hors ligne'} sur cette machine`);
  const jauges = await texte('#appli');
  dire(enLigne ? !jauges.includes('ComfyUI ne répond pas')
               : jauges.includes('ComfyUI ne répond pas'),
       'les jauges racontent le meme etat que le titre');
  if (!enLigne)
    dire(jauges.includes('vient du pilote') || jauges.includes('inconnue'),
         'hors ligne, elles disent ce qu on sait encore au lieu d un panneau vide');

  /* UNE SEULE SOURCE : la meme valeur, au pourcent pres, dans le bandeau et
     dans la jauge. Deux fetchs pourraient afficher deux verites. */
  const pctBandeau = await page.$$eval('.sonde-hd', els => Object.fromEntries(
    els.map(e => [/VRAM/.test(e.dataset.hintText) ? 'vram'
                : /vive/.test(e.dataset.hintText) ? 'ram' : 'temp',
                  parseInt(e.querySelector('b').textContent, 10)])));
  /* Cible des attributs data-*, pas des classes : depuis la migration Tailwind le
     style d'une jauge est porte par des utilitaires, et un nom de classe n'est
     plus un point d'accroche stable. `[data-gauge]` ne designe QUE les jauges,
     donc le filtre qui ecartait la ligne du pilote n'a plus lieu d'etre. */
  const pctJauge = await page.$$eval('[data-gauge]', els => Object.fromEntries(
    els.map(e => [
      e.querySelector('[data-gauge-title]').textContent.split('·')[0].trim().toLowerCase(),
      parseInt(e.querySelector('[data-gauge-value]').textContent.split('·').pop(), 10)])));
  const communes = Object.keys(pctJauge).filter(k => k in pctBandeau);
  if (communes.length){
    const ecart = Math.max(...communes.map(k => Math.abs(pctBandeau[k] - pctJauge[k])));
    dire(ecart <= 1, 'bandeau et jauges lisent le meme resultat ('
         + communes.map(k => `${k} ${pctBandeau[k]}%/${pctJauge[k]}%`).join(', ') + ')');
  } else {
    console.log('      (aucune sonde commune sur cette machine — accord non observable)');
  }

  console.log('\n[3] la cadence des sondes est propre, et une seule source');
  sondes = 0;
  await page.waitForTimeout(6200);
  // ecran ouvert : 2 s propres a l'ecran + 5 s du module = ~4 appels sur 6 s.
  // Deux surfaces independantes en feraient le double. La borne haute est ce
  // qui compte : elle echoue si quelqu'un rebranche une seconde source.
  dire(sondes >= 2 && sondes <= 7, `${sondes} appel(s) en 6 s — une seule source`);

  console.log('\n[4] onglet cache : la sonde se tait');
  /* Un chromium sans tete ne cache PAS une page parce qu'une autre passe
     devant : `document.hidden` y reste faux, et un test bati la-dessus
     verifierait le navigateur, pas le studio. On pose donc la valeur que le
     code LIT — meme API, et c'est exactement la garde a verifier :
     `if (pauseWhenHidden && document.hidden) return`. */
  const cacher = etat => page.evaluate(v => {
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => v});
    document.dispatchEvent(new Event('visibilitychange'));
  }, etat);
  await cacher(true);
  sondes = 0;
  await page.waitForTimeout(5200);
  dire(sondes === 0, `${sondes} appel(s) pendant que l'onglet est cache`);
  // au retour elle ne doit pas attendre un tour complet : les chiffres a
  // l'ecran sont ceux d'avant le passage en arriere-plan
  await cacher(false);
  await page.waitForTimeout(600);
  dire(sondes > 0, 'et elle reprend des le retour, sans attendre un tour complet');

  console.log('\n[5] « Décharger la mémoire » suit l etat, et dit pourquoi quand il refuse');
  const inerte = await page.isDisabled('#btnComfyUnload');
  const raison = (await page.getAttribute('#btnComfyUnload', 'title')) || '';
  dire(inerte !== enLigne,
       `ComfyUI ${enLigne ? 'en ligne' : 'hors ligne'} -> bouton ${inerte ? 'inerte' : 'actif'}`);
  // un grisage muet reste une invitation : s'il refuse, il DIT pourquoi
  dire(inerte ? raison.length > 0 : raison === '',
       inerte ? `il donne la raison : « ${raison} »` : 'actif, donc aucune raison a donner');

  console.log('\n[6] les boutons de cycle de vie confirment — et on ANNULE toujours');
  for (const [bouton, attendu] of [
    ['#btnAppRestart', 'Redémarrer le tableau de bord'],
    ['#btnAppStop', 'Arrêter le tableau de bord'],
    ['#btnComfyStop', 'Arrêter ComfyUI'],
    ['#btnComfyRestart', 'Redémarrer ComfyUI'],
  ]){
    await page.click(bouton);
    await page.waitForSelector('#armBox[open]');
    const t = await texte('#armBox h3');
    dire(t.includes(attendu), `${bouton} -> « ${t} »`);
    // ANNULATION SYSTEMATIQUE : confirmer couperait le serveur teste
    await page.click('#cfNon');
    await page.waitForTimeout(200);
    dire(!(await vu('#armBox[open]')), '   annulee');
  }

  console.log('\n[7] Echap annule aussi — la boite ne se referme pas sur un oui');
  await page.click('#btnAppStop');
  await page.waitForSelector('#armBox[open]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  dire(!(await vu('#armBox[open]')), 'Echap ferme la confirmation');
  dire(await vu('#appli'), "et l'ecran est toujours la : rien n'a ete envoye");

  console.log('\n[8] l arret de ComfyUI annonce ce que Windows ne sait pas faire');
  await page.click('#btnComfyStop');
  await page.waitForSelector('#armBox[open]');
  const corps = await texte('#armBox');
  dire(corps.includes('arrêt propre') || corps.includes('coupé net'),
       "la confirmation dit que le processus est coupe net");
  await page.click('#cfNon');
  await page.waitForTimeout(200);

  console.log('\n[9] contenu adulte : la section nomme SON personnage');
  dire((await texte('#nsfwQui')).includes('Léna'),
       "l'interrupteur est celui d'un personnage, et il le dit");
  dire(await vu('#btnNsfwOff'), 'Léna est armee : la section propose de desactiver');

  console.log('\n[10] desactiver confirme, dit que rien n est supprime — et on annule');
  await page.click('#btnNsfwOff');
  await page.waitForSelector('#armBox[open]');
  const off = await texte('#armBox');
  dire(off.includes('restent en place'), "elle dit que les images ne sont pas supprimees");
  await page.click('#cfNon');
  await page.waitForTimeout(250);
  dire(await vu('#btnNsfwOff'), 'annuler ne change rien : Léna est toujours armee');

  console.log('\n[11] DEUX CONDITIONS : un pack sans graphe le dit avant l interrupteur');
  await page.click('#btnId');
  await page.waitForSelector('#idMenu.on a[href*="abyssiaelle"]');
  await page.click('#idMenu a[href*="abyssiaelle"]');
  await page.waitForTimeout(900);
  dire((await texte('#nsfwQui')).includes('Abyssiaelle'), 'la section a suivi le personnage');
  dire(await vu('#btnNsfwOn'), 'Abyssiaelle est desarmee : la section propose d activer');
  dire(await vu('#nsfwManque'),
       "son pack n'a pas de graphe d'edition, et la section le dit AVANT l'interrupteur");
  dire((await texte('#nsfwManque')).includes('sans effet visible'),
       "elle dit ce que l'activation ferait — ou plutot ne ferait pas");

  console.log('\n[12] le rituel d armement : recopier le mot, pas un clic');
  await page.click('#btnNsfwOn');
  await page.waitForSelector('#armWord2');
  const rituel = await texte('#armBoxNsfw');
  dire(rituel.includes('ARMER'), 'la boite demande de recopier le mot ARMER');
  dire(rituel.includes('jamais exportées'), 'elle enonce les consequences reelles');
  // mot FAUX : le serveur refuse, et rien n'est ecrit sur le disque. C'est
  // l'assertion — ce test n'arme aucun personnage reel.
  await page.fill('#armWord2', 'oui');
  await page.click('#btnArm2');
  await page.waitForTimeout(700);
  dire((await texte('#toast')).includes('recopie exactement'),
       'un mot faux est refuse, et le dit');
  await page.click('#armClose');
  await page.waitForTimeout(250);
  dire(await vu('#btnNsfwOn'), "Abyssiaelle est restee desarmee : rien n'a ete ecrit");

  console.log('\n[13] le journal du serveur, et le renvoi vers celui des productions');
  dire(await vu('#appliLog'), 'le journal du serveur est present');
  dire((await page.$eval('#appliLog', e => e.textContent)) === '',
       'vide au demarrage — aucune action de cycle de vie dans cette session');
  const lien = await page.getAttribute('a.link[href="/app/journal"]', 'href');
  dire(lien === '/app/journal', 'le renvoi mene au journal des productions');

  console.log('\n[14] Apparence : la roue de fond repeint en direct, avertit pres d un verdict, et persiste');
  /* Tourne sur le personnage ACTIF a ce point du parcours (Abyssiaelle, depuis
     [11]) -- le mecanisme est le meme quel que soit le personnage (Phase 0b),
     donc aucune hypothese de nom ici. Reinitialise a la fin, meme discipline
     que [12] qui laisse Abyssiaelle desarmee : ce test ne doit laisser AUCUN
     personnage avec un theme personnalise derriere lui. */
  const cssVar = nom => page.evaluate(
    n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), nom);

  dire(await vu('#appearanceBox'), 'le panneau Apparence est present');
  const bgAvant = await cssVar('--bg');
  dire(await page.isDisabled('#btnAppearanceReset'),
       'Reinitialiser est inerte : rien n est encore personnalise');

  const roueFond = page.getByRole('slider', { name: 'Teinte du fond' });
  await roueFond.focus();
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const bgEnDirect = await cssVar('--bg');
  dire(bgEnDirect !== bgAvant && bgEnDirect !== '',
       `la roue de fond repeint --bg en direct (${bgAvant} -> ${bgEnDirect}), avant tout Enregistrer`);

  // 220° (defaut) -> ~140° : a 5° du verdict OK (145°, garde-fou du document)
  const roueAccent = page.getByRole('slider', { name: "Teinte de l'accent" });
  await roueAccent.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('PageDown');
  await page.waitForTimeout(150);
  dire(await vu('#appearanceVerdictWarning'),
       'pres d une teinte de verdict, le panneau avertit (jamais sur la roue de fond)');

  await page.click('#btnAppearanceSave');
  await page.waitForTimeout(500);
  dire((await texte('#toast')).includes('enregistr'), 'Enregistrer confirme');
  dire(!(await page.isDisabled('#btnAppearanceReset')),
       'Reinitialiser redevient actif : quelque chose EST enregistre');

  await page.reload({ waitUntil: 'networkidle' });
  const bgApresRechargement = await cssVar('--bg');
  dire(bgApresRechargement === bgEnDirect,
       `la personnalisation survit au rechargement (${bgApresRechargement})`);

  await page.click('#btnAppearanceReset');
  await page.waitForTimeout(500);
  dire((await texte('#toast')).includes('initialis'), 'Reinitialiser confirme');
  const bgFinal = await cssVar('--bg');
  dire(bgFinal === bgAvant, `de retour au theme de plateforme (${bgFinal})`);
  dire(await page.isDisabled('#btnAppearanceReset'), 'Reinitialiser redevient inerte');

  console.log('\n[15] aucune erreur JS sur tout le parcours');
  /* Le mot faux de [12] fait repondre 400 au serveur — c'est le comportement
     VERIFIE, pas un incident. Chromium journalise toute reponse 4xx comme une
     erreur de console : on retire celle-la, et rien d'autre. */
  const reelles = erreurs.filter(e => !/Failed to load resource.*40[03]/.test(e));
  dire(reelles.length === 0, `${reelles.length} erreur(s)`);
  reelles.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
