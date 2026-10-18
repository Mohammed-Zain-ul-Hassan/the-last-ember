#!/usr/bin/env python3
"""The Last Ember, trailer v2 score: original, synthesised in numpy (no samples, no third-party audio).

One grid for both acts (BPM from shotlist.json, 4/4). The arrangement is not written here bar by bar: it follows the
`cues` list that plan_v2.py writes into shotlist.json (section name + bars), so the score always fits the cut.
  Act I  (the Still City): D Phrygian, half-time: a drone, a sparse piano, a slow clock, a heartbeat for the stalker.
  Act II (the Hearth):     D Aeolian, full time: pulse, taiko, choir, brass; a Shepard riser into the climax; dawn
                           turns to D major. Braams and booms mark the act card, the title and the drop.
Recipes (braam, Shepard riser, heartbeat, whoosh, reverse swell, formant choir): docs/trailer-v2.md, "Sound".

  python3 trailer/scripts/score_v2.py   ->  trailer/music/score_v2.wav (48 kHz stereo)
Run with the Videos venv (numpy + scipy): /Users/zain/Videos/.venv/bin/python
"""
import json
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sawtooth, sosfilt

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
plan = json.loads((ROOT / "shotlist.json").read_text())
BPM = plan["bpm"]
BEAT = 60 / BPM
BAR = BEAT * 4
TOTAL_BARS = plan["duration"] / BAR
TAIL = 2.5
N = int((plan["duration"] + TAIL) * SR)
rng = np.random.default_rng(7)

stems = {k: np.zeros((N, 2), np.float32) for k in ["pad", "ost", "piano", "choir", "drums", "brass", "fx", "drone", "tick"]}


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env(n, a=0.01, d=None, r=0.1, sustain=1.0):
    """attack / (optional exp decay) / release envelope over n samples."""
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    if d:
        e = e * (sustain + (1 - sustain) * np.exp(-t / d))
    rel = int(r * SR)
    if rel and n > rel:
        e[-rel:] *= np.linspace(1, 0, rel) ** 1.5
    return e.astype(np.float32)


def put(stem, sig, t0, gain=1.0, pan=0.0):
    i = int(round(t0 * SR))
    if i < 0:  # (a lead-in before the first frame: keep only what falls inside)
        sig, i = sig[-i:], 0
    if i >= N or len(sig) == 0:
        return
    sig = sig[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    stems[stem][i : i + len(sig), 0] += sig * gain * l * 1.414
    stems[stem][i : i + len(sig), 1] += sig * gain * r * 1.414


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x, axis=0).astype(np.float32)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x, axis=0).astype(np.float32)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x, axis=0).astype(np.float32)


def saw(f, n, detune=0.0, vib=0.0):
    t = np.arange(n) / SR
    ff = f * 2 ** (detune / 1200) * (1 + vib * np.sin(2 * np.pi * 5.2 * t + rng.random() * 6))
    ph = np.cumsum(ff) / SR
    return sawtooth(2 * np.pi * ph + rng.random() * 6).astype(np.float32)


# ---------------------------------------------------------------- instruments
def pad_chord(notes, t0, dur, gain, bright=0.0):
    n = int((dur + 1.2) * SR)
    sig = np.zeros(n, np.float32)
    for m in notes:
        for dt in (-7, 7):
            sig += saw(hz(m), n, dt) * 0.12
    sig = lp(sig, 1400 + 2600 * bright) * env(n, a=0.5, r=1.2)
    put("pad", sig, t0, gain, pan=rng.uniform(-0.2, 0.2))


def pluck_bass(m, t0, gain, length=0.32):
    n = int(length * SR)
    sig = (saw(hz(m), n) * 0.6 + saw(hz(m) * 2, n, 5) * 0.25)
    sig = lp(sig, 900) * env(n, a=0.004, d=0.12, sustain=0.1, r=0.05)
    put("ost", sig, t0, gain)


