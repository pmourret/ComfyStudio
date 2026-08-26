"""Runner batch Lena : banque de scenes -> ComfyUI -> QC identite -> tri -> export.

Usage (depuis n'importe ou, avec le Python embarque de ComfyUI) :
    python_embeded\\python.exe AUTOMATION\\lena_batch.py --dry-run
    python_embeded\\python.exe AUTOMATION\\lena_batch.py --category lifestyle
    python_embeded\\python.exe AUTOMATION\\lena_batch.py --scene cafe_terrasse --count 4

Le workflow UI est converti en API a chaque lancement : ce que tu edites dans
ComfyUI est ce qui tourne. Le runner ne modifie jamais le fichier du workflow.
"""
import argparse
import csv
import json
import random
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
OFM = HERE.parent                       # .../ComfyUI/output/OFM
COMFY = OFM.parents[1]                  # .../ComfyUI
COMFY_OUTPUT = COMFY / "output"
COMFY_INPUT = COMFY / "input"            # LoadImage ne lit que d'ici
sys.path.insert(0, str(HERE))

import ui_to_api  # noqa: E402


# --------------------------------------------------------------------------- io
def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


# --------------------------------------------------------- vocabulaire creatif
# Aucun fragment ajoute au prompt ne doit redecrire le visage : il entrerait en
# concurrence avec PuLID et ferait baisser le score d'identite (voir CLAUDE.md).
# L'ancre (cheveux / yeux / taches de rousseur) et la texture globale sont les
# seuls endroits ou ce vocabulaire est legitime : ils sont exclus du controle.
FORBIDDEN_FACE = re.compile(
    r"\b(faces?|facial|eyes?|eyebrows?|eyelashes?|nose|lips?|mouth|jawlines?|jaw|"
    r"cheekbones?|chin|complexion|freckles?|ethnicity)\b", re.I)


class FaceInPromptError(ValueError):
    """Un fragment de scene ou de taxonomie decrit le visage."""


def assert_no_face(fragments, origine):
    for frag in fragments:
        m = FORBIDDEN_FACE.search(frag or "")
        if m:
            raise FaceInPromptError(
                f"{origine} : ce fragment decrit le visage ({m.group(0)!r}) — "
                f"c'est PuLID qui le porte, jamais le prompt. Fragment : {frag!r}")


# Vocabulaire SIGNALE, pas interdit — le pendant souple de FORBIDDEN_FACE.
# L'ancre decrit deja les cheveux et la texture de peau : un fragment qui les
# redecrit entre en concurrence avec elle. Mais tout n'est pas fautif —
# « wind in the hair » decrit un mouvement, « wet hair » decrit les cheveux, et
# aucune regex ne fait la difference. On signale, l'humain tranche.
# Vit ici, avec FORBIDDEN_FACE : c'est le vocabulaire de prompt du projet, et il
# sert a la fois au composeur de scenes et a l'instruction d'edition NSFW.
WATCH_FACE = re.compile(r"\b(hair|skin|tanned?|pale|blonde?|brunette|"
                        r"redhead|makeup|lipstick)\b", re.I)


def load_creative(path=None):
    """Taxonomie creative. Absente = le runner retombe sur l'ancien comportement."""
    path = Path(path or HERE / "creative.json")
    return load_json(path) if path.exists() else {"intentions": [], "tones": [],
                                                  "intensity": []}


def by_key(items, key):
    return next((it for it in items if it.get("key") == key), None)


def by_level(creative, level):
    return next((it for it in creative.get("intensity", [])
                 if it.get("level") == level), None)


def scene_intention(scene):
    """Defaut de compatibilite : sans champ `intention`, la categorie fait foi."""
    return scene.get("intention") or scene.get("category")


def scene_band(scene):
    """Bande de niveaux d'une scene : (minimum, maximum).

    Le maximum est DEDUIT de la tenue la plus haute definie. Une scene existe a un
    niveau si elle sait comment y habiller le personnage, pas autrement — et
    `wardrobe_for` prenait deja la tenue la plus haute <= niveau, donc la tenue
    faisait deja foi en pratique.

    Avant le 26/08/2026 il fallait saisir ce maximum a la main, en plus des
    tenues : deux champs pour la meme information. Trois scenes declaraient un
    maximum de 3, sans aucun effet — au cran NSFW le filtre tourne au niveau de
    base, seul le minimum compte. Verifie scene par scene : la bande obtenue est
    identique pour les 16 scenes de la banque.

    `intensity` accepte donc desormais un entier (le minimum). Une liste
    [bas, haut] continue d'etre lue pour son `bas` : le `haut` est ignore au
    profit des tenues, jamais en contradiction avec elles.
    """
    brut = scene.get("intensity")
    if isinstance(brut, bool):                       # bool est un int : a exclure
        lo = 0
    elif isinstance(brut, (int, float)):
        lo = int(brut)
    elif brut:
        lo = int(brut[0])
    else:
        lo = 0
    niveaux = [int(k) for k in (scene.get("wardrobe") or {}) if str(k).isdigit()]
    # sans tenue (banque non migree), l'ancien defaut [0, 1] s'applique
    hi = max(niveaux) if niveaux else max(lo, 1)
    return lo, max(lo, hi)


