# -*- coding: utf-8 -*-
"""Tri et export : /api/action et /api/undo, sur une arborescence jetable.

POURQUOI CE TEST EXISTE. Ces deux handlers deplacent des fichiers et en
suppriment : ce sont les seuls endroits de l'application ou une erreur coute une
image. La revue du 25/08/2026 y a trouve trois defauts :

  - l'annulation appelait `shutil.move` SANS le garde `nom_libre` que l'aller
    prend soin d'avoir. Un homonyme dans le dossier d'origine etait ecrase sans
    un mot — et un homonyme, ici, est une image differente ;
  - annuler un rejet remettait l'image dans OK mais laissait son JPEG supprime :
    elle revenait « validee » et absente de la publication, sans rien pour le
    dire ;
  - apres un renommage de collision, l'export relisait le journal avec le
    NOUVEAU nom, absent du journal : la ligne revenait vide, donc
    `categorie = divers` et `format = 4:5`. L'export partait dans le mauvais
    dossier et une image 9:16 etait redimensionnee en 1080x1350.

Rien n'est simule : ce sont les vraies fonctions, sur un faux PROD/.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_tri_export.py
"""
import csv
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parents[1]
sys.path.insert(0, str(OFM / "AUTOMATION" / "web"))
sys.path.insert(0, str(OFM / "AUTOMATION"))

import shared_state as ss      # noqa: E402
import runner as lb            # noqa: E402
import base as db             # noqa: E402
import mesures as mes         # noqa: E402
from api.exceptions import BadRequest  # noqa: E402
from api.main import app       # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image         # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


# On passe par la VRAIE pile HTTP depuis la migration FastAPI : les handlers
# ne prennent plus une requete mais des parametres types, et la fausse requete
# n'aurait plus rien a imiter. Le TestClient traverse en prime le garde
# d'origine et les gestionnaires d'erreur — ce que ce test ne voyait pas avant.
# `base_url` en 127.0.0.1 : sans lui le client envoie `Host: testserver`, que le
# garde refuse en 403, a juste titre.
CLIENT = TestClient(app, base_url="http://127.0.0.1")


def appeler(route, corps=None):
    """POST sur une route de tri. Rend le corps JSON, comme avant."""
    return CLIENT.post(route, json=corps or {}).json()


def image(chemin, taille=(896, 1120)):
    chemin.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", taille, (90, 70, 60)).save(chemin)


# ------------------------------------------------------- arborescence jetable
racine = Path(tempfile.mkdtemp(prefix="tri_"))
ss.OFM = racine
ss.THUMBS = racine / "PROD" / ".thumbs"
mes.FICHIER = racine / "PROD" / "mesures.json"
db.FICHIER = racine / "PROD" / "soulglade.db"
ss.UNDO.clear()

for b in ("OK", "A_REVOIR", "REJET", "ARCHIVE"):
    (racine / "PROD" / "LENA" / b).mkdir(parents=True, exist_ok=True)

