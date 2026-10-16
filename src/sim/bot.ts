// ?demo=1 autoplay: a deterministic bot good enough for trailer footage. Reads world state only.
import { CFG } from '../config';
import { NO_INPUT, type Input, type World } from './world';

export function botInput(w: World): Input {
  const k = w.knight;
  const inp: Input = { ...NO_INPUT };
  if (k.state === 'dead') return inp;
  const hx = w.light.x;

  // the most urgent shade: close to the hearth and awake
  let target = null;
  let best = Infinity;
  for (const s of w.shades) {
    if (s.state === 'dead') continue;
    const score = Math.abs(s.x - hx) + Math.abs(s.x - k.x) * 0.6 + (s.state === 'rise' ? 3 : 0);
    if (score < best) {
      best = score;
      target = s;
    }
  }

  const goal = target ? target.x : hx - 1.6 * Math.sign(k.x - hx || -1);
  const dx = goal - k.x;
  const near = target && Math.abs(dx) < 1.9 && Math.abs(target.y - k.y) < 1.5;

  if (near && target) {
    const want = dx >= 0 ? 1 : -1;
    if (k.facing !== want && k.state !== 'attack') {
      inp.right = want > 0;
      inp.left = want < 0;
    }
    // threatened: shadow-step through the windup
    if (target.state === 'windup' && target.target === 'knight' && target.stateT > CFG.shade.windup * 0.5 && k.dashCd <= 0) {
      inp.dash = true;
      inp.right = want > 0;
      inp.left = want < 0;
    } else if (w.frame % 7 === 0) {
      if (target.state === 'stagger' && k.state !== 'attack' && w.frame % 3 === 0) inp.heavy = true;
      else inp.attack = true;
    }
  } else if (Math.abs(dx) > 0.6) {
    inp.right = dx > 0;
    inp.left = dx < 0;
    if (Math.abs(dx) > 7 && k.dashCd <= 0 && w.frame % 20 === 0) inp.dash = true;
    // hop over walls in the way
    for (const wall of w.walls) {
      const ahead = (wall.x - k.x) * Math.sign(dx);
      if (ahead > 0 && ahead < 1.6 && k.y < wall.h && k.onGround) {
        inp.jump = true;
        inp.jumpHeld = true;
      }
    }
    if (k.vy > 0) inp.jumpHeld = true;
  }
  return inp;
}
