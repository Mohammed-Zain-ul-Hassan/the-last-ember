#!/usr/bin/env python3
"""Builds trailer/shotlist.json for The Last Ember and checks the jam's trailer rules.

Positions are in BARS of the trailer score (80 BPM, 4/4: bar = 3.0 s), so every cut, card and music change
lands on the beat grid. Source in-points are seconds into the deterministic captures in trailer/raw/
(see trailer/clips.md and the contact sheets in trailer/work/sheets/).

  python3 trailer/scripts/plan.py      prints the shot table and the rule checks, writes trailer/shotlist.json
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BPM = 80
BAR = 60 / BPM * 4  # 3.0 s

THEMES = [
    {"name": "FIRE", "how": "the hearth is your life and your weapon",
     "card": ["The hearth is your life, your weapon, your story.", "Feed it embers. Carry its last flame."]},
    {"name": "SHADOW", "how": "they rise from the shadows the fire throws",
     "card": ["Enemies rise from the shadows the fire throws.", "And you are a shadow, guarding the light."]},
    {"name": "TIME", "how": "one night, hour by hour, until dawn",
     "card": ["Each level is one hour of a single night, 7 PM to dawn.", "Between the hours, the past returns."]},
]

shots, overlays = [], []
pos = 0.0  # running position in bars


def dur_of(clip):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(ROOT / "raw" / f"{clip}.mp4")],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


def gp(id, clip, src_in, bars, why):
    """Raw gameplay at 1.0x, nothing opaque on top."""
    global pos
    shots.append({"id": id, "kind": "gameplay", "start": round(pos * BAR, 4), "dur": round(bars * BAR, 4), "src": f"clips/{clip}.mp4",
                  "in": src_in, "speed": 1.0, "raw": True, "why": why})
    pos += bars


def scene(id, clip, src_in, bars, why, subtitle=None, kicker=None):
    """In-engine footage that is NOT gameplay (memories, cutscenes): counted on the produced side."""
    global pos
    s = {"id": id, "kind": "scene", "start": round(pos * BAR, 4), "dur": round(bars * BAR, 4), "src": f"clips/{clip}.mp4", "in": src_in,
         "speed": 1.0, "raw": False, "why": why}
    if subtitle:
        s["subtitle"] = subtitle
    if kicker:
        s["kicker"] = kicker
    shots.append(s)
    pos += bars


def card(id, kind, bars, why, theme=None, clip=None, src_in=None):
    global pos
    s = {"id": id, "kind": kind, "start": round(pos * BAR, 4), "dur": round(bars * BAR, 4), "raw": False, "why": why}
    if theme is not None:
        s["theme"] = theme
    if clip:
        s["src"] = f"clips/{clip}.mp4"
        s["in"] = src_in
    shots.append(s)
    pos += bars


def lower(theme, at_bar, bars, kind="lowerThird"):
    overlays.append({"kind": kind, "start": round(at_bar * BAR, 4), "dur": round(bars * BAR, 4), "theme": theme})


# ---------------------------------------------------------------- the cut
# HOOK: cold open on a charged rend into a crowd at the hearth: purple ring, sparks, a crawler; no logo
gp("hook", "16_11pm_embers_charge", 10.5, 2, "Hook: a charged shadow rend at the hearth, ring of shadow, crawler; impact on frame 1")
# TITLE over the oath footage (the knight kneeling at the hearth), dimmed under the card
card("title", "title", 1.75, "Title: THE LAST EMBER, logline, theme chips FIRE / SHADOW / TIME", clip="01_title_oath", src_in=1.0)
# STORY: the oath, as shadow theatre
scene("mem_oath", "10_memory_oath", 1.4, 1.75, "Story: the oath, the king's blade on the kneeling knight", "Long ago, he swore to keep the fire.", "a memory")
# THEME 1: FIRE
card("card_fire", "card", 1.75, "Theme 1 explainer: Fire, literal", theme=0)
gp("b1_sunset", "02_7pm_sunset_combat", 4.0, 5.25, "Learn: 7 PM sunset on the hearth grounds; the first shades; the knight's moveset")
lower(0, pos - 5.25 + 0.25, 2.25)
gp("b1_embers", "16_11pm_embers_charge", 1.0, 3, "Learn: the hearth burning, embers, fighting at the fire")
# THEME 2: SHADOW
card("card_shadow", "card", 1.75, "Theme 2 explainer: Shadow, literal", theme=1)
gp("b2_rise", "03_9pm_shades_rise", 4.0, 4.75, "Mastery: 9 PM, shades rise from the cast shadows, aerials and slashes")
lower(1, pos - 4.75 + 0.25, 2.25)
gp("b2_crawlers", "04_11pm_hearth_falters", 2.0, 2.5, "Mastery: 11 PM, crawlers and lantern-eaters; the hearth falters")
scene("mem_faces", "11_memory_faces", 1.0, 1.5, "Story: their faces at the hearth", "They slept safe because he kept the fire.", "a memory")
# THEME 3: TIME
card("card_time", "card", 1.75, "Theme 3 explainer: Time, literal", theme=2)
gp("b3_hour", "16_11pm_embers_charge", 16.6, 4.25, "Time: 11 PM, the hour runs, the hearth marker, charged rends")
lower(2, pos - 4.25 + 0.25, 2.25)
scene("mem_fireout", "12_memory_fire_out", 2.0, 1.75, "Story: he closed his eyes; the fire went out", "One night, he closed his eyes.", "a memory")
scene("midnight", "05_midnight_torch", 3.0, 1.5, "Midnight: the hearth dies; he lights a torch from its last flame", None, "midnight")
# ESCALATION: the torch road, cuts accelerating 2 -> 1.5 -> 1 -> 0.75 bars
gp("e_city", "06_1am_carrying_flame", 0.5, 2, "Escalation: 1 AM, the lower city, the torch swings every shadow")
gp("e_roofs", "06_1am_carrying_flame", 6.5, 1.5, "Escalation: rooftops, lantern-eater bolts")
gp("e_wall", "15_5am_city_wall", 0.5, 1.5, "Escalation: 5 AM, the city wall, the torch")
gp("e_lanterns", "15_5am_city_wall", 11.5, 1, "Escalation: lanterns over the wall walk, bolts")
gp("e_slash", "03_9pm_shades_rise", 19.5, 1, "Escalation: a slash trail through a shade")
gp("e_crawler", "04_11pm_hearth_falters", 16.0, 1, "Escalation: a crawler pounces, the cleave answers")
gp("e_sunset", "02_7pm_sunset_combat", 20.5, 0.75, "Escalation: a dash-strike at the hearth")
gp("e_ring", "04_11pm_hearth_falters", 22.0, 0.75, "Escalation: lantern bolts at the falling hearth")
gp("e_nave", "07_3am_great_shade", 30.0, 0.75, "Escalation: the cathedral nave, torch and lanterns")
gp("e_last", "02_7pm_sunset_combat", 26.0, 1, "Escalation: the last breath before the boss")
# CLIMAX: one uninterrupted take, the Hollow Marshal
gp("climax", "07_3am_great_shade", 8.0, 7, "Climax: one uninterrupted 21 s take: the Hollow Marshal, his cry, the waves, the kill")
# AFTERMATH: becoming the shadow, then dawn
scene("mem_shadow", "14_memory_shadow", 3.5, 1.5, "Story: he became what took them; his eye opens", "He did not die that night. He became the dark.", "a memory")
scene("dawn", "08_dawn_light_ending", 9.5, 1.5, "Aftermath: dawn, the choice, he steps into the light", None, "dawn")
# THEME MONTAGE: one bar, three tagged shots
for i, (clip, t) in enumerate([("04_11pm_hearth_falters", 24.5), ("03_9pm_shades_rise", 26.0), ("15_5am_city_wall", 9.0)]):
    gp(f"m_{THEMES[i]['name'].lower()}", clip, t, 1 / 3 if i < 2 else 1 / 3, f"Theme montage: {THEMES[i]['name']}")
    lower(i, pos - 1 / 3, 1 / 3, "tag")
card("end", "end", 1.75, "End card: name, play link, themes, Built in 3 days with Claude Code; held 5.25 s")

total = pos * BAR
plan = {
    "fps": 60, "width": 1920, "height": 1080, "bpm": BPM, "bar": BAR, "duration": round(total, 4),
    "url": "the-last-ember-xi.vercel.app",
    "title": "THE LAST EMBER",
    "logline": "A shadow knight. One fire. One night.",
    "themes": THEMES, "shots": shots, "overlays": overlays,
}

# ---------------------------------------------------------------- rule checks (jam-trailer step 4)
for a, b in zip(shots, shots[1:]):
    assert abs(a["start"] + a["dur"] - b["start"]) < 1e-3, f"gap/overlap between {a['id']} and {b['id']}"
assert total <= 179.0, f"too long: {total}"
raw = sum(s["dur"] for s in shots if s["kind"] == "gameplay" and s["raw"])
produced = sum(s["dur"] for s in shots if s["kind"] != "gameplay")
assert raw >= 121.0, f"raw gameplay {raw} < 121 s (rule: >= 120 s, kept a margin)"
assert produced <= 59.0, f"produced {produced} > 59 s"
for i, th in enumerate(THEMES):
    assert any(o["theme"] == i and o["kind"] == "lowerThird" for o in overlays), f"{th['name']} has no lower-third"
    assert any(s.get("theme") == i for s in shots), f"{th['name']} has no card"
end = next(s for s in shots if s["kind"] == "end")
assert end["dur"] >= 5, "end card dwell < 5 s"
for o in overlays:  # overlays (lower-thirds, tags) only ever sit on gameplay
    for s in shots:
        if s["kind"] != "gameplay" and o["start"] < s["start"] + s["dur"] - 1e-3 and o["start"] + o["dur"] > s["start"] + 1e-3:
            raise AssertionError(f"overlay {o} sits on {s['id']}")
lens = {}
for s in shots:  # every source range is inside its capture
    if s.get("src"):
        clip = Path(s["src"]).stem
        lens.setdefault(clip, dur_of(clip))
        assert s["in"] >= 0 and s["in"] + s["dur"] <= lens[clip] + 1e-3, f"{s['id']} out of range ({s['in']}..{s['in'] + s['dur']} of {lens[clip]:.2f})"
used = {}  # no footage is shown twice
for s in shots:
    if s.get("src"):
        for (a0, a1, sid) in used.get(s["src"], []):
            assert s["in"] + s["dur"] <= a0 + 1e-3 or s["in"] >= a1 - 1e-3, f"{s['id']} repeats footage of {sid}"
        used.setdefault(s["src"], []).append((s["in"], s["in"] + s["dur"], s["id"]))
longest = max(s["dur"] for s in shots if s["kind"] == "gameplay")
assert longest >= 20, "no 20 s uninterrupted climax take"

(ROOT / "shotlist.json").write_text(json.dumps(plan, indent=2))
print(f"{'id':12} {'start':>6} {'dur':>5}  {'kind':8} {'source':24} {'in':>6}  why")
for s in shots:
    src = Path(s.get("src", "-")).stem
    m, sec = divmod(s["start"], 60)
    print(f"{s['id']:12} {int(m)}:{sec:05.2f} {s['dur']:5.2f}  {s['kind']:8} {src:24} {s.get('in', 0):6.2f}  {s['why']}")
print(f"\ntotal {total:.2f} s | raw gameplay {raw:.2f} s (gameplay shots at 1.0x, only lower-thirds/tags on top) | "
      f"produced {produced:.2f} s (cards + memories + cutscenes) | longest take {longest:.2f} s")
