"""Peuple PROD/lena.db depuis les fichiers existants. Idempotent.

    python_embeded\\python.exe ComfyUI\\output\\OFM\\AUTOMATION\\tests\\migrer_base.py

Sources lues, aucune n'est modifiee :
  PROD/journal_batch.csv        historique SFW
  PROD/_NSFW/journal_nsfw.csv   historique NSFW
  PROD/mesures.json             mesures de realisme + jugements + corpus
  PROD/LENA/*/ et PROD/_NSFW/*/ dossier de tri courant de chaque fichier

Relancable sans risque : tout passe par des upserts sur le nom de fichier.
"""
import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import base  # noqa: E402

JOURNAL = OFM / "PROD" / "journal_batch.csv"
JOURNAL_NSFW = OFM / "PROD" / "_NSFW" / "journal_nsfw.csv"
MESURES = OFM / "PROD" / "mesures.json"


def buckets():
    """fichier -> (espace, dossier de tri) d'apres ce qui est sur le disque."""
    out = {}
    for espace, racine in (("lena", OFM / "PROD" / "LENA"),
                           ("nsfw", OFM / "PROD" / "_NSFW")):
        if not racine.exists():
            continue
        for d in racine.iterdir():
            if d.is_dir() and not d.name.startswith("_"):
                for f in d.glob("*.png"):
                    out[f.name] = (espace, d.name)
    return out


def main():
    ou = buckets()
    with base.ouvrir() as cx:
        n_img = n_score = n_jug = 0

        # ---- journal SFW
        if JOURNAL.exists():
            with open(JOURNAL, encoding="utf-8", newline="") as f:
                for r in csv.DictReader(f, delimiter=";"):
                    if not r.get("fichier"):
                        continue
                    esp, bkt = ou.get(r["fichier"], ("lena", None))
                    cx.execute("INSERT INTO batch (id, debut) VALUES (?,?) "
                               "ON CONFLICT(id) DO NOTHING",
                               (r.get("batch"), r.get("date")))
                    iid = base.enregistrer_image(
                        cx, r["fichier"], batch_id=r.get("batch"), espace=esp,
                        bucket=bkt, scene=r.get("scene"),
                        intention=r.get("categorie"), ton=r.get("ton") or None,
                        intensite=int(r["intensite"]) if r.get("intensite") else None,
                        format=r.get("format"),
                        seed=int(r["seed"]) if (r.get("seed") or "").isdigit() else None,
                        variante=r.get("variante"), prompt=r.get("prompt"),
                        cree_le=r.get("date"),
                        duree_s=float(r["duree_s"]) if r.get("duree_s") else None,
                        export=r.get("export") or None)
                    n_img += 1
                    if r.get("score_identite"):
                        base.enregistrer_score(cx, iid, "identite",
                                               float(r["score_identite"]), r.get("date"))
                        n_score += 1

        # ---- journal NSFW
        if JOURNAL_NSFW.exists():
            with open(JOURNAL_NSFW, encoding="utf-8", newline="") as f:
                for r in csv.DictReader(f, delimiter=";"):
                    if not r.get("fichier"):
                        continue
                    esp, bkt = ou.get(r["fichier"], ("nsfw", None))
                    iid = base.enregistrer_image(
                        cx, r["fichier"], batch_id=r.get("batch"), espace=esp,
                        bucket=bkt, source=r.get("source"), intention="nsfw",
                        intensite=3, cree_le=r.get("date"),
                        seed=int(r["seed"]) if (r.get("seed") or "").isdigit() else None,
                        prompt=r.get("instruction"),
                        duree_s=float(r["duree_s"]) if r.get("duree_s") else None)
                    n_img += 1
                    if r.get("score_identite"):
                        base.enregistrer_score(cx, iid, "identite",
                                               float(r["score_identite"]), r.get("date"))
                        n_score += 1

        # ---- mesures de realisme, jugements, corpus de reference
        if MESURES.exists():
            store = json.loads(MESURES.read_text(encoding="utf-8"))
            for nom, e in store.items():
                esp, bkt = ou.get(nom, (None, None))
                iid = base.enregistrer_image(cx, nom, espace=esp, bucket=bkt,
                                             role=e.get("role"))
                # identite_apres_expression comprise : elle est ecrite par le runner
                # au moment de la generation, mais une base reconstruite de zero ne
                # doit pas la perdre pour autant (test_coherence_base.py la verifie).
                for genre in ("identite", "identite_apres_expression", "nettete",
                              "texture_visage", "bruit_fond"):
                    if isinstance(e.get(genre), (int, float)):
                        base.enregistrer_score(cx, iid, genre, e[genre],
                                               e.get("mesure_le"))
                        n_score += 1
                if e.get("flag"):
                    base.enregistrer_jugement(cx, iid, e["flag"], e.get("juge_le"))
                    n_jug += 1

        cx.commit()
        print(f"  {n_img} ligne(s) d'image traitees, {n_score} score(s), {n_jug} jugement(s)")
        print(f"\n  contenu de la base : {json.dumps(base.resume(cx))}")

        print("\n  --- controle : stats par scene ---")
        for scene, s in sorted(base.stats_par_scene(cx).items()):
            moy = f"{s['avg']:.3f}" if s["avg"] is not None else "  —  "
            print(f"    {scene:24} n={s['n']:<3} ok={s['ok']:<3} identite moy {moy}")

        derive = base.derive_par_scene(cx, mini=2)
        if derive:
            print("\n  --- ce que le CSV ne donnait pas : derive par scene ---")
            for scene, pts in sorted(derive.items()):
                v = [f"{p[1]:.3f}" for p in pts]
                print(f"    {scene:24} {' -> '.join(v)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
