/* Sondes memoire et thermique de ComfyUI — une seule source, deux surfaces.

   POURQUOI CE MODULE EXISTE. Les sondes ne vivaient que sur l'ecran
   Application, et pour une raison serieuse : la route interroge ComfyUI en
   HTTP et lance `nvidia-smi` en sous-processus. Les brancher au tick du studio
   (1,5 s) rejouerait le gel de boucle d'evenements du 24/08 — /api/plan a
   deja passe de 1,7 ms a 2005 ms pour avoir sonde en bloquant.

   Le bandeau les demande partout (30/08/2026). La contrainte ne disparait pas,
   elle se tient autrement :

     - CADENCE PROPRE, 5 s, jamais celle du studio. Les deux minuteurs ne se
       melangent pas : le tick de production reste a 1,5 s sans rien sonder de
       lourd.
     - PAUSE ONGLET CACHE. `document.hidden` coupe la sonde : un onglet en
       arriere-plan n'a aucune raison de lancer un sous-processus toutes les
       5 s, et on peut en avoir plusieurs ouverts.
     - UN SEUL APPEL POUR LES DEUX SURFACES. Le bandeau (compact) et l'ecran
       Application (detaille) lisent le MEME resultat. Deux fetchs pour la meme
       donnee doubleraient les spawns et pourraient afficher deux verites.
     - Cote serveur, la route garde son cache de 1,5 s et sonde dans un
       executeur : la boucle d'evenements ne bloque jamais.

   Le bandeau montre une ICONE et une valeur ; ce qu'elle mesure est dans
   l'infobulle (hints.js, `data-hint-text`) — un bandeau de 56 px n'a pas la
   place d'un libelle par sonde, et trois libelles y feraient du bruit. */
import {$, esc} from './dom.js';
import {api} from './api.js';
import {emit} from './bus.js';

let ETAT = null;                 // dernier resultat connu, partage par les deux vues

export const dernierEtat = () => ETAT;

/* Go, pas Gio : c'est l'unite que nvidia-smi et les fiches constructeur
   emploient, donc celle que l'utilisateur reconnait sur sa propre carte. */
const go = o => (o / 1e9).toFixed(1);
const pct = (a, b) => b > 0 ? Math.round(100 * a / b) : 0;

/* Deux seuils, pas un gradient. Pour la memoire c'est un fait mesurable : au
   dela de 90 % une generation peut echouer faute de VRAM. Pour la temperature,
   les paliers usuels d'une carte grand public avant throttling. */
const niveauMem = p => p >= 90 ? 'haut' : p >= 70 ? 'mid' : '';
const niveauTemp = t => t >= 83 ? 'haut' : t >= 72 ? 'mid' : '';

const ICONES = {
  // barrette de memoire vive : le composant, pas une abstraction
  ram: '<rect x="2.5" y="6" width="15" height="8" rx="1.5"/><path d="M5.5 14v2.5M10 14v2.5M14.5 14v2.5M6 9h8"/>',
  // carte graphique : une carte avec son ventilateur
  vram: '<rect x="2" y="5" width="16" height="10" rx="1.5"/><circle cx="7" cy="10" r="2.4"/><path d="M12 8.5h3.5M12 11.5h3.5"/>',
  // thermometre
  temp: '<path d="M12 11.5V4a2 2 0 10-4 0v7.5a3.5 3.5 0 104 0z"/><path d="M10 7.5v6"/>',
};

const icone = nom => `<svg class="sonde-hd-ic" viewBox="0 0 20 20" aria-hidden="true"
  focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"
  stroke-linecap="round" stroke-linejoin="round">${ICONES[nom]}</svg>`;

/* Une sonde du bandeau. `data-hint-text` : l'infobulle vient des DONNEES (des
   chiffres qui changent a chaque tour), pas de la table de cles de hints.js —
   c'est exactement l'echappatoire que ce module documente. */
const item = (ic, valeur, bulle, niveau) => `
  <span class="sonde-hd ${niveau}" tabindex="0" data-hint-text="${esc(bulle)}">
    ${icone(ic)}<b>${esc(valeur)}</b></span>`;

/* CE QUI EST CONNU, et d'ou ca vient. Les trois sondes n'ont pas la meme
   source, et donc pas la meme duree de vie :

     - RAM  : `/system_stats`, donc ComfyUI. Il tombe, elle disparait.
     - VRAM : les DEUX la connaissent. On prefere le chiffre de ComfyUI (c'est
              celui que sa generation voit), et on retombe sur nvidia-smi quand
              il ne repond plus.
     - T°C  : nvidia-smi seul, toujours.

   Constate le 30/08 en developpant le bandeau : ComfyUI arrete, tout
   disparaissait — alors que la carte annoncait encore 1,6 Go pris et 53 °C.
   Ce sont des faits de la MACHINE, pas de ComfyUI, et c'est justement quand
   ComfyUI est a l'arret qu'on veut savoir si quelque chose retient la VRAM.
   On montre donc ce qu'on sait, et rien de plus. */
function connu(d){
  if (!d) return {ram: null, vram: null, gpu: null};
  const g = d.gpu;
  const vram = (d.en_ligne && d.vram && d.vram.total)
    ? {utilisee: d.vram.utilisee, total: d.vram.total, nom: d.vram.nom, source: 'comfy'}
    : (g && g.vram_totale)
      ? {utilisee: g.vram_utilisee, total: g.vram_totale, nom: g.nom, source: 'pilote'}
      : null;
  return {ram: (d.en_ligne && d.ram && d.ram.total) ? d.ram : null, vram, gpu: g};
}

