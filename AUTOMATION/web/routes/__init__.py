"""MIGRATION EN COURS — ce paquet est en train de disparaitre.

Les modules qui restent ici sont l'ancienne implementation aiohttp, plus
enregistree nulle part : web/app.py sert desormais l'application FastAPI de
`api/`. Chaque module s'en va dans le commit qui le migre vers
`api/routers/`. Ne rien ajouter ici.

    routes/etat.py       -> api/routers/state.py     (migre)
    routes/banque.py     -> api/routers/bank.py
    routes/vignettes.py  -> api/routers/images.py
    routes/production.py -> api/routers/production.py
    routes/tri.py        -> api/routers/review.py
"""
