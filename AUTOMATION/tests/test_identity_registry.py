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
verifie(isinstance(pulid_flux.REQUIRED_ROLES, dict)
        and all(isinstance(v, tuple) and len(v) == 2
                for v in pulid_flux.REQUIRED_ROLES.values()),
        f"pulid_flux.REQUIRED_ROLES bien forme ({list(pulid_flux.REQUIRED_ROLES)})")
verifie(callable(pulid_flux.apply) and callable(lora_sdxl.apply),
        "les deux exposent apply()")

# -------------------------------------------------------- [4] lora_sdxl = stub
print("\n[4] lora_sdxl est un stub qui pointe J6")
try:
    lora_sdxl.apply({}, {}, {}, {})
except NotImplementedError as e:
    verifie("J6" in str(e), f"apply() -> NotImplementedError pointant J6 ({e})")
except Exception as e:  # noqa: BLE001
    verifie(False, f"apply() -> type inattendu {type(e).__name__}")
else:
    verifie(False, "apply() -> aucune erreur (devrait etre un stub)")

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
