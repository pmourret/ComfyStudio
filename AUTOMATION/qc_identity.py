"""QC d'identite : similarite cosinus InsightFace (antelopev2) a la base gelee.

Meme modele que celui utilise par PuLID, donc la mesure est coherente avec ce que
le verrou d'identite "voit". Bandes de lecture (mesurees sur les sorties validees) :
    >= 0.72  conforme
    0.60-0.71 derive visible, a revoir
    <  0.60  ce n'est plus le meme visage
"""
import os
import threading

_APP = None
# Le batch et le rattrapage de mesures du tableau de bord tournent chacun dans
# leur thread d'executeur : sans verrou, les deux pouvaient entrer ici en meme
# temps et charger antelopev2 deux fois (~1 Go, plusieurs secondes).
_VERROU = threading.Lock()


def _app(insightface_root):
    global _APP
    if _APP is None:
        with _VERROU:
            if _APP is None:              # re-teste sous le verrou
                from insightface.app import FaceAnalysis
                app = FaceAnalysis(name="antelopev2", root=insightface_root,
                                   providers=["CPUExecutionProvider"])
                app.prepare(ctx_id=-1, det_size=(640, 640))
                _APP = app                # publie une fois pret, jamais avant
    return _APP


def analyse(path, insightface_root):
    """(embedding, bbox) en UNE seule detection.

    La bbox est ramenee aux coordonnees de l'image d'origine, pas a celles de la
    version reduite servant a la detection. Elle sert aux mesures de realisme
    (qc_realisme) : les calculer depuis ici evite une seconde passe InsightFace,
    qui est la partie couteuse.
    """
    import cv2
    img = cv2.imread(str(path))
    if img is None:
        return None, None
    h, w = img.shape[:2]
    s = 1.0
    if max(h, w) > 1600:                       # detection plus rapide, meme resultat
        s = 1600 / max(h, w)
        img = cv2.resize(img, (int(w * s), int(h * s)))
    faces = _app(insightface_root).get(img)
    if not faces:
        return None, None
    face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return face.normed_embedding, tuple(float(v) / s for v in face.bbox)


def embedding(path, insightface_root):
    return analyse(path, insightface_root)[0]


class IdentityChecker:
    def __init__(self, base_image, insightface_root, threshold_ok=0.72,
                 threshold_watch=0.60):
        import numpy as np
        self.np = np
        self.root = insightface_root
        self.ok = threshold_ok
        self.watch = threshold_watch
        self.base = embedding(base_image, insightface_root)
        if self.base is None:
            raise RuntimeError(f"aucun visage detecte dans la base gelee : {base_image}")

    def score(self, path):
        return self.mesure(path)["score"]

    def mesure(self, path):
        """score d'identite + bbox du visage + embedding, en une passe.

        Les mesures de realisme ont besoin de la bbox ; la recalculer couterait
        une seconde detection InsightFace, soit le double du temps de QC.

        L'embedding est rendu tel quel : le stocker permet de re-scorer tout
        l'historique sans relire un seul PNG — changer de seuil ou de reference
        devient une requete, pas un batch (voir base.py).
        """
        e, bbox = analyse(path, self.root)
        if e is None:
            return {"score": None, "bbox": None, "embedding": None}
        return {"score": float(self.np.dot(self.base, e)), "bbox": bbox,
                "embedding": e}

    def verdict(self, score):
        if score is None:
            return "SANS_VISAGE"
        if score >= self.ok:
            return "OK"
        if score >= self.watch:
            return "A_REVOIR"
        return "REJET"


if __name__ == "__main__":
    import sys, glob
    base = sys.argv[1]
    root = sys.argv[2]
    checker = IdentityChecker(base, root)
    for f in sorted(glob.glob(os.path.join(sys.argv[3], "*.png"))):
        s = checker.score(f)
        print(f"{os.path.basename(f):45} {('%.3f' % s) if s else '   -  '} "
              f"{checker.verdict(s)}")
