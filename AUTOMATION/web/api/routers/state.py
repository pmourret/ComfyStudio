"""System state, health-check, registries, character sheet.

Port of `routes/etat.py` — same 21 URLs, same JSON bodies, same status codes.
Only the framework changed.

    /                       the single-document SPA
    /api/state              STATE + counts + ETA + undo, polled every 1.5 s
    /api/config             the character's config.json
    /api/character          the current character's sheet
    /api/characters         registry (GET) and wizard write (POST)
    /api/wizard/options     types -> styles of the pack, worlds of the family
    /api/characters/base/*  the wizard's identity base (upload/generate/freeze)
    /api/universe/tools     the pack's tool panel
    /api/journal            production journal, filtered on the character
    /api/nsfw/state         armed flag, edit tool availability, sources

Everything here READS. Acting on the two processes (/api/app/*) left for
`routers/app.py` on 31/08/2026 — these routes are polled every 1.5 s, those
ones stop a process.
"""
import csv

from fastapi import APIRouter, Query, Response

import base_portrait
import nsfw_batch
import runner as lb
import shared_state as ss
import universe
import worlds

from ..dependencies import CharacterId
from ..schemas.common import ERROR_RESPONSES
from ..schemas.state import (
    BaseCandidatesRequest, BaseCandidatesResponse, BaseFreezeRequest,
    BaseGenerateRequest, BaseGenerateResponse, BaseNameResponse,
    BaseUploadRequest, CharacterListResponse, CharacterSheet,
    CreateCharacterRequest, CreateCharacterResponse,
    JournalResponse, NsfwStateResponse, SystemStateResponse,
    UniverseToolsResponse, WizardOptionsResponse,
)

router = APIRouter(responses=ERROR_RESPONSES)


def seconds_per_image():
    """Seconds per image of the batch IN FLIGHT, edit pass included.

    At level 3 the chain runs in two steps: generation at the base level, then
    the NSFW edit on its own output. Counting only the generation announced a
    remaining time roughly twice too short.
    """
    # character of the BATCH, not of the URL: it is its real duration we are
    # extrapolating. An SDXL pack and a Flux pack do not run at the same speed.
    cid = ss.STATE.get("character") or "lena"
    base = ss.avg_duration(cid)
    tier = lb.by_level(lb.load_creative(cid), ss.STATE.get("intensity") or 0)
    if tier and tier.get("pipeline") == "flux+edit":
        base += ss._moyenne_duree(nsfw_batch.journal_path(cid), 60.0)
    return base


@router.get("/api/state", response_model=SystemStateResponse,
            summary="État du système et compteurs de buckets")
async def get_system_state(character_id: CharacterId):
    """System state + bucket counts OF THE REQUESTED CHARACTER.

    The counts are those of one precise `PROD/<CID>/` tree: without the
    character, the Review bucket selector announced Léna's figures above
    somebody else's images.

    ┌── COUPLING TO PRESERVE — migration brief §4.3, AUDIT §5.6.3 ────────────┐
    │ TWO CLIENT-SIDE TIMERS WRITE `#btnRun.disabled`, and this route feeds   │
    │ one of them.                                                            │
    │                                                                         │
    │   poller.tick()          -> s.running || !s.comfy || !nbSelection()     │
    │                             || !planOk()                                │
    │   create.refreshPlan()   -> p.total === 0 || isRunning() || dot off     │
    │                                                                         │
    │ `planOk()` (create.js) is the COMMON SOURCE that stops the two from     │
    │ fighting over the button — one re-enabling what the other just cut.     │
    │ The server side of that contract is exactly two fields of this          │
    │ response, `running` and `comfy`, plus `total`/`erreur` on /api/plan     │
    │ (see routers/production.py, same box).                                  │
    │                                                                         │
    │ Neither field may be renamed, made optional, folded into a nested       │
    │ object, or pushed instead of polled. A React rewrite (Phase 3) that     │
    │ moves this into one shared store REMOVES THE GUARD BY CONSTRUCTION —    │
    │ and with it the bug it covers. Read this box before touching it.        │
    └─────────────────────────────────────────────────────────────────────────┘
    """
    cid = character_id
    alive = await ss.comfy_alive()

    def count(space):
        return {b: len(list(ss.bucket_dir(b, space, cid).glob("*.png")))
                if ss.bucket_dir(b, space, cid).exists() else 0 for b in ss.BUCKETS}

    counts = count("sfw")
    # same buckets, NSFW space: used by the Galerie/Revue screen when its space
    # toggle is on NSFW, so the bucket counters match what is actually listed
    # (otherwise they stayed stuck on the SFW figures while showing NSFW images)
    nsfw_counts = count("nsfw")
    eta = None
    if ss.STATE["running"] and ss.STATE["total"]:
        eta = round(seconds_per_image() * (ss.STATE["total"] - ss.STATE["index"] + 1))
    return {**ss.STATE, "comfy": alive, "counts": counts,
            "nsfw_counts": nsfw_counts, "eta": eta,
            "undo": len(ss.undo_disponible(cid))}


