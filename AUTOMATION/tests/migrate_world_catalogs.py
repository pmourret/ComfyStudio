# -*- coding: utf-8 -*-
"""Migration : porte les catalogues reels de Lena et Abyssiaelle vers leurs
mondes (WORLDS/slow-life.json, WORLDS/terres-sauvages.json), J8.3, ADR-0019.

Idempotent : re-lancer sur des fiches deja migrees ne change rien (une scene
qui porte deja `world_ref` est laissee telle quelle).

CE QUE CA FAIT.
  1. Chaque monde gagne le contenu REEL des scenes/intentions/tons du
     personnage qui l'habite, a la place des 2 lieux placeholders generiques
     qu'il portait depuis J7bis. Deux placeholders sont remplaces par un
     lieu reel du meme personnage qui les recouvre thematiquement (voir
     PLANS ci-dessous — jugement du chantier, pas automatique) ; les deux
     placeholders sans recouvrement restent.
  2. CHARACTERS/<id>/scenes.json : chaque scene migree devient un overlay
     (`world_ref` + `origin: "world"`). Le cadre (label/intention/prompt)
     RESTE MATERIALISE sur le disque, identique a avant : ADR-0015 §4 dit
     que build_jobs ne fusionne jamais lui-meme, cette migration ne le
     contredit pas.
  3. CHARACTERS/<id>/creative.json : `intentions`/`tones` vides — entierement
     herites du monde via `runner.prompt.load_creative()` (J8.3).

PREUVE, PAS INTUITION. Avant d'ecrire quoi que ce soit : jobs `build_jobs()`
sur l'etat ACTUEL du disque, puis sur l'etat MIGRE reconstruit en memoire
(meme formule que `worlds.merge_scene`/`worlds.merge_creative_vocab`),
balayes sur chaque niveau x intention x ton existants. Un seul ecart de
prompt assemble -> ABANDON, rien n'est ecrit. Deuxieme filet, independant de
ce script : test_build_jobs.py et test_build_jobs_abyssiaelle.py, a
relancer APRES sur le vrai disque migre — c'est ce filet-la qui exerce le
vrai chemin de code (`merge_scene`/`load_creative` reels), pas une
reconstruction en memoire.

SAUVEGARDE. Chaque fichier personnage touche recoit un frere
`.avant-j83.bak` avant toute ecriture reelle (CHARACTERS/ est hors depot,
ADR-0005 -- le frere l'est donc aussi). `--restore` les remet en place.
WORLDS/*.json restent recuperables par `git checkout` tant que cette
migration n'a pas ete commitee.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\migrate_world_catalogs.py
          ... --dry-run     montre ce qui changerait, n'ecrit rien
          ... --restore     restaure les 4 fichiers personnage depuis leur .bak
"""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import runner as lb   # noqa: E402
import worlds         # noqa: E402

CHARACTERS = OFM / "CHARACTERS"
WORLDS_DIR = OFM / "WORLDS"

# Le seul jugement porte par ce script : quels placeholders de chaque monde
# sont retires au profit d'un lieu reel qui les recouvre thematiquement.
# Un placeholder dont l'id est repris tel quel par une scene reelle (meme
# id) est deja recouvert automatiquement (§migrate_world, ported_ids) --
# n'apparait ici que le cas ou les deux ids DIFFERENT (J8.3 §2 : Abyssiaelle,
# feu_de_camp / camp_soir).
PLANS = [
    {"character": "lena", "world": "slow-life", "drop_placeholders": set()},
    {"character": "abyssiaelle", "world": "terres-sauvages",
     "drop_placeholders": {"feu_de_camp"}},
]


def _label_from_id(sid):
    """Cosmetique uniquement -- jamais lu par build_jobs. Pas d'accents
    restaures (l'id n'en porte pas), c'est assume."""
    return sid.replace("_", " ").title()


def _scene_to_place(scene):
    return {"id": scene["id"], "label": _label_from_id(scene["id"]),
            "intention": scene["intention"], "prompt": scene["prompt"]}


