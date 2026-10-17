import type { Goal } from '../bot';
import { HEART, PLATE_AT } from '../data/heart';

const a2 = (162 * Math.PI) / 180;
const [p5x, p5z] = PLATE_AT[4];
// from within: stand short of the fifth plate, facing it, the flame drawn back so his own shadow lies on it
const d5 = Math.atan2(p5z - (HEART.z + 2.3), p5x - (HEART.x + 4.6));

/** The Heart, played: its people, the five plates, the ring, and the run to the centre. */
export const HEART_SCRIPT: Goal[] = [
  { wait: 5, yaw: Math.PI / 2, pitch: 0.35 },
  { rest: true },
  { go: [21, -9] },
  { aim: 'mother' },
  { wait: 2.5 },
  { go: [37, -10] },
  { aim: 'friend' },
  { wait: 2.5 },
  // plate four: from above
  { go: [36.5, -6.5] },
  { read: 'p4' },
  { wait: 3, pitch: 0.35 },
  // plate five: from within
  { go: [HEART.x + 4.6, HEART.z + 2.3] },
  { flame: [HEART.x + 4.6 - Math.cos(d5) * 0.45, 2.05, HEART.z + 2.3 - Math.sin(d5) * 0.45], back: true, yaw: d5, flag: 'p5', t: 1 },
  { wait: 2.5, pitch: 0.35 },
  { go: [42, 7] },
  { aim: 'wife' },
  { wait: 2.5 },
  // plate one: the true angle
  { go: [36, 5] },
  { aim: 'soldier' },
  { wait: 3 },
  { go: [36, 13] },
  { aim: 'carpenter' },
  { wait: 2.5 },
  // plate two: low and long
  { go: [24, 10] },
  { go: [HEART.x + Math.cos(a2) * 14.4, Math.sin(a2) * 14.4 + 1.5] },
  { flame: [HEART.x + Math.cos(a2) * 13.4, 1.8, Math.sin(a2) * 13.4], yaw: a2 + Math.PI, flag: 'p2', t: 1 },
  { wait: 2.5, pitch: 0.35 },
  // plate three: the right order
  { go: [20, -4] },
  { go: [PLATE_AT[2][0] + 0.2, PLATE_AT[2][1] - 1.7] },
  { tap: true, t: 3 },
  { aim: 'old' },
  { wait: 1.5 },
  { aim: 'dancer' },
  { wait: 1.5 },
  { aim: 'twin' },
  { wait: 1.5 },
  { until: 'plates', t: 4 },
  { wait: 3, pitch: 0.3 },
  { go: [HEART.x - 4.5, HEART.z - 2] },
  { go: [HEART.x - 1.05, HEART.z], r: 0.3 },
];
