"""Outil « modification live par IA » : edition d'images deja validees.

Le NSFW n'est pas une branche, c'est une COMPOSITION de deux outils globaux
(ADR-0003, CLAUDE.md §6) : on n'engendre jamais une scene NSFW a partir de rien.
L'utilisateur choisit lui-meme une image deja validee — pose, decor et identite
conformes — cet outil y applique une instruction d'edition, puis le verrou
d'identite du pack re-rend le visage depuis la base gelee. La retouche
eventuelle revient a l'editeur photo, l'autre outil global.

AUCUN DEFAUT DE PERSONNAGE (J7). `character_id` est obligatoire partout ici, y
compris en mot-cle sur `editer` et `run` : une retombee silencieuse sur 'lena'
est exactement le bug d'isolation du 29/08 — un personnage lisait l'arbre d'un
autre. Chaque chemin (sources, sortie, journal, transit ComfyUI, copie
temporaire) porte le cid.

LE GRAPHE APPARTIENT AU PACK, PAS AU PERSONNAGE. `edit_workflow_path()` le
resout par `universe.require_edit_workflow(pack)` : il n'existe jamais un
fichier de graphe par personnage (CLAUDE.md §8.11), et un pack qui n'en declare
aucun leve EditToolUnavailableError au lieu d'emprunter celui d'une autre
famille de modele. Cote interface, le cran d'edition n'est alors pas propose.

GARDE-FOU D'ARMEMENT. Tant que le registre personnage
(CHARACTERS/<id>/character.json, cle `nsfw`) ne vaut pas true, toute tentative
d'execution leve Disarmed. L'armement est une decision explicite de
l'utilisateur, prise sur l'ecran Application (« Contenu adulte »), et se revoque
au meme endroit. Off a la creation d'un personnage (create_character), deplace
de config.json vers le registre en J4 (ADR-0010).
"""
import random
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import env_config                # noqa: E402
import runner as lb              # noqa: E402
import ui_to_api                 # noqa: E402
import universe                  # noqa: E402

OFM = HERE.parent
COMFY = env_config.comfyui_root()
COMFY_INPUT = env_config.comfyui_input()
COMFY_OUTPUT = env_config.comfyui_output()

GROUPS = ("N1 - ENTREES", "N2 - MODELE NSFW LOCAL", "N3 - EDITION GUIDEE",
          "N3b - REFINER REALISME", "N4 - IDENTITE RESTAUREE", "N5 - SORTIE")
# N4 : PuLID + FaceDetailer. ReActor a ete retire du graphe, son classificateur
# NSFW integre renvoyait un carre noir (verifie le 23/08).


def edit_workflow_path(character_id):
    """Absolute path of the live-AI-edit graph serving THIS character.

    Resolved from the character's pack (`universe.json` / `edit_workflow`), never
    from a path held by the character: a graph belongs to a pack, never to one
    character (CLAUDE.md §8.11). A pack with no edit graph raises
    EditToolUnavailableError rather than falling back on another family's graph.
    """
    pack = lb.character_universe(character_id)
    return OFM / universe.require_edit_workflow(pack)


def edit_tool_state(character_id):
    """Is the live-AI-edit tool available for THIS character, and if not, why?

    Two conditions, never one (J7):
      - the character's own registry is armed (`character.json` / `nsfw`),
        off by default and armed only by an explicit gesture;
      - the character's pack declares an edit graph (`universe.json` /
        `edit_workflow`) — the tool is a PACK asset (ADR-0003: adding a pack
        costs no NSFW work *as long as both global tools exist for it*).

    Returns {armed, pack, has_graph, available, reason}. `reason` is the text
    the interface shows instead of the missing step — a pack without the tool
    says so, it does not stay silent.
    """
    armed = is_armed(character_id)
    pack = lb.character_universe(character_id)
    graph = universe.edit_workflow(pack) if pack else None
    if not graph:
        raison = ("L'outil de modification live par IA n'existe pas encore "
                  f"pour ce pack ({pack}).")
    elif not armed:
        raison = "Le contenu adulte n'est pas activé pour ce personnage."
    else:
        raison = None
    return {"armed": armed, "pack": pack, "has_graph": bool(graph),
            "available": bool(armed and graph), "reason": raison}


