"""Serveur MCP de la plateforme ComfyStudio — sans aucune dependance.

    python_embeded\\python.exe AUTOMATION\\mcp_server.py

MCP est du JSON-RPC 2.0 sur stdin/stdout. Le SDK officiel n'est installe ni dans
le Python systeme ni dans le Python embarque, et l'installer dans celui de ComfyUI
est exactement le genre de geste que CLAUDE.md interdit (cf. mediapipe qui casse
InsightFace). Le protocole tient en 150 lignes : on l'ecrit.

CE QUE CE SERVEUR EXPOSE, ET CE QU'IL N'EXPOSE PAS

Le besoin est d'outiller la MISE AU POINT des workflows, pas de generer a la
volee. Les outils sont donc :

  wf_lister / wf_valider   la boucle courte de mise au point d'un graphe
  wf_noeuds                introspection des noeuds installes (types, entrees)
  etat / scenes            ce que le tableau de bord sait
  plan                     ce qu'un batch produirait — SANS le lancer
  mesures                  bandes de realisme et statistiques par scene

Ce qu'il n'expose PAS, volontairement :

  - **aucun lancement de generation.** Un agent ne doit pas consommer le GPU ni
    ecrire dans PROD sur sa propre initiative. `plan` montre, il ne fait pas.
  - **rien de la branche NSFW.** L'armement est une decision humaine prise dans
    l'interface, pas un appel d'outil (DOCS 8.1).
  - **aucune ecriture** : ni scenes.json, ni config.json, ni tri d'image.

Un serveur MCP branche directement sur ComfyUI court-circuiterait le QC, le tri,
le journal et les garde-fous. Celui-ci lit le meme etat que le tableau de bord.

Tourne toujours sur le personnage "lena" (seul personnage existant, J2) — pas
encore de parametre de selection, voir le registre personnage prevu en J4.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parent
sys.path.insert(0, str(HERE))

PROTOCOLE = "2024-11-05"
SERVEUR = {"name": "comfystudio", "version": "1.0.0"}


# --------------------------------------------------------------------- outils
def _cfg():
    import runner as lb
    return lb.load_config("lena")


def wf_lister(_):
    """Liste les workflows du depot avec leur format et leurs groupes."""
    out = []
    for f in sorted((OFM / "WORKFLOWS").rglob("*.json")):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            out.append({"fichier": str(f.relative_to(OFM)), "erreur": str(e)})
            continue
        ui = isinstance(d.get("nodes"), list)
        out.append({"fichier": str(f.relative_to(OFM)).replace("\\", "/"),
                    "format": "UI" if ui else "API",
                    "noeuds": len(d.get("nodes", d)),
                    "groupes": [g.get("title") for g in d.get("groups", [])]})
    return out


def wf_valider(a):
    """Valide un workflow : types connus, conversion, liens orphelins, sorties."""
    import subprocess
    cmd = [sys.executable, str(HERE / "wf_check.py"), a["fichier"]]
    if a.get("groupes"):
        cmd += ["--groupes", a["groupes"]]
    if a.get("roles"):
        cmd += ["--roles"]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=120)
    return {"ok": r.returncode == 0, "rapport": r.stdout.strip()}


def wf_noeuds(a):
    """Schema d'un type de noeud installe : entrees requises et optionnelles."""
    import ui_to_api
    obj = ui_to_api.fetch_object_info(_cfg()["comfy_url"])
    motif = (a.get("motif") or "").lower()
    if not motif:
        return {"total": len(obj), "note": "donner un motif pour filtrer"}
    trouves = [k for k in obj if motif in k.lower()]
    if a.get("detail") and len(trouves) == 1:
        d = obj[trouves[0]]["input"]
        return {"type": trouves[0],
                "requis": list(d.get("required", {})),
                "optionnels": list(d.get("optional", {}))}
    return {"types": sorted(trouves)[:60], "n": len(trouves)}


def etat(_):
    """Etat courant : ComfyUI, comptes par dossier de tri, seuils."""
    import urllib.request
    cfg = _cfg()
    try:
        urllib.request.urlopen(cfg["comfy_url"] + "/system_stats", timeout=2).close()
        comfy = True
    except Exception:
        comfy = False
    comptes = {}
    for espace, racine in (("lena", OFM / "PROD" / "LENA"),
                           ("nsfw", OFM / "PROD" / "_NSFW")):
        if racine.exists():
            comptes[espace] = {d.name: len(list(d.glob("*.png")))
                               for d in racine.iterdir()
                               if d.is_dir() and not d.name.startswith("_")}
    return {"comfyui": comfy, "url": cfg["comfy_url"], "qc": cfg["qc"],
            "preset": cfg["preset"], "dossiers": comptes}


def scenes(_):
    """Banque de scenes : id, intention, bande d'intensite, tags, statistiques."""
    import runner as lb
    data = lb.load_scenes("lena")
    try:
        import base
        with base.ouvrir() as cx:
            stats = base.stats_par_scene(cx, "lena")
    except Exception:
        stats = {}
    return [{"id": s["id"], "intention": lb.scene_intention(s),
             "intensite": list(lb.scene_band(s)), "format": s.get("format"),
             "tags": s.get("tags", []), "tones": s.get("tones", []),
             "tenues": sorted((s.get("wardrobe") or {}).keys()),
             "stats": stats.get(s["id"])}
            for s in data["scenes"]]


