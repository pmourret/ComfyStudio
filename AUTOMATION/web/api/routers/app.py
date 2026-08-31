"""Lifecycle of the two processes: this server, and ComfyUI.

The « Application » screen, distinct from the generation settings panel (the ⚙
of the Créer screen): here we drive the PROCESSES, not a production. Explicit
actions only, never automatic — nothing on this router runs unless someone
clicked.

    /api/app/stop           stops THIS web server
    /api/app/restart        re-executes it (os.execv: same PID, same window)
    /api/app/comfy/stop     stops ComfyUI
    /api/app/comfy/stats    VRAM / model loaded, behind a 1.5 s cache
    /api/app/comfy/unload   frees the VRAM without stopping ComfyUI
    /api/app/comfy/restart  stop then ensure

WHY IT LEFT routers/state.py. That module answers « what is the studio doing »
— state, registries, character sheet, journal: reads, replayed by pollers. This
one ACTS on the machine, and every route here is destructive to some degree.
Two responsibilities, two modules (.claude/rules/backend.md).

Each of these routes ANSWERS BEFORE ACTING (`asyncio.create_task` then a short
sleep): stopping or re-executing the process before the response has left means
the browser never learns the click worked.
"""
import asyncio
import os
import sys
import time

from fastapi import APIRouter, Response

import comfy_server
import shared_state as ss

from ..dependencies import CharacterId
from ..schemas.common import ActionResponse, ERROR_RESPONSES
from ..schemas.state import ComfyStatsResponse

router = APIRouter(responses=ERROR_RESPONSES)

@router.post("/api/app/stop", response_model=ActionResponse, response_model_exclude_unset=True,
             summary="Arrêter le tableau de bord")
async def stop_dashboard():
    """Stops THIS web server. Answers first, exits after — otherwise the
    browser never receives the confirmation."""
    ss.push_log("arrêt du tableau de bord demandé depuis l'interface")

    async def _exit():
        await asyncio.sleep(0.3)
        os._exit(0)

    asyncio.create_task(_exit())
    return {"ok": True}


@router.post("/api/app/restart", response_model=ActionResponse, response_model_exclude_unset=True,
             summary="Redémarrer le tableau de bord")
async def restart_dashboard():
    """Restarts THIS server (os.execv): same process ID, same window, code and
    config re-read cold. A real restart, not a data reload — the only way to
    pick up a code change without going back to run_web.bat by hand.

    Survives the move to uvicorn because web/app.py is still the entry point:
    `sys.argv` is its own, so re-executing it relaunches the same command line.
    """
    ss.push_log("redémarrage du tableau de bord demandé depuis l'interface")

    async def _restart():
        await asyncio.sleep(0.3)
        os.execv(sys.executable, [sys.executable] + sys.argv)

    asyncio.create_task(_restart())
    return {"ok": True}


@router.post("/api/app/comfy/stop", response_model=ActionResponse, response_model_exclude_unset=True,
             responses={409: {"description": "ComfyUI ne tournait pas"}},
             summary="Arrêter ComfyUI")
async def stop_comfy(response: Response):
    stopped = await asyncio.get_running_loop().run_in_executor(None, comfy_server.stop)
    if not stopped:
        response.status_code = 409
        return {"ok": False, "erreur": "ComfyUI n'était pas en cours"}
    ss.push_log("ComfyUI arrêté depuis l'interface")
    return {"ok": True}


# Short cache, same reasoning as `comfy_alive`: two blocking probes (HTTP to
# ComfyUI + an nvidia-smi subprocess) behind a banner present on every screen.
# Without it, several open tabs would multiply the spawns.
_STATS = {"at": 0.0, "val": None}
_STATS_TTL = 1.5
_STATS_LOCK = None          # created lazily: it needs a running loop


@router.get("/api/app/comfy/stats", response_model=ComfyStatsResponse,
            summary="RAM / VRAM / thermique")
async def get_comfy_stats(character_id: CharacterId):
    """Machine memory and thermals, for the banner and the Application screen.

    Both probes go into a THREAD: `comfy_alive` cost a 2005 ms event-loop
    freeze on 24/08 for having probed while blocking, and we are not replaying
    that. The result is kept for a second and a half.

    TWO TRAPS, both observed on 30/08 with ComfyUI stopped — the case where the
    probe is SLOW (urlopen waiting on a dead port, ~2 s):

      1. The timestamp is set AFTER the work, not before. Stamped at the start
         of the request, a probe longer than the TTL made the cache stale at
         birth: it NEVER served anything again, and every call re-ran
         nvidia-smi and the wait. Measured: 2087 ms on a call meant to come out
         of the cache.
      2. A lock, otherwise two concurrent calls both do the work. The second
         waits for the first and reads its result.
    """
    global _STATS_LOCK
    if _STATS_LOCK is None:
        _STATS_LOCK = asyncio.Lock()
    if _STATS["val"] is not None and time.monotonic() - _STATS["at"] < _STATS_TTL:
        return _STATS["val"]
    url = ss.cfg(character_id)["comfy_url"]
    async with _STATS_LOCK:
        # re-read under the lock: another call may have served during the wait
        if _STATS["val"] is not None and time.monotonic() - _STATS["at"] < _STATS_TTL:
            return _STATS["val"]
        val = await asyncio.get_running_loop().run_in_executor(
            None, comfy_server.stats, url)
        _STATS.update(at=time.monotonic(), val=val)
    return val


@router.post("/api/app/comfy/unload", response_model=ActionResponse, response_model_exclude_unset=True,
             responses={409: {"description": "Une production est en cours"},
                        502: {"description": "Le déchargement a échoué"}},
             summary="Décharger la VRAM")
async def unload_comfy(response: Response, character_id: CharacterId):
    """Unloads models and VRAM. Explicit gesture, never automatic.

    Refused during a batch: unloading under a running job would make it fail,
    and the user would lose a production to gain some VRAM.
    """
    if ss.STATE["running"]:
        response.status_code = 409
        return {"ok": False,
                "erreur": "une production est en cours — "
                          "décharger la mémoire la ferait échouer"}
    url = ss.cfg(character_id)["comfy_url"]
    ok, err = await asyncio.get_running_loop().run_in_executor(
        None, comfy_server.unload, url)
    if not ok:
        response.status_code = 502
        return {"ok": False, "erreur": err or "échec"}
    _STATS["val"] = None                      # the next probe must see the effect
    ss.push_log("mémoire ComfyUI déchargée depuis l'interface")
    return {"ok": True}


@router.post("/api/app/comfy/restart", response_model=ActionResponse, response_model_exclude_unset=True,
             summary="Redémarrer ComfyUI")
async def restart_comfy():
    """Stops then restarts ComfyUI. Fire-and-forget: the recovery already shows
    on the header's green dot (it polls /api/state in a loop), no need for one
    more dedicated state to maintain."""
    ss.push_log("redémarrage de ComfyUI demandé depuis l'interface")

    async def _cycle():
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, comfy_server.stop)
        await asyncio.sleep(1)
        try:
            await loop.run_in_executor(
                None, lambda: comfy_server.ensure(ss.cfg()["comfy_url"], log=ss.push_log))
        except Exception as e:
            ss.push_log(f"redémarrage de ComfyUI : {type(e).__name__} — {e}")

    asyncio.create_task(_cycle())
    return {"ok": True}
