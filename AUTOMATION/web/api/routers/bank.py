"""Scene bank, creative taxonomy, scene composer.

Port of `routes/banque.py` — same 4 URLs, same JSON bodies, same status codes.

    /api/scenes    GET the bank + everything the cards need, POST to save it
    /api/creative  intentions, tones, intensity tiers filtered by availability
    /api/compose   a French intention -> scenes proposed by the local LLM

The validation of a bank (`validate_scene_bank`) is the heart of this module
and did not move an inch: it is imperative, it returns French sentences, and
each of its rules carries a dated incident. Turning it into a declarative
Pydantic model was tempting and would have been wrong — it validates a FILE
that belongs to the character, not a request payload, and it is also called
with the previous version of that file to compare the two.
"""
import asyncio
import json
import shutil

from fastapi import APIRouter
from fastapi.responses import JSONResponse

import compose as composer
import nsfw_batch
import pose_tools
import runner as lb
import shared_state as ss

from ..dependencies import CharacterId
from ..schemas.bank import (
    ComposeRequest, ComposeResponse, CreativeResponse, SceneBankRejected,
    SceneBankResponse, SceneBankSaveRequest,
)
from ..schemas.common import ActionResponse, ERROR_RESPONSES

router = APIRouter(responses=ERROR_RESPONSES)

KNOWN_FORMATS = ("4:5", "2:3", "9:16", "1:1")
# Keys carrying the creative journey. They are not mandatory — an unmigrated
# bank has none — but a BATCH of scenes losing them at once is never an
# intention: it is the signature of the 25/08/2026 regression, where a
# frontend-side rebuild wiped them from all 16 scenes in a single save.
# See DOCS/revue-web-2026-08-25.md.
WATCHED_KEYS = ("intention", "intensity", "tags", "tones", "wardrobe", "pose")


def validate_scene_bank(data, previous=None, allow_losses=False):
    """Returns the list of a scene bank's problems. Empty list = good.

    What we refuse here is what would break production later and for no
    apparent reason: a missing `prefix`/`texture` makes `build_jobs` raise a
    KeyError, so a 500 on every plan, very far from the save that caused it.
    """
    if not isinstance(data, dict):
        return ["le corps n'est pas un objet JSON"]
    problems = []
    for key in ("prefix", "anchor", "texture"):
        if not str(data.get(key) or "").strip():
            problems.append(f"champ racine manquant ou vide : « {key} »")
    scenes = data.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        return problems + ["« scenes » doit être une liste non vide"]

    seen = set()
    for i, s in enumerate(scenes):
        if not isinstance(s, dict):
            problems.append(f"scène #{i + 1} : ce n'est pas un objet")
            continue
        sid = str(s.get("id") or "").strip()
        where = sid or f"scène #{i + 1}"
        if not sid:
            problems.append(f"{where} : « id » manquant")
        elif sid in seen:
            problems.append(f"{where} : identifiant en double")
        seen.add(sid)
        if not str(s.get("prompt") or "").strip():
            problems.append(f"{where} : « prompt » vide")
        if s.get("format") and s["format"] not in KNOWN_FORMATS:
            problems.append(f"{where} : format inconnu « {s['format']} »")
        # Since 26/08/2026 `intensity` carries the MINIMUM level, an integer.
        # The maximum is derived from the wardrobe (lb.scene_band). The old
        # [low, high] form stays accepted: its `high` is simply ignored.
        band = s.get("intensity")
        is_int = lambda v: isinstance(v, int) and not isinstance(v, bool)
        if band is not None and not (
                (is_int(band) and 0 <= band <= 3)
                or (isinstance(band, list) and len(band) == 2
                    and all(is_int(v) for v in band) and 0 <= band[0] <= band[1])):
            problems.append(f"{where} : « intensity » doit être le niveau minimum "
                            f"(entier de 0 à 3) — reçu {band!r}")
        wardrobe = s.get("wardrobe")
        if wardrobe is not None:
            if not isinstance(wardrobe, dict):
                problems.append(f"{where} : « wardrobe » doit être un objet "
                                f"niveau → tenue")
            else:
                for level, v in wardrobe.items():
                    if not str(level).isdigit():
                        problems.append(f"{where} : niveau de tenue non numérique "
                                        f"« {level} »")
                    if not isinstance(v, (str, list)):
                        problems.append(f"{where} : tenue du niveau {level} : ni texte "
                                        f"ni liste")
        # pose (26/08/2026): a file name that does not exist in INPUTS/POSE/
        # would fail at execution time, very far from the screen where the scene
        # was saved — same reasoning as prefix/texture.
        pose = s.get("pose")
        if pose is not None:
            if not isinstance(pose, str) or not pose.strip():
                problems.append(f"{where} : « pose » doit être un nom de fichier")
            elif not (pose_tools.POSE_DIR / pose).exists():
                problems.append(f"{where} : squelette de pose introuvable — "
                                f"INPUTS/POSE/{pose}")

    # Batch-erasure guard. Emptying ONE scene is a legitimate edit (the
    # interface drops the key when the field is cleared); two or more in the
    # same save does not come from a human hand on this interface.
    if previous and not allow_losses:
        before = {s.get("id"): s for s in previous.get("scenes", [])
                  if isinstance(s, dict)}
        touched = {}
        for s in scenes:
            if not isinstance(s, dict):
                continue
            old = before.get(s.get("id"))
            if not old:
                continue
            lost = [k for k in WATCHED_KEYS if k in old and k not in s]
            if lost:
                touched[s.get("id")] = lost
        if len(touched) > 1:
            detail = " · ".join(f"{k} ({', '.join(v)})"
                                for k, v in list(touched.items())[:4])
            problems.append(f"{len(touched)} scènes perdraient des réglages du "
                            f"parcours créatif d'un seul coup — refusé. {detail}"
                            + (" …" if len(touched) > 4 else ""))
    return problems


