# -*- coding: utf-8 -*-
"""Rendu local d'un squelette OpenPose (pose_render.py) et le cycle
enregistrer/charger/retirer de pose_tools.py, sans ComfyUI ni GPU — c'est
tout le point de ce rendu local (voir pose_render.py, docstring).

Ce que ce test verrouille :
  - un frame complet (corps + deux mains) rend une image a la bonne taille ;
  - un frame sans mains, ou avec un point a confiance nulle, ne plante pas —
    ce sont des cas reels (une pose extraite de dos n'a pas toujours les deux
    mains visibles) ;
  - enregistrer_points -> charger_points fait un aller-retour fidele, et
    `created_at` ne bouge pas quand on resauve la meme pose ;
  - supprimer_pose retire le PNG ET le JSON.

Arborescence jetable (POSE_DIR/PRESETS_DIR de pose_tools reassignes le temps
du test) : rien de reel n'est touche, rien a nettoyer sur le vrai INPUTS/POSE/.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_pose_render.py
"""
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import pose_render  # noqa: E402
import pose_tools as pt  # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def cadre(corps=True, mains=True, visage=False):
    """Un frame minimal mais valide — memes cles que ce que ComfyUI/les
    presets produisent."""
    people = {"face_keypoints_2d": []}
    if corps:
        # 18 points, confiance 1.0 sauf le dernier (cheville gauche, 0 —
        # cas reel d'un membre hors cadre / non detecte)
        flat = []
        for i in range(18):
            c = 0.0 if i == 13 else 1.0
            flat += [100.0 + i * 5, 200.0 + i * 5, c]
        people["pose_keypoints_2d"] = flat
    if mains:
        for cle in ("hand_left_keypoints_2d", "hand_right_keypoints_2d"):
            flat = []
            for i in range(21):
                flat += [300.0 + i * 2, 400.0 + i * 2, 1.0]
            people[cle] = flat
    return {"people": [people], "canvas_width": 512, "canvas_height": 640,
            "source": "preset", "label": None, "created_at": None}


print("=" * 70)
print("pose_render / pose_tools — cycle de vie d'un squelette")
print("=" * 70)

try:
    print("\n[1] rendu local, sans ComfyUI")
    complet = cadre(corps=True, mains=True)
    img = pose_render.render(complet)
    verifie(img.size == (512, 640), f"taille = canvas_width/height ({img.size})")
    verifie(img.mode == "RGB", f"mode RGB ({img.mode})")

    print("\n[2] frames incomplets — ne plantent pas")
    sans_mains = cadre(corps=True, mains=False)
    img2 = pose_render.render(sans_mains)
    verifie(img2.size == (512, 640), "corps seul : rendu quand meme")

    sans_corps = cadre(corps=False, mains=True)
    # pose_keypoints_2d absent -> _points() replie sur des None, aucun trait
    sans_corps["people"][0].setdefault("pose_keypoints_2d", [])
    img3 = pose_render.render(sans_corps)
    verifie(img3.size == (512, 640), "mains seules (corps absent) : rendu quand meme")

    print("\n[3] enregistrer_points / charger_points / supprimer_pose")
    tmp = Path(tempfile.mkdtemp(prefix="pose_test_"))
    pt.POSE_DIR = tmp
    try:
        nom = pt.enregistrer_points(complet)
        verifie(nom == "pose__00001_.png", f"premiere pose auto-numerotee ({nom})")
        verifie((tmp / nom).exists(), "le PNG est ecrit")
        verifie((tmp / "pose__00001_.json").exists(), "le JSON sœur est ecrit")

        recharge = pt.charger_points(nom)
        verifie(recharge["people"][0]["pose_keypoints_2d"]
                == complet["people"][0]["pose_keypoints_2d"],
                "les points-cles rechargés sont identiques a ceux enregistrés")
        verifie(recharge["source"] == "preset", "la provenance a traverse")
        premiere_date = recharge["created_at"]
        verifie(bool(premiere_date), "created_at est horodate a la creation")

        # resauver la MEME pose ne doit pas rajeunir sa date de naissance
        recharge["people"][0]["pose_keypoints_2d"][0] += 1
        pt.enregistrer_points(recharge, nom=nom)
        apres = pt.charger_points(nom)
        verifie(apres["created_at"] == premiere_date,
                "created_at ne bouge pas quand on resauve la meme pose")
        verifie(apres["people"][0]["pose_keypoints_2d"][0]
                == complet["people"][0]["pose_keypoints_2d"][0] + 1,
                "mais le contenu edité, lui, a bien change")

        second = pt.enregistrer_points(complet, nom=None)
        verifie(second == "pose__00002_.png",
                f"index libre suivant, pas de collision ({second})")

        retire = pt.supprimer_pose(nom)
        verifie(retire, "supprimer_pose confirme le retrait")
        verifie(not (tmp / nom).exists() and not (tmp / "pose__00001_.json").exists(),
                "PNG et JSON ont tous les deux disparu")
        verifie(pt.poses_disponibles() == [second],
                f"il ne reste que l'autre pose ({pt.poses_disponibles()})")

        print("\n[4] charger_points sur une pose sans JSON : erreur explicite")
        (tmp / "pose__00099_.png").write_bytes(b"")
        try:
            pt.charger_points("pose__00099_.png")
            verifie(False, "aurait du lever ExtractionError")
        except pt.ExtractionError as e:
            verifie("n'a pas de points-clés" in str(e), f"message clair ({e})")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n[5] presets_disponibles / charger_preset — le vrai dossier livre")
    presets = pt.presets_disponibles()
    verifie(any(p["nom"] == "debout" for p in presets),
            f"le preset « debout » est bien la ({presets})")
    frame_preset = pt.charger_preset("debout")
    verifie(frame_preset["source"] == "preset", "un preset se declare comme tel")
    verifie(len(frame_preset["people"][0]["pose_keypoints_2d"]) == 18 * 3,
            "18 points de corps")
    verifie(len(frame_preset["people"][0]["hand_left_keypoints_2d"]) == 21 * 3,
            "21 points par main")
    try:
        pt.charger_preset("n-existe-pas")
        verifie(False, "aurait du lever ExtractionError")
    except pt.ExtractionError:
        verifie(True, "gabarit inconnu -> erreur explicite")

finally:
    print("\n" + "=" * 70)
    print(f"{KO} ECHEC(S)" if KO else "tout est vert")
    print("=" * 70)
    sys.exit(1 if KO else 0)
