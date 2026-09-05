# Rétro — Phase 2 : Clôture V1 (P2.1 → P2.4)

Écrite à chaud le 05/09/2026, les quatre étapes closes le jour même.
Cadrage : `DOCS/cadrage/2026-09-05-phase-2-cloture-v1.md`.

## 1. Qu'a-t-on livré qui n'était pas prévu ?

- **Un vrai bug de production**, trouvé en vérifiant qu'aucun autre
  échec ne se cachait derrière l'étiquette « connu, sans rapport »
  (P2.1) : le bouton « Mesurer » de la revue n'écrivait les scores de
  réalisme que dans `mesures.json`, jamais en base, contrairement à la
  génération normale. Le diagnostic de départ (« dépendance cv2/Pillow
  manquante ») était d'ailleurs faux — le vrai bug était
  `test_bench.py`/`test_platform_capabilities.py` confondant « ComfyUI
  joignable » et « cv2 disponible dans cet interpréteur ».
- **Un vrai bug UX**, trouvé en marchant réellement sur les six écrans
  du parcours nominal (P2.3) plutôt qu'en lisant le code : la porte
  d'entrée affichait une pastille rouge « état indisponible » alors que
  ComfyUI tournait normalement, pile à l'aha moment de `PROJET.md`.
- **Deux corrections annexes** trouvées au passage : un test resté sur
  l'ancien contrat sans `?character=`, et la reconnaissance des copies
  éditées (colonne `source`) comme lignes de base expliquées plutôt
  qu'orphelines.
- **La rétro de phase 1**, manquante malgré trois références qui la
  citaient comme si elle existait — reconstituée dans le même geste que
  celle-ci (voir son propre fichier).

## 2. Qu'est-ce qui était prévu et qui n'a pas été livré ?

- Rien dans le périmètre P2.1-P2.4 lui-même : les quatre étapes ont
  toutes été closes le jour même, sans report.
- Un point de P2.3 reste **vérifié à la lecture du code seulement, pas
  en vrai** : le rendu exact de « ComfyUI hors ligne » une fois un
  personnage chargé ET ComfyUI réellement injoignable. L'aurait exigé
  d'arrêter la vraie instance ComfyUI de ce poste pendant l'audit —
  écarté plutôt que de couper un service réel pour une vérification
  d'écran. Le code distingue bien ce texte de « état indisponible »,
  mais la preuve reste indirecte.
- Le graphe d'édition SDXL pour `rpg-personnage` (Abyssiaelle) reste à
  écrire — décision P2.4 assumée non bloquante, noté en `BACKLOG.md`,
  pas un report caché.