def src_prefix(character_id):
    """Prefix of the temporary source copy dropped in ComfyUI/input.

    Namespaced per character: two characters can hold the same file name in
    their own trees, and a shared prefix made the second batch read the first
    one's copy.
    """
    return f"_{character_id.upper()}_NSFW_SRC_"


def transit_prefix(character_id, batch_id):
    """ComfyUI-side transit folder (relative to ComfyUI's own output/).

    The output does NOT stay there: `editer` moves it to
    PROD/<CID>/_NSFW/<bucket>/ as soon as it lands. Namespaced per character
    like every other NSFW path — a shared PROD/_NSFW/_BATCH/ mixed the transit
    of every character in the same folder.
    """
    return f"OFM/PROD/{character_id.upper()}/_NSFW/_BATCH/{batch_id}"


def transit_dir(character_id, batch_id):
    """Same folder, seen from this side: that is where the leftovers to sweep
    actually are. The sweep used to target PROD/<CID>/_NSFW/_BATCH/, a folder
    nothing ever created, so it swept nothing."""
    return COMFY_OUTPUT / transit_prefix(character_id, batch_id)


def out_root(character_id):
    """Racine NSFW d'UN personnage : PROD/<CID>/_NSFW/.

    Sous l'arbre du personnage, pas a cote : un PROD/_NSFW global melangeait
    les sorties de tous les personnages dans les memes buckets, et la Revue
    d'un personnage y voyait celles des autres (29/08/2026).
    """
    return OFM / "PROD" / character_id.upper() / "_NSFW"


def journal_path(character_id):
    """Journal NSFW d'un personnage. Pas de colonne `character` : le chemin
    porte deja l'information (contrairement au journal SFW, unique)."""
    return out_root(character_id) / "journal_nsfw.csv"

# Preambule ajoute a toute instruction : c'est lui qui protege la pose et le decor.
PREAMBLE = ("Reference image 1 is the photograph to edit. Reference image 2 is the "
            "fixed character identity reference, use it only for the face. "
            "Keep unchanged from image 1: pose, body position, framing, camera angle, "
            "background, lighting direction and skin texture. Change only what the "
            "instruction asks.\n\nInstruction: ")


# Ce que le preambule ci-dessus promet de figer. Une instruction qui emploie ces
# termes parle de quelque chose que le graphe garantit deja : soit elle le
# repete (inutile), soit elle demande le contraire (les deux se disputent, et
# c'est l'identite qui paie).
PREAMBULE_FIGE = re.compile(r"\b(pose|posture|position|framing|composition|"
                            r"angle|background|lighting|head|tilted|leaning|"
                            r"lying|laying|kneeling|crouching)\b", re.I)
# Mots qui disent « ne change pas » : leur presence a cote d'un terme fige rend
# l'instruction redondante, leur absence la rend contradictoire. C'est une
# heuristique, pas une regle — d'ou une alerte et jamais un refus.
PREAMBULE_GARDE = re.compile(r"\b(same|keep|keeping|kept|unchanged|identical|"
                             r"preserve|preserving|still|exact)\b", re.I)


