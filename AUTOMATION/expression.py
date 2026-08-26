"""Expression du visage, appliquee APRES le controle d'identite.

POURQUOI APRES, ET PAS AVANT

La mesure d'identite n'est pas neutre vis-a-vis de l'expression. Mesure du
24/08/2026 sur la base gelee elle-meme, donc a identite rigoureusement constante :

    neutre (aller-retour a vide)   0.910
    sourire franc                  0.824
    rire                           0.627

Un rire tombe sous le seuil de surveillance sans qu'aucun trait n'ait change. Si
l'expression etait posee avant le QC, la bande 0.72-0.78 ne voudrait plus rien
dire et il faudrait la recalibrer sans savoir sur quoi.

L'ordre retenu regle le probleme sans rien recalibrer :

    1. le QC juge le visage NEUTRE      -> verdict, bande inchangee
    2. l'expression est posee ensuite   -> cosmetique
    3. on remesure, et ce second score est ENREGISTRE mais ne trie rien

Le second score sert a surveiller : si l'ecart se creuse anormalement sur une
serie, c'est que la deformation abime le visage, et ca se verra dans la revue.

POURQUOI CE MOYEN

Trois voies ont ete mesurees (DOCS/lena-parcours-creatif.md 16) :

  - le PROMPT : aucune prise. 3 seeds x 4 formulations, l'ecart de largeur de
    bouche reste sous le plancher de la methode. PuLID verrouille l'expression en
    meme temps que l'identite, c'est structurel ;
  - DESSERRER PuLID : marche, mais `weight` est un precipice (0.85 -> 0.65 fait
    tomber l'identite de 0.734 a 0.576) et le seul point discutable, start_at
    0.25, donne un rendu que l'utilisateur juge visiblement genere ;
  - `ExpressionEditor` (LivePortrait, deja installe) : deterministe, 2 s, et un
    rendu juge satisfaisant. C'est cette voie.

Le cout d'identite du warp VARIE d'une image a l'autre — mesure entre -0.007 et
-0.046 pour un meme reglage sur deux sources. Raison de plus pour que le verdict
ne dependent pas de lui.
"""
import json
import random
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parent
COMFY = OFM.parents[1]
COMFY_INPUT = COMFY / "input"
COMFY_OUTPUT = COMFY / "output"
sys.path.insert(0, str(HERE))

PREFIXE = "_LENA_EXPR_"          # copie temporaire dans ComfyUI/input

# Bornes du noeud. On refuse d'aller au-dela : les reglages forts donnent un
# rendu caoutchouteux autour de la bouche, et coutent 0.06 a 0.11 d'identite.
BORNES = {
    "smile": (-0.3, 1.3), "aaa": (-30, 120), "eee": (-20, 15), "woo": (-20, 15),
    "blink": (-20, 5), "wink": (0, 25), "eyebrow": (-10, 15),
    "pupil_x": (-15, 15), "pupil_y": (-15, 15),
    "rotate_pitch": (-20, 20), "rotate_yaw": (-20, 20), "rotate_roll": (-20, 20),
}
DEFAUTS = {k: 0.0 for k in BORNES}
DEFAUTS.update({"src_ratio": 1.0, "sample_ratio": 1.0, "crop_factor": 2.0})


def tirage(creative, ton, seed):
    """Parametres d'expression pour un ton, tires dans sa plage.

    Semes par le seed du job : reproductible, et deux images du meme ton n'ont
    pas la meme mine. Une expression figee par ton remplacerait une expression
    figee par cinq — ce ne serait pas une variation.

    Retourne {} si le ton ne declare pas d'expression : rien n'est applique.
    """
    t = next((x for x in creative.get("tones", []) if x.get("key") == ton), None)
    plages = (t or {}).get("expression") or {}
    if not plages:
        return {}
    rng = random.Random(seed)
    out = {}
    for cle, plage in plages.items():
        if cle not in BORNES:
            continue
        lo, hi = (plage if isinstance(plage, (list, tuple)) else (plage, plage))
        bl, bh = BORNES[cle]
        out[cle] = round(max(bl, min(bh, rng.uniform(float(lo), float(hi)))), 3)
    return out


