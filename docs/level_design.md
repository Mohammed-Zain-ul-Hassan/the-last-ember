# Level Design Bible

**Authority for all narrative / story levels.** Movement metrics and demo curriculum live in [`level-pipeline.md`](level-pipeline.md); this doc owns mode tradeoffs, encounter rules, and the story graybox grammar. Refer here whenever designing or revising a level.

---

## 1. Mode constraints (from `src/config.ts`)

Form switch (**Q**) is near-instant (`FORMS.transitionTime` ≈ 0.12–0.15 s). Mid-transition input is ignored; design as if the player can swap freely mid-fight.

| | **Runner** | **Shadow combat** |
|--|------------|-------------------|
| Role | Traversal, evasion, reposition | Ranged DPS, deliberate positioning |
| Walk / run / sprint | 6 / 7.5 → 10.5 m/s (momentum) | 1.3 / 2.9 / 4.6 (stamina sprint) |
| Sneak / crouch | Crouch 2.8; slide ≥5.5 m/s | Sneak 1.1; **no slide / no momentum** |
| Jump | 8.5 vertical impulse (~1.5 m peak) | 6.0 — weaker; no mandatory air gaps |
| Combat | Melee vessel only (no shadowballs) | Shadowballs only (charge 0.6 s) |
| Cast limits | — | Shadow form only; blocked while transitioning; **sprint cancels / fizzles** cast |

### Shadowball (not a free-fire “fireball”)

| Stat | Value |
|------|-------|
| Charge | Hold LMB/RMB 0.6 s; early release fizzles |
| Cost | 25 magicka (dual ×2.8 cost, ×2.2 damage) |
| Damage / splash | 30 / 1.0 m (dual splash ×2) |
| Projectile | Speed 22, gravity 0.8, lifetime 3 s, aim `maxRange` 80 m |
| Useful sightline | **15–25 m** for readable fight design |

Nest / cover strategies must allow **standing or sneak** cast. Do not require sprinting while casting.

---

## 2. Time toolkit (what exists)

| Power | Behavior | Design use |
|-------|----------|------------|
| **Recall (E)** | Rewind ~3 s pose history over 0.8 s; 3 s cooldown | Escape pressure, undo a bad commit, kite reset |
| **Chrono-dash (air Space)** | Horizontal 16 m/s + 1.5 lift; 1 charge per airborne | Gap clear 6–7 m; bypass routes; **not** a vertical double jump |

### Banned assumptions

Do **not** design around: time-stop, time-slow, blink/teleport (aside from Recall landing), or mandatory combat-mode parkour.

Environmental “hazards” that are supported today: fall pits, slide tunnels (runner), choke cover, elevation. Prefer **Recall / dash / Q-swap** interactions over inventing new chrono verbs.

---

## 3. Design principles

1. **One composition, both verbs.** Spaces support parkour *and* ranged combat in the same volume — not runner wings glued to combat arenas.
2. **Reward mid-fight Q-swaps.** Elevations, escape ledges, and cover should make switching modes the strong play, not a phase gate.
3. **Elevated firing nests + escape routes.** Shadow nests need a runner path up, sightlines down, and a way out when rushers close.
4. **Multiple approaches.** At least three viable strategies per set piece (see §4). Bypassing enemies is always a valid strategy where story allows.
5. **Fair threat.** Rushers (≈4.2 m/s, contact 8 @ 1.1 m) punish standing still in shadow; statics hold lanes. Never force shadow-only jumps or tight traversal.
6. **Disengage → reposition → re-enter.** Every fight needs a runner exit that reconnects without soft-locking.
7. **Improvisation over scripting.** No mandatory scripted sequences; empties place threats, player chooses order and mode.

---

## 4. Encounter patterns

Every major fight should admit **≥3 strategies**:

| Pattern | Modes | Player loop |
|---------|-------|-------------|
| **Nest** | Runner → Shadow → (Runner relocate) | Climb to gallery/roof → Q → hold-cast → Q and relocate if rushed |
| **Kite** | Shadow ↔ Runner + Recall | Ground cover → cast → Recall / Q-runner when pressured → new angle → Shadow again |
| **Bypass** | Runner (+ chrono-dash) | Roof / flank path around the bowl; enemies optional |

### Enemy placement rules

- Even sorted `Enemy_*` index → **static**; odd → **rusher** (`LevelLoader` + `WaveDirector`).
- Put rushers on ground bowls; put 1–2 statics on balconies for nest pressure.
- Leave ≥1 continuous ground path to the objective (no forced parkour on the spine).
- Plaza defense uses `WifeAnchor`, `WaveSpawn_*`, `BossArena` — keep proximity arming.

