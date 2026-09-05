"""Ensure a ComfyUI installation carries what THIS repo's workflows need.

Complements comfy_server.py, which manages the PROCESS (start/stop/stats).
This module manages the CONTENT of the installation ComfyUI runs from:
custom nodes and model files declared in comfyui_manifest.json.

The ComfyUI core itself is NOT installed by this module -- same split as
AUTOMATION/tools/toolchain.py for the Node/Playwright toolchain ("Node
itself is NOT installed by this script -- it is the one prerequisite the
developer brings"). ensure_core() only checks it is there and explains how
to get it when it is not. See DOCS/adr/0022-manifeste-comfyui-provisionne.md.

    python AUTOMATION/comfy_provision.py --check    # report only, no writes
    python AUTOMATION/comfy_provision.py --ensure   # install/update what's missing

Called automatically by comfy_server.ensure(), right before start() -- never
while ComfyUI is already running (a custom node change only takes effect on
the next restart anyway, so there is nothing to gain from checking sooner).
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import env_config  # noqa: E402

MANIFEST_PATH = HERE / "comfyui_manifest.json"
PATCHES_DIR = HERE / "comfyui_patches"

REGISTRY_API = "https://api.comfy.org/nodes/{id}/versions/{version}"


class ProvisionError(RuntimeError):
    """A step could not complete and provisioning must stop here."""


def _say(msg):
    print(msg, flush=True)


def load_manifest(path=MANIFEST_PATH):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    for key in ("comfyui_core", "custom_nodes", "models"):
        if key not in data:
            raise ProvisionError(f"{path} : cle '{key}' manquante")
    return data


# --------------------------------------------------------------- coeur ComfyUI
def ensure_core(manifest, root, log=_say):
    """Verifie que `root` est une vraie installation ComfyUI. Ne l'installe
    jamais : voir le choix documente dans l'ADR-0022 (prerequis semi-manuel).
    """
    main_py = root / "main.py"
    if not main_py.exists():
        raise ProvisionError(
            f"ComfyUI introuvable dans {root} (pas de main.py).\n"
            "Ce module ne l'installe pas automatiquement -- deux options :\n"
            f"  1) git clone https://github.com/comfyanonymous/ComfyUI \"{root}\"\n"
            "  2) pointer COMFYUI_ROOT (.env) vers une installation ComfyUI "
            "deja presente sur cette machine.\n"
            "Voir DOCS/adr/0022-manifeste-comfyui-provisionne.md.")

    version_file = root / "comfyui_version.py"
    min_version = manifest["comfyui_core"].get("min_version")
    if min_version and version_file.exists():
        ns = {}
        exec(version_file.read_text(encoding="utf-8"), ns)  # nosec - our own repo's simple assignment file
        current = ns.get("__version__")
        if current and _version_tuple(current) < _version_tuple(min_version):
            log(f"ATTENTION : ComfyUI {current} est plus ancien que {min_version} "
                "(version minimale attendue par ce repo) -- pas bloquant, "
                "mais un comportement different est possible.")
    return True


def _version_tuple(v):
    return tuple(int(p) for p in v.split(".") if p.isdigit())


# ------------------------------------------------------------------- git/pip
def _run(cmd, cwd=None, log=_say):
    """Lance une commande, leve ProvisionError avec stderr si elle echoue."""
    result = subprocess.run(cmd, cwd=str(cwd) if cwd else None,
                             capture_output=True, text=True)
    if result.returncode != 0:
        raise ProvisionError(
            f"{' '.join(cmd)} a echoue (code {result.returncode}) :\n{result.stderr.strip()}")
    return result.stdout


def _git(args, cwd=None, log=_say):
    return _run(["git", *args], cwd=cwd, log=log)


def _current_commit(node_dir):
    if not (node_dir / ".git").exists():
        return None
    try:
        return _git(["rev-parse", "HEAD"], cwd=node_dir).strip()
    except ProvisionError:
        return None


def _apply_patches(entry, node_dir, log):
    for patch_name in entry.get("patches", []):
        patch_path = PATCHES_DIR / patch_name
        if not patch_path.exists():
            raise ProvisionError(f"patch declare introuvable : {patch_path}")
        _git(["apply", str(patch_path)], cwd=node_dir, log=log)
        log(f"  patch applique : {patch_name}")


def _install_requirements(entry, node_dir, log):
    policy = entry.get("pip", "no-deps")
    if policy == "skip":
        return
    req = node_dir / "requirements.txt"
    if not req.exists():
        return
    cmd = [str(env_config.comfyui_python()), "-m", "pip", "install", "-r", str(req)]
    if policy == "no-deps":
        cmd.insert(4, "--no-deps")
    log(f"  pip install ({policy}) pour {entry['id']}...")
    _run(cmd, log=log)


def _ensure_git_node(entry, root, log):
    node_dir = root / "custom_nodes" / entry["id"]
    pinned = entry["commit"]
    current = _current_commit(node_dir)

    if current == pinned:
        return False  # deja a jour, rien a faire

    fresh_clone = not node_dir.exists()
    if fresh_clone:
        log(f"clonage {entry['id']}...")
        _git(["clone", entry["repo"], str(node_dir)], log=log)
    else:
        log(f"mise a jour {entry['id']} ({current or '?'} -> {pinned})...")
        _git(["fetch", "--all"], cwd=node_dir, log=log)

    _git(["checkout", pinned], cwd=node_dir, log=log)
    _apply_patches(entry, node_dir, log)
    _install_requirements(entry, node_dir, log)
    return True


def _ensure_registry_node(entry, root, log):
    node_dir = root / "custom_nodes" / entry["id"]
    version_marker = node_dir / ".sg_registry_version"
    pinned = entry["version"]

    if version_marker.exists() and version_marker.read_text(encoding="utf-8").strip() == pinned:
        return False  # deja a la version epinglee

    url = REGISTRY_API.format(id=entry["id"], version=pinned)
    log(f"resolution registre {entry['id']}@{pinned}...")
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            meta = json.loads(r.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise ProvisionError(f"registre ComfyUI injoignable pour {entry['id']}@{pinned} : {e}")
    download_url = meta.get("downloadUrl")
    if not download_url:
        raise ProvisionError(f"pas de downloadUrl dans la reponse registre pour {entry['id']}@{pinned}")

    log(f"telechargement {entry['id']}@{pinned}...")
    node_dir.mkdir(parents=True, exist_ok=True)
    zip_path = node_dir.parent / f".{entry['id']}.zip.part"
    try:
        with urllib.request.urlopen(download_url, timeout=120) as r, open(zip_path, "wb") as f:
            f.write(r.read())
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(node_dir)
    finally:
        zip_path.unlink(missing_ok=True)

    version_marker.write_text(pinned, encoding="utf-8")
    _install_requirements(entry, node_dir, log)
    return True


def ensure_custom_nodes(manifest, root, log=_say):
    changed = []
    for entry in manifest["custom_nodes"]:
        fn = _ensure_git_node if entry["source"] == "git" else _ensure_registry_node
        if fn(entry, root, log):
            changed.append(entry["id"])
    return changed


# ---------------------------------------------------------------------- modeles
def ensure_models(manifest, root, log=_say):
    downloaded, skipped_no_url = [], []
    for entry in manifest["models"]:
        filename, dest, url = entry["filename"], entry.get("dest"), entry.get("url")
        if not dest:
            continue  # emplacement pas encore connu (voir "note" dans le manifeste)
        target = root / "models" / dest / filename
        if target.exists():
            continue
        if not url:
            skipped_no_url.append(filename)
            continue
        log(f"telechargement modele {filename} -> models/{dest}/...")
        target.parent.mkdir(parents=True, exist_ok=True)
        _download(url, target)
        downloaded.append(filename)

    if skipped_no_url:
        log(f"{len(skipped_no_url)} modele(s) manquant(s) sans URL dans le manifeste "
            f"(a completer AUTOMATION/comfyui_manifest.json) : {', '.join(skipped_no_url)}")
    return downloaded


def _download(url, target):
    import os
    req = urllib.request.Request(url)
    token = os.environ.get("HF_TOKEN")
    if token and "huggingface.co" in url:
        req.add_header("Authorization", f"Bearer {token}")
    tmp = target.with_suffix(target.suffix + ".part")
    try:
        with urllib.request.urlopen(req, timeout=600) as r, open(tmp, "wb") as f:
            while chunk := r.read(1024 * 1024):
                f.write(chunk)
        tmp.rename(target)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


# --------------------------------------------------------------------- orchestre
def ensure_all(log=_say, root=None, manifest=None):
    """Point d'entree appele par comfy_server.ensure() avant de demarrer le
    process. Ne fait rien si tout est deja en place (verifications rapides,
    aucun appel reseau quand rien ne manque)."""
    manifest = manifest or load_manifest()
    root = root or env_config.comfyui_root()
    ensure_core(manifest, root, log)
    changed_nodes = ensure_custom_nodes(manifest, root, log)
    downloaded_models = ensure_models(manifest, root, log)
    if changed_nodes or downloaded_models:
        log(f"provisioning : {len(changed_nodes)} nœud(s) mis a jour, "
            f"{len(downloaded_models)} modele(s) telecharge(s).")
    return {"custom_nodes": changed_nodes, "models": downloaded_models}


def _main(argv):
    manifest = load_manifest()
    root = env_config.comfyui_root()
    if "--check" in argv:
        try:
            ensure_core(manifest, root)
        except ProvisionError as e:
            print(e)
            return 1
        missing_nodes = [e["id"] for e in manifest["custom_nodes"]
                          if not (root / "custom_nodes" / e["id"]).exists()]
        missing_models = [e["filename"] for e in manifest["models"]
                           if e.get("dest") and not (root / "models" / e["dest"] / e["filename"]).exists()]
        print(f"custom nodes manquants : {missing_nodes or 'aucun'}")
        print(f"modeles manquants      : {missing_models or 'aucun'}")
        return 0
    ensure_all()
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
