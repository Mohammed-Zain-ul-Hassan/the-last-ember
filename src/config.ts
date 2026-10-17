// All gameplay tunables. Units: metres and seconds. Sim runs at a fixed 60 Hz.
export const CFG = {
  dt: 1 / 60,
  gravity: -38,
  arena: { minX: -17, maxX: 17 },

  knight: {
    w: 0.7,
    r: 0.36, // body radius on the ground plane
    h: 2.1,
    turnRate: 16, // rad/s he turns toward where he runs
    dashBuffer: 0.14, // s: a dash pressed this early still comes out
    backpedal: 0.7, // S / down: he steps back facing forward, at this fraction of his run speed
    aimRange: 4.6, // soft aim: swings turn toward a shade this close...
    aimCone: 1.25, // ...within this many radians of where he (or the camera) faces
    maxHp: 100, // health per life
    lives: 3, // shards: lose one when health runs out, rise again at full health
    lifeIframes: 1.8,
    speed: 7.5,
    accel: 70,
    airAccel: 40,
    friction: 55,
    jumpV: 13.5,
    jumpCut: 0.45, // vy multiplier when jump is released early
    coyote: 0.1,
    jumpBuffer: 0.15,
    airJumps: 1, // double jump
    airJumpV: 12.2,
    dashSpeed: 21,
    dashTime: 0.17,
    dashCd: 0.5,
    hurtTime: 0.28,
    hurtKnock: 7,
    iframes: 0.9,
  },

  // windup -> active -> recover; the next step can be buffered any time during the swing.
  // reach = in front, back = behind; multi = hits every shade in range (AOE), otherwise only the nearest one.
  // light combo: single target
  combo: [
    { windup: 0.07, active: 0.09, recover: 0.16, dmg: 1, reach: 2.0, back: 0.3, knock: 3.5, lunge: 3, multi: false },
    { windup: 0.07, active: 0.09, recover: 0.16, dmg: 1, reach: 2.0, back: 0.3, knock: 3.5, lunge: 3, multi: false },
    { windup: 0.12, active: 0.11, recover: 0.3, dmg: 2, reach: 2.3, back: 0.3, knock: 8, lunge: 5, multi: false },
  ],
  // heavy cleave: area of effect, sweeps behind him too
  heavy: { windup: 0.26, active: 0.12, recover: 0.36, dmg: 3, reach: 2.9, back: 1.4, knock: 11, lunge: 4, multi: true },
  // combo moves
  air: { windup: 0.05, active: 0.1, recover: 0.16, dmg: 1, reach: 2.1, back: 0.4, knock: 4, lunge: 2, multi: false }, // attack in the air
  plunge: { windup: 0.14, active: 0, recover: 0.34, dmg: 3, reach: 3.3, back: 3.3, knock: 10, lunge: 0, multi: true }, // heavy in the air: dive + slam
  dashStrike: { windup: 0.03, active: 0.17, recover: 0.24, dmg: 2, reach: 1.5, back: 0.7, knock: 6, lunge: 17, multi: true }, // attack out of a dash: pierce the line
  lunge: { windup: 0.08, active: 0.1, recover: 0.22, dmg: 2, reach: 2.7, back: 0.3, knock: 9, lunge: 10, multi: false }, // attack while running
  // hold attack: after the instant tap-swing, keep holding to charge; release for a wide cleave
  charged: { windup: 0.04, active: 0.14, recover: 0.32, dmg: 2, reach: 3.2, back: 0.9, knock: 13, lunge: 7, multi: true },
  // hold heavy: past holdToCharge (inside the cleave's wind-up) he plants his feet and charges until it is let go
  charge: { holdToCharge: 0.18, full: 1.1, minDmg: 3, maxDmg: 8 },
  airChain: 3, // air attacks per jump
  dashStrikeWindow: 0.16, // seconds after a dash in which attack becomes a dash strike

  shade: {
    w: 0.9,
    r: 0.42,
    h: 1.75,
    riseTime: 0.9,
    attackRange: 1.15,
    hearthRange: 1.5,
    windup: 0.5,
    strikeTime: 0.15,
    attackCd: 0.9,
    hearthDmg: 4, // per strike
    knightDmg: 22, // per strike, out of the knight's 100 health
    bigDmg: 40,
    staggerTime: 0.32,
    lightDps: 0.7, // damage per second at full light
    lightSlow: 0.55, // fraction of speed lost at full light
    aggroRange: 2.6,
    floatSpeed: 2.6, // m/s a shade drifts up or down toward the knight
  },

  // fast, low, in pairs: they crouch (telegraph) and pounce from range
  crawler: { dmg: 16, hpMul: 0.5, speed: 4.4, pounceRange: 3.4, windup: 0.32, pounceSpeed: 10.5, strikeTime: 0.3, cd: 1.5, h: 0.95 },
  // keeps its distance above jump height and spits shadow bolts; light cannot burn it (it eats light)
  lantern: { boltDmg: 14, hp: 3, speed: 2.8, near: 5.5, far: 8.5, hover: 2.5, windup: 0.75, cd: 2.9, boltSpeed: 8.5, boltLife: 3, dimTime: 3, dimMul: 0.55 },
  // How enemies move through the world: they collide with it, and blows throw them around inside it.
  body: {
    climb: { shade: 0.9, crawler: 0.42, lantern: 0 }, // they pass over anything this low; taller solids block them
    ledge: 1.6, // a blocking wall no taller than this above their feet is climbed (they drift up over it); taller: go round
    look: 1.1, // how far ahead a walker checks for a wall before it steers round
    gravity: 30, // for bodies thrown into the air (heavy blows, a lantern knocked out of the sky)
    airDrag: 2.5, // per second, while thrown (on the ground they stop at 6 per second)
    launch: 4.2, // a blow with knock >= launchKnock pops a shade up this fast (m/s)...
    launchPerKnock: 0.2, // ...plus this much per unit of knockback
    launchKnock: 8, // the combo finisher, lunge, cleave, plunge and charged strike launch; quick cuts do not
    juggle: 3, // a hit on a body already in the air keeps it up at least this fast
    getUp: 0.22, // seconds on the ground after a throw before it fights again
    slamSpeed: 4.0, // thrown into a wall faster than this: it slams, bounces back, staggers longer, takes a point
    slamDmg: 1,
    slamBounce: 0.35,
    slamStagger: 0.45,
    pounceStun: 0.9, // a crawler that pounces into a wall lies stunned this long
    bumpSpeed: 4.5, // thrown into another body faster than this: that one is knocked off its feet too
    bumpShare: 0.55,
    lanternFall: 1.25, // a struck lantern-eater is knocked out of the air and lies stunned on the ground this long
  },
  // the Hollow Marshal below half health: a cry, two crawlers, faster, and every strike sends a ground wave
  marshal: { waveDmg: 26, enrageAt: 0.5, speedMul: 1.5, cdMul: 0.6, waveSpeed: 9, waveLife: 1.4 },

  hearth: { x: 0, maxHp: 100, radius: 0.9, emberHeal: 30 },

  // frames of sim freeze
  hitstop: { light: 3, heavy: 7, kill: 5 },
} as const;

