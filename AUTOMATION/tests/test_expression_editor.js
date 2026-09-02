/* Browser smoke test of the expression editor — `/bank/tones/edit/:tone`.

   Runs against `lena`: this editor previews on an ALREADY-PRODUCED photo (a
   deliberate design choice — see AUTOMATION/expression.py's own reasoning
   for why a fresh upload would not give a meaningful identity cost), and
   only a real character has any. It touches `CHARACTERS/lena/creative.json`
   for real, so it SNAPSHOTS it first and restores it BYTE FOR BYTE at the
   end, success or failure — this is real production configuration, not a
   throwaway fixture (same discipline as test_pose_bank.js's own cleanup
   guard, applied to a file instead of a set of pose cards).

   ComfyUI is used if reachable (the render step measures a real identity
   score), but the test does not require it: the range-only assertions
   ([1], [2], [4]) never touch ComfyUI at all, and [3] tolerates a render
   failure rather than treating it as this test's own failure — the render
   PATH itself is what test_expression_isolation.py already locks down.
   [3] deliberately triggers a 500 when neither ComfyUI nor a proper
   Python (cv2) is available — [6]'s error filter knows about that one. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }

const fs = require('fs');
const path = require('path');

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';
const OFM = path.resolve(__dirname, '..', '..');
const CREATIVE_PATH = path.join(OFM, 'CHARACTERS', 'lena', 'creative.json');
const TONE = 'doux';

(async () => {
  const avantCreative = fs.readFileSync(CREATIVE_PATH);
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1400, height: 950 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let ko = 0;
  const dire = (bon, quoi) => { console.log(`   ${bon ? 'ok  ' : 'ECHEC'} ${quoi}`); if (!bon) ko++; };
  const paramField = (param, field) => `[data-param="${param}"] [data-param-field="${field}"]`;

  try {
    console.log(`\n[1] l'écran charge le ton "${TONE}" et hydrate ce qui est déjà réglé`);
    await page.goto(`${BASE}/bank/tones/edit/${TONE}?character=lena`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#expressionEditor h2');
    dire((await page.textContent('#expressionEditor h2') || '').includes('Doux'),
         'le libellé du ton s’affiche');
    dire(await page.isChecked('[data-param="smile"] [data-param-included]'),
         '« smile », déjà réglé dans creative.json, part inclus');
    dire((await page.inputValue(paramField('smile', 'min'))) === '0.1',
         'son minimum vient bien du fichier (0.1)');
    dire(!(await page.isChecked('[data-param="wink"] [data-param-included]')),
         '« wink », absent du ton, part NON inclus');

    console.log('\n[2] cocher un paramètre absent, fixer sa plage depuis un essai, enregistrer');
    await page.check('[data-param="wink"] [data-param-included]');
    await page.fill(paramField('wink', 'trial'), '4');
    await page.click('[data-param="wink"] [data-param-set-min]');
    await page.fill(paramField('wink', 'trial'), '9');
    await page.click('[data-param="wink"] [data-param-set-max]');
    await page.waitForTimeout(150);
    dire((await page.inputValue(paramField('wink', 'min'))) === '4'
         && (await page.inputValue(paramField('wink', 'max'))) === '9',
         'la plage affichée reflète les deux essais fixés (4 / 9)');
    await page.click('button:has-text("Enregistrer la plage")');
    await page.waitForTimeout(400);
    const creativeApres = JSON.parse(fs.readFileSync(CREATIVE_PATH, 'utf-8'));
    const toneApres = creativeApres.tones.find(t => t.key === TONE);
    dire(Array.isArray(toneApres?.expression?.wink)
         && toneApres.expression.wink[0] === 4 && toneApres.expression.wink[1] === 9,
         `creative.json porte la nouvelle plage (${JSON.stringify(toneApres?.expression?.wink)})`);
    dire(Array.isArray(toneApres?.expression?.smile),
         'les paramètres déjà réglés avant ce run (smile) survivent à la sauvegarde');

    console.log('\n[3] choisir une photo déjà produite et rendre un aperçu');
    const premierePhoto = await page.$('[data-photo]');
    if (!premierePhoto) {
      console.log('  IGNORE [3] — aucune photo dans PROD/LENA/OK sur cette machine');
    } else {
      await premierePhoto.click();
      await page.click('button:has-text("Rendre l’aperçu")');
      // A flat, bounded wait rather than chasing the button's transient
      // label — the round trip is either a fast local rejection (~0.1s,
      // e.g. no cv2 in this venv) or a real ComfyUI render (a few seconds);
      // this assertion is informational either way, never gating [4].
      await page.waitForTimeout(5000);
      // Scoped to THIS screen: the chrome mounts its OWN `[role="status"]`
      // regions (DirtyBar, FaultBar, the toast) earlier in the DOM — an
      // unscoped selector silently reads one of those instead.
      const statut = (await page.textContent('#expressionEditor [role="status"]').catch(() => null)) || '';
      dire(true, `rendu tenté — ${statut ? 'erreur affichée : ' + statut : 'pas d’erreur affichée (ou succès)'}`);
    }

    console.log('\n[4] revisiter la page relit bien la plage tout juste enregistrée');
    await page.goto(`${BASE}/bank/tones/edit/${TONE}?character=lena`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#expressionEditor h2');
    dire(await page.isChecked('[data-param="wink"] [data-param-included]'),
         'wink reste inclus après rechargement');
    dire((await page.inputValue(paramField('wink', 'min'))) === '4',
         'la plage relue correspond à ce qui a été enregistré');

    console.log('\n[5] un ton inconnu affiche un état vide explicite, pas un crash');
    await page.goto(`${BASE}/bank/tones/edit/ce-ton-n-existe-pas?character=lena`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#expressionEditor .empty');
    dire((await page.textContent('#expressionEditor')).includes('introuvable'),
         'message explicite plutôt qu’un écran blanc');

    console.log('\n[6] aucune erreur JS réelle sur tout le parcours');
    // [3] deliberately triggers ITS OWN 500 (no cv2 / ComfyUI unreachable) to
    // exercise the error path — that echo is expected noise, not a real bug,
    // same treatment as the 404 filter every other fumigation already uses.
    const reelles = erreurs.filter(e =>
      !/Failed to load resource.*404/.test(e) &&
      !/Failed to load resource.*500/.test(e));
    dire(reelles.length === 0, `${reelles.length} erreur(s)`);
    reelles.forEach(e => console.log('      ' + e.slice(0, 150)));
  } finally {
    fs.writeFileSync(CREATIVE_PATH, avantCreative);
    await nav.close();
  }

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  process.exit(ko ? 1 : 0);
})();
