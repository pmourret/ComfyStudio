"""Point d'entree CLI du runner batch. Delegue a AUTOMATION/runner/cli.py.

Necessaire car un fichier a l'interieur d'un paquet (runner/cli.py) ne peut
pas etre execute directement comme script : ses imports relatifs (`from . import
...`) exigent que Python le voie comme un sous-module de `runner`, pas comme
le module `__main__`. Ce lanceur, lui, est un script ordinaire.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from runner.cli import main

if __name__ == "__main__":
    sys.exit(main())
