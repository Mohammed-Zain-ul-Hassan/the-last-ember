// Every tunable in one place. Units: metres, seconds, radians unless noted.

export const CONFIG = {
  arena: {
    radius: 30, // playable disc; the dark beyond is fog
    cell: 0.75, // light/flow grid resolution
    lightGridEvery: 0.1, // seconds between light-grid rebuilds
  },

  hearth: {
    radius: 1.3, // collision + "feeding" reach
    fuelMax: 100,
    fuelStart: 85,
    // flame height (m) is the light's height: it decides how long every shadow is
    heightMin: 1.5,
    heightMax: 3.4,
    // light radius (m) on the ground
    radiusMin: 10,
    radiusMax: 21,
    emberFuel: 5, // fuel returned per freed shade
    feedDrain: 2.0, // fuel/s drained per shade feeding on the hearth
  },

  flare: {
    cost: 12, // fuel (before midnight) or torch embers (after)
    cooldown: 3.2,
    duration: 1.5,
    height: 9, // flame leaps above every stone: all shadows snap short
    radiusMul: 1.3,
    burnMul: 4, // burn damage multiplier while flaring
    waveDamage: 1, // instant damage to shades caught in light at the moment of flare
  },

  torch: {
    height: 2.55, // held above the helm
    radius: 12,
    radiusMin: 8.5,
    embersMax: 100,
    embersStart: 60,
    emberGain: 9,
  },

  knight: {
    radius: 0.42,
    height: 2.05,
    hp: 6,
    speed: 6.6,
    shadowSpeedMul: 1.15, // a shadow knight is quicker in the dark
    accel: 60,
    dashSpeed: 21,
    dashTime: 0.17,
    dashCooldown: 0.55,
    hurtInvuln: 0.9,
    // 3-hit combo
    combo: [
      { windup: 0.05, active: 0.09, recover: 0.16, range: 2.7, arc: 2.5, damage: 1, knock: 3.5 },
      { windup: 0.05, active: 0.09, recover: 0.16, range: 2.7, arc: 2.5, damage: 1, knock: 3.5 },
      { windup: 0.1, active: 0.11, recover: 0.3, range: 3.2, arc: 3.6, damage: 2, knock: 9 },
    ],
    chainWindow: 0.3,
    lunge: 3.2, // forward step per swing (m/s burst)
  },

  shade: {
    burnDps: 1.4, // per second in light, before kind multiplier
    darkRegen: 0.15,
    riseTime: 0.9,
    windup: 0.55,
    attackRange: 1.15,
    attackCooldown: 1.3,
    damage: 1,
    lightSpeedMul: 1.25, // they rush when exposed
    separation: 0.9,
    maxAlive: 42,
    spawnMinFromKnight: 7,
    litCost: 14, // flow-field cost of a lit cell vs 1 for dark
  },

  kinds: {
    wisp: { hp: 1, speed: 3.6, radius: 0.32, burn: 1.4, scale: 0.65 },
    shade: { hp: 3, speed: 2.7, radius: 0.45, burn: 1, scale: 1 },
    brute: { hp: 9, speed: 1.9, radius: 0.75, burn: 0.45, scale: 1.65 },
    boss: { hp: 110, speed: 2.3, radius: 1.5, burn: 0.55, scale: 3.4 },
  },

  boss: {
    darkDamageMul: 0.0, // swords pass through it unless it stands in light
    summonAt: [0.7, 0.4, 0.15],
    summonCount: 7,
  },

  dawn: {
    // the sun climbs behind an eastern ridge; the ridge's shadow recedes across the arena (sim and renderer agree)
    ridgeDist: 70,
    ridgeHeight: 12,
    sweepTime: 26, // seconds for sunlight to cross the arena
    chooseTime: 2.2, // seconds standing in sun light before he is unmade
    sunBurnDps: 6,
  },

  feel: {
    hitStopLight: 0.035,
    hitStopHeavy: 0.085,
    shakeHit: 0.12,
    shakeHeavy: 0.35,
    shakeHurt: 0.5,
    shakeFlare: 0.4,
    timeScaleMidnight: 0.35,
  },

  camera: {
    fov: 30,
    distance: 37,
    pitch: 0.96, // ~55 degrees down
    yaw: 0.0,
    follow: 0.5, // how far the camera leans toward the knight (0 = hearth, 1 = knight)
    lerp: 3.2,
  },

  render: {
    dprCap: 1.5,
    shadowMap: 1024,
    bloomThreshold: 0.82,
    bloomIntensity: 1.25,
    exposure: 1.0,
  },
} as const;

export type KindName = keyof typeof CONFIG.kinds;