function peindreBandeau(d){
  const box = $('#sondesHd');
  if (!box) return;
  const {ram, vram, gpu} = connu(d);
  let html = '';

  if (ram){
    const p = pct(ram.utilisee, ram.total);
    html += item('ram', p + ' %',
                 `Mémoire vive — ${go(ram.utilisee)} / ${go(ram.total)} Go utilisés`,
                 niveauMem(p));
  }
  if (vram){
    const p = pct(vram.utilisee, vram.total);
    const carte = (gpu && gpu.nom) || vram.nom || 'carte graphique';
    html += item('vram', p + ' %',
                 `Mémoire de la carte (VRAM) — ${go(vram.utilisee)} / ${go(vram.total)} Go `
                 + `utilisés · ${carte}`
                 + (vram.source === 'pilote' ? ' · relevé par le pilote, ComfyUI étant arrêté' : ''),
                 niveauMem(p));
  }
  // Absente sur une machine sans nvidia-smi, et c'est un cas normal : on retire
  // la sonde plutot que d'afficher un tiret qui se lirait comme une panne.
  // L'ecran Application, lui, DIT pourquoi elle manque.
  if (gpu && gpu.temperature != null){
    const t = gpu.temperature;
    const carte = gpu.nom || 'carte graphique';
    html += item('temp', Math.round(t) + ' °C',
                 `Température du GPU — ${carte}`
                 + (gpu.charge != null ? ` · charge ${gpu.charge} %` : '')
                 + (gpu.puissance != null ? ` · ${gpu.puissance.toFixed(0)} W` : ''),
                 niveauTemp(t));
  }
  box.innerHTML = html;
}

/* Jauge de l'ecran Application — la vue detaillee de la meme donnee. */
function jauge(titre, utilisee, total, detail){
  const p = pct(utilisee, total);
  const cl = niveauMem(p);
  return `<div>
    <div class="sonde-t"><span>${esc(titre)}${detail ? ' · ' + esc(detail) : ''}</span>
      <span class="sonde-v">${go(utilisee)} / ${go(total)} Go · ${p}%</span></div>
    <div class="sonde-b${cl ? ' ' + cl : ''}"><i style="width:${Math.min(100, p)}%"></i></div>
  </div>`;
}

function peindreApplication(d){
  const box = $('#comfyStats');
  if (!box) return;                        // l'ecran n'est pas dans cette page
  const vu = connu(d);
  // ComfyUI arrete : on le dit, puis on montre ce que le pilote sait encore
  // (VRAM, temperature). Un ecran vide laisserait croire qu'on ne sait rien.
  if (!d || !d.en_ligne){
    const g = vu.gpu;
    const reste = (vu.vram || g) ? `<div class="sondes" style="margin-top:12px">
        ${vu.vram ? jauge('VRAM', vu.vram.utilisee, vu.vram.total,
                          (g && g.nom) || '') : ''}
        ${g ? `<div class="sonde-gpu">
          ${g.temperature != null ? `<span>température <b>${g.temperature} °C</b></span>` : ''}
          ${g.charge != null ? `<span>charge <b>${g.charge} %</b></span>` : ''}
          ${g.puissance != null ? `<span>consommation <b>${g.puissance.toFixed(0)} W</b></span>` : ''}
        </div>` : ''}
      </div>` : '';
    box.innerHTML = `<p class="sonde-ko">ComfyUI ne répond pas — la mémoire vive
      qu'il rapporte est donc inconnue.${reste ? ' Le reste vient du pilote.' : ''}</p>`
      + reste;
    return;
  }
  const g = d.gpu;
  // La ligne du pilote n'existe pas partout : nvidia-smi suppose une carte
  // NVIDIA. Machine sans lui -> on montre RAM et VRAM, et on le DIT, plutot
  // que de laisser un vide qui se lirait comme une panne.
  const releves = g
    ? `<div class="sonde-gpu">
         ${g.temperature != null ? `<span>température <b>${g.temperature} °C</b></span>` : ''}
         ${g.charge != null ? `<span>charge <b>${g.charge} %</b></span>` : ''}
         ${g.puissance != null ? `<span>consommation <b>${g.puissance.toFixed(0)} W</b></span>` : ''}
       </div>`
    : `<p class="sonde-ko" style="margin:0">Température et charge indisponibles —
       elles viennent de <code>nvidia-smi</code>, absent sur cette machine.</p>`;
  box.innerHTML = `<div class="sondes">
    ${jauge('VRAM', d.vram.utilisee, d.vram.total, g && g.nom ? g.nom : '')}
    ${jauge('RAM', d.ram.utilisee, d.ram.total, '')}
    ${releves}
  </div>`;
}

/* Un appel, les deux surfaces. Ne jette jamais : une sonde de confort ne doit
   pas casser l'ecran qui la porte. */
export async function majSondes(){
  let d;
  try { d = await api('/api/app/comfy/stats'); } catch { d = null; }
  ETAT = d;
  peindreBandeau(d);
  peindreApplication(d);
  // Ce que l'etat AUTORISE ne se peint pas ici : « Decharger la memoire » est
  // une action de l'ecran Application, elle lui appartient. On emet, il
  // s'abonne — sinon le bouton depend du minuteur d'un autre module et se
  // retrouve en retard d'un tour sur ce que les jauges affichent.
  emit('sondes:loaded', d);
  return d;
}

// cadence propre au module, et rien quand personne ne regarde
setInterval(() => { if (!document.hidden) majSondes(); }, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) majSondes(); });
