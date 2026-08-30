# -*- coding: utf-8 -*-
"""Portable Node toolchain for the React frontend.

WHY THIS FILE EXISTS. npm, npx and Playwright all default to per-user caches
under %LOCALAPPDATA% / %APPDATA%. This project must stay PORTABLE: everything it
downloads lives in the repository directory, so moving the folder moves the
whole studio with it. That is a project constraint, not a preference — hence a
single entry point that pins every cache to `<repo>/.toolchain/` before handing
over to npm.

    python AUTOMATION/tools/toolchain.py install       # deps for web/ui
    python AUTOMATION/tools/toolchain.py build         # production bundle
    python AUTOMATION/tools/toolchain.py dev           # Vite dev server
    python AUTOMATION/tools/toolchain.py browsers      # Playwright chromium
    python AUTOMATION/tools/toolchain.py types         # OpenAPI -> TypeScript
    python AUTOMATION/tools/toolchain.py npm <args...> # anything else

Node itself is NOT installed by this script — it is the one prerequisite the
developer brings. A future launcher will provision it; until then `node
--version` must answer.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
UI = REPO / "AUTOMATION" / "web" / "ui"
TOOLCHAIN = REPO / ".toolchain"

MIN_NODE = 20


def portable_env():
    """Environment that keeps every download inside the repository.

    `npm_config_*` variables beat any .npmrc, whatever directory npm is invoked
    from — a relative `cache=` in .npmrc would resolve against the caller's cwd,
    which is exactly the kind of thing that silently starts writing to AppData
    again.
    """
    env = dict(os.environ)
    env["npm_config_cache"] = str(TOOLCHAIN / "npm-cache")
    env["npm_config_update_notifier"] = "false"
    env["npm_config_fund"] = "false"
    env["npm_config_audit"] = "false"
    # Playwright downloads ~150 MB of browser per install; without this it lands
    # in %LOCALAPPDATA%\ms-playwright. The browser test runner reads the same
    # variable, so both halves agree on one location.
    env["PLAYWRIGHT_BROWSERS_PATH"] = str(TOOLCHAIN / "playwright-browsers")
    return env


def require_node():
    if shutil.which("node") is None:
        sys.exit("!! node introuvable. Installer Node.js 20+ et relancer.\n"
                 "   (le lanceur s'en chargera plus tard ; pour l'instant c'est "
                 "le seul prerequis manuel)")
    out = subprocess.run(["node", "--version"], capture_output=True, text=True)
    major = int(out.stdout.strip().lstrip("v").split(".")[0] or 0)
    if major < MIN_NODE:
        sys.exit(f"!! Node {out.stdout.strip()} : Vite 7 demande Node {MIN_NODE}+.")


def npm(args, cwd=UI):
    require_node()
    TOOLCHAIN.mkdir(exist_ok=True)
    # shell=True on Windows: npm is npm.cmd, which CreateProcess will not run.
    cmd = "npm " + " ".join(args)
    return subprocess.call(cmd, cwd=str(cwd), env=portable_env(), shell=True)


def regenerate_types():
    """Re-derive the frontend types from the live FastAPI schema.

    Two steps that must not drift apart: dump the OpenAPI document, then feed it
    to openapi-typescript. Both outputs are COMMITTED — they are the API contract
    as of that revision, so a change to a Pydantic model shows up as a diff in
    the frontend instead of as a runtime surprise, and a fresh clone can build
    without a Python round-trip.
    """
    code = subprocess.call([sys.executable, str(Path(__file__).with_name("dump_openapi.py"))])
    if code:
        return code
    return npm(["run", "types"])


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    verb, rest = sys.argv[1], sys.argv[2:]
    if verb == "types":
        sys.exit(regenerate_types())
    table = {
        "install": ["install"],
        "build": ["run", "build"],
        "dev": ["run", "dev"],
        "typecheck": ["run", "typecheck"],
        "browsers": ["exec", "--", "playwright", "install", "chromium"],
    }
    if verb == "npm":
        code = npm(rest)
    elif verb in table:
        code = npm(table[verb] + rest)
    else:
        sys.exit(f"verbe inconnu : {verb}\n{__doc__}")
    sys.exit(code)


if __name__ == "__main__":
    main()
