"""QC, revue, jugements (.claude/rules/backend.md).

/api/gallery, /api/action, /api/flag, /api/mesurer, /api/undo, /api/delete,
/api/edit/save.
"""
import asyncio
import base64
import csv
import shutil
from datetime import datetime
from pathlib import Path

from aiohttp import web

import shared_state as ss
import mesures as mes
import nsfw_batch
import runner as lb

routes = web.RouteTableDef()

ACTIONS = {"valider": "OK", "revoir": "A_REVOIR", "rejeter": "REJET",
           "archiver": "ARCHIVE"}


def nsfw_journal_index(character_id):
    """Journal de la branche NSFW. Pas de colonne `character` : il est deja
    propre a un personnage par son chemin (PROD/<CID>/_NSFW/journal_nsfw.csv)."""
    path = nsfw_batch.journal_path(character_id)
    if not path.exists():
        return {}
    out = {}
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            if row.get("fichier"):
                out[row["fichier"]] = {"scene": row.get("source", ""),
                                       "score_identite": row.get("score_identite", ""),
                                       "seed": row.get("seed", ""),
                                       "categorie": "nsfw", "format": "",
                                       "prompt": row.get("instruction", "")}
    return out


def noter_bucket(nom, bucket, space, character_id, ancien_nom=None):
    """Reporte le TRI HUMAIN dans la base, sur la ligne du BON personnage.

    `image.bucket` n'etait ecrit qu'a la generation, avec le verdict du QC. Or
    base.stats_par_scene compte `WHERE bucket = 'OK'` : le badge « n produites ·
    ok » des cartes de scene affichait donc le verdict automatique et ignorait
    tout du tri. Une image rejetee a la main y comptait encore comme validee.

    `character_id` est obligatoire : les deux appels de base prennent 'lena'
    par defaut (base.py, compatibilite J2). Trier une image d'un autre
    personnage depuis la Revue ecrivait donc une ligne character_id='lena'
    dans la seule base — la base restait propre uniquement parce que personne
    n'avait encore trie un autre personnage depuis l'interface.

    Ne doit jamais faire echouer un tri : le fichier, lui, a deja bouge.
    """
    try:
        import base as db
        with db.ouvrir() as cx:
            if ancien_nom and ancien_nom != nom:
                db.renommer(cx, ancien_nom, nom, character_id=character_id)
            db.enregistrer_image(cx, nom, character_id=character_id,
                                 bucket=bucket, espace=ss.espace_db(space))
            cx.commit()
    except Exception as e:
        ss.push_log(f"base : bucket non mis a jour pour {nom} — "
                   f"{type(e).__name__} : {e}")


def exporter(src, nom_journal, space, character_id):
    """Produit le JPEG publiable. Rend son nom, ou "" si rien n'a ete ecrit.

    `nom_journal` est le nom sous lequel l'image est INSCRITE AU JOURNAL, pas
    forcement celui du fichier : un renommage de collision les separe. Relire le
    journal avec le nom final rendait une ligne vide, donc `categorie = divers`
    et `format = 4:5` par defaut — l'export partait dans le mauvais dossier et
    une image 9:16 se retrouvait redimensionnee en 1080x1350.
    """
    if ss.space_id(space) == "nsfw":       # la branche NSFW ne s'exporte jamais
        return ""
    row = ss.journal_index(character_id).get(nom_journal, {})
    configuration = ss.cfg(character_id)
    fmt = row.get("format") or "4:5"
    cat = row.get("categorie") or "divers"
    try:
        from PIL import Image
        exp_dir = ss.export_dir(character_id) / cat
        exp_dir.mkdir(parents=True, exist_ok=True)
        out = exp_dir / (Path(src).stem + "." + configuration["export"]["format"])
        im = Image.open(src).convert("RGB")
        size = tuple(configuration["export_sizes"].get(fmt, im.size))
        if im.size != size:
            im = im.resize(size, Image.LANCZOS)
        im.save(out, quality=configuration["export"]["quality"], subsampling=0)
        return out.name
    except Exception as e:
        ss.push_log(f"export impossible pour {Path(src).name} : {e}")
        return ""


