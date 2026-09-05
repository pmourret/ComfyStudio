# -*- coding: utf-8 -*-
"""comfy_provision.py — sans GPU, sans ComfyUI, sans reseau, execution instantanee.

Ce qui se teste ici : le manifeste est bien forme, ensure_core() produit un
message actionnable (pas un traceback nu) quand ComfyUI est absent, et surtout
le CHEMIN RAPIDE — quand un nœud/modele est deja a la version epinglee, aucun
appel git/pip/reseau n'est tente. C'est la garantie qui permet de brancher ce
module sur CHAQUE lancement (comfy_server.ensure()) sans ralentir le cas normal
ou rien n'a change.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_comfy_provision.py
"""
import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import comfy_provision as cp  # noqa: E402

KO = 0


def verifie(condition, message):
    global KO
    print(f"  {'ok   ' if condition else 'ECHEC'} {message}")
    if not condition:
        KO += 1


def attend_erreur(fn, *a, **kw):
    try:
        fn(*a, **kw)
        return None
    except cp.ProvisionError as e:
        return e


def refuse_appel(*a, **kw):
    raise AssertionError("appel reseau/git/pip inattendu sur le chemin deja-a-jour")


# --------------------------------------------------------- 1. manifeste reel
manifest = cp.load_manifest()
verifie(isinstance(manifest["custom_nodes"], list) and len(manifest["custom_nodes"]) > 0,
        "le manifeste reel du repo declare au moins un custom node")
for entry in manifest["custom_nodes"]:
    if entry["source"] == "git":
        verifie("repo" in entry and "commit" in entry,
                f"{entry['id']} (git) porte repo+commit")
    elif entry["source"] == "registry":
        verifie("publisher" in entry and "version" in entry,
                f"{entry['id']} (registry) porte publisher+version")
    else:
        verifie(False, f"{entry['id']} : source inconnue {entry['source']!r}")
    verifie(entry.get("pip") in ("no-deps", "skip", "default"),
            f"{entry['id']} : champ pip valide ({entry.get('pip')!r})")
    for patch_name in entry.get("patches", []):
        verifie((cp.PATCHES_DIR / patch_name).exists(),
                f"{entry['id']} : patch declare present sur disque ({patch_name})")

for m in manifest["models"]:
    verifie("filename" in m, "chaque entree modele porte un filename")


# ------------------------------------------------- 2. ensure_core() : absent
with tempfile.TemporaryDirectory() as tmp:
    root_vide = Path(tmp)
    err = attend_erreur(cp.ensure_core, manifest, root_vide, log=lambda *_: None)
    verifie(err is not None, "ensure_core() leve quand main.py est absent")
    verifie(err is not None and "git clone" in str(err),
            "le message d'erreur donne une instruction actionnable")


# ------------------------------------------------ 3. ensure_core() : present
with tempfile.TemporaryDirectory() as tmp:
    root_ok = Path(tmp)
    (root_ok / "main.py").write_text("# stub\n", encoding="utf-8")
    (root_ok / "comfyui_version.py").write_text('__version__ = "0.10.0"\n', encoding="utf-8")
    logs = []
    ok = cp.ensure_core(manifest, root_ok, log=logs.append)
    verifie(ok is True, "ensure_core() rend True quand main.py existe")
    verifie(any("ATTENTION" in l for l in logs),
            "une version de coeur plus ancienne que min_version avertit sans lever")


# --------------------------------------- 4. nœud git deja au commit epingle
git_entry = next(e for e in manifest["custom_nodes"] if e["source"] == "git")
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    node_dir = root / "custom_nodes" / git_entry["id"]
    node_dir.mkdir(parents=True)
    (node_dir / ".git").mkdir()  # marqueur suffisant pour _current_commit()

    vrai_git = cp._git
    cp._git = lambda args, cwd=None, log=cp._say: (
        git_entry["commit"] if args == ["rev-parse", "HEAD"] else refuse_appel())
    try:
        changed = cp._ensure_git_node(git_entry, root, log=lambda *_: None)
    finally:
        cp._git = vrai_git
    verifie(changed is False,
            "un nœud git deja au commit epingle ne declenche ni clone ni checkout")


# ------------------------------------ 5. nœud registry deja a la version epinglee
reg_entry = next(e for e in manifest["custom_nodes"] if e["source"] == "registry")
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    node_dir = root / "custom_nodes" / reg_entry["id"]
    node_dir.mkdir(parents=True)
    (node_dir / ".sg_registry_version").write_text(reg_entry["version"], encoding="utf-8")

    import urllib.request
    vrai_urlopen = urllib.request.urlopen
    urllib.request.urlopen = lambda *a, **kw: refuse_appel()
    try:
        changed = cp._ensure_registry_node(reg_entry, root, log=lambda *_: None)
    finally:
        urllib.request.urlopen = vrai_urlopen
    verifie(changed is False,
            "un nœud registry deja a la version epinglee ne declenche aucun appel reseau")


# ------------------------------------------------------- 6. pip policy "skip"
with tempfile.TemporaryDirectory() as tmp:
    node_dir = Path(tmp)
    (node_dir / "requirements.txt").write_text("mediapipe\n", encoding="utf-8")
    vrai_run = cp._run
    cp._run = lambda *a, **kw: refuse_appel()
    try:
        cp._install_requirements({"id": "x", "pip": "skip"}, node_dir, log=lambda *_: None)
        verifie(True, "pip policy 'skip' ne lance jamais pip meme si requirements.txt existe")
    except AssertionError as e:
        verifie(False, str(e))
    finally:
        cp._run = vrai_run


# --------------------------------------------- 7. modele deja present -> skip
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    target_dir = root / "models" / "checkpoints"
    target_dir.mkdir(parents=True)
    (target_dir / "existe_deja.safetensors").write_bytes(b"stub")
    fake_manifest = {
        "comfyui_core": {},
        "custom_nodes": [],
        "models": [
            {"filename": "existe_deja.safetensors", "dest": "checkpoints",
             "url": "https://example.invalid/x.safetensors"},
            {"filename": "manque_sans_url.safetensors", "dest": "checkpoints", "url": None},
        ],
    }
    vrai_download = cp._download
    cp._download = lambda *a, **kw: refuse_appel()
    try:
        downloaded = cp.ensure_models(fake_manifest, root, log=lambda *_: None)
        verifie(downloaded == [], "aucun telechargement quand le fichier existe deja")
    except AssertionError as e:
        verifie(False, str(e))
    finally:
        cp._download = vrai_download


print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