def rotate_backup(target, generations=3):
    """Rotates the .bak files. A single slot only protects against the last
    mistake: on 25/08/2026 the healthy backup was about to be overwritten by
    the damaged version on the next save, and it was the only copy."""
    for n in range(generations, 1, -1):
        old = target.with_suffix(f".json.{n - 1}.bak" if n > 2 else ".json.bak")
        new = target.with_suffix(f".json.{n}.bak")
        if old.exists():
            shutil.copy(old, new)
    if target.exists():
        shutil.copy(target, target.with_suffix(".json.bak"))


def scene_stats(character):
    """Per scene: images produced and mean identity score.

    From the database when it holds data — one query instead of a CSV walk, and
    the full history rather than the files still on disk. Falls back to the
    journal as long as the migration has not been run.
    """
    try:
        import base as db
        with db.ouvrir() as cx:
            s = db.stats_par_scene(cx, character)
        if s:
            return s
    except Exception as e:
        ss.push_log(f"base illisible, repli sur le journal : {e}")

    import csv
    path = ss.journal_path()
    if not path.exists():
        return {}
    acc = {}
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            sid = row.get("scene")
            if not sid or ss.ligne_character(row) != character:
                continue
            e = acc.setdefault(sid, {"n": 0, "scores": [], "ok": 0})
            e["n"] += 1
            if row.get("verdict") == "OK":
                e["ok"] += 1
            try:
                e["scores"].append(float(row["score_identite"]))
            except (KeyError, TypeError, ValueError):
                pass
    out = {}
    for sid, e in acc.items():
        out[sid] = {"n": e["n"], "ok": e["ok"],
                    "avg": round(sum(e["scores"]) / len(e["scores"]), 3)
                           if e["scores"] else None}
    return out


