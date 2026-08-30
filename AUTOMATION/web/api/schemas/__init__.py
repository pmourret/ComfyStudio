"""Pydantic models, one per payload shape actually exchanged.

No catch-all model: the migration brief asks for a schema per real shape, and a
generic one would document nothing. The shapes are those inventoried in
AUDIT §5.4.

TWO RULES THAT RUN THROUGH ALL OF THEM.

1. `extra="allow"` on every response model that carries pass-through data —
   config.json, a creative.json tier, a journal row, the STATE dict. Those come
   from files this layer does not own, and a response_model that dropped an
   unknown key would silently change the contract the frontend reads. The
   models name what is guaranteed; they never truncate what is there.

2. NO `ge`/`le` CONSTRAINTS ON THE NUMBERS THAT USED TO BE CLAMPED. `count=9999`
   must still answer 200 with a plan of 24 images, not a rejection — the server
   bounds are a clamp, not a validation (`entier()` in routers/production.py,
   and the [M9] case of test_serveur_http.py). Declaring `le=24` here would turn
   a working request into a 400.
"""
