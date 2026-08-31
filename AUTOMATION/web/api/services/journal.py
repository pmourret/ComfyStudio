"""Bookkeeping of a sort: the database row, the export, the NSFW journal.

Moving a file between buckets is three gestures, and only the first one is
visible. The other two are here, because each has already been got wrong once:

  - THE DATABASE ROW must carry the RIGHT character. Both `base.py` calls
    default to 'lena' (J2 compatibility), so sorting another character's image
    used to write a `character_id='lena'` row into the single shared database.
    It stayed clean only because nobody had yet sorted another character from
    the Review. `character_id` is mandatory here, always.
  - THE EXPORT is looked up under the name the image is RECORDED under in the
    journal, which a collision rename separates from the file's own name.
    Reading the journal with the final name returned an empty row — hence
    `categorie = divers`, `format = 4:5`, an export in the wrong folder and a
    9:16 image resized to 1080x1350.
  - TAKING AN IMAGE OUT of publication sweeps THIS character's export folder
    only: an rglob over all of PROD/EXPORT/ deleted another character's
    homonymous file along with it (`nom_libre` only guarantees uniqueness
    inside one PROD/<CID>/ tree).

None of this may ever make a sort fail: when these run, the file has already
moved on disk. They log and carry on.
"""
import csv
from pathlib import Path

import nsfw_batch
import shared_state as ss


def nsfw_journal_index(character_id):
    """Journal of the NSFW branch. No `character` column: it is already
    specific to one character through its path
    (PROD/<CID>/_NSFW/journal_nsfw.csv)."""
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


def record_bucket(name, bucket, space, character_id, previous_name=None, **fields):
    """Reports the HUMAN SORT into the database, on the RIGHT character's row.

    `image.bucket` used to be written only at generation time, with the QC's
    verdict. But `base.stats_par_scene` counts `WHERE bucket = 'OK'`: the
    « n produites · ok » badge of the scene cards therefore showed the automatic
    verdict and knew nothing of the sort. An image rejected by hand still
    counted as validated.

    `character_id` is mandatory: both database calls default to 'lena'
    (base.py, J2 compatibility). Sorting another character's image from the
    Review therefore wrote a character_id='lena' row into the single database —
    which stayed clean only because nobody had yet sorted another character
    from the interface.

    `fields` is passed through to `base.enregistrer_image`: a file that ARRIVES
    in a bucket without going through a generation (the editor's `_edit` copy)
    has no other occasion to register itself, and must be able to set its
    `source` at the same moment as its bucket.

    Must never make a sort fail: the file itself has already moved.
    """
    try:
        import base as db
        with db.ouvrir() as cx:
            if previous_name and previous_name != name:
                db.renommer(cx, previous_name, name, character_id=character_id)
            db.enregistrer_image(cx, name, character_id=character_id,
                                 bucket=bucket, espace=ss.espace_db(space),
                                 **fields)
            cx.commit()
    except Exception as e:
        ss.push_log(f"base : bucket non mis a jour pour {name} — "
                    f"{type(e).__name__} : {e}")


def export_image(src, journal_name, space, character_id):
    """Produces the publishable JPEG. Returns its name, or "" if nothing was
    written.

    `journal_name` is the name the image is RECORDED UNDER IN THE JOURNAL, not
    necessarily the file's: a collision rename separates the two. Re-reading the
    journal with the final name returned an empty row, hence
    `categorie = divers` and `format = 4:5` by default — the export went to the
    wrong folder and a 9:16 image ended up resized to 1080x1350.
    """
    if ss.space_id(space) == "nsfw":       # the NSFW branch never exports
        return ""
    row = ss.journal_index(character_id).get(journal_name, {})
    configuration = ss.cfg(character_id)
    fmt = row.get("format") or "4:5"
    category = row.get("categorie") or "divers"
    try:
        from PIL import Image
        exp_dir = ss.export_dir(character_id) / category
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


def remove_export(name, character_id):
    """Takes an image out of publication. Returns how many files were removed.

    Sweeps the character's export folder ONLY: an `rglob` over the whole
    PROD/EXPORT/ deleted another character's homonymous export along with this
    one (two characters can produce the same file name — `nom_libre` only
    guarantees uniqueness inside one PROD/<CID>/ tree).
    """
    removed = 0
    for f in ss.export_dir(character_id).rglob(Path(name).stem + ".*"):
        f.unlink(missing_ok=True)
        removed += 1
    return removed
