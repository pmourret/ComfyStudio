# -*- coding: utf-8 -*-
"""`mesures.mesurer(..., character_id=...)` double l'ecriture en base (P2.1).

POURQUOI CE TEST EXISTE. `mesures.mesurer` (le bouton « Mesurer » de la revue,
`/api/mesurer`) n'ecrivait QUE dans `mesures.json` — jamais dans la base
SQLite, contrairement a la generation normale (`runner.sortie.ranger_mesures`,
qui double deja les deux). `test_coherence_base.py` l'a trouve le 05/09/2026 :
4 images NSFW re-mesurees depuis la revue avaient `nettete`/`texture_visage`/
`bruit_fond` dans `mesures.json` mais aucune trace en base — un ecart invisible
a l'ecran (CLAUDE.md : la base est la source de verite en LECTURE).

Ce test verrouille DEUX choses :
  - `character_id` fourni -> les trois genres de realisme ET l'identite
    atterrissent en base, sous LE BON personnage (jamais un melange, meme
    discipline que `test_cross_character.py`) ;
  - `character_id` omis (le corpus de reference, qui n'appartient a aucun
    personnage) -> AUCUNE ecriture en base, comportement inchange.

`qc_realisme` a besoin de cv2 (InsightFace/OpenCV, ADR-0008 : hors du venv de
dev par design). Ce test ne le charge jamais : il enregistre un faux module
dans sys.modules AVANT l'import differe de `mesures.mesurer`, pour exercer la
vraie branche d'ecriture en base sans dependre de cv2.

Lancer :  python AUTOMATION\\tests\\test_mesurer_double_ecriture.py
(ou python_embeded\\python.exe, cv2 reel ou non ne change rien ici)
"""
import shutil
import sys
import tempfile
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

# Faux qc_realisme : mesure() rend des valeurs fixes, jamais cv2.
FAUX_MESURE = {"nettete": 111.5, "texture_visage": 4.2, "bruit_fond": 1.3}
faux_qc_realisme = types.ModuleType("qc_realisme")
faux_qc_realisme.mesure = lambda path, bbox=None: dict(FAUX_MESURE)
sys.modules["qc_realisme"] = faux_qc_realisme

import base as db        # noqa: E402
import mesures as mes    # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


racine = Path(tempfile.mkdtemp(prefix="mesurer_"))
mes.FICHIER = racine / "PROD" / "mesures.json"
db.FICHIER = racine / "PROD" / "soulglade.db"

fichier = racine / "photo_probe.png"
fichier.write_bytes(b"\x89PNG\r\n\x1a\n")   # jamais ouvert : qc_realisme est faux

print("=" * 70)
print("mesures.mesurer(character_id=...) : double ecriture en base (P2.1)")
print("=" * 70)

try:
    print("\n[1] character_id fourni -> realisme ET identite en base")
    entree = mes.mesurer(fichier, checker=None, identite=0.812, character_id="lena")
    verifie(entree is not None and entree.get("nettete") == 111.5,
            "mesures.json recoit bien les valeurs (comportement inchange)")
    with db.ouvrir() as cx:
        r = cx.execute(
            "SELECT i.character_id, s.genre, s.valeur FROM score s "
            "JOIN image i ON i.id = s.image_id WHERE i.fichier = ?",
            (fichier.name,)).fetchall()
    genres = {row["genre"]: row["valeur"] for row in r}
    perso = {row["character_id"] for row in r}
    verifie(perso == {"lena"}, f"toutes les lignes portent character_id=lena ({perso})")
    verifie(genres.get("identite") == 0.812, f"identite en base ({genres.get('identite')})")
    for genre, attendu in FAUX_MESURE.items():
        verifie(genres.get(genre) == attendu,
                f"{genre} en base ({genres.get(genre)} == {attendu})")

    print("\n[2] deux personnages, meme nom de fichier -> jamais un melange")
    autre = racine / "photo_probe_aby.png"
    autre.write_bytes(b"\x89PNG\r\n\x1a\n")
    mes.mesurer(autre, checker=None, identite=0.5, character_id="abyssiaelle")
    with db.ouvrir() as cx:
        lena = cx.execute("SELECT character_id FROM image WHERE fichier = ?",
                          (fichier.name,)).fetchone()["character_id"]
        aby = cx.execute("SELECT character_id FROM image WHERE fichier = ?",
                         (autre.name,)).fetchone()["character_id"]
    verifie(lena == "lena" and aby == "abyssiaelle",
            f"chaque fichier reste sous son personnage (lena={lena}, aby={aby})")

    print("\n[3] character_id omis (corpus de reference) -> aucune ecriture en base")
    sans_perso = racine / "photo_reference.png"
    sans_perso.write_bytes(b"\x89PNG\r\n\x1a\n")
    entree2 = mes.mesurer(sans_perso, checker=None, identite=0.9)
    verifie(entree2 is not None and entree2.get("nettete") == 111.5,
            "mesures.json ecrit quand meme (comportement inchange)")
    with db.ouvrir() as cx:
        ligne = cx.execute("SELECT 1 FROM image WHERE fichier = ?",
                           (sans_perso.name,)).fetchone()
    verifie(ligne is None, "aucune ligne en base sans character_id")

finally:
    shutil.rmtree(racine, ignore_errors=True)

print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
sys.exit(1 if KO else 0)