---

## 5. Metrics cheat sheet

Reuse frozen demo numbers from [`level-pipeline.md`](level-pipeline.md). Story-specific:

| Metric | Value |
|--------|-------|
| Comfortable runner jump gap | 3.0–3.5 m walk; 4–5 m run |
| Chrono-dash gap | 6.0–7.0 m |
| Step-up / stair riser | ≤0.4 m / ≤0.35 m |
| Slide tunnel (optional only) | Underside ≈ floor + 2.0 m; runway ≥10 m |
| Shadow useful ball range | 15–25 m sightline |
| Cover height (chest) | ≈1.0–1.2 m solid |
| Nest rail / parapet | ≈0.9–1.1 m; open firing notch |
| District footprint | Compact **60–80 m** interconnected, not a long corridor |

---

## 6. Graybox workflow

```
Encounter brief (this bible)
  → Graybox VIS_/COL_ + empties (Blender / build script)
  → Export GLB → load in game
  → Playwright / API checks (spawn, heights, clearances, plaza arm)
  → Human playtest (feel of Q-swaps, fairness)
  → Art pass (multi-material palette — §7)
```

Naming: `VIS_*` visible, `COL_*` collision (`collision` custom prop), empties for spawns. Blender Z-up Y-forward → export Y-up GLB.

---

## 7. Palette / texture mandate

**Forbid orange-only / ember-only dressing.** Ink base + ember accents are fine as *one* channel, not the whole look.

Required variety each story rebuild:

| Role | Examples |
|------|----------|
| Floors | Cobble, cool stone, worn plaster |
| Walls | Brick, mossy stone, timber framing |
| Roofs | Grey / slate / copper-tinged tiles |
| Accents | Teal, violet, bone, chrono-green emissives |
| Warm cue | Ember / gold — sparse braziers and hearth only |

Prefer Poly Haven CC0 PBR sets when available; procedural fallbacks must still hit the hue variety above.

---

## 8. Story district map — Market Ash (current `ember_climb`)

Compact **ring** district (~55–65 m), not a northbound spine. Objective: reach the **hearth plaza** (`WifeAnchor`) via any ring path.

**Bounded streets rule:** outer walls + building shells keep streets as canyons (~6–8 m wide). No open field strips. No single “spine corridor” to the plaza.

**Stair / roof rule:** stair AABBs and roof walk pads must **not overlap in XY**. East climb uses a dedicated tower → bridge → nest → separate bypass pads along the outer wall.

```
              [Hearth Plaza]
                 ↗    ↑    ↖
        [West alley] [North court] [East roof lane]
                 ↖    ↑    ↗
                    [Bowl]
                 ↗  ↕  ↖
           lean-to   undercroft
                    ↕
               [Hub spawn]
```

| Node | Intent | Empties (typical) |
|------|--------|-------------------|
| Courtyard hub | Orient; light intro; 2 ways into bowl | `PlayerSpawn`, `Enemy_01`–`02` |
| Market Bowl | Walled arena; nest / kite / exits | `Enemy_03`–`08` |
| Mid gallery + nest | Nest A; tower climb clear of roofs | `Enemy_09` optional |
| East roof lane | Bypass C → north / plaza | — |
| West alley | Bounded street → north / plaza | — |
| Undercroft | Kite escape / optional slide → north | — |
| North court | Converge; ground or roof drop | — |
| Hearth plaza | Defense → wife boss | `WifeAnchor`, `WaveSpawn_*`, `BossArena` |

### Multi-route beats (every major node ≥2 options)

| From → To | Route A | Route B |
|-----------|---------|---------|
| Hub → Bowl | Ground gate | West lean-to climb → balcony |
| Bowl fight | Ground kite + cover | Gallery nest (stairs ≠ roofs) |
| Bowl → Plaza | West alley | East roof lane |
| Bowl → Plaza | Undercroft | — |
| North → Plaza | Ground arch | Roof drop from east lane |

### Market Bowl — three strategies (verify these)

1. **Nest:** Runner → gallery (clear stairs) → Q shadow → hold-cast → relocate if rushed.
2. **Kite:** Shadow behind cover / undercroft → Recall or Q-runner → re-angle.
3. **Bypass:** East tower → nest bridge → roof pads (no stair overlap) → north/plaza; bowl skippable.

No mandatory jumps on continuous shadow ground paths. All air gaps sit on runner routes only.

### Rebuild

- Script: [`scripts/build-ember-level.py`](../scripts/build-ember-level.py) → `public/models/levels/ember_climb.glb`
- Pipeline pointer: [`level-pipeline.md`](level-pipeline.md)
