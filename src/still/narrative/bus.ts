// The central event bus. Gameplay says what happened (a shadow lit, a replay ended, the flame low, the Wrong Shadow
// seen...); the narrative engine, the hints, the guide and the sound listen. Nothing that speaks is wired to the sim.

export interface GameEvent {
  type: string;
  district?: string;
  [k: string]: unknown;
}
type Fn = (e: GameEvent) => void;

const subs = new Map<string, Fn[]>();
const any: Fn[] = [];
let district = '';

export const bus = {
  on(type: string, fn: Fn): void {
    if (!subs.has(type)) subs.set(type, []);
    subs.get(type)!.push(fn);
  },
  onAny(fn: Fn): void {
    any.push(fn);
  },
  /** Every event carries the district it happened in. */
  setDistrict(d: string): void {
    district = d;
  },
  emit(e: GameEvent): void {
    const ev = { district, ...e };
    for (const f of subs.get(ev.type) ?? []) f(ev);
    for (const f of any) f(ev);
  },
};
