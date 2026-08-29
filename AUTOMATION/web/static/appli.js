/* Ecran Application : arret/redemarrage du tableau de bord et de ComfyUI.
   Parametrage de l'app elle-meme (26/08/2026) — distinct du panneau ⚙ de
   l'ecran Creer, qui regle une generation, pas les deux processus qui la
   rendent possible. Actions consequentes : confirmation systematique, et pour
   ComfyUI un arret n'est JAMAIS propre sous Windows (pas de signal
   d'extinction gracieuse, TerminateProcess coupe net) — le dire avant d'agir. */
import {$, esc} from './dom.js';
import {api, post} from './api.js';
import {toast} from './toast.js';
import {confirmer} from './modal.js';
import {isRunning} from './poller.js';

/* Go, pas Gio : c'est l'unite que nvidia-smi et les fiches constructeur
   emploient, donc celle que l'utilisateur reconnait sur sa propre carte. */
const go = o => (o / 1e9).toFixed(1);
const pct = (a, b) => b > 0 ? Math.round(100 * a / b) : 0;

function jauge(titre, utilisee, total, detail){
  const p = pct(utilisee, total);
  // deux seuils, pas un gradient : au-dela de 90 % une generation peut echouer
  // faute de VRAM, et c'est le seul moment ou la couleur doit alerter
  const cl = p >= 90 ? ' haut' : p >= 70 ? ' mid' : '';
  return `<div>
    <div class="sonde-t"><span>${esc(titre)}${detail ? ' · ' + esc(detail) : ''}</span>
      <span class="sonde-v">${go(utilisee)} / ${go(total)} Go · ${p}%</span></div>
    <div class="sonde-b${cl}"><i style="width:${Math.min(100, p)}%"></i></div>
  </div>`;
}

function appliLog(msg){
  const el = $('#appliLog');
  if (!el) return;
  el.textContent = `${new Date().toLocaleTimeString('fr-FR')} · ${msg}\n` + el.textContent;
}

export async function majEtatComfy(){
  let s; try { s = await api('/api/state'); } catch { return; }
  const el = $('#comfyEtat');
  if (el) el.textContent = s.comfy ? '— en ligne' : '— hors ligne';
  majSondes();
}

/* Sondes memoire / thermique. Appelee UNIQUEMENT depuis majEtatComfy, donc
   uniquement quand l'ecran Application est a l'affiche : la route sonde en
   bloquant des deux cotes (HTTP vers ComfyUI + un sous-processus nvidia-smi),
   elle n'a rien a faire dans le tick global du studio. */
async function majSondes(){
  const box = $('#comfyStats');
  if (!box) return;
  let d; try { d = await api('/api/app/comfy/stats'); } catch { d = null; }
  if (!d || !d.en_ligne){
    box.innerHTML = `<p class="sonde-ko">Mémoire indisponible — ComfyUI ne répond pas.</p>`;
    majBoutonDecharger(false);
    return;
  }
  const g = d.gpu;
  // La ligne du pilote n'existe pas partout : nvidia-smi suppose une carte
  // NVIDIA. Machine sans lui -> on montre RAM et VRAM, et on le DIT, plutot
  // que de laisser un vide qui se lirait comme une panne.
  const releves = g
    ? `<div class="sonde-gpu">
         ${g.temperature != null ? `<span>température <b>${g.temperature} °C</b></span>` : ''}
         ${g.charge != null ? `<span>charge <b>${g.charge} %</b></span>` : ''}
         ${g.puissance != null ? `<span>consommation <b>${g.puissance.toFixed(0)} W</b></span>` : ''}
       </div>`
    : `<p class="sonde-ko" style="margin:0">Température et charge indisponibles —
       elles viennent de <code>nvidia-smi</code>, absent sur cette machine.</p>`;
  box.innerHTML = `<div class="sondes">
    ${jauge('VRAM', d.vram.utilisee, d.vram.total, g && g.nom ? g.nom : '')}
    ${jauge('RAM', d.ram.utilisee, d.ram.total, '')}
    ${releves}
  </div>`;
  majBoutonDecharger(true);
}

function majBoutonDecharger(actif){
  const b = $('#btnComfyUnload');
  if (!b) return;
  const occupe = isRunning();
  b.disabled = !actif || occupe;
  b.title = occupe ? 'une production est en cours' : '';
}

setInterval(() => { if ($('#appli')?.classList.contains('on')) majEtatComfy(); }, 2000);

/* Decharger n'arrete pas ComfyUI : ca rend la VRAM que les modeles retiennent,
   et ils se rechargent d'eux-memes a la generation suivante. Le dire, sinon
   « decharger » se lit comme « arreter » — les deux boutons voisins arretent. */
