# -*- coding: utf-8 -*-
"""Generalisation du runner par famille de modele (J6 etape 3).

POURQUOI CE TEST EXISTE. Jusqu'a J6, `WorkflowRunner._roles()` et `api_for()`
cherchaient `FluxGuidance`/`EmptySD3LatentImage` en dur -- ca marchait tant
qu'un seul univers (Flux) existait. Le premier workflow SDXL (Abyssiaelle,
rpg-personnage) n'a pas de noeud de guidance dedie (le cfg est un widget du
KSampler) et un `EmptyLatentImage` ordinaire, pas `EmptySD3LatentImage`. Le
risque exact (§11) : une generalisation qui casse Lena en la generalisant
pour Abyssiaelle -- CLAUDE.md §1 l'interdit explicitement.

Construit le vrai WorkflowRunner pour les deux univers (ComfyUI requis pour
object_info : IGNORE proprement sinon, meme degrade que test_identity_
pulid_flux.py). base_gelee d'Abyssiaelle est reel depuis J6 etape 5
(ABY_MAIN_REF.jpg, choisi par l'utilisateur) ; `preset`/`qc` restent vides
(etape 6, mesure) -- ce test utilise une COPIE de la config avec un preset
temporaire, en memoire seulement, pour ne pas laisser croire que ces valeurs
sont mesurees (CLAUDE.md §8.4).

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_model_family_sdxl.py
"""
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import runner as lb   # noqa: E402
import universe       # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


print("[1] universe.model_family")
verifie(universe.model_family("instagram-influenceur") == "flux",
        "instagram-influenceur -> flux")
verifie(universe.model_family("rpg-personnage") == "sdxl",
        "rpg-personnage -> sdxl")

cfg_lena = lb.load_config("lena")
try:
    urllib.request.urlopen(cfg_lena["comfy_url"].rstrip("/") + "/object_info/FluxGuidance",
                           timeout=3).close()
except (urllib.error.URLError, OSError):
    print("\n  IGNORE — ComfyUI injoignable (object_info requis pour convertir un graphe)")
    sys.exit(0)

from runner.comfy import WorkflowRunner  # noqa: E402

job_base = {"scene": "test_family", "prompt": "a plain room", "seed": 424242,
           "overrides": {}, "pose": None}

# --------------------------------------------------- [2] lena (flux) inchange
print("\n[2] lena (flux) : comportement inchange (§8.1, non-regression)")
r_lena = WorkflowRunner(cfg_lena, "lena")
verifie(r_lena.model_family == "flux", "model_family = flux")
verifie(r_lena.roles.get("guidance") is not None,
        "role guidance resolu (noeud FluxGuidance present)")
api_lena = r_lena.api_for({**job_base, "format": "4:5"}, "t")
guidance_node = api_lena[str(r_lena.roles["guidance"]["id"])]["inputs"]
verifie(guidance_node["guidance"] == cfg_lena["preset"]["guidance"],
        f"guidance injectee sur le noeud FluxGuidance ({guidance_node['guidance']})")
sampler_lena = api_lena[str(r_lena.roles["sampler"]["id"])]["inputs"]
verifie(sampler_lena.get("cfg") == 1.0,
        f"cfg du KSampler de lena reste le widget baked (Flux pilote par "
        f"FluxGuidance, pas par ce cfg) : {sampler_lena.get('cfg')}")

# ------------------------------------------------- [3] abyssiaelle (sdxl) reel
print("\n[3] abyssiaelle (sdxl) : roles + injection generalisee")
cfg_aby = dict(lb.load_config("abyssiaelle"))
verifie(cfg_aby["base_gelee"] == "ABY_MAIN_REF.jpg",
        f"config.json reel d'abyssiaelle porte sa base gelee (etape 5) : {cfg_aby['base_gelee']!r}")

r_aby = WorkflowRunner(cfg_aby, "abyssiaelle")
verifie(r_aby.model_family == "sdxl", "model_family = sdxl")
verifie(r_aby.roles.get("guidance") is None,
        "role guidance = None (pas de FluxGuidance dans un graphe sdxl)")
for role in ("positive", "latent", "sampler", "save", "ipadapter_apply", "ipadapter_ref"):
    verifie(r_aby.roles.get(role) is not None, f"role {role!r} resolu")

# base_gelee explicitement retiree (copie en memoire) : isole le verrou
# d'identite comme SEULE cause d'echec.
cfg_aby_sans_ref = {**cfg_aby, "base_gelee": None, "preset": {"guidance": 6.0, "steps": 30}}
r_aby_sans_ref = WorkflowRunner(cfg_aby_sans_ref, "abyssiaelle")
try:
    r_aby_sans_ref.api_for({**job_base, "format": "1:1"}, "t")
except RuntimeError as e:
    verifie("base_gelee" in str(e), f"api_for() refuse sans base_gelee ({str(e)[:70]}…)")
else:
    verifie(False, "api_for() aurait du refuser sans base_gelee")

# preset temporaire (memoire seulement, pas encore mesure) : le reste de la
# chaine tourne avec la VRAIE base_gelee (§8.4 -- rien d'invente ici).
cfg_aby["preset"] = {"guidance": 6.0, "steps": 30}
r_aby2 = WorkflowRunner(cfg_aby, "abyssiaelle")
api_aby = r_aby2.api_for({**job_base, "format": "1:1"}, "t")
sampler_aby = api_aby[str(r_aby2.roles["sampler"]["id"])]["inputs"]
verifie(sampler_aby.get("cfg") == 6.0,
        f"cfg injecte directement sur le KSampler (widget, pas de noeud guidance) ({sampler_aby.get('cfg')})")
ref_img = api_aby[str(r_aby2.roles["ipadapter_ref"]["id"])]["inputs"]["image"]
verifie(ref_img == "ABY_MAIN_REF.jpg", f"base_gelee reelle injectee ({ref_img})")

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