// The hero's look and feel. Render-only: the sim never reads these, so tuning them cannot change gameplay.
export const HERO = {
  guardHold: 2.6, // seconds he holds his guard after fighting before he lowers the blade
  fidgetAfter: 2.2, // seconds of standing still before idle fidgets start
  fidgetGap: [4.5, 8.5], // seconds between fidgets
  breathPeriod: 3.9, // one full breath (inhale is quicker than exhale)
  flipTime: 0.46, // the double-jump somersault
  // screen-space aura: life = seconds a wisp survives, rise = figure heights per second, spread = figure heights
  aura: {
    body: { life: 0.4, rise: 0.7, spread: 0.05, intensity: 1.0 },
    sword: { life: 0.09, rise: 0.22, spread: 0.022, intensity: 1.0 },
    smoke: { life: 0.6, rise: 0.9, spread: 0.09, intensity: 0.7 },
    dashLife: 0.55, // trails hang in the air behind a dash
    swingLife: 0.1, // the blade's sheath leaves a short crescent of afterglow behind a swing
    lowHp: 0.3, // below this fraction of health the aura gutters
    // his edge: violet rises out of his shadow toward the silhouette and dissolves outward, no hard line.
    // width: how far the fade reaches each way, in outline widths (~0.6% of his height on screen)
    edge: { width: 6, outer: 0.6, inner: 0.65 },
  },
  swordLight: 5, // light the blade casts on the ground (and his edges) around him
  // he is depth-tested this many metres nearer the camera: rubble, grass and posts he brushes never cut into him,
  // while walls between him and the camera still hide him (the follow camera pulls in past those anyway)
  depthPull: 1.0,
  // the blade's look: 'ember' (blackened steel, molten edges), 'moonsteel' (pale steel, cold edges), 'violet'
  swordPalette: 'ember' as 'ember' | 'moonsteel' | 'violet',
} as const;

