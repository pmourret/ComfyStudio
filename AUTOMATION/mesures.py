"""Ce qu'on sait de chaque image produite : mesures et jugement humain.

Un fichier, `PROD/mesures.json`, indexe par nom de fichier :

    {"lifestyle_cuisine_matin_20260822_01.png": {
        "identite": 0.713, "nettete": 127.6, "texture_visage": 5.2,
        "bruit_fond": 2.17, "flag": "ok", "mesure_le": "...", "juge_le": "..."}}

POURQUOI PAS LE JOURNAL. Le journal est append-only : une ligne y est ecrite a la
generation et n'est plus touchee. Or le jugement humain (`flag`) arrive plus tard,
dans la revue, et peut changer d'avis. Il faut donc un stockage modifiable en
place — d'ou ce fichier separe.

DOUBLE ECRITURE depuis le 24/08/2026. La bascule SQLite est faite : `base.py`
porte les memes donnees dans les tables `score` et `jugement`. Ce fichier reste
ecrit — il est lisible sans outil et sert de repli — mais la BASE est la source
de verite en lecture. Quand la base sera partout en lecture, ce store pourra
devenir une simple sortie.

DEUX ETALONNAGES, dans cet ordre (voir `bande`) :

1. LE CORPUS DE REFERENCE — `INPUTS/REALISME/`, des images choisies a la main pour
   leur texture, leur grain et leur rendu. C'est l'etalon explicite du realisme, le
   pendant de la base gelee pour l'identite. Leurs entrees portent role="reference"
   et n'apparaissent jamais dans la revue.
2. A DEFAUT, le jugement humain — FLAG "ok" = convaincante comme photographie,
   "ia" = ca se voit. Utilise seulement si le corpus est vide.

Aucun seuil n'est ecrit en dur nulle part.
"""
import json
import os
import threading
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parent
FICHIER = OFM / "PROD" / "mesures.json"
REFERENCES = OFM / "INPUTS" / "REALISME"   # corpus de reference du realisme

_VERROU = threading.Lock()          # le batch ecrit pendant que le web lit
FLAGS = ("ok", "ia")


def charger():
    if not FICHIER.exists():
        return {}
    try:
        with open(FICHIER, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}                   # un store illisible ne doit jamais bloquer


def _ecrire(d):
    """Ecriture atomique : jamais de fichier a moitie ecrit si ca coupe."""
    FICHIER.parent.mkdir(parents=True, exist_ok=True)
    tmp = FICHIER.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, FICHIER)


def maj(nom, **champs):
    """Fusionne des champs pour une image. Retourne l'entree complete."""
    with _VERROU:
        d = charger()
        e = d.setdefault(nom, {})
        e.update({k: v for k, v in champs.items() if v is not None})
        _ecrire(d)
        return e


def renommer(ancien, nouveau):
    """Suit un fichier deplace entre dossiers (le tri ne change que le dossier)."""
    if ancien == nouveau:
        return
    with _VERROU:
        d = charger()
        if ancien in d:
            d[nouveau] = d.pop(ancien)
            _ecrire(d)


def demesurer(nom):
    """Efface les MESURES d'une image dont les pixels ont change (F3.3).

    Ecraser une source depuis l'editeur garde le nom de fichier mais change ce
    qu'il contient : nettete, texture et bruit de fond ont ete calcules sur
    l'ancienne version, et un badge qui ment est un bug (frontend.md). L'image
    repasse donc « non mesuree » et rentre dans le compte de `Mesurer (n)`.

    Le JUGEMENT humain (`flag`, `juge_le`) est conserve : il porte sur le sujet
    et sur ce que l'image donne a voir, pas sur trois nombres ; l'effacer
    silencieusement detruirait une saisie de l'utilisateur. Rend l'entree
    restante, ou None si l'image n'en avait aucune.
    """
    with _VERROU:
        d = charger()
        e = d.get(nom)
        if not e:
            return None
        for champ in ("nettete", "texture_visage", "bruit_fond", "identite",
                      "mesure_le", "bbox"):
            e.pop(champ, None)
        if e:
            d[nom] = e
        else:
            d.pop(nom, None)
        _ecrire(d)
        return e or None


def poser_flag(nom, flag, character_id):
    """flag dans FLAGS, ou None pour retirer le jugement.

    Ecrit aussi en base : c'est ce jugement qui etalonne le realisme, il ne doit
    pas exister a deux endroits qui divergent. `character_id` est obligatoire
    depuis que `base.enregistrer_image` n'a plus de defaut (2026-09-01) — avant
    ca, l'ecriture en base d'un jugement retombait en silence sur 'lena' pour
    TOUT personnage (le `except Exception: pass` ci-dessous avale l'echec sans
    le dire, par design : la base ne doit jamais bloquer un jugement humain,
    mais elle ecrivait alors sous la mauvaise identite plutot que de refuser).
    """
    if flag is not None and flag not in FLAGS:
        raise ValueError(f"flag inconnu : {flag}")
    try:
        import base
        with base.ouvrir() as cx:
            base.enregistrer_jugement(
                cx, base.enregistrer_image(cx, nom, character_id), flag)
            cx.commit()
    except Exception:
        pass                        # la base ne doit jamais bloquer un jugement
    with _VERROU:
        d = charger()
        e = d.setdefault(nom, {})
        if flag is None:
            e.pop("flag", None)
            e.pop("juge_le", None)
        else:
            e["flag"] = flag
            e["juge_le"] = datetime.now().isoformat(timespec="seconds")
        _ecrire(d)
        return e


