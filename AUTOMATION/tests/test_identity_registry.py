# -*- coding: utf-8 -*-
"""Registre des verrous d'identite (AUTOMATION/identity/, J5).

POURQUOI CE TEST EXISTE. J5 fait de la chaine `identity` de universe.json une
implementation reelle (CLAUDE.md §4 : l'interface est choisie par l'univers,
pas par le personnage). Le registre doit resoudre chaque univers vers la bonne
implementation, et un nom inconnu doit sortir en erreur claire, pas en KeyError
nu.

Ne teste pas l'injection dans le graphe (test_identity_pulid_flux.py) ni la
mesure d'identite (qc_identity.py, couche commune, hors de ce paquet).

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_identity_registry.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import identity           # noqa: E402
import identity.pulid_flux as pulid_flux   # noqa: E402
import identity.lora_sdxl as lora_sdxl     # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


# --------------------------------------------------------------- [1] get(name)
print("[1] get(name) resout les implementations connues")
verifie(identity.get("pulid_flux") is pulid_flux, "get('pulid_flux')")
verifie(identity.get("lora_sdxl") is lora_sdxl, "get('lora_sdxl')")
try:
    identity.get("does-not-exist")
except ValueError as e:
    verifie("inconnu" in str(e).lower(), f"nom inconnu -> ValueError lisible ({e})")
except Exception as e:  # noqa: BLE001
    verifie(False, f"nom inconnu -> type inattendu {type(e).__name__}")
else:
    verifie(False, "nom inconnu -> aucune erreur")

# ----------------------------------------------------------- [2] for_universe
print("\n[2] for_universe lit universe.json / `identity`")
verifie(identity.for_universe("instagram-influenceur") is pulid_flux,
        "instagram-influenceur -> pulid_flux")
verifie(identity.for_universe("rpg-personnage") is lora_sdxl,
        "rpg-personnage -> lora_sdxl")

# --------------------------------------------------------------- [3] contrat
print("\n[3] contrat des implementations")
for impl in (pulid_flux, lora_sdxl):
    verifie(isinstance(impl.REQUIRED_ROLES, dict)
            and all(isinstance(v, tuple) and len(v) == 2
                    for v in impl.REQUIRED_ROLES.values()),
            f"{impl.__name__}.REQUIRED_ROLES bien forme ({list(impl.REQUIRED_ROLES)})")
verifie(callable(pulid_flux.apply) and callable(lora_sdxl.apply),
        "les deux exposent apply()")

# --------------------------------------- [4] lora_sdxl : contrat reel (J6 etape 2)
print("\n[4] lora_sdxl : verrou IPAdapter FaceID reel, plus un stub")
cfg_sans_lora = {"base_gelee": "ref.png", "identity": {}}
try:
    lora_sdxl.apply({"1": {"inputs": {}}},
                    {"ipadapter_apply": None, "ipadapter_ref": None}, cfg_sans_lora, {})
except RuntimeError as e:
    verifie("introuvable" in str(e), f"role obligatoire manquant -> RuntimeError ({str(e)[:80]}…)")
except Exception as e:  # noqa: BLE001
    verifie(False, f"role manquant -> type inattendu {type(e).__name__}")
else:
    verifie(False, "role manquant -> aucune erreur")

api = {"1": {"inputs": {}}, "2": {"inputs": {}}}
roles = {"ipadapter_apply": {"id": 1}, "ipadapter_ref": {"id": 2}, "character_lora": None}
lora_sdxl.apply(api, roles, cfg_sans_lora, {})
knobs = api["1"]["inputs"]
verifie(knobs["weight"] == lora_sdxl.DEFAULTS["weight"]
        and knobs["end_at"] == lora_sdxl.DEFAULTS["end_at"],
        f"identity absent de config -> DEFAULTS injectes ({knobs})")
verifie(api["2"]["inputs"]["image"] == "ref.png",
        "base_gelee injectee sur le role ipadapter_ref")

cfg_lora_sans_role = {"base_gelee": "ref.png",
                      "identity": {"lora": {"name": "abyssiaelle_v1.safetensors"}}}
try:
    lora_sdxl.apply({"1": {"inputs": {}}, "2": {"inputs": {}}}, roles, cfg_lora_sans_role, {})
except RuntimeError as e:
    verifie("character_lora" in str(e),
            f"lora demande mais role absent du graphe -> RuntimeError ({str(e)[:80]}…)")
else:
    verifie(False, "lora demande sans role dans le graphe -> aucune erreur")

api2 = {"1": {"inputs": {}}, "2": {"inputs": {}}, "3": {"inputs": {}},
       "4": {"inputs": {"text": "a plain room"}}}
roles2 = {**roles, "character_lora": {"id": 3}, "positive": {"id": 4}}
cfg_lora = {"base_gelee": "ref.png",
           "identity": {"lora": {"name": "abyssiaelle_v1.safetensors", "strength": 0.8,
                                 "trigger_word": "abyssiaelle_trigger"}}}
lora_sdxl.apply(api2, roles2, cfg_lora, {})
verifie(api2["3"]["inputs"] == {"lora_name": "abyssiaelle_v1.safetensors",
                                "strength_model": 0.8},
        f"lora active sur son role quand demande + present ({api2['3']['inputs']})")
verifie(api2["4"]["inputs"]["text"] == "abyssiaelle_trigger, a plain room",
        f"mot declencheur prefixe au prompt positif ({api2['4']['inputs']['text']!r})")

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
