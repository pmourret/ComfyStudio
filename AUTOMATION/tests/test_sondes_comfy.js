/* Fumigation NAVIGATEUR des sondes mémoire / thermique (J8).

   CE QUE CE TEST VERROUILLE :

     1. Les sondes du BANDEAU ont leur cadence propre (5 s), jamais celle du
        tick de production (1,5 s). La route interroge ComfyUI en HTTP et lance
        `nvidia-smi` en sous-processus : la brancher au tick rejouerait le gel
        de boucle d'événements du 24/08 (/api/plan à 2005 ms). Elles se
        mettent aussi en pause quand l'onglet est caché.
     2. UN SEUL appel pour les deux surfaces : bandeau et écran Application
        lisent le même résultat. Deux fetchs doubleraient les spawns et
        pourraient afficher deux vérités.
     3. L'ORDRE et le séparateur : état du tableau de bord d'abord (Comfy),
        puis état de la machine (RAM, VRAM, T°C). Deux natures d'information,
        un trait entre les deux.
     4. Chaque sonde du bandeau est une ICÔNE + une valeur, et ce qu'elle
        mesure vit dans l'infobulle — au survol ET au focus clavier.
     5. LA DÉGRADATION, sur des réponses SIMULÉES pour être déterministe :
        - ComfyUI arrêté → la RAM disparaît (lui seul la connaît), mais VRAM et
          température restent : ce sont des faits de la MACHINE, et c'est quand
          ComfyUI est à l'arrêt qu'on veut savoir qui retient la VRAM ;
        - pas de `nvidia-smi` → pas de température, le reste tient ;
        - rien du tout → le bandeau est vide, jamais un « — » qui se lirait
          comme une panne.

   Les réponses sont simulées via page.route() : le test ne dépend donc pas de
   l'état de ComfyUI sur la machine, et il exerce les seuils (70 % / 90 %,
   72 °C / 83 °C) qu'une machine au repos ne présenterait jamais.

   PREREQUIS (hors du repo, qui n'a aucune dépendance) :
     1. python web/app.py --no-comfy --no-browser --port 8199
     2. playwright installé hors du repo ; NODE_PATH pointe sur son node_modules
     3. node tests/test_sondes_comfy.js */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }
const ORIGIN = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';

