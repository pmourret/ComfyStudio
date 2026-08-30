/* Ecran Application : arret/redemarrage du tableau de bord et de ComfyUI.
   Parametrage de l'app elle-meme (26/08/2026) — distinct du panneau ⚙ de
   l'ecran Creer, qui regle une generation, pas les deux processus qui la
   rendent possible. Actions consequentes : confirmation systematique, et pour
   ComfyUI un arret n'est JAMAIS propre sous Windows (pas de signal
   d'extinction gracieuse, TerminateProcess coupe net) — le dire avant d'agir. */
import {$} from './dom.js';
import {api, post} from './api.js';
import {toast} from './toast.js';
import {confirmer} from './modal.js';
import {isRunning} from './poller.js';
/* Les sondes ont quitte ce module (30/08/2026) : le bandeau les affiche aussi,
   et deux surfaces qui interrogent la meme route doubleraient les spawns de
   nvidia-smi — et pourraient montrer deux verites. sondes.js fait l'appel,
   peint les deux, et garde le dernier etat. */
import {majSondes, dernierEtat} from './sondes.js';
import {on} from './bus.js';

function appliLog(msg){
  const el = $('#appliLog');
  if (!el) return;
  el.textContent = `${new Date().toLocaleTimeString('fr-FR')} · ${msg}\n` + el.textContent;
}

export async function majEtatComfy(){
  let s; try { s = await api('/api/state'); } catch { return; }
  const el = $('#comfyEtat');
  if (el) el.textContent = s.comfy ? '— en ligne' : '— hors ligne';
  // sur CET ecran on rafraichit a sa cadence (2 s) en plus de la cadence propre
  // du module (5 s) : c'est l'ecran ou l'on regarde les chiffres bouger, et
  // c'est le seul endroit qui le justifie
  majSondes();
}
// le bouton suit l'etat des sondes, quel que soit le minuteur qui les a
// rafraichies — le sien (2 s) ou celui de sondes.js (5 s)
on('sondes:loaded', majBoutonDecharger);

/* Decharger n'a de sens que si ComfyUI repond, et jamais sous une production.
   L'etat vient de sondes.js — une seule source pour l'affichage et pour ce que
   le bouton autorise. */
function majBoutonDecharger(){
  const b = $('#btnComfyUnload');
  if (!b) return;
  const d = dernierEtat();
  const occupe = isRunning();
  b.disabled = !(d && d.en_ligne) || occupe;
  b.title = occupe ? 'une production est en cours'
          : (d && d.en_ligne) ? '' : 'ComfyUI ne répond pas';
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
