"""Dialogue avec ComfyUI : file d'attente, attente de resultat, graphe de
production. Aucun couplage personnage — ce module ne connait ni character_id
ni CHARACTERS/.
"""
import json
import shutil
import time
import urllib.error
import urllib.request

import identity
import ui_to_api
import universe

from . import OFM, COMFY_INPUT, load_json
from .prompt import character_style, character_universe

# Roles "latent"/"guidance" par famille de modele (universe.json / model_family,
# CLAUDE.md §4 : choix d'univers, jamais de personnage). Flux pilote la guidance
# via un noeud dedie (FluxGuidance) et un latent SD3 ; SDXL n'a pas de noeud de
# guidance separe (le cfg est un widget du KSampler, voir api_for) et un latent
# ordinaire. Ajoute en J6 avec le premier workflow SDXL (Abyssiaelle) — avant
# ca, tout etait Flux en dur ici comme dans wf_check.ROLES_PROD.
ROLES_LATENT_PAR_FAMILLE = {
    "flux": ("EmptySD3LatentImage", "Format -"),
    "sdxl": ("EmptyLatentImage", "Format -"),
}
ROLES_GUIDANCE_PAR_FAMILLE = {
    "flux": ("FluxGuidance", None),
}


# ----------------------------------------------------- dialogue avec ComfyUI
def queue_prompt(url, api, client_id="runner"):
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
    def __init__(self, cfg, character_id="lena"):
        self.cfg = cfg
        self.character_id = character_id
        # Le verrou d'identite est choisi par l'UNIVERS du personnage (CLAUDE.md
        # §4), pas par le personnage : tous les personnages d'un univers
        # partagent la meme implementation, seuls config.json/`identity` et
        # `base_gelee` changent. J5.
        uid = character_universe(character_id)
        self.identity = identity.for_universe(uid)
        # Famille de modele de l'univers (J6) : decide la table de roles
        # guidance/latent resolue par _roles(), et comment api_for() pilote le
        # cfg. Flux et SDXL n'ont ni le meme noeud de guidance, ni le meme
        # noeud de latent vide.
        self.model_family = universe.model_family(uid)
        # Style de sortie fige a la creation du personnage (CLAUDE.md §3), effet
        # declare par l'univers. Pour instagram-influenceur / realiste :
        # prompt_add vide, pas de swap -> graphe inchange. J5.
        self.style = universe.style_effect(uid, character_style(character_id))
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
        latent_typ, latent_titre = ROLES_LATENT_PAR_FAMILLE.get(
            self.model_family, ROLES_LATENT_PAR_FAMILLE["flux"])
        r = {
            "positive": f(self.ui, "CLIPTextEncode", "POSITIF - scene"),
            "latent": f(self.ui, latent_typ, latent_titre),
            "sampler": f(self.ui, "KSampler", "passe 1"),
            "save": f(self.ui, "SaveImage", "SORTIE production"),
        }
        guidance = ROLES_GUIDANCE_PAR_FAMILLE.get(self.model_family)
        # role obligatoire seulement pour les familles qui pilotent la
        # guidance par un noeud dedie (flux) ; les autres (sdxl) la pilotent
        # en widget KSampler (api_for) et n'ont donc pas ce role.
        r["guidance"] = f(self.ui, *guidance) if guidance else None
        for key, (typ, title) in {
            "switch": ("Switch any [Crystools]", None),
            "refiner": ("KSampler", "img2img denoise"),
            "export_scale": ("ImageScale", "Taille de publication"),
            "grain_node": ("ImageAddNoise", None),
            "sharpen": ("ImageCASharpening+", None),
            # swap de checkpoint par style de sortie (J5). Absent du graphe Flux
            # de Lena (checkpoint all-in-one non nomme par ce role) -> None, et
            # le seul style de son univers est realiste (pas de swap). Sert aux
            # univers a plusieurs styles (rpg-personnage, J6).
            "checkpoint": ("CheckpointLoaderSimple", None),
            # roles du verrou d'identite de l'univers (J5). Resolus ici de
            # facon tolerante ; c'est identity.apply() qui refuse si un role
            # obligatoire manque dans le graphe de ce personnage.
            **self.identity.REQUIRED_ROLES,
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

        # LoRA de personnage (verrou d'identite, cle config.json / identity /
        # lora) : meme mecanisme de bypass par defaut que la pose ci-dessus.
        # identity.apply() (J6) ecrit dans api[str(role["id"])] APRES ce
        # convert() ; sans forcer le noeud actif ici, convert() l'exclut du
        # graphe converti et apply() leve un KeyError brut au lieu du
        # RuntimeError explicite qu'il croit pouvoir lever sur un role absent.
        lora_role = self.roles.get("character_lora")
        if lora_role and (cfg.get("identity") or {}).get("lora", {}).get("name"):
            node_modes[lora_role["id"]] = 0

        api = ui_to_api.convert(self.ui, self.obj, active_groups=self.active_groups,
                                node_modes=node_modes)

        def node(role):
            n = self.roles.get(role)
            return api.get(str(n["id"])) if n else None

        # Style de sortie de l'univers : un fragment ajoute en fin de prompt, et
        # eventuellement un swap de checkpoint. Realiste (seul style de Lena) ->
        # add vide, checkpoint None -> prompt et graphe inchanges (§8.1).
        add = (self.style.get("prompt_add") or "").strip()
        node("positive")["inputs"]["text"] = (
            f"{job['prompt']}, {add}" if add else job["prompt"])
        ckpt = self.style.get("checkpoint")
        if ckpt and self.roles.get("checkpoint"):
            api[str(self.roles["checkpoint"]["id"])]["inputs"]["ckpt_name"] = ckpt
        if self.model_family == "flux":
            node("guidance")["inputs"]["guidance"] = p["guidance"]
        node("latent")["inputs"].update(width=w, height=h, batch_size=1)
        node("sampler")["inputs"].update(seed=job["seed"], steps=p["steps"])
        if self.model_family != "flux":
            # Pas de noeud de guidance dedie (SDXL) : le cfg est un widget
            # direct du KSampler, meme cle de config que Flux (`preset.
            # guidance`) pour garder un seul vocabulaire cross-univers.
            node("sampler")["inputs"]["cfg"] = p["guidance"]
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
            # l'un ni l'autre (mesure). On le met a zero et c'est
            # AUTOMATION/grain.py qui pose le grain.
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

        # Verrou d'identite de l'univers : poids + asset de reference du
        # personnage, injectes dans le graphe converti (J5). En dernier, une
        # fois tout le reste du graphe pose.
        self.identity.apply(api, self.roles, cfg, job)
        return api

    def queue(self, api):
        return queue_prompt(self.url, api)

    def wait(self, prompt_id, timeout=900):
        return wait_prompt(self.url, prompt_id, timeout)
