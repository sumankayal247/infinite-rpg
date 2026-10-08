/* eslint-disable @typescript-eslint/no-explicit-any */
// World map graph: region discovery and pathfinding.
import { D } from "./data";
import type { GameState } from "./types";

export function regionPath(a: string, b: string): string[] {
  if (a === b) return [a];
  const prev: Record<string, string> = {};
  const q = [a];
  const seen = new Set([a]);
  while (q.length) {
    const c = q.shift()!;
    for (const n of D.regionMap[c]?.neighbors ?? []) {
      if (seen.has(n)) continue;
      seen.add(n); prev[n] = c; q.push(n);
      if (n === b) { const path = [b]; let k = b; while (prev[k]) { k = prev[k]; path.unshift(k); } return path; }
    }
  }
  return [a];
}
export const travelDays = (a: string, b: string) => Math.max(0, regionPath(a, b).length - 1);
export const regionUnlocked = (S: GameState, id: string) => S.player.level >= (D.regionMap[id]?.level_min ?? 1);
/** Regions the player knows about: adjacent to anywhere they've been, or already discovered. */
export function knownRegions(S: GameState): string[] {
  const out = new Set<string>(["greenwood"]);
  for (const r of Object.values(S.world)) if (r.unlocked) out.add(r.id);
  for (const id of [...out]) for (const n of D.regionMap[id]?.neighbors ?? []) out.add(n);
  return [...out];
}