def piano(m, t0, gain, length=2.6, pan=0.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(m)
    sig = np.zeros(n, np.float32)
    for k, a in [(1, 0.6), (2, 0.28), (3, 0.13), (4, 0.07), (5, 0.03)]:
        fk = f * k * (1 + 0.0004 * k * k)
        sig += (a * np.sin(2 * np.pi * fk * t) * np.exp(-t * (1.2 + 0.9 * k))).astype(np.float32)
    sig *= env(n, a=0.003, r=0.3)
    put("piano", sig, t0, gain, pan)


def choir(notes, t0, dur, gain, vowel=(700, 1220, 2600)):
    n = int((dur + 1.0) * SR)
    sig = np.zeros(n, np.float32)
    for m in notes:
        for dt in (-9, 0, 9):
            sig += saw(hz(m), n, dt, vib=0.004) * 0.1
    f1, f2, f3 = vowel
    v = bp(sig, f1 * 0.8, f1 * 1.2) * 1.0 + bp(sig, f2 * 0.85, f2 * 1.15) * 0.6 + bp(sig, f3 * 0.9, f3 * 1.1) * 0.25
    v *= env(n, a=0.7, r=1.0)
    put("choir", v, t0, gain, pan=rng.uniform(-0.3, 0.3))


def taiko(t0, gain, pitch=1.0, pan=0.0):
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    f = (48 + 95 * np.exp(-t * 18)) * pitch
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
    skin = lp(rng.standard_normal(n).astype(np.float32), 900) * np.exp(-t * 28) * 0.5
    put("drums", (body + skin).astype(np.float32), t0, gain, pan)


def snare(t0, gain, pan=0.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    s = bp(rng.standard_normal(n).astype(np.float32), 1200, 5200) * np.exp(-t * 16) + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.4
    put("drums", s.astype(np.float32), t0, gain * 0.55, pan)


def brass(notes, t0, gain, length=1.1):
    n = int(length * SR)
    sig = np.zeros(n, np.float32)
    for m in notes:
        for dt in (-6, 6):
            sig += saw(hz(m), n, dt) * 0.18
    sig = lp(sig, 1700) * env(n, a=0.025, d=0.35, sustain=0.35, r=0.25)
    put("brass", sig, t0, gain)


def boom(t0, gain):
    n = int(4.0 * SR)
    t = np.arange(n) / SR
    f = 26 + 40 * np.exp(-t * 2.2)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.1)
    noise = lp(rng.standard_normal(n).astype(np.float32), 260) * np.exp(-t * 3.5) * 0.7
    crack = hp(rng.standard_normal(n).astype(np.float32), 2500) * np.exp(-t * 40) * 0.35
    put("fx", (sub + noise + crack).astype(np.float32), t0, gain)


def bell(m, t0, gain, length=5.0, pan=0.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = hz(m)
    sig = np.zeros(n, np.float32)
    for r, a in [(1, 0.5), (2.0, 0.3), (2.76, 0.22), (5.4, 0.12), (8.93, 0.06)]:
        sig += (a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * (0.45 + r * 0.35))).astype(np.float32)
    put("fx", sig * env(n, a=0.002, r=0.5), t0, gain, pan)


def riser(t0, dur, gain):
    n = int(dur * SR)
    t = np.arange(n) / SR
    k = t / dur
    f = 90 * (14 ** k)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + sawtooth(2 * np.pi * np.cumsum(f * 0.5) / SR) * 0.15
    noise = hp(rng.standard_normal(n).astype(np.float32), 1500) * 0.5
    sig = (tone + noise * k) * (k ** 2.2)
    put("fx", sig.astype(np.float32), t0, gain)


def tick(t0, gain, hi=True):
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    s = bp(rng.standard_normal(n).astype(np.float32), 2800 if hi else 1900, 6500) * np.exp(-t * 160)
    put("tick", s.astype(np.float32), t0, gain, 0.25 if hi else -0.25)


def drone(m, t0, dur, gain):
    n = int((dur + 1.5) * SR)
    sig = (saw(hz(m), n, -4) + saw(hz(m), n, 4) + saw(hz(m + 12), n) * 0.4) * 0.3
    sig = lp(sig, 420) * env(n, a=0.8, r=1.5)
    put("drone", sig, t0, gain)


# ---------------------------------------------------------------- harmony + motif
DM, BB, GM, A7 = [50, 57, 62, 65, 69], [46, 53, 58, 62, 65], [43, 50, 55, 58, 62], [45, 52, 57, 61, 64]
D_, G_, A_ = [50, 57, 62, 66, 69], [43, 50, 55, 59, 62], [45, 52, 57, 61, 64]
PROG = [DM, BB, GM, A7]
ROOTS = {id(DM): 38, id(BB): 34, id(GM): 31, id(A7): 33, id(D_): 38, id(G_): 31, id(A_): 33}
# 4-bar motif (beat, midi, beats): the ember theme
MOTIF = [(0, 69, 1), (1, 74, 1), (2, 77, 1.5), (3.5, 76, 0.5),
         (4, 74, 1), (5, 72, 1), (6, 70, 2),
         (8, 67, 1), (9, 70, 1), (10, 74, 1.5), (11.5, 72, 0.5),
         (12, 69, 2), (14, 73, 1), (15, 76, 1)]
MOTIF_DOWN = [(0, 77, 1.5), (1.5, 76, 0.5), (2, 74, 2), (4, 72, 1), (5, 70, 1), (6, 69, 2), (8, 67, 2), (10, 65, 2), (12, 62, 4)]


def chord_at(bar, major=False):
    if major:
        return [D_, G_, A_, D_][int(bar) % 4]
    return PROG[int(bar) % 4]


def bt(bar, beat=0.0):
    return bar * BAR + beat * BEAT


def motif(bar0, gain, notes=MOTIF, transpose=0, upto=16):
    for b, m, d in notes:
        if b < upto:
            piano(m + transpose, bt(bar0, b), gain, length=max(1.6, d * BEAT + 1.4), pan=0.15)
            piano(m + transpose - 12, bt(bar0, b), gain * 0.35, length=max(1.6, d * BEAT + 1.2), pan=-0.15)


# ---------------------------------------------------------------- v1's section helpers (Act II)
def section_pad(b0, b1, gain, bright=0.0, major=False):
    b = b0
    while b < b1 - 1e-6:
        step = min(1.0, b1 - b)
        pad_chord(chord_at(b, major), bt(b), step * BAR, gain, bright)
        b += step


def section_ost(b0, b1, gain, sixteenth=False):
    b = b0
    while b < b1 - 1e-6:
        root = ROOTS[id(chord_at(b))]
        sub = 4 if sixteenth else 2
        for i in range(4 * sub):
            t = bt(b, i / sub)
            if t >= bt(b1):
                break
            m = root + 12 if i % 4 != 2 else root + 19
            pluck_bass(m, t, gain * (1.0 if i % sub == 0 else 0.75))
        b += 1


def section_drums(b0, b1, gain, mode="drive"):
    b = b0
    while b < b1 - 1e-6:
        if mode == "light":
            taiko(bt(b, 0), gain * 0.8)
            taiko(bt(b, 2.5), gain * 0.45, 1.3)
        elif mode == "drive":
            taiko(bt(b, 0), gain)
            taiko(bt(b, 1.5), gain * 0.5, 1.25, -0.3)
            taiko(bt(b, 2), gain * 0.85)
            snare(bt(b, 3), gain)
            taiko(bt(b, 3.5), gain * 0.45, 1.4, 0.3)
        elif mode == "climax":
            for i in range(8):
                taiko(bt(b, i / 2), gain * (1.0 if i % 2 == 0 else 0.6), 1.0 if i % 4 == 0 else 1.25, (-0.3, 0.3)[i % 2])
            snare(bt(b, 1), gain)
            snare(bt(b, 3), gain)
            for i in range(4):
                snare(bt(b, 3 + i / 4), gain * 0.35 * (i + 1) / 4)
        b += 1


def section_choir(b0, b1, gain, major=False, vowel=(700, 1220, 2600)):
    b = b0
    while b < b1 - 1e-6:
        notes = chord_at(b, major)[2:]
        choir([n + 12 for n in notes[:2]] + [notes[2]], bt(b), min(1, b1 - b) * BAR, gain, vowel)
        b += 1


# Act I's harmony: D Phrygian (i - bII - i - bvii): the semitone above the root is the dread
DM_P, EB, CM = [50, 57, 62, 65, 69], [51, 58, 63, 67, 70], [48, 55, 60, 63, 67]
PHRYG = [DM_P, EB, DM_P, CM]


def chord_p(bar):
    return PHRYG[int(bar) % 4]


# ---------------------------------------------------------------- v2 instruments
def braam(t0, gain, root=38, length=4.5):
    """Detuned saws an octave apart, a filter that opens with the swell and closes again, driven, long tail."""
    n = int(length * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n, np.float32)
    for dt in (-14, -6, 6, 14):
        sig += saw(hz(root), n, dt) * 0.22
    sig += saw(hz(root - 12), n, 3) * 0.3
    # a time-varying low-pass, done as a crossfade between a dark and an open copy along the envelope
    e = np.minimum(1, t / 0.06) * np.exp(-t / 1.6)
    dark, open_ = lp(sig, 220), lp(sig, 1900)
    k = np.clip(np.exp(-t / 0.5), 0, 1).astype(np.float32)
    sig = (open_ * k + dark * (1 - k)) * e.astype(np.float32)
    sig = np.tanh(sig * 2.2) / np.tanh(2.2)
    put("fx", sig.astype(np.float32), t0, gain)


def shepard(t0, dur, gain, f0=55.0, voices=7):
    """A rising tone that never arrives: octave-spaced sines all gliding up, faded in and out over log-frequency."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    period = dur / 1.5
    sig = np.zeros(n, np.float32)
    for k in range(voices):
        oct_ = (k + t / period) % voices
        f = f0 * 2 ** oct_
        amp = np.exp(-0.5 * ((oct_ - voices / 2) / (voices / 5)) ** 2)
        sig += (amp * np.sin(2 * np.pi * np.cumsum(f) / SR)).astype(np.float32)
    sig *= (t / dur) ** 1.4 * 0.3
    put("fx", sig.astype(np.float32), t0, gain)


def heartbeat(t0, gain):
    for dt, g, f0 in ((0.0, 1.0, 120), (0.3, 0.6, 140)):
        n = int(0.25 * SR)
        t = np.arange(n) / SR
        f = 40 + (f0 - 40) * np.exp(-t * 30)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 18)
        put("fx", lp(s.astype(np.float32), 300), t0 + dt, gain * g)


def whoosh(t0, dur, gain, pan=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n).astype(np.float32)
    k = t / dur
    a = np.sin(np.pi * k) ** 2
    lo = bp(noise, 250, 900) * (1 - k)
    hi = bp(noise, 1200, 4200) * k
    put("fx", ((lo + hi) * a).astype(np.float32), t0, gain, pan)


def reverse_swell(t_hit, dur, gain):
    """A reversed bloom that ends one frame before the hit it leads into."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = lp(rng.standard_normal(n).astype(np.float32), 2400) * np.exp(-t * 2.6)
    tone = np.sin(2 * np.pi * hz(62) * t) * np.exp(-t * 2.2) * 0.4
    sig = (noise + tone)[::-1].astype(np.float32)
    put("fx", sig, t_hit - 1 / 60 - dur, gain)


# ---------------------------------------------------------------- sections (names used by cut_v2.py)
def pad_p(b0, b1, gain, bright=0.0):
    b = b0
    while b < b1 - 1e-6:
        step = min(1.0, b1 - b)
        pad_chord(chord_p(b), bt(b), step * BAR, gain, bright)
        b += step


def ticks(b0, b1, gain, every=1.0):
    i = 0
    while bt(b0, i * every) < bt(b1) - 1e-6:
        tick(bt(b0, i * every), gain, i % 2 == 0)
        i += 1


def sparse_piano(b0, b1, gain):
    """The ember theme at half speed, a note every two beats."""
    for b, m, d in MOTIF:
        at = b0 + b / 2 / 4  # beat b of the motif -> half-time
        if at < b1:
            piano(m - 12 + (1 if m % 12 == 3 else 0), bt(at), gain, length=3.5, pan=0.2)


def S_cold(b0, b1):
    braam(bt(b0), 0.8)
    boom(bt(b0), 0.55)
    drone(38, bt(b0), (b1 - b0) * BAR, 0.4)
    k = b0
    while k < b1 - 0.5:
        heartbeat(bt(k), 0.5)
        k += 1
    reverse_swell(bt(b1), 1.6, 0.45)


def S_title(b0, b1):
    braam(bt(b0), 1.0)  # the legend begins
    boom(bt(b0), 1.0)
    bell(74, bt(b0, 0.05), 0.5)
    pad_p(b0 + 0.25, b1, 0.32, 0.1)
    drone(38, bt(b0), (b1 - b0) * BAR, 0.32)


def S_still(b0, b1):
    """The frozen city: a drone, the clock, the theme a note at a time, a pulse under it."""
    drone(38, bt(b0), (b1 - b0) * BAR, 0.4)
    pad_p(b0, b1, 0.28, 0.2)
    ticks(b0, b1, 0.24, every=1)
    sparse_piano(b0, b1, 0.5)
    b = b0
    while b < b1 - 1e-6:
        pluck_bass(ROOTS[id(DM)] + 12, bt(b), 0.4)
        b += 0.5


def S_puzzle(b0, b1):
    """Finding the true angle: the drone, a slow pulse, a bell when it wakes (on the next downbeat). Kept present (not
    a lull): a low taiko on every bar under it."""
    drone(38, bt(b0), (b1 - b0) * BAR, 0.4)
    pad_p(b0, b1, 0.32, 0.25)
    b = b0
    while b < b1 - 1e-6:
        pluck_bass(ROOTS[id(DM)] + 12, bt(b), 0.45)
        pluck_bass(ROOTS[id(DM)] + 13, bt(b, 2), 0.32)  # the Phrygian semitone
        taiko(bt(b), 0.32, 0.8)
        b += 1
    ticks(b0, b1, 0.2, every=1)
    section_choir(b0 + (b1 - b0) / 2, b1, 0.12, vowel=(300, 870, 2240))


def S_stalk(b0, b1):
    """The Wrong Shadow: the heartbeat quickens, low semitone pulses, a reversed swell into the cut."""
    drone(37, bt(b0), (b1 - b0) * BAR, 0.38)
    t, rate = bt(b0), 1.0
    while t < bt(b1) - 0.4:
        heartbeat(t, 0.6)
        t += BAR / 2 / rate
        rate = min(2.2, rate * 1.08)
    b = b0
    while b < b1 - 1e-6:
        pluck_bass(38, bt(b), 0.45)
        pluck_bass(39, bt(b, 1.5), 0.35)
        b += 0.5
    reverse_swell(bt(b1), 1.4, 0.5)


def S_reveal(b0, b1):
    section_choir(b0, b1, 0.32, vowel=(300, 870, 2240))
    drone(38, bt(b0), (b1 - b0) * BAR, 0.35)
    bell(62, bt(b0), 0.4, length=6)
    bell(74, bt(b0, 2), 0.25, length=5)


def S_act(b0, b1):
    """ACT II: one braam, then the room (a single tick lets the silence be heard)."""
    braam(bt(b0), 1.0, root=38)
    boom(bt(b0), 0.8)
    tick(bt(b1 - 0.25), 0.3)


def S_hearth(b0, b1):
    section_pad(b0, b1, 0.38, 0.3)
    section_ost(b0, b1, 0.45)
    section_drums(b0 + min(2, (b1 - b0) / 2), b1, 0.45, "light")
    motif(b0, 0.32)


def S_drive(b0, b1):
    section_pad(b0, b1, 0.4, 0.4)
    section_ost(b0, b1, 0.55)
    section_drums(b0, b1, 0.62, "drive")
    section_choir(b0, b1, 0.3, vowel=(400, 800, 2400))
    b = b0
    while b < b1 - 1e-6:
        brass(chord_at(b)[:3], bt(b), 0.38)
        b += 2


def S_card(b0, b1):
    """A theme card: the music thins to a pad and a bell; the words land on the downbeat."""
    section_pad(b0, b1, 0.3, 0.3)
    bell(69, bt(b0), 0.28)
    whoosh(bt(b0) - 0.35, 0.7, 0.25)


def S_midnight(b0, b1):
    bell(50, bt(b0), 0.45, length=7)
    bell(62, bt(b0), 0.22, length=6)
    drone(26, bt(b0), (b1 - b0) * BAR, 0.25)


def S_escalate(b0, b1):
    mid = b0 + (b1 - b0) * 0.55
    section_pad(b0, b1 - 0.25, 0.42, 0.6)
    section_ost(b0, mid, 0.55)
    section_ost(mid, b1 - 0.25, 0.6, sixteenth=True)
    section_drums(b0, mid, 0.55, "drive")
    section_drums(mid, b1 - 0.25, 0.7, "climax")
    section_choir(b0 + 1, b1 - 0.25, 0.32)
    b = b0
    while b < b1 - 0.5:
        brass(chord_at(b)[:3], bt(b), 0.32)
        b += 1
    shepard(bt(b0), (b1 - b0 - 0.25) * BAR, 0.6)
    riser(bt(b1 - 2), 1.75 * BAR, 0.45)
    # the last beat is silence: the drop lands on it


def S_climax(b0, b1):
    half = b0 + round((b1 - b0) / 2)
    for at in (b0, half):
        boom(bt(at), 1.0 if at == b0 else 0.75)
        braam(bt(at), 0.7)
    section_pad(b0, b1, 0.5, 0.9)
    section_ost(b0, b1, 0.62, sixteenth=True)
    section_drums(b0, b1 - 0.25, 1.0, "climax")
    section_choir(b0, b1, 0.6)
    b = b0
    while b < b1 - 1e-6:
        brass(chord_at(b)[:3], bt(b), 0.55)
        brass(chord_at(b)[:3], bt(b, 2), 0.4)
        b += 1
    motif(b0, 0.4, transpose=12)
    taiko(bt(b1 - 0.25), 1.0)


def S_after(b0, b1):
    drone(26, bt(b0), (b1 - b0) * BAR, 0.5)
    bell(81, bt(b0, 0.5), 0.25, length=4)


def S_dawn(b0, b1):
    section_pad(b0, b1, 0.5, 0.7, major=True)
    section_choir(b0, b1, 0.35, major=True)
    for i, m in enumerate((74, 78, 81)):
        piano(m, bt(b0, i), 0.5, length=4)


def S_montage(b0, b1):
    n = 3
    for i in range(n):
        t = bt(b0 + i * (b1 - b0) / n)
        taiko(t, 1.0)
        boom(t, 0.4)
        bell([74, 77, 81][i], t, 0.3)
    section_pad(b0, b1, 0.4, 0.8, major=True)


def S_end(b0, b1):
    section_pad(b0, b1, 0.35, 0.3)
    motif(b0, 0.45, upto=6)
    bell(62, bt(b0), 0.3, length=6)


def S_silence(b0, b1):
    pass


def S_blitz(b0, b1):
    """The cold open: a hit on every cut (taiko + boom + a crack of noise), a whoosh into each, a driving pulse and
    choir under them, rising; the last hit the biggest."""
    hits = [h for h in plan.get("hits", []) if bt(b0) - 1e-3 <= h < bt(b1)]
    g = 0.7  # 3 dB under the title's braam: the legend must land bigger than the cold open
    section_pad(b0, b1, 0.42 * g, 0.7)
    section_ost(b0, b1, 0.55 * g, sixteenth=True)
    section_choir(b0, b1, 0.35 * g)
    for i, h in enumerate(hits):
        last = i == len(hits) - 1
        taiko(h, 1.0 * g, 1.0 if i % 2 == 0 else 1.2, (-0.3, 0.3)[i % 2])
        boom(h, (0.55 + 0.04 * i + (0.35 if last else 0)) * g)
        snare(h, 0.8 * g)
        whoosh(h - 0.32, 0.32, 0.4 * g, (-0.6, 0.6)[i % 2])
        if i % 2 == 0:
            brass(chord_at(i // 2)[:3], h, (0.35 + 0.03 * i) * g)
    if hits:
        braam(hits[-1], 0.9 * g)
    riser(bt(b0), (b1 - b0) * BAR - 0.4, 0.35 * g)


BLACK = []  # (t0, t1) of the smash to black: the mix is cut to true silence there (after the reverb), see the mix


def S_black(b0, b1):
    """Smash to black: everything cut dead (in the mix), one short sub hit that is gone by half way."""
    BLACK.append((bt(b0), bt(b1)))


def S_credits(b0, b1):
    """The end: the ember theme once more, resolving to D major, a last bell, everything left to ring out."""
    section_pad(b0, b1, 0.38, 0.4, major=True)
    section_choir(b0, b1, 0.22, major=True)
    motif(b0, 0.42, upto=8)
    bell(62, bt(b1 - 1.5), 0.32, length=7)
    bell(74, bt(b1 - 1.5, 0.05), 0.2, length=6)


SECTIONS = {k[2:]: v for k, v in globals().items() if k.startswith("S_")}
for c in plan["cues"]:
    SECTIONS[c["name"]](c["b0"], c["b1"])

# ---------------------------------------------------------------- mix
GAIN = {"pad": 0.55, "ost": 0.5, "piano": 0.55, "choir": 0.5, "drums": 0.75, "brass": 0.42, "fx": 0.8, "drone": 0.5, "tick": 0.45}
SEND = {"pad": 0.35, "ost": 0.12, "piano": 0.45, "choir": 0.5, "drums": 0.2, "brass": 0.25, "fx": 0.4, "drone": 0.3, "tick": 0.15}
dry = np.zeros((N, 2), np.float32)
send = np.zeros((N, 2), np.float32)
for k, s in stems.items():
    dry += s * GAIN[k]
    send += s * GAIN[k] * SEND[k]
# a large stone hall: decorrelated exponential-noise impulse response, 3.2 s
ir_n = int(3.2 * SR)
t = np.arange(ir_n) / SR
ir = (rng.standard_normal((ir_n, 2)) * np.exp(-t / 0.75)[:, None]).astype(np.float32)
ir = lp(ir, 5000)
ir /= np.sqrt((ir ** 2).sum(0))
wet = np.stack([fftconvolve(send[:, c], ir[:, c])[:N] for c in (0, 1)], 1).astype(np.float32)
mix = dry + wet * 0.9
mix = mix + hp(mix, 3200) * 0.9  # air: lift the top so the dark score is not dull
fade = int(2.0 * SR)
end = int((plan["duration"] + TAIL) * SR)
mix[end - fade : end] *= np.linspace(1, 0, fade)[:, None] ** 2
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix *= 0.89 / max(1e-6, np.abs(mix).max())
# the smash to black: true silence (20 ms edges), then one dry sub hit that decays away in under half a second
for t0, t1 in BLACK:
    a, b = int(t0 * SR), int(t1 * SR)
    e = int(0.02 * SR)
    mix[a - e : a] *= np.linspace(1, 0, e)[:, None]
    mix[a:b] = 0
    mix[b : b + e] *= np.linspace(0, 1, e)[:, None]
    n = int(0.45 * SR)
    tt = np.arange(n) / SR
    f = 34 + 56 * np.exp(-tt * 9)
    sub = (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 11) * 0.55).astype(np.float32)
    mix[a : a + n] += sub[:, None]

out = ROOT / "music" / "score_v2.wav"
out.parent.mkdir(exist_ok=True)
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
print(f"wrote {out} ({len(mix) / SR:.1f} s, {TOTAL_BARS:.2f} bars at {BPM} BPM, {len(plan['cues'])} cues)")
