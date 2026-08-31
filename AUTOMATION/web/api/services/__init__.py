"""Business logic the routers used to carry inline.

WHY THIS LAYER EXISTS. The J2 split gave one router per responsibility, but the
routers kept the rules inside them: tier locks, batch orchestration, bank
validation, export bookkeeping. Two costs, both paid in production:

  - a rule could only be reached by importing a FastAPI module. `test_valider_
    banque.py` imports `api.routers.bank` to test a pure function that has
    nothing to do with HTTP;
  - `routers/production.py` reached 910 lines, of which ~250 were actual
    routes.

THE DEPENDENCY RULE, IN ONE LINE:

    routers  ->  services  ->  runner / base / shared_state

and never the other way. A service NEVER imports a router, and never imports
`fastapi`: it raises through `ss.bad_request()` like the rest of the backend,
and returns plain Python. Pydantic models may cross into it (they are the shape
of the payload, not a transport), FastAPI may not.

WHAT DOES NOT LIVE HERE. The execution core (`runner/`), the identity
mechanisms (`identity/`), the database (`base.py`): those are the domain and
knew nothing of the web before this layer existed. Services sit BETWEEN the
routes and that core — they arbitrate, they do not compute.

`shared_state.py` stays where it is: `STATE`, `UNDO` and the cached identity
checker are process globals of the single uvicorn worker, and a service reads
them through the module object (`ss.STATE`), never by importing the name.
"""
