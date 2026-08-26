# ROADMAP — Plateforme multi-personnage

Document vivant, pas figé. Méthode : jalons courts, chaque jalon livrable et
testé seul — pas de big-bang (cf. `CLAUDE.md`, §10).

## V1 — Fondations : généraliser sans perdre l'existant

Objectif : le repo Léna devient la plateforme, avec **deux univers réels** qui
prouvent la généralisation — pas juste Léna renommée.

**J0 — Stabiliser avant de forker** ✅ *(terminé 2026-08-26)*
- Commit du travail en cours (bloquant, déjà identifié)
- Migration base = source de vérité + test de cohérence disque ↔ base
- Résultat : 10 commits thématiques, base migrée (66→86 images, 1→11
  jugements), test de cohérence vérifié contre l'état pré-migration — a
  trouvé un 3ᵉ écart non vu en revue (tri désynchronisé sur 22 fichiers,
  faussait les badges de comptage). 8 suites de tests vertes hors GPU.
- Ouvert, à trancher avant que `J2` touche le schéma : clé `(image_id,
  genre)` porte deux mesures concurrentes (QC neutre vs. re-mesure
  post-édition) — pas une décision de séquencement, une décision de
  modèle de données
- Opérationnel pour `J1` : `PROD/lena.db` est git-ignoré, ne voyage pas
  avec le repo — un fork doit régénérer la base via `migrer_base.py`,
  pas copier le fichier

**J1 — Nouveau repo** ✅ *(terminé 2026-08-26)*
- Fork vers le nouveau repo depuis l'état stabilisé de J0
- Séparation données personnelles (`CHARACTERS/*`, réglages NSFW, assets
  d'identité) / code versionné — prépare le futur passage en public
- Résultat : 6 commits thématiques, 90 fichiers suivis, aucune donnée
  personnelle dans l'historique (vérifié `--all`). Base régénérée via
  `migrer_base.py`, `test_coherence_base.py` vert. Repo Léna intact
  (copie, pas déplacement).
- **Point structurel trouvé, à traiter en premier à `J2`** : 8 modules
  déduisent le chemin de l'installation ComfyUI par position relative sur
  le disque (`Path(__file__).parents[N]`) — fonctionnait tant que le repo
  vivait dans `ComfyUI/output/`, casse maintenant qu'il en est sorti.
  Fix attendu : chemin ComfyUI explicite (variable d'environnement ou
  entrée de config), pas une traversée de dossiers recalculée — sans ça,
  le problème revient dès que quelqu'un d'autre clone le repo (Mission :
  passage en public), pas seulement à ce déplacement-ci
- Embeddings/centroïde non régénérés ici (`backfill_embeddings.py`
  demande le GPU) — à lancer une fois qu'une génération réelle démarre
  dans ce repo
- Audit des skills Léna vs ComfyStudio fait, **écarts portés** (3 commits) :
  `workflow-comfyui` gagne ses deux références manquantes
  (`format-ui-mecanique.md`, `protocole-identite.md`), et les deux skills
  sans équivalent sont créés (`comfyui-custom-nodes`,
  `image-realism-check`). Portage vérifié contre le code de ce repo, pas
  recopié : trois divergences avec la doc amont corrigées au passage
  (journal CSV → base SQLite, sonde de netteté ad hoc → `qc_realisme.py`,
  plancher d'identité 0.55 → 0.60 conformément à `qc_identity.py`)
- Fixture du test byte-exact récupérée et versionnée
  (`AUTOMATION/tests/fixtures/scenes-byte-exact.json`) : elle n'avait pas
  suivi le fork, donc l'invariant §8.3 n'était plus tenu par rien depuis
  `J1`. Le test tourne de nouveau, 26 jobs comparés à l'octet près
- Reste ouvert pour `J2` : `qc.threshold_high` (0.74) est déclaré
  provisoire dans `config.json` et n'est adossé qu'à 10 mesures — à
  recalibrer quand la base aura assez de lignes

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
