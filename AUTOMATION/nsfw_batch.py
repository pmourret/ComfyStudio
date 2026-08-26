"""Branche NSFW : edition d'images SFW deja validees, puis remise du visage.

Principe (voir DOCS/lena-identite-pulid.md) : on n'engendre jamais une scene NSFW
a partir de rien. On part d'une image deja validee — pose, decor et identite
conformes — on applique une instruction d'edition avec le modele local
Qwen-Rapid-AIO-NSFW, puis PuLID + FaceDetailer re-rendent le visage depuis la
base gelee (voir le commentaire de GROUPS plus bas : ReActor a ete retire).

GARDE-FOU D'ARMEMENT. Tant que config.json ne porte pas nsfw.enabled = true,
toute tentative d'execution leve Disarmed. L'armement est une decision explicite
de l'utilisateur, prise dans l'interface ; elle a ete prise le 23/08/2026 et se
revoque d'un clic.
"""
import random
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parent
COMFY = OFM.parents[1]
COMFY_INPUT = COMFY / "input"
COMFY_OUTPUT = COMFY / "output"
sys.path.insert(0, str(HERE))

import lena_batch as lb          # noqa: E402
import ui_to_api                 # noqa: E402

WORKFLOW = "WORKFLOWS/nsfw/lena_nsfw_branch_ui.json"
GROUPS = ("N1 - ENTREES", "N2 - MODELE NSFW LOCAL", "N3 - EDITION GUIDEE",
          "N3b - REFINER REALISME", "N4 - IDENTITE RESTAUREE", "N5 - SORTIE")
# N4 : PuLID + FaceDetailer. ReActor a ete retire du graphe, son classificateur
# NSFW integre renvoyait un carre noir (verifie le 23/08).
SRC_PREFIX = "_LENA_NSFW_SRC_"          # copie temporaire dans ComfyUI/input
OUT_ROOT = OFM / "PROD" / "_NSFW"
JOURNAL = OUT_ROOT / "journal_nsfw.csv"

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


def is_armed(cfg):
    return bool(cfg.get("nsfw", {}).get("enabled"))


def check_armed(cfg):
    if not is_armed(cfg):
        raise Disarmed("branche NSFW desarmee : elle doit etre armee explicitement "
                       "dans l'interface avant toute execution")


def bucket_dir(bucket):
    if bucket not in ("OK", "A_REVOIR", "REJET", "SANS_VISAGE"):
        raise ValueError("dossier inconnu")
    return OUT_ROOT / bucket


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


def sources_disponibles(cfg=None):
    """Images SFW editables, les plus recentes d'abord."""
    out = []
    for bucket in buckets_sources(cfg):
        d = OFM / "PROD" / "LENA" / bucket
        if d.exists():
            out += [(f, bucket) for f in d.glob("*.png")]
    out.sort(key=lambda t: t[0].stat().st_mtime, reverse=True)
    return out


def resoudre_source(nom, cfg=None):
    """Chemin d'une image source par son nom. None si elle n'est pas editable.

    Un nom de fichier est unique sur TOUS les dossiers de tri (`lb.nom_libre`),
    donc chercher par nom est sans ambiguite. Rendre None plutot que lever :
    l'image a pu etre retriee entre la selection et le lancement.
    """
    for bucket in buckets_sources(cfg):
        p = OFM / "PROD" / "LENA" / bucket / nom
        if p.exists():
            return p
    return None


class NsfwRunner:
    def __init__(self, cfg):
        check_armed(cfg)
        self.cfg = cfg
        self.url = cfg["comfy_url"].rstrip("/")
        self.ui = lb.load_json(OFM / cfg.get("nsfw", {}).get("workflow", WORKFLOW))
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
        node("save")["inputs"]["filename_prefix"] = f"OFM/PROD/_NSFW/_BATCH/{batch_id}/e"
        return api

    def queue(self, api):
        return lb.queue_prompt(self.url, api, client_id="lena_nsfw")

    def wait(self, pid, timeout=1800):
        return lb.wait_prompt(self.url, pid, timeout)


