/* Browser smoke test of the REACT wizard « nouveau personnage » (#wizard).

   THIS TEST CREATES NOTHING. It never clicks « Créer », uploads nothing and
   starts no generation. It checks the MECHANICS of the walk — the gating at each
   step — not production. That is what makes it runnable against the real
   registry.

   WHAT IT HOLDS:

     1. The four steps in order, with a stepper that says where one is.
     2. GATING. « Suivant » only arms on the right condition, at each step, and
        « Créer » only when every one of them is met AND the identity fields are
        valid. Nothing is created half-chosen.
     3. The identifier is validated as it is typed, with the same expression the
        server uses — an invalid slug is said before the round trip.
     4. A type with a SINGLE style does not offer a choice: it says so. That is a
        real case in the registry, not a hypothesis.
     5. The three human axes are announced as FROZEN (CLAUDE.md §3, §8.8), and
        the pack is never among the questions — it is derived from (type, style)
        server-side (ADR-0012).
     6. Changing the identifier INVALIDATES the frozen base: it was written under
        the old one.
     7. The wizard is reachable from the identity menu and from the entry gate,
        the two places it is offered.

   PREREQUISITES: see test_journal.js — run_browser_tests.py does all of it. */
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
  const vu = s => page.isVisible(s).catch(() => false);
  const texte = s => page.textContent(s).catch(() => '');
  const suivantArme = async () => !(await page.isDisabled('#wizNext'));
  const etape = () => page.$eval('[data-step="on"]', e => e.textContent.replace(/^\d/, '').trim());
  const cartes = () => page.$$eval('#wizBody .it b', e => e.map(x => x.textContent));

  console.log('\n[1] le wizard s ouvre sur sa route, quatre etapes annoncees');
  await page.goto(BASE + '/characters/new', { waitUntil: 'networkidle' });
  dire(await vu('#wizard'), "l'ecran est monte");
  const pas = await page.$$eval('#wizSteps li', e => e.map(x => x.textContent.replace(/^\d/, '').trim()));
  dire(pas.join(' > ') === "Type > Style > Monde > Base d'identité",
       `les quatre etapes, dans l'ordre : ${pas.join(' > ')}`);
  dire(await etape() === 'Type', 'on demarre sur le Type');

  console.log('\n[2] GATING : rien ne passe sans choix');
  dire(!(await suivantArme()), '« Suivant » est inerte tant qu aucun type n est choisi');
  dire(await page.isDisabled('#wizBack'), '« Retour » aussi, a la premiere etape');
  // screen-1-wizard (03/09/2026) : le resume textuel de la barre de lancement
  // (#wizSumT) a disparu, remplace par le panneau "Fiche en construction",
  // visible en permanence plutot que relu seulement au moment de valider.
  dire((await texte('[data-field="type"]')).trim() === '—',
       'le panneau dit ce qui manque (placeholder), il ne se contente pas de refuser');

  console.log('\n[3] les types viennent du registre, avec leur famille de modele');
  const types = await cartes();
  dire(types.length >= 2, `${types.length} type(s) proposes : ${types.join(', ')}`);
  const familles = await page.$$eval('#wizBody .it span', e => e.map(x => x.textContent));
  dire(familles.every(f => f.startsWith('machine :')),
       'chaque type annonce la famille de modele de son pack');

  console.log('\n[4] choisir un type arme la suite, et lui seul');
  await page.click('#wizBody .it:first-child');
  await page.waitForTimeout(200);
  dire(await vu('#wizBody .it.on'), 'la carte choisie est marquee');
  // screen-1-wizard (03/09/2026) : motif radiogroup plutot qu'un bouton a
  // bascule independant — ces cartes forment un choix mutuellement exclusif.
  dire(await page.$eval('#wizBody .it.on', e => e.getAttribute('role')) === 'radio',
       'la carte est un vrai bouton radio (choix mutuellement exclusif)');
  dire(await page.$eval('#wizBody .it.on', e => e.getAttribute('aria-checked')) === 'true',
       'et elle le dit aussi a un lecteur d ecran');
  dire(await suivantArme(), '« Suivant » s arme');

  console.log('\n[5] etape Style : un type mono-style ne fait pas semblant de choisir');
  await page.click('#wizNext');
  await page.waitForTimeout(250);
  dire(await etape() === 'Style', "on est a l'etape Style");
  const noteStyle = await vu('[data-note]');
  if (noteStyle){
    const n = await texte('[data-note]');
    dire(n.includes("qu'un style"), 'un seul style : la note le dit au lieu d offrir une carte unique');
    dire(n.includes('fixé à la création'), 'et rappelle que le choix est fige');
    dire(await suivantArme(), 'le style unique est pris d office, « Suivant » reste arme');
  } else {
    dire(!(await suivantArme()), 'plusieurs styles : « Suivant » attend un choix');
    const bulle = await page.getAttribute('#wizBody .it', 'data-hint-text');
    dire((bulle || '').includes('autre personnage'),
         'chaque style porte la bulle « figé à la création »');
    await page.click('#wizBody .it:first-child');
    await page.waitForTimeout(150);
    dire(await suivantArme(), 'un style choisi arme la suite');
  }

  console.log('\n[6] etape Monde : figee elle aussi, et propre au type');
  await page.click('#wizNext');
  await page.waitForTimeout(250);
  dire(await etape() === 'Monde', "on est a l'etape Monde");
  dire(!(await suivantArme()), '« Suivant » attend un monde');
  const mondes = await cartes();
  dire(mondes.length >= 1, `${mondes.length} monde(s) pour ce type : ${mondes.join(', ')}`);
  const bulleMonde = await page.getAttribute('#wizBody .it', 'data-hint-text');
  dire((bulleMonde || '').includes('autre personnage'),
       'le monde porte la meme bulle : un autre choix = un autre personnage');
  await page.click('#wizBody .it:first-child');
  await page.waitForTimeout(150);
  dire(await suivantArme(), 'un monde choisi arme la suite');

  console.log('\n[7] le PACK n est jamais demande — il se deduit (ADR-0012)');
  const parcours = (await texte('#wizard')).toLowerCase();
  dire(!/choisis? (un |le )?pack|s[ée]lection.{0,12}pack/.test(parcours),
       'aucune etape ne fait choisir un pack');

  console.log('\n[8] etape Base : elle exige d abord un identifiant valide');
  await page.click('#wizNext');
  await page.waitForTimeout(250);
  dire((await etape()).includes('Base'), "on est a l'etape Base d'identité");
  dire((await texte('#wizBody')).includes('identifiant'),
       "sans identifiant, l'etape dit ce qu'elle attend au lieu d'echouer a l'envoi");
  dire(!(await vu('#wizGen')), "et n'offre ni envoi ni generation");

  console.log('\n[9] l identifiant est valide a la frappe');
  await page.fill('#wizCid', 'Bad Slug!');
  await page.waitForTimeout(150);
  dire((await texte('#wizCidHint')).includes('minuscules'),
       'un slug invalide est refuse, et dit la regle');
  dire(!(await vu('#wizGen')), "l'etape Base reste fermee");
  await page.fill('#wizCid', '9debut');
  await page.waitForTimeout(150);
  dire((await texte('#wizCidHint')).includes('minuscules'),
       'un identifiant qui commence par un chiffre est refuse aussi');
  await page.fill('#wizCid', '_fumigation_wizard');
  await page.waitForTimeout(150);
  dire((await texte('#wizCidHint')).includes('minuscules'),
       'et un qui commence par un souligne');
  await page.fill('#wizCid', 'fumigation-wizard');
  await page.waitForTimeout(200);
  dire((await texte('#wizCidHint')).includes('✓'), 'un slug valide est accepte');
  dire(await vu('#wizGen'), "l'etape Base s'ouvre alors");

  console.log('\n[10] la base est le VISAGE fige, et le dit');
  const base = await texte('#wizBody');
  dire(base.includes("verrou d'identité"), "elle annonce a quoi la base sert");
  dire(base.includes('jamais la photo') || base.includes('Personnage fictif'),
       'et rappelle qu un personnage est fictif — jamais une personne reelle');
  dire(await vu('#wizFile') === false, 'le champ de fichier est cache derriere son bouton');
  dire(await vu('label[for="wizFile"]'), 'et le bouton, lui, est la');

  console.log('\n[11] CREER reste inerte : rien n est fige, rien n a de nom');
  dire(!(await suivantArme()), '« Créer » est inerte sans base gelee');
  await page.fill('#wizName', 'Fumigation');
  await page.waitForTimeout(150);
  dire((await texte('#wizNext')).includes('Fumigation'),
       'le bouton nomme ce qu il creerait, il ne dit pas « OK »');
  dire(!(await suivantArme()), 'et reste inerte : le nom ne suffit pas, la base manque');

  console.log('\n[12] changer d identifiant invalide ce qui etait ecrit sous l ancien');
  // On ne peut pas geler de base sans GPU ; on verifie la regle en amont :
  // l'etape se REFERME des que l'identifiant redevient invalide.
  await page.fill('#wizCid', 'autre-slug');
  await page.waitForTimeout(200);
  dire(await vu('#wizGen'), "un autre identifiant valide garde l'etape ouverte");
  await page.fill('#wizCid', '!!');
  await page.waitForTimeout(200);
  dire(!(await vu('#wizGen')),
       "un identifiant invalide la referme : rien ne s'ecrit sous un nom qui n'existera pas");
  dire(!(await suivantArme()), '« Créer » est inerte');

  console.log('\n[13] revenir en arriere garde les choix deja faits');
  await page.click('#wizBack');
  await page.waitForTimeout(250);
  dire(await etape() === 'Monde', 'on revient sur Monde');
  dire(await vu('#wizBody .it.on'), 'le monde choisi est toujours marque');
  dire(await suivantArme(), 'et « Suivant » reste arme');

  console.log('\n[14] le wizard est offert la ou on le cherche');
  await page.goto(BASE + '/characters', { waitUntil: 'networkidle' });
  dire(await vu('[data-char-card][data-new]'), 'depuis le sas, une carte « + Nouveau personnage »');
  await page.click('[data-char-card][data-new]');
  await page.waitForTimeout(400);
  dire(await page.evaluate(() => location.pathname) === '/characters/new',
       'elle mene bien au wizard');
  await page.goto(BASE + '/character?character=lena', { waitUntil: 'networkidle' });
  await page.click('#btnId');
  await page.waitForSelector('#idMenu.on');
  dire((await texte('#idMenu')).includes('Nouveau personnage'),
       "et le menu d'identite l'offre aussi");

  console.log('\n[15] aucun personnage n a ete cree');
  const registre = await page.evaluate(async () =>
    (await (await fetch('/api/characters')).json()).characters.map(c => c.id));
  dire(!registre.some(id => /fumigation|autre-slug/.test(id)),
       `le registre est intact : ${registre.join(', ')}`);

  console.log('\n[16] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
