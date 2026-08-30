"""Launching generation, job queue, declensions.

Port of `routes/production.py` — same 6 URLs, same JSON bodies, same status
codes.

    /api/plan               dry run, replayed on every keystroke
    /api/run                launches a batch — generation OR edit, one entry
    /api/decline            short loop from an image already produced
    /api/stop               arms STATE["stop"]
    /api/nsfw/instructions  the graph's real preamble + instruction history
    /api/nsfw/arm           arms/disarms the CHARACTER's NSFW switch

WHAT DID NOT MOVE, AND MUST NOT. There is a single execution core,
`lb.execute_jobs`, called by the CLI and by the web (CLAUDE.md §8.2); a single
launch path, `start_batch`, shared by /api/run and /api/decline; and a single
run state, `ss.STATE`. Every ComfyUI call underneath stays blocking urllib
pushed into an executor, with `wait_prompt()` polling /history every 2 s — no
websocket, and `ui_to_api.convert()` still reconverts the UI workflow on every
launch (CLAUDE.md §8.1). This module never touches any of that; it hands jobs
to the runner and reports.
"""
import asyncio
import csv
import json
import re
import shutil
from datetime import datetime
from types import SimpleNamespace
from typing import Union

from fastapi import APIRouter
from fastapi.responses import JSONResponse

import nsfw_batch
import runner as lb
import shared_state as ss

from ..dependencies import CharacterId
from ..schemas.common import ActionResponse, ERROR_RESPONSES
from ..schemas.production import (
    DeclineDryResponse, DeclineRequest, NsfwArmRequest, NsfwArmResponse,
    NsfwInstructionsResponse, PlanResponse, RunPayload, RunStartedResponse,
)

router = APIRouter(responses=ERROR_RESPONSES)


def clamped_int(payload, key, minimum=None, maximum=None):
    """An integer of a request body, BOUNDED SERVER-SIDE.

    The `max` attributes of the settings panel only hold inside the browser:
    the API used to accept any value, and `int()` on a non-numeric entry raised
    a ValueError that came out as a 500.

    It CLAMPS, it does not reject: `count=9999` yields 24, and a 200. Moving
    these bounds into the Pydantic schema as `ge`/`le` would turn a working
    request into a 400 — see the module docstring of schemas/production.py.

    The empty string is not an error either: the panel sends `''` for a field
    it has not painted yet, on the very first plan of a session.
    """
    v = getattr(payload, key, None)
    if v in (None, ""):
        return None
    try:
        n = int(v)
    except (TypeError, ValueError):
        ss.bad_request(f"« {key} » doit être un nombre entier")
    if minimum is not None:
        n = max(minimum, n)
    if maximum is not None:
        n = min(maximum, n)
    return n


def run_scene_override(payload):
    """Scene text amended FOR THIS LAUNCH, never saved.

    Bounded to a single selected scene: with several scenes, « the » scene
    designates nothing, and applying the same text to all of them would
    overwrite all of them. It is also what makes the amendment legible in the
    preview — there is only one prompt to show.

    The text goes through the same `assert_no_face` as saved scenes:
    `build_jobs` checks it along with the other fragments, there is no back
    door to a prompt that would describe the face.
    """
    txt = (payload.scene_override or "").strip()
    return txt if txt and len(payload.scenes or []) == 1 else None


def filters_from(payload):
    """The filter object `lb.build_jobs` expects.

    A SimpleNamespace and not a Pydantic model: this is the contract with the
    RUNNER, which knows nothing about HTTP and must keep knowing nothing. The
    schema stops at the edge of this module.
    """
    return SimpleNamespace(
        scene_override=run_scene_override(payload),
        scene=payload.scenes or None,
        category=payload.categories or None,
        format=payload.format or None,
        count=clamped_int(payload, "count", 1, 24),
        limit=clamped_int(payload, "limit", 1, 500),
        seed=clamped_int(payload, "seed"),      # a seed has no useful bound
        no_variants=bool(payload.no_variants),
        # creative journey: absent = level 0 (strict SFW)
        intensity=payload.intensity,
        tone=payload.tone or None,
        intention=payload.intention or None,
    )


def guard_intensity(level, character, *, confirm=False, edit_instruction="",
                    no_qc=False):
    """Locks of the intensity slider. Returns an error message, or None.

    Takes the four values it actually reads rather than a whole body: it is
    called from three places, and two of them (`start_edit_from_image`, the
    `intensite` declension) used to rebuild a fake dict just to satisfy the old
    signature. The rules themselves have not changed.
    """
    try:
        level = int(level or 0)
    except (TypeError, ValueError):
        return "niveau d'intensite invalide"
    tier = lb.by_level(lb.load_creative(character), level)
    if tier is None:
        return f"niveau d'intensite inconnu : {level}"
    requires = tier.get("requires")
    if requires == "confirm" and not confirm:
        return f"le niveau « {tier['label']} » demande une confirmation"
    if requires == "armed" and not nsfw_batch.is_armed(character):
        return f"le niveau « {tier['label']} » demande la branche NSFW armee"
    if tier.get("pipeline") == "flux+edit" and not (edit_instruction or "").strip():
        return (f"le niveau « {tier['label']} » demande une instruction "
                f"d'édition")
    if tier.get("pipeline") == "flux+edit" and no_qc:
        # In `generer_avant` mode the QC is the only filter protecting the
        # chaining (`nsfw_chaining_hook`): without it `execute_jobs` codes every
        # verdict "OK" and absolutely everything gets edited, face detected or
        # not. In edit mode, it is the QC that gives its verdict — hence its
        # folder — to each output: without it everything lands in _NSFW/OK
        # without having been measured.
        return (f"le niveau « {tier['label']} » ne peut pas se passer du QC "
                f"d'identité — c'est lui qui décide du sort de chaque sortie")
    return None