def wardrobe_for(scene, level, creative=None):
    """Tenue(s) de la scene pour ce niveau : la plus haute definie <= niveau.

    Retourne une liste : une scene peut proposer plusieurs tenues au meme niveau,
    ce qui remplace proprement une variante qui n'etait qu'un changement de tenue.

    Une scene SANS `wardrobe` ne recoit aucun fragment de tenue : c'est le cas
    d'une scene non migree, dont le prompt porte encore sa tenue en dur. Injecter
    la tenue par defaut du palier produirait deux tenues concurrentes dans le meme
    prompt — exactement ce que la migration sert a eviter.
    """
    wd = scene.get("wardrobe") or {}
    for lv in range(level, -1, -1):
        v = wd.get(str(lv))
        if v:
            return list(v) if isinstance(v, list) else [v]
    return [""]


def scene_visible(scene, level, intention=None, tone=None):
    """Le niveau et l'intention filtrent. Le ton, non.

    Le champ `tones` d'une scene dit avec quels tons elle va **bien**, pas les
    seuls tons possibles. En faire un filtre dur amenait des culs-de-sac : par
    exemple lifestyle + elegant ne laissait aucune scene, alors qu'un cafe en
    terrasse se photographie tres bien sur un ton elegant. Le ton reste donc un
    modificateur de prompt, et `tones` sert a mettre en avant les scenes affines
    dans l'interface (voir tone_affinity).
    """
    lo, hi = scene_band(scene)
    if not lo <= level <= hi:
        return False
    if intention and scene_intention(scene) != intention:
        return False
    return True


def tone_affinity(scene, tone):
    """1 si la scene est annoncee comme allant bien avec ce ton, 0 sinon."""
    if not tone or not scene.get("tones"):
        return 0
    return 1 if tone in scene["tones"] else 0


# ------------------------------------------------------------------- plan batch
def build_jobs(scenes_file, args, creative=None):
    """Construit la liste des jobs. Assemblage : DOCS/lena-parcours-creatif.md 5.3.

    `args.intensity` absent vaut niveau 0 (SFW strict). Sur une banque non migree —
    scenes sans `wardrobe`, tenue encore en dur dans le prompt — et sans ton ni
    intention, l'assemblage redonne **exactement** le prompt d'avant la refonte du
    parcours. C'est verifie a l'octet pres par tests/test_build_jobs.py, qui rejoue
    l'ancien algorithme sur scenes.avant-refonte.json.
    """
    data = load_json(scenes_file)
    prefix, anchor, texture = data["prefix"], data["anchor"], data["texture"]
    direction = (data.get("direction") or "").strip()   # note de direction globale
    creative = load_creative() if creative is None else creative

    brut = getattr(args, "intensity", None)
    level = 0 if brut is None or brut == "" else int(brut)
    tone_key = getattr(args, "tone", None) or None
    intention_key = getattr(args, "intention", None) or None
    tone = by_key(creative.get("tones", []), tone_key) if tone_key else None
    intention = (by_key(creative.get("intentions", []), intention_key)
                 if intention_key else None)
    palier = by_level(creative, level)
    if palier is None:
        raise ValueError(f"niveau d'intensite inconnu : {level}")
    position = (creative.get("assemblage", {}).get("wardrobe_position")
                or "apres_scene")

    jobs = []
    for scene in data["scenes"]:
        if args.scene and scene["id"] not in args.scene:
            continue
        if args.category and scene_intention(scene) not in args.category:
            continue
        if not scene_visible(scene, level, intention_key, tone_key):
            continue

        variants = [""] if args.no_variants else [""] + list(scene.get("variants", []))
        tenues = wardrobe_for(scene, level, creative)
        if args.no_variants:
            # "la version la plus simple de la scene" : une seule tenue aussi. Une
            # liste de tenues joue le meme role qu'une liste de variantes, elle
            # doit donc se replier pareil.
            tenues = tenues[:1]
        count = args.count if args.count is not None else scene.get("count", 1)

        # amendement du texte de scene pour CE lancement seulement : il ne touche
        # pas scenes.json. N'a de sens qu'avec une seule scene retenue — c'est a
        # l'appelant de ne le passer que dans ce cas.
        texte_scene = getattr(args, "scene_override", None) or scene["prompt"]

        for tenue in tenues:
            for variant in variants:
                habit = f"wearing {tenue}" if tenue else ""
                # Position de la tenue : la migration l'a deplacee du milieu du
                # prompt vers la fin, et l'A/B du 24/08/2026 a mesure -0.014
                # d'identite (n=7, non concluant mais de signe constant). Le
                # reglage existe pour pouvoir trancher par la mesure.
                corps = ([("tenue", habit), ("scène", texte_scene)]
                         if position == "apres_ancre"
                         else [("scène", texte_scene), ("tenue", habit)])
                # Fragments ETIQUETES par leur source. Le prompt reste construit
                # de la meme facon, dans le meme ordre ; on garde seulement d'ou
                # vient chaque morceau, pour pouvoir le montrer avant de lancer.
                # 69 % du prompt final est assemble ici, hors de la vue de qui
                # ecrit la scene — et deux fragments peuvent se contredire sans
                # que rien ne le signale (mesure du 26/08/2026).
                controles = [*corps,
                             ("ton", (tone or {}).get("prompt_add", "")),
                             ("intention", (intention or {}).get("prompt_add", "")),
                             ("intensité", palier.get("prompt_add", "")),
                             ("variante", variant)]
                assert_no_face([t for _, t in controles], scene["id"])
                morceaux = [("préfixe + ancre", f"{prefix} {anchor}"),
                            *controles,
                            ("texture", texture),
                            ("note de direction", direction)]
                prompt = ", ".join(t for _, t in morceaux if t)
                for i in range(count):
                    jobs.append({
                        "scene": scene["id"],
                        # `category` n'est plus un champ de scene : c'est
                        # l'intention. Elle portait trois roles a la fois
                        # (taxonomie, prefixe de fichier, dossier d'export) et
                        # divergeait de l'intention sur 2 scenes sur 16 — assez
                        # pour ranger `chambre_soir`, une scene Intime, dans
                        # PROD/EXPORT/mode/. Les deux disaient la meme chose ;
                        # celle qui est affichee fait desormais foi.
                        "category": scene_intention(scene),
                        "intention": scene_intention(scene),
                        "tone": tone_key or "",
                        "intensity": level,
                        "outfit": tenue,
                        "format": args.format or scene.get("format", "4:5"),
                        "variant": variant,
                        "index": i + 1,
                        "prompt": prompt,
                        # d'ou vient chaque morceau du prompt. Sert a l'apercu
                        # avant lancement ; n'entre dans aucun calcul.
                        "fragments": [{"source": s, "texte": t}
                                      for s, t in morceaux if t],
                        "seed": args.seed if args.seed is not None
                                else random.randint(1, 2 ** 48),
                        # reglages specifiques a la scene (guidance, refiner_denoise...)
                        "overrides": {k: v for k, v in scene.items()
                                      if k in ("guidance", "steps", "refiner_denoise")},
                        # squelette OpenPose (INPUTS/POSE/<fichier>) que la scene
                        # impose, ou None. Cote SFW uniquement — voir CLAUDE.md,
                        # section pose. A/B mesure : DOCS/lena-pose-controlnet.md.
                        "pose": scene.get("pose") or None,
                    })
    if args.limit is not None:
        jobs = jobs[:args.limit]
    return jobs



