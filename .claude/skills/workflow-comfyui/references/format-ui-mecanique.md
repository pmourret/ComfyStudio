# Mécanique interne du format UI

Consulté par le skill `workflow-comfyui` avant toute édition d'un fichier
`_ui.json` **à la main** plutôt que via l'interface ComfyUI. L'interface
maintient seule les invariants décrits ici ; un script qui écrit du JSON
doit les tenir lui-même, et aucun ne produit d'erreur explicite quand il
est rompu.

Tout ce qui suit est vérifié contre `AUTOMATION/ui_to_api.py` de ce repo —
c'est ce convertisseur qui lit réellement les graphes à l'exécution, pas la
documentation amont de ComfyUI.

## Reconnaître le format avant de toucher quoi que ce soit

- **UI** : `{last_node_id, last_link_id, nodes[], links[], groups[], extra,
  version}` — `nodes` est une **liste**, `node["id"]` un **entier**.
- **API** : dict plat `{"12": {"class_type", "inputs", "_meta"}}` — les
  clés sont des **chaînes**, un input lié s'écrit `["12", 0]`.

`convert()` produit `api[str(nid)]` et `[str(r[0]), r[1]]` : la
stringification des IDs se fait à la conversion. Appliquer la règle d'un
format dans l'autre est l'erreur la plus fréquente sur ce genre de repo.

## Les liens sont écrits en trois endroits, tous à tenir cohérents

Une entrée de `workflow["links"]` est un tableau **positionnel** :

```
[link_id, origin_node_id, origin_slot, target_node_id, target_slot, "TYPE"]
```

Le même lien est recopié aux deux extrémités du graphe. Les trois copies
doivent rester d'accord :

| Emplacement | Forme | Non connecté |
|---|---|---|
| `workflow["links"]` | l'entrée ci-dessus | absent de la liste |
| `nodes[origin]["outputs"][slot]["links"]` | **liste** de `link_id` | `[]` ou `null` |
| `nodes[target]["inputs"][slot]["link"]` | **scalaire** `link_id` | `null` |

**Piège propre à ce repo** : `convert()` ne lit que deux des trois copies —
`links[]` (pour `src_of`) et `inputs[].link` (pour câbler chaque nœud). Il
ne consulte **jamais** `outputs[].links`. Un `outputs[].links` désynchronisé
passe donc la conversion, passe `wf_check.py`, produit un batch correct — et
ne casse qu'à la réouverture du fichier dans l'interface ComfyUI, longtemps
après l'édition qui en est la cause. Ne pas s'appuyer sur la validation pour
détecter cette faute : la tenir en écrivant.

`FRONTEND_ONLY = {Note, MarkdownNote, Reroute, PrimitiveNode}` est retiré à
la conversion. Un `Reroute` n'existe donc pas côté API : il est traversé
comme un nœud bypassé, avec les mêmes limites qu'au paragraphe bypass.

## `last_node_id` / `last_link_id` — compteurs à incrémenter soi-même

Ajouter un nœud : `new_id = last_node_id + 1`, **puis incrémenter
`last_node_id`**. Idem pour chaque nouveau lien avec `last_link_id`.

`convert()` ignore complètement ces deux champs. Un compteur laissé en
arrière passe donc tous les contrôles hors ligne. Le dégât arrive plus
tard, dans l'interface : ComfyUI alloue le prochain ID à partir du
compteur, réattribue un ID déjà pris, et deux nœuds se marchent dessus dans
un fichier qui était « validé ». Symptôme typique : un lien qui saute vers
un nœud sans rapport après une édition faite dans l'interface.

## Modes de nœud : 0 actif, 2 mute, 4 bypass

Ce ne sont pas trois nuances du même mécanisme :

- **`0` — actif.** Le nœud sort en API.
- **`2` — mute.** Le nœud est retiré **et le lien est coupé net**. L'input
  qui en dépendait est supprimé du dict `inputs` du nœud aval. Si cet input
  était requis, l'erreur remonte de ComfyUI à l'exécution, pas de la
  conversion.
- **`4` — bypass.** Le nœud est retiré mais **le signal le traverse** :
  `resolve()` remonte la chaîne des bypassés jusqu'à une vraie source.

La traversée de bypass suit la même règle que le frontend
(`_getBypassSlotIndex`) : l'entrée de **même index** si son type correspond,
la première entrée du bon type seulement en repli. Sans la priorité au même
index, un nœud à plusieurs sorties de même type (`ControlNetApplyAdvanced` :
`positive` + `negative`) verrait toutes ses sorties retomber sur sa première
entrée — le graphe se convertirait sans erreur, avec le mauvais câblage.

Un bypass ne traverse pas toujours : pas d'entrée du bon type, entrée non
connectée, ou nœud `FRONTEND_ONLY` sur le chemin → `resolve()` rend `None`
et l'input disparaît silencieusement du nœud aval. Vérifier ce que devient
une chaîne bypassée plutôt que de le supposer.

Convention du repo : ce qui est optionnel est livré **en bypass (4)** dans
le fichier, et c'est l'orchestration qui l'active par job (`node_modes`) ou
par groupe (`active_groups`) — jamais un second fichier de workflow.

