# -*- coding: utf-8 -*-
"""Outil d'edition (NSFW) : isolation croisee entre personnages, sans GPU (J7).

POURQUOI CE TEST EXISTE. `test_isolation_disque.py` prouve l'isolation des
routes de galerie et de tri. Il ne dit rien de l'outil d'EDITION, dont chaque
chemin est un endroit ou deux personnages pouvaient se melanger :

  - les SOURCES proposees (`sources_disponibles`) — l'arbre SFW du personnage,
    et lui seul ;
  - la RESOLUTION d'une source par son nom (`resoudre_source`) — un nom porte
    par deux personnages ne doit jamais rendre le fichier de l'autre ;
  - la SORTIE (`out_root`, `bucket_dir`), le JOURNAL (`journal_path`), la copie
    temporaire dans ComfyUI/input (`src_prefix`) et le dossier de transit
    ComfyUI (`transit_prefix`) — tous namespaces par cid.

Et la regle qui rend tout le reste vrai : PLUS AUCUN DEFAUT `character_id`
(J7). Jusqu'ici `is_armed()`, `editer()`, `run()` retombaient sur 'lena' quand
l'appelant oubliait le personnage — c'est exactement la forme du bug
d'isolation du 29/08. Un appel sans personnage doit lever, pas deviner.

Enfin : le graphe d'edition appartient au PACK (`universe.json`/`edit_workflow`),
jamais au personnage (CLAUDE.md §8.11). Un pack qui n'en declare aucun leve
EditToolUnavailableError au lieu d'emprunter celui d'une autre famille.

Aucun appel a ComfyUI : ce test ne verifie que des chemins et des gardes.
Cree deux personnages jetables (`probe`, `probe2`) et leurs arbres PROD, les
supprime a la fin. Git-ignore : rien ne fuit dans l'historique (ADR-0005).

Lancer :  python.exe AUTOMATION\\tests\\test_nsfw_isolation.py
"""
import inspect
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import nsfw_batch            # noqa: E402
import universe              # noqa: E402

A, B = "probe", "probe2"
DIRS = [OFM / "CHARACTERS" / A, OFM / "CHARACTERS" / B,
        OFM / "PROD" / A.upper(), OFM / "PROD" / B.upper()]
