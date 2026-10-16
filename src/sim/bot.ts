// ?demo=1 autoplay: a deterministic bot good enough for trailer footage. Reads world state only.
// It shows off the whole moveset: dash strikes to close distance, heavy cleaves into crowds, jump-in aerials and
// plunges, running lunges, and light combos on single targets.
import { CFG } from '../config';
import { NO_INPUT, type Input, type World } from './world';

export function botInput(w: World): Input {
  const k = w.knight;
  const inp: Input = { ...NO_INPUT };
  if (k.state === 'dead') return inp;
  const hx = w.light.x;
  const f = w.frame;

  // the most urgent shade: close to the hearth (or to him, after midnight) and awake
  let target = null;
  let best = Infinity;
  for (const s of w.shades) {
    if (s.state === 'dead') continue;
    const anchor = w.torch ? k.x : hx;
    const score = Math.abs(s.x - anchor) + Math.abs(s.x - k.x) * 0.6 + (s.state === 'rise' ? 3 : 0);
    if (score < best) {
      best = score;
      target = s;
    }
  }
  const crowd = w.shades.filter((s) => s.state !== 'dead' && s.state !== 'rise' && Math.abs(s.x - k.x) < 3).length;

  // where to go: fight what is close; otherwise carry an ember home, walk the road, or fetch a lit shrine
  const danger = target !== null && Math.abs(target.x - k.x) < 6;
  const shrine = w.shrines.find((s) => s.active && s.y < 0.5);
  let goal: number;
  if (danger && target) goal = target.x;
  else if (k.ember) goal = w.hearthX;
  else if (w.road) goal = (w.level.end as number) + 2;
  else if (shrine && w.hearthHp > 50) goal = shrine.x;
  else goal = target ? target.x : hx - 1.6 * Math.sign(k.x - hx || -1);
  const dx = goal - k.x;
  const want = dx >= 0 ? 1 : -1;
  const near = target && Math.abs(dx) < 1.9 && Math.abs(target.y - k.y) < 1.5;

  // in the air: strike on the way in, plunge into a crowd on the way down
  if (!k.onGround) {
    inp.right = want > 0;
    inp.left = want < 0;
    inp.jumpHeld = k.vy > 0; // hold jump for a full-height leap
    // alternate jumps: one is an aerial chain, the next a plunge on the way down
    const plungeJump = Math.floor(f / 200) % 2 === 0;
    const close = target !== null && Math.abs(dx) < 3.5;
    if (plungeJump && close && k.vy < 0 && k.y > 0.9) inp.heavy = true;
    else if (!plungeJump && target && Math.abs(dx) < 1.8 && k.vy < 6 && f % 10 === 0) inp.attack = true;
    return inp;
  }
  // a dash in progress becomes a piercing strike
  if (k.state === 'dash') {
    inp.attack = target !== null && Math.abs(dx) < 5;
    inp.right = want > 0;
    inp.left = want < 0;
    return inp;
  }

  if (near && target) {
    if (k.facing !== want && k.state !== 'attack') {
      inp.right = want > 0;
      inp.left = want < 0;
    }
    if (target.state === 'windup' && target.target === 'knight' && target.stateT > CFG.shade.windup * 0.5 && k.dashCd <= 0) {
      // threatened: shadow-step through the windup
      inp.dash = true;
      inp.right = want > 0;
      inp.left = want < 0;
    } else if (crowd >= 2 && f % 7 === 0) inp.heavy = true; // cleave the crowd
    else if (f % 200 < 3) {
      inp.jump = true; // now and then: jump in for an aerial or a plunge
      inp.jumpHeld = true;
    } else if (f % 7 === 0) {
      if (target.state === 'stagger' && k.state !== 'attack' && f % 3 === 0) inp.heavy = true;
      else inp.attack = true;
    }
  } else if (Math.abs(dx) > 0.6) {
    inp.right = dx > 0;
    inp.left = dx < 0;
    if (Math.abs(dx) > 6 && k.dashCd <= 0 && f % 20 === 0) inp.dash = true;
    // at full run and almost in reach: lunge
    else if (target && Math.abs(dx) < 3 && Math.abs(k.vx) > CFG.knight.speed * 0.8 && f % 5 === 0) inp.attack = true;
    for (const wall of w.walls) {
      const ahead = (wall.x - k.x) * Math.sign(dx);
      if (ahead > 0 && ahead < 1.6 && k.y < wall.h) {
        inp.jump = true;
        inp.jumpHeld = true;
      }
    }
  }
  return inp;
}
