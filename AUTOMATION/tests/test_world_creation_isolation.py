# -*- coding: utf-8 -*-
"""Isolation de la creation d'un monde (ADR-0016).

POURQUOI CE TEST EXISTE. `POST /api/worlds` ecrit un fichier neuf dans un
registre versionne (WORLDS/) depuis une requete HTTP — la premiere route de
ce studio a le faire. Le risque exact que `.claude/rules/backend.md` demande
de verrouiller pour toute route generalisee : qu'elle deborde sur autre
chose que le fichier qu'elle dit ecrire, en particulier CHARACTERS/ (le
monde ne doit etre assigne a AUCUN personnage) ou un AUTRE fichier
WORLDS/*.json (un pack curate ne doit jamais rouvrir universe.resolve()).

Ce que ce test verrouille :
  1. `POST /api/worlds` ecrit UN SEUL fichier neuf, `WORLDS/<id>.json` —
     rien d'autre n'apparait sous WORLDS/.
  2. `CHARACTERS/` est OCTET POUR OCTET intact : aucun dossier cree, aucun
     fichier existant touche.
  3. Les DEUX mondes reels (slow-life.json, terres-sauvages.json) restent
     octet pour octet intacts.
  4. Le pack choisi est une PROPOSITION, pas un aiguillage : `universe.
     resolve()` rend exactement la meme chose avant/apres pour tous les
     couples (type, style) reels — creer un monde ne change aucune
     resolution.

Monde jetable (git-ignore : rien ne fuit dans l'historique), nettoye a la
fin.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_world_creation_isolation.py
(ou le venv de dev : fastapi suffit)
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION / "web"))
sys.path.insert(0, str(AUTOMATION))

import universe                                # noqa: E402
import worlds                                  # noqa: E402
from api.main import app                       # noqa: E402
from fastapi.testclient import TestClient       # noqa: E402

WID = "probe-created-world"
KO = 0

CLIENT = TestClient(app, base_url="http://127.0.0.1")


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def snapshot_dir(root):
    """{chemin relatif -> octets} de chaque fichier sous `root`, ou {} si absent."""
    if not root.is_dir():
        return {}
    return {str(p.relative_to(root)): p.read_bytes()
            for p in root.rglob("*") if p.is_file()}


try:
    print("=" * 70)
    print("isolation de la creation d'un monde (ADR-0016)")
    print("=" * 70)

    worlds_dir = worlds.WORLDS_DIR
    characters_dir = OFM / "CHARACTERS"
    avant_worlds = snapshot_dir(worlds_dir)
    avant_characters = snapshot_dir(characters_dir)
    avant_resolutions = [universe.resolve(t, s)
                         for u in universe.list_universes()
                         for t in universe.types(u)
                         for s in universe.style_names(u)]

    assert not worlds.exists(WID), f"{WID} deja present avant le test — nettoyer d'abord"

    # ============================================ [1] la creation reussit
    print("\n[1] POST /api/worlds cree le monde")
    r = CLIENT.post("/api/worlds", json={
        "id": WID, "label": "Monde jetable", "pack": "instagram-influenceur",
        "tone": "isolation test",
    })
    verifie(r.status_code == 200, f"creation acceptee ({r.status_code} — {r.text[:200]})")
    verifie(worlds.exists(WID), "WORLDS/<id>.json existe apres la creation")

    # ============================================ [2] rien d'autre sous WORLDS/
    print("\n[2] aucun AUTRE fichier WORLDS/*.json n'a bouge")
    apres_worlds = snapshot_dir(worlds_dir)
    nouveaux = set(apres_worlds) - set(avant_worlds)
    verifie(nouveaux == {f"{WID}.json"},
            f"UN SEUL fichier neuf, le bon ({nouveaux})")
    for nom, octets in avant_worlds.items():
        verifie(apres_worlds.get(nom) == octets,
                f"WORLDS/{nom} octet pour octet identique")

    # ============================================ [3] CHARACTERS/ intact
    print("\n[3] CHARACTERS/ n'a pas bouge d'un octet")
    apres_characters = snapshot_dir(characters_dir)
    verifie(apres_characters == avant_characters,
            "aucun dossier cree, aucun fichier existant touche sous CHARACTERS/")

    # ============================================ [4] universe.resolve() inchange
    print("\n[4] le pack choisi est une proposition : resolve() ne bouge pas")
    apres_resolutions = [universe.resolve(t, s)
                         for u in universe.list_universes()
                         for t in universe.types(u)
                         for s in universe.style_names(u)]
    verifie(avant_resolutions == apres_resolutions,
            "toutes les resolutions (type, style) -> pack sont identiques avant/apres")

    # ============================================ [5] le monde nait proposable, pas assigne
    print("\n[5] le monde nait dans le registre — visible, assigne a AUCUN personnage")
    r = CLIENT.get("/api/worlds")
    ids = [w["id"] for w in r.json()["worlds"]]
    verifie(WID in ids, "le monde jetable apparait dans GET /api/worlds")
    # « assigne a aucun personnage » est ce que [3] prouve deja (CHARACTERS/
    # intact) : aucune fiche ne porte ce monde puisqu'aucune fiche n'a bouge.

finally:
    p = worlds.world_path(WID)
    p.unlink(missing_ok=True)

print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
print("=" * 70)
sys.exit(1 if KO else 0)