PARTAGE = "meme_nom_00.png"          # le meme nom de fichier chez les deux
KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def semer(cid, univers, arme, images):
    """Un personnage jetable : registre + arbre PROD avec des images bidons."""
    d = OFM / "CHARACTERS" / cid
    d.mkdir(parents=True, exist_ok=True)
    (d / "character.json").write_text(json.dumps(
        {"id": cid, "name": cid, "universe": univers, "type": univers,
         "output_style": "realiste", "nsfw": arme,
         "content_types": {"image": True}}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    for bucket, noms in images.items():
        b = OFM / "PROD" / cid.upper() / bucket
        b.mkdir(parents=True, exist_ok=True)
        for n in noms:
            (b / n).write_bytes(b"\x89PNG\r\n\x1a\n" + cid.encode())


CFG = {"nsfw": {"chainer_si": ["OK", "A_REVOIR"]}}

try:
    print("=" * 70)
    print("outil d'edition - isolation croisee entre personnages (J7)")
    print("=" * 70)

    # probe : pack flux (a un graphe d'edition), arme. probe2 : pack sdxl, desarme.
    semer(A, "instagram-influenceur", True,
          {"OK": [PARTAGE, "a_ok_01.png"], "A_REVOIR": ["a_rev_01.png"],
           "REJET": ["a_rejet_01.png"]})
    semer(B, "rpg-personnage", False,
          {"OK": [PARTAGE, "b_ok_01.png"]})

    # ------------------------------------------------------- [1] les sources
    print("\n[1] sources proposees : l'arbre SFW du personnage, et lui seul")
    src_a = {f.name for f, _ in nsfw_batch.sources_disponibles(CFG, A)}
    src_b = {f.name for f, _ in nsfw_batch.sources_disponibles(CFG, B)}
    verifie(src_a == {PARTAGE, "a_ok_01.png", "a_rev_01.png"},
            f"{A} voit ses 3 images editables : {sorted(src_a)}")
    verifie("a_rejet_01.png" not in src_a,
            "REJET n'est pas editable (chainer_si)")
    verifie(src_b == {PARTAGE, "b_ok_01.png"},
            f"{B} voit les siennes : {sorted(src_b)}")
    verifie(not (src_a - {PARTAGE}) & (src_b - {PARTAGE}),
            "aucune image de l'un ne fuit dans la liste de l'autre")

    # ---------------------------------------------- [2] resolution par le nom
    print("\n[2] un nom porte par les deux resout dans le BON arbre")
    pa = nsfw_batch.resoudre_source(PARTAGE, CFG, A)
    pb = nsfw_batch.resoudre_source(PARTAGE, CFG, B)
    verifie(pa is not None and pb is not None, f"{PARTAGE} resolu des deux cotes")
    verifie(pa != pb, "deux chemins distincts pour le meme nom")
    verifie(pa.read_bytes().endswith(A.encode()), f"celui de {A} contient ses octets")
    verifie(pb.read_bytes().endswith(B.encode()), f"celui de {B} contient les siens")
    verifie(nsfw_batch.resoudre_source("a_ok_01.png", CFG, B) is None,
            f"une image de {A} demandee au nom de {B} -> None, pas de retombee")
    verifie(nsfw_batch.resoudre_source("a_rejet_01.png", CFG, A) is None,
            "une image en REJET n'est pas resolue comme source")

    # ------------------------------------------------ [3] sortie et journal
    print("\n[3] sortie, journal, transit : tous namespaces par cid")
    ra, rb = nsfw_batch.out_root(A), nsfw_batch.out_root(B)
    verifie(ra == OFM / "PROD" / A.upper() / "_NSFW",
            f"racine {A} : {ra.name} sous {A.upper()}")
    verifie(ra != rb and not str(rb).startswith(str(ra)),
            "les deux racines NSFW sont disjointes")
    verifie(nsfw_batch.journal_path(A).parent == ra,
            "le journal vit sous la racine NSFW du personnage")
    verifie(nsfw_batch.journal_path(A) != nsfw_batch.journal_path(B),
            "un journal par personnage")
    verifie(nsfw_batch.bucket_dir("OK", A).parent == ra,
            "bucket_dir range sous la racine du personnage")
    verifie(nsfw_batch.src_prefix(A) != nsfw_batch.src_prefix(B),
            f"copie ComfyUI/input namespacee : {nsfw_batch.src_prefix(A)!r} "
            f"vs {nsfw_batch.src_prefix(B)!r}")
    ta = nsfw_batch.transit_prefix(A, "20260829_120000")
    tb = nsfw_batch.transit_prefix(B, "20260829_120000")
    verifie(ta != tb, "transit ComfyUI namespace par cid (plus de PROD/_NSFW global)")
    verifie(A.upper() in ta and "/_NSFW/" in ta, f"transit {A} : {ta}")
    # le menage doit viser le dossier REELLEMENT ecrit, pas un fantome
    verifie(nsfw_batch.transit_dir(A, "X") ==
            nsfw_batch.COMFY_OUTPUT / nsfw_batch.transit_prefix(A, "X"),
            "le menage vise le dossier de transit reel (cote ComfyUI)")

    # ------------------------------------- [4] plus aucun defaut 'lena' (J7)
    print("\n[4] character_id obligatoire - aucune retombee silencieuse")
    for nom in ("is_armed", "check_armed", "sources_disponibles", "resoudre_source",
                "out_root", "bucket_dir", "journal_path", "editer", "run"):
        sig = inspect.signature(getattr(nsfw_batch, nom))
        params = [p for p in sig.parameters.values()
                  if p.name in ("character_id", "cid", "character")]
        sans_defaut = params and all(p.default is inspect.Parameter.empty
                                     for p in params)
        verifie(bool(sans_defaut), f"{nom}{sig} : personnage obligatoire")
    for nom in ("editer", "run"):
        p = inspect.signature(getattr(nsfw_batch, nom)).parameters["character_id"]
        verifie(p.kind is inspect.Parameter.KEYWORD_ONLY,
                f"{nom} : character_id en mot-cle, jamais pris pour un autre argument")

    # --------------------------------------- [5] le graphe appartient au pack
    print("\n[5] le graphe d'edition appartient au pack, pas au personnage")
    wf = nsfw_batch.edit_workflow_path(A)
    verifie(wf == OFM / universe.edit_workflow("instagram-influenceur"),
            f"{A} (pack flux) resout le graphe de SON pack : {wf.name}")
    verifie(wf.is_file(), "le graphe declare par le pack existe sur le disque")
    try:
        nsfw_batch.edit_workflow_path(B)
        verifie(False, f"{B} (pack sans graphe) aurait du lever")
    except universe.EditToolUnavailableError as e:
        verifie("rpg-personnage" in str(e),
                "pack sans graphe -> EditToolUnavailableError explicite, "
                "jamais le graphe d'une autre famille")

    # ------------------------------- [6] l'armement ne traverse pas les cids
    print("\n[6] armement : un interrupteur par personnage")
    verifie(nsfw_batch.is_armed(A) is True, f"{A} arme (son propre registre)")
    verifie(nsfw_batch.is_armed(B) is False, f"{B} desarme")
    try:
        nsfw_batch.check_armed(B)
        verifie(False, "check_armed sur un desarme aurait du lever")
    except nsfw_batch.Disarmed:
        verifie(True, "check_armed leve Disarmed sur un personnage desarme")
    # et le vrai registre n'a pas bouge : Lena reste armee, Abyssiaelle non
    verifie(nsfw_batch.is_armed("lena") is True, "lena toujours armee (non touchee)")
    verifie(nsfw_batch.is_armed("abyssiaelle") is False, "abyssiaelle toujours desarmee")

    print("\n" + "=" * 70)
    print("tout est vert" if not KO else f"{KO} ECHEC(S)")
    print("=" * 70)
finally:
    for d in DIRS:
        shutil.rmtree(d, ignore_errors=True)

sys.exit(1 if KO else 0)
