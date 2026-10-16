// ?demo=1 autoplay: a deterministic bot good enough for trailer footage. Reads world state only.
// It shows off the whole moveset: dash strikes to close distance, heavy cleaves into crowds, jump-in aerials and
// plunges, running lunges, and light combos on single targets.
import { CFG } from '../config';
import { NO_INPUT, type Input, type Shade, type World } from './world';

export function botInput(w: World): Input {
  const k = w.knight;
  const inp: Input = { ...NO_INPUT };
  if (k.state === 'dead') return inp;
  const f = w.frame;
  const dist = (x: number, z: number) => Math.hypot(x - k.x, z - k.z);

  // the most urgent shade: close to the hearth (or to him, after midnight) and awake
  let target: Shade | null = null;
  let best = Infinity;
  for (const s of w.shades) {
    if (s.state === 'dead') continue;
    const anchor = w.torch ? dist(s.x, s.z) : Math.hypot(s.x - w.hearthX, s.z - w.hearthZ);
    const score = anchor + dist(s.x, s.z) * 0.6 + (s.state === 'rise' ? 3 : 0);
    if (score < best) {
      best = score;
      target = s;
    }
  }
  const crowd = w.shades.filter((s) => s.state !== 'dead' && s.state !== 'rise' && dist(s.x, s.z) < 3).length;

  // where to go: fight what is close; otherwise carry an ember home, walk the road, or fetch a lit shrine
  const danger = target !== null && dist(target.x, target.z) < 6;
  const shrine = w.shrines.find((s) => s.active && s.y < 0.5);
  let gx: number;
  let gz: number;
  if (danger && target) [gx, gz] = [target.x, target.z];
  else if (k.ember) [gx, gz] = [w.hearthX, w.hearthZ + 2.2];
  else if (w.road) [gx, gz] = [(w.level.end as number) + 2, 0];
  else if (shrine && w.hearthHp > 50) [gx, gz] = [shrine.x, shrine.z];
  else if (target) [gx, gz] = [target.x, target.z];
  else [gx, gz] = [w.hearthX, w.hearthZ + 2.4];
  const dx = gx - k.x;
  const dz = gz - k.z;
  const d = Math.hypot(dx, dz);
  const ux = d > 1e-6 ? dx / d : 0;
  const uz = d > 1e-6 ? dz / d : 0;
  const steer = () => {
    inp.mx = ux;
    inp.mz = uz;
  };
  const near = target !== null && d < 1.9 && Math.abs(target.y - k.y) < 1.5;
  inp.aim = Math.atan2(uz, ux);

  // in the air: strike on the way in, plunge into a crowd on the way down
  if (!k.onGround) {
    steer();
    inp.jumpHeld = k.vy > 0; // hold jump for a full-height leap
    // alternate jumps: one is an aerial chain, the next a plunge on the way down
    const plungeJump = Math.floor(f / 200) % 2 === 0;
    const close = target !== null && d < 3.5;
    if (plungeJump && close && k.vy < 0 && k.y > 0.9) inp.heavy = true;
    else if (!plungeJump && target && d < 1.8 && k.vy < 6 && f % 10 === 0) inp.attack = true;
    return inp;
  }
  // a dash in progress becomes a piercing strike
  if (k.state === 'dash') {
    inp.attack = target !== null && d < 5;
    steer();
    return inp;
  }

  // charging: hold until the blade is full, then let it go (a threat cuts it short)
  if (k.state === 'charge') {
    const threat = target !== null && target.state === 'windup' && target.target === 'knight' && dist(target.x, target.z) < 2.2;
    inp.heavyHeld = k.chargeT < CFG.charge.full && !threat;
    return inp;
  }

  if (near && target) {
    if (target.state === 'windup' && target.target === 'knight' && target.stateT > CFG.shade.windup * 0.5 && k.dashCd <= 0) {
      // threatened: shadow-step past the windup, sideways
      inp.dash = true;
      inp.mx = -uz;
      inp.mz = ux;
    } else if (crowd >= 1 && f % 480 < 30) {
      // now and then: hold heavy for a charged rend
      inp.heavy = k.state !== 'heavy';
      inp.heavyHeld = true;
    } else if (k.state === 'heavy' && f % 480 < 40) inp.heavyHeld = true;
    else if (crowd >= 2 && f % 7 === 0) inp.heavy = true; // cleave the crowd
    else if (f % 200 < 3) {
      inp.jump = true; // now and then: jump in for an aerial or a plunge
      inp.jumpHeld = true;
    } else if (f % 7 === 0) {
      if (target.state === 'stagger' && k.state !== 'attack' && f % 3 === 0) inp.heavy = true;
      else inp.attack = true;
    }
  } else if (d > 0.6) {
    steer();
    if (d > 6 && k.dashCd <= 0 && f % 20 === 0) inp.dash = true;
    // at full run and almost in reach: lunge
    else if (target && d < 3 && Math.hypot(k.vx, k.vz) > CFG.knight.speed * 0.8 && f % 5 === 0) inp.attack = true;
    // a ruin in the way: jump it
    const ax = k.x + ux * 1.2;
    const az = k.z + uz * 1.2;
    if (w.floorAt(ax, az, 0.3) > k.y + 0.45 || (Math.hypot(k.vx, k.vz) < 1 && k.stateT > 0.25 && k.state === 'run')) {
      inp.jump = true;
      inp.jumpHeld = true;
    }
  }
  return inp;
}
