# ADR-0002 : Le verrou d'identité appartient à l'univers, pas au personnage

## Statut

Accepté (2026-08-26)

## Contexte

Léna (Flux + PuLID) et Abyssiaelle (SDXL/Pony + LoRA de personnage)
utilisent des mécanismes de cohérence de visage structurellement
différents — pas seulement des réglages différents du même mécanisme.

## Décision

`AUTOMATION/identity/` est une interface (`apply(job, character)`), avec
une implémentation par famille de modèle d'univers
(`pulid_flux.py`, `lora_sdxl.py`). L'univers choisit l'implémentation ;
le personnage ne fournit que ses réglages mesurés et ses assets de
référence à l'intérieur de ce mécanisme.

## Alternatives envisagées

- **Un mécanisme unique imposé à tous les personnages** — écarté : aurait
  sacrifié le pipeline déjà fonctionnel d'Abyssiaelle (PonyRealism, LoRA
  déjà entraînée) pour une fausse simplicité côté code.
- **Le choix du mécanisme au niveau du personnage** plutôt que de
  l'univers — écarté : permettrait à deux personnages du même univers de
  diverger de famille de modèle, ce qui casse la prémisse qu'un univers
  partage un même outillage.

## Conséquences

Ajouter un univers implique de choisir/implémenter son mécanisme
d'identité une fois. Ajouter un personnage dans un univers existant ne
touche jamais `AUTOMATION/identity/`. La couche de mesure (scoring
InsightFace) reste commune aux deux implémentations.
