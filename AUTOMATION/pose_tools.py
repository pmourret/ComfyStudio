"""Banque de poses : extraction d'un squelette depuis une photo envoyee par
l'utilisateur, gestion de INPUTS/POSE/.

Seul chemin du pipeline, en dehors de l'usage manuel de
WORKFLOWS/utils/pose_extract_ui.json dans ComfyUI, ou une photo reelle de tiers
peut entrer via le tableau de bord. Meme regle qu'ailleurs dans le projet : la
photo source ne persiste JAMAIS — pas dans INPUTS/, pas ailleurs dans le repo.
Elle transite par ComfyUI/input/ le temps de l'extraction et en repart quoi
qu'il arrive (succes ou echec).
"""
import shutil
import sys
import time
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import env_config                # noqa: E402
import runner as lb              # noqa: E402
import ui_to_api                 # noqa: E402

OFM = HERE.parent
COMFY = env_config.comfyui_root()
COMFY_INPUT = env_config.comfyui_input()
COMFY_OUTPUT = env_config.comfyui_output()
POSE_DIR = OFM / "INPUTS" / "POSE"
EXTRACT_WF = OFM / "WORKFLOWS" / "utils" / "pose_extract_ui.json"

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

        # Le SaveImage du graphe ecrit dans un namespace de scratch a l'interieur
        # de ComfyUI/output (prefixe "_LENA_POSE/pose_") — sans rapport avec
        # l'emplacement du repo (avant J1 ce prefixe etait "OFM/INPUTS/POSE/" et
        # ComfyUI/output CONTENAIT reellement OFM/ ; ce n'est plus le cas depuis
        # le fork). Il faut donc deplacer le fichier vers la vraie POSE_DIR.
        im = images[-1]
        source = COMFY_OUTPUT / im.get("subfolder", "") / im["filename"]
        if not source.exists():
            raise ExtractionError(
                f"ComfyUI dit avoir produit {im['filename']} mais il est "
                f"introuvable a {source} — verifier le prefixe de sortie du graphe")
        # On IGNORE le nom rendu par ComfyUI : son SaveImage renumerote en
        # scannant output/<prefixe>/, qu'on vide a chaque extraction (le fichier
        # part vers POSE_DIR) — il reproduit donc pose__00001_ / pose__00002_ en
        # boucle. S'y fier ecrasait silencieusement un squelette existant et la
        # banque ne grandissait jamais. On prend le prochain index libre DANS
        # POSE_DIR.
        pris = {f.name for f in POSE_DIR.glob("*.png")}
        n = 1
        while f"pose__{n:05d}_.png" in pris:
            n += 1
        nom = f"pose__{n:05d}_.png"
        shutil.move(str(source), str(POSE_DIR / nom))
        return nom
    finally:
        # La photo source ne doit JAMAIS survivre a cet appel, succes ou
        # echec : ce n'est pas une option, c'est la regle du projet.
        tmp_path.unlink(missing_ok=True)
