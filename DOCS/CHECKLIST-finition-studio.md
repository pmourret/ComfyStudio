# Checklist — finition studio

Cocher seulement ce qui est **sur `main` et vérifié**.  
Référence : `ROADMAP-finition-studio.md` · HEAD de départ `f588503`.

Légende : `[ ]` à faire · `[x]` clos · `(GPU)` besoin Comfy en ligne.

---

## Session 1 — F1.1 + F1.3 Revue / Galerie

**F1.1 Revue ≠ Galerie**

- [ ] Deux destinations chrome distinctes (Revue / Galerie)
- [ ] Revue = bucket `A_REVOIR` (éventuellement SANS_VISAGE / ERREUR)
- [ ] Galerie = bucket `OK` (ARCHIVE plus tard, pas maintenant)
- [ ] Gestes Revue = V / X / A + clavier
- [ ] Gestes Galerie = voir, ouvrir l’éditeur, télécharger
- [ ] Poster Instagram = bouton inerte + raison (pas de route)
- [ ] Pastille navbar = file Revue uniquement ; à 0 elle disparaît
- [ ] L’onglet chrome n’entre pas tout seul en espace NSFW
- [ ] NSFW : même split Revue / Galerie, espaces isolés par cid
- [ ] `#galerie` et `#trier` ne partagent plus le même écran-métier
- [ ] Contrat `data-s` documenté (nouveaux ids ou ids repris — écrit dans le handoff)
- [ ] Fumigation Revue + fumigation Galerie (deux chemins)

**F1.3 Ouvrir un nom**

- [ ] `loadItems` / équivalent accepte un nom d’image
- [ ] Inspecteur : lien « voir dans la Revue / Galerie » selon le bucket
- [ ] Fin de lot NSFW : le lien ouvre **cette** image en Revue NSFW
- [ ] Hash ou query partageable (`#trier&name=` ou contrat équivalent, une seule forme)
- [ ] Isolation : un nom d’un autre cid → 404 / vide, pas l’image de Léna

---

## Session 2 — F1.2 Fiche ≠ registre

- [ ] Menu identité (header) = changer de perso / nouveau / liste
- [ ] Navbar « Personnages » → **fiche** du cid chargé (plus le sélecteur)
- [ ] Fiche affiche : nom, id, type, monde, pack, présence d’une base
- [ ] Fiche affiche l’état NSFW **en lecture** (armé / outil absent)
- [ ] Fiche n’ouvre pas `#armBox` (geste toujours Application)
- [ ] Sans `?character=` : sas = registre, navbar absente
- [ ] `data-s` : soit `fiche` neuf, soit `registre` réservé au sas — tranché et testé
- [ ] Fumigation fiche Léna + fiche Abyssiaelle + sas

---

## Session 3 — F3 Éditeur optique

- [ ] Ouverture : recadrage **éteint**, pas de voile
- [ ] Geste « Recadrer » allume le cadre
- [ ] Ratios 4:5, 1:1, 16:9, libre
- [ ] Rotation 90° + miroir
- [ ] Quatre sliders : expo, contraste, saturation, chaleur
- [ ] Redressement simple (un angle)
- [ ] Enregistrer = **dérivé** nommé + ligne base
- [ ] Source intacte sauf confirmation « écraser »
- [ ] `body.editing` tient toujours les raccourcis / rail / intensité
- [ ] Porte depuis la Galerie (et Revue si besoin)
- [ ] Téléchargement depuis la Galerie, pas seulement depuis l’éditeur
- [ ] Fumigation : cadre dans le canvas, crop off à l’ouverture, deux fichiers après sauver

---

## Session 4 — F2.1 Scènes cartes + éditeur

- [ ] Banque Scènes = grille de cartes (titre, vignette, pose liée)
- [ ] Plus de mur JSON / composeur en premier écran
- [ ] Clic carte → éditeur **d’une** scène
- [ ] Essentiel visible : nom, texte, format, pose
- [ ] Avancé replié : variantes, seeds, tags, JSON brut
- [ ] Enregistrer = cette scène seulement
- [ ] `#dirtyBar` / `.bak` inchangés sur le fichier
- [ ] Attribution de pose reste une propriété de la scène
- [ ] Fumigation : aller-retour carte → éditeur → grille sans perte de saisie

---

## Session 5 — F2.2 + F4 Poses clean + prompt + pose au run

**F2.2 Poses**

- [ ] Vue Poses n’est plus un article-doc centré 1180
- [ ] Intro sans chemin `DOCS/`
- [ ] Barre : « enregistre scenes.json, pas les PNG »
- [ ] Photo source toujours jetée après extract

