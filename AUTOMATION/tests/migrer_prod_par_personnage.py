"""Migration one-shot : PROD/ passe d'un arbre unique a un arbre par personnage.

    python.exe AUTOMATION\\tests\\migrer_prod_par_personnage.py

Avant, deux dispositions coexistaient et melangeaient les personnages :

    PROD/LENA/<bucket>/        SFW de Lena          (deja par personnage, J2)
    PROD/_NSFW/<bucket>/       NSFW de TOUT LE MONDE
    PROD/EXPORT/<categorie>/   export ecrit par la route de tri, sans personnage
    PROD/EXPORT/<cid>/<cat>/   export ecrit par le runner, avec personnage
    PROD/journal_batch.csv     une ligne par image, sans colonne `character`

Apres :

    PROD/<CID>/<bucket>/         SFW
    PROD/<CID>/_NSFW/<bucket>/   NSFW
    PROD/EXPORT/<cid>/<cat>/     export, une seule disposition
    PROD/journal_batch.csv       + colonne `character`

Les chemins SFW de Lena ne bougent pas d'un octet (PROD/LENA/ etait deja son
arbre). Les vignettes ne sont PAS migrees : `.thumbs` est un cache que
`purger_vignettes()` balaie au demarrage des que sa profondeur change, il se
refait tout seul.

Idempotent : relancable sans risque, chaque etape ne fait rien si elle est
deja faite. Ne perd jamais un fichier — une collision de nom fait ECHOUER
l'etape avec le detail, elle n'ecrase rien.
"""
import csv
import shutil
import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import runner as lb      # noqa: E402

PROD = OFM / "PROD"
JOURNAL = PROD / "journal_batch.csv"
BASE = PROD / "soulglade.db"

# Le NSFW global etait, de fait, celui de Lena : elle est le seul personnage a
# avoir produit avant que l'arbre par personnage existe (J6). Ecrit ici plutot
# que devine : c'est un fait historique de CE disque, pas une regle de code.
PROPRIETAIRE_HISTORIQUE = "lena"


def deplacer(src, dest):
    """Deplace un fichier ou un dossier, sans jamais ecraser. Rend 1."""
    if dest.exists():
        raise FileExistsError(f"{dest} existe deja — collision, rien n'est ecrase")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))
    return 1


def fusionner(src_dir, dest_dir):
    """Verse le contenu de src_dir dans dest_dir. Rend le nombre d'entrees."""
    n = 0
    for entree in sorted(src_dir.iterdir()):
        n += deplacer(entree, dest_dir / entree.name)
    return n


# ------------------------------------------------------------------- etape 1
def etape_nsfw():
    """PROD/_NSFW/ -> PROD/LENA/_NSFW/."""
    src = PROD / "_NSFW"
    dest = PROD / PROPRIETAIRE_HISTORIQUE.upper() / "_NSFW"
    if not src.exists():
        print("  [1] NSFW : deja migre (pas de PROD/_NSFW/)")
        return 0
    if not dest.exists():
        deplacer(src, dest)
        print(f"  [1] NSFW : PROD/_NSFW/ -> {dest.relative_to(OFM)}/ (arbre entier)")
        return 1
    n = fusionner(src, dest)
    if not any(src.iterdir()):
        src.rmdir()
    print(f"  [1] NSFW : {n} entree(s) versee(s) dans {dest.relative_to(OFM)}/")
    return n


# ------------------------------------------------------------------- etape 2
def etape_export():
    """PROD/EXPORT/<categorie>/ -> PROD/EXPORT/<proprietaire>/<categorie>/.

    Est une categorie heritee tout dossier de premier niveau qui n'est pas un
    personnage du registre : la disposition par personnage est la cible, celle
    par categorie est l'ancienne.
    """
    racine = PROD / "EXPORT"
    if not racine.exists():
        print("  [2] export : rien a migrer (pas de PROD/EXPORT/)")
        return 0
    connus = set(lb.list_characters())
    heritees = [d for d in sorted(racine.iterdir())
                if d.is_dir() and d.name not in connus]
    if not heritees:
        print("  [2] export : deja migre (une seule disposition)")
        return 0
    dest = racine / PROPRIETAIRE_HISTORIQUE
    n = 0
    for cat in heritees:
        cible = dest / cat.name
        if cible.exists():
            n += fusionner(cat, cible)
            if not any(cat.iterdir()):
                cat.rmdir()
        else:
            n += deplacer(cat, cible)
    print(f"  [2] export : {len(heritees)} categorie(s) sous "
          f"EXPORT/{PROPRIETAIRE_HISTORIQUE}/ ({n} entree(s))")
    return n


