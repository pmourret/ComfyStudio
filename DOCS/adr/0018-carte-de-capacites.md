# ADR-0018 : Carte de capacités — une entrée par id, jamais un champ par outil

## Statut

Accepté (2026-09-03).

## Contexte

Un pack déclarait deux champs nommés en dur dans `universe.json` :
`workflow` (graphe de production, jamais absent) et `edit_workflow` (graphe
d'édition, nullable — ADR-0013). Chaque futur outil de pack aurait ajouté le
sien : `pose_workflow`, `inpaint_workflow`, … — un champ par outil, à
chaque fois.

Symptôme déjà mesuré dans `ROADMAP.md` (« Reste après J7 ») : la chaîne
littérale `"flux+edit"` servait, dans `creative.json` / `intensity[].pipeline`
et dans une dizaine de comparaisons qui la lisaient, à dire « ce palier
édite ». Elle ne fonctionnait que parce que flux est aujourd'hui l'unique
pack éditeur — un second pack éditeur (`sdxl+edit`) aurait cassé toutes les
comparaisons à la fois, puisque chacune aurait dû connaître le nom de
chaque famille de modèle capable d'éditer.

ADR-0017 (J8.1) pose que plateforme et pack ont tous deux le droit de porter
un graphe, monde et personnage jamais — mais ne dit rien de la **forme**
sous laquelle un graphe est déclaré. C'est cette ADR-ci qui la fixe, pour le
pack en premier (J8.2) et pour que la plateforme (J8.4) s'y range sans la
changer.

## Décision

`universe.json` gagne `capabilities` : un dict, clé = identifiant de
capacité, valeur = `{graph, roles}`.

```json
"capabilities": {
  "produce": { "graph": "...", "roles": [] },
  "edit":    { "graph": "...", "roles": ["source", "ref", …] }
}
```

- **Une capacité absente est une clé absente**, jamais une valeur `null`.
  C'est le même principe que `edit_workflow: null` avant elle (ADR-0013),
  rendu générique : un outil sans capacité disparaît de l'interface, il n'est
  jamais grisé (CLAUDE.md §6).
- **`graph`** : chemin repo-relatif, résolu depuis le pack — jamais depuis le
  personnage (CLAUDE.md §8.11, inchangé).
- **`roles`** : liste déclarative des noms de rôles que le graphe fournit.
  Volontairement **dissymétrique** entre les deux capacités du jour :
  - `edit` porte la liste réelle, copiée de `NsfwRunner.__init__`
    (`nsfw_batch.py`) — la seule donnée qui n'existait nulle part ailleurs
    sous forme structurée ; la déclarer ici ajoute une vraie source.
  - `produce` porte `[]` : ses rôles sont déjà possédés par
    `REQUIRED_ROLES` de l'implémentation d'identité du pack
    (`AUTOMATION/identity/pulid_flux.py` / `lora_sdxl.py`, référencée par le
    champ `identity`). Les dupliquer ici créerait une deuxième source de
    vérité pour la même donnée.
  - Ni l'un ni l'autre n'est encore **consommé** par le runner ou par
    `wf_check.py` : c'est de la documentation structurée aujourd'hui, pas un
    branchement. Câbler `roles` dans la résolution réelle des nœuds serait un
    chantier à part, en tension avec la garantie « chemin de production
    byte-identique » de celui-ci.
- **`PRODUCE = "produce"` et `EDIT = "edit"`** (`AUTOMATION/universe.py`)
  sont l'unique source de vérité du vocabulaire des ids de capacité — le même
  vocabulaire que `creative.json` / `intensity[].pipeline` utilise désormais
  pour dire quelle capacité un palier invoque (migration ADR-0018 / J8.2 :
  `"flux"` → `"produce"`, `"flux+edit"` → `"edit"`, `"sdxl"` → `"produce"`).

## Alternatives envisagées

- **Garder des champs nommés par outil** (`workflow`, `edit_workflow`,
  `futur_outil_workflow`, …) — écarté : c'est précisément le problème que
  cette ADR ferme. Un champ de plus à chaque outil, et une chaîne préfixée
  par famille (`"flux+edit"`, puis `"sdxl+edit"`, …) à chaque comparaison.
- **`edit_workflow` gardé nullable plutôt qu'absent** — écarté : `null` est
  une clé qui existe et qu'il faut lire pour découvrir qu'elle ne sert à
  rien ; l'absence se découvre par un simple test d'appartenance, cohérent
  avec le reste du registre (`exists()`, `load_tools()`).
- **Peupler `roles` pour `produce` en dupliquant `REQUIRED_ROLES`** — écarté :
  deux sources de vérité pour la même liste divergent tôt ou tard sans que
  rien ne le signale.
- **Câbler `roles` dans la résolution réelle des nœuds dès ce chantier** —
  écarté : toucherait le chemin d'exécution réel (`NsfwRunner.__init__`,
  `WorkflowRunner._roles()`), en tension directe avec la garantie « byte-
  identique » que ce chantier doit tenir. Prochaine étape possible, pas
  celle-ci.

## Conséquences

- `AUTOMATION/universe.py` : `workflow()` / `edit_workflow()` /
  `require_edit_workflow()` / `EditToolUnavailableError` disparaissent,
  remplacés par `capabilities()` / `capability()` / `capability_graph()` /
  `require_capability()` / `CapabilityUnavailableError`.
- `services/creative.py` gagne `is_edit_tier(tier)` — l'unique endroit qui
  compare `pipeline` à `EDIT` ; tous les autres appelants (routers, services,
  et son pendant frontend `isEditTier`) l'utilisent plutôt que d'inliner la
  comparaison.
- Migration de données : deux `universe.json` (mécanique, versionnés), deux
  `character_defaults.json` (mécanique, versionnés), et un script idempotent
  pour les `CHARACTERS/*/creative.json` déjà existants (hors dépôt,
  ADR-0005).
- J8.4 (couche plateforme) doit pouvoir déclarer ses propres capacités
  (éditeur de pose, éditeur d'expression) dans une forme `{graph, roles}`
  identique — cette ADR engage explicitement que le schéma ne bouge pas pour
  ça. Où ces entrées plateforme vivent (fichier séparé, fusion avec la carte
  du pack à la lecture) reste à trancher en J8.4, pas ici.