# ------------------------------------------------------------- declinaisons
MODES_DECLINAISON = ("lumiere", "ton", "seeds", "intensite")


def jobs_declinaison(scenes_file, source, mode, creative=None, n=3, tone=None):
    """Reconstruit des jobs a partir d'une image DEJA produite.

    C'est la boucle courte du parcours : au lieu de relancer un batch entier, on
    repart d'une image gardee. Le seed est journalise exactement pour ca — a seed
    egal, seul ce qu'on change bouge.

    Passe TOUJOURS par build_jobs : il ne doit exister qu'un seul assembleur de
    prompt dans le projet. Les modes ne font que preparer ses filtres et trier sa
    sortie ; aucun d'eux ne fabrique un prompt.

    `source` est une ligne de journal (scene, intensite, ton, variante, seed).
    Retourne [] quand la declinaison n'a pas de sens pour cette image — scene sans
    autre variante, niveau deja au maximum : c'est a l'appelant de le dire.
    """
    creative = load_creative() if creative is None else creative
    sid = source.get("scene")
    niveau = int(source.get("intensite") or 0)
    ton_src = source.get("ton") or None
    variante = source.get("variante") or ""
    brut = str(source.get("seed") or "")
    seed = int(brut) if brut.isdigit() else None

    def filtres(**kw):
        base = dict(scene=[sid], category=None, format=None, count=1, limit=None,
                    seed=seed, no_variants=True, intensity=niveau,
                    tone=ton_src, intention=None)
        base.update(kw)
        return SimpleNamespace(**base)

    if mode == "lumiere":
        # meme seed, meme tenue : seule la variante de lumiere/saison change
        jobs = build_jobs(scenes_file, filtres(no_variants=False), creative)
        vus, sortie = {variante}, []
        for j in jobs:
            if j["variant"] and j["variant"] not in vus:
                vus.add(j["variant"])
                sortie.append(j)
        return sortie[:n]

    if mode == "ton":
        if not tone or tone == ton_src:
            return []
        return build_jobs(scenes_file, filtres(tone=tone), creative)[:1]

    if mode == "seeds":
        # seeds tires au hasard, pas "voisins" : deux seeds proches ne donnent
        # pas deux images proches en diffusion, l'espace n'est pas continu
        return build_jobs(scenes_file, filtres(seed=None, count=n), creative)[:n]

    if mode == "intensite":
        cible = by_level(creative, niveau + 1)
        if cible is None:
            return []
        # meme regle que partout : au palier a deux passes, la GENERATION tourne
        # au niveau de base, l'edition vient apres
        gen = cible.get("base_level", cible["level"])
        return build_jobs(scenes_file, filtres(intensity=gen), creative)[:1]

    raise ValueError(f"mode de declinaison inconnu : {mode}")


