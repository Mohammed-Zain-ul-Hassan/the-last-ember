import type { Goal } from '../bot';
import { PAGES } from '../data/library';

/** The Library of Whispers, played: seven pages read from above, the maze with the flame held high, the stacks. */
export const LIBRARY_SCRIPT: Goal[] = [
  { wait: 5, pitch: 0.35 },
  { rest: true },
  { go: [10, 0] },
  ...PAGES.flatMap((p): Goal[] => [
    { go: [p.x - 2.2, p.z * 0.25] },
    { read: p.id },
    { wait: 3.2, pitch: 0.35 },
  ]),
  { until: 'pages', t: 3 },
  { go: [38, 0.6] },
  { tap: true, t: 4 },
  { go: [42.5, 0], pitch: -0.3 },
  { go: [45.6, 0], pitch: -0.3 },
  { go: [46.5, 4], pitch: -0.3 },
  { go: [49.6, 4], pitch: -0.3 },
  { go: [50.5, -4], pitch: -0.3 },
  { go: [53.6, -4], pitch: -0.3 },
  { go: [54.5, 1.5], pitch: -0.3 },
  { go: [57.6, 1.5], pitch: -0.3 },
  { go: [58.5, -1], pitch: -0.3 },
  { go: [60.6, -0.4], pitch: -0.3 },
  { wait: 0.8, yaw: 0, pitch: -0.3 },
  { go: [63.2, 0], pitch: -0.3, trim: 1 },
  { go: [63.6, 0], pitch: 0.35, trim: 0 },
  { go: [64.5, 4.6] },
  { rest: true },
  { go: [66.5, -6.4] },
  { go: [72.5, -6.4] },
  { go: [74.5, 6.4] },
  { go: [80.5, 6.4] },
  { go: [83, 0] },
  { go: [88.5, 0] },
];
