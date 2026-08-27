"""Calcule les embeddings manquants, puis construit le jeu de reference d'identite.

    python_embeded\\python.exe ComfyUI\\output\\OFM\\AUTOMATION\\tests\\backfill_embeddings.py

Une passe InsightFace coute ~190 ms par image. Une fois l'embedding en base, tout
le reste se refait sans jamais relire un PNG : changer de seuil ou de reference
devient une requete.

Le jeu de reference obeit aux garde-fous deja poses (voir la docstring de
`base.construire_jeu`, qui les applique) — ce script ne fait que l'appeler et
montrer le bilan.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import base          # noqa: E402
import env_config    # noqa: E402
import lena_batch as lb  # noqa: E402

OFM = AUTOMATION.parent
COMFY = env_config.comfyui_root()


def fichiers_sur_disque():
    """nom -> chemin, pour tout ce qui est range quelque part."""
    out = {}
    for racine in (OFM / "PROD" / "LENA", OFM / "PROD" / "_NSFW",
                   OFM / "INPUTS" / "REALISME"):
        if not racine.exists():
            continue
        for f in racine.rglob("*.png"):
            if "_BATCH" not in f.parts:
                out.setdefault(f.name, f)
    return out


def main():
    cfg = lb.load_json(AUTOMATION / "config.json")
    checker = lb.make_checker(cfg)
    disque = fichiers_sur_disque()

    with base.ouvrir() as cx:
        manquants = [r["fichier"] for r in cx.execute(
            "SELECT i.fichier FROM image i LEFT JOIN embedding e ON e.image_id = i.id "
            "WHERE e.image_id IS NULL")]
        a_faire = [(n, disque[n]) for n in manquants if n in disque]
        absents = len(manquants) - len(a_faire)
        print(f"  {len(manquants)} image(s) sans embedding, dont {len(a_faire)} "
              f"presentes sur le disque ({absents} disparues)")

        faits = sans_visage = 0
        for nom, chemin in a_faire:
            m = checker.mesure(chemin)
            if m["embedding"] is None:
                sans_visage += 1
                continue
            iid = base.enregistrer_image(cx, nom)
            base.enregistrer_embedding(cx, iid, m["embedding"])
            base.enregistrer_score(cx, iid, "identite", m["score"])
            faits += 1
        cx.commit()
        print(f"  {faits} embedding(s) calcule(s), {sans_visage} sans visage detecte")

        # la base gelee elle-meme : c'est l'ancre, elle merite d'etre en base
        gelee = COMFY / "input" / cfg["base_gelee"]
        if gelee.exists():
            m = checker.mesure(gelee)
            if m["embedding"] is not None:
                iid = base.enregistrer_image(cx, gelee.name, role="base_gelee",
                                             espace="reference")
                base.enregistrer_embedding(cx, iid, m["embedding"])
                cx.commit()
                print(f"  base gelee enregistree : {gelee.name}")

        seuil = cfg["qc"].get("threshold_high", 0.74)
        bilan = base.construire_jeu(cx, checker.base, seuil,
                                    libelle="auto — backfill")
        cx.commit()
        print(f"\n  === jeu de reference d'identite ===")
        print(f"    portillon d'entree      : identite vs base gelee >= {bilan['seuil']}")
        print(f"    membres                 : {bilan['membres']}")
        if bilan["membres"]:
            print(f"    membres vs base gelee   : {bilan['sim_membres']:.4f} en moyenne")
            print(f"    centroide vs base gelee : {bilan['sante_abs']:.4f}")
            print(f"    sante (rapport)         : {bilan['sante']:.4f}"
                  f"   seuil {base.SANTE_MINI}")
            print(f"      sous 1 = les membres derivent dans une direction COMMUNE")
            print(f"    cohesion interne        : {bilan['cohesion']:.4f}"
                  f"   (a quel point la production se ressemble)")
        print(f"    actif                   : "
              f"{'oui' if bilan['actif'] else 'NON — derive commune, jeu gele'}")

        if bilan["membres"]:
            c = base.centroide(cx, bilan["id"])
            n = base.rescorer(cx, c)
            cx.commit()
            print(f"\n  {n} image(s) re-scorees contre le centroide, sans relire un PNG")
            q = ("SELECT i.fichier AS f, "
                 "  MAX(CASE WHEN s.genre='identite' THEN s.valeur END) AS base_, "
                 "  MAX(CASE WHEN s.genre='identite_centroide' THEN s.valeur END) AS cen "
                 "FROM image i JOIN score s ON s.image_id = i.id "
                 "WHERE i.espace='lena' AND i.role IS NULL GROUP BY i.id "
                 "HAVING base_ IS NOT NULL AND cen IS NOT NULL ORDER BY base_ LIMIT 8")
            print(f"\n    {'fichier':44}{'vs base':>9}{'vs centroide':>14}{'ecart':>8}")
            for r in cx.execute(q):
                print(f"    {r['f'][:42]:44}{r['base_']:>9.3f}{r['cen']:>14.3f}"
                      f"{r['cen'] - r['base_']:>+8.3f}")

        print(f"\n  contenu de la base : {base.resume(cx)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