def _merged_scene_entry(scene, place, world_id):
    """Meme formule que worlds.merge_scene(), appliquee en memoire contre le
    NOUVEAU lieu (pas encore sur le disque) plutot que de monkeypatcher
    worlds.WORLDS_DIR pour appeler la vraie fonction avant toute ecriture."""
    merged = {
        "id": scene.get("id") or place["id"],
        "world": world_id,
        "origin": "world",
        "world_ref": place["id"],
        "label": place.get("label", ""),
        "intention": place.get("intention", ""),
        "prompt": place.get("prompt", ""),
    }
    for k in worlds.SCENE_OVERLAY_KEYS:
        if k in scene:
            merged[k] = scene[k]
    return merged


def _build_new_world(world_data, character_scenes, character_creative, drop):
    """Rend (new_world_data, ported_ids) sans rien ecrire."""
    ported = [_scene_to_place(s) for s in character_scenes
             if not s.get("world_ref")]                 # deja migree -> ignoree ici
    ported_ids = {p["id"] for p in ported}
    kept = [p for p in world_data.get("places", [])
           if p["id"] not in ported_ids and p["id"] not in drop]
    new_world = dict(world_data)
    new_world["places"] = kept + ported
    new_world["intentions"] = list(character_creative.get("intentions", []))
    new_world["tones"] = list(character_creative.get("tones", []))
    return new_world, ported_ids


def _build_new_character_files(scenes_data, creative_data, world_id, ported_ids,
                               new_world):
    """Rend (new_scenes_data, new_creative_data) sans rien ecrire."""
    places_by_id = {p["id"]: p for p in new_world["places"]}
    new_scenes = dict(scenes_data)
    new_scenes["scenes"] = [
        _merged_scene_entry(s, places_by_id[s["id"]], world_id)
        if s["id"] in ported_ids else s
        for s in scenes_data["scenes"]
    ]
    new_creative = dict(creative_data)
    new_creative["intentions"] = []
    new_creative["tones"] = []
    return new_scenes, new_creative


def _sweep_jobs(scenes_file, cid, creative):
    """Jobs sur chaque (niveau connu) x (intention x ton, y compris aucun
    filtre) -- balayage volontairement large, ce chantier touche des
    donnees reelles. seed fixe : c'est la comparaison des PROMPTS qui
    compte, pas le tirage."""
    levels = sorted({p["level"] for p in creative.get("intensity", [])}) or [0]
    intentions = [None] + [i["key"] for i in creative.get("intentions", [])]
    tones = [None] + [t["key"] for t in creative.get("tones", [])]
    out = []
    for level in levels:
        for intention in intentions:
            for tone in tones:
                args = SimpleNamespace(scene=None, category=None, format=None,
                                       count=None, limit=None, seed=1234,
                                       no_variants=False, intensity=level,
                                       intention=intention, tone=tone)
                jobs = lb.build_jobs(scenes_file, args, cid, creative=creative)
                out.extend((j["scene"], j["intention"], j["tone"], j["prompt"])
                          for j in jobs)
    return out


