import * as THREE from 'three';
import { ENDINGS, LAST_WORDS, PEOPLE_WORDS, WRONG, wordLine, type Line } from '../data/stillCity';
import type { CameraRig, Shot } from '../render/cameraRig';
import { glowTexture } from '../render/textures';
import type { StillHud } from './ui/hud';
import * as audio from './audio';
import { persist, save } from './save';

// The end, at the Heart. The Wrong Shadow stands where the flame was first lit, its hand on the fire. If he has
// heard every one of the people's Last Words, he can light its shadow and hear the thirty-sixth. Then he chooses:
//   Keep the flame   (always)       he returns it to the wall: the city preserved, frozen, safe
//   Let it go out    (always)       the dark; then footsteps; then the water
//   Hold the door    (all 36 heard) a stair behind the Heart that the Wrong Shadow could never see; the people walk
//                                   out in the one second before the flood, and the shadow holds the door
// In The Last Ember (both acts) none of these is chosen here: the Wrong Shadow is known for what it is, and he
// carries the flame out of the city to the old hearth (Act II); the choice waits for dawn. `?endings=1` keeps the
// three endings above, as the Still City alone.

export type Choice = 'keep' | 'letGo' | 'door' | 'carry';

export interface EndingCtx {
  hud: StillHud;
  speak: (line: Line, priority: number) => void;
  /** Tell the rest of the game (sound captions) what is happening. */
  emit: (type: string) => void;
  rig: CameraRig;
  scene: THREE.Object3D;
  centre: THREE.Vector3;
  /** Where his feet are now, and his flame. */
  body: () => THREE.Vector3;
  flame: () => THREE.Vector3;
  /** Take the flame out of the sim's hands: where to draw it and how strong (null gives it back). */
  overrideFlame: (pos: THREE.Vector3 | null, vigor: number) => void;
  /** Place the Wrong Shadow and pose it. */
  placeWrong: (x: number, z: number, yaw: number, pose: 'reach' | 'hold' | 'stand' | 'walk') => void;
  /** Move him (the ending walks him to the hidden door). */
  moveBody: (x: number, z: number, yaw: number, moving: boolean) => void;
  hideBody: (hidden: boolean) => void;
  /** Every statue in the Heart lives (the let-go ending), k 0..1. */
  wakeAll: (k: number) => void;
  setRumble: (k: number) => void;
  shake: (k: number) => void;
  veil: (on: boolean) => void;
  autoChoose: boolean;
  /** Set: the game goes on into Act II (he carries the flame out) instead of choosing here. Called once it is dark. */
  handoff: (() => void) | null;
}

const NAMES: Record<Choice, string> = { keep: 'Keep the flame', letGo: 'Let it go out', door: 'Hold the door', carry: 'Carry it out' };

export class Ending {
  phase: 'off' | 'arrive' | 'word' | 'choose' | 'play' | 'credits' = 'off';
  private t = 0;
  private choice: Choice | null = null;
  private ctx: EndingCtx;
  private panel: HTMLElement;
  private credits: HTMLElement;
  private door: THREE.Group;
  private doorLight: THREE.Sprite;
  private flamePos = new THREE.Vector3();
  private bodyStart = new THREE.Vector3();
  private queue: { at: number; line: Line }[] = [];
  private wordPrompt = false;