# ----------------------------------------------------- dialogue avec ComfyUI
def queue_prompt(url, api, client_id="lena_batch"):
    """Met un graphe en file. Retourne (prompt_id, erreur)."""
    req = urllib.request.Request(
        url.rstrip("/") + "/prompt",
        data=json.dumps({"prompt": api, "client_id": client_id}).encode(),
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)["prompt_id"], None
    except urllib.error.HTTPError as e:
        return None, e.read().decode()[:800]


def wait_prompt(url, prompt_id, timeout=900):
    """Attend la fin d'un job. Retourne (images, erreur, duree)."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        with urllib.request.urlopen(f"{url.rstrip('/')}/history/{prompt_id}",
                                    timeout=30) as r:
            hist = json.load(r)
        if prompt_id in hist:
            entry = hist[prompt_id]
            errors = [m for m in entry.get("status", {}).get("messages", [])
                      if m[0] == "execution_error"]
            images = [im for out in entry.get("outputs", {}).values()
                      for im in out.get("images", [])
                      if im.get("type") == "output"]
            err = None
            if errors:
                d = errors[0][1]
                err = f"{d.get('node_type')}: {d.get('exception_message', '')[:200]}"
            return images, err, time.time() - t0
        time.sleep(2)
    return [], "timeout", time.time() - t0


# ---------------------------------------------------------------- graphe ComfyUI
class WorkflowRunner:
    def __init__(self, cfg):
        self.cfg = cfg
        self.url = cfg["comfy_url"].rstrip("/")
        self.ui = load_json(OFM / cfg["workflow"])
        self.obj = ui_to_api.fetch_object_info(self.url)
        p = cfg["preset"]
        groups = []
        if p.get("upscale_2k"):
            # Groupe 09 : 4x NMKD-Siax puis redescente 2K, sans repasser par Flux.
            # Mesure du 24/08/2026, seed fixe, meme scene : nettete 143 -> 187
            # (+31 %), identite -0.004, +4 s. Compatible FaceDetailer, contrairement
            # au groupe 05 (hires latent) qui echoue au VAEDecode sur cette machine.
            groups.append("UPSCALE IMAGE 2K")
        if p.get("facedetailer"):
            groups.append("FACEDETAILER")
        if p.get("grain_export"):
            groups.append("GRAIN + EXPORT")
        self.active_groups = groups
        self.roles = self._roles()

    def _roles(self):
        f = ui_to_api.find_node
        r = {
            "positive": f(self.ui, "CLIPTextEncode", "POSITIF - scene"),
            "guidance": f(self.ui, "FluxGuidance"),
            "latent": f(self.ui, "EmptySD3LatentImage", "Format -"),
            "sampler": f(self.ui, "KSampler", "passe 1"),
            "save": f(self.ui, "SaveImage", "SORTIE production"),
        }
        for key, (typ, title) in {
            "switch": ("Switch any [Crystools]", None),
            "refiner": ("KSampler", "img2img denoise"),
            "export_scale": ("ImageScale", "Taille de publication"),
            "grain_node": ("ImageAddNoise", None),
            "sharpen": ("ImageCASharpening+", None),
            # groupe 13 - POSE CONTROLNET, bypasse par defaut dans le graphe.
            # A/B mesure : DOCS/lena-pose-controlnet.md. Absent d'un workflow
            # plus ancien -> le runner s'adapte, comme les autres roles
            # optionnels, et api_for() refuse explicitement si une scene
            # demande une pose sur un graphe qui ne l'a pas.
            "pose_squelette": ("LoadImage", "SQUELETTE DE POSE"),
            "pose_loader": ("ControlNetLoader", None),
            "pose_apply": ("ControlNetApplyAdvanced", None),
            "pose_preview": ("PreviewImage", "QC - squelette reellement envoye"),
        }.items():
            try:
                r[key] = f(self.ui, typ, title)
            except LookupError:
                r[key] = None          # groupe absent : le runner s'adapte
        return r

    def api_for(self, job, batch_id):
        cfg = self.cfg
        p = dict(cfg["preset"], **job.get("overrides", {}))
        w, h = cfg["formats"][job["format"]]

        # La pose est PAR JOB (une scene l'impose ou non), donc decidee ici et
        # non dans self.active_groups (fixe pour tout le batch). Le groupe est
        # bypasse par defaut dans le graphe : convert() l'exclut entierement
        # tant qu'on ne force pas le mode de ses noeuds a 0 (actif). Meme
        # mecanisme que le desarmement du LoRA cote NSFW (node_modes).
        node_modes = {}
        pose = job.get("pose")
        if pose:
            manquants = [k for k in ("pose_squelette", "pose_loader", "pose_apply")
                        if self.roles.get(k) is None]
            if manquants:
                raise RuntimeError(
                    f"scene « {job['scene']} » impose une pose, mais ce workflow "
                    f"n'a pas le groupe POSE CONTROLNET ({', '.join(manquants)} "
                    f"introuvable(s))")
            for key in ("pose_squelette", "pose_loader", "pose_apply", "pose_preview"):
                role = self.roles.get(key)
                if role:
                    node_modes[role["id"]] = 0

        api = ui_to_api.convert(self.ui, self.obj, active_groups=self.active_groups,
                                node_modes=node_modes)

        def node(role):
            n = self.roles.get(role)
            return api.get(str(n["id"])) if n else None

        node("positive")["inputs"]["text"] = job["prompt"]
        node("guidance")["inputs"]["guidance"] = p["guidance"]
        node("latent")["inputs"].update(width=w, height=h, batch_size=1)
        node("sampler")["inputs"].update(seed=job["seed"], steps=p["steps"])
        node("save")["inputs"]["filename_prefix"] = (
            f"OFM/PROD/_BATCH/{batch_id}/{job['scene']}")

        sw = node("switch")
        if sw:
            sw["inputs"]["boolean"] = bool(p.get("refiner"))
        ref = node("refiner")
        if ref:
            ref["inputs"]["denoise"] = p.get("refiner_denoise", 0.40)
            ref["inputs"]["seed"] = job["seed"] + 7
        gr = node("grain_node")
        if gr is not None:
            # `ImageAddNoise` ajoute du bruit RGB : autant de chrominance que de
            # luminance, et a plat sur toute la plage tonale. Un capteur ne fait ni
            # l'un ni l'autre (mesure : DOCS/lena-parcours-creatif.md 11). On le
            # met a zero et c'est AUTOMATION/grain.py qui pose le grain.
            gr["inputs"]["strength"] = float(p.get("grain_strength", 0.0))
            gr["inputs"]["seed"] = job["seed"] + 5
        sh = node("sharpen")
        if sh is not None:
            # pilote au lieu d'etre fige dans le widget : c'est le meme reglage
            # que la branche NSFW, il ne doit exister qu'a un seul endroit
            sh["inputs"]["amount"] = float(p.get("sharpen", 0.30))
        exp = node("export_scale")
        if exp and p.get("grain_export"):
            ew, eh = cfg["export_sizes"][job["format"]]
            exp["inputs"].update(width=ew, height=eh)

        if pose:
            # LoadImage ne lit que ComfyUI/input : la banque INPUTS/POSE/ n'est
            # pas ce dossier, il faut y copier le squelette. Retour sur mtime :
            # eviter une copie a chaque image d'un meme batch sans jamais servir
            # une version perimee si le squelette a ete regenere entre-temps.
            src = OFM / "INPUTS" / "POSE" / pose
            if not src.exists():
                raise FileNotFoundError(
                    f"scene « {job['scene']} » : squelette introuvable — "
                    f"{src.relative_to(OFM)}")
            dst = COMFY_INPUT / src.name
            if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
                shutil.copy(src, dst)
            node("pose_squelette")["inputs"]["image"] = dst.name
            ap = node("pose_apply")["inputs"]
            # Reglages de l'A/B (DOCS/lena-pose-controlnet.md) : fiche du
            # modele, confirmee par la mesure (15 images, 0 sous la bande).
            # start toujours a 0.0 — laisser PuLID seul composer les tout
            # premiers pas n'a jamais fait partie du protocole valide.
            ap["strength"] = float(p.get("pose_strength", 0.9))
            ap["start_percent"] = 0.0
            ap["end_percent"] = float(p.get("pose_end", 0.65))
        return api

    def queue(self, api):
        return queue_prompt(self.url, api)

    def wait(self, prompt_id, timeout=900):
        return wait_prompt(self.url, prompt_id, timeout)


# ------------------------------------------------------------------- tri/export
def nom_libre(stem, racine, ext=".png"):
    """Nom libre dans TOUS les dossiers de tri, pas seulement celui d'arrivee.

    Une image change de dossier au tri. Un nom unique par dossier ne suffit donc
    pas : deux homonymes finissent par se croiser au meme endroit et `shutil.move`
    en ecrase un — perte seche. Le journal et PROD/mesures.json sont eux aussi
    indexes par nom, un doublon y melange deux images.
    Constate le 24/08/2026 : selfie_voiture_20260823_01.png existait a la fois
    dans OK et dans REJET, avec deux seeds et deux scores differents.
    """
    dossiers = [d for d in racine.glob("*") if d.is_dir()] or [racine]
    nom, n = f"{stem}{ext}", 1
    while any((d / nom).exists() for d in dossiers):
        n += 1
        nom = f"{stem}_{n}{ext}"
    return nom


def sort_and_export(src, job, verdict, score, cfg, batch_id):
    """Range l'image selon le verdict QC et produit l'export publiable."""
    day = datetime.now().strftime("%Y%m%d")
    suffix = f"_{job['index']:02d}"
    # evite "selfie_miroir_selfie_miroir_entree" quand l'id reprend la categorie
    label = (job["scene"] if job["scene"].startswith(job["category"])
             else f"{job['category']}_{job['scene']}")
    stem = f"{label}_{day}{suffix}"
    dest_dir = OFM / "PROD" / "LENA" / verdict
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / nom_libre(stem, OFM / "PROD" / "LENA")
    shutil.move(str(src), str(dest))

    export_path = ""
    if cfg["export"]["enabled"] and verdict == "OK":
        try:
            from PIL import Image
            exp_dir = OFM / "PROD" / "EXPORT" / job["category"]
            exp_dir.mkdir(parents=True, exist_ok=True)
            export_path = exp_dir / f"{dest.stem}.{cfg['export']['format']}"
            im = Image.open(dest).convert("RGB")
            ew, eh = cfg["export_sizes"][job["format"]]
            if im.size != (ew, eh):
                im = im.resize((ew, eh), Image.LANCZOS)
            im.save(export_path, quality=cfg["export"]["quality"], subsampling=0)
        except Exception as e:                       # export non bloquant
            log(f"   export impossible : {e}")
            export_path = ""
    return dest, export_path


JOURNAL_COLS = ["date", "batch", "scene", "categorie", "intensite", "ton",
                "variante", "format", "seed", "score_identite", "verdict",
                "fichier", "export", "duree_s", "prompt"]


def ecrire_en_base(rows):
    """Double ecriture : le CSV reste lisible hors outil, la base devient la
    source de verite en lecture. Ne doit jamais faire echouer un batch."""
    try:
        import base
        with base.ouvrir() as cx:
            for r in rows:
                d = dict(zip(JOURNAL_COLS, r))
                cx.execute("INSERT INTO batch (id, debut) VALUES (?,?) "
                           "ON CONFLICT(id) DO NOTHING", (d["batch"], d["date"]))
                iid = base.enregistrer_image(
                    cx, d["fichier"], batch_id=d["batch"], espace="lena",
                    bucket=d["verdict"], scene=d["scene"], intention=d["categorie"],
                    ton=d["ton"] or None,
                    intensite=int(d["intensite"]) if str(d["intensite"]).isdigit() else None,
                    format=d["format"], variante=d["variante"] or None,
                    seed=int(d["seed"]) if str(d["seed"]).isdigit() else None,
                    prompt=d["prompt"], cree_le=d["date"],
                    duree_s=float(d["duree_s"]) if d["duree_s"] else None,
                    export=d["export"] or None)
                if d["score_identite"]:
                    base.enregistrer_score(cx, iid, "identite",
                                           float(d["score_identite"]), d["date"])
            cx.commit()
    except Exception as e:
        log(f"   base : ecriture impossible — {type(e).__name__} : {e}")


def append_log(rows):
    path = OFM / "PROD" / "journal_batch.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    new = not path.exists()
    with open(path, "a", newline="", encoding="utf-8") as f:
        wr = csv.writer(f, delimiter=";")
        if new:
            wr.writerow(JOURNAL_COLS)
        wr.writerows(rows)
    ecrire_en_base(rows)
    return path


# --------------------------------------------------------------- coeur partage
def appliquer_grain(path, cfg, seed=None):
    """Grain de capteur telephone, avant toute mesure.

    Applique AVANT le QC pour que ce qu'on mesure et ce qu'on trie soit ce qui
    sera publie. Ne doit jamais faire echouer un batch : l'image est deja produite.
    """
    p = cfg.get("preset", {})
    if not p.get("grain_telephone"):
        return None
    try:
        import grain
        return grain.appliquer(path, seed=seed)
    except Exception as e:
        log(f"   grain impossible : {type(e).__name__} — {e}")
        return None


def reglage(cfg, cle, defaut=None):
    """Reglage d'etage, avec heritage NSFW -> SFW.

    Regle posee le 24/08/2026 : tout ce qui s'applique a la branche SFW s'applique
    a la branche NSFW. Les deux branches partagent donc `preset`, et `nsfw` ne
    porte qu'une SURCHARGE explicite — pas une valeur dupliquee qui derive en
    silence. Trois reglages restent legitimement propres au NSFW parce qu'ils ne
    designent pas la meme chose : `steps` et `cfg` (Qwen-Rapid distille, pas Flux)
    et `face_denoise` (re-rendre un visage apres edition, pas le retoucher).
    """
    n = cfg.get("nsfw", {})
    if cle in n and n[cle] is not None:
        return n[cle]
    return cfg.get("preset", {}).get(cle, defaut)


def mesurer_realisme(path, bbox):
    """Mesures de realisme (~32 ms). Ne doit JAMAIS faire echouer un batch.

    Elles sont informatives : elles ne deplacent aucun fichier et n'entrent pas
    dans le verdict tant qu'elles ne sont pas calibrees (voir 5.4 de la spec).
    Une image qui se genere bien mais se mesure mal reste une image produite.
    """
    try:
        import qc_realisme
        return qc_realisme.mesure(path, bbox)
    except Exception as e:
        log(f"   mesure de realisme impossible : {type(e).__name__} — {e}")
        return None


def appliquer_expression(path, job, cfg, checker=None, avant=None):
    """Pose l'expression du ton, sous budget d'identite. Rend (params, apres).

    APRES le controle d'identite, jamais avant : la mesure d'identite n'est pas
    neutre vis-a-vis de l'expression (voir AUTOMATION/expression.py). Poser
    l'expression avant le QC rendrait la bande 0.72-0.78 incomparable.

    Le budget est necessaire parce que le cout du warp varie fortement selon
    l'image — mesure entre -0.007 et -0.105 pour des reglages comparables. On
    essaie plein, puis moitie, puis on renonce et l'image reste telle quelle.
    """
    if not cfg.get("preset", {}).get("expression"):
        return {}, avant
    try:
        import expression as ex
        params = ex.tirage(load_creative(), job.get("tone"), job["seed"])
        if not params:
            return {}, avant
        if checker is None or avant is None:
            return (params, None) if ex.appliquer(path, params,
                                                  cfg["comfy_url"]) else ({}, avant)
        budget = float(cfg.get("preset", {}).get("expression_budget", 0.05))
        return ex.poser_sous_budget(
            path, params, cfg["comfy_url"],
            mesurer=lambda p: checker.mesure(p)["score"],
            avant=avant, budget=budget, journal=lambda m: log("   " + m))
    except Exception as e:
        log(f"   expression impossible : {type(e).__name__} — {e}")
    return {}, avant


def ranger_mesures(nom, identite, reel, embedding=None, apres_expression=None,
                   expression=None):
    quand = datetime.now().isoformat(timespec="seconds")
    try:
        import mesures
        mesures.maj(nom, identite=identite, mesure_le=quand,
                    identite_apres_expression=apres_expression,
                    expression=expression or None, **(reel or {}))
    except Exception as e:
        log(f"   enregistrement des mesures impossible : {type(e).__name__} — {e}")
    try:
        import base
        with base.ouvrir() as cx:
            iid = base.enregistrer_image(cx, nom)
            base.enregistrer_score(cx, iid, "identite", identite, quand)
            # score d'apres expression : ENREGISTRE, jamais utilise pour trier.
            # Meme regle que identite_centroide — le verdict reste celui du
            # visage neutre, seul comparable a la bande.
            base.enregistrer_score(cx, iid, "identite_apres_expression",
                                   apres_expression, quand)
            for genre, v in (reel or {}).items():
                base.enregistrer_score(cx, iid, genre, v, quand)
            base.enregistrer_embedding(cx, iid, embedding)
            cx.commit()
    except Exception as e:
        log(f"   base : mesures non enregistrees — {type(e).__name__} : {e}")


def make_checker(cfg):
    """Charge le QC d'identite (InsightFace). Import tardif : ~5 s au 1er appel."""
    import qc_identity
    return qc_identity.IdentityChecker(
        COMFY / "input" / cfg["base_gelee"],
        str(COMFY / "models" / "insightface"),
        cfg["qc"]["threshold_ok"], cfg["qc"]["threshold_watch"])


