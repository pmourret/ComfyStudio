"""A/B : ControlNet abime-t-il le verrou d'identite PuLID ?

DEMANDE LE GPU. C'est la campagne de mesure decrite dans la note du groupe 05 de
`WORKFLOWS/experiments/lena_pose_cn_test_ui.json`, automatisee — le protocole y
etait manuel (Ctrl+B dans ComfyUI, puis QC a la main), donc jamais passe.

CE QUI EST TESTE
    PuLID et ControlNet injectent tous les deux dans les memes blocs de Flux.
    Rien dans les mesures du projet ne dit ce que ca fait au score d'identite.
    Tant que ce n'est pas mesure, la pose ne descend pas en production.

CE QUI EST TENU CONSTANT
    Meme prompt (celui d'une image de production, relu dans le journal), meme
    seed, meme guidance, meme taille. Seul ControlNet bouge. Sans ca les deux
    passes ne sont pas comparables — c'est la premiere phrase du protocole.

LA SOURCE DU SQUELETTE EST UNE IMAGE DE LENA
    Pas une photo de tiers. Deux raisons : la regle du projet (aucune photo
    reelle n'entre dans un graphe hors `pose_extract_ui.json`), et surtout c'est
    le meilleur controle possible — on impose une pose que le modele a DEJA
    produite, donc « la pose n'est pas suivie » ne peut pas s'expliquer par une
    pose irrealisable.

USAGE
    python_embeded\\python.exe AUTOMATION/tests/mesure_pose_controlnet.py
    python_embeded\\python.exe AUTOMATION/tests/mesure_pose_controlnet.py --n 3

Sorties dans PROD/ID_TEST/, jamais dans PROD/LENA — ce n'est pas de la
production. Le tableau final est ecrit sur la sortie standard ET dans
DOCS/lena-pose-controlnet.md si --ecrire est passe.
"""
import argparse
import csv
import json
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
COMFY = OFM.parents[1]
COMFY_INPUT = COMFY / "input"
COMFY_OUTPUT = COMFY / "output"
sys.path.insert(0, str(AUTOMATION))

import lena_batch as lb          # noqa: E402
import ui_to_api                 # noqa: E402

BANC = OFM / "WORKFLOWS/experiments/lena_pose_cn_test_ui.json"
EXTRACT = OFM / "WORKFLOWS/utils/pose_extract_ui.json"
POSE_DIR = OFM / "INPUTS/POSE"

# Roles dans le banc, par identifiant de noeud (voir la carte des groupes).
N_BASE, N_PULID = 5, 10
N_POSITIF, N_GUIDANCE, N_LATENT, N_KSAMPLER, N_SAVE = 14, 16, 17, 18, 20
N_SQUELETTE, N_CN_LOADER, N_CN_APPLY, N_CN_PREVIEW = 21, 22, 23, 24
# Tout le groupe 05 se bypasse ensemble : ne bypasser que l'Apply laisserait le
# ControlNetLoader charger ses 4 Go pour rien a chaque passe de reference.
GROUPE_POSE = (N_SQUELETTE, N_CN_LOADER, N_CN_APPLY, N_CN_PREVIEW)


def log(m):
    print(m, flush=True)


def attendre(url, pid, timeout=900):
    images, err, secs = lb.wait_prompt(url, pid, timeout)
    if err:
        raise RuntimeError(err)
    return images, secs


def extraire_squelette(cfg, source):
    """Photo -> squelette OpenPose. Rend le chemin du PNG produit.

    `detect_face` reste a 'disable', comme dans le graphe : le maillage facial
    68 points decrirait la geometrie des yeux, du nez et de la bouche — exactement
    ce que PuLID doit etre seul a decider.
    """
    url = cfg["comfy_url"].rstrip("/")
    ui = lb.load_json(EXTRACT)
    obj = ui_to_api.fetch_object_info(url)
    api = ui_to_api.convert(ui, obj)
    tmp = COMFY_INPUT / f"_POSE_SRC_{source.name}"
    shutil.copy(source, tmp)
    try:
        for nid, n in api.items():
            if n["class_type"] == "LoadImage":
                n["inputs"]["image"] = tmp.name
        pid, err = lb.queue_prompt(url, api, client_id="mesure_pose")
        if err:
            raise RuntimeError(f"refuse par ComfyUI : {err}")
        images, _ = attendre(url, pid)
        if not images:
            raise RuntimeError("aucun squelette produit")
        im = images[-1]
        return COMFY_OUTPUT / im.get("subfolder", "") / im["filename"]
    finally:
        tmp.unlink(missing_ok=True)


