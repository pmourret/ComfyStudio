"""Mesures de realisme : est-ce que l'image passe pour une photographie ?

Question INDEPENDANTE de l'identite. `qc_identity` repond a « est-ce bien Lena »,
ce module repond a « est-ce credible comme photo ». Le verdict de tri ne depend
que de l'identite ; ces mesures sont enregistrees et affichees, elles ne deplacent
aucun fichier tant qu'elles ne sont pas calibrees (DOCS/lena-parcours-creatif.md 5.4).

TROIS MESURES

- nettete        variance du laplacien sur l'image entiere. Bas = mou.
- texture_visage mediane de l'ecart-type local (7x7) dans le crop de visage.
                 C'est LA mesure importante : PuLID lisse la peau, c'est documente
                 dans CLAUDE.md, et ce lissage est ce qui fait « rendu IA ». La
                 mediane plutot que la moyenne pour que les aretes (yeux, narines,
                 limite des cheveux) ne gonflent pas le resultat.
- bruit_fond     ecart-type robuste (MAD) du residu haute frequence hors visage.
                 Une photo a un plancher de bruit capteur ; une generation trop
                 propre n'en a pas. Repere deja utilise a la main lors du reglage
                 NSFW (« bruit de fond 3.71 contre 3.62 cote SFW »).

NORMALISATION — c'est ce qui rend les valeurs comparables entre images :
- l'image est ramenee a 1024 px sur son grand cote avant toute mesure, sinon un
  2K et un 1080 ne sont pas sur la meme echelle ;
- le crop de visage est ramene a 256 px de haut, sinon un selfie (grand visage)
  et un plan large (petit visage) ne sont pas comparables non plus.

Les valeurs sont des nombres bruts, sans seuil : la bande cible se deduit des
images que l'utilisateur marque « convaincante » dans la revue. Pas de corpus de
vraies photos dans ce projet, donc pas d'autre etalonnage honnete.
"""
import numpy as np

TAILLE_IMAGE = 1024        # grand cote, pour la nettete et le bruit de fond
TAILLE_VISAGE = 256        # hauteur du crop de visage, pour la texture de peau


def _cv2():
    import cv2
    return cv2


def _normalise(img, cible=TAILLE_IMAGE):
    cv2 = _cv2()
    h, w = img.shape[:2]
    grand = max(h, w)
    if grand == cible:
        return img
    k = cible / grand
    interp = cv2.INTER_AREA if k < 1 else cv2.INTER_LINEAR
    return cv2.resize(img, (max(1, int(w * k)), max(1, int(h * k))), interpolation=interp)


def _gris(img):
    cv2 = _cv2()
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)


def _ecart_type_local(gris, k=7):
    """Ecart-type local en chaque pixel, par la formule E[x²] - E[x]²."""
    cv2 = _cv2()
    moy = cv2.blur(gris, (k, k))
    moy_carre = cv2.blur(gris * gris, (k, k))
    return np.sqrt(np.maximum(moy_carre - moy * moy, 0.0))


def _mad(x):
    """Ecart-type robuste : les aretes et les artefacts ne le tirent pas."""
    med = np.median(x)
    return float(np.median(np.abs(x - med)) * 1.4826)


def nettete(img):
    # CV_32F et pas CV_64F : _gris rend du float32, et OpenCV n'accepte pas la
    # combinaison source float32 / destination float64.
    cv2 = _cv2()
    return float(cv2.Laplacian(_gris(_normalise(img)), cv2.CV_32F).var())


def texture_visage(img, bbox):
    """bbox = (x1, y1, x2, y2) en pixels de l'image d'origine."""
    cv2 = _cv2()
    if bbox is None:
        return None
    h, w = img.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    # on resserre de 18 % : on veut la peau (joues, front), pas le contour du
    # visage ni la limite des cheveux, qui sont des aretes franches
    mx, my = int((x2 - x1) * 0.18), int((y2 - y1) * 0.18)
    x1, y1 = max(0, x1 + mx), max(0, y1 + my)
    x2, y2 = min(w, x2 - mx), min(h, y2 - my)
    if x2 - x1 < 16 or y2 - y1 < 16:
        return None
    crop = img[y1:y2, x1:x2]
    k = TAILLE_VISAGE / crop.shape[0]
    crop = cv2.resize(crop, (max(16, int(crop.shape[1] * k)), TAILLE_VISAGE),
                      interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_LINEAR)
    return float(np.median(_ecart_type_local(_gris(crop))))


def bruit_fond(img, bbox):
    """Plancher de bruit hors visage, sur le residu haute frequence."""
    cv2 = _cv2()
    petit = _normalise(img)
    gris = _gris(petit)
    residu = gris - cv2.GaussianBlur(gris, (0, 0), 1.2)
    masque = np.ones(gris.shape, dtype=bool)
    if bbox is not None:
        kh = petit.shape[0] / img.shape[0]
        kw = petit.shape[1] / img.shape[1]
        x1, y1, x2, y2 = bbox
        # on evide large autour du visage : la peau lissee ne doit pas compter
        mx, my = (x2 - x1) * 0.35, (y2 - y1) * 0.35
        a = max(0, int((x1 - mx) * kw)); b = min(petit.shape[1], int((x2 + mx) * kw))
        c = max(0, int((y1 - my) * kh)); d = min(petit.shape[0], int((y2 + my) * kh))
        if b > a and d > c:
            masque[c:d, a:b] = False
    if masque.sum() < 1000:                 # visage occupant tout le cadre
        masque = np.ones(gris.shape, dtype=bool)
    return _mad(residu[masque])


def mesure(path, bbox=None):
    """Les trois mesures pour une image. bbox facultatif (sinon pas de texture)."""
    cv2 = _cv2()
    img = cv2.imread(str(path))
    if img is None:
        return None
    return {
        "nettete": round(nettete(img), 2),
        "texture_visage": (lambda v: round(v, 3) if v is not None else None)(
            texture_visage(img, bbox)),
        "bruit_fond": round(bruit_fond(img, bbox), 3),
    }


if __name__ == "__main__":
    import sys
    from pathlib import Path
    for f in sorted(Path(sys.argv[1]).glob("*.png")):
        print(f"{f.name[:48]:50} {mesure(f)}")
