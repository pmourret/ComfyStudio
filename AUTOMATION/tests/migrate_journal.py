"""Migration one-shot du journal : ajoute les colonnes `intensite` et `ton`.

    python_embeded\\python.exe ComfyUI\\output\\OFM\\AUTOMATION\\tests\\migrate_journal.py

`append_log` n'ecrit son en-tete qu'a la creation du fichier : ajouter des colonnes
sans reecrire l'existant desaligne le CSV (les anciennes lignes auraient 13 champs
pour un en-tete de 15). Ce script relit toutes les lignes par nom de colonne, les
reecrit dans le nouvel ordre et laisse vides les colonnes inconnues des anciennes
lignes. Idempotent : relancable sans risque, il ne fait rien si c'est deja fait.
Une sauvegarde .bak est ecrite avant toute reecriture.
"""
import csv
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import runner as lb      # noqa: E402

JOURNAL = OFM / "PROD" / "journal_batch.csv"


def main():
    if not JOURNAL.exists():
        print(f"{JOURNAL} n'existe pas encore — rien a migrer.")
        return 0

    with open(JOURNAL, encoding="utf-8", newline="") as f:
        lecteur = csv.DictReader(f, delimiter=";")
        anciennes = lecteur.fieldnames or []
        lignes = list(lecteur)

    if anciennes == lb.JOURNAL_COLS:
        print(f"deja au bon format ({len(lignes)} ligne(s)) — rien a faire.")
        return 0

    inconnues = [c for c in anciennes if c and c not in lb.JOURNAL_COLS]
    if inconnues:
        print(f"!! colonnes presentes dans le fichier et absentes du nouveau format : "
              f"{inconnues}\n   migration interrompue pour ne rien perdre.")
        return 1

    backup = JOURNAL.with_suffix(".csv.bak")
    shutil.copy(JOURNAL, backup)

    with open(JOURNAL, "w", encoding="utf-8", newline="") as f:
        wr = csv.writer(f, delimiter=";")
        wr.writerow(lb.JOURNAL_COLS)
        for ligne in lignes:
            wr.writerow([ligne.get(c, "") or "" for c in lb.JOURNAL_COLS])

    ajoutees = [c for c in lb.JOURNAL_COLS if c not in anciennes]
    print(f"{len(lignes)} ligne(s) migrees.")
    print(f"colonnes ajoutees : {ajoutees}")
    print(f"sauvegarde : {backup}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
