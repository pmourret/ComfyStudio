"""Configuration MACHINE : ou vit l'installation ComfyUI sur ce poste.

A ne pas confondre avec `config.json` (reglages mesures d'un PERSONNAGE —
seuils, preset, chemins internes au repo). Ici c'est l'inverse : le repo est
fixe, c'est l'installation ComfyUI autour de lui qui varie d'une machine a
l'autre. Voir DOCS/adr/0008-chemin-comfyui-configuration-explicite.md.

Avant J1, ce repo vivait DANS l'installation ComfyUI (`ComfyUI/output/OFM`) et
plusieurs modules en deduisaient le chemin par position relative sur le
disque (`Path(__file__).parents[N]`). Le fork a casse cette hypothese. Le
chemin est maintenant lu depuis `.env` (racine du repo, jamais commite — voir
`.env.example`) : c'est une configuration explicite de machine, pas un calcul
qui recasserait au prochain deplacement du repo ou chez un autre contributeur.

Priorite de lecture : variable d'environnement du processus, puis `.env`. Ca
permet un override ponctuel (CI, test) sans toucher au fichier.
"""
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = _REPO_ROOT / ".env"


class MissingConfigError(RuntimeError):
    """Une variable de configuration machine attendue n'est pas definie."""


def _load_dotenv(path):
    values = {}
    if not path.exists():
        return values
    for ligne in path.read_text(encoding="utf-8").splitlines():
        ligne = ligne.strip()
        if not ligne or ligne.startswith("#") or "=" not in ligne:
            continue
        cle, _, valeur = ligne.partition("=")
        cle = cle.strip()
        valeur = valeur.strip().strip('"').strip("'")
        if cle:
            values[cle] = valeur
    return values


_DOTENV = _load_dotenv(_ENV_FILE)


def _get(nom, requis=True):
    import os
    valeur = os.environ.get(nom) or _DOTENV.get(nom)
    if requis and not valeur:
        raise MissingConfigError(
            f"{nom} n'est pas defini. Copier .env.example vers .env a la "
            f"racine du repo ({_REPO_ROOT}) et renseigner cette variable.")
    return valeur


def comfyui_root():
    """Racine de l'installation ComfyUI (contient models/, input/, output/)."""
    return Path(_get("COMFYUI_ROOT")).expanduser()


def comfyui_python():
    """Interpreteur Python a utiliser pour tout ce qui touche ComfyUI (seul a
    voir torch, insightface, aiohttp...).

    Par defaut, `python_embeded` a cote de COMFYUI_ROOT — c'est la mise en
    page de la distribution portable Windows, celle de ce poste. Une autre
    mise en page (venv, install source, autre OS) passe par COMFYUI_PYTHON
    plutot que de forcer cette hypothese.
    """
    override = _get("COMFYUI_PYTHON", requis=False)
    if override:
        return Path(override).expanduser()
    return comfyui_root().parent / "python_embeded" / "python.exe"


def comfyui_input():
    return comfyui_root() / "input"


def comfyui_output():
    return comfyui_root() / "output"


def insightface_root():
    return comfyui_root() / "models" / "insightface"


def _diagnostic():
    """Resout et affiche la config machine, sans rien supposer de plus."""
    print("=" * 72)
    print("env_config - diagnostic")
    print("=" * 72)
    echecs = 0
    try:
        root = comfyui_root()
        print(f"COMFYUI_ROOT     : {root}")
        for nom in ("models", "input", "output"):
            d = root / nom
            ok = d.is_dir()
            echecs += not ok
            print(f"  {'ok  ' if ok else 'ECHEC'} {nom}/ {'trouve' if ok else 'INTROUVABLE'}")
    except MissingConfigError as e:
        echecs += 1
        print(f"ECHEC COMFYUI_ROOT : {e}")

    try:
        py = comfyui_python()
        ok = py.is_file()
        echecs += not ok
        print(f"COMFYUI_PYTHON   : {py} {'(ok)' if ok else '(INTROUVABLE)'}")
    except MissingConfigError as e:
        echecs += 1
        print(f"ECHEC COMFYUI_PYTHON : {e}")

    print()
    if echecs:
        print(f"{echecs} probleme(s).")
        return 1
    print("configuration machine valide.")
    return 0


def _main(argv):
    # Sorties une-valeur, pensees pour $(...) dans un script shell : lire .env
    # ne demande pas l'interpreteur ComfyUI (torch/insightface), n'importe
    # quel Python systeme suffit pour ce seul appel.
    if "--print-root" in argv:
        print(comfyui_root())
        return 0
    if "--print-python" in argv:
        print(comfyui_python())
        return 0
    return _diagnostic()


if __name__ == "__main__":
    import sys
    sys.exit(_main(sys.argv[1:]))
