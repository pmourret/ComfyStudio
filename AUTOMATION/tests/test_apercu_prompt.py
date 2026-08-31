# -*- coding: utf-8 -*-
"""Apercu de prompt et echos entre fragments (api.services.preview).

POURQUOI CE TEST EXISTE. Ces deux fonctions ont vecu 900 lignes plus bas dans
`routers/production.py`, sans test : on ne pouvait les atteindre qu'en montant
FastAPI. Le decoupage en services les rend adressables, ce test les verrouille.

Ce qu'elles servent, et qui n'etait visible nulle part avant :
  - 69 % du prompt final est assemble hors de vue de qui ecrit la scene
    (mesure du 26/08/2026 : 179 caracteres ecrits sur 578). `part` est ce
    pourcentage, c'est lui qui rend un resultat rate diagnosticable ;
  - deux fragments qui parlent du meme sujet se combattent. Le cas mesure est
    l'intention `boudoir` : le ton disait « close intimate framing » et
    l'intention « full figure in frame ». C'est le RAPPROCHEMENT framing/frame
    qui compte — sans la racine commune les deux mots passent pour etrangers
    et la contradiction reste invisible.

Lancer :  python_embeded\python.exe AUTOMATION\tests\test_apercu_prompt.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parents[1]
sys.path.insert(0, str(OFM / "AUTOMATION" / "web"))
sys.path.insert(0, str(OFM / "AUTOMATION"))

from api.services import preview  # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok  ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def job(*fragments, scene="portrait_etude"):
    """Un job comme `build_jobs` le rend : prompt = somme des fragments."""
    frags = [{"source": s, "texte": t} for s, t in fragments]
    return {"scene": scene, "prompt": ", ".join(f["texte"] for f in frags),
            "fragments": frags}


print("[1] la part de chaque fragment")
j = job(("ancre", "a" * 75), ("scene", "b" * 25))
apercu = preview.prompt_preview([j])
verifie(apercu["total_car"] == 102, "total_car mesure le prompt final, pas la scene")
verifie([f["part"] for f in apercu["fragments"]] == [74, 25],
        "chaque fragment porte son pourcentage")
verifie(apercu["scene"] == "portrait_etude" and apercu["n_jobs"] == 1,
        "la scene et le nombre de jobs remontent")

print("\n[2] un lot ne montre que son premier job")
apercu = preview.prompt_preview([job(("scene", "premier")), job(("scene", "second"))])
verifie(apercu["n_jobs"] == 2 and "premier" in [f["texte"] for f in apercu["fragments"]],
        "n_jobs compte tout le lot, l'apercu detaille le premier")

print("\n[3] pas de job, pas d'apercu")
verifie(preview.prompt_preview([]) is None, "un plan vide ne rend pas d'apercu")

print("\n[4] l'echo mesure du 26/08/2026 : framing contre frame")
echos = preview.echoes_between_fragments(
    job(("ton", "close intimate framing"), ("intention", "full figure in frame"))["fragments"])
verifie(len(echos) == 1, "un seul echo trouve")
verifie(echos and echos[0]["mot"] == "frame / framing",
        "framing et frame sont rapproches, et les deux formes s'affichent")
verifie(echos and echos[0]["sources"] == ["ton", "intention"],
        "l'echo nomme les fragments qui se repondent")

print("\n[5] ce qui ne doit PAS faire echo")
verifie(not preview.echoes_between_fragments(
    job(("ton", "a photo with the woman"), ("scene", "a photo with the woman"))["fragments"]),
    "des mots trop communs (photo, woman, with, the) ne disent rien")
verifie(not preview.echoes_between_fragments(
    job(("ton", "soft morning light"))["fragments"]),
    "un mot repete DANS un seul fragment n'est pas un echo")

print("\n[6] les plus partages d'abord")
echos = preview.echoes_between_fragments(
    job(("a", "velvet curtain"), ("b", "velvet chair"), ("c", "velvet rug, curtain"))["fragments"])
verifie([e["mot"] for e in echos] == ["velvet", "curtain"],
        "velvet (3 sources) passe devant curtain (2)")
verifie(len(preview.echoes_between_fragments(
    [{"source": str(i), "texte": f"mot{i} commun"} for i in range(12)])) <= 8,
    "au plus huit echos remontent")

print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
sys.exit(1 if KO else 0)
