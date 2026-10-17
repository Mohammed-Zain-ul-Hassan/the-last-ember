#!/usr/bin/env python3
"""Trailer v2 for The Last Ember (both acts): builds trailer/shotlist.json and checks the jam's trailer rules.

Positions are in BARS of the v2 score (BPM below, 4/4), so every cut, card and music change lands on the beat grid.
In-points are not typed by hand: each gameplay shot names a take (trailer/scripts/capture-v2.mjs) and an ANCHOR, an
event in that take's <take>-moments.json (written by the game while it records), and starts `pre` seconds before it:

    "wake#2@market"   the 2nd 'wake' event in the Market        "district@temple"   entering the Temple
    "mode:midnight"   Act II switching to the midnight scene    "t=12.5"            12.5 s into the take

Until a take is captured its shots are marked missing and render as slates (the animatic: cards, lines and score
play for real). The beat sheet and why each beat is where it is: docs/trailer-v2.md.

  python3 trailer/scripts/plan_v2.py          print the shot table and the rule checks, write trailer/shotlist.json
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
BPM = 120
BAR = 60 / BPM * 4  # 2.0 s: Act I plays half-time over it, Act II full time

THEMES = []  # filled in the cut below
shots, overlays, notes, cues = [], [], [], []
pos = 0.0  # running position in bars
_moments, _lens = {}, {}


def moments(take):
    if take not in _moments:
        f = RAW / f"{take}-moments.json"
        _moments[take] = json.loads(f.read_text()) if f.exists() else None
    return _moments[take]


def length(take):
    if take not in _lens:
        f = RAW / f"{take}.mp4"
        _lens[take] = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                                           capture_output=True, text=True, check=True).stdout) if f.exists() else None
    return _lens[take]


def resolve(take, anchor, pre):
    """Seconds into the take for this anchor, or None while the take (or the event) is not there yet."""
    if anchor.startswith("t="):
        return float(anchor[2:]) if length(take) else None
    m = moments(take)
    if m is None or length(take) is None:
        return None
    where = None
    if "@" in anchor:
        anchor, where = anchor.split("@", 1)
    n = 1
    if "#" in anchor:
        anchor, k = anchor.split("#", 1)
        n = int(k)
    hits = [e for e in m if e.get("type") == anchor and (where is None or e.get("d") == where or e.get("hour") == where)]
    if len(hits) < n:
        notes.append(f"{take}: no {anchor}#{n}{'@' + where if where else ''} (found {len(hits)})")
        return None
    return max(0.0, hits[n - 1]["t"] - pre)


def _shot(kind, id, take, anchor, bars, why, pre, raw, **extra):
    global pos
    t_in = resolve(take, anchor, pre)
    s = {"id": id, "kind": kind, "start": round(pos * BAR, 4), "dur": round(bars * BAR, 4), "src": f"clips/{take}.mp4", "in": t_in if t_in is not None else 0.0,
         "speed": 1.0, "raw": raw, "why": why, "anchor": anchor, "missing": t_in is None, **extra}
    shots.append(s)
    pos += bars
    return s


def gp(id, take, anchor, bars, why, pre=1.0, vol=1.0):
    """Raw gameplay, screen-recorded with its HUD and sound, at 1.0x; nothing opaque on top."""
    return _shot("gameplay", id, take, anchor, bars, why, pre, True, vol=vol)


def scene(id, take, anchor, bars, why, pre=0.5, subtitle=None, kicker=None):  # noqa: PLR0913
    """In-engine footage that is not play (the bridge, midnight, dawn, the Heart): counted on the produced side."""
    return _shot("scene", id, take, anchor, bars, why, pre, False, vol=0.9, **({"subtitle": subtitle} if subtitle else {}), **({"kicker": kicker} if kicker else {}))


def card(id, kind, bars, why, **extra):
    global pos
    shots.append({"id": id, "kind": kind, "start": round(pos * BAR, 4), "dur": round(bars * BAR, 4), "raw": False, "why": why, **extra})
    pos += bars


def cue(name):
    """The score's section from here to the next cue (score_v2.py renders it by name)."""
    if cues:
        cues[-1]["b1"] = pos
    cues.append({"name": name, "b0": pos, "b1": None})


def over(kind, at_bar, bars, theme=0, text=None):
    o = {"kind": kind, "start": round(at_bar * BAR, 4), "dur": round(bars * BAR, 4), "theme": theme}
    if text:
        o["text"] = text
    overlays.append(o)


# ---------------------------------------------------------------- the cut (filled from docs/trailer-v2.md)
from cut_v2 import THEMES as _T, build  # noqa: E402  (the beat sheet lives beside this file)

