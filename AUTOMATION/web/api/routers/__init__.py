"""One router per functional module — the same five-way split as before the
migration (.claude/rules/backend.md, AUDIT §1.1):

    state       ex routes/etat       system state, registries, lifecycle
    bank        ex routes/banque     scene bank, creative taxonomy, composer
    images      ex routes/vignettes  image bytes, thumbnails, poses
    production  ex routes/production launching, job queue, declensions
    review      ex routes/tri        QC, review, judgements, export

The split was kept as-is: the audit found no reason to merge or split any of
them, and each module still holds exactly one responsibility. `api/main.py`
registers them all.
"""