def plan(a):
    """Ce qu'un batch produirait. NE LANCE RIEN : ni GPU, ni ecriture."""
    from types import SimpleNamespace
    import runner as lb
    args = SimpleNamespace(
        scene=a.get("scenes") or None, category=None, format=a.get("format"),
        count=a.get("count"), limit=a.get("limit"), seed=a.get("seed"),
        no_variants=bool(a.get("no_variants")), intensity=a.get("intensity"),
        tone=a.get("tone"), intention=a.get("intention"))
    jobs = lb.build_jobs(lb.scenes_path("lena"), args)
    return {"total": len(jobs), "note": "aucune generation lancee",
            "jobs": [{"scene": j["scene"], "format": j["format"],
                      "intensite": j["intensity"], "tenue": j["outfit"],
                      "seed": j["seed"], "prompt": j["prompt"]} for j in jobs[:12]]}


def mesures(_):
    """Bandes de realisme et sante du jeu de reference d'identite."""
    import mesures as mes
    e = list(mes.charger().values())
    out = {"bandes": {c: mes.bande(e, c)
                      for c in ("nettete", "texture_visage", "bruit_fond")},
           "references": len(mes.fichiers_reference())}
    try:
        import base
        with base.ouvrir() as cx:
            out["jeu_identite"] = base.jeu_actif(cx, "lena")
            out["base"] = base.resume(cx)
    except Exception:
        pass
    return out


OUTILS = [
    (wf_lister, "wf_lister", "Liste les workflows du depot : format, noeuds, groupes.",
     {}),
    (wf_valider, "wf_valider",
     "Valide un workflow (types connus, conversion API, liens orphelins, sorties). "
     "Ne modifie jamais le fichier.",
     {"fichier": {"type": "string", "description": "chemin relatif a la racine OFM"},
      "groupes": {"type": "string", "description": "titres de groupes a forcer actifs, separes par des virgules"},
      "roles": {"type": "boolean", "description": "verifier les roles attendus par le runner"}}),
    (wf_noeuds, "wf_noeuds",
     "Cherche un type de noeud installe et rend ses entrees.",
     {"motif": {"type": "string", "description": "fragment du nom du type"},
      "detail": {"type": "boolean", "description": "rendre les entrees si un seul resultat"}}),
    (etat, "etat", "Etat : ComfyUI, dossiers de tri, seuils, prereglage.", {}),
    (scenes, "scenes", "Banque de scenes avec intentions, bandes et statistiques.", {}),
    (plan, "plan",
     "Ce qu'un batch produirait, prompts compris. NE LANCE AUCUNE generation.",
     {"scenes": {"type": "array", "items": {"type": "string"}},
      "intensity": {"type": "integer", "description": "0 SFW, 1 Soft, 2 Suggestif"},
      "tone": {"type": "string"}, "intention": {"type": "string"},
      "count": {"type": "integer"}, "limit": {"type": "integer"},
      "no_variants": {"type": "boolean"}}),
    (mesures, "mesures",
     "Bandes de realisme, corpus de reference, sante du jeu d'identite.", {}),
]
PAR_NOM = {nom: fn for fn, nom, _, _ in OUTILS}


# ------------------------------------------------------------------ protocole
def repondre(id_, resultat=None, erreur=None):
    msg = {"jsonrpc": "2.0", "id": id_}
    if erreur is not None:
        msg["error"] = erreur
    else:
        msg["result"] = resultat
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def traiter(req):
    methode, id_ = req.get("method"), req.get("id")
    if methode == "initialize":
        return repondre(id_, {"protocolVersion": PROTOCOLE, "serverInfo": SERVEUR,
                              "capabilities": {"tools": {}}})
    if methode in ("notifications/initialized", "notifications/cancelled"):
        return                                   # notification : aucune reponse
    if methode == "tools/list":
        return repondre(id_, {"tools": [
            {"name": nom, "description": desc,
             "inputSchema": {"type": "object", "properties": props}}
            for _, nom, desc, props in OUTILS]})
    if methode == "tools/call":
        p = req.get("params", {})
        fn = PAR_NOM.get(p.get("name"))
        if fn is None:
            return repondre(id_, erreur={"code": -32601,
                                         "message": f"outil inconnu : {p.get('name')}"})
        try:
            res = fn(p.get("arguments") or {})
            texte = json.dumps(res, ensure_ascii=False, indent=1, default=str)
        except Exception as e:
            return repondre(id_, {"content": [{"type": "text",
                                               "text": f"{type(e).__name__} : {e}"}],
                                  "isError": True})
        return repondre(id_, {"content": [{"type": "text", "text": texte}]})
    if id_ is not None:
        repondre(id_, erreur={"code": -32601, "message": f"methode inconnue : {methode}"})


def main():
    for ligne in sys.stdin:
        ligne = ligne.strip()
        if not ligne:
            continue
        try:
            traiter(json.loads(ligne))
        except json.JSONDecodeError:
            continue                             # bruit sur stdin : on ignore
    return 0


if __name__ == "__main__":
    sys.exit(main())