## `widgets_values` est positionnel, et l'ordre ne vient pas du fichier

`node["widgets_values"]` est une **liste sans noms**. `_widget_values()` la
réassocie en lisant l'ordre des inputs déclarés **côté serveur**
(`/object_info`, `required` puis `optional`, filtré sur ce qui est un
widget). Conséquences :

- L'ordre de référence n'est pas dans le JSON. Copier `widgets_values`
  depuis une **instance existante du même type** plutôt que de le
  reconstruire de mémoire.
- Un widget `INT` de seed (`seed`, `noise_seed`, ou `control_after_generate`
  déclaré) consomme **deux places** : sa valeur, puis le
  `randomize`/`fixed` ajouté par l'interface. Oublier la seconde décale
  tout le reste de la liste.
- Un décalage ne lève pas : il assigne des valeurs plausibles aux mauvais
  widgets. C'est la panne la plus difficile à lire du format — la sortie
  est simplement « bizarre ».
- Deux conventions de frontend coexistent (la valeur d'un widget connecté
  est tantôt conservée, tantôt omise). `_widget_values()` essaie les deux
  et garde celle qui consomme **exactement** la liste. Cette heuristique
  tranche à la longueur : une liste tronquée à la main peut la faire
  basculer sur la mauvaise convention.

## `pos` et `size` décident de l'appartenance aux groupes

`nodes_in_group()` ne lit aucune liste d'appartenance — il n'en existe pas.
Le test est **géométrique** et **strict** : le rectangle du nœud doit être
**entièrement contenu** dans le `bounding` du groupe.

```
x >= gx  et  y >= gy  et  x + w <= gx + gw  et  y + h <= gy + gh
```

- `pos` est **obligatoire** — un nœud sans `pos` fait lever `nodes_in_group`.
- `size` est lu avec un repli à `[200, 100]`. Un nœud sans `size` ne plante
  donc pas : il est mesuré à une taille inventée, et entre ou sort du groupe
  au hasard de cette valeur. Toujours écrire `size` explicitement.
- Un nœud **déplacé de quelques pixels** hors du cadre sort du groupe et
  n'est plus réactivé par `active_groups`. Le symptôme n'est pas une erreur,
  c'est « un réglage qui ne s'applique pas ».
- Un nœud **ajouté** dans un groupe doit tenir dans le `bounding` ; sinon
  élargir le `bounding` du groupe dans le même mouvement.

### Renommer un groupe casse l'orchestration

`_group_bounds()` cherche le groupe par **fragment de titre, insensible à
la casse**, et rend **le premier trouvé**. Donc :

- Renommer un groupe casse `active_groups` aussi sûrement que renommer un
  nœud casse `find_node` — sans message clair, le groupe reste simplement
  inactif.
- Un fragment qui matche deux groupes prend le premier **en silence**. Le
  jour où un second groupe contient le fragment (« GRAIN » dans « GRAIN +
  EXPORT » et dans « GRAIN VIDEO »), l'orchestration change de cible sans
  rien signaler. Nommer les groupes de façon qu'aucun titre ne soit un
  fragment d'un autre.

## `find_node` lève sur l'ambiguïté, pas seulement sur l'absence

Le runner s'accroche au graphe par `find_node(ui, type, titre_contains)` —
type et/ou fragment de titre, jamais par ID. Deux façons de le casser :

1. **Renommer le titre d'un nœud piloté.** La table des rôles du runner
   (`wf_check.ROLES_PROD` / `ROLES_OPTIONNELS`, et les tables `_roles()` des
   runners) liste les titres contractuels. Les relire avant de livrer.
2. **Dupliquer un nœud d'un type déjà piloté sans lui donner de titre
   distinctif.** `find_node` rend une `LookupError` « nœud ambigu » dès que
   deux nœuds correspondent.

Le second cas est le plus vicieux, parce qu'il casse une recherche qui
passait avant sans qu'on ait touché à cette recherche. Il vise en premier
les rôles cherchés **par type seul**, sans titre : dans `ROLES_PROD`,
`("FluxGuidance", None)` casse à la seconde instance de `FluxGuidance` dans
le graphe. Idem pour tout rôle optionnel à titre `None`
(`ControlNetLoader`, `ImageAddNoise`, `Switch any [Crystools]`…).

**Règle** : tout nouveau nœud dont le type figure déjà dans une table de
rôles reçoit un titre explicite, même s'il n'est pas lui-même piloté.

## Ce que la validation attrape, et ce qu'elle n'attrape pas

`wf_check.py --roles` couvre les types inconnus, la conversion API, les
liens orphelins, le nœud de sortie actif et la résolution des rôles. Il ne
voit **rien** de ces trois-là, tous silencieux jusqu'à bien plus tard :

- `outputs[].links` désynchronisé (jamais lu par `convert()`) ;
- `last_node_id` / `last_link_id` en retard (jamais lus non plus) ;
- `widgets_values` décalé d'une place (la conversion réussit, les valeurs
  sont fausses).

Après une édition à la main, relire ces trois points **avant** de faire
confiance à un `wf_check.py` vert.
