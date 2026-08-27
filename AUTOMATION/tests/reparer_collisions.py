"""Repare les noms de fichiers en double entre dossiers de tri.

    python_embeded\\python.exe ComfyUI\\output\\OFM\\AUTOMATION\\tests\\reparer_collisions.py
    ... --appliquer       pour ecrire (sans ce drapeau : simulation)

POURQUOI. Jusqu'au 24/08/2026, `sort_and_export` ne cherchait un nom libre que
dans le dossier d'arrivee. Deux images de la meme scene, produites le meme jour
avec le meme index mais des verdicts differents, recevaient donc le MEME nom dans
deux dossiers. Consequences :

  - `shutil.move` au tri ecrase silencieusement l'homonyme : perte seche ;
  - le journal et PROD/mesures.json sont indexes par nom : les deux images n'y
    ont qu'une seule entree, et c'est la derniere lue qui gagne.

`runner.nom_libre` empeche desormais le cas de se reproduire. Ce script
nettoie ce qui existe deja : il garde le nom au fichier le plus ancien et renomme
les autres, en emportant leur entree de mesures.

LIMITE ASSUMEE : l'attribution des lignes de journal aux fichiers renommes reste
ambigue pour ces cas historiques — rien dans le fichier ne dit de quelle ligne il
vient. Le script ne touche donc pas au journal, il le signale.
"""
import collections
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import runner as lb      # noqa: E402
import mesures as mes    # noqa: E402

RACINES = [OFM / "PROD" / "LENA", OFM / "PROD" / "_NSFW"]


def collisions(racine):
    par_nom = collections.defaultdict(list)
    for d in racine.glob("*"):
        if d.is_dir() and not d.name.startswith("_"):
            for f in d.glob("*.png"):
                par_nom[f.name].append(f)
    return {n: sorted(v, key=lambda f: f.stat().st_mtime)
            for n, v in par_nom.items() if len(v) > 1}


def main():
    appliquer = "--appliquer" in sys.argv
    total = 0
    for racine in RACINES:
        if not racine.exists():
            continue
        coll = collisions(racine)
        if not coll:
            print(f"{racine.name} : aucun doublon.")
            continue
        for nom, fichiers in coll.items():
            garde, autres = fichiers[0], fichiers[1:]
            print(f"\n{racine.name} / {nom}")
            print(f"  garde   {garde.parent.name}/{garde.name}  (le plus ancien)")
            for f in autres:
                neuf = lb.nom_libre(f.stem, racine, f.suffix)
                print(f"  renomme {f.parent.name}/{f.name}  ->  {neuf}")
                total += 1
                if appliquer:
                    shutil.move(str(f), str(f.parent / neuf))
                    # les mesures suivent le fichier ; celles du fichier garde
                    # restent sous le nom d'origine
                    e = mes.charger().get(nom)
                    if e:
                        mes.maj(neuf, **{k: v for k, v in e.items() if k != "flag"})
    print()
    if not total:
        print("rien a faire.")
    elif appliquer:
        print(f"{total} fichier(s) renomme(s).")
        print("!! les lignes de journal de ces images restent ambigues : relancer")
        print("   une mesure depuis le tableau de bord pour reconstruire les scores.")
    else:
        print(f"{total} fichier(s) a renommer. Relancer avec --appliquer pour ecrire.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
