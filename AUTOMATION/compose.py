"""Compose des scenes a partir d'une intention ecrite en francais.

Utilise le modele de langage local deja present dans ComfyUI (noeud coeur
`TextGenerate` alimente par `qwen3vl_4b_fp8_scaled`). Rien ne sort de la machine,
aucune API payante.

Le resultat est une PROPOSITION : le runner ne l'enregistre pas, l'interface
l'affiche pour relecture et c'est l'utilisateur qui valide.
"""
import json
import re
import time
import urllib.request

CLIP_MODEL = "qwen3vl_4b_fp8_scaled.safetensors"

SYSTEM = """You are a scene writer for a photo series about one recurring model.
The user writes an intention in French. You output SCENE PROMPTS in English.

HARD RULES
- Never describe the face, hair, eyes, skin, age or identity. Another system
  handles the character's face. Write only: place, action, framing, camera angle,
  light, background.
- THE PROMPT CONTAINS NO CLOTHING. Clothing goes in the separate wardrobe fields.
  Never write "wearing" in the prompt.
- Never mention hair, skin, complexion or makeup — not even "wet hair" or "tanned
  skin". Another system owns them. "wind moving through the hair" is also banned:
  describe the wind, not the hair.
- Style: comma-separated descriptors, no full sentences, no poetic adjectives,
  no words like "beautiful", "stunning", "cozy vibes".
- Each prompt: 25 to 40 words.
- id: short snake_case, in French, describing the scene (ex: jardin_arrosage).
- intention: pick ONE from this list: %(intentions)s. Pick the closest.
- format: "4:5" for feed, "9:16" for stories or selfies, "2:3" for full outfit.
- tags: 2 to 4 short French snake_case keywords. Reuse these when they fit:
  %(tags)s. They describe place, moment and framing, never clothing.
- tones: 1 to 3 keys from this list, the moods this scene suits: %(tones)s.
- wardrobe_0: everyday, fully covered outfit. A noun phrase, no "wearing".
- wardrobe_1: same scene, more relaxed — loungewear, bare shoulders or bare legs.
  Must stay plausible for the same place and action.
- variants: 1 or 2 alternatives that change the LIGHT, the SEASON or the MOMENT of
  the day. NEVER an outfit — outfits are the wardrobe fields. A variant is a
  descriptive fragment, never an id, never a title.

EXAMPLE — exactly the shape and the level of detail expected:
[
{"id":"cuisine_matin","intention":"lifestyle","format":"4:5","tags":["interieur","matin","debout"],"tones":["doux","joueur"],"prompt":"standing in a sunlit kitchen holding a mug, medium shot, facing the camera, soft window light from the left, wooden shelves and plants in the background","wardrobe_0":"a plain cream linen shirt and jeans","wardrobe_1":"an oversized cream linen shirt over bare legs","variants":["overcast grey morning, flat diffuse light"]},
{"id":"balcon_soir","intention":"lifestyle","format":"9:16","tags":["exterieur","soir","debout"],"tones":["melancolique","intime"],"prompt":"leaning on a balcony railing at dusk, half body, looking out at the street, mixed street lighting and blue evening sky","wardrobe_0":"a thin dark sweater and jeans","wardrobe_1":"a thin dark sweater over bare legs","variants":["summer evening, warm low light"]}
]

OUTPUT
Write EXACTLY %(n)d objects, in one JSON array, and nothing else — no markdown
fence, no comment, no text before or after. Each object must be different from
the others: different place or different moment, not the same scene reworded.

USER INTENTION (French): %(intention)s

JSON:"""


TAGS_COURANTS = ("interieur", "exterieur", "matin", "jour", "soir", "assise",
                 "debout", "miroir", "sport", "ville", "montagne", "atelier",
                 "half_body", "full_body", "medium_shot")


def build_graph(intention, count, creative, seed):
    prompt = SYSTEM % {
        "intentions": ", ".join(i["key"] for i in creative.get("intentions", []))
                      or "lifestyle",
        "tones": ", ".join(t["key"] for t in creative.get("tones", [])) or "doux",
        "tags": ", ".join(TAGS_COURANTS),
        "n": count, "intention": intention}
    return {
        "1": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": CLIP_MODEL, "type": "krea2", "device": "default"}},
        "2": {"class_type": "TextGenerate",
              "inputs": {"clip": ["1", 0], "prompt": prompt,
                         "max_length": 260 * count,
                         "sampling_mode": "on",
                         "sampling_mode.temperature": 0.75,
                         "sampling_mode.top_k": 64,
                         "sampling_mode.top_p": 0.95,
                         "sampling_mode.min_p": 0.05,
                         "sampling_mode.repetition_penalty": 1.05,
                         "sampling_mode.seed": seed}},
        "3": {"class_type": "PreviewAny", "inputs": {"source": ["2", 0]}},
    }


def _json_objects(text):
    """Isole chaque objet JSON de premier niveau, quelle que soit la mise en forme.

    Le modele rend tantot un tableau, tantot des objets separes par des virgules,
    parfois entoures d'une cloture markdown : on ne prend que les accolades
    equilibrees et on ignore le reste.
    """
    out, depth, start, in_str, esc = [], 0, None, False, False
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start is not None:
                    out.append(text[start:i + 1])
                    start = None
    return out


def parse(text, creative=None):
    if not text:
        return []
    scenes = []
    for chunk in _json_objects(text):
        try:
            obj = json.loads(chunk)
        except Exception:
            continue
        if isinstance(obj, dict) and obj.get("prompt"):
            scenes.append(clean(obj, creative))
    return scenes


def _slug(x):
    return re.sub(r"[^a-z0-9_]+", "_", str(x or "").lower()).strip("_")