def guard_intensity_of(payload, character):
    """`guard_intensity` for a launch payload (/api/plan, /api/run)."""
    return guard_intensity(payload.intensity, character,
                           confirm=payload.confirm_intensity,
                           edit_instruction=payload.edit_instruction,
                           no_qc=payload.no_qc)


# NSFW edit settings the panel is allowed to override. An ALLOW-LIST: arming the
# branch is not in it (it lives in character.json since J4, and remains an
# interface ritual that must not be reachable through a settings payload).
# Server-side bounds on top of the allow-list. `max_pixels` without a ceiling
# went straight into Qwen's working surface.
NSFW_OVERRIDABLE = {"steps": (1, 40), "cfg": (0.5, 8.0),
                    "max_pixels": (200_000, 4_000_000),
                    "face_denoise": (0.05, 0.95)}


def apply_nsfw_overrides(configuration, payload):
    """Carries the payload's NSFW edit overrides into the configuration."""
    kept = {}
    for key, (minimum, maximum) in NSFW_OVERRIDABLE.items():
        v = (payload.nsfw or {}).get(key)
        if v is None:
            continue
        try:
            kept[key] = min(maximum, max(minimum, float(v)))
        except (TypeError, ValueError):
            ss.bad_request(f"nsfw.{key} : valeur numérique attendue")
        if key in ("steps", "max_pixels"):
            kept[key] = int(kept[key])
    if kept:
        configuration.setdefault("nsfw", {}).update(kept)
    return kept


def apply_export_rule(configuration, requested_level, character="lena"):
    """Cuts the export off when the REQUESTED tier does not export.

    `sort_and_export` only knows `cfg["export"]["enabled"]` — and that is right:
    the runner has no business knowing about intensity tiers. So it is up to the
    caller to translate the tier's rule into configuration.

    Two cases fixed on 24/08/2026, both seen in production:
      - level 2 (Suggestif, export false): the images went into PROD/EXPORT all
        the same;
      - level 3: the INTERMEDIATE pass is generated in Soft, whose export is
        allowed. An NSFW request therefore silently dropped a Soft image into
        the publication folder.
    """
    tier = lb.by_level(lb.load_creative(character), requested_level)
    if tier and not tier.get("export", True):
        configuration["export"] = dict(configuration["export"], enabled=False)
    return configuration


def payload_at_generation_level(payload, character="lena"):
    """The payload as seen by the GENERATION pass.

    At level 3 the chain runs in two steps: generate at the `base_level` (Soft
    by default) then edit. The slider shows 3, the generation runs at 1. Only
    concerns `generer_avant` mode — by default the NSFW notch generates nothing
    at all (see `is_edit_mode`).

    Returns a COPY: the original payload keeps the requested level, which is
    what the log header and STATE["intensity"] must announce.
    """
    tier = lb.by_level(lb.load_creative(character), int(payload.intensity or 0))
    if tier and tier.get("pipeline") == "flux+edit":
        return payload.model_copy(update={"intensity": tier.get("base_level", 1)})
    return payload


def is_edit_mode(payload, character):
    """True when the requested notch EDITS an existing image instead of
    generating one.

    That is the notch's default behaviour, and it is the project's rule: the
    branch edits an already validated image, it never generates from scratch.
    `generer_avant` restores the generation -> edit chaining for the only case
    where it serves: no validated image exists yet for the wanted scene.

    Measured 26/08/2026: of 21 NSFW batches, 12 started from editing an
    existing image. The path that regenerated before editing cost a full Flux
    pass (~55 s) to reproduce an image already on the disk.
    """
    tier = lb.by_level(lb.load_creative(character), int(payload.intensity or 0))
    return bool(tier and tier.get("pipeline") == "flux+edit"
                and not payload.generer_avant)


def valid_sources(payload, character):
    """Ticked sources that really exist in THIS character's tree.

    Filters on the disk and not merely on the shape of the name: an image
    sorted elsewhere between the selection and the launch must not go out for
    editing. The disk consulted is PROD/<CID>/: a ticked name cannot designate
    another character's image.
    """
    available = {f.name
                 for f, _ in nsfw_batch.sources_disponibles(ss.cfg(character), character)}
    return [n for n in (payload.sources or [])
            if ss.SAFE_NAME.match(n) and n in available]


