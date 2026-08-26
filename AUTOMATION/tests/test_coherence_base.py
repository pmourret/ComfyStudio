# -*- coding: utf-8 -*-
"""Coherence disque <-> PROD/lena.db. Le controle que la base est bien a jour.

POURQUOI CE TEST EXISTE. La base est la source de verite EN LECTURE (CLAUDE.md,
section AUTOMATION/base.py) : les ecrans, les stats par scene et le re-scorage de
l'historique la lisent, elle et pas les CSV. Une base en retard ne se voit donc
pas — elle donne des chiffres plus petits, et rien ne les contredit a l'ecran.

C'est exactement ce que la revue du 26/08/2026 a trouve :

  - 66 images en base pour 79 connues des journaux et du disque ;
  - 1 jugement humain en base pour 11 poses dans mesures.json.

Les deux ecarts venaient de la meme cause : `tests/migrer_base.py` n'avait pas
ete relance depuis que l'ecriture double etait en place. Rien ne le signalait.
Ce test est le signal.

Il ne verifie PAS que la base est jolie : il verifie qu'aucune information
presente ailleurs n'y manque. Les trois sources sont lues telles quelles, dans
l'etat reel du depot — ce n'est pas un test sur une arborescence jetable, c'est
un controle de l'installation courante.

En echec, la reponse est presque toujours la meme :

    python_embeded\\python.exe ComfyUI\\output\\OFM\\AUTOMATION\\tests\\migrer_base.py

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_coherence_base.py
"""
import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import base as db                # noqa: E402

JOURNAL = OFM / "PROD" / "journal_batch.csv"
JOURNAL_NSFW = OFM / "PROD" / "_NSFW" / "journal_nsfw.csv"
MESURES = OFM / "PROD" / "mesures.json"

# Genres de score que les fichiers portent. `identite_centroide` n'y est pas :
# il est calcule DEPUIS la base (base.rescorer) et n'existe nulle part ailleurs.
GENRES_FICHIER = ("identite", "identite_apres_expression", "nettete",
                  "texture_visage", "bruit_fond")
# le journal arrondit le score a 3 decimales, la base garde le flottant complet
TOLERANCE = 0.0006

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def detail(items, n=8):
    """Les premiers noms fautifs, pour que l'echec soit actionnable."""
    liste = sorted(items)
    bout = ", ".join(liste[:n])
    return bout + (f" … (+{len(liste) - n})" if len(liste) > n else "")


def lire_journal(path, espace):
    """{fichier: ligne} du journal. La derniere ligne gagne : un meme fichier
    peut y revenir (regeneration au meme nom), et c'est son dernier etat qui
    est cense etre en base."""
    out = {}
    if not path.exists():
        return out
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            if r.get("fichier"):
                out[r["fichier"]] = r
    return out


def sur_le_disque():
    """{fichier: (espace, bucket)} d'apres les dossiers de tri reels."""
    out = {}
    for espace, racine in (("lena", OFM / "PROD" / "LENA"),
                           ("nsfw", OFM / "PROD" / "_NSFW")):
        if not racine.exists():
            continue
        for d in racine.iterdir():
            if d.is_dir() and not d.name.startswith("_"):
                for f in d.glob("*.png"):
                    out[f.name] = (espace, d.name)
    return out


