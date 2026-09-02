---
name: nouvel-outil
description: A utiliser pour ajouter un outil ou un ecran au studio - un raccourci du panel (tools.json + rail) qui pointe vers une surface existante, OU un ecran/module neuf construit de zero (gabarit pose/expression : backend en etapes, ecran dedie, point d'entree, audit UX/UI). Decider lequel avant d'ecrire du code.
---

# Ajouter un outil ou un écran au studio

## Deux patrons, pas un seul

Le mot « outil » a recouvert deux choses différentes dans ce studio :

1. **Outil du panel** (`tools.json` + rail) — un raccourci déclaré, affiché
   dans le rail d'outils de Produire, qui pointe vers une **surface qui
   existe déjà** (une sous-vue de la Banque, un écran de la Revue).
   N'implémente rien de nouveau par lui-même.
2. **Écran/module de studio** — un vrai module neuf, backend + écran React,
   construit de zéro. Le gabarit suivi trois fois de suite (éditeur de
   pose, éditeur d'expression, sous-vue Tons de la Banque) — voir le
   patron 2 plus bas, désormais **le gabarit standard** pour tout nouvel
   outil du studio (créateur de lumière, importeur d'assets, etc.).

Décider LEQUEL avant d'écrire une ligne : un outil qui n'existe encore nulle
part suit le patron 2. Une fois construit, il peut ENSUITE gagner une
entrée de patron 1 si Produire doit y accéder en un clic — le patron 1 ne
remplace jamais le patron 2, il s'ajoute par-dessus une fois la surface
prête (voir « Point d'entrée découvrable » plus bas).

## Patron 1 — Outil du panel (tools.json + rail)

### Décider la portée avant d'écrire du code

- **Outil global** : utile à tout univers (ex. édition d'image, modification
  live par IA). Ne pas dupliquer un outil global existant pour un univers en
  particulier — vérifier `DOCS/architecture.md` §5 avant d'en créer un nouveau
- **Outil propre à un univers** : n'a de sens que dans ce monde (ex. un
  éditeur de lore pour un univers narratif). Reste déclaré uniquement dans
  le(s) `tools.json` de cet/ces univers

Un outil peut démarrer propre à un univers et devenir global plus tard si un
second univers en a l'usage — mais ce n'est jamais l'inverse (ne pas
construire "global" par précaution si un seul univers l'utilise aujourd'hui).

### Contrat

Une entrée de `tools.json` (`UNIVERS/<nom>/tools.json`) : `id`, `label`,
`scope` (`global`/`universe`), `surface` — la SEULE chose que le rail sait
interpréter (`chrome/ToolRail.tsx`, table des surfaces connues), jamais un
`if` sur le personnage ou l'univers (`CLAUDE.md` §7). Une surface absente de
cette table rend un bouton inerte qui dit pourquoi — on n'invente jamais une
destination qui n'existe pas.

Si l'outil touche un workflow ComfyUI (création, édition, appel), suivre le
skill `workflow-comfyui` pour le contrat de lecture des workflows et la
validation (`wf_check.py`).

### Enregistrement

Ajouter l'entrée dans le(s) `tools.json` concerné(s) plutôt que de modifier
le Dashboard au cas par cas pour un personnage ou un univers particulier.
C'est cette étape qui rend l'outil visible dans le panel — un outil
implémenté mais non enregistré n'apparaît nulle part, et c'est voulu
(permet de merger le code avant de l'activer).

### Checklist (patron 1)

- [ ] Portée décidée (global vs univers spécifique), pas de duplication
      d'un outil global existant
- [ ] `surface` pointe vers un écran qui existe réellement
- [ ] Enregistré dans le(s) `tools.json` concerné(s)

## Patron 2 — Écran/module de studio (gabarit standard)

### Repérer avant d'écrire

Chercher l'existant avant d'inventer : un composant partagé dans `chrome/`
qui fait déjà ce qu'il faut (`LightboxContext`, `ConfirmContext`,
`ToastContext`, `HintLayer`, `UndoRedoButtons` de `pose-editor/` — générique
malgré son dossier, sans couplage à la pose), un contrat backend déjà posé
pour un besoin voisin. Un composant partagé cassé ou incomplet se répare
plutôt que de se contourner par une copie locale — trouvé en vérifiant,
pas en supposant (le Lightbox n'avait plus aucun style depuis la migration
React, découvert en cliquant dessus pour de vrai, pas en le lisant).

### Découpage de l'écran (frontend.md, rappelé ici car central au gabarit)

    Screen.tsx     composition et mise en page — il rend, il ne décide pas
    useXxx.ts      l'état et les gestes : chargement, mutations, clavier
    Xxx.tsx        présentation pure — props + callbacks, aucun appel API

Une structure fixe du modèle/node (bornes d'un node ComfyUI, topologie d'un
squelette) va dans son propre fichier, mirroré depuis le Python — ce n'est
PAS un seuil métier en dur (`CLAUDE.md` §4 ne s'applique pas à une
constante du modèle, seulement à une décision de qualité/métier).

### Mode Plan avant tout code multi-fichier

Dès qu'une tâche touche plus d'un fichier ou une décision d'architecture
(articulation du backend, où vit l'état, quel composant partagé réutiliser),
passer en mode Plan et obtenir l'accord avant d'écrire du code.

### Construction en étapes séparées, jamais un big-bang

1. **Fondation backend** — route(s) + service(s) neufs, jamais de logique
   métier dans le router (`.claude/rules/backend.md`). Si l'écran a un
   rendu/aperçu : distinguer explicitement une fonction NON-DESTRUCTIVE
   (aperçu, jamais d'écriture sur l'original) d'une fonction de PRODUCTION
   (qui écrit réellement) — les deux peuvent partager un cœur factorisé,
   mais le contrat de chacune s'écrit noir sur blanc dans sa docstring.
   Toute exception d'un `run_in_executor` est attrapée **dans la route**
   (`backend.md` — un défaut de Starlette fait raccrocher la réponse sinon).
   Test d'isolation `character_id` écrit ET vérifié contre le studio réel
   (`python_embeded`, jamais seulement le venv de dev qui n'a pas `cv2`) si
   l'étape touche l'identité ou un rendu.
2. **Écran dédié** — le découpage ci-dessus, réutilise le design system
   commun et les composants `chrome/` partagés plutôt que d'en réinventer.
3. **Point d'entrée découvrable** — un écran atteignable seulement par une
   URL tapée à la main n'est pas fini. Une sous-vue de Banque (même patron
   Scènes/Poses/Tons) ou une entrée de patron 1 (`tools.json`) selon le cas.

Chaque étape : suite de fumigations complète rejouée verte + test
d'isolation avant de commiter ; `python AUTOMATION/tools/toolchain.py build`
avant de tester via un dashboard (lancé par `run_browser_tests.py` ou à la
main) — le serveur sert le bundle **construit**, pas les sources (piège
vécu : un écran neuf invisible parce que seul `typecheck` avait tourné,
jamais `build`). Push seulement sur demande explicite, jamais automatique
après un commit.

### Audit UX/UI systématique en fin de chantier

Le skill `audit-ux-ui` se déclenche à la fin de la construction d'un écran
neuf, **pas seulement sur demande** : vérifié EN VRAI (captures d'écran,
mesures DOM, rendu réel contre ComfyUI si le parcours touche l'identité —
voir ce skill), findings corrigés, suite rejouée verte, avant de considérer
l'écran fini. Deux bugs réels de l'éditeur d'expression (cache d'exécution
ComfyUI, aperçu périmé après changement de photo) étaient invisibles à la
lecture du code et n'ont été trouvés qu'ainsi.

### Documentation

`ROADMAP.md` reçoit une entrée par étape, avec le POURQUOI des décisions et
les bugs réels trouvés en testant (pas seulement en relisant) — c'est ce
qui permet de retrouver un piège générique (le cache d'exécution ComfyUI,
par exemple) la fois suivante sans le redécouvrir. Suivre le ton et le
niveau de détail déjà en place dans les entrées de l'éditeur de pose et de
l'éditeur d'expression.

### Checklist (patron 2)

- [ ] Repéré ce qui existe déjà (composants `chrome/`, contrat backend
      voisin) avant d'écrire — réparé plutôt que contourné si cassé
- [ ] Mode Plan pour toute décision multi-fichier, accord obtenu avant le
      code
- [ ] Étapes séparées, un commit thématique par étape
- [ ] Fonctions non-destructives et de production distinguées si l'écran
      touche un rendu
- [ ] Exceptions de `run_in_executor` attrapées dans la route
- [ ] Test d'isolation `character_id`, vérifié contre le studio réel si
      identité/rendu impliqués
- [ ] `toolchain.py build` avant tout test via dashboard
- [ ] Suite complète de fumigations verte avant chaque commit
- [ ] Point d'entrée découvrable ajouté (sous-vue Banque ou `tools.json`)
- [ ] Audit UX/UI (`audit-ux-ui`) passé et ses findings corrigés
- [ ] `ROADMAP.md` documenté, étape par étape
- [ ] Push seulement si demandé explicitement

## Isolation des données (les deux patrons)

Un outil ou un écran qui lit/écrit des données de personnage passe toujours
par `character_id` explicite — jamais une variable globale ou un contexte
implicite qui suppose "le personnage courant". Écrire un test qui aurait
détecté un mélange de données entre deux personnages si l'outil manipule
des données par personnage (`CLAUDE.md`, section Méthode ; `backend.md`).