# Words too common for an echo between fragments to mean anything.
STOP_WORDS = {
    "with", "and", "the", "her", "his", "from", "into", "over", "onto", "that",
    "this", "some", "very", "more", "than", "then", "they", "them", "have",
    "been", "just", "only", "also", "such", "both", "each", "same", "other",
    "against", "around", "behind", "between", "through", "while", "where",
    "photo", "image", "woman", "shot",
}


def echoes_between_fragments(fragments):
    """Background words coming back in SEVERAL fragments of the prompt.

    Neither a wall nor a judgement: an observation. Two fragments talking about
    the same subject fight each other — measured 26/08/2026 on the `boudoir`
    intention, where the tone said « close intimate framing » and the intention
    « full figure in frame ». The final prompt being shown nowhere, that kind of
    contradiction could only be seen by printing it by hand.

    We return the word and the sources it appears in; the human decides between
    a useful repetition and a contradiction.
    """
    # Grouping on a light stem: without it, « framing » and « frame » are two
    # different words, and that is exactly the conflict we are looking for (a
    # tone's « close intimate framing » against an intention's « full figure in
    # frame »). We generate a word's possible forms and group as soon as they
    # overlap; the word DISPLAYED stays the one that was written.
    def forms(word):
        out = {word}
        for suffix in ("ing", "ed", "s"):
            if word.endswith(suffix) and len(word) - len(suffix) >= 3:
                stem = word[:-len(suffix)]
                out |= {stem, stem + "e"}
        return out

    by_key, key_of = {}, {}
    for f in fragments:
        seen = set()
        for word in re.findall(r"[a-zA-Z]{4,}", f["texte"].lower()):
            if word in STOP_WORDS:
                continue
            # follow the CANONICAL key already recorded for this stem, and not
            # one of the crossed forms: otherwise « frame » seen after
            # « framing » filed itself under its own key and the connection was
            # lost
            common = forms(word) & set(key_of)
            key = key_of[next(iter(common))] if common else word
            if key in seen:
                continue
            seen.add(key)
            for form in forms(word):
                key_of.setdefault(form, key)
            by_key.setdefault(key, {"mots": set(), "sources": []})
            by_key[key]["mots"].add(word)
            by_key[key]["sources"].append(f["source"])
    echoes = [{"mot": " / ".join(sorted(v["mots"])), "sources": v["sources"]}
              for v in by_key.values() if len(v["sources"]) > 1]
    # the most shared first: they are the likeliest to be fighting
    echoes.sort(key=lambda e: (-len(e["sources"]), e["mot"]))
    return echoes[:8]


def prompt_preview(jobs):
    """What actually goes out, shown before launching.

    On a typical scene, 69 % of the final prompt is assembled out of sight of
    whoever writes the scene (measured 26/08/2026: 179 characters written out
    of 578). Until that was displayed, a failed result could not be diagnosed.
    """
    if not jobs:
        return None
    j = jobs[0]
    fragments = j.get("fragments") or []
    total = len(j["prompt"])
    return {
        "total_car": total,
        "n_jobs": len(jobs),
        "scene": j["scene"],
        "fragments": [{**f, "part": round(100 * len(f["texte"]) / total)
                       if total else 0} for f in fragments],
        "echos": echoes_between_fragments(fragments),
    }


@router.post("/api/plan", response_model=PlanResponse,
             response_model_exclude_unset=True,
             summary="Plan à blanc du lancement")