def _prepare_source(path):
    """LoadImage ne lit que ComfyUI/input : on y depose une copie temporaire."""
    dest = COMFY_INPUT / (SRC_PREFIX + path.name)
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
           seed=None):
    """Edite UNE image et range la sortie. Retourne (result, ligne_de_journal).

    `src` est un chemin quelconque : c'est ce qui permet a la generation de niveau
    3 d'enchainer sur sa propre sortie SFW sans passer par PROD/LENA/OK. Le verrou
    d'armement reste verifie ici, pas seulement chez l'appelant.

    Une seule implementation de l'edition : l'onglet Avance (run) et
    l'enchainement automatique du curseur passent tous les deux par ici.
    """
    check_armed(cfg)
    if not instruction.strip():
        raise ValueError("instruction d'edition vide")
    # signale, ne bloque pas : voir alertes_instruction. Ici plutot que chez
    # l'appelant pour que la CLI, l'ecran d'edition et l'enchainement du curseur
    # aient tous les trois le meme avertissement.
    for a in alertes_instruction(instruction):
        lb.log(f"   instruction : {a}")
    src = Path(src)
    runner = runner or NsfwRunner(cfg)
    batch_id = batch_id or datetime.now().strftime("%Y%m%d_%H%M%S")
    seed = random.randint(1, 2 ** 48) if seed is None else seed
    result = {"verdict": "ERREUR", "score": None, "fichier": "", "duree": 0.0,
              "error": None}
    ligne = None
    tmp = _prepare_source(src)
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
                    dest_dir = bucket_dir(verdict)
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    # nom libre sur TOUS les dossiers de _NSFW, pas seulement
                    # celui d'arrivee : voir lb.nom_libre
                    dest = dest_dir / lb.nom_libre(
                        f"nsfw_{src.stem}_{batch_id}", OUT_ROOT)
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


def run(sources, instruction, cfg, checker=None, on_event=None, should_stop=None):
    """sources : noms de fichiers editables (voir `resoudre_source`)."""
    check_armed(cfg)
    if not instruction.strip():
        raise ValueError("instruction d'edition vide")
    on_event = on_event or (lambda kind, **kw: None)
    runner = NsfwRunner(cfg)
    batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    rows, stats = [], {"OK": 0, "A_REVOIR": 0, "REJET": 0, "SANS_VISAGE": 0, "ERREUR": 0}

    for i, name in enumerate(sources, 1):
        if should_stop and should_stop():
            break
        src = resoudre_source(name, cfg)
        if src is None:
            stats["ERREUR"] += 1
            continue
        on_event("start", index=i, total=len(sources), source=name)
        result, ligne = editer(src, instruction, cfg, checker, runner, batch_id)
        if ligne:
            rows.append(ligne)
            stats[result["verdict"]] = stats.get(result["verdict"], 0) + 1
        if result["verdict"] == "ERREUR":
            stats["ERREUR"] += 1
        on_event("done", index=i, total=len(sources), source=name, result=result)

    batch_dir = OUT_ROOT / "_BATCH" / batch_id
    if batch_dir.exists() and not any(batch_dir.iterdir()):
        batch_dir.rmdir()
        if not any(batch_dir.parent.iterdir()):
            batch_dir.parent.rmdir()
    if rows:
        journal(rows)
    return rows, stats


def journal(rows):
    import csv
    JOURNAL.parent.mkdir(parents=True, exist_ok=True)
    new = not JOURNAL.exists()
    with open(JOURNAL, "a", newline="", encoding="utf-8") as f:
        wr = csv.writer(f, delimiter=";")
        if new:
            wr.writerow(["date", "batch", "source", "seed", "score_identite",
                         "verdict", "fichier", "duree_s", "instruction"])
        wr.writerows(rows)
