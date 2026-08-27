# ADR-0009 : Score d'identité neutre et post-édition — deux `genre` distincts

## Statut

Accepté (2026-08-26, implémenté avant le fork J1 ; formalisé ici le 2026-08-27)

## Contexte

La table `score` (`AUTOMATION/base.py`) a pour clé `(image_id, genre)` : une
seule valeur par image et par type de mesure. Le contrôle d'identité pose un
problème particulier à ce modèle : la mesure d'identité n'est pas neutre
vis-à-vis de l'expression du visage (`AUTOMATION/expression.py`) — sur la
base gelée elle-même, à identité rigoureusement constante, un visage neutre
mesure 0.910, un sourire franc 0.824, un rire 0.627. Le pipeline pose donc
l'expression **après** le verdict de tri (voir la docstring d'`expression.py`
pour le détail du raisonnement), puis re-mesure l'image éditée pour
surveiller la dérive — ce qui produit une **seconde** valeur d'identité pour
la même image.

Si cette seconde mesure était écrite sous le même `genre = "identite"`, elle
écraserait, via l'upsert d'`enregistrer_score` (`ON CONFLICT ... DO UPDATE`),
la valeur neutre qui a réellement décidé du bucket (`OK` / `A_REVOIR` /
`REJET`). La bande de seuils (0.72–0.78) cesserait alors de vouloir dire
quoi que ce soit pour toute image ayant reçu une expression, sans qu'aucun
recalibrage ne l'explique.

## Décision

Deux valeurs de `genre` distinctes, jamais l'une à la place de l'autre :

- `identite` — le score neutre, mesuré avant toute édition d'expression.
  **Seul** à décider du bucket et à alimenter les bandes de seuils
  (`config.json`, `qc.threshold_*`). Jamais écrasé par une mesure
  ultérieure.
- `identite_apres_expression` — le score sur l'image éditée. Enregistré
  pour la surveillance (une série qui dérive anormalement le montre), mais
  **jamais lu par le tri**. Même règle appliquée à `identite_centroide`
  (`base.rescorer`) : un troisième `genre`, jamais un écrasement du premier.

C'est `AUTOMATION/lena_batch.ranger_mesures` qui écrit les deux valeurs côte
à côte pour chaque image, et `mesures.json` (`AUTOMATION/mesures.py`) suit le
même schéma de clés en parallèle de la base. `tests/test_coherence_base.py`
vérifie que les deux stores restent d'accord sur les deux `genre`.

## Alternatives envisagées

- **Ajouter une colonne au modèle** (ex. `moment` dans la clé composite,
  `(image_id, genre, moment)`) — écarté : aurait demandé une migration de
  schéma pour un problème que la colonne `genre` existante résout déjà sans
  rien changer à sa forme. Une valeur de `genre` de plus est une donnée, pas
  un changement de modèle.
- **Ne garder que la valeur neutre en base, laisser le post-édition dans
  `mesures.json` seul** — écarté : `base.py` est appelé à devenir la source
  de vérité en lecture (voir son en-tête) ; y omettre une mesure que
  `mesures.json` porte réintroduirait l'écart que la migration base visait
  justement à supprimer (le constat qui a motivé J0 : une base en retard sur
  le disque ne se voit pas tant que rien ne la compare).

## Conséquences

Toute future mesure d'identité prise à un autre moment du pipeline (par
exemple une re-mesure après une passe NSFW) suit le même principe : un
nouveau `genre` explicite, jamais une réécriture de `identite`. C'est un
axe orthogonal à `character_id` (J2) — la clé devient `(image_id, genre,
character_id)` implicitement via `image.character_id`, sans que la logique
décrite ici ne change.