def scene_previews(character):
    """scene -> last image produced BY THIS CHARACTER, to illustrate the scene
    selector. Without the character, the Créer screen's scene cards were
    illustrated with Léna's images whatever character was open."""
    index = ss.journal_index(character)
    best = {}
    for bucket in ("OK", "A_REVOIR", "REJET"):
        d = ss.bucket_dir(bucket, "sfw", character)
        if not d.exists():
            continue
        for f in d.glob("*.png"):
            row = index.get(f.name)
            scene = row["scene"] if row else f.stem.rsplit("_", 2)[0]
            prev = best.get(scene)
            mtime = f.stat().st_mtime
            # priority: a validated image first, then the most recent
            rank = (bucket == "OK", mtime)
            if not prev or rank > prev["rank"]:
                best[scene] = {"rank": rank, "bucket": bucket, "name": f.name}
    return {k: {"bucket": v["bucket"], "name": v["name"]} for k, v in best.items()}


@router.get("/api/scenes", response_model=SceneBankResponse,
            summary="Banque de scènes du personnage")
async def get_scene_bank(character_id: CharacterId):
    """The bank, plus everything the Créer screen's cards need in ONE call."""
    cid = character_id
    data = ss.scenes_data(cid)
    categories = sorted({lb.scene_intention(s) for s in data["scenes"]})
    # journey metadata, computed here so the frontend does not have to
    # reimplement the runner's compatibility defaults
    meta = {s["id"]: {"intention": lb.scene_intention(s),
                      "band": list(lb.scene_band(s)),
                      "tags": s.get("tags", []),
                      "tones": s.get("tones", []),
                      "pose": s.get("pose") or None}
            for s in data["scenes"]}
    return {"data": data, "categories": categories,
            "scene_ids": [s["id"] for s in data["scenes"]],
            "previews": scene_previews(cid),
            "meta": meta,
            "stats": scene_stats(cid),
            "avg_duration": round(ss.avg_duration(cid)),
            "poses": pose_tools.poses_disponibles()}


@router.post("/api/scenes", response_model=ActionResponse,
             response_model_exclude_unset=True,
             responses={400: {"model": SceneBankRejected,
                              "description": "Banque refusée"}},
             summary="Enregistrer la banque de scènes")
async def save_scene_bank(payload: SceneBankSaveRequest, character_id: CharacterId):
    """Writes scenes.json after validation, with a .bak rotation over three
    generations.

    The server no longer trusts the frontend on the shape of the bank: that is
    the check that was missing on 25/08/2026 when an interface-side rebuild
    wiped the creative journey from all 16 scenes with nothing to stop it. It
    writes a file `build_jobs` will be able to read, or it refuses.
    """
    cid = character_id
    # `model_fields_set` and not `is not None`: the old handler branched on
    # `"text" in body`, so an explicit `{"text": null}` went down the json.loads
    # path and came out as « JSON invalide », not as a missing-data error. Same
    # branch, same message.
    sent = payload.model_fields_set
    try:
        if "text" in sent:
            data = json.loads(payload.text)
        elif "data" in sent:
            data = payload.data
        else:
            raise KeyError("data")
    except Exception as e:
        return JSONResponse({"ok": False, "erreur": f"JSON invalide : {e}"},
                            status_code=400)
    problems = validate_scene_bank(data, previous=ss.scenes_data(cid),
                                   allow_losses=payload.autoriser_pertes)
    if problems:
        ss.push_log(f"scenes.json REFUSE — {problems[0]}")
        return JSONResponse({"ok": False, "erreur": problems[0],
                             "problemes": problems}, status_code=400)
    target = lb.scenes_path(cid)
    rotate_backup(target)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    ss.push_log(f"scenes.json enregistre ({len(data['scenes'])} scenes, .bak tourne)")
    return {"ok": True}


@router.get("/api/creative", response_model=CreativeResponse,
            summary="Taxonomie du parcours créatif")