def alertes_instruction(instruction):
    """Ce qui merite un oeil dans une instruction d'edition. Ne bloque jamais.

    Mesure du 26/08/2026 sur `journal_nsfw.csv` (25 editions) : la seule
    instruction tombee a 0.543 est la seule a demander un changement de POSE
    (`head tilted back`), que le preambule promet de figer. Deux autres decrivent
    le visage (`a sensual and serene expression`) et aboutissent a 0.769 et
    0.778. Le predicteur n'est donc pas « mentionne le visage » mais « contredit
    le preambule » — et a n=3 ce n'est qu'un motif. On signale, l'humain tranche,
    exactement comme `compose.alertes()`.
    """
    txt = " ".join((instruction or "").split())
    if not txt:
        return []
    out = []
    figes = {m.lower() for m in PREAMBULE_FIGE.findall(txt)}
    if figes:
        mots = ", ".join(sorted(figes))
        if PREAMBULE_GARDE.search(txt):
            out.append(f"redondant : le préambule fige déjà {mots} — "
                       f"inutile de le réécrire, l'instruction ne sert qu'à dire "
                       f"ce qui change")
        else:
            out.append(f"contredit le préambule : {mots} est figé par le graphe. "
                       f"Demander de le changer met l'édition en concurrence avec "
                       f"le préambule, et c'est l'identité qui baisse")
    # geometrie du visage : `assert_no_face` en fait un MUR sur les prompts de
    # scene. Ici seulement un panneau — mesure du 26/08/2026 : deux instructions
    # decrivant une expression ont donne 0.769 et 0.778, donc refuser serait plus
    # strict que ce que les faits justifient. L'instruction part quand meme dans
    # un prompt Qwen ou ce vocabulaire concurrence PuLID : on le signale.
    geo = {m.lower() for m in lb.FORBIDDEN_FACE.findall(txt)}
    if geo:
        out.append(f"décrit la géométrie du visage ({', '.join(sorted(geo))}) — "
                   f"c'est PuLID qui la porte depuis la base gelée. Toléré ici, mais "
                   f"c'est refusé net dans un prompt de scène")
    poil = {m.lower() for m in lb.WATCH_FACE.findall(txt)}
    if poil:
        out.append(f"décrit les cheveux ou la peau ({', '.join(sorted(poil))}) — "
                   f"l'ancre d'identité les porte déjà, l'instruction entre en "
                   f"concurrence avec elle")
    return out


class Disarmed(RuntimeError):
    """Levee quand la branche n'est pas armee."""


def is_armed(character_id):
    """Etat de l'interrupteur NSFW du personnage, lu dans le registre (J4)."""
    return bool(lb.load_character(character_id).get("nsfw"))


def check_armed(character_id):
    if not is_armed(character_id):
        raise Disarmed("branche NSFW desarmee : elle doit etre armee explicitement "
                       "dans l'interface avant toute execution")


def bucket_dir(bucket, character_id):
    if bucket not in ("OK", "A_REVOIR", "REJET", "SANS_VISAGE"):
        raise ValueError("dossier inconnu")
    return out_root(character_id) / bucket


def buckets_sources(cfg=None):
    """Dossiers de tri SFW dont on accepte d'editer les images.

    Une seule source de verite : `config.nsfw.chainer_si`, la cle qui repond deja
    a cette question pour l'enchainement automatique. « Validee » ne veut pas dire
    « dans OK » — l'etage NSFW re-rend le visage depuis la base gelee et regagne
    +0.028 d'identite en moyenne (mesure du 24/08/2026, 8 fois sur 9), donc une
    source en A_REVOIR aboutit tres souvent. REJET et SANS_VISAGE restent exclus :
    PuLID n'a alors rien de coherent a rattraper.
    """
    permis = (cfg or {}).get("nsfw", {}).get("chainer_si") or ["OK", "A_REVOIR"]
    return [b for b in permis if b in ("OK", "A_REVOIR")]


def sources_disponibles(cfg, character_id):
    """Images SFW editables de CE personnage, les plus recentes d'abord."""
    out = []
    for bucket in buckets_sources(cfg):
        d = OFM / "PROD" / character_id.upper() / bucket
        if d.exists():
            out += [(f, bucket) for f in d.glob("*.png")]
    out.sort(key=lambda t: t[0].stat().st_mtime, reverse=True)
    return out