def main():
    if not db.FICHIER.exists():
        print(f"  ECHEC {db.FICHIER} n'existe pas — lancer tests/migrer_base.py")
        return 1

    disque = sur_le_disque()
    jsfw = lire_journal(JOURNAL, "lena")
    jnsfw = lire_journal(JOURNAL_NSFW, "nsfw")
    mesures = json.loads(MESURES.read_text(encoding="utf-8")) if MESURES.exists() else {}

    with db.ouvrir() as cx:
        images = {r["fichier"]: r for r in cx.execute(
            "SELECT fichier, espace, bucket, role FROM image")}
        scores = {}
        for r in cx.execute("SELECT i.fichier, s.genre, s.valeur FROM score s "
                            "JOIN image i ON i.id = s.image_id"):
            scores[(r["fichier"], r["genre"])] = r["valeur"]
        juges = {r["fichier"]: r["flag"] for r in cx.execute(
            "SELECT i.fichier, j.flag FROM jugement j JOIN image i ON i.id = j.image_id")}

    print(f"\n  disque {len(disque)} PNG · journaux {len(jsfw)}+{len(jnsfw)} lignes · "
          f"mesures {len(mesures)} entrees · base {len(images)} images, "
          f"{len(scores)} scores, {len(juges)} jugements")

    # ============================================================ [1] le disque
    print("\n[1] chaque image presente sur le disque a sa ligne en base")
    absentes = [n for n in disque if n not in images]
    verifie(not absentes,
            f"{len(disque) - len(absentes)}/{len(disque)} images du disque en base"
            + (f" — manquantes : {detail(absentes)}" if absentes else ""))

    # Le dossier de tri fait foi : c'est lui que l'humain a choisi. `act()`
    # reporte le deplacement dans la base ; si les deux divergent, ce sont les
    # stats par scene (qui comptent WHERE bucket = 'OK') qui mentent.
    derives = [f"{n} : disque {b} / base {images[n]['bucket']}"
               for n, (e, b) in disque.items()
               if n in images and images[n]["bucket"] != b]
    verifie(not derives, "le dossier de tri de la base suit celui du disque"
            + (f" — {detail(derives, 5)}" if derives else ""))

    espaces = [n for n, (e, b) in disque.items()
               if n in images and images[n]["espace"] != e]
    verifie(not espaces, "l'espace (lena / nsfw) de la base suit celui du disque"
            + (f" — {detail(espaces, 5)}" if espaces else ""))

    # =========================================================== [2] les journaux
    print("\n[2] chaque ligne de journal a sa ligne en base")
    for libelle, journal in (("SFW", jsfw), ("NSFW", jnsfw)):
        absentes = [n for n in journal if n not in images]
        verifie(not absentes,
                f"journal {libelle} : {len(journal) - len(absentes)}/{len(journal)} "
                f"lignes en base"
                + (f" — manquantes : {detail(absentes)}" if absentes else ""))

    # Le score d'identite a DEUX sources legitimes, et elles ne mesurent pas la
    # meme chose :
    #   - le journal porte le verdict du QC, pris a la generation sur le visage
    #     NEUTRE — c'est lui qui a decide du dossier de tri ;
    #   - mesures.json porte une re-mesure du fichier TEL QU'IL EST sur le
    #     disque (bouton « Mesurer »), donc apres expression et apres grain.
    # Les deux partagent le genre `identite` en base, ou la cle est
    # (image_id, genre) : le dernier ecrit gagne. On exige donc que la valeur de
    # la base vienne de l'une des deux, pas qu'elle vienne du journal.
    manquants, faux, remesures = [], [], []
    for journal in (jsfw, jnsfw):
        for nom, r in journal.items():
            brut = (r.get("score_identite") or "").strip()
            if not brut:
                continue                      # SANS_VISAGE / ERREUR : pas de score
            attendu = float(brut)
            obtenu = scores.get((nom, "identite"))
            autre = mesures.get(nom, {}).get("identite")
            if obtenu is None:
                manquants.append(nom)
            elif abs(obtenu - attendu) <= TOLERANCE:
                pass
            elif isinstance(autre, (int, float)) and abs(obtenu - autre) <= TOLERANCE:
                remesures.append(f"{nom} : QC {attendu} -> re-mesure {obtenu:.4f}")
            else:
                faux.append(f"{nom} : journal {attendu} / mesures {autre} / "
                            f"base {obtenu:.4f}")
    verifie(not manquants, f"chaque score d'identite du journal est en base"
            + (f" — {len(manquants)} manquant(s) : {detail(manquants)}"
               if manquants else ""))
    verifie(not faux, "chaque score de la base vient du journal ou de mesures.json"
            + (f" — {detail(faux, 5)}" if faux else ""))
    if remesures:
        print(f"  note  {len(remesures)} score(s) d'identite ecrase(s) par une "
              f"re-mesure posterieure : {detail(remesures, 3)}")

    # ========================================================= [3] mesures.json
    print("\n[3] chaque mesure et chaque jugement de mesures.json est en base")
    absentes = [n for n in mesures if n not in images]
    verifie(not absentes,
            f"{len(mesures) - len(absentes)}/{len(mesures)} entrees de mesures.json "
            f"en base" + (f" — manquantes : {detail(absentes)}" if absentes else ""))

    for genre in GENRES_FICHIER:
        attendus = {n: e[genre] for n, e in mesures.items()
                    if isinstance(e.get(genre), (int, float))}
        manquants = [n for n in attendus if (n, genre) not in scores]
        verifie(not manquants,
                f"{genre} : {len(attendus) - len(manquants)}/{len(attendus)} en base"
                + (f" — manquants : {detail(manquants)}" if manquants else ""))

    # Le jugement humain (convaincante / fait IA) n'existe QUE dans mesures.json
    # et dans la base : il arrive apres la generation, donc il ne peut pas vivre
    # dans le journal, qui est append-only. Personne d'autre ne le porte.
    flags = {n: e["flag"] for n, e in mesures.items() if e.get("flag")}
    manquants = [n for n in flags if n not in juges]
    verifie(not manquants,
            f"jugement humain : {len(flags) - len(manquants)}/{len(flags)} en base"
            + (f" — manquants : {detail(manquants)}" if manquants else ""))
    faux = [f"{n} : mesures {f} / base {juges[n]}"
            for n, f in flags.items() if n in juges and juges[n] != f]
    verifie(not faux, "les jugements de la base valent ceux de mesures.json"
            + (f" — {detail(faux, 5)}" if faux else ""))

    # ================================================== [4] lignes sans fichier
    # Une ligne sans fichier sur le disque n'est PAS une faute : une image
    # supprimee laisse sa trace (le journal est append-only, la suppression ne
    # le reecrit pas), et le corpus de realisme comme la base gelee vivent dans
    # INPUTS/, pas dans PROD/. Ce qui serait fautif, c'est une ligne qui ne
    # s'explique par aucune source — le signe d'une ecriture parasite.
    print("\n[4] les lignes de la base sans fichier sur le disque s'expliquent")
    connus = set(jsfw) | set(jnsfw) | set(mesures)
    orphelines = [n for n, r in images.items()
                  if n not in disque and not r["role"] and n not in connus]
    verifie(not orphelines, "aucune ligne orpheline"
            + (f" — {detail(orphelines)}" if orphelines else ""))

    sans_fichier = [n for n in images if n not in disque]
    hors_prod = [n for n in sans_fichier if images[n]["role"]]
    print(f"  note  {len(sans_fichier)} ligne(s) sans fichier dans PROD/ : "
          f"{len(hors_prod)} reference(s) qui vivent dans INPUTS/, "
          f"{len(sans_fichier) - len(hors_prod)} image(s) disparues du disque "
          f"mais gardees par l'historique")

    print("\n" + "=" * 70)
    if KO:
        print(f"{KO} ECHEC(S) — la base est en retard sur les fichiers.")
        print("Relancer :  python_embeded\\python.exe "
              "ComfyUI\\output\\OFM\\AUTOMATION\\tests\\migrer_base.py")
    else:
        print("tout est vert")
    return 1 if KO else 0


if __name__ == "__main__":
    sys.exit(main())
