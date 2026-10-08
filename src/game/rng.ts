// Seeded deterministic RNG streams. All gameplay randomness flows through here.
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  d(n: number): number {
    return this.int(1, n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted<T>(items: T[], w: (t: T) => number): T {
    let total = 0;
    for (const i of items) total += Math.max(0, w(i));
    let r = this.next() * total;
    for (const i of items) {
      r -= Math.max(0, w(i));
      if (r <= 0) return i;
    }
    return items[items.length - 1];
  }
  shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

let campaignSeed = 1;
let streams: Record<string, Rng> = {};

export function seedAll(seed: number) {
  campaignSeed = seed >>> 0 || 1;
  streams = {};
}
export function stream(name: string): Rng {
  if (!streams[name]) streams[name] = new Rng(campaignSeed ^ hashStr(name));
  return streams[name];
}
export function exportRng(): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of Object.keys(streams)) o[k] = streams[k].s;
  return o;
}
export function importRng(seed: number, state: Record<string, number> | undefined) {
  seedAll(seed);
  if (state) for (const k of Object.keys(state)) stream(k).s = state[k];
}
export function seeded(seed: number): Rng {
  return new Rng(seed);
}