@router.get("/api/config", summary="config.json du personnage")
async def get_character_config(character_id: CharacterId) -> dict:
    """The character's measured settings: QC thresholds, preset, formats,
    export.

    Returned verbatim, with NO response model on purpose. CLAUDE.md §8.4 — no
    hard-coded threshold, everything is read from `config.json` through this
    API — means the frontend reads keys this layer must not get to choose. A
    model here would be a second, silently diverging copy of that file's shape.

    There is no POST counterpart: it was removed on 30/08/2026 for want of any
    caller. The Réglages screen planned by ADR-0012 writes `identity` and the
    `measured` marker, both outside that old route's allow-list — it will need
    a new write route, not this one resurrected.
    """
    return ss.cfg(character_id)


def world_brief(world_id):
    """`{id, label}` of a world, or None. Tolerant: an absent or unknown world
    does not break the header — `character()` already validated it if it was
    there."""
    if world_id and worlds.exists(world_id):
        return {"id": world_id, "label": worlds.label(world_id)}
    return None


def frozen_base_brief(cid):
    """The character's frozen identity base: present or not, under which name.

    The name comes from `config.json / base_gelee`; the bytes live in
    `ComfyUI/input/` (a `LoadImage` reads nowhere else), so OUTSIDE of PROD/.
    We only say whether the file is there — no route serves that image, and
    inventing one that reads this folder without a character_id bound would
    reopen the leak closed on 29/08/2026. The sheet therefore shows the
    initial, like the chrome (F6: base portrait, later).
    """
    try:
        name = (ss.cfg(cid) or {}).get("base_gelee") or ""
    except (OSError, ValueError):
        return {"name": None, "present": False}
    if not name:
        return {"name": None, "present": False}
    try:
        present = (base_portrait.COMFY_INPUT / name).exists()
    except OSError:
        present = False
    return {"name": name, "present": present}


@router.get("/api/character", response_model=CharacterSheet,
            summary="Fiche du personnage courant")
async def get_character(character_id: CharacterId):
    """Current character, for the header (registry J4; type + world J7bis) and
    for its SHEET (F1.2, 30/08/2026).

    The `current_character` dependency already guaranteed the character has a
    coherent character.json (real pack, (type, style) resolving to it,
    compatible world) — no extra error handling here.

    The sheet reads everything HERE, in ONE call already bound to the
    character: adding `base` and `nsfw_tool` to this response costs two
    registry reads, where a second route would have duplicated the pack
    resolution and the isolation that goes with it. Nothing new is computed —
    `edit_tool_state` is the one the Application screen already displays.
    """
    cid = character_id
    reg = lb.load_character(cid)
    uid = reg.get("universe")
    u = universe.load_universe(uid)
    return {
        "id": cid,
        "name": reg.get("name", cid),
        "type": reg.get("type") or uid,
        "world": world_brief(reg.get("world")),
        "output_style": reg.get("output_style") or "realiste",
        # `universe` = the resolved pack: machine-level information, secondary
        # in the chrome since ADR-0012 (« machine : Flux · verrou visage »).
        "universe": {"id": uid, "label": u.get("label", uid),
                     "model_family": u.get("model_family"),
                     "output_styles": universe.style_names(uid)},
        "content_types": reg.get("content_types", {}),
        "nsfw": bool(reg.get("nsfw")),
        # frozen base and edit tool: READ only, for the sheet (F1.2). Arming
        # itself is taken in a single place — the « Contenu adulte » section of
        # the Application screen (J7, ADR-0010).
        "base": frozen_base_brief(cid),
        "nsfw_tool": nsfw_batch.edit_tool_state(cid),
    }


