"""Rules of the creative tiers — what a level ALLOWS, and at what cost.

Everything here reads `creative.json` through `lb.load_creative` /
`lb.by_level` and answers one question: given the requested level, what does
the server let through, and how must the configuration be bent before the
runner sees it.

WHY IT IS NOT IN THE RUNNER. `lb.execute_jobs` has no business knowing about
intensity tiers (§8.2: one execution core, and it stays generic). The tier is a
POLICY read above it: the guard refuses, the export rule cuts, the two-pass
chaining rewrites the level — then the runner is handed a plain configuration
it can execute without knowing why.

WHY IT IS NOT IN THE ROUTER EITHER. Three routes apply these rules
(/api/plan, /api/run, /api/decline) and the batch service applies them again
on the second pass. A rule that lives in one route ends up half-applied by the
others — which is exactly how, on 24/08/2026, level 2 images were landing in
PROD/EXPORT.

The messages returned are French: they are displayed as-is.
"""
import nsfw_batch
import runner as lb
import shared_state as ss


def edit_tier(creative):
    """The tier that edits an image instead of generating one, if it exists."""
    return next((p for p in creative.get("intensity", [])
                 if p.get("pipeline") == "flux+edit"), None)


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


def apply_export_rule(configuration, requested_level, character):
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


def payload_at_generation_level(payload, character):
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