async def build_plan(payload: RunPayload, character_id: CharacterId):
    """Dry run of /api/run: how many images, which jobs, and what the prompt
    will really say.

    ┌── COUPLING TO PRESERVE — migration brief §4.2 and §4.3, AUDIT §5.6 ─────┐
    │ TWO THINGS AT ONCE, AND BOTH ARE CONTRACTS.                             │
    │                                                                         │
    │ 1. THIS ROUTE IS REPLAYED ON EVERY KEYSTROKE (debounced 220 ms in       │
    │    create.refreshPlan). It carries the count, the prompt preview AND    │
    │    the instruction alerts in one answer, on purpose: three routes would │
    │    mean three round-trips per keystroke. Do not split it, do not cache  │
    │    it, do not turn it into a subscription.                              │
    │                                                                         │
    │ 2. IT ANSWERS 200 EVEN WHEN THE GUARD REFUSES. `{total: 0, jobs: [],    │
    │    erreur, alertes}` with a 200 status — never a 4xx. This is the       │
    │    server side of the `#btnRun.disabled` rule, whose other half is      │
    │    `running`/`comfy` on /api/state (see routers/state.py, same box):    │
    │                                                                         │
    │      poller.tick()        -> s.running || !s.comfy || !nbSelection()    │
    │                              || !planOk()                               │
    │      create.refreshPlan() -> p.total === 0 || isRunning() || dot off    │
    │                              and sets PLAN_OK = p.total > 0             │
    │                                                                         │
    │    `planOk()` is the COMMON SOURCE that stops the two timers from       │
    │    fighting over the button. `refreshPlan` reads `p.erreur` and         │
    │    `p.total` out of the BODY; it never looks at the status. Returning   │
    │    403 here would leave PLAN_OK stale and let the other timer re-enable │
    │    a button that must stay dead.                                        │
    │                                                                         │
    │ `alertes` comes back even on refusal — the edit screen would otherwise  │
    │ show nothing while the instruction is still empty, which is exactly     │
    │ when it is being written.                                               │
    │                                                                         │
    │ A React rewrite (Phase 3) that folds this into one shared store REMOVES │
    │ THE GUARD BY CONSTRUCTION — and with it the bug it covers. Read this    │
    │ box before touching it.                                                 │
    └─────────────────────────────────────────────────────────────────────────┘
    """
    cid = character_id
    # the alerts do not depend on the plan being valid: we return them even when
    # the guard refuses, otherwise the edit screen shows nothing while the
    # instruction is empty — which is precisely where it gets written
    alerts = nsfw_batch.alertes_instruction(payload.edit_instruction or "")
    if err := guard_intensity_of(payload, cid):
        return {"total": 0, "jobs": [], "erreur": err, "alertes": alerts}
    if is_edit_mode(payload, cid):
        # nothing to build: the « plan » is the list of ticked images
        return {"total": len(valid_sources(payload, cid)), "jobs": [],
                "edition": True, "alertes": alerts}
    jobs = lb.build_jobs(lb.scenes_path(cid),
                         filters_from(payload_at_generation_level(payload, cid)))
    return {"total": len(jobs), "alertes": alerts,
            "apercu": prompt_preview(jobs), "jobs": [
        {"scene": j["scene"], "category": j["category"], "format": j["format"],
         "variant": j["variant"], "seed": j["seed"], "prompt": j["prompt"],
         "intensity": j["intensity"], "outfit": j["outfit"]}
        for j in jobs]}


def nsfw_chaining_hook(configuration, use_qc, batch_id, character):
    """Level-3 hook: edit the SFW output, with no intermediate sorting.

    Returns None when the batch is not level 3. The guards do not move: the
    output goes to PROD/<CID>/_NSFW, it is never exported, and `editer` checks
    the arming a second time.
    """
    level = configuration.get("_intensity", 0)
    tier = lb.by_level(lb.load_creative(character), level)
    if not tier or tier.get("pipeline") != "flux+edit":
        return None
    instruction = configuration.get("_edit_instruction", "")
    state = {"runner": None, "rows": []}

    allowed = configuration.get("nsfw", {}).get("chainer_si", ["OK", "A_REVOIR"])

    def hook(job, verdict, dest):
        # The NSFW stage RE-RENDERS the face from the frozen base (PuLID +
        # FaceDetailer): measured 24/08/2026 over 9 chainings, identity gains
        # +0.028 on average, 8 times out of 9. A slightly low source therefore
        # very often produces a compliant output. Refusing on the OK verdict
        # alone rejected work that succeeds. We only cut below the watch band,
        # or when no face was detected: there, PuLID has nothing coherent to
        # catch up on.
        if verdict not in allowed:
            ss.push_log(f"{dest.name} : passe SFW {verdict}, édition non enchaînée")
            return
        if state["runner"] is None:               # built only once
            state["runner"] = nsfw_batch.NsfwRunner(configuration, character)
        result, row = nsfw_batch.editer(
            dest, instruction, configuration, ss.CHECKER if use_qc else None,
            runner=state["runner"], batch_id=batch_id, character_id=character)
        if row:
            state["rows"].append(row)
            nsfw_batch.journal([row], character)
            sc = f" ({result['score']:.3f})" if result.get("score") else ""
            ss.push_log(f"→ NSFW {result['fichier']} : {result['verdict']}{sc} "
                        f"— {result['duree']:.0f}s")
            # the live strip only showed the SFW pass: at level 3 we were
            # therefore looking at the intermediate image, never the produced one
            ss.STATE["recent"].append({"bucket": result["verdict"],
                                       "name": result["fichier"],
                                       "scene": f"{job['scene']} · édité",
                                       "space": "nsfw", "score": result.get("score")})
            del ss.STATE["recent"][:-24]
        else:
            ss.push_log(f"→ NSFW échec sur {dest.name} : {result.get('error')}")

    return hook


