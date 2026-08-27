# -*- coding: utf-8 -*-
"""Injection du verrou PuLID-Flux dans le graphe de prod (J5 etape 2).

POURQUOI CE TEST EXISTE. J5 sort les poids PuLID du widget du workflow vers
config.json (`identity`) et les fait injecter par identity/pulid_flux.py depuis
WorkflowRunner.api_for. L'invariant a proteger (CLAUDE.md §8.1) : le graphe mis
en file doit rester IDENTIQUE a ce que le widget bake produisait — sinon on a
casse le pipeline de Lena en croyant le generaliser.

Ce test construit le vrai WorkflowRunner (ComfyUI requis pour object_info : il
IGNORE proprement sinon) et verifie que le graphe converti porte les valeurs de
config.json, et que ces valeurs egalent celles du widget d'origine.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_identity_pulid_flux.py
"""
import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import runner as lb  # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


cfg = lb.load_config("lena")

# ComfyUI requis (fetch_object_info) : degrade en IGNORE, comme les fumigations.
try:
    urllib.request.urlopen(cfg["comfy_url"].rstrip("/") + "/object_info/ApplyPulidFlux",
                           timeout=3).close()
except Exception:
    print("  IGNORE — ComfyUI injoignable (object_info requis pour convertir le graphe)")
    sys.exit(0)

from runner.comfy import WorkflowRunner  # noqa: E402

# valeurs du WIDGET d'origine, lues dans le workflow UI : la reference anti-derive
ui = lb.load_json(OFM / cfg["workflow"])
n12 = next(n for n in ui["nodes"] if n["id"] == 12)          # ApplyPulidFlux
widget_wse = list(n12["widgets_values"])                     # [weight, start_at, end_at]
print(f"widget d'origine ApplyPulidFlux : {widget_wse}")
print(f"config.json / identity          : {cfg.get('identity')}")

job = {
    "scene": "test_identity", "format": "4:5", "prompt": "a plain room",
    "seed": 424242, "overrides": {}, "pose": None,
}

runner = WorkflowRunner(cfg, "lena")
api = runner.api_for(job, "test_identity")

# -------------------------------------------------- [1] le graphe porte la config
print("\n[1] le graphe converti porte les valeurs de config.json")
knobs = api[str(runner.roles["pulid_apply"]["id"])]["inputs"]
idc = cfg["identity"]
verifie(knobs["weight"] == float(idc["weight"]),
        f"weight = {knobs['weight']} (config {idc['weight']})")
verifie(knobs["start_at"] == float(idc["start_at"]),
        f"start_at = {knobs['start_at']} (config {idc['start_at']})")
verifie(knobs["end_at"] == float(idc["end_at"]),
        f"end_at = {knobs['end_at']} (config {idc['end_at']})")
ref = api[str(runner.roles["pulid_ref"]["id"])]["inputs"]["image"]
verifie(ref == cfg["base_gelee"],
        f"image de reference = {ref!r} (config base_gelee {cfg['base_gelee']!r})")

# ------------------------------------------------ [2] anti-derive vs le widget
print("\n[2] les valeurs de config egalent le widget d'origine (§8.1)")
verifie([knobs["weight"], knobs["start_at"], knobs["end_at"]] == [float(v) for v in widget_wse],
        f"scalaires injectes {[knobs['weight'], knobs['start_at'], knobs['end_at']]} "
        f"== widget {[float(v) for v in widget_wse]}")

# -------------------------------------------- [3] role obligatoire manquant -> erreur
print("\n[3] un role d'identite manquant sort en RuntimeError explicite")
try:
    lb  # keep import used
    import identity.pulid_flux as pf
    pf.apply({"999": {"inputs": {}}}, {"pulid_apply": None, "pulid_ref": None}, cfg, job)
except RuntimeError as e:
    verifie("introuvable" in str(e), f"RuntimeError lisible ({str(e)[:80]}…)")
except Exception as e:  # noqa: BLE001
    verifie(False, f"type inattendu {type(e).__name__} : {e}")
else:
    verifie(False, "aucune erreur alors que les roles sont absents")

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