def migrate_one(plan, dry_run):
    cid, wid, drop = plan["character"], plan["world"], plan["drop_placeholders"]
    scenes_path = lb.scenes_path(cid)
    creative_path = lb.creative_path(cid)
    if not scenes_path.is_file() or not creative_path.is_file():
        print(f"  {cid} : pas de scenes.json/creative.json -- ignore")
        return 0
    if not worlds.exists(wid):
        print(f"  {cid} : monde {wid!r} inconnu -- ignore")
        return 1

    scenes_data = json.loads(scenes_path.read_text(encoding="utf-8"))
    creative_data = json.loads(creative_path.read_text(encoding="utf-8"))
    world_data = worlds.load_world(wid)

    deja = [s["id"] for s in scenes_data["scenes"] if s.get("world_ref")]
    a_porter = [s for s in scenes_data["scenes"] if not s.get("world_ref")]
    if not a_porter:
        print(f"  {cid} : deja migre ({len(deja)} scene(s) world_ref)")
        return 0

    # --------------------------------------------------------- AVANT
    avant_creative = lb.load_creative(cid)      # deja fusionne si un monde
                                                 # portait deja du vocabulaire
    avant = _sweep_jobs(scenes_path, cid, avant_creative)

    # --------------------------------------------------------- construction
    new_world, ported_ids = _build_new_world(world_data, scenes_data["scenes"],
                                             creative_data, drop)
    new_scenes, new_creative_raw = _build_new_character_files(
        scenes_data, creative_data, wid, ported_ids, new_world)
    # creative APRES telle que load_creative() la rendrait : le personnage ne
    # contribue plus rien, tout vient du monde neuf.
    apres_intentions, apres_tones = worlds._merge_by_key(
        new_world["intentions"], []), worlds._merge_by_key(new_world["tones"], [])
    apres_creative = {**new_creative_raw, "intentions": apres_intentions,
                      "tones": apres_tones}

    # --------------------------------------------------------------- APRES
    tmp = scenes_path.with_suffix(".json.migration-check")
    tmp.write_text(json.dumps(new_scenes, ensure_ascii=False, indent=2),
                   encoding="utf-8")
    try:
        apres = _sweep_jobs(tmp, cid, apres_creative)
    finally:
        tmp.unlink(missing_ok=True)

    if avant != apres:
        premier = next((i for i, (a, b) in enumerate(zip(avant, apres)) if a != b),
                       None)
        print(f"  {cid} : ABANDON -- l'assemblage du prompt change "
              f"({len(avant)} vs {len(apres)} jobs balayes"
              + (f", premier ecart au job {premier}: {avant[premier]!r} != "
                 f"{apres[premier]!r}" if premier is not None else "") + ")")
        return 1

    print(f"  {cid} : {len(ported_ids)} scene(s) -> lieux de {wid!r}, "
          f"{len(a_porter)} scene(s) personnage migree(s), "
          f"{len(creative_data.get('intentions', []))} intention(s) + "
          f"{len(creative_data.get('tones', []))} ton(s) portes au monde "
          f"-- {len(avant)} jobs balayes, prompts identiques")
    if dry_run:
        return 0

    scenes_path.with_suffix(".json.avant-j83.bak").write_text(
        scenes_path.read_text(encoding="utf-8"), encoding="utf-8")
    creative_path.with_suffix(".json.avant-j83.bak").write_text(
        creative_path.read_text(encoding="utf-8"), encoding="utf-8")
    (WORLDS_DIR / f"{wid}.json").write_text(
        json.dumps(new_world, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    scenes_path.write_text(json.dumps(new_scenes, ensure_ascii=False, indent=2)
                           + "\n", encoding="utf-8")
    creative_path.write_text(json.dumps(new_creative_raw, ensure_ascii=False,
                                        indent=2) + "\n", encoding="utf-8")
    return 0


def restore():
    touched = 0
    for plan in PLANS:
        cid = plan["character"]
        for base in (lb.scenes_path(cid), lb.creative_path(cid)):
            bak = base.with_suffix(".json.avant-j83.bak")
            if bak.is_file():
                base.write_text(bak.read_text(encoding="utf-8"), encoding="utf-8")
                print(f"  {cid} : {base.name} restaure depuis {bak.name}")
                touched += 1
    if not touched:
        print("  aucun .avant-j83.bak trouve -- rien a restaurer")
    print("  WORLDS/*.json : restaurer via `git checkout -- WORLDS/slow-life.json "
         "WORLDS/terres-sauvages.json` si non commite depuis")
    return 0


def main(argv):
    if "--restore" in argv:
        return restore()
    dry_run = "--dry-run" in argv
    print("=" * 72)
    print("migration : catalogues de monde herites (J8.3, ADR-0019)"
         + ("   [DRY RUN]" if dry_run else ""))
    print("=" * 72)
    if not CHARACTERS.is_dir():
        print(f"aucun CHARACTERS/ sous {OFM} -- rien a migrer")
        return 0
    ko = sum(migrate_one(plan, dry_run) for plan in PLANS)
    print()
    print(f"{ko} personnage(s) en erreur" if ko else "termine")
    return 1 if ko else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