const GO = 1e9;
const PLEIN = {
  en_ligne: true, version: '0.26.0',
  ram: { total: 33.4 * GO, libre: 18.4 * GO, utilisee: 15 * GO },
  vram: { nom: 'cuda:0 RTX', total: 16 * GO, libre: 1.6 * GO, utilisee: 14.4 * GO,
          torch_reserve: 8 * GO },
  gpu: { nom: 'NVIDIA GeForce RTX 4070 Ti SUPER', vram_utilisee: 14.4 * GO,
         vram_totale: 16 * GO, temperature: 86, charge: 98, puissance: 285 },
};
const COMFY_KO = {
  en_ligne: false, ram: null, vram: null,
  gpu: { nom: 'NVIDIA GeForce RTX 4070 Ti SUPER', vram_utilisee: 1.7 * GO,
         vram_totale: 16 * GO, temperature: 49, charge: 1, puissance: 43 },
};
const SANS_SMI = { ...PLEIN, gpu: null };
const RIEN = { en_ligne: false, ram: null, vram: null, gpu: null };

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1600, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  let appels = 0;
  page.on('request', r => { if (r.url().includes('/api/app/comfy/stats')) appels++; });

  let ko = 0;
  const dire = (ok, txt) => { console.log(`  ${ok ? 'ok  ' : 'KO  '}${txt}`); if (!ok) ko++; };

  // réponse simulée : on force l'état, on redemande une peinture, on lit
  let charge = null;
  await page.route('**/api/app/comfy/stats*', route =>
    charge ? route.fulfill({ status: 200, contentType: 'application/json',
                             body: JSON.stringify(charge) })
           : route.continue());
  const poser = async etat => {
    charge = etat;
    await page.evaluate(async () => {
      const m = await import('/static/sondes.js');
      await m.majSondes();
    });
    await page.waitForTimeout(120);
  };
  const bandeau = () => page.$$eval('#sondesHd .sonde-hd', els => els.map(e => ({
    txt: e.textContent.trim(), bulle: e.dataset.hintText || '',
    ic: !!e.querySelector('svg'), cls: e.className.replace('sonde-hd', '').trim(),
    focusable: e.tabIndex === 0,
  })));

  console.log('\n[1] la zone de santé : Comfy, un trait, puis la machine');
  await page.goto(ORIGIN + '/?character=lena', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const ordre = await page.$$eval('.status > *', els =>
    els.map(e => e.id || e.className.split(' ')[0]));
  dire(ordre.join('|') === 'status-lab|dot|stTxt|status-sep|sondesHd',
       `ordre : ${ordre.join(' | ')}`);
  dire(await page.$eval('.status-sep', e => e.getBoundingClientRect().width > 0),
       'le séparateur est visible entre les deux natures d\'information');

  console.log('\n[2] cadence propre, et pause quand l\'onglet est caché');
  const t0 = appels;
  await page.waitForTimeout(3200);
  const enPage = appels - t0;
  dire(enPage <= 2, `${enPage} appel(s) en 3,2 s — pas la cadence du tick (qui en ferait 2 par 3 s)`);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const t1 = appels;
  await page.waitForTimeout(5600);
  dire(appels === t1, `onglet caché : ${appels - t1} appel — la sonde se tait`);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  console.log('\n[3] tout est connu : trois sondes, icône + valeur, seuils');
  await poser(PLEIN);
  const plein = await bandeau();
  plein.forEach(i => console.log(`      ${i.txt.padEnd(7)} [${i.cls || 'normal'}] ${i.bulle.slice(0, 78)}`));
  dire(plein.length === 3, `${plein.length} sondes : RAM, VRAM, température`);
  dire(plein.every(i => i.ic), 'chacune porte une icône SVG');
  dire(plein.every(i => i.bulle.length > 10), 'et une infobulle qui dit ce qu\'elle mesure');
  dire(plein.every(i => i.focusable), 'toutes atteignables au clavier (tabindex=0)');
  dire(plein[0].txt === '45 %' && /vive/i.test(plein[0].bulle), `RAM d'abord : ${plein[0].txt}`);
  dire(plein[1].txt === '90 %' && /VRAM/.test(plein[1].bulle), `puis VRAM : ${plein[1].txt}`);
  dire(plein[2].txt === '86 °C', `puis la température : ${plein[2].txt}`);
  dire(plein[1].cls === 'haut', 'une VRAM à 90 % passe au rouge');
  dire(plein[2].cls === 'haut', 'une carte à 86 °C aussi');
  // la couleur ne porte jamais l'information seule (frontend.md)
  dire(plein.every(i => /\d/.test(i.txt)), 'et la valeur chiffrée est toujours là, à côté');

  console.log('\n[4] ComfyUI arrêté : on garde ce que le pilote sait encore');
  await poser(COMFY_KO);
  const ko1 = await bandeau();
  ko1.forEach(i => console.log(`      ${i.txt.padEnd(7)} ${i.bulle.slice(0, 88)}`));
  dire(ko1.length === 2, `${ko1.length} sondes : la RAM part, VRAM et T°C restent`);
  dire(!ko1.some(i => /vive/i.test(i.bulle)),
       'la RAM disparaît — ComfyUI seul la connaît');
  dire(ko1.some(i => /VRAM/.test(i.bulle) && /pilote/.test(i.bulle)),
       'la VRAM reste, et l\'infobulle DIT qu\'elle vient du pilote');
  dire(ko1.some(i => /°C/.test(i.txt)), 'la température reste');

  console.log('\n[5] pas de nvidia-smi : le reste tient');
  await poser(SANS_SMI);
  const sans = await bandeau();
  dire(sans.length === 2, `${sans.length} sondes : RAM et VRAM, pas de température`);
  dire(!sans.some(i => /°C/.test(i.txt)),
       'aucune température — retirée, jamais un « — » qui se lirait comme une panne');

  console.log('\n[6] rien du tout : le bandeau est vide, pas faux');
  await poser(RIEN);
  dire((await bandeau()).length === 0, 'aucune sonde affichée');

  console.log('\n[7] l\'écran Application lit le MÊME appel');
  await poser(PLEIN);
  await page.click('.tabs button[data-s="appli"]');
  await page.waitForTimeout(600);
  const avant = appels;
  await poser(PLEIN);
  const boite = ((await page.textContent('#comfyStats')) || '').replace(/\s+/g, ' ');
  dire(appels - avant <= 1, `${appels - avant} appel pour peindre les DEUX surfaces`);
  dire(/VRAM/.test(boite) && /RAM/.test(boite), 'les deux jauges détaillées sont là');
  dire(/86 °C/.test(boite), 'et les relevés du pilote');
  const hd = await bandeau();
  dire(hd.length === 3 && hd[1].txt === '90 %',
       'le bandeau montre la même chose au même instant');

  console.log('\n[8] Application, ComfyUI arrêté : elle dit ce qui manque ET ce qui reste');
  await poser(COMFY_KO);
  const boite2 = ((await page.textContent('#comfyStats')) || '').replace(/\s+/g, ' ');
  console.log('      « ' + boite2.slice(0, 170).trim() + ' »');
  dire(/ne répond pas/i.test(boite2), 'elle nomme la panne');
  dire(/pilote/i.test(boite2) && /VRAM/.test(boite2),
       'et montre quand même ce que le pilote sait');
  dire(await page.locator('#btnComfyUnload').isDisabled(),
       '« Décharger » est désactivé — il n\'y a personne à qui le demander');

  /* CE DONT CE MODULE RÉPOND : son propre coût. La route sert un cache de
     1,5 s côté serveur, donc deux appels rapprochés ne relancent pas
     `nvidia-smi` — c'est ce qui rend une cadence de 5 s tenable même avec
     plusieurs onglets ouverts.

     CE DONT IL NE RÉPOND PAS, et qu'il ne faut donc pas lui imputer :
     `/api/state` coûte ~1,5 s quand ComfyUI est ARRÊTÉ, et c'est
     PRÉ-EXISTANT — mesuré le 30/08, serveur seul, sans navigateur ni sondes :
     1,52 / 1,50 / 1,51 / 1,51 s. La lenteur vient de la sonde de vie
     `comfy_alive` contre un port mort, pas d'ici. On la mesure et on l'affiche
     pour ne pas la redécouvrir, sans en faire un échec de ce test. */
  console.log('\n[9] le coût des sondes, et ce qui n\'est pas de leur fait');
  charge = null;                                   // vraie route, vraie sonde
  const chrono = u => page.evaluate(async url => {
    const t = performance.now();
    await fetch(url).then(r => r.text());
    return Math.round(performance.now() - t);
  }, u);
  await chrono('/api/app/comfy/stats?character=lena');      // amorce le cache
  const cache = await chrono('/api/app/comfy/stats?character=lena');
  dire(cache < 300, `la route ressert son cache en ${cache} ms — pas de spawn par appel`);
  const etat = await chrono('/api/state?character=lena');
  console.log(`      /api/state : ${etat} ms` + (etat > 800
    ? '  (ComfyUI arrêté — comfy_alive sonde un port mort, pré-existant)' : ''));
  dire(etat < 3000, `/api/state répond (${etat} ms)`);

  console.log('\n[10] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