@router.get("/api/characters", response_model=CharacterListResponse,
            summary="Registre des personnages")
async def list_characters():
    """Character registry, for the entry gate (J7bis).

    Listing only: the strict validation stays in the `current_character`
    dependency, at the moment a character is actually selected. An unreadable
    sheet is skipped rather than failing the whole list.
    """
    out = []
    for cid in lb.list_characters():
        try:
            reg = lb.load_character(cid)
        except (OSError, ValueError):
            continue
        uid = reg.get("universe")
        out.append({
            "id": cid,
            "name": reg.get("name", cid),
            "type": reg.get("type") or uid,
            "world": world_brief(reg.get("world")),
            "nsfw": bool(reg.get("nsfw")),
            "content_types": [k for k, v in (reg.get("content_types") or {}).items() if v],
            "known_universe": universe.exists(uid),
        })
    return {"characters": out}


@router.get("/api/wizard/options", response_model=WizardOptionsResponse,
            summary="Choix offerts par le wizard « nouveau personnage »")
async def get_wizard_options():
    """One entry per character type, with its styles (of the resolved pack) and
    its worlds (of the pack's model family). Everything comes from the
    registries — never a hard-coded `if` (CLAUDE.md §8.7)."""
    out = []
    for uid in universe.list_universes():
        u = universe.load_universe(uid)
        family = u.get("model_family")
        for t in universe.types(uid):
            out.append({
                "id": t,
                "label": u.get("label", t),
                "family": family,
                "styles": universe.style_names(uid),
                "worlds": [
                    {"id": w, "label": worlds.label(w), "tone": worlds.tone(w),
                     "suggested_styles": worlds.suggested_styles(w)}
                    for w in worlds.worlds_for_family(family)
                ],
            })
    return {"types": out}


@router.post("/api/characters", response_model=CreateCharacterResponse,
             summary="Créer un personnage (wizard)")
async def create_character(payload: CreateCharacterRequest):
    """Writes a new character (wizard J7bis). `base_gelee` must already have
    been produced (upload or freeze). Any invalid choice -> 400, never a
    half-written folder (`create_character` rolls back)."""
    try:
        cid = lb.create_character(
            payload.cid.strip(), payload.name.strip(),
            payload.type, payload.style, payload.world,
            payload.base_gelee.strip())
    except (ValueError, FileExistsError) as e:      # includes Unresolved/World*
        ss.bad_request(str(e))
    ss.push_log(f"personnage cree par le wizard : {cid!r}")
    return {"ok": True, "id": cid}


@router.post("/api/characters/base/upload", response_model=BaseNameResponse,
             summary="Base d'identité fournie")
async def upload_identity_base(payload: BaseUploadRequest):
    """Wizard « nouveau personnage » (J7bis) — identity base PROVIDED.

    Drops the image into ComfyUI/input/ (the only folder `LoadImage` reads) and
    returns the file name to put in config.json/base_gelee. The character does
    not exist yet; we only refuse an already-taken cid, so as not to overwrite
    an existing character's base.
    """
    cid = payload.cid.strip()
    if lb.character_dir(cid).is_dir():
        ss.bad_request(f"le personnage {cid!r} existe deja")
    try:
        name = base_portrait.save_uploaded(cid, payload.image_base64)
    except base_portrait.BaseImageError as e:
        ss.bad_request(str(e))
    ss.push_log(f"base d'identite fournie pour {cid!r} -> {name}")
    return {"ok": True, "base_gelee": name}


@router.post("/api/characters/base/generate", response_model=BaseGenerateResponse,
             summary="Base d'identité générée (verrou bypassé)")
async def generate_identity_base(payload: BaseGenerateRequest):
    """Wizard (J7bis) — identity base GENERATED: queues N base portraits
    (identity lock bypassed, no reference exists yet). Answers immediately; the
    frontend follows through /api/characters/base/candidates. GPU required."""
    try:
        out = base_portrait.generate(
            payload.cid.strip(), payload.type, payload.style,
            payload.world, n=payload.n or 4, seed=payload.seed)
    except base_portrait.BaseImageError as e:
        ss.bad_request(str(e))
    ss.push_log(f"portraits de base : {len(out['candidates'])} en file "
                f"pour {payload.cid!r} ({out['pack']})")
    return {"ok": True, **out}


