"""What the final prompt will really say, shown before launching.

Pure text analysis: no HTTP, no state, no disk. It takes the jobs `build_jobs`
produced and describes them — how long the prompt is, which fragment wrote how
much of it, and which words two fragments are repeating at each other.

Called from /api/plan, which is replayed on every keystroke: keep it cheap and
keep it total (no exception on a weird fragment — the panel is being typed into
while this runs).
"""
import re


# Words too common for an echo between fragments to mean anything.
STOP_WORDS = {
    "with", "and", "the", "her", "his", "from", "into", "over", "onto", "that",
    "this", "some", "very", "more", "than", "then", "they", "them", "have",
    "been", "just", "only", "also", "such", "both", "each", "same", "other",
    "against", "around", "behind", "between", "through", "while", "where",
    "photo", "image", "woman", "shot",
}


def echoes_between_fragments(fragments):
    """Background words coming back in SEVERAL fragments of the prompt.

    Neither a wall nor a judgement: an observation. Two fragments talking about
    the same subject fight each other — measured 26/08/2026 on the `boudoir`
    intention, where the tone said « close intimate framing » and the intention
    « full figure in frame ». The final prompt being shown nowhere, that kind of
    contradiction could only be seen by printing it by hand.

    We return the word and the sources it appears in; the human decides between
    a useful repetition and a contradiction.
    """
    # Grouping on a light stem: without it, « framing » and « frame » are two
    # different words, and that is exactly the conflict we are looking for (a
    # tone's « close intimate framing » against an intention's « full figure in
    # frame »). We generate a word's possible forms and group as soon as they
    # overlap; the word DISPLAYED stays the one that was written.
    def forms(word):
        out = {word}
        for suffix in ("ing", "ed", "s"):
            if word.endswith(suffix) and len(word) - len(suffix) >= 3:
                stem = word[:-len(suffix)]
                out |= {stem, stem + "e"}
        return out

    by_key, key_of = {}, {}
    for f in fragments:
        seen = set()
        for word in re.findall(r"[a-zA-Z]{4,}", f["texte"].lower()):
            if word in STOP_WORDS:
                continue
            # follow the CANONICAL key already recorded for this stem, and not
            # one of the crossed forms: otherwise « frame » seen after
            # « framing » filed itself under its own key and the connection was
            # lost
            common = forms(word) & set(key_of)
            key = key_of[next(iter(common))] if common else word
            if key in seen:
                continue
            seen.add(key)
            for form in forms(word):
                key_of.setdefault(form, key)
            by_key.setdefault(key, {"mots": set(), "sources": []})
            by_key[key]["mots"].add(word)
            by_key[key]["sources"].append(f["source"])
    echoes = [{"mot": " / ".join(sorted(v["mots"])), "sources": v["sources"]}
              for v in by_key.values() if len(v["sources"]) > 1]
    # the most shared first: they are the likeliest to be fighting
    echoes.sort(key=lambda e: (-len(e["sources"]), e["mot"]))
    return echoes[:8]


def prompt_preview(jobs):
    """What actually goes out, shown before launching.

    On a typical scene, 69 % of the final prompt is assembled out of sight of
    whoever writes the scene (measured 26/08/2026: 179 characters written out
    of 578). Until that was displayed, a failed result could not be diagnosed.
    """
    if not jobs:
        return None
    j = jobs[0]
    fragments = j.get("fragments") or []
    total = len(j["prompt"])
    return {
        "total_car": total,
        "n_jobs": len(jobs),
        "scene": j["scene"],
        "fragments": [{**f, "part": round(100 * len(f["texte"]) / total)
                       if total else 0} for f in fragments],
        "echos": echoes_between_fragments(fragments),
    }

