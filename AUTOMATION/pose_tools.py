"""Banque de poses : extraction d'un squelette depuis une photo envoyee par
l'utilisateur, gestion de INPUTS/POSE/.

Seul chemin du pipeline, en dehors de l'usage manuel de
WORKFLOWS/utils/pose_extract_ui.json dans ComfyUI, ou une photo reelle de tiers
peut entrer via le tableau de bord. Meme regle qu'ailleurs dans le projet : la
photo source ne persiste JAMAIS — pas dans INPUTS/, pas ailleurs dans le repo.
Elle transite par ComfyUI/input/ le temps de l'extraction et en repart quoi
qu'il arrive (succes ou echec).
"""
import json
import shutil
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import env_config                # noqa: E402
import pose_render                # noqa: E402
import runner as lb              # noqa: E402
import ui_to_api                 # noqa: E402

OFM = HERE.parent
COMFY = env_config.comfyui_root()
COMFY_INPUT = env_config.comfyui_input()
COMFY_OUTPUT = env_config.comfyui_output()
POSE_DIR = OFM / "INPUTS" / "POSE"
PRESETS_DIR = HERE / "pose_presets"
EXTRACT_WF = OFM / "WORKFLOWS" / "utils" / "pose_extract_ui.json"
# Meme dossier scratch que le PNG (widget `filename_prefix` du SaveImage de
# pose_extract_ui.json) ; le node qui ecrit les points-cles y depose son
# propre prefixe, `pose_kps_` — voir _ramasser_points_extraits ci-dessous.
POSE_KPS_SCRATCH = COMFY_OUTPUT / "_LENA_POSE"

FORMATS_ACCEPTES = (".png", ".jpg", ".jpeg", ".webp")


class ExtractionError(RuntimeError):
    """Echec cote banque de poses — message deja prets pour l'ecran.

    Pas seulement l'extraction malgre le nom : reutilisee par le chargement
    et l'enregistrement des points-cles, pour n'avoir qu'une seule exception
    a attraper cote route.
    """


def poses_disponibles():
    if not POSE_DIR.exists():
        return []
    return sorted(f.name for f in POSE_DIR.glob("*.png"))


def poses_disponibles_detail():
    """`[{"nom", "label", "source", "created_at"}]` pour chaque squelette de
    POSE_DIR — le nom de fichier PNG, plus le libelle, la provenance et la
    date de naissance lus dans le JSON soeur QUAND il existe. Une pose
    extraite avant ce chantier n'en a pas (voir `charger_points`) :
    `label`/`source`/`created_at` retombent a None plutot que de lever, la
    banque doit pouvoir lister CES poses-la aussi, pas seulement celles qui
    ont un sidecar."""
    if not POSE_DIR.exists():
        return []
    sortie = []
    for f in sorted(POSE_DIR.glob("*.png")):
        entree = {"nom": f.name, "label": None, "source": None, "created_at": None}
        chemin = _chemin_points(f.name)
        if chemin.exists():
            try:
                frame = lb.load_json(chemin)[0]
                entree["label"] = frame.get("label")
                entree["source"] = frame.get("source")
                entree["created_at"] = frame.get("created_at")
            except Exception:
                pass
        sortie.append(entree)
    return sortie


def supprimer_pose(nom):
    """Retire un squelette de la banque, points-cles compris.

    Ne touche a rien d'autre : une scene qui le referencait encore le perd
    silencieusement au niveau du fichier — `valider_banque` le signalera au
    prochain enregistrement de scenes.json (squelette introuvable).
    """
    p = POSE_DIR / nom
    existait = p.exists()
    if existait:
        p.unlink()
    _chemin_points(nom).unlink(missing_ok=True)
    return existait


def _chemin_points(nom_png):
    return POSE_DIR / (Path(nom_png).stem + ".json")


def _ecrire_points(nom_png, frame, source):
    """Ecrit le sidecar JSON d'un squelette — toujours sous la forme
    enveloppe `[frame]` que ComfyUI lui-meme produit et lit, jamais le frame
    nu. `created_at` n'est horodate qu'une fois : un frame qui en porte deja
    un (rechargement d'une pose existante) garde sa date de naissance."""
    frame = dict(frame)
    frame["source"] = source
    if not frame.get("created_at"):
        frame["created_at"] = datetime.now().isoformat(timespec="seconds")
    _chemin_points(nom_png).write_text(
        json.dumps([frame], ensure_ascii=False), encoding="utf-8")


def charger_points(nom):
    """Points-cles d'un squelette (le frame, jamais la liste-enveloppe).

    Erreur explicite si absent : une pose extraite avant ce chantier, ou
    dont le workflow n'a pas (encore) le node de sauvegarde des points-cles
    branche, n'en a pas — elle n'est pas reconstruite depuis les pixels du
    PNG (decision actee : pas de retrocompatibilite pour les poses
    historiques, ce sont des donnees de test).
    """
    path = _chemin_points(nom)
    if not path.exists():
        raise ExtractionError(
            f"« {nom} » n'a pas de points-clés enregistrés — extraite avant "
            f"cette fonctionnalité, ou JSON manquant. La ré-extraire en "
            f"produira un.")
    return lb.load_json(path)[0]


