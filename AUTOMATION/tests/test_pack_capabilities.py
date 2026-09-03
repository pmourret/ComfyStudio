# -*- coding: utf-8 -*-
"""Carte de capacites (universe.py) + is_edit_tier (services/creative.py), J8.2.

POURQUOI CE TEST EXISTE. ADR-0018 remplace `workflow` / `edit_workflow`
(deux champs nommes en dur) par `capabilities` (id -> {graph, roles}) — assez
general pour que la couche plateforme (J8.4) s'y enregistre sans que la forme
change. Trois risques a verrouiller : (1) une regression BYTE-IDENTIQUE du
chemin de production reel de Lena et d'Abyssiaelle, la contrainte explicite
du chantier ; (2) qu'une capacite absente reste absente (pas de cle a `null`,
`capability()` rend None, jamais une KeyError) ; (3) que `"flux+edit"` ne
survive nulle part dans la comparaison de palier — `is_edit_tier` est
desormais le seul endroit qui compare (services/creative.py, J8.2).

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_pack_capabilities.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))
sys.path.insert(0, str(AUTOMATION / "web"))
sys.path.insert(0, str(AUTOMATION / "web" / "api"))

import universe  # noqa: E402
from services.creative import edit_tier, is_edit_tier  # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def attend(exc, fn, texte):
    try:
        fn()
    except exc as e:
        verifie(True, f"{texte} — {type(e).__name__} lisible ({e})")
    except Exception as e:  # noqa: BLE001
        verifie(False, f"{texte} — type inattendu {type(e).__name__} : {e}")
    else:
        verifie(False, f"{texte} — aucune erreur levee")


# --------------------------------------------- [1] les deux packs reels
print("[1] les deux packs reels : insta a produce+edit, rpg n'a QUE produce")
verifie(universe.capability("instagram-influenceur", universe.PRODUCE) is not None,
        "instagram-influenceur declare 'produce'")
verifie(universe.capability("instagram-influenceur", universe.EDIT) is not None,
        "instagram-influenceur declare 'edit'")
verifie(universe.capability("rpg-personnage", universe.PRODUCE) is not None,
        "rpg-personnage declare 'produce'")
verifie(universe.capability("rpg-personnage", universe.EDIT) is None,
        "rpg-personnage n'a PAS de cle 'edit' — absente, pas un null")
verifie("edit" not in universe.capabilities("rpg-personnage"),
        "confirme : aucune cle 'edit' du tout dans la carte de rpg-personnage")

# ------------------------------------- [2] regression BYTE-IDENTIQUE
print("\n[2] regression byte-identique du chemin de production reel")
verifie(universe.capability_graph("instagram-influenceur", universe.PRODUCE)
        == "WORKFLOWS/content/lena_master_prod_ui.json",
        "instagram-influenceur/produce = EXACTEMENT le graphe de Lena d'avant J8.2")
verifie(universe.capability_graph("rpg-personnage", universe.PRODUCE)
        == "WORKFLOWS/content/abyssiaelle_master_prod_ui.json",
        "rpg-personnage/produce = EXACTEMENT le graphe d'Abyssiaelle d'avant J8.2")
verifie(universe.capability_graph("instagram-influenceur", universe.EDIT)
        == "WORKFLOWS/nsfw/lena_nsfw_branch_ui.json",
        "instagram-influenceur/edit = EXACTEMENT le graphe d'edition d'avant J8.2")

# --------------------------------------------- [3] require_capability leve
print("\n[3] require_capability : capacite absente ET pack inconnu")
attend(universe.CapabilityUnavailableError,
       lambda: universe.require_capability("rpg-personnage", universe.EDIT),
       "rpg-personnage n'a pas 'edit'")
attend(universe.UnknownUniverseError,
       lambda: universe.require_capability("does-not-exist", universe.PRODUCE),
       "pack inconnu, via require_capability")
attend(universe.UnknownUniverseError,
       lambda: universe.capability("does-not-exist", universe.PRODUCE),
       "pack inconnu, via capability — coherent avec load_universe/model_family/"
       "types : jamais un None silencieux qui masquerait un id mal orthographie")

# --------------------------------------------- [4] is_edit_tier / edit_tier
print("\n[4] is_edit_tier reconnait le palier d'edition, edit_tier le trouve")
verifie(is_edit_tier({"pipeline": "edit"}) is True, "pipeline 'edit' -> True")
verifie(is_edit_tier({"pipeline": "produce"}) is False, "pipeline 'produce' -> False")
verifie(is_edit_tier({}) is False, "palier sans pipeline -> False")
verifie(is_edit_tier(None) is False, "None -> False, jamais une exception")
verifie(is_edit_tier({"pipeline": "flux+edit"}) is False,
        "l'ancien vocabulaire 'flux+edit' n'est PLUS reconnu (migre, ADR-0018)")

creative = {"intensity": [{"level": 0, "pipeline": "produce"},
                          {"level": 1, "pipeline": "edit", "label": "NSFW"}]}
found = edit_tier(creative)
verifie(found is not None and found["label"] == "NSFW",
        "edit_tier() trouve le palier d'edition dans une liste de paliers")
verifie(edit_tier({"intensity": [{"pipeline": "produce"}]}) is None,
        "edit_tier() rend None quand aucun palier n'edite")

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