def execute_jobs(jobs, cfg, checker, batch_id, runner=None, on_event=None,
                 should_stop=None, after=None):
    """Execute la liste de jobs. Utilise par la CLI et par la web UI.

    on_event(kind, **kw) est appele avec kind="start" puis kind="done".
    should_stop() -> True interrompt proprement entre deux jobs.

    after(job, verdict, dest) est appele apres le rangement de chaque image. C'est
    le point d'accroche du niveau d'intensite 3 : l'appelant y enchaine l'edition
    NSFW sur la sortie SFW. Ce module n'a pas a connaitre cette branche — il offre
    un crochet, rien de plus. Une exception dans le crochet ne fait jamais echouer
    le batch : l'image SFW est deja produite et rangee.
    """
    runner = runner or WorkflowRunner(cfg)
    on_event = on_event or (lambda kind, **kw: None)
    rows, stats = [], {"OK": 0, "A_REVOIR": 0, "REJET": 0,
                       "SANS_VISAGE": 0, "ERREUR": 0}

    for i, job in enumerate(jobs, 1):
        if should_stop and should_stop():
            break
        on_event("start", index=i, total=len(jobs), job=job)
        result = {"verdict": "ERREUR", "score": None, "fichier": "", "export": "",
                  "duree": 0.0, "error": None}

        pid, err = runner.queue(runner.api_for(job, batch_id))
        if err:
            result["error"] = f"refuse par ComfyUI : {err}"
        else:
            images, err, secs = runner.wait(pid)
            result["duree"] = secs
            if err or not images:
                result["error"] = err or "aucune image produite"
            else:
                for im in images:
                    src = COMFY_OUTPUT / im.get("subfolder", "") / im["filename"]
                    # 1. le QC juge le visage NEUTRE : c'est lui qui decide du
                    #    verdict, et c'est le seul score comparable a la bande
                    if checker:
                        m = checker.mesure(src)     # score ET cadre du visage
                        score, bbox = m["score"], m["bbox"]
                        verdict = checker.verdict(score)
                    else:
                        m = None
                        score, bbox, verdict = None, None, "OK"
                    # 2. expression puis grain : cosmetiques, apres le verdict.
                    #    L'expression d'abord : le noeud recompose une zone de
                    #    visage et effacerait le grain qu'on y aurait mis.
                    params_expr, apres = appliquer_expression(
                        src, job, cfg, checker=checker, avant=score)
                    appliquer_grain(src, cfg, seed=job["seed"])
                    # 3. le cadre du visage a pu bouger : on le reprend
                    if checker and params_expr:
                        m2 = checker.mesure(src)
                        if m2["bbox"] is not None:
                            bbox = m2["bbox"]
                    reel = mesurer_realisme(src, bbox)
                    dest, export = sort_and_export(src, job, verdict, score, cfg,
                                                   batch_id)
                    if reel or score is not None:
                        ranger_mesures(dest.name, score, reel,
                                       embedding=(m or {}).get("embedding"),
                                       apres_expression=apres,
                                       expression=params_expr)
                    if params_expr:
                        import expression as _ex
                        log(f"   expression ({job.get('tone') or '—'}) : "
                            f"{_ex.resume(params_expr)}"
                            + (f" · identite {score:.3f} -> {apres:.3f}"
                               if apres is not None and score is not None else ""))
                    if after:
                        try:
                            after(job, verdict, dest)
                        except Exception as e:
                            log(f"   enchainement impossible : {type(e).__name__} — {e}")
                    result.update(verdict=verdict, score=score, fichier=dest.name,
                                  export=Path(export).name if export else "")
                    stats[verdict] = stats.get(verdict, 0) + 1
                    rows.append([datetime.now().isoformat(timespec="seconds"),
                                 batch_id, job["scene"], job["category"],
                                 job.get("intensity", 0), job.get("tone", ""),
                                 job["variant"], job["format"], job["seed"],
                                 f"{score:.3f}" if score else "", verdict,
                                 dest.name, result["export"], f"{secs:.0f}",
                                 job["prompt"]])
        if result["verdict"] == "ERREUR":
            stats["ERREUR"] += 1
        on_event("done", index=i, total=len(jobs), job=job, result=result)

    # Balaye TOUS les dossiers de transit vides, pas seulement celui du batch qui
    # vient de finir : un batch interrompu (ComfyUI absent, arret manuel) laissait
    # le sien derriere lui et ils s'accumulaient.
    racine = OFM / "PROD" / "_BATCH"
    if racine.exists():
        for d in racine.iterdir():
            if d.is_dir() and not any(d.iterdir()):
                d.rmdir()
        if not any(racine.iterdir()):
            racine.rmdir()
    if rows:
        append_log(rows)
    return rows, stats