def api_banc(ui, obj, cfg, prompt, seed, taille, squelette, pose, force, fin):
    """Une passe du banc. `pose=False` bypasse tout le groupe 05."""
    modes = {} if pose else {n: 4 for n in GROUPE_POSE}
    api = ui_to_api.convert(ui, obj, node_modes=modes)
    n = lambda i: api[str(i)]
    n(N_BASE)["inputs"]["image"] = cfg["base_gelee"]
    n(N_POSITIF)["inputs"]["text"] = prompt
    n(N_GUIDANCE)["inputs"]["guidance"] = float(cfg["preset"]["guidance"])
    n(N_LATENT)["inputs"].update(width=taille[0], height=taille[1], batch_size=1)
    ks = n(N_KSAMPLER)["inputs"]
    ks["seed"] = seed
    ks["steps"] = int(cfg["preset"]["steps"])
    etiquette = f"pose{force:.2f}_fin{fin:.2f}" if pose else "sans_pose"
    n(N_SAVE)["inputs"]["filename_prefix"] = f"OFM/PROD/ID_TEST/ab_{etiquette}_"
    if pose:
        n(N_SQUELETTE)["inputs"]["image"] = squelette
        cn = n(N_CN_APPLY)["inputs"]
        cn["strength"], cn["start_percent"], cn["end_percent"] = force, 0.0, fin
    return api


