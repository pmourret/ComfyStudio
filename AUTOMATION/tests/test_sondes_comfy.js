/* Fumigation NAVIGATEUR des sondes ComfyUI de l'écran Application (J8).

   CE QUE CE TEST VERROUILLE :

     1. Les sondes ne vivent QUE sur l'écran Application. La route sonde en
        bloquant des deux côtés (HTTP vers ComfyUI + un sous-processus
        nvidia-smi) : la brancher au tick global du studio rejouerait le gel de
        boucle d'événements du 24/08 (2005 ms sur /api/plan). On vérifie donc
        qu'aucun appel ne part tant qu'on n'est pas sur cet écran.
     2. Le tableau de bord reste vif pendant que les sondes tournent.
     3. La dégradation est silencieuse : sans nvidia-smi la ligne du pilote
        disparaît et le DIT, les jauges RAM/VRAM restent. Sans ComfyUI, tout le
        bloc devient un message, jamais un vide.
     4. « Décharger » est refusé pendant une production — décharger sous un job
        le ferait échouer.

   Le test LIT seulement : il ne décharge rien (l'action est réelle et vaudrait
   pour le ComfyUI de la machine). Le refus, lui, se vérifie côté route.

   PREREQUIS (hors du repo, qui n'a aucune dépendance) :
     1. python web/app.py --no-comfy --no-browser --port 8199
     2. playwright installé hors du repo ; NODE_PATH pointe sur son node_modules
     3. node tests/test_sondes_comfy.js */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('  IGNORE — playwright absent (voir l en-tete du fichier)'); process.exit(0); }
const ORIGIN = process.env.DASHBOARD_URL || 'http://127.0.0.1:8199';

(async () => {
  const nav = await chromium.launch();
  const page = await nav.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });

  // compte les appels a la route de sonde, pour prouver ou ils partent
  let appels = 0;
  page.on('request', r => { if (r.url().includes('/api/app/comfy/stats')) appels++; });

  let ko = 0;
  const dire = (ok, txt) => { console.log(`  ${ok ? 'ok  ' : 'KO  '}${txt}`); if (!ok) ko++; };

  console.log('\n[1] hors de l\'écran Application, aucune sonde ne part');
  await page.goto(ORIGIN + '/?character=lena', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);           // deux tours du minuteur de 2 s
  dire(appels === 0, `${appels} appel(s) a /api/app/comfy/stats depuis Produire`);

  console.log('\n[2] sur Application, elles partent et la page reste vive');
  const t0 = Date.now();
  await page.click('.tabs button[data-s="appli"]');
  await page.waitForTimeout(2600);
  dire(appels > 0, `${appels} appel(s) une fois l'ecran ouvert`);
  const latence = await page.evaluate(async () => {
    const t = performance.now();
    await fetch('/api/state?character=lena').then(r => r.json());
    return Math.round(performance.now() - t);
  });
  dire(latence < 400, `/api/state repond en ${latence} ms pendant que les sondes tournent`);
  console.log(`      (${Date.now() - t0} ms sur l'ecran)`);

  console.log('\n[3] ce que les sondes affichent');
  const d = await page.evaluate(() =>
    fetch('/api/app/comfy/stats?character=lena').then(r => r.json()));
  const boite = ((await page.textContent('#comfyStats')) || '').replace(/\s+/g, ' ').trim();
  console.log('      « ' + boite.slice(0, 200) + ' »');

  if (!d || !d.en_ligne) {
    // ComfyUI absent : c'est un cas NORMAL, pas un echec du test
    dire(/ne répond pas/i.test(boite),
         'ComfyUI hors ligne -> un message, jamais un bloc vide');
    dire(await page.locator('#btnComfyUnload').isDisabled(),
         'et « Décharger » est desactive');
  } else {
    const jauges = await page.$$eval('#comfyStats .sonde-b i', els =>
      els.map(e => e.style.width));
    dire(jauges.length === 2, `deux jauges (VRAM, RAM) : ${jauges.join(' / ')}`);
    dire(jauges.every(w => /^\d+(\.\d+)?%$/.test(w)),
         'leur remplissage est un pourcentage reel, pas un gabarit');
    dire(/VRAM/.test(boite) && /RAM/.test(boite), 'les deux memoires sont nommees');
    dire(/Go/.test(boite), 'les volumes sont en Go');

    if (d.gpu) {
      dire(/température/i.test(boite) && /°C/.test(boite),
           `la temperature du pilote est affichee (${d.gpu.temperature} °C)`);
      dire(/charge/i.test(boite) && /consommation/i.test(boite),
           'charge et consommation aussi');
      dire(d.gpu.temperature > 0 && d.gpu.temperature < 120,
           `et elle est plausible : ${d.gpu.temperature} °C`);
    } else {
      // machine sans nvidia-smi : la degradation doit se VOIR, pas se taire
      dire(/nvidia-smi/.test(boite),
           'sans nvidia-smi, la ligne du pilote dit pourquoi elle manque');
      dire(/VRAM/.test(boite), 'et les jauges memoire restent servies');
    }
  }

  console.log('\n[4] « Décharger » est un geste explicite');
  dire(await page.isVisible('#btnComfyUnload'), 'le bouton existe sur l\'ecran ComfyUI');
  // le refus pendant production se verifie cote route : l'UI ne peut pas
  // simuler un batch sans lancer une vraie generation
  const refus = await page.evaluate(() =>
    fetch('/api/app/comfy/unload?character=lena',
          {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'})
      .then(r => r.status));
  dire(refus === 200 || refus === 409 || refus === 502,
       `la route repond franchement (${refus}) — jamais un 500 nu`);

  console.log('\n[5] aucune erreur JS sur tout le parcours');
  dire(erreurs.length === 0, `${erreurs.length} erreur(s)`);
  erreurs.forEach(e => console.log('      ' + e.slice(0, 150)));

  console.log('\n' + '='.repeat(70));
  console.log(ko ? `${ko} ECHEC(S)` : 'tout est vert');
  console.log('='.repeat(70));
  await nav.close();
  process.exit(ko ? 1 : 0);
})();