# journal : la scene est en 9:16 et de categorie « voyage ». C'est ce que
# l'export doit retrouver — et ce qu'il perdait apres un renommage.
journal = racine / "PROD" / "journal_batch.csv"
with open(journal, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(lb.JOURNAL_COLS)
    w.writerow(["2026-08-25T10:00:00", "b1", "lena", "rando_montagne", "voyage",
                "1", "doux",
                "", "9:16", "42", "0.760", "A_REVOIR", "voyage_rando_01.png", "",
                "60", "un prompt"])

image(racine / "PROD" / "LENA" / "A_REVOIR" / "voyage_rando_01.png")

print("=" * 70)
print("tri et export - tests")
print("=" * 70)

print("\n[1] valider : l'export prend la categorie et le format du journal")
r = appeler("/api/action", {"name": "voyage_rando_01.png", "bucket": "A_REVOIR",
                             "action": "valider", "space": "sfw"})
verifie(r["ok"] and r["bucket"] == "OK", "l'image passe en OK")
exp = racine / "PROD" / "EXPORT" / "lena" / "voyage" / "voyage_rando_01.jpg"
verifie(exp.exists(), "l'export est dans EXPORT/lena/voyage (pas dans « divers »)")
if exp.exists():
    attendu = tuple(ss.cfg()["export_sizes"]["9:16"])
    with Image.open(exp) as im:
        verifie(im.size == attendu, f"export a la taille du 9:16 {im.size} == {attendu}")

print("\n[2] rejeter : l'image sort aussi de la publication")
r = appeler("/api/action", {"name": "voyage_rando_01.png", "bucket": "OK",
                             "action": "rejeter", "space": "sfw"})
verifie(r["ok"] and r["bucket"] == "REJET", "l'image passe en REJET")
verifie(not exp.exists(), "le JPEG est retire de l'export")

print("\n[3] annuler un rejet : l'image ET son export reviennent")
r = appeler("/api/undo", {})
verifie(r["ok"] and r["bucket"] == "OK", "l'image revient dans OK")
verifie((racine / "PROD" / "LENA" / "OK" / "voyage_rando_01.png").exists(),
        "le fichier est bien dans OK")
verifie(exp.exists(), "l'export est REFAIT (il restait supprime avant le correctif)")

print("\n[4] annuler ne doit jamais ecraser un homonyme")
# on refait le chemin : rejet, puis on place une AUTRE image du meme nom dans OK
appeler("/api/action", {"name": "voyage_rando_01.png", "bucket": "OK",
                         "action": "rejeter", "space": "sfw"})
intruse = racine / "PROD" / "LENA" / "OK" / "voyage_rando_01.png"
image(intruse, taille=(64, 64))          # image DIFFERENTE, meme nom
avant = intruse.stat().st_size
r = appeler("/api/undo", {})
verifie(intruse.exists() and intruse.stat().st_size == avant,
        "l'image deja presente dans OK n'a pas ete ecrasee")
verifie(r["name"] != "voyage_rando_01.png",
        f"l'image annulee a ete renommee ({r['name']})")
verifie((racine / "PROD" / "LENA" / "OK" / r["name"]).exists(),
        "les deux images coexistent dans OK")

print("\n[5] apres renommage, l'export garde la bonne categorie")
# l'image renommee n'est PAS dans le journal sous son nouveau nom : c'est le
# piege. L'export doit malgre tout retrouver « voyage » et le 9:16.
renomme = r["name"]
exp2 = racine / "PROD" / "EXPORT" / "lena" / "voyage" / (Path(renomme).stem + ".jpg")
verifie(exp2.exists(),
        f"l'export du fichier renomme est dans EXPORT/lena/voyage ({exp2.name})")
verifie(not (racine / "PROD" / "EXPORT" / "lena" / "divers").exists(),
        "aucun export n'a atterri dans « divers »")

print("\n[6] une action inconnue est refusee proprement")
r6 = CLIENT.post("/api/action", json={"name": "voyage_rando_01.png",
                                      "bucket": "OK", "action": "supprimer_tout",
                                      "space": "sfw"})
verifie(r6.status_code == 400 and r6.json().get("ok") is False,
        f"action inconnue : 400 propre, en JSON ({r6.status_code})")

print("\n[7] les vignettes ne survivent pas au deplacement")
# une vignette est rangee par espace/bucket : l'image qui change de dossier
# laissait la sienne derriere elle (96 fichiers pour 46 PNG le 25/08/2026)
tdir = ss.THUMBS / "lena" / "sfw" / "OK"
tdir.mkdir(parents=True, exist_ok=True)
vignette = tdir / (Path(renomme).stem + ".jpg")
image(vignette, taille=(64, 64))
appeler("/api/action", {"name": renomme, "bucket": "OK",
                         "action": "archiver", "space": "sfw"})
verifie(not vignette.exists(), "la vignette du dossier quitte est retiree")

orpheline = tdir / "image_disparue.jpg"
image(orpheline, taille=(64, 64))
# vignettes de dispositions PRECEDENTES, qu'un balayage a la profondeur du jour
# ne voit meme pas : .thumbs/<bucket>/ (avant l'axe SFW/NSFW) et
# .thumbs/<space>/<bucket>/ (avant l'isolation par personnage). C'est ce qui
# dispense la bascule par personnage de migrer ce cache.
ancienne = ss.THUMBS / "OK" / "format_d_avant.jpg"
image(ancienne, taille=(64, 64))
avant_perso = ss.THUMBS / "lena" / "OK" / "format_sans_personnage.jpg"
image(avant_perso, taille=(64, 64))
retirees = ss.purger_vignettes()
verifie(not orpheline.exists(), "le balayage retire les vignettes sans image")
verifie(not ancienne.exists(),
        "le balayage retire aussi celles d'une disposition perimee")
verifie(not avant_perso.exists(),
        "et celles d'avant l'isolation par personnage (.thumbs/<space>/<bucket>/)")
verifie(retirees >= 3, f"les trois sont comptees ({retirees})")

print()
print("[8] l'axe SFW garde son ancien nom en alias")
# `space=lena` a longtemps designe le SFW — un nom de personnage pour un axe
# qui n'en est pas un. Il reste accepte en entree (marque-page, client pas
# encore a jour) et doit designer exactement le meme dossier que `sfw`.
verifie(ss.bucket_dir("OK", "lena", "lena") == ss.bucket_dir("OK", "sfw", "lena"),
        "space=lena et space=sfw designent le meme dossier")
verifie(ss.bucket_dir("OK", "sfw", "lena") == racine / "PROD" / "LENA" / "OK",
        "et c'est le dossier SFW historique de Lena, inchange")
verifie(ss.bucket_dir("OK", "nsfw", "lena")
        == racine / "PROD" / "LENA" / "_NSFW" / "OK",
        "le NSFW vit sous l'arbre du personnage")
try:
    ss.bucket_dir("OK", "sfw", None)
    verifie(False, "bucket_dir sans personnage doit etre refuse")
except BadRequest as e:
    verifie(e.status_code == 400 and e.detail.get("ok") is False,
            f"bucket_dir sans personnage : refus propre ({e.detail})")

shutil.rmtree(racine, ignore_errors=True)
print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
sys.exit(1 if KO else 0)