def mesurer(path, checker=None, bbox=None, identite=None, character_id=None):
    """Mesure une image et range le resultat. Retourne l'entree.

    Si `checker` est fourni et que la bbox n'est pas connue, la passe InsightFace
    sert aux deux : score d'identite ET cadre du visage. C'est la partie couteuse
    (~190 ms) ; les mesures de realisme n'ajoutent que ~32 ms.

    `character_id` double l'ecriture en base (meme genres que
    `runner.sortie.ranger_mesures` a la generation) — sans lui ce fichier reste
    la seule source, ce qui a laisse la base en retard pour toute image
    RE-mesuree depuis la revue plutot que notee a la generation (P2.1,
    05/09/2026). Omis pour le corpus de reference (`mesurer_references`) : il
    n'appartient a aucun personnage, la base l'a deja sous 'lena' par
    convention historique (migrer_base.py), pas par appelant courant.
    """
    import qc_realisme
    path = Path(path)
    if bbox is None and checker is not None:
        m = checker.mesure(path)
        bbox, identite = m["bbox"], m["score"]
    r = qc_realisme.mesure(path, bbox)
    if r is None:
        return None
    quand = datetime.now().isoformat(timespec="seconds")
    entree = maj(path.name, identite=identite, mesure_le=quand, **r)
    if character_id:
        try:
            import base
            with base.ouvrir() as cx:
                iid = base.enregistrer_image(cx, path.name, character_id=character_id)
                base.enregistrer_score(cx, iid, "identite", identite, quand)
                for genre, v in r.items():
                    base.enregistrer_score(cx, iid, genre, v, quand)
                cx.commit()
        except Exception:
            pass                    # la base ne doit jamais bloquer une mesure
    return entree


def _quantiles(vals, n_min, source):
    """Bande robuste : quartiles, pas min/max.

    Un seul cliche atypique dans le corpus suffirait a ouvrir la bande au point
    qu'elle ne dise plus rien — c'est arrive avec e123a_eavdue_135z.png, nettete
    2822 contre 553 de mediane. Les quartiles l'ecartent sans avoir a le trier a
    la main, et min/max restent affiches pour qu'il soit reperable.
    """
    vals = sorted(vals)
    if len(vals) < n_min:
        return None
    q = lambda p: vals[min(len(vals) - 1, int(round(p * (len(vals) - 1))))]
    return {"min": q(0.25), "median": q(0.5), "max": q(0.75),
            "etendue": [vals[0], vals[-1]], "n": len(vals), "source": source}


def bande(entrees, champ):
    """Bande cible d'une mesure. Deux etalonnages, par ordre de priorite.

    1. LE CORPUS DE REFERENCE (INPUTS/REALISME) : des images choisies a la main
       pour leur texture et leur rendu. C'est l'etalon explicite, et c'est celui
       qui prime — il ne bouge pas au gre des jugements.
    2. A defaut, les images jugees « convaincante » dans la revue, a partir de 8.

    Retourne None si aucun des deux n'est disponible : l'interface se rabat alors
    sur l'etendue du dossier affiche. Aucun seuil n'est ecrit en dur.
    """
    refs = [e[champ] for e in entrees
            if e.get("role") == "reference" and isinstance(e.get(champ), (int, float))]
    b = _quantiles(refs, 3, "reference")
    if b:
        return b
    juges = [e[champ] for e in entrees
             if e.get("flag") == "ok" and e.get("role") != "reference"
             and isinstance(e.get(champ), (int, float))]
    return _quantiles(juges, 8, "jugements")


def fichiers_reference():
    if not REFERENCES.exists():
        return []
    return sorted(f for f in REFERENCES.iterdir()
                  if f.suffix.lower() in (".png", ".jpg", ".jpeg"))


def mesurer_references(checker=None, force=False):
    """Mesure le corpus de reference. Retourne (mesurees, total).

    Les entrees portent role="reference" : elles etalonnent les bandes mais
    n'apparaissent jamais dans la revue, qui ne liste que les dossiers de tri.
    """
    store = charger()
    faites = 0
    for f in fichiers_reference():
        if not force and "nettete" in store.get(f.name, {}):
            continue
        if mesurer(f, checker=checker) is not None:
            maj(f.name, role="reference")
            faites += 1
    return faites, len(fichiers_reference())