$('#btnComfyUnload')?.addEventListener('click', async () => {
  const ok = await confirmer({
    titre: 'Décharger la mémoire ?',
    corps: `<p>Libère la VRAM que les modèles chargés retiennent. ComfyUI
      <b>reste en ligne</b> : les modèles se rechargent d'eux-mêmes à la
      prochaine génération, qui sera donc un peu plus longue.</p>
      <p class="tiny">Rien n'est perdu — ni file d'attente, ni image.</p>`,
    bouton: 'Décharger'});
  if (!ok) return;
  const r = await post('/api/app/comfy/unload');
  if (!r.ok) return toast(r.erreur || 'échec');
  appliLog('mémoire ComfyUI déchargée');
  toast('mémoire déchargée');
  majSondes();
});

/* Ecran de prise en charge plein cadre — le tableau de bord entier va devenir
   injoignable pendant l'operation, donc pas la peine de garder les tuiles et
   boutons habituels a l'ecran, ils ne repondront a rien. */
function ecranPatiente(texte){
  // couleurs/typo via tokens (tokens.css reste charge apres remplacement du
  // body) — seul chrome de l'appli qui contredisait le contrat de DESIGN.md
  document.body.innerHTML =
    `<div style="min-height:100vh;display:flex;align-items:center;
       justify-content:center;font:var(--font);color:var(--txt);
       background:var(--bg);text-align:center;padding:40px">
       <div>${texte}</div></div>`;
}

$('#btnAppRestart')?.addEventListener('click', async () => {
  const ok = await confirmer({
    titre: 'Redémarrer le tableau de bord ?',
    corps: `<p>Relance le serveur web local avec le code et la configuration
      à jour. Cette page se recharge d'elle-même une fois qu'il répond de
      nouveau — quelques secondes.</p>`,
    bouton: 'Redémarrer'});
  if (!ok) return;
  const r = await post('/api/app/restart');
  if (!r.ok) return toast(r.erreur || 'échec');
  ecranPatiente('Redémarrage du tableau de bord…');
  const tantQue = setInterval(async () => {
    try { await fetch('/api/state'); clearInterval(tantQue); location.reload(); }
    catch {}
  }, 700);
});

$('#btnAppStop')?.addEventListener('click', async () => {
  const ok = await confirmer({
    titre: 'Arrêter le tableau de bord ?',
    corps: `<p>Coupe le serveur web local. Cette page ne répondra plus tant
      qu'il n'est pas relancé à la main
      (<code>AUTOMATION/run_web.bat</code>). Une génération en cours serait
      interrompue.</p>`,
    bouton: 'Arrêter'});
  if (!ok) return;
  await post('/api/app/stop');
  ecranPatiente('Tableau de bord arrêté.<br><span style="font-size:13px">'
    + 'Relance <code>run_web.bat</code> pour y revenir.</span>');
});

$('#btnComfyStop')?.addEventListener('click', async () => {
  const enCours = isRunning();
  const ok = await confirmer({
    titre: 'Arrêter ComfyUI ?',
    corps: `<p>${enCours ? '<b>Une génération est en cours sur ce tableau de '
      + 'bord — elle sera perdue.</b> ' : ''}Windows ne permet pas un arrêt
      propre : le processus est coupé net, sans le temps de finir un job.</p>`,
    bouton: 'Arrêter ComfyUI'});
  if (!ok) return;
  const r = await post('/api/app/comfy/stop');
  if (!r.ok) return toast(r.erreur || 'échec');
  appliLog('ComfyUI arrêté');
  toast('ComfyUI arrêté');
  majEtatComfy();
});

$('#btnComfyRestart')?.addEventListener('click', async () => {
  const enCours = isRunning();
  const ok = await confirmer({
    titre: 'Redémarrer ComfyUI ?',
    corps: `<p>${enCours ? '<b>Une génération est en cours sur ce tableau de '
      + 'bord — elle sera perdue.</b> ' : ''}Arrêt net puis relance dans une
      nouvelle fenêtre console. Compte 30 s à 2 min : le premier chargement
      des custom nodes est le plus long.</p>`,
    bouton: 'Redémarrer ComfyUI'});
  if (!ok) return;
  const r = await post('/api/app/comfy/restart');
  if (!r.ok) return toast(r.erreur || 'échec');
  appliLog('redémarrage de ComfyUI demandé — une nouvelle fenêtre va s’ouvrir');
  toast('redémarrage de ComfyUI lancé (~30 s à 2 min)');
});
