"""Conversion d'un workflow ComfyUI format UI -> format API.

Le runner convertit le fichier que tu edites reellement dans l'interface, au lieu
de maintenir une copie API en parallele qui derive. Gere :
  - le bypass (mode 4) : l'entree du meme type passe a la sortie,
  - le mute (mode 2)   : le lien est coupe,
  - les widgets convertis en entrees,
  - le widget "control_after_generate" ajoute par l'interface apres un seed.
"""
import json
import urllib.request

WIDGET_TYPES = {"INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"}
FRONTEND_ONLY = {"Note", "MarkdownNote", "Reroute", "PrimitiveNode"}
MODE_BYPASS, MODE_MUTE = 4, 2


def fetch_object_info(comfy_url):
    with urllib.request.urlopen(comfy_url.rstrip("/") + "/object_info", timeout=60) as r:
        return json.load(r)


def _inputs_of(obj, node_type):
    spec = obj[node_type]["input"]
    out = []
    for cat in ("required", "optional"):
        for name, v in spec.get(cat, {}).items():
            typ = v[0]
            opts = v[1] if len(v) > 1 else {}
            out.append((name, typ, opts))
    return out


def _is_widget(typ, opts):
    if opts.get("forceInput"):
        return False
    return isinstance(typ, list) or typ in WIDGET_TYPES


def _has_control(name, typ, opts):
    return typ == "INT" and (opts.get("control_after_generate") or
                             name in ("seed", "noise_seed"))


def _widget_values(obj, node):
    """Associe widgets_values (liste positionnelle) aux noms d'entrees."""
    vals = node.get("widgets_values") or []
    if isinstance(vals, dict):                      # format recent possible
        return dict(vals)
    linked = {i["name"] for i in node.get("inputs", []) if i.get("link") is not None}
    widgets = [(n, t, o) for n, t, o in _inputs_of(obj, node["type"]) if _is_widget(t, o)]

    def consume(skip_linked):
        res, i = {}, 0
        for name, typ, opts in widgets:
            if skip_linked and name in linked:
                continue
            if i >= len(vals):
                break
            res[name] = vals[i]
            i += 1
            if _has_control(name, typ, opts):
                i += 1                              # valeur "randomize"/"fixed"
        return res, i

    # Deux conventions coexistent selon la version du frontend : la valeur d'un
    # widget connecte est tantot conservee, tantot omise. On garde celle qui
    # consomme exactement la liste.
    res_skip, used_skip = consume(True)
    res_keep, used_keep = consume(False)
    if used_keep == len(vals) and used_skip != len(vals):
        return {k: v for k, v in res_keep.items() if k not in linked}
    return res_skip


def _group_bounds(ui, title_part):
    for grp in ui.get("groups", []):
        if title_part.lower() in grp.get("title", "").lower():
            return grp["bounding"]
    return None


def nodes_in_group(ui, title_part):
    """Ids des noeuds contenus dans un groupe (test geometrique, comme ComfyUI)."""
    b = _group_bounds(ui, title_part)
    if b is None:
        return []
    gx, gy, gw, gh = b
    ids = []
    for n in ui["nodes"]:
        x, y = n["pos"][0], n["pos"][1]
        w, h = (n.get("size") or [200, 100])[:2]
        if x >= gx and y >= gy and x + w <= gx + gw and y + h <= gy + gh:
            ids.append(n["id"])
    return ids


def _bypass_input(node, slot, otype):
    """Entree qu'un noeud bypasse relie a sa sortie `slot`.

    Meme regle que ComfyUI (`_getBypassSlotIndex` cote frontend) : l'entree de
    MEME INDEX d'abord si son type correspond, la premiere entree du bon type
    seulement en repli. Sans la priorite au meme index, un noeud a plusieurs
    sorties de meme type (ControlNetApplyAdvanced : positive + negative) verrait
    toutes ses sorties retomber sur sa premiere entree.
    """
    inputs = node.get("inputs", [])
    if slot < len(inputs) and inputs[slot].get("type") == otype:
        return inputs[slot]
    for slot_in in inputs:
        if slot_in.get("type") == otype:
            return slot_in
    return None


def convert(ui, obj, active_groups=(), node_modes=None):
    """UI -> API. active_groups : titres (partiels) de groupes a forcer en actif."""
    nodes = {n["id"]: dict(n) for n in ui["nodes"]}
    for title in active_groups:
        for nid in nodes_in_group(ui, title):
            nodes[nid]["mode"] = 0
    for nid, mode in (node_modes or {}).items():
        if nid in nodes:
            nodes[nid]["mode"] = mode

    # link_id -> (node_id, slot)
    src_of = {l[0]: (l[1], l[2]) for l in ui["links"]}

    def skipped(nid):
        return nodes[nid]["mode"] in (MODE_BYPASS, MODE_MUTE)

    def resolve(nid, slot, seen=None):
        """Remonte les noeuds bypasses jusqu'a une vraie source."""
        seen = seen or set()
        while skipped(nid):
            if nodes[nid]["mode"] == MODE_MUTE or nid in seen:
                return None
            seen.add(nid)
            node = nodes[nid]
            if node["type"] in FRONTEND_ONLY:
                return None
            otype = obj[node["type"]]["output"][slot]
            slot_in = _bypass_input(node, slot, otype)
            if slot_in is None or slot_in.get("link") is None:
                return None
            nxt = src_of.get(slot_in["link"])
            if nxt is None:
                return None
            nid, slot = nxt
        return nid, slot

    api = {}
    for nid, node in nodes.items():
        if node["type"] in FRONTEND_ONLY or skipped(nid):
            continue
        if node["type"] not in obj:
            raise KeyError(f"noeud inconnu du serveur : {node['type']} (id {nid})")
        ins = dict(_widget_values(obj, node))
        for slot_in in node.get("inputs", []):
            link = slot_in.get("link")
            if link is None or link not in src_of:
                ins.pop(slot_in["name"], None)
                continue
            r = resolve(*src_of[link])
            if r is None:
                ins.pop(slot_in["name"], None)
                continue
            ins[slot_in["name"]] = [str(r[0]), r[1]]
        api[str(nid)] = {"class_type": node["type"], "inputs": ins,
                         "_meta": {"title": node.get("title") or node["type"]}}
    return api


def find_node(ui, node_type=None, title_contains=None):
    """Retrouve un noeud par type et/ou fragment de titre. Erreur si ambigu."""
    hits = []
    for n in ui["nodes"]:
        if node_type and n["type"] != node_type:
            continue
        if title_contains and title_contains.lower() not in (n.get("title") or "").lower():
            continue
        hits.append(n)
    if not hits:
        raise LookupError(f"noeud introuvable (type={node_type}, titre~{title_contains})")
    if len(hits) > 1:
        raise LookupError(f"noeud ambigu (type={node_type}, titre~{title_contains}) : "
                          f"{[h['id'] for h in hits]}")
    return hits[0]
