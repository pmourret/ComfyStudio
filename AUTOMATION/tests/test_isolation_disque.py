# -*- coding: utf-8 -*-
"""Isolation DISQUE entre personnages : /api/gallery, /img, /api/action, undo.

POURQUOI CE TEST EXISTE. `test_character_param.py` prouve l'isolation des
FICHIERS DE CONFIGURATION (CHARACTERS/<id>/). Il ne disait rien des IMAGES, et
c'est precisement la que ca fuyait : jusqu'au 29/08/2026, `bucket_dir()`
rendait PROD/LENA/ quel que soit le personnage demande, et /img n'avait meme
pas de parametre `character`. Resultat constate : la Revue d'Abyssiaelle
affichait la galerie de Lena, alors que ses images etaient bien rangees dans
PROD/ABYSSIAELLE/ par le runner.

Ce qui se teste ici et nulle part ailleurs :

  - un personnage ne LISTE que son arbre (/api/gallery, /api/state) ;
  - un personnage ne SERT que ses octets (/img), et un nom qui appartient a un
    autre sort en 404 — jamais par une retombee sur un autre arbre ;
  - /img SANS `character=` est refuse (400), au lieu de rendre Lena par defaut ;
  - un personnage ne MUTE que son arbre (/api/action) et n'annule que ses
    propres actions (/api/undo) ;
  - Lena n'a pas bouge : memes chemins SFW qu'avant la bascule.

Cree un CHARACTERS/probe/ et un PROD/PROBE/ jetables, les supprime a la fin
(y compris les lignes 'probe' de la base et son cache de vignettes).

Lancer :  python.exe AUTOMATION\\tests\\test_isolation_disque.py
"""
import base64
import json
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parents[1]
PY = Path(sys.executable)
PORT = 8208
BASE = f"http://127.0.0.1:{PORT}"
LENA = OFM / "CHARACTERS" / "lena"
PROBE = OFM / "CHARACTERS" / "probe"
PROD_PROBE = OFM / "PROD" / "PROBE"
PROD_LENA = OFM / "PROD" / "LENA"
THUMBS_PROBE = OFM / "PROD" / ".thumbs" / "probe"
IMAGE_PROBE = "probe_isolation_00.png"

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def appel(chemin, corps=None):
    donnees = json.dumps(corps).encode() if corps is not None else None
    tetes = {"Content-Type": "application/json"} if donnees is not None else {}
    req = urllib.request.Request(BASE + chemin, data=donnees,
                                 method="POST" if donnees is not None else "GET",
                                 headers=tetes)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def jget(corps):
    try:
        return json.loads(corps)
    except Exception:
        return None


def img(**params):
    """Code HTTP de /img avec ces parametres (aucun n'est ajoute d'office)."""
    code, _ = appel("/img?" + urllib.parse.urlencode(params))
    return code


def noms(corps):
    return {i.get("name") for i in (jget(corps) or {}).get("items", [])}


# ------------------------------------------------------------------ fixtures
def poser_fixture():
    """Un personnage jetable, avec SON arbre PROD/ et une image bien a lui."""
    from PIL import Image
    if PROBE.exists():
        shutil.rmtree(PROBE)
    PROBE.mkdir(parents=True)
    (PROBE / "character.json").write_text(json.dumps(
        {"id": "probe", "name": "Probe", "universe": "instagram-influenceur",
         "content_types": {"image": True}, "nsfw": False},
        ensure_ascii=False, indent=2), encoding="utf-8")
    for fichier in ("config.json", "creative.json", "scenes.json"):
        shutil.copy(LENA / fichier, PROBE / fichier)

    for bucket in ("OK", "A_REVOIR"):
        (PROD_PROBE / bucket).mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (256, 320), (30, 60, 90)).save(PROD_PROBE / "OK" / IMAGE_PROBE)


def retirer_fixture():
    shutil.rmtree(PROBE, ignore_errors=True)
    shutil.rmtree(PROD_PROBE, ignore_errors=True)
    shutil.rmtree(THUMBS_PROBE, ignore_errors=True)
    # le tri ecrit en base : on ne laisse pas de ligne 'probe' dans l'historique
    db = OFM / "PROD" / "soulglade.db"
    if db.exists():
        cx = sqlite3.connect(db)
        try:
            cx.execute("DELETE FROM image WHERE character_id = 'probe'")
            cx.commit()
        except sqlite3.Error:
            pass
        finally:
            cx.close()


poser_fixture()
# une image REELLE de Lena, pour verifier qu'elle ne fuit pas chez probe
lena_ok = sorted((PROD_LENA / "OK").glob("*.png"))
image_lena = lena_ok[0].name if lena_ok else None

