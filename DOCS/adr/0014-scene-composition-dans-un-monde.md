# ADR-0014 : Une scène est une composition dans un monde

## Statut

Accepté (2026-08-31) — précise ADR-0012 §4, ne le supersède pas.

## Contexte

ADR-0012 a posé le monde comme quatrième axe, figé à la création, et lui a
donné un registre versionné `WORLDS/<id>.json` portant des `starter_scenes`.
Il a aussi tracé une limite de vocabulaire en une phrase : « un influenceur
slow-life qui fait un shooting cosplay ouvre **une scène**, pas un monde ».

Cette phrase est la seule chose écrite sur ce qu'est une scène, et elle est
écrite en creux. Le code, lui, a déjà tranché quatre fois sans le dire :

1. **Les scènes vivent dans `CHARACTERS/<id>/scenes.json`**, pas dans le
   monde. Le monde n'a qu'une amorce, copiée à la naissance par
   `create_character` puis oubliée. Une banque grandit ensuite à la main, elle
   ne se resynchronise jamais avec son monde.
2. **La tenue est au personnage.** `create_character` lit les
   `starter_scenes` du monde et écrit `wardrobe: {"0": ""}` — la tenue du
   catalogue n'est jamais reprise, parce qu'il n'y en a pas.
3. **Aucune scène n'a de graphe.** `build_jobs` lit `scenes.json` et
   n'ouvre aucun fichier de graphe : la topologie vient du pack
   (CLAUDE.md §8.11 / ADR-0012 §2).
4. **Rien ne rattache une scène à un monde.** Une scène est un objet nu :
   `id`, `prompt`, `intention`, `wardrobe`. Coller une scène de
   terres-sauvages dans la banque d'une influenceuse slow-life passait sans
   un mot — alors que la seule raison pour laquelle le monde est figé
   (ADR-0012 §4) est que ses assets entrent dans le rendu et dans la mesure
   du verrou d'identité.

Quatre décisions de fait, aucune écrite. La quatrième est un trou : le monde
est figé côté personnage et libre côté banque, donc figé nulle part.

## Décision

### 1 · Une scène est une composition à l'intérieur d'un monde

Le monde donne le **cadre** : ton, assets, amorce. La scène est un moment
composé dans ce cadre. Elle n'en sort pas, et elle n'en change pas : le
monde est figé à la création du personnage, donc figé pour toutes ses
scènes, présentes et futures.

Corollaire de vocabulaire, à tenir dans l'UI comme dans le code : on
**compose une scène**, on ne « choisit un monde » nulle part après la
naissance.

### 2 · La tenue appartient au personnage, jamais au catalogue

`wardrobe` est une clé de scène de personnage. Une `starter_scene` d'un
monde ne déclare **ni tenue, ni pose, ni format, ni compte** : ce sont des
réglages mesurés ou choisis pour un personnage donné. Un catalogue de monde
qui habillerait ses scènes livrerait la même tenue à tous les personnages du
monde, et rendrait fausse la première mesure de verrou qui suit.

`worlds.starter_scenes()` refuse un catalogue qui l'oublie.

### 3 · `scenes.json` porte son monde, à la racine et sur chaque scène

Deux niveaux, deux incidents différents :

- **racine** — le fichier appartient à un monde. Sans ce tampon, une banque
  entière peut être remplacée par celle d'un autre personnage.
- **par scène** — une scène collée depuis une autre banque est le cas réel :
  le fichier reste bon, une seule ligne ment.

Un troisième champ, `origin` (`world` | `manual` | `compose`), dit d'où vient
la scène. Il ne garde rien, il **explique** : une banque de vingt scènes dont
on ne sait plus lesquelles viennent de l'amorce est illisible en Réglages.

### 4 · Le serveur refuse, il ne répare pas

`POST /api/scenes` compare au monde du personnage (`character.json`, déjà
validé par `shared_state.character()`) et rend **400 en français** :

| Cas | Réponse |
|---|---|
| `world` racine absent | 400 |
| `world` racine différent | 400 |
| scène connue sans `world` | 400 |
| scène avec un `world` étranger | 400 |
| **scène neuve** (absente de la version précédente) sans `world` | tamponnée au monde du personnage, acceptée |

La cinquième ligne est la seule tolérance, et elle est nommée : une scène qui
**naît** dans cette sauvegarde n'a pas encore de monde à mentir. Le serveur
la tamponne avant d'écrire — c'est là que le tampon se pose, jamais sur une
scène qui existait déjà et qui a perdu le sien. Rien d'untagué n'atteint le
disque, et aucun monde étranger n'y entre.

### 5 · L'assemblage du prompt ne bouge pas d'un octet

`world` et `origin` sont des clés de provenance. `build_jobs` ne les lit pas,
ne les concatène pas, ne les ordonne pas. Le test à l'octet près
(`tests/test_build_jobs.py`) et sa fixture restent intacts : cet ADR ajoute
un garde-fou, il ne touche pas au prompt.

## Alternatives envisagées

- **Faire vivre les scènes dans le monde, le personnage n'y référant que des
  ids** — écarté : un monde est versionné et partagé, une banque est
  personnelle et git-ignorée (ADR-0005). Éditer une scène dans le Dashboard
  écrirait alors dans un fichier du repo, commun à tous les personnages du
  monde.
- **Tampon à la racine seulement** — écarté : c'est l'incident rare. Le
  fréquent est la scène recopiée d'une banque à l'autre, qui passe entière
  sous un tampon racine correct.
- **Tolérer un `world` absent partout et le tamponner** — écarté : une règle
  qui répare tout ne refuse plus rien, et le tampon devient décoratif. On
  migre les deux banques existantes une fois (`migrate_scenes_world.py`) et
  la règle est stricte ensuite.
- **Refuser aussi la scène neuve sans tampon** — écarté : le Dashboard
  construit une scène côté navigateur avant de sauvegarder ; la règle
  interdirait « ajouter une scène » sans un changement d'interface, hors du
  périmètre de cette décision. La tolérance est bornée à la naissance et
  elle écrit le tampon, elle ne l'omet pas.
- **Un `world` sur la scène qui pourrait différer de celui du personnage**
  (une scène « invitée » d'un autre monde) — écarté : ce serait rouvrir le
  gel du monde par la petite porte, avec des assets non mesurés pour ce
  visage. Un shooting cosplay est une scène **de son monde**, pas une visite.

## Conséquences

- `scenes.json` gagne `world` (racine) et `world` / `origin` (par scène).
  Les deux banques existantes sont migrées une fois, sans changement de
  prompt.
- `create_character` tamponne l'amorce : `world` racine, et sur chaque scène
  copiée du monde `world` + `origin: "world"`.
- Un catalogue de monde qui déclare une tenue est une erreur explicite au
  chargement, pas un silence.
- `WORLDS/*.json` reste un catalogue : des cadres, pas des garde-robes.
- Aucun fichier de graphe par scène — la règle de ADR-0012 §2 vaut un cran
  plus bas, et elle est maintenant écrite.
