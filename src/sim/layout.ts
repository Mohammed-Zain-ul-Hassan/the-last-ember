// The henge: a fixed, hand-shaped layout. Sim uses circle occluders; the renderer uses the props.

export interface Occluder {
  x: number;
  z: number;
  r: number; // footprint radius
  h: number; // height (m): shadows are finite only while the flame is higher than this
}

export type PropKind = 'stone' | 'pillar' | 'wall' | 'arch';

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  rot: number; // yaw
  w: number; // width (across)
  d: number; // depth
  h: number;
  occ: Occluder[];
}

function stone(x: number, z: number, rot: number, w: number, d: number, h: number): Prop {
  return { kind: 'stone', x, z, rot, w, d, h, occ: [{ x, z, r: w * 0.5, h }] };
}

function pillar(x: number, z: number, r: number, h: number): Prop {
  return { kind: 'pillar', x, z, rot: 0, w: r * 2, d: r * 2, h, occ: [{ x, z, r, h }] };
}

/** A wall from (x0,z0) to (x1,z1) approximated by a row of circles. */
function wall(x0: number, z0: number, x1: number, z1: number, h: number, thick = 0.8): Prop {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.ceil(len / (thick * 0.9)));
  const occ: Occluder[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    occ.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, r: thick * 0.62, h });
  }
  return {
    kind: 'wall',
    x: (x0 + x1) / 2,
    z: (z0 + z1) / 2,
    rot: Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2,
    w: len,
    d: thick,
    h,
    occ,
  };
}

/** Twelve standing stones read as a clock face around the hearth. Heights alternate around the flame's height. */
const STONE_HEIGHTS = [4.6, 2.3, 3.0, 4.1, 2.1, 2.8, 4.4, 2.4, 3.2, 3.9, 2.0, 2.7];

export function buildLayout(): Prop[] {
  const props: Prop[] = [];
  const ringR = 8.2;
  for (let i = 0; i < 12; i++) {
    // i = 0 is "12 o'clock" (north, -z)
    const a = (i / 12) * Math.PI * 2;
    const x = Math.sin(a) * ringR;
    const z = -Math.cos(a) * ringR;
    const h = STONE_HEIGHTS[i];
    const w = i % 3 === 0 ? 1.35 : 1.1;
    props.push(stone(x, z, a, w, 0.62, h));
  }
  // middle ring: broken pillars of the old hall
  const mid: [number, number, number][] = [
    [20, 14.5, 5.5],
    [62, 15.5, 1.6],
    [105, 14, 6.2],
    [148, 16, 2.4],
    [200, 14.8, 5.0],
    [238, 15.6, 1.4],
    [282, 14.2, 5.8],
    [325, 16.2, 2.0],
  ];
  for (const [deg, r, h] of mid) {
    const a = (deg * Math.PI) / 180;
    props.push(pillar(Math.sin(a) * r, -Math.cos(a) * r, 0.75, h));
  }
  // outer ruins: wall fragments of the fallen keep
  const walls: [number, number, number, number][] = [
    // [startDeg, endDeg, radius, height]
    [-28, -8, 23, 3.2],
    [40, 58, 24, 1.4],
    [88, 112, 22.5, 4.0],
    [160, 176, 24.5, 2.2],
    [208, 232, 23, 3.6],
    [268, 286, 24, 1.6],
    [312, 330, 22.5, 2.8],
  ];
  for (const [d0, d1, r, h] of walls) {
    const a0 = (d0 * Math.PI) / 180;
    const a1 = (d1 * Math.PI) / 180;
    props.push(wall(Math.sin(a0) * r, -Math.cos(a0) * r, Math.sin(a1) * r, -Math.cos(a1) * r, h));
  }
  return props;
}

export function occludersOf(props: Prop[]): Occluder[] {
  return props.flatMap((p) => p.occ);
}
