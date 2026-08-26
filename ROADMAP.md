# ROADMAP — Plateforme multi-personnage

Document vivant, pas figé. Méthode : jalons courts, chaque jalon livrable et
testé seul — pas de big-bang (cf. `CLAUDE.md`, §10).

## V1 — Fondations : généraliser sans perdre l'existant

Objectif : le repo Léna devient la plateforme, avec **deux univers réels** qui
prouvent la généralisation — pas juste Léna renommée.

**J0 — Stabiliser avant de forker**
- Commit du travail en cours (bloquant, déjà identifié)
- Migration base = source de vérité + test de cohérence disque ↔ base

**J1 — Nouveau repo**
- Fork vers le nouveau repo depuis l'état stabilisé de J0
- Séparation données personnelles (`CHARACTERS/*`, réglages NSFW, assets
  d'identité) / code versionné — prépare le futur passage en public

**J2 — Découpage + généralisation du cœur**
- Découpage des deux monolithes (`web/app.py`, `lena_batch.py`) avec
  `character_id` introduit dans le même mouvement
- Base unique, schéma commun, colonne `character_id`

**J3 — Frontend**
- Passage en modules ES, plus de globales partagées entre fichiers
- Design system minimal commun
- Sélecteur de personnage (rechargement simple `?character=`)

**J4 — Registre univers + registre personnage**
- Registre univers : id, famille de modèle / mécanisme d'identité, panel
  d'outils
- Univers `instagram-influenceur` (Flux + PuLID) ← Léna, portée telle quelle
- Univers `rpg-personnage` (SDXL/Pony + LoRA/IPAdapter) ← Abyssiaelle,
  première implémentation réelle
- Registre personnage : univers associé, type(s) de contenu actifs
  (registre de création), NSFW on/off (off par défaut)
- Le registre de création liste les types de contenu (image, vidéo, voix,
  mise en scène à plusieurs) comme des types **communs à tout univers** —
  pas propres à un univers en particulier. En V1, seul `image` est actif ;
  `vidéo` et `voix` existent comme types déclarés mais inactifs, pour les
  deux univers (influenceur et RPG-personnage), afin de ne pas avoir à
  retoucher ce registre quand ils s'activeront en V2

**J5 — Style figé + verrou d'identité par univers**
- Style de sortie choisi et figé à la création du personnage, non
  modifiable ensuite (confirmé)
- `AUTOMATION/identity/` avec deux implémentations : `pulid_flux.py`,
  `lora_sdxl.py`

**J6 — Premier personnage RPG (Abyssiaelle) opérationnel**
- `build_jobs` + assembleur de prompt, verrouillé par un test byte-exact
  (comme Léna)
- Banque de scènes comme outil de son univers, création manuelle par
  l'utilisateur (pas de génération LLM déclarative — confirmé)

**J7 — NSFW généralisé comme outil, pas comme branche**
- Flux confirmé : génération de personnage → sélection manuelle de l'image
  → reprise en NSFW → édition par IA → retouche
- Recomposé à partir des outils déjà prévus (modification live par IA +
  éditeur d'image) — pas de sous-système séparé
- Réglage dans le paramétrage de l'app, off par défaut

## V2 — Extensions

- Mise en scène de plusieurs personnages ensemble (verrous d'identité
  multiples actifs simultanément dans une même génération)
- Univers "art pur"
- Vidéo (Wan 2.2) et voix (ACE-Step) intégrées au pipeline généralisé, pour
  l'influenceur comme pour le RPG-personnage — le registre de création les
  a déjà déclarées en V1 (J4), il reste à brancher les workflows
- Vidéo NSFW

## V3 / plus tard

- Univers "monde RPG" complet (lore, carte, PNJ secondaires, histoire,
  dialogue, persistance) — mini-application à part entière, pas un outil
  parmi d'autres
- **Intégration MCP** : exposer les actions de la plateforme (créer une
  scène, lancer une génération, consulter le contenu d'un personnage) comme
  outils MCP pour des assistants généralistes. À garder en tête dès la V1
  dans la conception de l'API interne (routes propres, typées, sans effet
  de bord caché) pour que l'exposition MCP soit un ajout plus tard, pas une
  réécriture
- Passage du dépôt en public (dépend de la séparation données/code posée
  en J1)

## Exigence transverse — pas un jalon, continue sur tous les jalons

Qualité et repérabilité des bugs (backend et frontend) :
- Pas de commit sans test du module touché (déjà posé)
- Logs structurés plutôt que prints épars
- Erreurs remontées explicitement à l'interface plutôt qu'échouées en
  silence
- Health-check étendu au niveau plateforme (pas seulement Léna), une fois
  la base = source de vérité en place (J0)
