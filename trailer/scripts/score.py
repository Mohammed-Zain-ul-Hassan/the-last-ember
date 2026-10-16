#!/usr/bin/env python3
"""The Last Ember: original trailer score, synthesised in numpy (no samples, no third-party audio).

80 BPM, 4/4, D minor (bar = 3.0 s), arranged bar by bar to trailer/scripts/plan.py:
  hook (driving) -> title (impact, silence, bell) -> memory (piano) -> learn (pulse) -> shadow (choir, toms)
  -> time (a ticking clock) -> the fire goes out (thinning, midnight bell) -> escalation (full, riser)
  -> beat of silence -> DROP for the Marshal climax -> violet drone -> dawn in D major -> three hits -> end.

  python3 trailer/scripts/score.py   ->  trailer/music/score.wav (48 kHz stereo)
Run with the Videos venv (numpy + scipy): /Users/zain/Videos/.venv/bin/python
"""
import json
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sawtooth, sosfilt

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
BPM = 80
BEAT = 60 / BPM
BAR = BEAT * 4
plan = json.loads((ROOT / "shotlist.json").read_text())
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


# ---------------------------------------------------------------- arrangement (bars match plan.py)
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


# HOOK 0-2: already at full tilt, impact on frame 1
boom(0.0, 0.9)
section_pad(0, 2, 0.5, 0.6)
section_ost(0, 2, 0.55, sixteenth=True)
section_drums(0, 2, 0.75, "climax")
section_choir(0, 2, 0.45)
brass(DM[:3], bt(0), 0.5)
brass(BB[:3], bt(1), 0.5)
# TITLE 2-3.75: hard cut to silence, a boom and a bell on the title slam; the pad grows under the logline
boom(bt(2), 1.0)
bell(74, bt(2, 0.05), 0.5)
section_pad(2.25, 3.75, 0.35, 0.1)
drone(38, bt(2), 1.75 * BAR, 0.35)
# MEMORY: THE OATH 3.75-5.5: the ember theme on piano
section_pad(3.75, 5.5, 0.3)
motif(3.75, 0.55, upto=7)
# CARD FIRE 5.5-7.25: warm swell, the theme answers
section_pad(5.5, 7.25, 0.45, 0.4)
section_choir(5.5, 7.25, 0.2)
motif(5.5, 0.45, transpose=0, upto=7)
bell(69, bt(5.5), 0.25)
# LEARN 7.25-15.25: pulse in, light drums from 9.25, choir from 11.25
section_pad(7.25, 15.25, 0.38, 0.3)
section_ost(7.25, 15.25, 0.45)
section_drums(9.25, 15.25, 0.45, "light")
motif(7.25, 0.32)
section_choir(11.25, 15.25, 0.18)
# CARD SHADOW 15.25-17: down to a low drone and a dark choir
drone(38, bt(15.25), 1.75 * BAR, 0.5)
section_choir(15.25, 17, 0.28, vowel=(400, 800, 2400))
riser(bt(16.25), 0.75 * BAR, 0.25)
# MASTERY 17-24.5: shadows rise: drums drive, choir, brass stabs every 2 bars
section_pad(17, 24.5, 0.4, 0.4)
section_ost(17, 24.5, 0.55)
section_drums(17, 24.5, 0.6, "drive")
section_choir(17, 24.5, 0.3, vowel=(400, 800, 2400))
for b in (17, 19, 21, 23):
    brass(chord_at(b)[:3], bt(b), 0.38)
# MEMORY: FACES 24.5-26: piano alone
section_pad(24.5, 26, 0.25)
motif(24.5, 0.5, upto=6)
# CARD TIME 26-27.75 + THE HOUR 27.75-32: a clock starts ticking and never stops until midnight
for i in range(int((32 - 26) * 4)):
    tick(bt(26, i), 0.32, i % 2 == 0)
section_pad(26, 32, 0.35, 0.3)
motif(26, 0.35, upto=7)
section_ost(27.75, 32, 0.5)
section_drums(27.75, 32, 0.5, "drive")
section_choir(29.75, 32, 0.22)
riser(bt(30.5), 1.5 * BAR, 0.3)
# MEMORY: THE FIRE GOES OUT 32-33.75: the theme falls, everything thins
section_pad(32, 33.75, 0.3)
motif(32, 0.5, notes=MOTIF_DOWN)
drone(38, bt(32), 3.25 * BAR, 0.35)
# MIDNIGHT 33.75-35.25: one deep bell, then near silence
bell(50, bt(33.75), 0.42, length=7)
bell(62, bt(33.75), 0.2, length=6)
# ESCALATION 35.25-46.5: the torch road; everything in, getting denser; riser; a beat of silence
section_pad(35.25, 46.25, 0.42, 0.6)
section_ost(35.25, 41.25, 0.55)
section_ost(41.25, 46.25, 0.6, sixteenth=True)
section_drums(35.25, 41.25, 0.55, "drive")
section_drums(41.25, 46.25, 0.7, "climax")
section_choir(37.25, 46.25, 0.32)
for b in range(36, 46):
    brass(chord_at(b)[:3], bt(b), 0.32)
motif(39.25, 0.3)
riser(bt(44.25), 2 * BAR, 0.5)
# (46.25-46.5: one beat of silence)
# CLIMAX 46.5-53.5: the drop. Everything, double drums, choir and brass, hits on 46.5 and 50.5
boom(bt(46.5), 1.0)
boom(bt(50.5), 0.75)
section_pad(46.5, 53.5, 0.5, 0.9)
section_ost(46.5, 53.5, 0.62, sixteenth=True)
section_drums(46.5, 53.25, 1.0, "climax")
section_choir(46.5, 53.5, 0.6)
for b in range(47, 54):
    brass(chord_at(b)[:3], bt(b), 0.55)
    brass(chord_at(b)[:3], bt(b, 2), 0.4)
motif(46.5, 0.4, transpose=12)
motif(50.5, 0.4, transpose=12)
taiko(bt(53.25), 1.0)
# MEMORY: BECOMING THE DARK 53.5-55: silence into a violet drone, one high note
drone(26, bt(53.5), 1.5 * BAR, 0.55)
bell(81, bt(53.75), 0.25, length=4)
# DAWN 55-56.5: D major, the light comes
section_pad(55, 56.5, 0.5, 0.7, major=True)
section_choir(55, 56.5, 0.35, major=True)
piano(74, bt(55), 0.5)
piano(78, bt(55, 1), 0.45)
piano(81, bt(55, 2), 0.5, length=4)
# THEME MONTAGE 56.5-57.5: three hits, one per theme word
for i in range(3):
    t = bt(56.5 + i / 3)
    taiko(t, 1.0)
    boom(t, 0.4)
    bell([74, 77, 81][i], t, 0.3)
section_pad(56.5, 57.5, 0.4, 0.8, major=True)
# END CARD 57.5-59.25: the theme once more, fading
section_pad(57.5, TOTAL_BARS, 0.35, 0.3)
motif(57.5, 0.45, upto=6)
bell(62, bt(57.5), 0.3, length=6)

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
# tail fade and soft limit
fade = int(2.0 * SR)
end = int((plan["duration"] + TAIL) * SR)
mix[end - fade : end] *= np.linspace(1, 0, fade)[:, None] ** 2
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix *= 0.89 / max(1e-6, np.abs(mix).max())

out = ROOT / "music" / "score.wav"
out.parent.mkdir(exist_ok=True)
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
print(f"wrote {out} ({len(mix) / SR:.1f} s, {TOTAL_BARS:.2f} bars at {BPM} BPM)")