THEMES.extend(_T)
build(gp=gp, scene=scene, card=card, over=over, cue=cue, here=lambda: pos)
cues[-1]["b1"] = pos

total = pos * BAR
plan = {
    "fps": 60, "width": 1920, "height": 1080, "bpm": BPM, "bar": BAR, "duration": round(total, 4),
    "url": "the-last-ember-xi.vercel.app",
    "title": "THE LAST EMBER",
    "logline": "Carry the last fire. Hold back the night.",
    "themes": THEMES, "shots": shots, "overlays": overlays, "cues": cues,
}

# ---------------------------------------------------------------- rule checks (handbook + jam-trailer step 4)
for a, b in zip(shots, shots[1:]):
    assert abs(a["start"] + a["dur"] - b["start"]) < 1e-3, f"gap/overlap between {a['id']} and {b['id']}"
assert total <= 179.0, f"too long: {total:.2f} s"
raw = sum(s["dur"] for s in shots if s["kind"] == "gameplay" and s["raw"])
produced = total - raw
assert raw >= 121.0, f"raw gameplay {raw:.2f} s < 121 s (rule: >= 120 s, kept a margin)"
assert produced <= 59.0, f"produced {produced:.2f} s > 59 s"
for i, th in enumerate(THEMES):
    assert any(o["theme"] == i and o["kind"] == "lowerThird" for o in overlays), f"{th['name']} has no lower-third over gameplay"
    assert any(s.get("theme") == i for s in shots), f"{th['name']} has no explainer card"
end = next(s for s in shots if s["kind"] == "end")
assert end["dur"] >= 5, "end card dwell < 5 s"
for o in overlays:  # overlays only ever sit on gameplay
    for s in shots:
        if s["kind"] != "gameplay" and o["start"] < s["start"] + s["dur"] - 1e-3 and o["start"] + o["dur"] > s["start"] + 1e-3:
            raise AssertionError(f"overlay {o['kind']} at {o['start']} sits on {s['id']} ({s['kind']})")
for s in shots:  # every captured source range is inside its take
    if s.get("src") and not s.get("missing"):
        n = length(Path(s["src"]).stem)
        assert s["in"] + s["dur"] <= n + 1e-3, f"{s['id']} runs past the end of its take ({s['in']:.2f}+{s['dur']:.2f} > {n:.2f})"
used = {}  # no footage shown twice
for s in shots:
    if s.get("src") and not s.get("missing"):
        for (a0, a1, sid) in used.get(s["src"], []):
            assert s["in"] + s["dur"] <= a0 + 1e-3 or s["in"] >= a1 - 1e-3, f"{s['id']} repeats footage of {sid}"
        used.setdefault(s["src"], []).append((s["in"], s["in"] + s["dur"], s["id"]))
covered = sum(o["dur"] for o in overlays if o["kind"] in ("lowerThird", "line"))
strict = raw - covered  # the harshest reading: no second with lettering over it counts as raw
longest = max(s["dur"] for s in shots if s["kind"] == "gameplay")
assert longest >= 20, "no 20 s uninterrupted take"
for o in overlays:  # text is read, not glimpsed
    if o["kind"] in ("lowerThird", "line"):
        assert o["dur"] >= 2.5, f"{o['kind']} at {o['start']} is on screen < 2.5 s"
    if o.get("text"):
        assert len(o["text"].split()) <= 12, f"line too long to read: {o['text']}"

(ROOT / "shotlist.json").write_text(json.dumps(plan, indent=2))
print(f"{'id':14} {'start':>7} {'dur':>5}  {'kind':8} {'take':14} {'in':>7}  anchor / why")
for s in shots:
    m, sec = divmod(s["start"], 60)
    take = Path(s.get("src", "-")).stem
    tin = "  -  " if s.get("missing") or not s.get("src") else f"{s['in']:7.2f}"
    print(f"{s['id']:14} {int(m)}:{sec:05.2f} {s['dur']:5.2f}  {s['kind']:8} {take:14} {tin:>7}  {s.get('anchor', '')}  {s['why']}")
missing = sorted({Path(s['src']).stem for s in shots if s.get('missing')})
print(f"\ntotal {total:.2f} s | raw gameplay {raw:.2f} s (gameplay shots at 1.0x, only lower-thirds/lines/tags over them) | "
      f"produced {produced:.2f} s | longest take {longest:.2f} s | overlays {len(overlays)}")
print(f"strictest count (no second under a lower-third or story line): raw {strict:.2f} s")
print(f"takes not captured yet (slates): {', '.join(missing) if missing else 'none'}")
for n in notes:
    print("note:", n)
