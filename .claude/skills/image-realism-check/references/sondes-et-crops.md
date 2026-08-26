# Lire les mesures, mesurer, découper

Consulté par le skill `image-realism-check` à l'étape provenance et à
l'étape zoom. Rien ici n'introduit de dépendance nouvelle : tout réutilise
ce que le projet installe déjà.

Le binaire Python à utiliser est celui de ComfyUI, seul à voir `cv2`,
`insightface` et `torch` :
`H:/ComfyUI/ComfyUI_windows_portable/python_embeded/python.exe`. Ce chemin
est codé en dur comme il l'est encore dans plusieurs modules — dette de
chemin identifiée à `J1`, traitée à `J2` (`ROADMAP.md`).

## 1. D'abord la base, jamais la mesure

La base SQLite est la source de vérité (`CLAUDE.md` §7) et porte déjà, par
image, les scores et le jugement. Interroger la base **coûte zéro seconde et
ne relit aucun PNG** — commencer par là systématiquement :

```bash
"H:/ComfyUI/ComfyUI_windows_portable/python_embeded/python.exe" -c "
import sys; sys.path.insert(0, 'AUTOMATION')
import base
cible = '<fragment du nom de fichier>'
cx = base.ouvrir()
for fichier, m in base.mesures_par_fichier(cx).items():
    if cible.lower() in fichier.lower():
        print(fichier, m)
"
```

Sortie réelle (27/08/2026) :

```
lifestyle_cuisine_matin_20260824_01_15.png {'bruit_fond': 1.479,
  'identite': 0.7327867746353149, 'identite_apres_expression': 0.7061254978179932,
  'nettete': 137.14, 'texture_visage': 4.879, 'flag': 'ia'}
```

Autres accès utiles de `AUTOMATION/base.py` :

| Besoin | Appel |
|---|---|
| Toutes les mesures d'une image | `base.mesures_par_fichier(cx)` |
| Moyenne d'identité et compte par scène | `base.stats_par_scene(cx)` |
| **Dérive lente** d'une scène dans le temps | `base.derive_par_scene(cx, genre="identite", mini=3)` |

`derive_par_scene` est l'outil de la critique de **série** : il rend la
moyenne par scène du plus ancien au plus récent, sans relire une image.
C'est précisément ce que l'ancien journal CSV ne permettait pas.

## 2. Les mesures de réalisme du projet, et leur normalisation

`AUTOMATION/qc_realisme.py` produit les trois genres stockés en base. Il
répond à « est-ce crédible comme photo », question **indépendante** de
l'identité (`qc_identity.py`) :

| Genre | Ce que c'est |
|---|---|
| `nettete` | variance du laplacien sur l'image entière. Bas = mou. |
| `texture_visage` | médiane de l'écart-type local (7×7) dans le crop de visage. **La mesure importante** : le lissage de peau est ce qui fait « rendu IA ». Médiane et non moyenne, pour que les arêtes (yeux, narines, limite des cheveux) ne gonflent pas le résultat. |
| `bruit_fond` | écart-type robuste (MAD) du résidu haute fréquence **hors visage**. Une photo a un plancher de bruit capteur ; une génération trop propre n'en a pas. |

**Ce qui rend ces valeurs comparables entre images** : l'image est ramenée à
1024 px sur son grand côté avant toute mesure, et le crop de visage à 256 px
de haut. Sans ça, un 2K et un 1080, un selfie et un plan large ne sont pas
sur la même échelle.

Et la limite, à énoncer plutôt qu'à masquer : **ce sont des nombres bruts,
sans seuil**. Il n'y a pas de corpus de vraies photos dans ce projet, donc
pas d'étalonnage honnête possible. La bande cible se déduit des images que
l'utilisateur marque lui-même « convaincante » en revue. Ne jamais présenter
une de ces valeurs comme une note sur 10 ni comme un seuil de rejet.

## 3. Trois échelles de « netteté » qui ne se comparent pas

C'est le piège de ce fichier. Trois nombres portent le même nom et vivent
sur trois échelles différentes — les mélanger produit un diagnostic faux et
confiant :

| Origine | Échelle observée | Statut |
|---|---|---|
| `nettete` en base (`qc_realisme`, normalisé 1024 px) | ~107 – 232 sur la production existante | **la référence de ce repo** |
| Sonde relative ad hoc du §4, à 1080 px | 35 – 730 selon l'étage (voir table) | dépannage seulement |
| Chiffres « netteté 20 / 11 » du protocole identité | ordre de grandeur 10–20 | encore une autre méthode, propre à l'A/B d'édition NSFW |