def alertes(scene):
    """Mots qui NE sont pas interdits mais qui meritent un oeil avant d'enregistrer.

    `lena_batch.assert_no_face` refuse la geometrie du visage — c'est un mur. Ici
    c'est un panneau : le composeur propose, il n'enregistre jamais. Le
    vocabulaire surveille vit dans `lena_batch.WATCH_FACE`, partage avec
    l'instruction d'edition NSFW.
    """
    import lena_batch
    trouve = []
    for champ, texte in [("prompt", scene.get("prompt", ""))] + \
                        [("tenue " + k, v) for k, v in (scene.get("wardrobe") or {}).items()] + \
                        [("variante", v) for v in (scene.get("variants") or [])]:
        for m in lena_batch.WATCH_FACE.findall(texte or ""):
            trouve.append(f"{champ} : « {m.lower()} »")
    return trouve


def clean(scene, creative=None):
    """Normalise une proposition du modele vers le schema de scenes.json.

    Le modele local est un 4B : on lui demande des cles PLATES (wardrobe_0,
    wardrobe_1), pas un dictionnaire imbrique, et c'est ici qu'on reassemble. On
    ne fait jamais confiance a ses valeurs de vocabulaire non plus : intention et
    tons sont valides contre creative.json, tout ce qui n'y est pas est jete.
    """
    creative = creative or {}
    intentions = [i["key"] for i in creative.get("intentions", [])]
    tons = [t["key"] for t in creative.get("tones", [])]

    sid = _slug(scene.get("id"))
    intention = _slug(scene.get("intention") or scene.get("category"))
    if intentions and intention not in intentions:
        intention = "lifestyle" if "lifestyle" in intentions else intentions[0]
    fmt = scene.get("format") if scene.get("format") in ("4:5", "2:3", "9:16", "1:1") else "4:5"

    tags = [_slug(t) for t in (scene.get("tags") or [])]
    tags = [t for t in dict.fromkeys(tags) if t][:4]
    tones = [_slug(t) for t in (scene.get("tones") or [])]
    tones = [t for t in dict.fromkeys(tones) if not tons or t in tons][:3]

    # la tenue ne doit JAMAIS rester dans le prompt : le curseur d'intensite en
    # injecterait une seconde et le rendu porterait deux tenues concurrentes
    prompt = " ".join(str(scene.get("prompt") or "").split())
    prompt = re.sub(r",?\s*wearing\b[^,]*", "", prompt, flags=re.I).strip(" ,")

    wardrobe = {}
    for niveau in ("0", "1", "2"):
        v = str(scene.get(f"wardrobe_{niveau}") or "").strip()
        v = re.sub(r"^wearing\s+", "", v, flags=re.I).strip(" ,.")
        if v:
            wardrobe[niveau] = " ".join(v.split())
    if not wardrobe:
        wardrobe = {"0": "everyday clothing"}

    variants = []
    for v in (scene.get("variants") or []):
        v = " ".join(str(v).split()).strip(" ,.")
        # une variante de tenue serait en concurrence avec wardrobe : on l'ecarte
        if v and not re.match(r"^wearing\b", v, flags=re.I):
            variants.append(v)

    # `intensity` porte le niveau MINIMUM seul : le maximum se deduit des
    # tenues (lb.scene_band). Une scene composee part donc du niveau 0, et monte
    # aussi haut que la tenue la plus couvrante qu'elle sait decrire.
    # `category` n'est plus emis : c'est l'intention (voir scene_intention).
    return {"id": sid or "scene", "intention": intention,
            "format": fmt, "count": int(scene.get("count") or 1),
            "tags": tags, "tones": tones, "intensity": 0,
            "prompt": prompt, "wardrobe": wardrobe, "variants": variants[:2]}


def compose(intention, count=3, creative=None, comfy_url="http://127.0.0.1:8188",
            seed=None, timeout=300):
    creative = creative or {}
    seed = seed if seed is not None else int(time.time()) % 100000
    graph = build_graph(intention, count, creative, seed)
    req = urllib.request.Request(
        comfy_url.rstrip("/") + "/prompt",
        data=json.dumps({"prompt": graph, "client_id": "compose"}).encode(),
        headers={"Content-Type": "application/json"})
    pid = json.load(urllib.request.urlopen(req, timeout=60))["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < timeout:
        with urllib.request.urlopen(f"{comfy_url}/history/{pid}", timeout=30) as r:
            hist = json.load(r)
        if pid in hist:
            entry = hist[pid]
            errors = [m for m in entry.get("status", {}).get("messages", [])
                      if m[0] == "execution_error"]
            if errors:
                raise RuntimeError(errors[0][1].get("exception_message", "erreur"))
            text = "".join(entry.get("outputs", {}).get("3", {}).get("text", []))
            scenes = parse(text, creative)
            # garde-fou du projet : une scene qui decrit le visage n'est jamais
            # proposee, meme en relecture. Elle serait en concurrence avec PuLID.
            gardees = []
            for sc in scenes:
                frags = [sc["prompt"], *sc["variants"], *sc["wardrobe"].values()]
                try:
                    import lena_batch
                    lena_batch.assert_no_face(frags, sc["id"])
                except Exception:
                    continue
                sc["alertes"] = alertes(sc)
                gardees.append(sc)
            return gardees, text
        time.sleep(1.5)
    raise TimeoutError("le modele de langage n'a pas repondu")


if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import lena_batch
    scenes, raw = compose(" ".join(sys.argv[1:]) or "Lena jardine le matin",
                          creative=lena_batch.load_creative())
    print(json.dumps(scenes, ensure_ascii=False, indent=2))