  constructor(ctx: EndingCtx) {
    this.ctx = ctx;
    this.panel = document.createElement('div');
    this.panel.id = 'sc-choice';
    document.body.appendChild(this.panel);
    this.credits = document.createElement('div');
    this.credits.id = 'sc-credits';
    document.body.appendChild(this.credits);
    // the stair the city's last hands built, behind the Heart: a doorway of warm light in the north wall
    this.door = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: 0x3a3036, roughness: 0.8 });
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.5, 0.8), transparent: true, opacity: 0 });
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.6), glowMat);
    opening.position.y = 1.8;
    opening.name = 'opening';
    this.door.add(opening);
    for (const sd of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.6), frame);
      post.position.set(sd * 1.35, 2.1, 0);
      this.door.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 0.6), frame);
    lintel.position.y = 4.1;
    this.door.add(lintel);
    for (let k = 0; k < 6; k++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.5), frame);
      step.position.set(0, 0.1 + k * 0.32, 0.4 + k * 0.45);
      this.door.add(step);
    }
    this.doorLight = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.6, 0.9, 0.4), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.doorLight.scale.set(7, 7, 1);
    this.doorLight.position.y = 2;
    this.door.add(this.doorLight);
    this.door.position.set(ctx.centre.x, 0, ctx.centre.z + 17.2);
    this.door.rotation.y = Math.PI;
    this.door.visible = false;
    this.door.userData.dynamic = true;
    ctx.scene.add(this.door);
    window.addEventListener('keydown', (e) => {
      if (this.phase === 'choose') {
        if (e.code === 'Digit1') this.choose('keep');
        if (e.code === 'Digit2') this.choose('letGo');
        if (e.code === 'Digit3' && this.doorOpen) this.choose('door');
      }
      if (this.phase === 'word' && this.wordPrompt && (e.code === 'KeyE' || e.code === 'Enter')) this.hearIt();
    });
  }

  private get eligible(): boolean {
    return save.words.slice(0, PEOPLE_WORDS).every(Boolean);
  }
  private get doorOpen(): boolean {
    return save.words[PEOPLE_WORDS];
  }

  start(): void {
    if (this.phase !== 'off') return;
    this.phase = 'arrive';
    this.t = 0;
    const c = this.ctx;
    const b = c.body();
    // it is there before him, at the fire's first place, reaching for the flame he carries
    const yaw = Math.atan2(b.z - c.centre.z, b.x - c.centre.x);
    c.placeWrong(c.centre.x + Math.cos(yaw) * 0.2 - Math.sin(yaw) * 0.9, c.centre.z + Math.sin(yaw) * 0.2 + Math.cos(yaw) * 0.9, yaw + 0.6, 'reach');
    c.hud.prompt(null);
    c.speak(WRONG.door, 3);
    c.emit('ending');
    const shot: Shot = { yaw: -yaw + Math.PI / 2 + 0.9, height: 2.0, dist: 6.5, lookY: 1.5, fov: 40 };
    c.rig.target.copy(c.centre);
    c.rig.go(shot, 3);
  }

  private hearIt(): void {
    if (save.words[PEOPLE_WORDS]) return;
    save.words[PEOPLE_WORDS] = true;
    persist();
    this.wordPrompt = false;
    this.ctx.hud.prompt(null);
    audio.cue('found');
    this.ctx.speak(wordLine(PEOPLE_WORDS), 3);
    this.t = 0;
  }

  private showChoices(): void {
    if (this.ctx.handoff) {
      // no choice in the city: he takes the flame and goes
      this.phase = 'choose';
      this.choose('carry');
      return;
    }
    this.phase = 'choose';
    this.t = 0;
    const p = this.panel;
    p.innerHTML = '';
    p.classList.add('on');
    const add = (c: Choice, n: number, enabled: boolean, note: string) => {
      const b = document.createElement('button');
      b.innerHTML = `<span class="n">${n}</span>${NAMES[c]}<span class="why">${note}</span>`;
      b.disabled = !enabled;
      b.addEventListener('click', () => enabled && this.choose(c));
      p.appendChild(b);
    };
    add('keep', 1, true, 'return the flame to the wall');
    add('letGo', 2, true, 'let the city move again');
    const heard = save.words.filter(Boolean).length;
    add('door', 3, this.doorOpen, this.doorOpen ? 'they heard you' : `${heard} of ${LAST_WORDS.length} Last Words heard`);
  }

  choose(c: Choice): void {
    if (this.phase !== 'choose') return;
    this.choice = c;
    this.phase = 'play';
    this.t = 0;
    this.panel.classList.remove('on');
    audio.cue('ui');
    const lines = ENDINGS[c];
    const gap = c === 'door' ? 5.5 : c === 'carry' ? 4.6 : 6;
    this.queue = lines.map((line, i) => ({ at: 1.5 + i * gap, line }));
    this.flamePos.copy(this.ctx.flame());
    this.bodyStart.copy(this.ctx.body());
    if (!save.endings.includes(c)) save.endings.push(c);
    persist();
  }

  update(dt: number): void {
    if (this.phase === 'off' || this.phase === 'credits') return;
    this.t += dt;
    const c = this.ctx;
    c.setRumble(this.phase === 'play' && this.choice === 'keep' ? Math.max(0, 1 - this.t / 6) : 1);
    if (this.phase === 'arrive' && this.t > 5) {
      if (this.eligible && !save.words[PEOPLE_WORDS]) {
        this.phase = 'word';
        this.t = 0;
        this.wordPrompt = true;
        c.hud.prompt('light its shadow', 'E');
      } else this.showChoices();
    }
    if (this.phase === 'word') {
      if (this.wordPrompt && c.autoChoose && this.t > 2.5) this.hearIt();
      if (!this.wordPrompt && this.t > 6) this.showChoices();
    }
    if (this.phase === 'choose' && c.autoChoose && this.t > 3.5) this.choose(this.doorOpen ? 'door' : 'keep');
    if (this.phase !== 'play') return;
    while (this.queue.length && this.queue[0].at <= this.t) c.speak(this.queue.shift()!.line, 3);
    const t = this.t;
    const centre = c.centre;
    if (this.choice === 'keep') {
      // the flame goes back to the wall it came from: onto the stone at the centre, and the city settles
      const k = Math.min(1, t / 3.5);
      const e = k * k * (3 - 2 * k);
      const to = new THREE.Vector3(centre.x, 1.25, centre.z);
      c.overrideFlame(this.flamePos.clone().lerp(to, e), 1);
      c.placeWrong(centre.x + 0.9, centre.z + 0.4, Math.PI, t > 4 ? 'stand' : 'reach');
      if (t > 4) c.rig.go({ yaw: 0.6, height: 9, dist: 16, lookY: 0.5, fov: 44 }, 12);
      if (t > 21) this.finish();
    } else if (this.choice === 'letGo') {
      // he lets it fall; it dies; in the dark, footsteps; they are alive, and then the water
      c.overrideFlame(this.flamePos.clone().setY(Math.max(0.1, this.flamePos.y - t * 0.6)), Math.max(0, 1 - t / 2.5));
      if (t > 4 && t < 14 && Math.random() < dt * (2 + t)) audio.cue('step', 0.5 + Math.random() * 0.4);
      if (t > 4 && t - dt <= 4) c.emit('endingSteps');
      if (t > 13 && t - dt <= 13) c.emit('endingWater');
      c.wakeAll(Math.min(1, Math.max(0, (t - 6) / 3)));
      if (t > 13) {
        c.shake(0.15 + (t - 13) * 0.08);
        if (Math.random() < dt * 3) audio.cue('collapse', 0.6);
      }
      if (t > 16) c.veil(true);
      if (t > 22) this.finish();
    } else if (this.choice === 'carry') {
      // the shadow lets go of the fire; he turns from the centre and walks out of the Heart with it, toward the walls
      c.placeWrong(centre.x + 0.9, centre.z + 0.4, Math.PI, t > 3 ? 'stand' : 'reach');
      const st = this.bodyStart;
      const away = Math.atan2(st.z - centre.z, st.x - centre.x);
      const wk = Math.min(1, Math.max(0, (t - 12) / 8));
      const tx = st.x + Math.cos(away) * 7;
      const tz = st.z + Math.sin(away) * 7;
      const bx = st.x + (tx - st.x) * wk;
      const bz = st.z + (tz - st.z) * wk;
      c.moveBody(bx, bz, away, wk > 0 && wk < 1);
      // the flame goes with him, in his hand (the sim does not step in the ending: it is moved here)
      c.overrideFlame(this.flamePos.clone().add(new THREE.Vector3(bx - st.x, 0, bz - st.z)), 1);
      if (t > 11) c.rig.go({ yaw: -away + Math.PI / 2 + 0.5, height: 4.5, dist: 12, lookY: 1.2, fov: 42 }, 8);
      if (t > 19) c.veil(true);
      if (t > 22) this.finish();
    } else if (this.choice === 'door') {
      // the stair behind the Heart opens; he lights the way; the shadow goes before him and holds the door
      this.door.visible = true;
      const op = this.door.getObjectByName('opening') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
      const g = Math.min(1, t / 3);
      op.material.opacity = g * 0.85;
      (this.doorLight.material as THREE.SpriteMaterial).opacity = g * 0.7;
      const door = this.door.position;
      // the shadow walks to the door first and holds it
      const wk = Math.min(1, Math.max(0, (t - 2) / 4));
      const wx = centre.x + (door.x - centre.x) * wk;
      const wz = centre.z + 0.9 + (door.z - 1.2 - centre.z - 0.9) * wk;
      c.placeWrong(wx, wz, Math.PI / 2, wk < 1 ? 'walk' : 'hold');
      // he follows, lighting the way
      const bk = Math.min(1, Math.max(0, (t - 4) / 7));
      const st = this.bodyStart;
      const tx = door.x - 1.6;
      const tz = door.z - 3.2;
      c.moveBody(st.x + (tx - st.x) * bk, st.z + (tz - st.z) * bk, Math.atan2(tz - st.z, tx - st.x), bk > 0 && bk < 1);
      if (t > 3) c.rig.go({ yaw: Math.PI - 0.35, height: 3.2, dist: 10, lookY: 2, fov: 42 }, 6);
      // the last shot: the city empty, a single shadow still standing in the doorway, and then the water
      if (t > 19) {
        c.hideBody(true);
        c.overrideFlame(null, 0);
      }
      if (t > 22 && t - dt <= 22) c.emit('endingWater');
      if (t > 22) {
        c.shake(0.1);
        if (Math.random() < dt * 2) audio.cue('collapse', 0.5);
      }
      if (t > 25) c.veil(true);
      if (t > 29) this.finish();
    }
  }

  private finish(): void {
    if (this.phase === 'credits') return;
    this.phase = 'credits';
    this.ctx.veil(true);
    if (this.choice === 'carry' && this.ctx.handoff) {
      this.ctx.handoff();
      return;
    }
    const heard = save.words.filter(Boolean).length;
    this.credits.innerHTML = `<h1>THE STILL CITY</h1>
      <div class="ending">${this.choice ? NAMES[this.choice] : ''}</div>
      <div class="stat">Last Words heard: ${heard} of ${LAST_WORDS.length}</div>
      <div class="by">Game design &amp; narration &mdash; Moeez Abid<br/>Built for the jam by the Last Ember team</div>
      <div class="again">Click to walk it again</div>`;
    this.credits.classList.add('on');
    this.credits.addEventListener('click', () => location.reload(), { once: true });
  }
}
