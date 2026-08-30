# -*- coding: utf-8 -*-
"""Efface de la base les lignes laissees par une fumigation navigateur.

POURQUOI CE SCRIPT EXISTE. Depuis le 30/08/2026, `/api/edit/save` inscrit la
copie editee en base, pas seulement sur le disque. Or `/api/delete` ne retire
JAMAIS une ligne : c'est une decision, pas un oubli (voir sa docstring — une
ligne qui pointe vers un fichier disparu reste un fait vrai, l'image a existe
et a ete mesuree). Les deux ensemble laissaient donc, apres
`test_application_suppression_editeur.js`, une ligne `_TEST_EDITEUR_temp_edit`
sans fichier, sans journal et sans mesure — exactement ce que
`test_coherence_base.py` [4] appelle une ecriture parasite, et il avait raison
de le dire : la suite navigateur rendait rouge un test qui passait avant elle.

C'est donc au TEST de nettoyer derriere lui, cote base comme il le faisait deja
cote disque. Rien ici ne s'ajoute a l'application : le code de production ne
gagne aucun moyen d'effacer une ligne, et n'en veut pas.

GARDE-FOU. Seuls les prefixes commencant par `_TEST_` sont acceptes. Aucune
image de production ne porte ce nom (SAFE_NAME l'autorise, la nomenclature du
runner ne le produit jamais), et un appel qui viserait plus large s'arrete ici
plutot que de le decouvrir apres coup.

Lancer :  python AUTOMATION/tests/nettoyer_artefacts_test.py _TEST_EDITEUR_temp

N'importe quel interprete convient : sqlite3 est dans la bibliotheque standard,
rien de ce fichier ne touche au GPU.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import base  # noqa: E402

PREFIXE_AUTORISE = "_TEST_"
DEFAUT = ("_TEST_EDITEUR_temp",)


def nettoyer(prefixes):
    """Supprime les lignes `image` dont le nom commence par un des prefixes.

    Le filtrage se fait en Python, pas en `LIKE` : `_` est un joker SQL, et
    `LIKE '_TEST_%'` matcherait aussi bien `XTESTY...`. Les tables `score`,
    `jugement`, `embedding` et `reference_member` suivent par ON DELETE CASCADE.
    """
    with base.ouvrir() as cx:
        lignes = [(r["id"], r["fichier"]) for r in
                  cx.execute("SELECT id, fichier FROM image").fetchall()
                  if r["fichier"].startswith(tuple(prefixes))]
        for image_id, _ in lignes:
            cx.execute("DELETE FROM image WHERE id = ?", (image_id,))
        cx.commit()
    return [nom for _, nom in lignes]


def main(argv):
    prefixes = tuple(argv[1:]) or DEFAUT
    hors_garde = [p for p in prefixes if not p.startswith(PREFIXE_AUTORISE)]
    if hors_garde:
        print(f"REFUSE : prefixe hors garde-fou {PREFIXE_AUTORISE!r} : "
              f"{', '.join(hors_garde)}", file=sys.stderr)
        return 2
    effaces = nettoyer(prefixes)
    print(f"{len(effaces)} ligne(s) de test effacee(s) en base"
          + (f" : {', '.join(effaces)}" if effaces else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