def _graphe(nom_entree, params, prefixe_sortie):
    inputs = dict(DEFAUTS, src_image=["1", 0])
    inputs.update({k: float(v) for k, v in params.items() if k in BORNES})
    return {
        "1": {"class_type": "LoadImage", "inputs": {"image": nom_entree}},
        "2": {"class_type": "ExpressionEditor", "inputs": inputs},
        "3": {"class_type": "SaveImage",
              "inputs": {"images": ["2", 0], "filename_prefix": prefixe_sortie}},
    }


def appliquer(path, params, comfy_url, timeout=300):
    """Pose l'expression sur une image, en place. Retourne True si c'est fait.

    Ne leve jamais : une expression ratee ne doit pas faire perdre une image deja
    produite et deja jugee. L'appelant journalise.
    """
    import shutil
    import lena_batch as lb
    path = Path(path)
    if not params:
        return False
    tmp = COMFY_INPUT / (PREFIXE + path.name)
    sortie = None
    try:
        shutil.copy(path, tmp)
        graphe = _graphe(tmp.name, params, "OFM/PROD/_EXPR/e")
        req = urllib.request.Request(
            comfy_url.rstrip("/") + "/prompt",
            data=json.dumps({"prompt": graphe, "client_id": "lena_expr"}).encode(),
            headers={"Content-Type": "application/json"})
        pid = json.load(urllib.request.urlopen(req, timeout=60))["prompt_id"]
        images, err, _ = lb.wait_prompt(comfy_url, pid, timeout)
        if err or not images:
            return False
        sortie = COMFY_OUTPUT / images[0].get("subfolder", "") / images[0]["filename"]
        shutil.move(str(sortie), str(path))          # ecrase l'image d'origine
        sortie = None
        return True
    except Exception:
        return False
    finally:
        tmp.unlink(missing_ok=True)
        if sortie is not None:
            Path(sortie).unlink(missing_ok=True)
        d = COMFY_OUTPUT / "OFM" / "PROD" / "_EXPR"
        if d.exists() and not any(d.iterdir()):
            d.rmdir()


def attenuer(params, facteur):
    """Meme expression, moins appuyee."""
    return {k: round(v * facteur, 3) for k, v in params.items()}


def poser_sous_budget(path, params, comfy_url, mesurer, avant, budget,
                      journal=None):
    """Pose l'expression sans depasser un budget d'identite.

    POURQUOI UNE BOUCLE PLUTOT QU'UN REGLAGE PLUS SAGE. Le cout du warp varie
    fortement d'une image a l'autre : le meme sourire leger a coute -0.007 sur une
    source et -0.046 sur une autre, et un tirage « joueur » a coute -0.105 la ou
    un reglage plus fort en avait coute -0.013 ailleurs. Aucune plage fixe ne peut
    donc garantir le cout. On mesure, et on recule si c'est trop cher.

    Trois essais au plus : plein, puis moitie, puis rien. Retourne
    (params_retenus, score_apres) — ({}, avant) si tout a ete refuse.

    `mesurer(path)` doit rendre le score d'identite, ou None.
    """
    import shutil
    path = Path(path)
    if not params or avant is None:
        return ({}, avant) if not (params and avant is None) else (
            (params, None) if appliquer(path, params, comfy_url) else ({}, None))

    sauvegarde = path.with_suffix(".avant_expr" + path.suffix)
    shutil.copy(path, sauvegarde)
    try:
        for facteur in (1.0, 0.5):
            essai = params if facteur == 1.0 else attenuer(params, facteur)
            if not appliquer(path, essai, comfy_url):
                shutil.copy(sauvegarde, path)
                return {}, avant
            apres = mesurer(path)
            if apres is not None and (avant - apres) <= budget:
                return essai, apres
            if journal:
                journal(f"expression trop couteuse a {facteur:g}x "
                        f"({avant:.3f} -> {apres:.3f}, budget {budget:g})")
            shutil.copy(sauvegarde, path)      # on repart du visage d'origine
        return {}, avant
    finally:
        sauvegarde.unlink(missing_ok=True)


def resume(params):
    """Forme courte pour le journal technique."""
    return " ".join(f"{k}={v:g}" for k, v in sorted(params.items())) or "aucune"