def retirer_export(nom, character_id):
    """Sort une image de la publication. Rend le nombre de fichiers retires.

    Balaye le seul dossier d'export du personnage : le `rglob` sur tout
    PROD/EXPORT/ supprimait l'export homonyme d'un AUTRE personnage en meme
    temps que le sien (deux personnages peuvent produire un meme nom de
    fichier — `nom_libre` ne garantit l'unicite que dans un arbre PROD/<CID>/).
    """
    retires = 0
    for f in ss.export_dir(character_id).rglob(Path(nom).stem + ".*"):
        f.unlink(missing_ok=True)
        retires += 1
    return retires


@routes.get("/api/gallery")
async def api_gallery(request):
    """Contenu d'un dossier de tri — de CE personnage, et de lui seul."""
    cid = ss.character(request)
    bucket = request.query.get("bucket", "OK")
    space = ss.space_id(request.query.get("space"))
    d = ss.bucket_dir(bucket, space, cid)
    files = sorted(d.glob("*.png"), key=lambda f: f.stat().st_mtime,
                   reverse=True) if d.exists() else []
    index = (nsfw_journal_index(cid) if space == "nsfw"
             else ss.journal_index(cid))
    store = mes.charger()
    # Compte sur TOUT le dossier, pas sur les 200 affichees : le bouton annonce
    # ce que /api/mesurer aura reellement a faire, et lui parcourt tout. Les deux
    # chiffres se contredisaient des que le dossier depassait 200 images.
    sans_mesure = sum(1 for f in files if "nettete" not in store.get(f.name, {}))
    items = []
    for f in files[:200]:
        row = index.get(f.name, {})
        m = store.get(f.name, {})
        items.append({
            "name": f.name, "bucket": bucket, "space": space,
            "score": row.get("score_identite", "") or (
                f"{m['identite']:.3f}" if isinstance(m.get("identite"), float) else ""),
            "scene": row.get("scene", ""), "categorie": row.get("categorie", ""),
            "format": row.get("format", ""), "seed": row.get("seed", ""),
            "date": datetime.fromtimestamp(f.stat().st_mtime).strftime("%d/%m %H:%M"),
            # Version des OCTETS, pas de la ligne : `imgUrl` l'ajoute a l'URL
            # (api.js). Un nom de fichier ne suffit plus a identifier une image
            # depuis que l'editeur sait ecraser sa source (F3.3) — sans ce
            # jeton, le navigateur reservirait sa copie en cache et l'ecran
            # montrerait l'image d'avant, sur un fichier qui a change.
            "v": int(f.stat().st_mtime),
            "prompt": row.get("prompt", ""),
            "nettete": m.get("nettete"), "texture": m.get("texture_visage"),
            "fond": m.get("bruit_fond"), "flag": m.get("flag"),
        })
    entrees = list(store.values())
    refs = [e for e in entrees if e.get("role") == "reference"]
    return web.json_response({
        "items": items, "sans_mesure": sans_mesure,
        "references": {"mesurees": len(refs), "total": len(mes.fichiers_reference())},
        # bandes d'etalonnage : deduites des images jugees convaincantes, jamais
        # ecrites en dur. None tant qu'il n'y a pas assez de jugements.
        "bandes": {c: mes.bande(entrees, c)
                   for c in ("nettete", "texture_visage", "bruit_fond")},
        "juges": sum(1 for e in entrees if e.get("flag"))})


@routes.post("/api/flag")
async def api_flag(request):
    """Jugement humain sur le realisme. Independant du tri : il ne bouge rien."""
    body = await request.json()
    name = body.get("name", "")
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    flag = body.get("flag")
    if flag not in (None, "ok", "ia"):
        return web.json_response({"ok": False, "erreur": "flag inconnu"}, status=400)
    mes.poser_flag(name, flag)
    return web.json_response({"ok": True, "flag": flag})