**F4.1 Fragments**

- [ ] Chaque fragment de l’aperçu = champ éditable
- [ ] Ancre / identité = lecture seule ou warning
- [ ] Bouton « amend du lot seulement »
- [ ] Bouton « écrire dans la scène »
- [ ] Les deux issues ne se confondent pas

**F4.2 Pose au lancement**

- [ ] Chip pose visible sur la barre de Produire
- [ ] Pose = banque du cid (ou « aucune »)
- [ ] Scène = cadre ; prompt = assets ; pose = corps — lisible à l’écran
- [ ] ControlNet pose toujours SFW only (F4.3)
- [ ] Cran édition J7 : pas de pose

---

## Session 6 — F2.3 Éditeur d’articulations

- [ ] Après extract : canvas + points OpenPose
- [ ] Drag d’articulation, export au format ControlNet actuel
- [ ] Photo source absente du disque
- [ ] Surface rail (pas un cran Produire)
- [ ] Pas d’IK, pas multi-corps
- [ ] Pack sans posing : bouton inerte + raison (déjà le contrat rail)
- [ ] Sonde : squelette modifié → scène liée → aperçu / run SFW mentionne la pose

---

## Session 7 — F5.1 Lot NSFW GPU (Léna) `(GPU)`

- [ ] Léna armée + pack avec `edit_workflow`
- [ ] Sélection manuelle d’une OK
- [ ] Lot réel (pas `--no-comfy`)
- [ ] Sortie dans `PROD/LENA/_NSFW/`
- [ ] Ligne base écrite (plus seulement le CSV)
- [ ] CTA → cette image en Revue NSFW
- [ ] Abyssiaelle : toujours pas de cran + raison pack
- [ ] Isolation : rien écrit chez un autre cid
- [ ] Handoff : ce qui a cassé / seuils

---

## Session 8 — F5.2 Inpaint Flux `(GPU)`

- [ ] `inpaint_workflow` nullable sur le pack (comme `edit_workflow`)
- [ ] `instagram-influenceur` déclare le graphe ; `rpg-personnage` = `null`
- [ ] Pinceau (taille / dureté) + lasso
- [ ] Overlay masque ≠ voile de recadrage
- [ ] Prompt **de la zone** (pas le prompt de Produire)
- [ ] Visage hors zone par défaut
- [ ] Sortie = dérivé nommé
- [ ] Pack sans graphe : outil visible + raison, pas de 400
- [ ] Fumigation UI sans GPU + un lot réel Flux documenté

---

## Plus tard dans la finition (pas une session dédiée d’office)

**F2.4 Qwen → une scène**

- [ ] Un bouton « Proposer » dans l’éditeur d’*une* scène
- [ ] Diff affiché, validation humaine
- [ ] Aucune écriture autonome de `scenes.json`

**F5.3 Mains** `(GPU)`

- [ ] Étage pack mesuré (avant / après)
- [ ] Pas un bouton cosmétique dans l’éditeur
- [ ] Inpaint reste le rattrapage, pas le detailer

**F5.4** `[ ]` `edit_workflow` SDXL (après F5.1–F5.2 Flux)  
**F5.5** `[ ]` `"flux+edit"` remplacé par un flag de palier

**F6 Filet V1**

- [ ] `currentCharacter()` = `null` sans query
- [ ] `/img/base` borné (fiche + cartes)
- [ ] `espace = 'sfw'` en base (alias `lena` documenté)
- [ ] `mesures.json` : collision de noms documentée ou scopée
- [ ] Pillow dans l’env de test (`/img?thumb=`)
- [ ] Raccourcis (`f`, …) listés sur Application

---

## Hors checklist (ne pas cocher ici)

- Wan 2.2 / ACE-Step / vidéo NSFW
- Multi-personnages dans le même frame
- Univers art pur
- Poster Instagram réel
- Éditeur de graphe dans le cockpit
- React / Tailwind / ORM

---

## Done — vrai studio (avant Wan)

Cocher les 7 ; ensuite seulement V2.

- [ ] On ne confond plus file de tri et planche
- [ ] On ne choisit pas un perso dans la navbar
- [ ] Une scène s’édite comme une fiche
- [ ] Générer = scène + texte + pose, visibles
- [ ] L’éditeur n’impose pas un crop
- [ ] Une correction de zone produit un second fichier chez le cid
- [ ] Un pack sans outil le dit ; il ne répond pas 400