Un chiffre n'a de sens qu'avec sa méthode. **Toujours comparer une image à
une référence mesurée de la même façon**, jamais d'une table à l'autre.

## 4. Sonde de dépannage — seulement si l'image n'est pas en base

Pour une image hors base (test manuel, sortie non journalisée), une sonde
relative permet de situer une image **par rapport à d'autres passées dans la
même sonde**. Elle ne produit pas de note absolue.

```bash
cat > "$SCRATCH/probe.py" <<'EOF'
import sys, cv2, numpy as np
for p in sys.argv[1:]:
    img = cv2.imread(p)
    if img is None:
        print(p, "unreadable"); continue
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    net = cv2.Laplacian(g, cv2.CV_32F).var()
    hp = g - cv2.GaussianBlur(g, (0, 0), 1.2)
    print("%-52s sharpness %7.1f  grain %5.2f  %dx%d"
          % (p.split('/')[-1], net, float(np.std(hp)), img.shape[1], img.shape[0]))
EOF
"H:/ComfyUI/ComfyUI_windows_portable/python_embeded/python.exe" "$SCRATCH/probe.py" <image> <image_de_reference>
```

Repères relevés avec **cette sonde**, à 1080 px, sur l'univers
`instagram-influenceur` :

| Type de sortie | netteté | grain |
|---|---|---|
| Export SFW validé | 640 – 665 | 5.0 – 5.5 |
| NSFW avec couche réalisme | ~730 | ~5.75 |
| **NSFW sans couche réalisme** | 35 – 82 | 2.2 – 2.9 |
| **Sortie brute, sans refiner ni grain** | ~54 | ~2.5 |

L'usage de cette table est **binaire, pas gradué** : une image dans la bande
basse n'a pas un problème de réglage, **il lui manque des étages**. Le dire
ainsi, plutôt que de proposer de toucher au verrou d'identité.

## 5. Découpe des crops

Même détecteur `antelopev2` que le reste du projet — aucune dépendance
nouvelle, et la même vision du visage que le verrou d'identité.

```bash
cat > "$SCRATCH/zoom.py" <<'EOF'
import sys, os, cv2
from insightface.app import FaceAnalysis
ROOT = r"H:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\insightface"
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
img = cv2.imread(src); H, W = img.shape[:2]
app = FaceAnalysis(name="antelopev2", root=ROOT, providers=["CPUExecutionProvider"])
app.prepare(ctx_id=-1, det_size=(640, 640))
r = min(1, 1600 / max(H, W))
faces = app.get(cv2.resize(img, (int(W * r), int(H * r))))
s, base = 1 / r, os.path.splitext(os.path.basename(src))[0]
if faces:
    f = max(faces, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]))
    x1, y1, x2, y2 = [int(v * s) for v in f.bbox]
    m = int(0.45 * max(x2 - x1, y2 - y1))
    crop = img[max(0, y1 - m):min(H, y2 + m), max(0, x1 - m):min(W, x2 + m)]
    k = max(1, min(4, 900 // max(1, crop.shape[1])))
    if k > 1:
        crop = cv2.resize(crop, None, fx=k, fy=k, interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite(os.path.join(out, base + "_FACE.png"), crop)
    print("face OK (x%d)" % k)
else:
    print("no face detected")      # information en soi : verdict SANS_VISAGE
for name, (b, d) in {"TOP": (0, .34), "MID": (.33, .67), "BOTTOM": (.66, 1)}.items():
    cv2.imwrite(os.path.join(out, base + "_" + name + ".png"), img[int(b * H):int(d * H)])
    print(name, "OK")
EOF
"H:/ComfyUI/ComfyUI_windows_portable/python_embeded/python.exe" "$SCRATCH/zoom.py" <image> "$SCRATCH/crops"
```

Écrire les crops dans le répertoire de travail temporaire de la session, pas
dans `PROD/` : ce sont des fichiers de travail, ils n'ont rien à faire dans
l'arborescence de production.

Puis **lire les crops produits** (`_FACE`, `_TOP`, `_MID`, `_BOTTOM`) avant
d'écrire quoi que ce soit. « Aucun visage détecté » n'est pas un échec du
script : c'est un résultat, et il correspond au verdict `SANS_VISAGE` du
pipeline.