def run_batch_blocking(jobs, configuration, batch_id, use_qc, character="lena"):
    if use_qc:
        ss.checker_partage(configuration)

    def on_event(kind, **kw):
        if kind == "start":
            ss.STATE.update(index=kw["index"], total=kw["total"],
                            current=f"{kw['job']['scene']} ({kw['job']['format']})")
        else:
            job, r = kw["job"], kw["result"]
            if r["verdict"] == "ERREUR":
                ss.push_log(f"{kw['index']}/{kw['total']} {job['scene']} : ECHEC — "
                            f"{r.get('error')}")
            else:
                sc = f" ({r['score']:.3f})" if r.get("score") else ""
                ss.push_log(f"{kw['index']}/{kw['total']} {job['scene']} : "
                            f"{r['verdict']}{sc} — {r['duree']:.0f}s")
                ss.STATE["recent"].append({"bucket": r["verdict"], "name": r["fichier"],
                                           "scene": job["scene"], "space": "sfw",
                                           "score": r.get("score")})
                del ss.STATE["recent"][:-24]

    rows, stats = lb.execute_jobs(jobs, configuration,
                                  ss.CHECKER if use_qc else None, batch_id,
                                  character_id=character, on_event=on_event,
                                  should_stop=lambda: ss.STATE["stop"],
                                  after=nsfw_chaining_hook(configuration, use_qc,
                                                           batch_id, character))
    return stats


def _launch(work):
    """Common execution loop: `work()` off the event loop.

    Files the stats away, surfaces the error to the screen, and puts STATE back
    to rest whatever happens. Shared by production and editing: that is what
    guarantees a single batch runs, and that a single panel shows it.
    """
    async def runner():
        try:
            stats = await asyncio.get_running_loop().run_in_executor(None, work)
            ss.STATE["stats"] = stats
            ss.push_log("termine — " + " | ".join(f"{k} {v}" for k, v in stats.items() if v))
        except Exception as e:                       # surface the error on screen
            ss.push_log(f"ERREUR : {type(e).__name__} — {e}")
            ss.STATE["last_error"] = {
                "at": datetime.now().strftime("%H:%M:%S"),
                "msg": f"{type(e).__name__} — {e}"}
        finally:
            ss.STATE.update(running=False, current=None)

    asyncio.create_task(runner())


def edit_batch_blocking(sources, instruction, configuration, use_qc, character):
    """Editing already validated images, on the same STATE as production."""
    if use_qc:
        ss.checker_partage(configuration)

    def on_event(kind, **kw):
        if kind == "start":
            ss.STATE.update(index=kw["index"], total=kw["total"], current=kw["source"])
        else:
            r = kw["result"]
            if r["verdict"] == "ERREUR":
                ss.push_log(f"{kw['index']}/{kw['total']} {kw['source']} : ECHEC — "
                            f"{r.get('error')}")
            else:
                sc = f" ({r['score']:.3f})" if r.get("score") else ""
                ss.push_log(f"{kw['index']}/{kw['total']} {kw['source']} : "
                            f"{r['verdict']}{sc} — {r['duree']:.0f}s")
                # space nsfw: the output lives in PROD/<CID>/_NSFW, /img looks there
                ss.STATE["recent"].append({"bucket": r["verdict"], "name": r["fichier"],
                                           "scene": kw["source"], "space": "nsfw",
                                           "score": r.get("score")})
                del ss.STATE["recent"][:-24]

    return nsfw_batch.run(sources, instruction, configuration,
                          ss.CHECKER if use_qc else None, on_event,
                          should_stop=lambda: ss.STATE["stop"],
                          character_id=character)[1]


def start_edit_batch(sources, instruction, configuration, use_qc, level, character):
    """Launches an edit. Counterpart of `start_batch`, same state, same panel."""
    batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    ss.STATE.update(running=True, stop=False, batch_id=batch_id, index=0,
                    total=len(sources), current=None, stats={}, recent=[],
                    intensity=level, character=character, last_error=None,
                    edition=True,
                    started_at=datetime.now().isoformat(timespec="seconds"))
    ss.push_log(f"édition {batch_id} — {len(sources)} image(s) déjà validée(s) "
                f"· sortie dans PROD/{character.upper()}/_NSFW · hors export")
    ss.push_log(f"instruction : {instruction[:100]}")
    for a in nsfw_batch.alertes_instruction(instruction):
        ss.push_log(f"  ! {a}")
    _launch(lambda: edit_batch_blocking(sources, instruction, configuration, use_qc,
                                        character))
    return batch_id


def start_batch(jobs, configuration, use_qc, header=None, character="lena"):
    """Starts a batch and returns its identifier. ONE launch path.

    Used by /api/run (production) and /api/decline (refinement loop).
    Duplicating this block guarantees two behaviours that drift apart.
    """
    batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    ss.STATE.update(running=True, stop=False, batch_id=batch_id, index=0,
                    total=len(jobs), current=None, stats={}, recent=[],
                    character=character, last_error=None, edition=False,
                    started_at=datetime.now().isoformat(timespec="seconds"))
    p = configuration["preset"]
    # the REQUESTED level, not the generation pass's: at level 3 the jobs are
    # built in Soft, and announcing « Soft » would mislead
    requested = configuration.get("_intensity", jobs[0]["intensity"])
    tier = lb.by_level(lb.load_creative(character), requested)
    ss.STATE["intensity"] = requested
    exported = "" if not tier or tier.get("export", True) else " · hors export"
    ss.push_log(header or (f"batch {batch_id} — intensite "
                           f"« {tier['label'] if tier else '?'} »"
                           + (f" · ton {jobs[0]['tone']}" if jobs[0]["tone"] else "")
                           + exported))
    ss.push_log(f"batch {batch_id} — {len(jobs)} image(s) · guidance {p['guidance']} · "
                f"refiner {'ON' if p['refiner'] else 'OFF'} · "
                f"detail {'ON' if p['facedetailer'] else 'OFF'} · "
                f"grain {'ON' if p['grain_export'] else 'OFF'}")

    _launch(lambda: run_batch_blocking(jobs, configuration, batch_id, use_qc,
                                       character))
    return batch_id