def enregistrer_points(frame, nom=None):
    """Rend `frame` en PNG (pose_render, local — jamais ComfyUI) et ecrit la
    paire PNG+JSON.

    `nom` fourni : ecrase cette pose. Absent : nouvelle pose, sous le
    prochain index libre de POSE_DIR — meme recherche d'index que
    `extraire`. `frame["source"]` doit deja etre pose par l'appelant
    ("preset" ou "extraction") ; repli sur "preset" si absent (le seul cas
    ou une pose neuve n'en porte pas est un depart de zero, jamais une
    extraction).
    """
    POSE_DIR.mkdir(parents=True, exist_ok=True)
    if nom is None:
        pris = {f.name for f in POSE_DIR.glob("*.png")}
        n = 1
        while f"pose__{n:05d}_.png" in pris:
            n += 1
        nom = f"pose__{n:05d}_.png"
    image = pose_render.render(frame)
    image.save(POSE_DIR / nom)
    _ecrire_points(nom, frame, source=frame.get("source") or "preset")
    return nom


def rendre_apercu(frame):
    """Meme rendu que `enregistrer_points` (pose_render, local) mais SANS rien
    ecrire dans POSE_DIR — un apercu a la demande pendant l'edition, pas un
    enregistrement. Rend l'image PIL telle quelle ; la conversion en octets
    PNG est l'affaire de la route (mise en forme HTTP, pas de cette
    fonction)."""
    return pose_render.render(frame)


def presets_disponibles():
    """`[{"nom", "label"}]` pour chaque gabarit de `pose_presets/` — nom de
    fichier sans extension, label lu dans le fichier (repli sur le nom)."""
    if not PRESETS_DIR.exists():
        return []
    sortie = []
    for f in sorted(PRESETS_DIR.glob("*.json")):
        try:
            frame = lb.load_json(f)[0]
        except Exception:
            continue
        sortie.append({"nom": f.stem, "label": frame.get("label") or f.stem})
    return sortie


def charger_preset(nom):
    path = PRESETS_DIR / f"{nom}.json"
    if not path.exists():
        raise ExtractionError(f"gabarit inconnu : « {nom} »")
    return lb.load_json(path)[0]


def _slug(texte):
    """Convertit un libelle en nom de fichier sur — memes regles que le
    `_slug` prive de compose.py (pas partage : un utilitaire d'une ligne
    ne vaut pas un couplage entre deux modules sans rapport)."""
    import re
    return re.sub(r"[^a-z0-9]+", "-", str(texte or "").strip().lower()).strip("-")


def enregistrer_preset(frame, label):
    """Sauve `frame` comme nouveau gabarit reutilisable (pose_presets/),
    en plus — jamais a la place — de l'enregistrement normal d'une pose
    (`enregistrer_points`) : « creer un template » sur une pose from-scratch,
    capture a l'enregistrement final, pas au choix du gabarit de depart
    (une pose neuve n'a encore rien de personnel a ce moment-la).

    Meme enveloppe JSON qu'une pose enregistree — rien a convertir, seul
    l'endroit change. Le nom de fichier vient du libelle (un gabarit se
    retrouve par son nom dans le selecteur, jamais par un identifiant
    technique) ; un doublon de slug prend un suffixe numerique plutot que
    d'ecraser un gabarit existant du meme nom.
    """
    if not (label or "").strip():
        raise ExtractionError("un gabarit a besoin d'un nom")
    PRESETS_DIR.mkdir(parents=True, exist_ok=True)
    base = _slug(label) or "gabarit"
    nom, n = base, 1
    while (PRESETS_DIR / f"{nom}.json").exists():
        n += 1
        nom = f"{base}-{n}"
    saved = dict(frame)
    saved["label"] = label.strip()
    saved["source"] = "preset"  # un gabarit reste une donnee inventee, jamais une photo
    (PRESETS_DIR / f"{nom}.json").write_text(
        json.dumps([saved], ensure_ascii=False), encoding="utf-8")
    return nom


def _ramasser_points_extraits():
    """Repere le JSON de points-cles produit par CETTE extraction dans le
    dossier scratch (meme namespace que le PNG, prefixe `pose_kps_` — voir
    POSE_KPS_SCRATCH). Rend le frame, ou None si absent (node de sauvegarde
    pas branche sur ce poste — l'extraction reste valide sans, voir
    `extraire`).

    Nettoie TOUT ce qu'il trouve, pas seulement le fichier retenu : comme le
    PNG, ce dossier n'a de sens que vide entre deux extractions ; un JSON
    plus vieux qui traine (ex. avant l'ajout de cette fonction) est du bruit,
    jamais une pose a recuperer a retardement.
    """
    if not POSE_KPS_SCRATCH.exists():
        return None
    candidats = sorted(POSE_KPS_SCRATCH.glob("pose_kps_*.json"),
                       key=lambda p: p.stat().st_mtime, reverse=True)
    if not candidats:
        return None
    frame = lb.load_json(candidats[0])[0]
    for c in candidats:
        c.unlink(missing_ok=True)
    return frame


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

        # Points-cles : meme index que le PNG, absence tolerée (voir
        # _ramasser_points_extraits) — le PNG reste le seul contrat dur.
        frame_extrait = _ramasser_points_extraits()
        if frame_extrait is not None:
            _ecrire_points(nom, frame_extrait, source="extraction")
        return nom
    finally:
        # La photo source ne doit JAMAIS survivre a cet appel, succes ou
        # echec : ce n'est pas une option, c'est la regle du projet.
        tmp_path.unlink(missing_ok=True)