def une_passe(url, api, checker, etiquette, seed):
    pid, err = lb.queue_prompt(url, api, client_id="mesure_pose")
    if err:
        raise RuntimeError(f"refuse par ComfyUI : {err}")
    images, secs = attendre(url, pid)
    src = COMFY_OUTPUT / images[-1].get("subfolder", "") / images[-1]["filename"]
    m = checker.mesure(src)
    return {"etiquette": etiquette, "seed": seed, "fichier": src.name,
            "identite": m["score"], "duree": secs, "chemin": src}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", default="lifestyle_salon_lecture_20260824_01.png",
                    help="image de PROD/LENA/OK dont on extrait la pose")
    ap.add_argument("--squelette", default=None,
                    help="squelette DEJA extrait (INPUTS/POSE/...) a imposer au "
                         "lieu d'en extraire un de --source. C'est le test "
                         "DISCORDANT : la pose d'une scene sur le prompt d'une "
                         "autre. Sans lui, on impose au modele la pose qu'il "
                         "allait produire de toute facon, et rien ne prouve que "
                         "ControlNet pilote quoi que ce soit.")
    ap.add_argument("--n", type=int, default=3, help="nombre de seeds")
    ap.add_argument("--forces", default="0.9,0.7",
                    help="valeurs de strength ControlNet a essayer")
    ap.add_argument("--fin", type=float, default=0.65, help="end_percent")
    args = ap.parse_args()

    cfg = lb.load_json(AUTOMATION / "config.json")
    url = cfg["comfy_url"].rstrip("/")
    source = OFM / "PROD/LENA/OK" / args.source

    if not source.exists():
        sys.exit(f"source introuvable : {source}")

    # le prompt et la taille viennent du JOURNAL : on rejoue une image reelle
    ligne = None
    with open(OFM / "PROD/journal_batch.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f, delimiter=";"):
            if r["fichier"] == args.source:
                ligne = r
    if not ligne:
        sys.exit(f"{args.source} est absente du journal — prompt et seed inconnus")
    prompt = ligne["prompt"]
    taille = cfg["formats"].get(ligne["format"] or "4:5", [896, 1120])

    log(f"source      : {args.source}  (identite {ligne['score_identite']})")
    log(f"scene       : {ligne['scene']} · format {ligne['format']} · {taille[0]}x{taille[1]}")
    log(f"guidance    : {cfg['preset']['guidance']} · steps {cfg['preset']['steps']}")

    if args.squelette:
        skel = Path(args.squelette)
        if not skel.is_absolute():
            skel = OFM / skel
        if not skel.exists():
            sys.exit(f"squelette introuvable : {skel}")
        log(f"\n[1] squelette IMPOSE (test discordant) : {skel.name}")
        log("    la pose vient d'une AUTRE scene que le prompt : si la sortie la")
        log("    suit, c'est ControlNet qui pilote, et non le prompt.")
    else:
        log("\n[1] extraction du squelette (DWPose, sans maillage facial)")
        skel = extraire_squelette(cfg, source)
    POSE_DIR.mkdir(parents=True, exist_ok=True)
    # LoadImage ne lit que ComfyUI/input : le squelette doit y etre copie
    dans_input = COMFY_INPUT / skel.name
    shutil.copy(skel, dans_input)
    log(f"    squelette : {skel.relative_to(OFM) if OFM in skel.parents else skel}")

    log("\n[2] chargement du QC d'identite (InsightFace)")
    checker = lb.make_checker(cfg)

    ui = lb.load_json(BANC)
    obj = ui_to_api.fetch_object_info(url)
    forces = [float(x) for x in args.forces.split(",") if x.strip()]
    seeds = [int(ligne["seed"]) + i * 7919 for i in range(args.n)]

    passes = [("sans_pose", None)] + [(f"pose {f}", f) for f in forces]
    log(f"\n[3] {len(seeds)} seed(s) x {len(passes)} condition(s) "
        f"= {len(seeds) * len(passes)} images")

    lignes = []
    for seed in seeds:
        for etiquette, force in passes:
            t0 = time.time()
            api = api_banc(ui, obj, cfg, prompt, seed, taille, dans_input.name,
                           force is not None, force or 0.0, args.fin)
            r = une_passe(url, api, checker, etiquette, seed)
            lignes.append(r)
            sc = f"{r['identite']:.3f}" if r["identite"] is not None else "  —  "
            log(f"    seed {seed} · {etiquette:<10} identite {sc}"
                f"  ({time.time() - t0:.0f}s)")

    dans_input.unlink(missing_ok=True)

    log("\n[4] resultat")
    par_cond = {}
    for r in lignes:
        par_cond.setdefault(r["etiquette"], []).append(r["identite"])
    ref = [x for x in par_cond.get("sans_pose", []) if x is not None]
    moy_ref = sum(ref) / len(ref) if ref else None
    seuil = cfg["qc"]["threshold_ok"]
    log(f"    bande du projet : conforme >= {seuil}, alerte sous "
        f"{cfg['qc']['threshold_watch']}")
    log(f"    {'condition':<12} {'n':>2} {'identite moy.':>14} {'ecart':>8} "
        f"{'sous bande':>11}")
    for cond, scores in par_cond.items():
        vus = [x for x in scores if x is not None]
        if not vus:
            log(f"    {cond:<12} {len(scores):>2}   aucun visage detecte")
            continue
        moy = sum(vus) / len(vus)
        ecart = "" if moy_ref is None or cond == "sans_pose" else f"{moy - moy_ref:+.3f}"
        sous = sum(1 for x in vus if x < seuil)
        log(f"    {cond:<12} {len(vus):>2} {moy:>14.3f} {ecart:>8} {sous:>7}/{len(vus)}")

    log("\n    Lecture (note du groupe 05) :")
    log("      identite stable et pose suivie      -> candidat pour la production")
    log("      identite qui chute sous la bande    -> baisser strength puis end")
    log("      pose non suivie meme a strength 1.0 -> squelette mauvais")
    log("\n    Les images sont dans PROD/ID_TEST/ — la pose se juge a l'oeil,")
    log("    aucune mesure du projet ne la note.")

    sortie = OFM / "PROD/ID_TEST/mesure_pose.json"
    sortie.parent.mkdir(parents=True, exist_ok=True)
    sortie.write_text(json.dumps(
        [{k: v for k, v in r.items() if k != "chemin"} for r in lignes],
        ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"\n    detail : {sortie.relative_to(OFM)}")


if __name__ == "__main__":
    main()
