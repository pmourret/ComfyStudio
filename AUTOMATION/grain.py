"""Grain de capteur de telephone, applique en sortie de generation.

POURQUOI PAS `ImageAddNoise` DU GRAPHE. Ce noeud ajoute du bruit RGB uniforme :
autant de bruit dans les couleurs que dans la luminance, et autant dans les hautes
lumieres que dans les ombres. Un capteur ne fait ni l'un ni l'autre.

Mesure du 24/08/2026 sur INPUTS/REALISME (corpus de reference) contre la
production d'alors :

                      luma   chroma   chroma/luma   ombres/hautes
    reference         1.63     0.47          0.25            2.48
    production        2.22     1.67          0.72            1.28

Deux ecarts, tous deux structurels :
  - la production a ~3 fois trop de bruit de CHROMINANCE. Un telephone debruite
    agressivement la couleur et laisse le grain en luminance ;
  - son bruit est PLAT sur la plage tonale, alors qu'un capteur bruite surtout
    dans les ombres (rapport ~2.5 chez les references).

Ce module reproduit les deux : on retire d'abord une part du bruit de couleur
deja present, puis on ajoute un grain de LUMINANCE pondere vers les ombres. C'est
la sequence d'un telephone, et c'est ce qui donne l'impression « photo prise sur
le vif » plutot que « rendu propre avec du grain par-dessus ».

Resultat obtenu avec les valeurs par defaut, moyenne sur 3 scenes (24/08/2026) :

                      luma   chroma   chroma/luma   ombres/hautes
    avant (graphe)    2.47     1.76          0.71            1.47
    apres (ce module) 1.60     0.36          0.23            2.07
    reference         1.63     0.47          0.25            2.48

Les deux rapports structurels sont atteints. L'amplitude est recalee par MAD, donc
`luma` est bien l'ecart-type robuste ajoute, pas un gain arbitraire.
"""
import numpy as np

# Cibles deduites du corpus de reference (voir l'en-tete).
LUMA = 1.2            # amplitude ajoutee en luminance (le residu de base s'y ajoute)
CHROMA_RATIO = 0.0    # on n'AJOUTE pas de chrominance : il y en a deja trop
OMBRES_RATIO = 5.0    # ponderation vers les ombres (reglee, voir plus bas)
CHROMA_DENOISE = 0.5  # part du bruit de couleur DEJA present que l'on retire


def _cv2():
    import cv2
    return cv2


def _exposant(ratio):
    """Exposant de ponderation donnant le rapport ombres/hautes demande.

    Le poids vaut ((255 - Y)/255)**p. Entre une ombre typique (Y~35) et une haute
    lumiere typique (Y~215), le rapport des poids est (0.863/0.157)**p, d'ou p.
    """
    if ratio <= 1:
        return 0.0
    return float(np.log(ratio) / np.log(0.863 / 0.157))


def _mad(x):
    return float(np.median(np.abs(x - np.median(x))) * 1.4826)


def appliquer(path, luma=LUMA, chroma_ratio=CHROMA_RATIO,
              ombres_ratio=OMBRES_RATIO, chroma_denoise=CHROMA_DENOISE,
              seed=None, sortie=None):
    """Ajoute le grain a une image et l'ecrit. Retourne le profil obtenu.

    `chroma_denoise` (0 a 1) retire d'abord une part du bruit de couleur DEJA
    present. Sans lui on ne peut pas atteindre la cible : l'image sort de Flux
    avec un residu de chrominance qu'ajouter du grain ne fera qu'augmenter. Un
    telephone, lui, debruite la couleur avant de laisser le grain de luminance —
    c'est exactement cette sequence.

    Ecrit en place si `sortie` est absent.
    """
    cv2 = _cv2()
    img = cv2.imread(str(path))
    if img is None:
        return None
    rng = np.random.default_rng(seed)
    ycc = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb).astype(np.float32)

    if chroma_denoise > 0:
        for c in (1, 2):
            canal = ycc[:, :, c]
            ycc[:, :, c] = canal - chroma_denoise * (
                canal - cv2.GaussianBlur(canal, (0, 0), 1.2))

    Y = ycc[:, :, 0]

    # poids tonal : fort dans les ombres, faible dans les hautes lumieres
    poids = np.power(np.clip((255.0 - Y) / 255.0, 0.0, 1.0), _exposant(ombres_ratio))

    bruit_y = rng.standard_normal(Y.shape).astype(np.float32) * poids
    # recalage sur l'amplitude visee : `luma` est l'ecart-type robuste obtenu
    ec = _mad(bruit_y)
    if ec > 1e-6:
        bruit_y *= luma / ec

    ycc[:, :, 0] = Y + bruit_y
    if chroma_ratio > 0:
        for c in (1, 2):
            b = rng.standard_normal(Y.shape).astype(np.float32) * poids
            ec = _mad(b)
            if ec > 1e-6:
                b *= (luma * chroma_ratio) / ec
            ycc[:, :, c] += b

    out = cv2.cvtColor(np.clip(ycc, 0, 255).astype(np.uint8), cv2.COLOR_YCrCb2BGR)
    cv2.imwrite(str(sortie or path), out)
    return profil(sortie or path)


def profil(path):
    """Mesure la signature de bruit : luma, chroma, rapports. Sert a verifier.

    L'image est ramenee a 1024 px sur son grand cote, comme dans qc_realisme :
    le bruit par pixel depend de la taille, et les references (1536x2752) n'ont
    pas la meme que la production (1080x1350). Sans cette normalisation les deux
    ne sont pas comparables — erreur commise puis corrigee le 24/08/2026.
    """
    cv2 = _cv2()
    img = cv2.imread(str(path))
    if img is None:
        return None
    import qc_realisme
    img = qc_realisme._normalise(img)
    ycc = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb).astype(np.float32)
    Y, Cr, Cb = ycc[:, :, 0], ycc[:, :, 1], ycc[:, :, 2]
    hp = lambda c: c - cv2.GaussianBlur(c, (0, 0), 1.2)
    ry = hp(Y)
    luma = _mad(ry)
    chroma = (_mad(hp(Cr)) + _mad(hp(Cb))) / 2
    zone = lambda lo, hi: (_mad(ry[(Y >= lo) & (Y < hi)])
                           if ((Y >= lo) & (Y < hi)).sum() > 2000 else None)
    o, h = zone(0, 70), zone(180, 256)
    return {"luma": round(luma, 2), "chroma": round(chroma, 2),
            "chroma_luma": round(chroma / luma, 2) if luma else None,
            "ombres_hautes": round(o / h, 2) if (o and h) else None}


if __name__ == "__main__":
    import sys, shutil, pathlib
    src = pathlib.Path(sys.argv[1])
    tmp = src.with_name("_grain_test" + src.suffix)
    shutil.copy(src, tmp)
    print("avant :", profil(src))
    print("apres :", appliquer(tmp, seed=1))
    tmp.unlink(missing_ok=True)