async def get_creative_taxonomy(character_id: CharacterId):
    """Journey taxonomy: intentions, tones, intensity scale."""
    cid = character_id
    creative = lb.load_creative(cid)
    data = ss.scenes_data(cid)
    configuration = ss.cfg(cid)
    # The edit tool exists for THIS character under two conditions, never one
    # (J7): its registry is armed, AND its pack declares an edit graph. A pack
    # without a graph has no tool, whatever the arming.
    tool = nsfw_batch.edit_tool_state(cid)
    # counted once: the disk probe is the same for every tier
    source_count = (len(nsfw_batch.sources_disponibles(configuration, cid))
                    if tool["available"] else 0)
    tiers = []
    for p in creative.get("intensity", []):
        requires = p.get("requires")
        edits = p.get("pipeline") == "flux+edit"
        # A tier that demands arming and does not have it IS NOT EMITTED: the
        # notch is absent from the interface, not greyed out (ADR-0003: NSFW is
        # off by default, and a greyed notch is still an invitation). The slider
        # is rebuilt from this list, so it has nothing to filter — and nothing
        # to filter by character name (CLAUDE.md §8.7). `guard_intensity`
        # remains the server lock: hiding does not replace the guard.
        if requires == "armed" and not tool["available"]:
            continue
        # The notch that edits does not choose a scene: announcing a scene count
        # there was misleading (it showed « 16 », the base level's count, while
        # no scene is used). It counts images. In `generer_avant` mode the base
        # level does rule — but that mode is a fallback, not what the notch
        # announces.
        scene_level = p.get("base_level", p["level"])
        tiers.append({**p,
                      # The destination is SHOWN to the user (tier confirmation):
                      # it is computed, never believed. Stored in creative.json,
                      # it drifts as soon as the file is reused from another
                      # character — a tier was seen announcing PROD/LENA/_NSFW
                      # while writing elsewhere. The disk truth is
                      # nsfw_batch.out_root / the character's tree; that is what
                      # we display.
                      "destination": (f"PROD/{cid.upper()}/_NSFW" if edits
                                      else f"PROD/{cid.upper()}"),
                      "besoin_instruction": edits,
                      "unite": "image" if edits else "scène",
                      "scenes": source_count if edits else
                                sum(1 for s in data["scenes"]
                                    if lb.scene_visible(s, scene_level))})
    return {"intentions": creative.get("intentions", []),
            "tones": creative.get("tones", []),
            "intensity": tiers}


# --------------------------------------------------------------- scene composer
@router.post("/api/compose", response_model=ComposeResponse,
             responses={500: {"description": "Le composeur a échoué"}},
             summary="Composer des scènes depuis une intention en français")
async def compose_scenes(payload: ComposeRequest, character_id: CharacterId):
    """Turns a French intention into scenes ready to be reviewed.

    Goes through the local LLM served by ComfyUI, in an executor: `composer`
    talks to it with blocking urllib and a /history poll, exactly like the
    production runner. Nothing is written to the bank here — the proposal comes
    back for review, and the user saves it through POST /api/scenes.
    """
    cid = character_id
    intention = payload.intention.strip()
    if not intention:
        return JSONResponse({"ok": False, "erreur": "intention vide"},
                            status_code=400)
    data = ss.scenes_data(cid)
    creative = lb.load_creative(cid)
    # `intention` is the free French text describing what is wanted;
    # `intention_cible` is the taxonomy KEY being imposed. Confusing the two put
    # the French sentence into the scenes' intention field.
    forced = (payload.intention_cible or payload.category).strip()
    try:
        loop = asyncio.get_running_loop()
        scenes, raw = await loop.run_in_executor(
            None, lambda: composer.compose(intention, int(payload.count or 3),
                                           creative, ss.cfg(cid)["comfy_url"]))
    except Exception as e:
        ss.push_log(f"composeur : {type(e).__name__} — {e}")
        return JSONResponse({"ok": False, "erreur": str(e)}, status_code=500)
    existing = {s["id"] for s in data["scenes"]}
    for sc in scenes:
        if forced:
            sc["intention"] = forced      # `category` no longer exists: this is it
        base = sc["id"]
        n = 2
        while sc["id"] in existing:              # never two scenes of the same name
            sc["id"] = f"{base}_{n}"
            n += 1
        existing.add(sc["id"])
    ss.push_log(f"composeur : {len(scenes)} scene(s) proposee(s) pour « {intention[:60]} »")
    return {"ok": True, "scenes": scenes, "brut": raw[:2000]}
