# Roadmap de finition — Soulglade

**Avant toute V2** (Wan, voix, multi-persos, Instagram réel, univers art pur).

Référence dépôt : `f588503` (30/08/2026).  
J0 → J7 clos. Isolation, cran NSFW-outil, navbar / rail, UX parcours 1–6 : clos.

Objectif : un **vrai studio local** — parcours honnête, surfaces de travail lisibles, éditeur photo « assez pro », puis GPU d’édition. Pas un nouveau métier de génération.

---

## Principe

1. Fermer les mensonges de parcours.
2. Rendre les outils du quotidien utilisables.
3. Brancher le GPU d’édition, **un pack à la fois**.

Invariants : un seul `execute_jobs` · isolation par `character_id` · vanilla · rail ≠ navbar · cran d’édition absent sans graphe de pack.

```text
F1  Parcours chrome          (sans GPU)
F2  Surfaces de travail      (sans GPU / API mince)
F3  Éditeur photo optique    (sans GPU)
F4  Pose + prompt au run     (sans GPU, graphes existants)
F5  Outils GPU d’édition     (un pack à la fois)
F6  Filet V1 restant         (quand ça bloque, pas en premier)
```

Wan seulement après **F5** au minimum, idéalement après **F1 + F3**.

---

## F1 — Chrome : deux portes, deux métiers

| # | Livrable | Critère |
| --- | --- | --- |
| **F1.1** | **Revue ≠ Galerie** | Navbar : Revue = file `A_REVOIR` (pastille « travail en attente »). Galerie = `OK`. Gestes Revue = trier (V / X / A). Gestes Galerie = voir, éditer, télécharger. Poster Instagram = bouton **inerte** + raison. `#galerie` et `#trier` cessent de partager le même écran-métier. NSFW : même split ; l’onglet chrome n’entre pas tout seul en espace NSFW (contrat J7). |
| **F1.2** | **Fiche ≠ registre** | Header (menu identité) = changer de personnage / nouveau. Navbar = **fiche** du cid chargé (type, monde, pack, base, état NSFW en lecture seule). Sas sans `?character=` = registre inchangé (navbar absente). L’armement reste sur Application (J7). |
| **F1.3** | Revue ouvrable **sur un nom** | Inspecteur et fin de lot NSFW pointent *cette* image, pas seulement le bucket. Débloque F1.1. |

**Sessions :** 2 — F1.1 + F1.3 ensemble si possible ; F1.2 à part.

---

## F2 — Banque : scènes et poses lisibles

| # | Livrable | Critère |
| --- | --- | --- |
| **F2.1** | Scènes = **cartes** | Grille. Clic → éditeur **d’une** scène. Essentiel : nom, texte, format, pose liée. Avancé replié (variantes, seeds, tags, JSON brut). Enregistrer = cette scène. Plus de mur JSON en premier écran. |
| **F2.2** | Poses = layout propre | Plus un article 1180 + paragraphe-doc. La barre d’enregistrement dit la vérité (`scenes.json` ≠ PNG des squelettes). |
| **F2.3** | **Éditeur d’articulations** | Après extraction : canvas, points OpenPose, glisser, même format que ControlNet. Photo source toujours jetée. Pas d’IK, pas multi-corps. Surface de rail, pas un cran de Produire. |
| **F2.4** | Qwen → JSON **d’une** scène | **Après F2.1.** Le modèle propose un diff ; l’humain valide. Pas d’écriture autonome de la banque. |

**Sessions :** F2.1 (grosse) · F2.2 (petite) · F2.3 (1–2) · F2.4 seulement quand F2.1 est utilisable à la main.

---

## F3 — Éditeur photo « assez pro » (optique d’abord)

Pas Photoshop. Pas Lightroom. Un correctif de **studio de personnage** : image déjà générée, déjà isolée par cid.

Trois familles d’outils (seule la 1re est F3) :

| Famille | Exemples | Backend |
| --- | --- | --- |
| Optique | recadrer, pivoter, expo / contraste | Canvas JS, sans Comfy |
| Locale | pinceau + prompt (inpaint) | Masque → graphe de pack |
| Identité | ne pas toucher au visage par défaut | Interdit sauf geste explicite |

| # | Livrable | Critère |
| --- | --- | --- |
| **F3.1** | Ouverture propre | Recadrage **éteint**. Pas de voile. `body.editing` inchangé (raccourcis studio à l’écart, rail / intensité masqués). |
| **F3.2** | Optique | Recadrer (4:5, 1:1, 16:9, libre) + 90° / miroir. Quatre sliders : exposition, contraste, saturation, chaleur. Redressement simple. Pas de courbes HSL à 12 bandes (éventuel panneau avancé plus tard). |
| **F3.3** | Versions | Enregistrer = **dérivé** nommé + ligne en base. Source intacte sauf confirmation explicite. |
| **F3.4** | Porte | Galerie (et Revue si besoin) ouvre l’éditeur. Téléchargement = Galerie. |

**Critère de vague F3 :** ouvrir une image `OK`, recadrer *seulement si on le demande*, sauver **deux** fichiers chez le cid.