# ------------------------------------------------------------------- etape 3
def proprietaires_connus():
    """{fichier: character_id} d'apres la base — le seul oracle fiable.

    La base est deja partitionnee (colonne `character_id`, J2) : c'est elle qui
    sait a qui appartient chaque ligne du journal. Stamper 'lena' en aveugle
    serait faux, des lignes d'un autre personnage sont deja dans le CSV.
    """
    if not BASE.exists():
        return {}
    cx = sqlite3.connect(BASE)
    try:
        return {f: c for f, c in cx.execute(
            "SELECT fichier, character_id FROM image")}
    except sqlite3.Error as e:
        print(f"      base illisible ({e}) — repli sur {PROPRIETAIRE_HISTORIQUE}")
        return {}
    finally:
        cx.close()


def etape_journal():
    """Ajoute la colonne `character` et la remplit depuis la base."""
    if not JOURNAL.exists():
        print("  [3] journal : rien a migrer (pas de journal_batch.csv)")
        return 0
    with open(JOURNAL, encoding="utf-8", newline="") as f:
        lecteur = csv.DictReader(f, delimiter=";")
        anciennes = lecteur.fieldnames or []
        lignes = list(lecteur)
    if anciennes == lb.JOURNAL_COLS and all(r.get("character") for r in lignes):
        print(f"  [3] journal : deja au bon format ({len(lignes)} ligne(s))")
        return 0

    par_fichier = proprietaires_connus()
    shutil.copy(JOURNAL, JOURNAL.with_suffix(".csv.bak"))
    attribuees = {}
    with open(JOURNAL, "w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=lb.JOURNAL_COLS, delimiter=";",
                            extrasaction="ignore")
        wr.writeheader()
        for r in lignes:
            cid = (r.get("character")
                   or par_fichier.get(r.get("fichier", ""))
                   or PROPRIETAIRE_HISTORIQUE)
            r["character"] = cid
            attribuees[cid] = attribuees.get(cid, 0) + 1
            wr.writerow({c: r.get(c) or "" for c in lb.JOURNAL_COLS})
    detail = ", ".join(f"{c} {n}" for c, n in sorted(attribuees.items()))
    print(f"  [3] journal : colonne `character` ecrite sur {len(lignes)} "
          f"ligne(s) ({detail}) · sauvegarde .csv.bak")
    return len(lignes)


# ------------------------------------------------------------------- etape 4
def etape_vignettes():
    """Ne migre rien : constate ce que le prochain demarrage jettera."""
    thumbs = PROD / ".thumbs"
    if not thumbs.exists():
        print("  [4] vignettes : aucun cache")
        return 0
    toutes = list(thumbs.rglob("*.jpg"))
    perimees = [v for v in toutes if len(v.relative_to(thumbs).parts) != 4]
    print(f"  [4] vignettes : {len(perimees)} perimee(s) sur {len(toutes)} — "
          f"jetees au prochain demarrage (cache, rien a migrer)")
    return 0


def main():
    print("=" * 70)
    print(f"migration PROD/ par personnage — {OFM}")
    print("=" * 70)
    try:
        etape_nsfw()
        etape_export()
        etape_journal()
        etape_vignettes()
    except FileExistsError as e:
        print(f"\n!! ARRET : {e}")
        print("   Rien n'a ete ecrase. Retirer ou renommer le doublon, puis relancer.")
        return 1
    print("=" * 70)
    print("termine")
    return 0


if __name__ == "__main__":
    sys.exit(main())