# ------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Runner batch Lena")
    ap.add_argument("--config", default=str(HERE / "config.json"))
    ap.add_argument("--scenes-file", default=str(HERE / "scenes.json"))
    ap.add_argument("--scene", action="append", help="id de scene (repetable)")
    ap.add_argument("--category", action="append", help="categorie (repetable)")
    ap.add_argument("--format", help="force le format (4:5, 2:3, 9:16, 1:1)")
    ap.add_argument("--count", type=int, help="images par scene (ecrase scenes.json)")
    ap.add_argument("--limit", type=int, help="nombre total de jobs maximum")
    ap.add_argument("--seed", type=int, help="seed fixe (reproductibilite)")
    ap.add_argument("--no-variants", action="store_true")
    ap.add_argument("--no-qc", action="store_true", help="pas de score d'identite")
    ap.add_argument("--dry-run", action="store_true", help="affiche le plan, ne lance rien")
    args = ap.parse_args()

    cfg = load_json(args.config)
    jobs = build_jobs(args.scenes_file, args)
    if not jobs:
        log("aucune scene ne correspond aux filtres.")
        return 1

    batch_id = datetime.now().strftime("%Y%m%d_%H%M")
    log(f"batch {batch_id} : {len(jobs)} image(s) a produire")
    if args.dry_run:
        for j in jobs:
            v = f" [{j['variant'][:30]}]" if j["variant"] else ""
            print(f"  {j['category']:14} {j['scene']:22} {j['format']:5} "
                  f"seed={j['seed']}{v}")
            print(f"       {j['prompt'][:150]}...")
        return 0

    runner = WorkflowRunner(cfg)
    p = cfg["preset"]
    log(f"prereglage : guidance {p['guidance']} | refiner "
        f"{'ON ' + str(p['refiner_denoise']) if p['refiner'] else 'OFF'} | "
        f"facedetailer {'ON' if p['facedetailer'] else 'OFF'} | "
        f"grain {'ON' if p['grain_export'] else 'OFF'}")

    checker = None if args.no_qc else make_checker(cfg)

    def on_event(kind, **kw):
        if kind == "done":
            job, r = kw["job"], kw["result"]
            head = f"{kw['index']}/{kw['total']} {job['scene']} ({job['format']})"
            if r["verdict"] == "ERREUR":
                log(f"{head} : echec -> {r.get('error')}")
            else:
                sc = f"({r['score']:.3f}) " if r.get("score") else ""
                log(f"{head} : {r['verdict']} {sc}{r['duree']:.0f}s -> {r['fichier']}")

    rows, stats = execute_jobs(jobs, cfg, checker, batch_id, runner=runner,
                               on_event=on_event)
    log("termine : " + " | ".join(f"{k} {v}" for k, v in stats.items() if v))
    if rows:
        log(f"journal : {OFM / 'PROD' / 'journal_batch.csv'}")
        log(f"a publier : {OFM / 'PROD' / 'EXPORT'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