def resoudre_source(nom, cfg, character_id):
    """Chemin d'une image source par son nom, DANS l'arbre de ce personnage.
    None si elle n'y est pas editable.

    Un nom de fichier est unique sur tous les dossiers de tri d'un personnage
    (`lb.nom_libre` balaye PROD/<CID>/), donc chercher par nom y est sans
    ambiguite — mais seulement la : deux personnages peuvent porter le meme
    nom de fichier, d'ou l'arbre en parametre. Rendre None plutot que lever :
    l'image a pu etre retriee entre la selection et le lancement.
    """
    for bucket in buckets_sources(cfg):
        p = OFM / "PROD" / character_id.upper() / bucket / nom
        if p.exists():
            return p
    return None


class NsfwRunner:
    def __init__(self, cfg, character_id):
        check_armed(character_id)
        self.character_id = character_id
        self.cfg = cfg
        self.url = cfg["comfy_url"].rstrip("/")
        self.ui = lb.load_json(edit_workflow_path(character_id))
        self.obj = ui_to_api.fetch_object_info(self.url)
        f = ui_to_api.find_node
        self.roles = {
            "source": f(self.ui, "LoadImage", "Image SFW validee"),
            "ref": f(self.ui, "LoadImage", "BASE GELEE - identite"),
            "ref_face": f(self.ui, "LoadImage", "BASE GELEE - source du visage"),
            "facedetailer": f(self.ui, "FaceDetailer"),
            "final_size": f(self.ui, "ImageScale", "Taille finale"),
            "switch": f(self.ui, "Switch any [Crystools]"),
            "refiner": f(self.ui, "KSampler", "img2img realisme"),
            "grain": f(self.ui, "ImageAddNoise"),
            "sharpen": f(self.ui, "ImageCASharpening+"),
            "positive": f(self.ui, "TextEncodeQwenImageEditPlus", "POSITIF"),
            "latent": f(self.ui, "EmptySD3LatentImage"),
            "sampler": f(self.ui, "KSampler", "edition Qwen"),
            "save": f(self.ui, "SaveImage"),
            "lora": f(self.ui, "LoraLoaderModelOnly"),
        }

    def api_for(self, src_name, instruction, size, seed, batch_id, final_size=None):
        # le LoRA Lightning reste desactive : Qwen-Rapid est deja distille
        api = ui_to_api.convert(self.ui, self.obj, active_groups=GROUPS,
                                node_modes={self.roles["lora"]["id"]: 4})
        node = lambda role: api[str(self.roles[role]["id"])]
        node("source")["inputs"]["image"] = src_name
        node("ref")["inputs"]["image"] = self.cfg["base_gelee"]
        node("ref_face")["inputs"]["image"] = self.cfg["base_gelee"]
        fd = node("facedetailer")["inputs"]
        fd["denoise"] = self.cfg.get("nsfw", {}).get("face_denoise", 0.35)
        fd["seed"] = seed + 11
        node("positive")["inputs"]["prompt"] = PREAMBLE + instruction.strip()
        node("latent")["inputs"].update(width=size[0], height=size[1], batch_size=1)
        ks = node("sampler")["inputs"]
        ks["seed"] = seed
        ks["steps"] = self.cfg.get("nsfw", {}).get("steps", 8)
        ks["cfg"] = self.cfg.get("nsfw", {}).get("cfg", 1.0)
        n = self.cfg.get("nsfw", {})
        # heritage : le preset SFW fait foi, `nsfw` ne porte qu'une surcharge
        node("switch")["inputs"]["boolean"] = bool(lb.reglage(self.cfg, "refiner", True))
        ref = node("refiner")["inputs"]
        ref["denoise"] = float(lb.reglage(self.cfg, "refiner_denoise", 0.40))
        ref["seed"] = seed + 3
        grain = node("grain")["inputs"]
        # 0 par defaut : c'est AUTOMATION/grain.py qui pose le grain apres coup,
        # avec la bonne signature (luminance, pondere vers les ombres). Laisser
        # celui du graphe donnerait a la sortie NSFW une signature de bruit
        # differente de la branche SFW — mesure du 24/08/2026 : c/l 0.78 contre
        # 0.25, deux images du meme feed ne se ressembleraient pas.
        grain["strength"] = float(lb.reglage(self.cfg, "grain_strength", 0.0))
        grain["seed"] = seed + 5
        node("sharpen")["inputs"]["amount"] = float(lb.reglage(self.cfg, "sharpen", 0.30))
        fs = final_size or size
        node("final_size")["inputs"].update(width=fs[0], height=fs[1])
        # Dossier de TRANSIT, cote ComfyUI (relatif a son propre output/), pas
        # l'arbre du personnage : la sortie n'y reste pas, `editer` la deplace
        # aussitot vers PROD/<CID>/_NSFW/<bucket>/.
        node("save")["inputs"]["filename_prefix"] = (
            transit_prefix(self.character_id, batch_id) + "/e")
        return api

    def queue(self, api):
        return lb.queue_prompt(self.url, api,
                               client_id=f"{self.character_id}_nsfw")

    def wait(self, pid, timeout=1800):
        return lb.wait_prompt(self.url, pid, timeout)


