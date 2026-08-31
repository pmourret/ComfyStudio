"""Scene bank, creative taxonomy, scene composer.

Port of `routes/banque.py` — same 4 URLs, same JSON bodies, same status codes.

    /api/scenes    GET the bank + everything the cards need, POST to save it
    /api/creative  intentions, tones, intensity tiers filtered by availability
    /api/compose   a French intention -> scenes proposed by the local LLM

The bank's RULES — validation, rotating backup, the cards' statistics — live
in `services/bank.py`. This module reads the request, calls them, and turns
the problems they return into a status code.
"""
import asyncio
import json

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
from ..services.bank import (
    category_order, rotate_backup, scene_previews, scene_stats, stamp_world,
    validate_scene_bank,
)

router = APIRouter(responses=ERROR_RESPONSES)



@router.get("/api/scenes", response_model=SceneBankResponse,
            summary="Banque de scènes du personnage")
async def get_scene_bank(character_id: CharacterId):
    """The bank, plus everything the Créer screen's cards need in ONE call."""
    cid = character_id
    data = ss.scenes_data(cid)
    categories = sorted({lb.scene_intention(s) for s in data["scenes"]},
                        key=category_order)
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
    # The character's world is frozen at birth and already validated upstream
    # (`shared_state.character()`); the bank has to belong to it (ADR-0014).
    # Passing it here is what turns the world lock on — the service refuses,
    # then stamps what is legitimately new.
    world = lb.character_world(cid)
    problems = validate_scene_bank(data, previous=ss.scenes_data(cid),
                                   allow_losses=payload.autoriser_pertes,
                                   world=world)
    if problems:
        ss.push_log(f"scenes.json REFUSE — {problems[0]}")
        return JSONResponse({"ok": False, "erreur": problems[0],
                             "problemes": problems}, status_code=400)
    stamp_world(data, world)
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