# Keys are the WIRE CONTRACT (the `mode` sent by the frontend); values are the
# French labels shown on screen, returned as `libelle`. Neither may be
# translated.
DECLENSION_LABELS = {
    "lumiere":   "autre lumière",
    "ton":       "autre ton",
    "seeds":     "même scène, autres tirages",
    "intensite": "monter d'un cran",
    "editer":    "éditer en NSFW",
}


def edit_tier(creative):
    """The tier that edits an image instead of generating one, if it exists."""
    return next((p for p in creative.get("intensity", [])
                 if p.get("pipeline") == "flux+edit"), None)


def start_edit_from_image(name, payload, level, character):
    """Edits ONE image from the review, regenerating nothing.

    Before 26/08/2026 this gesture went through `build_jobs` and REGENERATED the
    source at the same seed (~55 s) to reproduce it identically before editing
    it — while it is right there, on the disk, under our eyes. From a Soft image
    it also took two declensions, so two regenerations, and the intermediate
    Suggestif image was produced and filed for nothing.
    """
    err = guard_intensity(level, character, confirm=payload.confirm_intensity,
                          edit_instruction=payload.edit_instruction,
                          no_qc=payload.no_qc)
    if err:
        return JSONResponse({"ok": False, "erreur": err}, status_code=403)
    if nsfw_batch.resoudre_source(name, ss.cfg(character), character) is None:
        return JSONResponse(
            {"ok": False, "erreur": "cette image n'est pas éditable — seules les "
                                    "images validées ou à revoir le sont"},
            status_code=400)
    configuration = ss.cfg(character)
    configuration["_intensity"] = level
    apply_export_rule(configuration, level, character)
    batch_id = start_edit_batch([name], (payload.edit_instruction or "").strip(),
                                configuration, not payload.no_qc, level, character)
    return {"ok": True, "batch_id": batch_id, "total": 1,
            "mode": "editer", "edition": True,
            "libelle": DECLENSION_LABELS["editer"]}


@router.post("/api/decline", response_model=RunStartedResponse,
             response_model_exclude_unset=True,
             responses={200: {"model": Union[RunStartedResponse, DeclineDryResponse],
                              "description": "Batch lancé, ou — si `dry` — ce que "
                                             "chaque mode donnerait"},
                        404: {"description": "Image absente du journal"},
                        409: {"description": "Un batch tourne déjà"},
                        403: {"description": "Un verrou du curseur s'y oppose"}},
             summary="Repartir d'une image déjà produite")
