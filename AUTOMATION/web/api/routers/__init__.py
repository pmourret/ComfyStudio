"""One router per functional module (.claude/rules/backend.md, AUDIT §1.1):

    state       ex routes/etat       system state, registries, character sheet
    app         (split off state)    lifecycle of this server and of ComfyUI
    bank        ex routes/banque     scene bank, creative taxonomy, composer
    images      ex routes/vignettes  image bytes, thumbnails, poses
    production  ex routes/production launching, job queue, declensions
    review      ex routes/tri        QC, review, judgements, export

The five-way split was kept through the FastAPI migration. `app` was cut out of
`state` on 31/08/2026: reading what the studio is doing and ACTING on the two
processes are not the same responsibility, and every route of the second kind is
destructive. `api/main.py` registers them all.

The rules these routers apply live one layer down, in `api/services/` — a router
reads the request, calls a service, and turns what comes back into a status
code.
"""