@router.post("/api/characters/base/candidates", response_model=BaseCandidatesResponse,
             summary="État des portraits de base en cours")
async def get_identity_base_candidates(payload: BaseCandidatesRequest):
    """State of the base portraits in flight (pending / ready+file / error)."""
    try:
        results = base_portrait.candidates(payload.pack, payload.items)
    except base_portrait.BaseImageError as e:
        ss.bad_request(str(e))
    return {"ok": True, "results": results}


@router.get("/api/characters/base/image", response_class=Response,
            responses={200: {"content": {"image/png": {}},
                             "description": "Octets du candidat"}},
            summary="Aperçu d'un candidat de base")
async def get_identity_base_image(
        file: str = Query("", description="Chemin relatif sous ComfyUI/output/")):
    """Preview of a candidate (a file under ComfyUI/output/, path bounded)."""
    try:
        data = base_portrait.candidate_bytes(file)
    except base_portrait.BaseImageError as e:
        ss.bad_request(str(e))
    return Response(content=data, media_type="image/png")


@router.post("/api/characters/base/freeze", response_model=BaseNameResponse,
             summary="Geler le candidat choisi")
async def freeze_identity_base(payload: BaseFreezeRequest):
    """Freezes the chosen candidate -> ComfyUI/input/<CID>_BASE.<ext>. Returns
    the name to write into config.json/base_gelee."""
    cid = payload.cid.strip()
    if lb.character_dir(cid).is_dir():
        ss.bad_request(f"le personnage {cid!r} existe deja")
    try:
        name = base_portrait.freeze(cid, payload.file)
    except base_portrait.BaseImageError as e:
        ss.bad_request(str(e))
    ss.push_log(f"base d'identite generee gelee pour {cid!r} -> {name}")
    return {"ok": True, "base_gelee": name}


@router.get("/api/universe/tools", response_model=UniverseToolsResponse,
            summary="Panel d'outils de l'univers du personnage")
async def get_universe_tools(character_id: CharacterId):
    """Tool panel declared for the character's universe (tools.json, CLAUDE.md
    §5).

    Exposed since J4; the screen that consumes it arrives with the first
    dedicated tool (J5+). Here so the panel is never a hard-coded
    `if character == "lena"` the day a second character exists (§8.7)."""
    uid = lb.character_universe(character_id)
    return {"universe": uid, "tools": universe.load_tools(uid)}


@router.get("/api/journal", response_model=JournalResponse,
            summary="Journal de production du personnage")
async def get_journal(character_id: CharacterId):
    """Production journal, filtered on the requested character.

    Truncated to the last 300 rows, newest first, with no pagination — same as
    before (AUDIT §7.9). The CSV is a single file for the whole platform; the
    filter is here, because without it one of Léna's rows illustrates another
    character's image as soon as two file names collide.
    """
    path = ss.journal_path()
    if not path.exists():
        return {"rows": []}
    with open(path, encoding="utf-8", newline="") as f:
        rows = [r for r in csv.DictReader(f, delimiter=";")
                if ss.ligne_character(r) == character_id]
    return {"rows": rows[-300:][::-1]}


@router.get("/api/nsfw/state", response_model=NsfwStateResponse,
            summary="État de la branche NSFW du personnage")
async def get_nsfw_state(character_id: CharacterId):
    cid = character_id
    configuration = ss.cfg(cid)
    # `outil` carries BOTH conditions and the reason when one is missing: that
    # is what the « Contenu adulte » section of the Application screen shows,
    # and what the intensity slider follows to display its tier or not (J7).
    tool = nsfw_batch.edit_tool_state(cid)
    counts = {}
    for b in ("OK", "A_REVOIR", "REJET"):
        d = ss.bucket_dir(b, "nsfw", cid)
        counts[b] = len(list(d.glob("*.png"))) if d.exists() else 0
    # the bucket travels with the name: the source grid must be able to say
    # where each image comes from, and /img needs it to find it back
    sources = [{"name": f.name, "bucket": b}
               for f, b in nsfw_batch.sources_disponibles(configuration, cid)[:120]]
    return {"armed": tool["armed"], "outil": tool,
            "nom": lb.load_character(cid).get("name") or cid,
            "sortie": f"PROD/{cid.upper()}/_NSFW/",
            "counts": counts, "sources": sources}