@routes.post("/api/mesurer")
async def api_mesurer(request):
    """Rattrape les mesures manquantes d'un dossier.

    Par paquets : une passe InsightFace coute ~190 ms, mesurer 200 images d'un
    coup ferait expirer la requete. Le front rappelle tant que `restant` > 0.
    Tout tourne dans un thread — un handler async ne doit jamais bloquer la
    boucle (voir le commentaire de comfy_alive).
    """
    body = await request.json()
    if ss.STATE["running"]:
        # InsightFace tourne sur le CPU pendant que ComfyUI occupe le GPU :
        # mesurer pendant une production ralentit le batch pour rien, et les
        # images non mesurees seront de toute facon la a la fin.
        return web.json_response(
            {"ok": False, "erreur": "une production tourne — mesure après"},
            status=409)
    cid = ss.character(request)
    bucket = body.get("bucket", "OK")
    space = ss.space_id(body.get("space"))
    lot = max(1, min(40, int(body.get("lot") or 20)))
    d = ss.bucket_dir(bucket, space, cid)
    if not d.exists():
        return web.json_response({"ok": True, "faites": 0, "restant": 0})

    store = mes.charger()
    a_faire = [f for f in sorted(d.glob("*.png"), key=lambda f: f.stat().st_mtime,
                                 reverse=True)
               if "nettete" not in store.get(f.name, {})]
    refs_a_faire = [f for f in mes.fichiers_reference()
                    if "nettete" not in store.get(f.name, {})]
    if not a_faire and not refs_a_faire:
        return web.json_response({"ok": True, "faites": 0, "restant": 0})

    checker = await asyncio.get_running_loop().run_in_executor(
        None, ss.checker_partage, ss.cfg(cid))

    paquet = a_faire[:lot]

    def travail():
        # le corpus de reference d'abord : sans lui les bandes n'ont pas d'echelle
        if refs_a_faire:
            n, tot = mes.mesurer_references(checker=checker)
            ss.push_log(f"corpus de reference : {n}/{tot} image(s) mesurée(s)")
        for f in paquet:
            try:
                mes.mesurer(f, checker=checker)
            except Exception as e:
                ss.push_log(f"mesure impossible sur {f.name} : {e}")
        return len(paquet)

    faites = await asyncio.get_running_loop().run_in_executor(None, travail)
    restant = len(a_faire) - faites
    ss.push_log(f"realisme : {faites} image(s) mesurée(s), {restant} restante(s)")
    return web.json_response({"ok": True, "faites": faites, "restant": restant})


@routes.post("/api/action")
async def api_action(request):
    cid = ss.character(request)
    body = await request.json()
    name = body.get("name", "")
    bucket, action = body.get("bucket", ""), body.get("action", "")
    space = ss.space_id(body.get("space"))
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    if action not in ACTIONS:
        ss.bad_request(f"action inconnue : « {action} »")
    origine = name                      # nom sous lequel le journal la connait
    src = ss.bucket_dir(bucket, space, cid) / name
    if not src.exists():
        # 404 franc : le fichier n'est pas dans l'arbre de CE personnage. Jamais
        # de recherche dans un autre arbre, meme si le nom y existe.
        return web.json_response({"ok": False, "erreur": "fichier introuvable"},
                                 status=404)
    dest_bucket = ACTIONS[action]
    dest_dir = ss.bucket_dir(dest_bucket, space, cid)
    dest_dir.mkdir(parents=True, exist_ok=True)
    final = name
    if dest_bucket != bucket:
        # Jamais d'ecrasement : un homonyme dans le dossier d'arrivee est une
        # image differente (cas historique, voir lb.nom_libre). shutil.move
        # l'ecraserait sans rien dire.
        if (dest_dir / name).exists():
            final = lb.nom_libre(Path(name).stem, dest_dir.parent,
                                 Path(name).suffix)
            ss.push_log(f"{name} existait déjà dans {dest_bucket} — renommé {final}")
            mes.renommer(name, final)
        shutil.move(str(src), str(dest_dir / final))
        # la vignette repartait du dossier quitte
        ss.oublier_vignette(origine, bucket, space, cid)
        src = dest_dir / final
    name = final

    exported = ""
    if action == "valider":
        exported = exporter(src, origine, space, cid)
    elif space == "sfw" and dest_bucket != "OK":
        # Sortir une image de OK doit la sortir AUSSI de la publication. Sans ca
        # le dossier d'export accumule des images rejetees : constate le
        # 25/08/2026, 11 JPEG dont le PNG etait en REJET. Seul le bouton
        # « annuler » nettoyait, un rejet normal ne nettoyait pas.
        retires = retirer_export(name, cid)
        if retires:
            ss.push_log(f"{name} sort de l'export ({retires} fichier(s) retire(s))")
    if dest_bucket != bucket:
        noter_bucket(name, dest_bucket, space, cid,
                     ancien_nom=origine if name != origine else None)
        ss.UNDO.append({"name": name, "from": bucket, "to": dest_bucket,
                       "export": exported, "space": space, "journal": origine,
                       "character": cid})
        del ss.UNDO[:-50]
    ss.push_log(f"{name} → {dest_bucket}" + (f" (export {exported})" if exported else ""))
    return web.json_response({"ok": True, "bucket": dest_bucket, "export": exported,
                              "undo": len(ss.undo_disponible(cid))})


