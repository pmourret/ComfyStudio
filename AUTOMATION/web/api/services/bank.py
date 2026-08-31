"""Rules of the scene bank: what a save may contain, and what it may lose.

THE HEART IS `validate_scene_bank`, and it did not move an inch. It is
imperative, it returns French sentences, and each of its rules carries a dated
incident. Turning it into a declarative Pydantic model was tempting and would
have been wrong — it validates a FILE that belongs to the character, not a
request payload, and it is also called with the PREVIOUS version of that file
to compare the two.

That comparison is the point: the 25/08/2026 regression was not a malformed
scene, it was sixteen well-formed scenes quietly stripped of their creative
keys in a single save. Losing one scene's metadata is an edit; losing them in
a batch never is.

The rest is what the Créer screen's cards read (`scene_stats`,
`scene_previews`), the rotating backup that makes a bad save recoverable, and
the sort key that stopped an unmigrated bank from coming out as a 400
(`category_order`).

No HTTP here: the router catches the returned problems and decides the status.
"""
import shutil

import pose_tools
import shared_state as ss


KNOWN_FORMATS = ("4:5", "2:3", "9:16", "1:1")
# Keys carrying the creative journey. They are not mandatory — an unmigrated
# bank has none — but a BATCH of scenes losing them at once is never an
# intention: it is the signature of the 25/08/2026 regression, where a
# frontend-side rebuild wiped them from all 16 scenes in a single save.
# See DOCS/revue-web-2026-08-25.md.
WATCHED_KEYS = ("intention", "intensity", "tags", "tones", "wardrobe", "pose")

# Where a scene comes from (ADR-0014 §3). It keeps nothing, it EXPLAINS: a bank
# of twenty scenes where nobody remembers which ones came from the world's
# starter set is unreadable in Réglages.
KNOWN_ORIGINS = ("world", "manual", "compose")


def validate_scene_bank(data, previous=None, allow_losses=False, world=None):
    """Returns the list of a scene bank's problems. Empty list = good.

    What we refuse here is what would break production later and for no
    apparent reason: a missing `prefix`/`texture` makes `build_jobs` raise a
    KeyError, so a 500 on every plan, very far from the save that caused it.

    `world` is the character's world, frozen at birth (ADR-0012 §4). Passed in,
    it turns on the checks of ADR-0014 §4: the bank belongs to that world, and
    so does every scene in it. Left at None the shape checks run alone — that is
    how a caller with no character context (a script, a unit test on the shape)
    uses this function; the HTTP route ALWAYS passes it.
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

    problems += _world_problems(data, scenes, previous, world)

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


def _world_problems(data, scenes, previous, world):
    """The world lock of ADR-0014 §4. Empty list when `world` is None.

    A scene is a composition INSIDE a world; the world is frozen at the
    character's creation, so it is frozen for every scene of that character.
    Nothing here repairs a wrong stamp — a foreign world means assets that were
    never measured for this face, and silently rewriting it would hide exactly
    what we want to see.

    One tolerance, and it is named: a scene BORN in this save (absent from the
    previous version) may arrive without a stamp — the Dashboard builds it in
    the browser. `stamp_world()` writes its world before the file is persisted.
    A scene that already existed and LOST its stamp is refused, like any other
    batch erasure.
    """
    if not world:
        return []
    problems = []
    root = data.get("world")
    if not root:
        problems.append("« world » manquant à la racine de la banque — une "
                        f"banque appartient à un monde, ici « {world} » "
                        "(lancer AUTOMATION/tests/migrate_scenes_world.py)")
    elif root != world:
        problems.append(f"la banque déclare le monde « {root} », mais le "
                        f"personnage vit dans « {world} » — le monde est figé à "
                        "la création, une banque ne change pas de monde")

    known = ({s.get("id") for s in previous.get("scenes", []) if isinstance(s, dict)}
             if previous else set())
    for i, s in enumerate(scenes):
        if not isinstance(s, dict):
            continue                      # already reported by the shape checks
        sid = str(s.get("id") or "").strip()
        where = sid or f"scène #{i + 1}"
        w = s.get("world")
        if w and w != world:
            problems.append(f"{where} : cette scène appartient au monde "
                            f"« {w} », le personnage vit dans « {world} » — "
                            "une scène ne se recopie pas d'un monde à l'autre")
        elif not w and (not previous or sid in known):
            problems.append(f"{where} : « world » manquant — chaque scène "
                            f"déclare son monde, ici « {world} »")
        origin = s.get("origin")
        if origin is not None and origin not in KNOWN_ORIGINS:
            problems.append(f"{where} : origine inconnue « {origin} » — "
                            f"attendu : {', '.join(KNOWN_ORIGINS)}")
    return problems


def stamp_world(data, world):
    """Stamps the bank with the character's world, in place, before writing.

    Only fills what is ABSENT — validation has already refused every foreign
    stamp, so there is nothing here to overwrite. What it does fill is the scene
    born in this save: the interface builds it in the browser and cannot know
    the world. It reaches disk stamped, which is what lets the next save be
    strict (ADR-0014 §4).
    """
    if not world:
        return data
    data.setdefault("world", world)
    for s in data.get("scenes", []):
        if isinstance(s, dict):
            s.setdefault("world", world)
            s.setdefault("origin", "manual")
    return data


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


def category_order(category):
    """Sort key for the bank's intentions, tolerant of a missing one.

    `lb.scene_intention()` returns None for a scene that declares neither
    `intention` nor `category` — an unmigrated bank, or one written by hand.
    A bare `sorted()` over a set holding both None and strings raises
    `TypeError: '<' not supported between instances of 'str' and 'NoneType'`,
    and the WHOLE bank came out as a 400 — the error handler catches TypeError —
    far from the scene that caused it. The Créer screen then had no scenes, no
    cards and no taxonomy at all.

    Two-part key so the fix changes ONLY the case that crashed:
      - scenes that HAVE an intention keep exactly their previous order, since
        they all share the same first component and fall back to comparing the
        strings, as `sorted()` did;
      - the absent one sorts last, once, and is emitted as `null` — which is
        what `/api/scenes` already returned in `meta[].intention` and what
        `SceneBankResponse.categories` already declares.

    Found while migrating to FastAPI (30/08/2026): the response model made it
    visible, but the bug predates the migration — `routes/banque.py` had the
    same line.
    """
    return (category is None, category or "")
