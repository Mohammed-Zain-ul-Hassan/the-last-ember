// All gameplay tunables. Units: metres and seconds. Sim runs at a fixed 60 Hz.
export const CFG = {
  dt: 1 / 60,
  gravity: -38,
  arena: { minX: -17, maxX: 17 },

  knight: {
    w: 0.7,
    h: 2.1,
    maxHp: 6,
    speed: 7.5,
    accel: 70,
    airAccel: 40,
    friction: 55,
    jumpV: 13.5,
    jumpCut: 0.45, // vy multiplier when jump is released early
    coyote: 0.1,
    jumpBuffer: 0.12,
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
  airChain: 3, // air attacks per jump
  dashStrikeWindow: 0.16, // seconds after a dash in which attack becomes a dash strike

  shade: {
    w: 0.9,
    h: 1.75,
    riseTime: 0.9,
    attackRange: 1.15,
    hearthRange: 1.5,
    windup: 0.5,
    strikeTime: 0.15,
    attackCd: 0.9,
    hearthDmg: 4, // per strike
    knightDmg: 1,
    staggerTime: 0.32,
    lightDps: 0.7, // damage per second at full light
    lightSlow: 0.55, // fraction of speed lost at full light
    aggroRange: 2.6,
  },

  hearth: { x: 0, maxHp: 100, radius: 0.9 },

  // frames of sim freeze
  hitstop: { light: 3, heavy: 7, kill: 5 },
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