async def decline_image(payload: DeclineRequest, character_id: CharacterId):
    """Short loop: start again from an image already produced.

    `dry` only returns what each mode would produce, so the interface shows
    only the declensions that make sense on this image.
    """
    cid = character_id
    name = payload.name
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    row = ss.journal_index(cid).get(name)
    if not row:
        return JSONResponse(
            {"ok": False, "erreur": "image absente du journal — impossible de la "
                                    "rejouer (scène et seed inconnus)"}, status_code=404)
    creative = lb.load_creative(cid)
    scenes = lb.scenes_path(cid)
    level = int(row.get("intensite") or 0)

    if payload.dry:
        available = {}
        for mode in lb.MODES_DECLINAISON:
            if mode == "ton":
                available[mode] = [t for t in creative.get("tones", [])
                                   if t["key"] != (row.get("ton") or None)]
            else:
                available[mode] = len(lb.jobs_declinaison(
                    scenes, row, mode, creative=creative,
                    n=int(payload.n or 3)))
        following = lb.by_level(creative, level + 1)
        # the "one notch up" button must reflect the SAME locks as the main
        # slider: a confirmation to show, an arming to offer rather than letting
        # the user click and then fail on a generic toast
        configuration = ss.cfg(cid)
        # Same truth as the slider: the edit tool wants the arming AND a graph
        # declared by the pack. The arming gesture itself no longer lives here —
        # it has one place, the Application screen (J7).
        tool = nsfw_batch.edit_tool_state(cid)
        locked = (following is not None and following.get("requires") == "armed"
                  and not tool["available"])
        # Editing does not go one notch up: it starts from the displayed image,
        # whatever its level. It is the « I like this one, edit it » gesture,
        # which until now only existed in a separate tab.
        edit = edit_tier(creative)
        available["editer"] = bool(
            edit and nsfw_batch.resoudre_source(name, configuration, cid))
        return JSONResponse({
            "ok": True, "modes": available, "scene": row.get("scene"),
            "intensite": level, "ton": row.get("ton") or "",
            "niveau_suivant": following["label"] if following else None,
            "suivant_requires": following.get("requires") if following else None,
            "suivant_verrouille": locked,
            "edition_label": edit["label"] if edit else None,
            "edition_verrouillee": bool(edit and edit.get("requires") == "armed"
                                        and not tool["available"]),
            "edition_raison": tool["reason"],
            "suivant_instruction": bool(following and
                                        following.get("pipeline") == "flux+edit")})

    # From here down there is NO `await` until the batch is started. That is what
    # keeps two concurrent requests from both passing the STATE test and
    # launching two batches on the same GPU — see the note on `run_batch`.
    if ss.STATE["running"]:
        return JSONResponse({"ok": False, "erreur": "un batch tourne deja"},
                            status_code=409)
    mode = payload.mode
    edit = edit_tier(creative)
    # « editer » rebuilds no job: it edits the displayed image. Handled before
    # MODES_DECLINAISON, which only knows the build_jobs modes. « one notch up »
    # also lands here when the target notch is the one that edits: going up to
    # it IS editing, not regenerating.
    if mode == "editer" or (mode == "intensite" and edit
                            and edit["level"] == level + 1):
        if edit is None:
            return JSONResponse(
                {"ok": False, "erreur": "aucun palier d'édition configuré"},
                status_code=400)
        return start_edit_from_image(name, payload, edit["level"], cid)
    if mode not in lb.MODES_DECLINAISON:
        return JSONResponse({"ok": False, "erreur": "mode inconnu"}, status_code=400)
    if mode == "intensite":
        # the slider has locks: a declension must not go around them
        err = guard_intensity(level + 1, cid, confirm=payload.confirm_intensity,
                              edit_instruction=payload.edit_instruction,
                              no_qc=payload.no_qc)
        if err:
            return JSONResponse({"ok": False, "erreur": err}, status_code=403)

    jobs = lb.jobs_declinaison(scenes, row, mode, creative=creative,
                               n=int(payload.n or 3), tone=payload.tone)
    if not jobs:
        reason = {"lumiere": "cette scène n'a pas d'autre variante de lumière",
                  "ton": "choisis un ton différent de celui de l'image",
                  "intensite": "cette image est déjà au niveau le plus haut",
                  "seeds": "aucune scène correspondante"}[mode]
        return JSONResponse({"ok": False, "erreur": reason}, status_code=400)

    configuration = ss.cfg(cid)
    if mode == "intensite":
        # same wiring as /api/run: this is what triggers the chaining
        configuration["_intensity"] = level + 1
        configuration["_edit_instruction"] = (payload.edit_instruction or "").strip()
        apply_export_rule(configuration, level + 1, cid)
    batch_id = start_batch(jobs, configuration, not payload.no_qc,
                           header=f"déclinaison « {DECLENSION_LABELS[mode]} » depuis {name}",
                           character=cid)
    return {"ok": True, "batch_id": batch_id, "total": len(jobs),
            "mode": mode, "libelle": DECLENSION_LABELS[mode]}


@router.post("/api/run", response_model=RunStartedResponse,
             response_model_exclude_unset=True,
             responses={409: {"description": "Un batch tourne déjà"},
                        403: {"description": "Un verrou du curseur s'y oppose"}},
             summary="Lancer une production ou une édition")
async def run_batch(payload: RunPayload, character_id: CharacterId):
    """Launches a batch. TWO MODES ON A SINGLE ENTRY POINT: generation, or
    editing images already validated.

    THE BODY IS READ BEFORE THE GUARD, AND THAT ORDER MATTERS. Under aiohttp
    the handler had to `await request.json()` first on purpose: `await` hands
    control back to the loop, so testing STATE before reading let two concurrent
    requests both pass the test and launch two batches on the same GPU. FastAPI
    now parses the body before the handler is even entered, so the order holds
    by construction — but only as long as NO `await` is introduced between the
    `STATE["running"]` test below and the call to `start_batch`. Everything in
    between is deliberately synchronous.
    """
    cid = character_id
    if ss.STATE["running"]:
        return JSONResponse({"ok": False, "erreur": "un batch tourne deja"},
                            status_code=409)
    if err := guard_intensity_of(payload, cid):
        return JSONResponse({"ok": False, "erreur": err}, status_code=403)

    # NSFW notch: we edit images already validated, we generate nothing. A
    # single entry point for both modes — that is what allowed the parallel NSFW
    # tab and its three competing instruction fields to be removed.
    if is_edit_mode(payload, cid):
        sources = valid_sources(payload, cid)
        if not sources:
            return JSONResponse(
                {"ok": False, "erreur": "aucune image source valide — coche au "
                                        "moins une image déjà validée"}, status_code=400)
        configuration = ss.cfg(cid)
        configuration["preset"].update(payload.preset)
        apply_nsfw_overrides(configuration, payload)
        level = int(payload.intensity or 0)
        configuration["_intensity"] = level
        apply_export_rule(configuration, level, cid)
        batch_id = start_edit_batch(
            sources, (payload.edit_instruction or "").strip(),
            configuration, not payload.no_qc, level, cid)
        return {"ok": True, "batch_id": batch_id,
                "total": len(sources), "edition": True}

    jobs = lb.build_jobs(lb.scenes_path(cid),
                         filters_from(payload_at_generation_level(payload, cid)))
    if not jobs:
        return JSONResponse({"ok": False, "erreur": "aucune scene ne correspond"},
                            status_code=400)

    configuration = ss.cfg(cid)
    configuration["preset"].update(payload.preset)
    apply_nsfw_overrides(configuration, payload)
    # the instruction travels with the batch configuration: run_batch_blocking
    # reads it back to wire the chaining
    configuration["_intensity"] = int(payload.intensity or 0)
    configuration["_edit_instruction"] = (payload.edit_instruction or "").strip()
    apply_export_rule(configuration, configuration["_intensity"], cid)
    batch_id = start_batch(jobs, configuration, not payload.no_qc, character=cid)
    return {"ok": True, "batch_id": batch_id, "total": len(jobs)}