@routes.post("/api/delete")
async def api_delete(request):
    """Suppression DEFINITIVE — pas un tri, pas dans UNDO, pas de retour.

    Retire le fichier, sa vignette et sa copie d'export. `journal_batch.csv`,
    `mesures.json` et `PROD/soulglade.db` restent intacts : ce sont des historiques
    append-only ailleurs dans le projet (meme raison que le jugement humain ne
    vit pas dans le journal), pas un index de ce qui existe sur le disque — une
    ligne qui pointe vers un fichier disparu reste un fait vrai : cette image a
    existé, a été notée, et a été supprimée.
    """
    cid = ss.character(request)
    body = await request.json()
    name = body.get("name", "")
    bucket, space = body.get("bucket", ""), ss.space_id(body.get("space"))
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    path = ss.bucket_dir(bucket, space, cid) / name
    if not path.exists():
        return web.json_response({"ok": False, "erreur": "fichier introuvable"},
                                 status=404)
    path.unlink()
    ss.oublier_vignette(name, bucket, space, cid)
    retires = retirer_export(name, cid) if space == "sfw" else 0
    ss.push_log(f"{name} supprimée définitivement" +
              (f" (export retiré : {retires} fichier(s))" if retires else ""))
    return web.json_response({"ok": True})


@routes.post("/api/edit/save")
async def api_edit_save(request):
    """Enregistre une retouche (recadrage/couleur/grain, cote navigateur).

    Par defaut un NOUVEAU fichier `<nom>_edit`, dans le meme bucket que
    l'original : c'est le geste normal, l'original reste comparable et
    supprimable a part via api_delete. Ni mesure ni export automatique sur ce
    chemin — ce n'est pas une generation, `api_mesurer` reste la pour noter la
    copie.

    `remplacer: true` ecrase la source (F3.3, 30/08/2026). Le front ne
    l'envoie qu'apres une confirmation explicite, et ce n'est jamais son bouton
    primaire. Trois consequences sont traitees ICI, sans quoi l'interface
    mentirait sur un fichier qui a change sous elle :

      - les MESURES de realisme portaient sur les anciens pixels : effacees
        (`mes.demesurer`), l'image redevient « non mesuree ». Le jugement
        humain, lui, est garde ;
      - l'export publiable (OK/sfw) est refait depuis les nouveaux octets,
        sinon le JPEG diffuse reste l'image d'avant ;
      - la vignette est oubliee. Son horodatage suffirait a la refaire, mais
        `oublier_vignette` rend la chose sure meme si l'horloge du disque est
        moins fine que le geste.

    La LIGNE DE JOURNAL de la generation n'est pas touchee : elle dit ce que le
    pipeline a produit, ce qui reste vrai — le fichier, lui, ne l'illustre plus
    exactement. Le front le dit dans sa confirmation.
    """
    cid = ss.character(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    bucket, space = body.get("bucket", ""), ss.space_id(body.get("space"))
    remplacer = bool(body.get("remplacer"))
    b64 = body.get("data_base64") or ""
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    if not b64:
        return web.json_response({"ok": False, "erreur": "image vide"}, status=400)
    try:
        data = base64.b64decode(b64, validate=True)
    except Exception:
        return web.json_response({"ok": False, "erreur": "image mal encodée"},
                                 status=400)
    if len(data) > ss.TAILLE_MAX_PHOTO:
        return web.json_response(
            {"ok": False, "erreur": "image trop lourde (20 Mo max)"}, status=400)
    # `bucket_dir(…, cid)` : la destination est TOUJOURS l'arbre du personnage
    # de la requete. Un `name` venu d'ailleurs ne peut pas faire ecrire ailleurs
    # — au pire il n'existe pas ici, et on sort en 404 juste en dessous.
    dest_dir = ss.bucket_dir(bucket, space, cid)
    if not (dest_dir / name).exists():
        return web.json_response(
            {"ok": False, "erreur": "image d'origine introuvable"}, status=404)
    if remplacer:
        (dest_dir / name).write_bytes(data)
        ss.oublier_vignette(name, bucket, space, cid)
        mes.demesurer(name)
        exporte = ""
        if bucket == "OK" and space == "sfw":
            exporte = exporter(dest_dir / name, name, space, cid)
        ss.push_log(f"{name} remplacée par sa version éditée"
                    + (f" (export {exporte} refait)" if exporte else ""))
        return web.json_response({"ok": True, "name": name, "remplace": True,
                                  "export": exporte})
    final = lb.nom_libre(f"{Path(name).stem}_edit", dest_dir.parent)
    (dest_dir / final).write_bytes(data)
    ss.push_log(f"{final} enregistrée (édition de {name})")
    return web.json_response({"ok": True, "name": final, "remplace": False})


@routes.post("/api/undo")
async def api_undo(request):
    """Annule le dernier tri DE CE PERSONNAGE : remet l'image dans son dossier
    d'origine.

    La pile reste unique (un seul etat partage), mais on n'y reprend que les
    actions du personnage courant : sans ca, « annuler » depuis la Revue d'un
    personnage deplacait le fichier d'un autre, dans un arbre qu'on ne regarde
    meme pas.
    """
    cid = ss.character(request)
    act = next((a for a in reversed(ss.UNDO) if a.get("character") == cid), None)
    if act is None:
        return web.json_response({"ok": False, "erreur": "rien a annuler"}, status=400)
    ss.UNDO.remove(act)
    space = ss.space_id(act.get("space"))
    src = ss.bucket_dir(act["to"], space, cid) / act["name"]
    retour = ss.bucket_dir(act["from"], space, cid)
    nom = act["name"]
    if src.exists():
        retour.mkdir(parents=True, exist_ok=True)
        # Meme garde qu'a l'aller : un homonyme dans le dossier d'origine est une
        # image DIFFERENTE, et shutil.move l'ecraserait sans rien dire. Le chemin
        # retour n'avait pas la protection que le chemin aller prend soin d'avoir.
        if (retour / nom).exists():
            nom = lb.nom_libre(Path(nom).stem, retour.parent, Path(nom).suffix)
            ss.push_log(f"{act['name']} existait déjà dans {act['from']} — "
                      f"renommé {nom}")
            mes.renommer(act["name"], nom)
        shutil.move(str(src), str(retour / nom))
        ss.oublier_vignette(act["name"], act["to"], space, cid)
    if act.get("export"):
        for f in ss.export_dir(cid).rglob(act["export"]):
            f.unlink(missing_ok=True)
    # Annuler un rejet doit REMETTRE l'image en publication : le rejet avait
    # supprime le JPEG, et l'annulation le laissait supprime. L'image revenait
    # dans OK sans son export, sans que rien ne le signale.
    refait = ""
    if act["from"] == "OK" and space == "sfw":
        cible = retour / nom
        if cible.exists():
            refait = exporter(cible, act.get("journal", act["name"]), space, cid)
    # l'annulation est un tri comme un autre : la base doit la suivre, sinon
    # elle garde le bucket de l'action qu'on vient justement de defaire
    noter_bucket(nom, act["from"], space, cid,
                 ancien_nom=act["name"] if nom != act["name"] else None)
    ss.push_log(f"annule : {nom} → {act['from']}"
              + (f" (export {refait} refait)" if refait else ""))
    return web.json_response({"ok": True, "bucket": act["from"], "name": nom,
                              "export": refait,
                              "undo": len(ss.undo_disponible(cid))})