Inpaint = **F5.2**, pas F3.

---

## F4 — Produire : scène / texte / pose

Trois leviers distincts :

| Levier | Dit | Ne dit pas |
| --- | --- | --- |
| Scène | cadre, lieu, lumière | le corps |
| Prompt (fragments) | tenue, objets, texture | l’identité (ancre gelée) |
| Pose | orientation du corps | le décor |

| # | Livrable | Critère |
| --- | --- | --- |
| **F4.1** | Fragments éditables | Chaque bloc de l’aperçu = champ. Deux issues explicites : amend du **lot** *ou* écrire la **scène**. Ancre identité = lecture seule (ou avertissement). |
| **F4.2** | Pose au lancement | Chip sur la barre de lancement : squelette de la banque (déjà lié à la scène *ou* choisi ici). |
| **F4.3** | ControlNet SFW only | Inchangé. Pas de pose sur le cran d’édition J7. |

**Session :** une, **après F2.1** (scènes et poses adressables).

---

## F5 — GPU d’édition (un pack, mesuré)

Même schéma que J7 : champ nullable sur le pack ; outil **absent** (pas grisé) sans graphe.

| # | Livrable | Critère |
| --- | --- | --- |
| **F5.1** | Lot NSFW Léna **réel** | Une session GPU. Filet J7 hors `--no-comfy`. |
| **F5.2** | `inpaint_workflow` Flux | Pinceau + lasso + prompt **de la zone**. Overlay masque ≠ voile de recadrage. Visage **hors** zone par défaut. Sortie = dérivé. Pack sans graphe → outil visible + raison, pas un 400. |
| **F5.3** | Mains | Étage de pack (detailer / ControlNet hands), mesure avant / après. Pas un bouton cosmétique dans l’éditeur. L’inpaint rattrape une main ; il ne remplace pas un detailer. |
| **F5.4** | `edit_workflow` SDXL | Reporté tant que F5.1–F5.2 n’existent pas sur Flux. `rpg-personnage` reste `null` + raison honnête. |
| **F5.5** | `"flux+edit"` → flag de palier | Quand un second pack édite. Pas par hygiène seule. |

---

## F6 — Filet V1 (glissé, pas oublié)

À prendre quand une session F touche le même fichier, ou en fin de F1.

- Sas API : `currentCharacter()` = `null` sans `?character=`
- `/img/base` borné (fiche + cartes registre)
- Colonne / vocabulaire `espace = 'sfw'` en base + `mesures.json` (collision de noms)
- Pillow dans l’environnement de test (`/img?thumb=` → 500 aujourd’hui)
- Liste des raccourcis (`f`, etc.) sur l’écran Application
- **Subgraphs ComfyUI illisibles par le runner** — `ui_to_api.convert` ne
  déplie pas `definitions.subgraphs` : le type du nœud est un UUID, la
  conversion sort en `KeyError: noeud inconnu du serveur`. Touche déjà
  `experiments/image_krea2_turbo_t2i.json` (Krea-2 Turbo) et les deux LTX-2.3
  de `nsfw/`. Aucun graphe de production V1 concerné, donc rien de cassé
  aujourd’hui — mais **tout graphe créé dans le ComfyUI moderne** risque d’en
  contenir sans qu’on l’ait voulu, et §2 (« lus, jamais réécrits ») interdit
  de s’en sortir en aplatissant le fichier à la main. À prendre avant F5.2
  (inpaint), qui sera vraisemblablement écrit dans l’UI récente.

---

## Hors finition

Reste au catalogue `ROADMAP.md` (V2 / V3), **pas** dans cette file :

- Wan 2.2, ACE-Step, vidéo NSFW
- Mise en scène multi-personnages
- Univers « art pur »
- Poster Instagram réel
- Éditeur de graphe dans le cockpit
- React / Tailwind / ORM « pour plus tard »

---

## File des 8 prochaines sessions

```text
1  F1.1 + F1.3     Revue / Galerie + ouvrir un nom
2  F1.2            Fiche navbar
3  F3.1–F3.3       Éditeur optique (crop off, sliders, versions)
4  F2.1            Cartes + éditeur d’une scène
5  F2.2 + F4       Poses clean + fragments + pose au run
6  F2.3            Éditeur d’articulations
7  F5.1            Lot NSFW GPU Léna
8  F5.2            Inpaint Flux
```

F2.4, F5.3, F6 : dès qu’une session a deux heures de rab, ou qu’un trou bloque.

---

## Definition of done — « vrai studio » (avant Wan)

- On ne confond plus *attendre un tri* et *regarder une planche*.
- On ne choisit pas un personnage dans la navbar.
- Une scène s’édite comme une fiche, pas comme un dump JSON.
- Générer = scène + texte + pose, **visibles**.
- Ouvrir l’éditeur n’impose pas un recadrage.
- Corriger une zone (main) produit un **second** fichier chez le cid.
- Un pack sans outil le dit ; il ne répond pas 400.

Quand cette liste est vraie, Wan a un endroit où atterrir. Avant, il n’en a pas.