@router.post("/api/stop", response_model=ActionResponse,
             response_model_exclude_unset=True,
             responses={409: {"description": "Aucun batch en cours"}},
             summary="Arrêter le batch en cours")
async def stop_batch():
    if not ss.STATE["running"]:
        # answering « ok » without stopping anything left STATE["stop"] armed,
        # and the next batch stopped on its own after its first image
        return JSONResponse({"ok": False, "erreur": "aucun batch en cours"},
                            status_code=409)
    ss.STATE["stop"] = True
    ss.push_log("arret demande — le batch s'arrete apres l'image en cours")
    return {"ok": True}


def instruction_history(character_id, limit=20):
    """Instructions already used, with what they yielded.

    The NSFW journal already carries `instruction` and `score_identite`: the
    library asks for no new input, it re-reads what has served. Sorted by the
    mean identity obtained — the only comparable measure available on an
    instruction.

    The observation that motivates this screen, 26/08/2026: 25 edits for 15
    distinct instructions, the most frequent retyped 6 times. The journal
    already knew everything needed not to retype it.
    """
    path = nsfw_batch.journal_path(character_id)
    if not path.exists():
        return []
    by_text = {}
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            txt = " ".join((row.get("instruction") or "").split())
            if not txt:
                continue
            e = by_text.setdefault(txt, {"n": 0, "scores": []})
            e["n"] += 1
            try:
                e["scores"].append(float(row["score_identite"]))
            except (TypeError, ValueError):
                pass                      # SANS_VISAGE / ERREUR: no score
    out = []
    for txt, e in by_text.items():
        mean = sum(e["scores"]) / len(e["scores"]) if e["scores"] else None
        out.append({"texte": txt, "n": e["n"],
                    "identite": round(mean, 3) if mean is not None else None,
                    "alertes": nsfw_batch.alertes_instruction(txt)})
    # the score-less ones last: they never led to a measurement
    out.sort(key=lambda e: (e["identite"] is None, -(e["identite"] or 0), -e["n"]))
    return out[:limit]


@router.get("/api/nsfw/instructions", response_model=NsfwInstructionsResponse,
            summary="Préambule réel du graphe + instructions déjà employées")
async def get_nsfw_instructions(character_id: CharacterId):
    """The graph's REAL preamble plus the instructions already used.

    The preamble used to be described by a sentence in the interface (« la pose
    et le décor sont déjà protégés ») without ever being shown. Measured
    result: 5 of the 16 instructions written after the redesign rewrote `same
    pose`. We show the text and stop paraphrasing it.
    """
    return {
        "preambule": nsfw_batch.PREAMBLE.split("Instruction:")[0].strip(),
        "historique": instruction_history(character_id)}


@router.post("/api/nsfw/arm", response_model=NsfwArmResponse,
             summary="Armer / désarmer le contenu adulte du personnage")
async def arm_nsfw(payload: NsfwArmRequest, character_id: CharacterId):
    """Explicit arming: the exact word has to be retyped, not merely clicked.

    Writes the switch into the character registry (character.json, key `nsfw`)
    since J4 (ADR-0010) — no longer into config.json, which keeps only the NSFW
    workflow settings. It is the switch of the CURRENT CHARACTER: there is no
    global one, because nothing holds true for every character at once
    (CLAUDE.md §6).
    """
    cid = character_id
    target = lb.character_json_path(cid)
    registry = lb.load_character(cid)
    if payload.arm:
        if payload.confirm.strip().upper() != "ARMER":
            return JSONResponse({"ok": False, "erreur": "confirmation manquante"},
                                status_code=400)
        registry["nsfw"] = True
        ss.push_log("branche NSFW ARMEE")
    else:
        registry["nsfw"] = False
        ss.push_log("branche NSFW desarmee")
    shutil.copy(target, target.with_suffix(".json.bak"))
    target.write_text(json.dumps(registry, ensure_ascii=False, indent=2),
                      encoding="utf-8")
    return {"ok": True, "armed": registry["nsfw"]}
