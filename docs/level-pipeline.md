# Level Design Pipeline

Encounter design → Graybox → Playtest → Revise → Environment art.

Demo Course is authored and frozen first; story climb reuses the same movement grammar.

**Story / narrative authority:** [`level_design.md`](level_design.md) — mode tradeoffs, encounter rules, Ashen Cloister map. **Look / lighting:** [`environment-art-direction.md`](environment-art-direction.md). Always read both before redesigning `ember_climb`.

## Player metrics (authority)

From `src/config.ts` (runner profile unless noted):

| Verb | Metric |
|------|--------|
| Walk / run / sprint | 6 / 7.5 / up to 10.5 m/s |
| Jump peak / airtime | ~1.5 m / ~0.7 s (`jumpVelocity` 8.5, `gravity` -24) |
| Comfortable jump gap | 3.0–3.5 m (walk); 4–5 m (run) |
| Chrono-dash | 16 m/s horizontal, +1.5 lift, 1 air charge / airborne |
| Chrono-dash gap | 6.0–7.0 m (normal jump alone fails) |
| Step-up | ≤0.4 m |
| Slide tunnel | Ceiling underside ≈ floor top + 2.0 m; approach ≥5.5 m/s; runway ≥10 m |
| Stair riser | ≤0.35 m |
| Shadow jump | Weaker (6.0) — **demo is designed for runner** |

### Demo frozen metrics

Locked after graybox playtest (do not change art colliders without a revise pass):

| Beat | Value |
|------|-------|
| Jump gap clear width | **3.2 m** |
| Chrono-dash gap clear width | **6.5 m** |
| Hop rise | **1.0 m** |
| Slide runway length | **12 m** |
| Slide ceiling underside | **floor + 2.0 m** |
| Slide tunnel length | **7 m** |
| Stair riser / tread | **0.35 m / 1.35 m** |
| Combo jump gap | **2.8 m** |
| Combo dash gap | **6.0 m** |

Course axis: +X right, +Y up, toward finish = **−Z**. Floor band A (walk→dash) top at **y = 0**; post-hop band top at **y = 1**; finish plaza top at **y = 3.1**.

---

## Demo Course beat sheet

| # | Beat | Intent | Fail | Success | Empties / spawns |
|---|------|--------|------|---------|------------------|
| 1 | Walk | Teach forward | Fall off rails | Reach jump takeoff | `PlayerSpawn` |
| 2 | Jump gap | Walk-jump across 3.2 m | Fall in pit | Land on far pad | — |
| 3 | Chrono-dash gap | Air Space dash across 6.5 m | Fall (jump alone) | Land far pad | — |
| 4 | Hop ledge | Jump up +1.0 m | Bonk / miss | Stand on raised floor | — |
| 5 | Sprint + slide | Build speed, C-slide under | Stand-block at ceiling | Exit tunnel crouched/sliding | — |
| 6 | Still enemy | LMB/RMB on static | Ignore / die to contact | Dummy down | `Enemy_Still` |
| 7 | Stairs | Step-ups ≤0.35 | — | Reach combo height | — |
| 8 | Combo | Jump → air-dash → still | Miss dash / leave dummy | Dummy down on far pad | `Enemy_Combo` |
| 9 | Finish | Closure | — | Stand on plaza | — |

HUD strings are owned by `DemoCourse.objectiveFor` / demo GLB objective bands.

---

## Story Ember Climb beat sheet

**Market Ash** — bounded **ring** district (see [`level_design.md`](level_design.md) §8). Not a linear spine. Combat + parkour share volumes; mid-fight Q-swaps rewarded. Palette: ink + ember **plus** teal, violet, bone, chrono-green, cool stone/wood/moss (not orange-only).

| Beat | Place | Encounter | Path | Empties |
|------|--------|-----------|------|---------|
| Hub | Courtyard | 1 static + 1 rusher | Gate or lean-to | `PlayerSpawn`, `Enemy_01`–`02` |
| Bowl | Walled market | Ground + balcony | Nest / kite / 3 exits | `Enemy_03`–`08` |
| Nest | Gallery + east tower | Optional roof rusher | Nest A | `Enemy_09` |
| West | Bounded alley | — | Loop to north/plaza | — |
| East | Roof lane (stairs clear) | — | Bypass C | — |
| Under | Undercroft | Cover / slide | Kite B → north | — |
| North | Court converge | — | Ground or roof drop | — |
| Climax | Hearth plaza | Defense → boss | Required | `WifeAnchor`, `WaveSpawn_*`, `BossArena` |

Climb enemies sorted by name: even index → static, odd → rusher (`LevelLoader` + `WaveDirector`).

### Story rebuild

- Script: `scripts/build-ember-level.py` → `public/models/levels/ember_climb.glb`
- Design bible: [`level_design.md`](level_design.md)
- Mouse look: plain `requestPointerLock()` (no `unadjustedMovement`) — see `src/main.ts`