proc = subprocess.Popen(
    [str(PY), str(OFM / "AUTOMATION" / "web" / "app.py"),
     "--port", str(PORT), "--no-comfy", "--no-browser"],
    cwd=str(OFM), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

try:
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + "/api/state?character=lena", timeout=2).close()
            break
        except Exception:
            if proc.poll() is not None:
                print("  le serveur s'est arrete au demarrage :")
                print(proc.stdout.read().decode("utf-8", "replace")[:2000])
                sys.exit(1)
            time.sleep(0.5)
    else:
        print("  le serveur n'a pas repondu")
        sys.exit(1)

    print("=" * 70)
    print(f"isolation disque — serveur de test sur {BASE}")
    print("=" * 70)

    # ============================================================== [1]
    print("\n[1] /api/gallery ne liste que l'arbre du personnage")
    code, corps = appel("/api/gallery?character=probe&bucket=OK&space=sfw")
    vus = noms(corps)
    verifie(code == 200 and vus == {IMAGE_PROBE},
            f"probe voit SA seule image ({sorted(vus)})")
    code, corps = appel("/api/gallery?character=lena&bucket=OK&space=sfw")
    vus_lena = noms(corps)
    verifie(code == 200 and IMAGE_PROBE not in vus_lena,
            "l'image de probe ne fuit pas dans la galerie de lena")
    verifie(bool(vus_lena) == bool(lena_ok),
            f"lena voit toujours son dossier OK ({len(vus_lena)} image(s))")
    verifie(not (vus & vus_lena), "les deux galeries n'ont aucun nom en commun")

    # l'ancien nom de l'axe SFW reste accepte : marque-pages et clients pas
    # encore a jour envoient encore `space=lena`
    code, corps = appel("/api/gallery?character=probe&bucket=OK&space=lena")
    verifie(code == 200 and noms(corps) == {IMAGE_PROBE},
            "space=lena (alias SFW) designe le meme dossier que space=sfw")

    # ============================================================== [2]
    print("\n[2] /img exige le personnage et ne sort jamais de son arbre")
    verifie(img(bucket="OK", space="sfw", name=IMAGE_PROBE) == 400,
            "sans ?character= : 400 (et surtout pas l'image de lena par defaut)")
    verifie(img(character="probe", bucket="OK", space="sfw",
                name=IMAGE_PROBE) == 200,
            "probe obtient SON image")
    if image_lena:
        verifie(img(character="probe", bucket="OK", space="sfw",
                    name=image_lena) == 404,
                "un nom de lena demande par probe : 404, pas de retombee")
        verifie(img(character="lena", bucket="OK", space="sfw",
                    name=image_lena) == 200,
                "lena obtient toujours ses images (non-regression)")
    verifie(img(character="lena", bucket="OK", space="sfw",
                name=IMAGE_PROBE) == 404,
            "et l'image de probe reste invisible a lena")
    verifie(img(character="does-not-exist", bucket="OK", space="sfw",
                name=IMAGE_PROBE) == 400,
            "un personnage inconnu : 400, jamais un acces disque")

    # ============================================================== [3]
    print("\n[3] les vignettes sont rangees par personnage")
    verifie(img(character="probe", bucket="OK", space="sfw", name=IMAGE_PROBE,
                thumb=1) == 200, "la vignette de probe se genere")
    attendue = THUMBS_PROBE / "sfw" / "OK" / (Path(IMAGE_PROBE).stem + ".jpg")
    verifie(attendue.exists(),
            f"elle vit sous .thumbs/probe/sfw/OK/ ({attendue.name})")

    # ============================================================== [4]
    print("\n[4] /api/state compte l'arbre du personnage demande")
    code, corps = appel("/api/state?character=probe")
    d = jget(corps) or {}
    verifie(code == 200 and (d.get("counts") or {}).get("OK") == 1,
            f"probe : 1 image dans OK ({(d.get('counts') or {}).get('OK')})")
    code, corps = appel("/api/state?character=lena")
    dl = jget(corps) or {}
    verifie((dl.get("counts") or {}).get("OK") == len(lena_ok),
            f"lena : {(dl.get('counts') or {}).get('OK')} images dans OK "
            f"(attendu {len(lena_ok)})")

    # ============================================================== [5]
    print("\n[5] /api/action ne mute que l'arbre du personnage")
    if image_lena:
        avant = (PROD_LENA / "OK" / image_lena).exists()
        code, corps = appel("/api/action?character=probe",
                            {"name": image_lena, "bucket": "OK",
                             "action": "rejeter", "space": "sfw"})
        verifie(code == 404, f"trier une image de lena depuis probe : 404 ({code})")
        verifie(avant and (PROD_LENA / "OK" / image_lena).exists(),
                "le fichier de lena n'a pas bouge d'un octet")

    code, corps = appel("/api/action?character=probe",
                        {"name": IMAGE_PROBE, "bucket": "OK",
                         "action": "revoir", "space": "sfw"})
    verifie(code == 200 and (jget(corps) or {}).get("bucket") == "A_REVOIR",
            "probe trie SA propre image")
    verifie((PROD_PROBE / "A_REVOIR" / IMAGE_PROBE).exists(),
            "elle a bouge dans PROD/PROBE/, pas ailleurs")
    verifie(not (PROD_LENA / "A_REVOIR" / IMAGE_PROBE).exists(),
            "et rien n'a ete ecrit dans l'arbre de lena")

    # ============================================================== [5b]
    # /api/edit/save ECRIT des octets — en copie, et depuis le 30/08/2026 (F3.3)
    # par-dessus la source. Deux occasions d'ecrire dans le mauvais arbre : la
    # destination vient de `bucket_dir(..., cid)`, jamais du nom recu.
    print("\n[5b] /api/edit/save ecrit dans l'arbre du personnage, jamais ailleurs")
    # 1x1 PNG opaque, le plus petit corps valide que la route accepte
    pixel = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
             "z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    if image_lena:
        avant = (PROD_LENA / "OK" / image_lena).read_bytes()
        code, corps = appel("/api/edit/save?character=probe",
                            {"name": image_lena, "bucket": "OK", "space": "sfw",
                             "data_base64": pixel})
        verifie(code == 404,
                f"editer une image de lena depuis probe : 404 ({code})")
        verifie((PROD_LENA / "OK" / image_lena).read_bytes() == avant,
                "le fichier de lena n'a pas ete reecrit")
        code, corps = appel("/api/edit/save?character=probe",
                            {"name": image_lena, "bucket": "OK", "space": "sfw",
                             "remplacer": True, "data_base64": pixel})
        verifie(code == 404,
                f"l'ecrasement non plus ne traverse pas les arbres ({code})")
        verifie((PROD_LENA / "OK" / image_lena).read_bytes() == avant,
                "et son image est toujours intacte, a l'octet pres")
    # A_REVOIR : c'est la que [5] vient de ranger l'image de probe — l'editer
    # depuis son dossier COURANT, pas depuis celui qu'on croit
    code, corps = appel("/api/edit/save?character=probe",
                        {"name": IMAGE_PROBE, "bucket": "A_REVOIR", "space": "sfw",
                         "data_base64": pixel})
    copie = (jget(corps) or {}).get("name", "")
    verifie(code == 200 and copie.endswith("_edit.png"),
            f"probe edite SA propre image : {copie or corps}")
    verifie((PROD_PROBE / "A_REVOIR" / copie).exists() if copie else False,
            "la copie est ecrite dans PROD/PROBE/A_REVOIR/")
    verifie(not (PROD_LENA / "A_REVOIR" / copie).exists() if copie else False,
            "rien n'a ete depose dans l'arbre de lena")
    # l'ecrasement garde le nom et remplace les octets — c'est tout le contrat
    code, corps = appel("/api/edit/save?character=probe",
                        {"name": copie, "bucket": "A_REVOIR", "space": "sfw",
                         "remplacer": True, "data_base64": pixel})
    d = jget(corps) or {}
    verifie(code == 200 and d.get("name") == copie and d.get("remplace") is True,
            f"probe ecrase SA copie, sous le meme nom ({d.get('name')})")
    verifie((PROD_PROBE / "A_REVOIR" / copie).read_bytes() == base64.b64decode(pixel)
            if copie else False,
            "les octets sur le disque sont bien les nouveaux")
    if copie:
        (PROD_PROBE / "A_REVOIR" / copie).unlink(missing_ok=True)

    # ============================================================== [6]
    print("\n[6] /api/undo n'annule que les actions du personnage courant")
    code, corps = appel("/api/undo?character=lena", {})
    verifie(code == 400,
            f"lena n'a rien a annuler : c'est probe qui a trie ({code})")
    verifie((PROD_PROBE / "A_REVOIR" / IMAGE_PROBE).exists(),
            "l'image de probe n'a pas ete ramenee par l'annulation de lena")
    code, corps = appel("/api/undo?character=probe", {})
    verifie(code == 200 and (jget(corps) or {}).get("bucket") == "OK",
            f"probe annule SON tri ({code})")
    verifie((PROD_PROBE / "OK" / IMAGE_PROBE).exists(),
            "l'image est revenue dans PROD/PROBE/OK/")

    # ============================================================== [7]
    print("\n[7] le journal est filtre par personnage")
    for cid in ("lena", "abyssiaelle", "probe"):
        if not (OFM / "CHARACTERS" / cid).is_dir():
            continue
        code, corps = appel(f"/api/journal?character={cid}")
        rows = (jget(corps) or {}).get("rows", [])
        etrangeres = {r.get("character") for r in rows} - {cid}
        verifie(code == 200 and not etrangeres,
                f"{cid} : {len(rows)} ligne(s), aucune d'un autre personnage "
                f"({sorted(etrangeres) or '—'})")

    # ============================================================== [8]
    # L'outil d'edition (NSFW) est le chemin qui touche le plus de dossiers a la
    # fois : il LIT l'arbre SFW d'un personnage et ECRIT dans son arbre _NSFW.
    # Deux occasions de se tromper d'arbre, et aucune route ne les couvrait.
    # Ici, par les ROUTES et sans GPU : armement, sources proposees, palier emis,
    # et le refus d'editer une image qui appartient a quelqu'un d'autre.
    print("\n[8] l'outil d'edition ne lit ni n'ecrit chez un autre personnage")

    def arbre(racine):
        return {p.relative_to(racine) for p in racine.rglob("*.png")} if racine.exists() else set()

    avant_lena, avant_probe = arbre(PROD_LENA), arbre(PROD_PROBE)

    def paliers(cid):
        code, corps = appel(f"/api/creative?character={cid}")
        return code, (jget(corps) or {}).get("intensity", [])

    # -- desarme : le palier d'edition n'est PAS emis (le cran est absent)
    code, ps = paliers("probe")
    verifie(code == 200 and not [p for p in ps if p.get("requires") == "armed"],
            f"probe desarme : aucun palier d'edition emis ({len(ps)} palier(s))")
    code, corps = appel("/api/nsfw/state?character=probe")
    etat = jget(corps) or {}
    verifie(etat.get("outil", {}).get("available") is False,
            "probe desarme : l'outil est annonce indisponible")

    # -- on arme probe, et LUI SEUL
    code, corps = appel("/api/nsfw/arm?character=probe", {"arm": True, "confirm": "ARMER"})
    verifie(code == 200, f"probe s'arme par sa propre route ({code})")
    verifie(json.loads((LENA / "character.json").read_text(encoding="utf-8")).get("nsfw")
            is True, "lena n'a pas ete desarmee au passage")

    code, ps = paliers("probe")
    edit = next((p for p in ps if p.get("requires") == "armed"), None)
    verifie(edit is not None, "probe arme : le palier d'edition apparait")
    verifie(str(edit.get("destination", "")).upper().startswith("PROD/PROBE"),
            f"et sa destination est SON arbre : {edit.get('destination')}")

    # -- les sources proposees sont les siennes, jamais celles de lena
    code, corps = appel("/api/nsfw/state?character=probe")
    etat = jget(corps) or {}
    srcs = {s.get("name") for s in etat.get("sources", [])}
    verifie(etat.get("outil", {}).get("available") is True, "l'outil devient disponible")
    verifie(srcs == {IMAGE_PROBE}, f"probe ne voit que son image : {sorted(srcs)}")
    if image_lena:
        verifie(image_lena not in srcs,
                f"aucune image de lena dans ses sources ({image_lena})")
    verifie(str(etat.get("sortie", "")).upper().startswith("PROD/PROBE"),
            f"sa sortie annoncee est la sienne : {etat.get('sortie')}")

    # -- editer une image qui appartient a LENA : refuse, et rien d'ecrit
    if image_lena:
        code, corps = appel("/api/run?character=probe", {
            "intensity": edit["level"], "sources": [image_lena],
            "edit_instruction": "unbuttoned linen shirt", "confirm_intensity": True})
        verifie(code == 400,
                f"probe ne peut pas editer une image de lena ({code}) — "
                f"{(jget(corps) or {}).get('erreur')}")

    # -- et lancer sans rien cocher reste refuse : la selection est manuelle
    code, corps = appel("/api/run?character=probe", {
        "intensity": edit["level"], "sources": [],
        "edit_instruction": "unbuttoned linen shirt", "confirm_intensity": True})
    verifie(code == 400, f"aucune source cochee : refuse ({code})")

    verifie(arbre(PROD_LENA) == avant_lena,
            "l'arbre de lena n'a pas bouge d'un fichier")
    verifie(arbre(PROD_PROBE) == avant_probe,
            "celui de probe non plus (rien n'a ete produit)")
    verifie(not (PROD_LENA / "_NSFW" / "journal_nsfw.csv").exists()
            or "probe" not in (PROD_LENA / "_NSFW" / "journal_nsfw.csv")
            .read_text(encoding="utf-8", errors="ignore"),
            "aucune ligne de probe dans le journal NSFW de lena")

    # -- desarme : on ne laisse pas une sonde armee derriere soi
    code, _ = appel("/api/nsfw/arm?character=probe", {"arm": False})
    verifie(code == 200, "la sonde est desarmee en sortant")

    print("\n" + "=" * 70)
    print("tout est vert" if not KO else f"{KO} ECHEC(S)")
    print("=" * 70)

finally:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except Exception:
        proc.kill()
    retirer_fixture()

sys.exit(1 if KO else 0)
