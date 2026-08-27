# -*- coding: utf-8 -*-
"""Isolation entre personnages dans base.py — sur une base jetable.

POURQUOI CE TEST EXISTE. J2 introduit `character_id` dans le schema commun
(CLAUDE.md §7 : une seule base, jamais une base par personnage). Le risque
exact que ca ouvre : une fonction de lecture qui oublie de filtrer par
character_id melange les donnees de deux personnages sans qu'aucune erreur ne
le signale — les chiffres affiches sont juste FAUX. CLAUDE.md §11 demande
explicitement ce test pour toute fonction generalisee.

Deux personnages factices ("lena" et "autre"), memes noms de scene et parfois
memes noms de fichier expres : si l'isolation n'etait qu'une coincidence de
noms differents, ce test ne la detecterait pas.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_cross_character.py
"""
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import base as db  # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def vecteur(graine):
    """Embedding factice mais deterministe et distinct par graine."""
    import numpy as np
    rng = np.random.RandomState(graine)
    v = rng.rand(8).astype("float32")
    return v / np.linalg.norm(v)


def main():
    racine = Path(tempfile.mkdtemp(prefix="cross_character_"))
    db.FICHIER = racine / "PROD" / "lena.db"
    try:
        with db.ouvrir() as cx:
            # ------------------------------------------------- [1] fichiers homonymes
            print("[1] deux personnages peuvent produire le meme nom de fichier")
            id_lena = db.enregistrer_image(cx, "cafe_terrasse_01.png",
                                           character_id="lena", scene="cafe_terrasse",
                                           bucket="OK")
            id_autre = db.enregistrer_image(cx, "cafe_terrasse_01.png",
                                            character_id="autre", scene="cafe_terrasse",
                                            bucket="REJET")
            cx.commit()
            verifie(id_lena != id_autre,
                    f"deux lignes distinctes (id {id_lena} vs {id_autre}), "
                    "pas un ecrasement")
            r = cx.execute("SELECT bucket FROM image WHERE id = ?", (id_lena,)).fetchone()
            verifie(r["bucket"] == "OK", "la ligne 'lena' garde son propre bucket (OK)")
            r = cx.execute("SELECT bucket FROM image WHERE id = ?", (id_autre,)).fetchone()
            verifie(r["bucket"] == "REJET",
                    "la ligne 'autre' garde son propre bucket (REJET), non ecrase")

            # une deuxieme image pour 'lena' dans la meme scene, pour stats_par_scene
            id_lena2 = db.enregistrer_image(cx, "cafe_terrasse_02.png",
                                            character_id="lena", scene="cafe_terrasse",
                                            bucket="OK")
            db.enregistrer_score(cx, id_lena, "identite", 0.90)
            db.enregistrer_score(cx, id_lena2, "identite", 0.80)
            db.enregistrer_score(cx, id_autre, "identite", 0.10)
            cx.commit()

            # ------------------------------------------------- [2] stats_par_scene
            print("\n[2] stats_par_scene ne mélange pas les personnages")
            s_lena = db.stats_par_scene(cx, "lena")
            s_autre = db.stats_par_scene(cx, "autre")
            verifie(s_lena.get("cafe_terrasse", {}).get("n") == 2,
                    f"lena voit ses 2 images (obtenu {s_lena.get('cafe_terrasse')})")
            verifie(s_autre.get("cafe_terrasse", {}).get("n") == 1,
                    f"autre voit sa seule image (obtenu {s_autre.get('cafe_terrasse')})")
            moy_lena = s_lena["cafe_terrasse"]["avg"]
            verifie(moy_lena is not None and abs(moy_lena - 0.85) < 1e-6,
                    f"moyenne identite de lena = 0.85, pas polluee par 0.10 "
                    f"(obtenu {moy_lena})")

            # ------------------------------------------------- [3] mesures_par_fichier
            print("\n[3] mesures_par_fichier ne mélange pas les personnages")
            m_lena = db.mesures_par_fichier(cx, "lena")
            m_autre = db.mesures_par_fichier(cx, "autre")
            verifie("cafe_terrasse_01.png" in m_lena
                    and m_lena["cafe_terrasse_01.png"].get("identite") == 0.90,
                    "lena voit son propre score pour le nom homonyme")
            verifie("cafe_terrasse_01.png" in m_autre
                    and m_autre["cafe_terrasse_01.png"].get("identite") == 0.10,
                    "autre voit SON score pour le meme nom de fichier, pas celui de lena")

            # ------------------------------------------------- [4] jeu de reference
            print("\n[4] construire_jeu / jeu_actif / rescorer restent par personnage")
            db.enregistrer_embedding(cx, id_lena, vecteur(1))
            db.enregistrer_embedding(cx, id_lena2, vecteur(2))
            db.enregistrer_embedding(cx, id_autre, vecteur(3))
            cx.commit()

            base_lena = vecteur(1)  # proche de id_lena par construction
            bilan_lena = db.construire_jeu(cx, "lena", base_lena, seuil_haut=-1.0,
                                           libelle="test lena")
            cx.commit()
            membres_autre = [r["image_id"] for r in cx.execute(
                "SELECT image_id FROM reference_member WHERE set_id = ?",
                (bilan_lena["id"],))]
            verifie(id_autre not in membres_autre,
                    "le jeu de reference de lena n'admet aucune image de 'autre'")

            ja_lena = db.jeu_actif(cx, "lena")
            ja_autre = db.jeu_actif(cx, "autre")
            verifie(ja_autre is None,
                    "'autre' n'a pas de jeu de reference actif (lena n'en a cree "
                    "qu'un pour lui-meme)")
            verifie(ja_lena is not None and ja_lena["character_id"] == "lena",
                    "le jeu actif retourne pour lena porte bien character_id='lena'")

            n = db.rescorer(cx, "lena", base_lena, genre="identite_centroide")
            cx.commit()
            verifie(n == 2, f"rescorer('lena') ne re-score que les 2 images de lena "
                            f"(obtenu {n})")
            a_autre = cx.execute(
                "SELECT valeur FROM score WHERE image_id = ? AND genre = ?",
                (id_autre, "identite_centroide")).fetchone()
            verifie(a_autre is None,
                    "l'image de 'autre' n'a pas recu de score identite_centroide "
                    "issu du jeu de lena")

        print("\n" + "=" * 70)
        if KO:
            print(f"{KO} ECHEC(S)")
        else:
            print("tout est vert")
        return 1 if KO else 0
    finally:
        shutil.rmtree(racine, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
