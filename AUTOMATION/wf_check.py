"""Boucle de validation d'un workflow : editer -> convertir -> valider -> essayer.

    python_embeded\\python.exe AUTOMATION\\wf_check.py WORKFLOWS/content/lena_master_prod_ui.json
    ... --groupes "FACEDETAILER,GRAIN + EXPORT"    force des groupes en actif
    ... --essai                                    met vraiment en file (1 image)

Le manque, quand on met un graphe au point, n'est pas l'acces a ComfyUI — on l'a
deja. C'est de savoir VITE pourquoi il refuse. Sans ca il faut lancer un batch et
lire un log.

Ce que ce script verifie, du moins cher au plus cher :

  1. le JSON s'ouvre et a la forme attendue (UI : nodes + links) ;
  2. chaque `type` de noeud existe dans le ComfyUI qui tourne — c'est la premiere
     cause d'echec apres l'installation ou la mise a jour d'un custom node ;
  3. la conversion UI -> API passe, et les roles attendus par le runner sont la ;
  4. aucun input lie ne pointe vers un noeud absent du graphe converti (un lien
     orphelin fait planter a l'execution sans message clair — regle 5 de CLAUDE.md) ;
  5. avec --essai, ComfyUI valide le graphe pour de vrai et rend SON message.

Il ne modifie jamais le fichier du workflow.
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parent
sys.path.insert(0, str(HERE))

import ui_to_api  # noqa: E402

# Roles que `runner.WorkflowRunner` cherche dans le graphe de production.
# Les lister ici evite de decouvrir a l'execution qu'un titre a ete renomme.
ROLES_PROD = [
    ("CLIPTextEncode", "POSITIF - scene"),
    ("FluxGuidance", None),
    ("EmptySD3LatentImage", "Format -"),
    ("KSampler", "passe 1"),
    ("SaveImage", "SORTIE production"),
]
ROLES_OPTIONNELS = [
    ("Switch any [Crystools]", None),
    ("KSampler", "img2img denoise"),
    ("ImageScale", "Taille de publication"),
    ("ImageAddNoise", None),
    # groupe 13 - POSE CONTROLNET (26/08/2026) : DOCS/lena-pose-controlnet.md
    ("LoadImage", "SQUELETTE DE POSE"),
    ("ControlNetLoader", None),
    ("ControlNetApplyAdvanced", None),
]


def dire(ok, message, detail=""):
    print(f"  {'ok  ' if ok else 'ECHEC'} {message}" + (f"\n         {detail}" if detail else ""))
    return ok


def main():
    ap = argparse.ArgumentParser(description="Validation d'un workflow ComfyUI")
    ap.add_argument("workflow", help="chemin, relatif a la racine OFM ou absolu")
    ap.add_argument("--url", default=None, help="ComfyUI (defaut : config.json)")
    ap.add_argument("--groupes", default="", help="titres de groupes a forcer actifs")
    ap.add_argument("--essai", action="store_true",
                    help="met le graphe en file pour de vrai (produit une image)")
    ap.add_argument("--roles", action="store_true",
                    help="verifie les roles attendus par le runner de production")
    args = ap.parse_args()

    chemin = Path(args.workflow)
    if not chemin.is_absolute():
        chemin = OFM / args.workflow
    url = args.url
    if not url:
        try:
            chemin_config = OFM / "CHARACTERS" / "lena" / "config.json"
            url = json.loads(chemin_config.read_text(encoding="utf-8"))["comfy_url"]
        except Exception:
            url = "http://127.0.0.1:8188"

    echecs = 0

    # 1 -------------------------------------------------------------- le JSON
    try:
        ui = json.loads(chemin.read_text(encoding="utf-8"))
    except Exception as e:
        dire(False, f"lecture de {chemin.name}", f"{type(e).__name__} : {e}")
        return 1
    forme = isinstance(ui.get("nodes"), list) and isinstance(ui.get("links"), list)
    echecs += not dire(forme, f"{chemin.name} : format UI ({len(ui.get('nodes', []))} noeuds)",
                       "" if forme else "ce fichier n'est pas au format UI (pas de nodes/links)")
    if not forme:
        return 1

    # 2 --------------------------------------------- les types existent-ils ?
    try:
        obj = ui_to_api.fetch_object_info(url)
    except Exception as e:
        dire(False, f"ComfyUI injoignable sur {url}", f"{type(e).__name__} : {e}")
        return 1
    inconnus = sorted({n["type"] for n in ui["nodes"]
                       if n.get("type") not in obj and n.get("type") != "Note"})
    echecs += not dire(not inconnus, f"types de noeuds connus de ComfyUI",
                       "absents : " + ", ".join(inconnus) if inconnus else "")

    # 3 ------------------------------------------------------- la conversion
    groupes = [g.strip() for g in args.groupes.split(",") if g.strip()]
    try:
        api = ui_to_api.convert(ui, obj, active_groups=groupes)
    except Exception as e:
        dire(False, "conversion UI -> API", f"{type(e).__name__} : {e}")
        return 1
    dire(True, f"conversion UI -> API ({len(api)} noeuds actifs"
               + (f", groupes forces : {', '.join(groupes)}" if groupes else "") + ")")

    # Un graphe converti sans noeud de sortie ne produira rien. C'est le cas
    # normal d'un workflow dont tous les groupes sont en bypass dans le fichier :
    # il faut nommer ses groupes avec --groupes. Le signaler evite de croire a
    # tort qu'il est bon.
    sorties = [n for n in api.values()
               if n["class_type"] in ("SaveImage", "PreviewImage", "SaveAnimatedWEBP")]
    echecs += not dire(bool(sorties), "au moins un noeud de sortie actif",
                       "" if sorties else
                       "aucun SaveImage actif : ce graphe ne produirait rien. "
                       "Ses groupes sont sans doute en bypass — les nommer "
                       "avec --groupes.")

    # 4 ------------------------------------------------- liens orphelins
    orphelins = []
    for nid, n in api.items():
        for cle, v in n.get("inputs", {}).items():
            if isinstance(v, list) and len(v) == 2 and str(v[0]) not in api:
                orphelins.append(f"n{nid} ({n['class_type']}).{cle} -> n{v[0]} absent")
    echecs += not dire(not orphelins, "aucun lien orphelin",
                       "\n         ".join(orphelins))

    # 5 ----------------------------------------------- roles du runner
    if args.roles:
        manquants = []
        for typ, titre in ROLES_PROD:
            try:
                ui_to_api.find_node(ui, typ, titre)
            except LookupError:
                manquants.append(f"{typ}" + (f" / « {titre} »" if titre else ""))
        echecs += not dire(not manquants, "roles obligatoires du runner presents",
                           "introuvables : " + " | ".join(manquants) if manquants else "")
        absents = []
        for typ, titre in ROLES_OPTIONNELS:
            try:
                ui_to_api.find_node(ui, typ, titre)
            except LookupError:
                absents.append(f"{typ}" + (f" / « {titre} »" if titre else ""))
        if absents:
            print(f"  note  roles optionnels absents (le runner s'adapte) : "
                  f"{' | '.join(absents)}")

    # 6 --------------------------------------------- validation par ComfyUI
    if args.essai:
        import runner as lb
        pid, err = lb.queue_prompt(url, api, client_id="wf_check")
        if err:
            try:
                detail = json.loads(err)
                msg = detail.get("error", {}).get("message", "")
                noeuds = detail.get("node_errors", {})
                detail = msg + "".join(
                    f"\n         n{k} : {v.get('errors',[{}])[0].get('message','')}"
                    for k, v in noeuds.items())
            except Exception:
                detail = err[:300]
            echecs += not dire(False, "ComfyUI accepte le graphe", detail)
        else:
            dire(True, f"ComfyUI accepte le graphe (prompt {pid[:8]}…)")
            print("         l'image se genere ; ce script ne l'attend pas.")

    print()
    if echecs:
        print(f"  {echecs} probleme(s). Le graphe ne tournera pas en l'etat.")
        return 1
    print("  graphe valide." + ("" if args.essai else
          " Ajouter --essai pour que ComfyUI le valide vraiment."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