export interface MoveSpec {
  windup: number;
  active: number;
  recover: number;
  dmg: number;
  reach: number;
  back: number;
  knock: number;
  lunge: number;
  multi: boolean;
}
export type ComboStep = (typeof CFG.combo)[number];

// Difficulty: one setting for the whole game, stored by src/difficulty.ts. Easy gives the player some leverage, Medium
// is the game as designed (every multiplier 1), Hard is strict. Each act reads its own section: `still` for Act I (the
// Still City), `hearth` for Act II (the hearth defence). Multipliers are against the act's own base tunables.
export interface StillDifficulty {
  alignTol: number; // x the true-angle tolerance (degrees; base 12, or the figure's own)
  alignHold: number; // seconds the angle must be held to lock (base 0.4)
  wrongSpeed: number; // x the Wrong Shadow's walk and sprint
  wrongTouch: number; // vigor its touch takes from the flame
  caughtFatal: boolean; // with no Ash left, being caught ends the run (from the third district on)
  hazard: number; // x what gusts and falling stones take from the flame
  stoneReach: number; // x a falling stone's hit radius (base 0.95 m)
  stoneWarn: number; // seconds of dust before a stone lands
  regen: number; // x how fast the flame recovers
  hintDelay: number; // x the time before the flame's hints climb a tier (stuck 180 s, between tiers 90 s)
  trail: boolean; // the ember trail to the next place
  coach: boolean; // the flame's coaching at a true angle (turn, raise, lower, hold)
}
export interface HearthDifficulty {
  knightDmg: number; // x every blow, bolt and wave that reaches the knight
  hearthDmg: number; // x a shade's strike on the hearth
  enemyHp: number; // x shades' health (rounded, at least 1)
  enemySpeed: number; // x shades' speed
  spawnGap: number; // x the seconds between spawns
  extraShades: number; // + the most shades at once (never under 2)
}
export const DIFFICULTY: Record<'easy' | 'medium' | 'hard', { still: StillDifficulty; hearth: HearthDifficulty }> = {
  easy: {
    still: { alignTol: 1.4, alignHold: 0.25, wrongSpeed: 0.8, wrongTouch: 0.25, caughtFatal: false, hazard: 0.65, stoneReach: 0.8, stoneWarn: 1.2, regen: 1.5, hintDelay: 0.55, trail: true, coach: true },
    hearth: { knightDmg: 0.6, hearthDmg: 0.6, enemyHp: 0.75, enemySpeed: 0.88, spawnGap: 1.25, extraShades: -2 },
  },
  medium: {
    still: { alignTol: 1, alignHold: 0.4, wrongSpeed: 1, wrongTouch: 0.35, caughtFatal: true, hazard: 1, stoneReach: 1, stoneWarn: 0.9, regen: 1, hintDelay: 1, trail: true, coach: true },
    hearth: { knightDmg: 1, hearthDmg: 1, enemyHp: 1, enemySpeed: 1, spawnGap: 1, extraShades: 0 }, // Ahnaf's tuning
  },
  hard: {
    still: { alignTol: 0.65, alignHold: 0.6, wrongSpeed: 1.2, wrongTouch: 0.45, caughtFatal: true, hazard: 1.3, stoneReach: 1.1, stoneWarn: 0.7, regen: 0.6, hintDelay: 3, trail: false, coach: false },
    hearth: { knightDmg: 1.35, hearthDmg: 1.4, enemyHp: 1.25, enemySpeed: 1.12, spawnGap: 0.8, extraShades: 2 },
  },
};
