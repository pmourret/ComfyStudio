"""Banque de poses : extraction d'un squelette depuis une photo envoyee par
l'utilisateur, gestion de INPUTS/POSE/.

Seul chemin du pipeline, en dehors de l'usage manuel de
WORKFLOWS/utils/pose_extract_ui.json dans ComfyUI, ou une photo reelle de tiers
peut entrer via le tableau de bord. Meme regle qu'ailleurs dans le projet : la
photo source ne persiste JAMAIS — pas dans INPUTS/, pas ailleurs dans le repo.
Elle transite par ComfyUI/input/ le temps de l'extraction et en repart quoi
qu'il arrive (succes ou echec).
"""
import sys
import time
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parent
COMFY = OFM.parents[1]
COMFY_INPUT = COMFY / "input"
POSE_DIR = OFM / "INPUTS" / "POSE"
EXTRACT_WF = OFM / "WORKFLOWS" / "utils" / "pose_extract_ui.json"

sys.path.insert(0, str(HERE))
import lena_batch as lb          # noqa: E402
import ui_to_api                 # noqa: E402

FORMATS_ACCEPTES = (".png", ".jpg", ".jpeg", ".webp")


class ExtractionError(RuntimeError):
    """Echec cote ComfyUI ou photo illisible — message deja prets pour l'ecran."""


def poses_disponibles():
    if not POSE_DIR.exists():
        return []
    return sorted(f.name for f in POSE_DIR.glob("*.png"))


def supprimer_pose(nom):
    """Retire un squelette de la banque.

    Ne touche a rien d'autre : une scene qui le referencait encore le perd
    silencieusement au niveau du fichier — `valider_banque` le signalera au
    prochain enregistrement de scenes.json (squelette introuvable).
    """
    p = POSE_DIR / nom
    if p.exists():
        p.unlink()
        return True
    return False


def extraire(photo_bytes, nom_fichier_original, comfy_url, timeout=180):
    """Photo (bytes) -> squelette OpenPose. Rend le nom de fichier produit.

    `detect_face` reste a `disable` dans le graphe : c'est une regle
    d'architecture (le maillage facial imposerait une geometrie que PuLID doit
    etre seul a decider), pas un reglage — jamais expose ici.
    """
    ext = Path(nom_fichier_original or "").suffix.lower() or ".png"
    if ext not in FORMATS_ACCEPTES:
        raise ExtractionError(f"format d'image non reconnu : « {ext} »")
    if not photo_bytes:
        raise ExtractionError("image vide")

    POSE_DIR.mkdir(parents=True, exist_ok=True)
    COMFY_INPUT.mkdir(parents=True, exist_ok=True)

    tmp_name = f"_POSE_UPLOAD_{uuid.uuid4().hex[:12]}{ext}"
    tmp_path = COMFY_INPUT / tmp_name
    tmp_path.write_bytes(photo_bytes)
    try:
        ui = lb.load_json(EXTRACT_WF)
        obj = ui_to_api.fetch_object_info(comfy_url)
        api = ui_to_api.convert(ui, obj)
        touche = False
        for node in api.values():
            if node["class_type"] == "LoadImage":
                node["inputs"]["image"] = tmp_name
                touche = True
        if not touche:
            raise ExtractionError(
                "pose_extract_ui.json : aucun LoadImage trouvé — le workflow "
                "a changé de forme")

        pid, err = lb.queue_prompt(comfy_url, api, client_id="pose_tools")
        if err:
            raise ExtractionError(f"refusé par ComfyUI : {err}")
        images, err, secs = lb.wait_prompt(comfy_url, pid, timeout=timeout)
        if err:
            raise ExtractionError(err)
        if not images:
            raise ExtractionError("aucun squelette produit — la photo ne "
                                  "montre peut-être personne de détectable")

        # Le SaveImage du graphe ecrit DEJA dans INPUTS/POSE/ : son prefixe
        # "OFM/INPUTS/POSE/pose_" est resolu par ComfyUI relativement a son
        # propre dossier output, qui CONTIENT OFM/ (toute l'arborescence du
        # projet vit sous ComfyUI/output/OFM). Rien a deplacer.
        nom = images[-1]["filename"]
        produit = POSE_DIR / nom
        if not produit.exists():
            raise ExtractionError(
                f"ComfyUI dit avoir produit {nom} mais il n'est pas dans "
                f"INPUTS/POSE/ — verifier le prefixe de sortie du graphe")
        return nom
    finally:
        # La photo source ne doit JAMAIS survivre a cet appel, succes ou
        # echec : ce n'est pas une option, c'est la regle du projet.
        tmp_path.unlink(missing_ok=True)
