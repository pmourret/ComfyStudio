"""Local rendering of an OpenPose keypoint frame to a skeleton PNG.

Pure 2D drawing — circles and colored lines at known coordinates — never a
model, so it needs neither ComfyUI nor a GPU. That is what lets a pose be
edited and re-saved with ComfyUI stopped: only the ORIGINAL extraction (a
real neural net, DWPose) still needs it. See pose_tools.py for the rest of
the pose bank (extraction, load/save, the JSON sidecar format).

Colors and topology transcribed from comfyui_controlnet_aux's own renderer
(ComfyUI/custom_nodes/comfyui_controlnet_aux/src/custom_controlnet_aux/
dwpose/util.py, draw_bodypose / draw_handpose) — not imported, since that
module lives inside a ComfyUI install's own custom_nodes tree, and importing
across that boundary would couple this studio to wherever a given install
happens to keep it (env_config.py already treats "where ComfyUI lives" as
a per-machine setting, never assumed). Not pixel-identical to the OpenCV
original (PIL's line drawing differs from cv2's ellipse-based strokes), and
that is fine: ControlNet reads structure, not exact anti-aliasing.
"""
import colorsys

from PIL import Image, ImageDraw

# Body-18 (COCO order: nose, neck, R/L shoulder-elbow-wrist, R/L hip-knee-
# ankle, R/L eye, R/L ear). 0-based pairs — the source's 1-based `limbSeq`
# minus 1 on each index.
BODY_LIMBS = [
    (1, 2), (1, 5), (2, 3), (3, 4), (5, 6), (6, 7), (1, 8), (8, 9), (9, 10),
    (1, 11), (11, 12), (12, 13), (1, 0), (0, 14), (14, 16), (0, 15), (15, 17),
]
# One color per LIMB (by position in BODY_LIMBS, not per joint) plus one per
# JOINT (by keypoint index) — same double use as the source's two `zip`
# passes, 18 colors covering both (17 limbs, 18 joints).
BODY_COLORS = [
    (255, 0, 0), (255, 85, 0), (255, 170, 0), (255, 255, 0), (170, 255, 0),
    (85, 255, 0), (0, 255, 0), (0, 255, 85), (0, 255, 170), (0, 255, 255),
    (0, 170, 255), (0, 85, 255), (0, 0, 255), (85, 0, 255), (170, 0, 255),
    (255, 0, 255), (255, 0, 170), (255, 0, 85),
]
BODY_STICK_WIDTH = 8   # full stroke width; the source's `stickwidth=4` is a
                        # half-width fed to cv2.ellipse2Poly, not a diameter
JOINT_RADIUS = 4

# Hand-21: wrist (0) + four fingers of four joints each, same topology for
# both hands. The source colors each of the 20 edges by a full HSV sweep
# rather than a fixed palette — reproduced via the standard-library
# `colorsys`, no new dependency.
HAND_EDGES = [
    (0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8), (0, 9),
    (9, 10), (10, 11), (11, 12), (0, 13), (13, 14), (14, 15), (15, 16),
    (0, 17), (17, 18), (18, 19), (19, 20),
]
HAND_LINE_WIDTH = 2
HAND_JOINT_COLOR = (0, 0, 255)
HAND_JOINT_RADIUS = 4


def _hand_edge_color(index):
    r, g, b = colorsys.hsv_to_rgb(index / len(HAND_EDGES), 1.0, 1.0)
    return (round(r * 255), round(g * 255), round(b * 255))


def _points(flat, count):
    """`[x, y, c, x, y, c, ...]` -> `[(x, y) or None, ...]`, one entry per
    point. `None` for a point whose confidence is 0 (undetected — same
    convention the extraction itself uses) or when `flat` is missing/short
    (an absent limb, e.g. a hand key on a body-only frame)."""
    if len(flat) < count * 3:
        return [None] * count
    out = []
    for i in range(count):
        x, y, c = flat[i * 3:i * 3 + 3]
        out.append((x, y) if c and c > 0 else None)
    return out


def render(frame):
    """One OpenPose frame (the shape `pose_tools.py` reads/writes) -> a
    black-background RGB `PIL.Image`, body + both hands. Single-person only
    (`people[0]`) — this studio never extracts more than one subject."""
    person = frame["people"][0]
    width = frame["canvas_width"]
    height = frame["canvas_height"]
    img = Image.new("RGB", (int(width), int(height)), (0, 0, 0))
    draw = ImageDraw.Draw(img)

    body = _points(person.get("pose_keypoints_2d") or [], 18)
    for (a, b), color in zip(BODY_LIMBS, BODY_COLORS):
        if body[a] is None or body[b] is None:
            continue
        dark = tuple(round(c * 0.6) for c in color)
        draw.line([body[a], body[b]], fill=dark, width=BODY_STICK_WIDTH)
    for point, color in zip(body, BODY_COLORS):
        if point is None:
            continue
        x, y = point
        draw.ellipse(
            [x - JOINT_RADIUS, y - JOINT_RADIUS, x + JOINT_RADIUS, y + JOINT_RADIUS],
            fill=color)

    for key in ("hand_left_keypoints_2d", "hand_right_keypoints_2d"):
        hand = _points(person.get(key) or [], 21)
        for index, (a, b) in enumerate(HAND_EDGES):
            if hand[a] is None or hand[b] is None:
                continue
            draw.line([hand[a], hand[b]], fill=_hand_edge_color(index), width=HAND_LINE_WIDTH)
        for point in hand:
            if point is None:
                continue
            x, y = point
            draw.ellipse(
                [x - HAND_JOINT_RADIUS, y - HAND_JOINT_RADIUS,
                 x + HAND_JOINT_RADIUS, y + HAND_JOINT_RADIUS],
                fill=HAND_JOINT_COLOR)

    return img