def _prepare_source(path, character_id):
    """LoadImage ne lit que ComfyUI/input : on y depose une copie temporaire."""
    dest = COMFY_INPUT / (src_prefix(character_id) + path.name)
    shutil.copy(path, dest)
    return dest


def _size_for(path, cfg, fmt=None):
    """Taille de travail de l'etage d'edition.

    Qwen-Image-Edit rend son meilleur detail autour de 1 MP : au-dela, la zone
    editee ressort molle. On garde donc le cadrage de la source mais on plafonne
    la surface (multiple de 16 impose par le VAE).
    """
    try:
        from PIL import Image
        with Image.open(path) as im:
            w, h = im.size
    except Exception:
        w, h = cfg["formats"].get(fmt or "4:5", [896, 1120])
    cap = cfg.get("nsfw", {}).get("max_pixels", 1_150_000)
    if cap and w * h > cap:
        k = (cap / (w * h)) ** 0.5
        w, h = int(w * k), int(h * k)
    return (max(256, (w // 16) * 16), max(256, (h // 16) * 16))


def editer(src, instruction, cfg, checker=None, runner=None, batch_id=None,
           seed=None, *, character_id):
    """Edite UNE image et range la sortie. Retourne (result, ligne_de_journal).

    `src` est un chemin quelconque : c'est ce qui permet a la generation de niveau
    3 d'enchainer sur sa propre sortie SFW sans passer par PROD/<CID>/OK. Le verrou
    d'armement reste verifie ici, pas seulement chez l'appelant.

    Une seule implementation de l'edition : l'onglet Avance (run) et
    l'enchainement automatique du curseur passent tous les deux par ici.
    """
    check_armed(character_id)
    if not instruction.strip():
        raise ValueError("instruction d'edition vide")
    # signale, ne bloque pas : voir alertes_instruction. Ici plutot que chez
    # l'appelant pour que la CLI, l'ecran d'edition et l'enchainement du curseur
    # aient tous les trois le meme avertissement.
    for a in alertes_instruction(instruction):
        lb.log(f"   instruction : {a}")
    src = Path(src)
    runner = runner or NsfwRunner(cfg, character_id)
    batch_id = batch_id or datetime.now().strftime("%Y%m%d_%H%M%S")
    seed = random.randint(1, 2 ** 48) if seed is None else seed
    result = {"verdict": "ERREUR", "score": None, "fichier": "", "duree": 0.0,
              "error": None}
    ligne = None
    tmp = _prepare_source(src, character_id)
    try:
        from PIL import Image
        with Image.open(src) as _im:
            origine = _im.size              # on republie a la taille d'origine
        api = runner.api_for(tmp.name, instruction, _size_for(src, cfg), seed,
                             batch_id, final_size=origine)
        pid, err = runner.queue(api)
        if err:
            result["error"] = f"refuse par ComfyUI : {err}"
        else:
            images, err, secs = runner.wait(pid)
            result["duree"] = secs
            if err or not images:
                result["error"] = err or "aucune image produite"
            else:
                for im in images:
                    out = COMFY_OUTPUT / im.get("subfolder", "") / im["filename"]
                    score = checker.score(out) if checker else None
                    verdict = checker.verdict(score) if checker else "OK"
                    dest_dir = bucket_dir(verdict, character_id)
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    # nom libre sur TOUS les dossiers _NSFW de ce personnage,
                    # pas seulement celui d'arrivee : voir lb.nom_libre
                    dest = dest_dir / lb.nom_libre(
                        f"nsfw_{src.stem}_{batch_id}", out_root(character_id))
                    shutil.move(str(out), str(dest))
                    # meme grain que la branche SFW, sinon les deux sorties n'ont
                    # pas la meme signature de bruit dans un meme feed
                    lb.appliquer_grain(dest, cfg, seed=seed)
                    result.update(verdict=verdict, score=score, fichier=dest.name)
                    ligne = [datetime.now().isoformat(timespec="seconds"),
                             batch_id, src.name, seed,
                             f"{score:.3f}" if score else "", verdict,
                             dest.name, f"{secs:.0f}", instruction.strip()]
    finally:
        tmp.unlink(missing_ok=True)
    return result, ligne


def run(sources, instruction, cfg, checker=None, on_event=None, should_stop=None,
        *, character_id):
    """sources : noms de fichiers editables (voir `resoudre_source`)."""
    check_armed(character_id)
    if not instruction.strip():
        raise ValueError("instruction d'edition vide")
    on_event = on_event or (lambda kind, **kw: None)
    runner = NsfwRunner(cfg, character_id)
    batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    rows, stats = [], {"OK": 0, "A_REVOIR": 0, "REJET": 0, "SANS_VISAGE": 0, "ERREUR": 0}

    for i, name in enumerate(sources, 1):
        if should_stop and should_stop():
            break
        src = resoudre_source(name, cfg, character_id)
        if src is None:
            stats["ERREUR"] += 1
            continue
        on_event("start", index=i, total=len(sources), source=name)
        result, ligne = editer(src, instruction, cfg, checker, runner, batch_id,
                               character_id=character_id)
        if ligne:
            rows.append(ligne)
            stats[result["verdict"]] = stats.get(result["verdict"], 0) + 1
        if result["verdict"] == "ERREUR":
            stats["ERREUR"] += 1
        on_event("done", index=i, total=len(sources), source=name, result=result)

    # le transit vit cote ComfyUI (voir transit_dir) : c'est CE dossier qu'il
    # faut balayer. Le balayage visait PROD/<CID>/_NSFW/_BATCH/, que rien ne
    # cree — il ne ramassait donc rien et le transit s'accumulait (J7).
    batch_dir = transit_dir(character_id, batch_id)
    if batch_dir.exists() and not any(batch_dir.iterdir()):
        batch_dir.rmdir()
        if batch_dir.parent.exists() and not any(batch_dir.parent.iterdir()):
            batch_dir.parent.rmdir()
    if rows:
        journal(rows, character_id)
    return rows, stats


def journal(rows, character_id):
    import csv
    chemin = journal_path(character_id)
    chemin.parent.mkdir(parents=True, exist_ok=True)
    new = not chemin.exists()
    with open(chemin, "a", newline="", encoding="utf-8") as f:
        wr = csv.writer(f, delimiter=";")
        if new:
            wr.writerow(["date", "batch", "source", "seed", "score_identite",
                         "verdict", "fichier", "duree_s", "instruction"])
        wr.writerows(rows)
