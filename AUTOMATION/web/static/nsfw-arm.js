/* Section « Contenu adulte » de l'ecran Application, et le rituel d'armement
   qu'elle ouvre (J7).

   UN SEUL ENDROIT. L'armement vivait sur le cran verrouille du curseur et dans
   la modale Decliner : deux portes, toutes deux au milieu d'un geste de
   production, la ou on ne veut pas prendre ce genre de decision. Il vit
   desormais ici, sur l'ecran qui parametre l'application — et le desarmement
   avec lui. Produire execute la decision, il ne la prend plus.

   PAS D'INTERRUPTEUR GLOBAL. L'interrupteur est celui d'UN personnage
   (CHARACTERS/<id>/character.json, cle `nsfw`, ADR-0010), off a la creation
   (create_character). Cette section parle donc toujours du personnage courant,
   et le nomme.

   DEUX CONDITIONS. Le cran d'edition n'apparait sur Produire que si le
   personnage est arme ET si son pack declare un graphe d'edition
   (universe.json / edit_workflow). Un pack sans graphe le dit ici, en toutes
   lettres : armer reste permis, ca ne fait juste rien apparaitre. */
import {$, esc} from './dom.js';
import {api, post} from './api.js';
import {toast} from './toast.js';
import {openDialog, closeDialog} from './ui-dialog.js';
import {confirmer} from './modal.js';
import {loadCreative} from './taxonomy.js';

let ETAT = null;

/* Recharge l'etat et repeint la section. Appelee a l'ouverture de l'ecran
   (nav.js) et apres chaque bascule. */
export async function majContenuAdulte(){
  let d;
  try { d = await api('/api/nsfw/state'); }
  catch {
    const box = $('#nsfwBox');
    if (box) box.innerHTML = `<p class="tiny">État indisponible — le serveur n'a pas répondu.</p>`;
    return;
  }
  ETAT = d;
  const qui = $('#nsfwQui');
  if (qui) qui.textContent = d.nom ? `— ${d.nom}` : '';
  peindre(d);
}

function peindre(d){
  const box = $('#nsfwBox');
  if (!box) return;
  const outil = d.outil || {};
  const arme = !!outil.armed;
  const total = Object.values(d.counts || {}).reduce((a, b) => a + b, 0);

  // Le pack n'a pas l'outil : le dire AVANT l'interrupteur, sinon armer promet
  // un cran qui n'apparaitra pas. On n'interdit pas pour autant — l'armement
  // est une decision du personnage, elle reste prenable.
  const manque = !outil.has_graph ? `
    <p class="tiny" style="margin:0 0 14px">${esc(outil.reason || '')}
       L'activer ici est sans effet visible sur Produire tant que le pack
       n'aura pas son graphe d'édition.</p>` : '';

  box.innerHTML = `
    <p class="tiny" style="margin:6px 0 14px">
      Ajoute au curseur de Produire un cran qui <b>édite une image déjà validée</b>
      que tu choisis toi-même — il n'engendre jamais une scène à partir de rien.
      La retouche se fait ensuite dans l'éditeur photo, depuis la Revue.</p>
    ${manque}
    <p class="tiny" style="margin:0 0 16px">
      État : <b>${arme ? 'activé' : 'désactivé'}</b>${
        arme && total ? ` · ${total} image${total > 1 ? 's' : ''} dans `
          + `<code>${esc(d.sortie || '')}</code>` : ''}</p>
    <div class="appliActs">
      ${arme
        ? `<button class="btn danger" id="btnNsfwOff">Désactiver</button>`
        : `<button class="btn" id="btnNsfwOn">Activer…</button>`}
    </div>`;

  $('#btnNsfwOn')?.addEventListener('click', () => ouvrirArmement(d));
  $('#btnNsfwOff')?.addEventListener('click', () => desarmer(d));
}

/* Le rituel : recopier le mot, pas un clic. Il enonce les consequences reelles
   — le dossier du personnage, et le fait que rien n'en sort. */
function ouvrirArmement(d){
  const sortie = esc(d.sortie || '');
  $('#armCard').innerHTML = `
    <h3>Activer le contenu adulte — ${esc(d.nom || '')}</h3>
    <p>Un cran s'ajoute au curseur de Produire. Il part de l'image validée que
       tu choisis : la sélection est manuelle, il n'y a pas de reprise
       automatique.</p>
    <ul>
      <li>le verrou d'identité du pack remet le visage depuis la base gelée</li>
      <li>sorties isolées dans <code>${sortie}</code>, <b>jamais exportées</b></li>
      <li>une image dont la passe d'identité sort de la bande n'est pas éditée</li>
      <li>réversible ici même, à tout moment</li>
    </ul>
    <label class="f" style="margin-top:14px"><span>pour activer, recopier le mot ARMER</span>
      <input id="armWord2" autocomplete="off" style="max-width:220px"></label>
    <div style="margin-top:16px;display:flex;gap:12px;align-items:center">
      <button class="btn primary" id="btnArm2">Activer</button>
      <button class="link" id="armClose">annuler</button></div>`;
  const armer = async () => {
    const r = await post('/api/nsfw/arm', {arm: true, confirm: $('#armWord2').value});
    if (!r.ok) return toast(r.erreur === 'confirmation manquante'
      ? 'recopie exactement le mot ARMER' : (r.erreur || 'échec'));
    closeDialog($('#armBox'));
    toast('contenu adulte activé');
    // la taxonomie change (le palier d'edition devient emis) : la relire ici
    // evite que Produire garde un curseur d'avant la bascule
    await loadCreative();
    await majContenuAdulte();
  };
  $('#btnArm2').onclick = armer;
  $('#armWord2').addEventListener('keydown', e => { if (e.key === 'Enter') armer(); });
  $('#armClose').onclick = () => closeDialog($('#armBox'));
  openDialog($('#armBox'), {initialFocus: '#armWord2'});
}

/* Desactiver n'efface rien : le dire, sinon le mot se lit comme « supprimer ».
   Confirmation simple — c'est le sens sur, celui qui referme. */
async function desarmer(d){
  const ok = await confirmer({
    titre: 'Désactiver le contenu adulte ?',
    corps: `<p>Le cran disparaît du curseur de Produire et plus aucune édition
      ne peut être lancée.</p>
      <p>Les images déjà produites <b>restent en place</b> dans
      <code>${esc(d.sortie || '')}</code> — rien n'est supprimé.</p>`,
    bouton: 'Désactiver'});
  if (!ok) return;
  const r = await post('/api/nsfw/arm', {arm: false});
  if (!r.ok) return toast(r.erreur || 'désactivation impossible');
  toast('contenu adulte désactivé');
  await loadCreative();
  await majContenuAdulte();
}
