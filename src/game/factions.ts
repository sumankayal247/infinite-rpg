/* eslint-disable @typescript-eslint/no-explicit-any */
// Faction simulation: resources, alliances, wars, territory. Owns faction state.
import { D } from "./data";
import { clamp } from "./engine";
import { stream } from "./rng";
import { timeline } from "./campaign";
import type { GameState } from "./types";

export function initFactions(S: GameState) {
  for (const f of D.factions) {
    S.factions[f.id] = {
      id: f.id, name: f.name, wealth: f.wealth, military: f.military, territory: D.regions.filter((r: any) => r.faction === f.id).map((r: any) => r.id),
      allies: [...f.allies], rivals: [...f.rivals], objective: f.goal, internal: 10, opinion: 0, player: 0, leader: f.leader, known: ["wardens", "goblins", "bandits"].includes(f.id), conflicts: [],
    };
  }
}
/** Weekly faction simulation step. */
export function factionTick(S: GameState): string[] {
  const r = stream("factions");
  const out: string[] = [];
  const fs = Object.values(S.factions).filter((f) => f.id !== "wildlife");
  for (const f of fs) {
    f.wealth = clamp(f.wealth + r.int(-3, 4) + (f.territory.length ? 1 : -1), 5, 100);
    f.military = clamp(f.military + r.int(-3, 3) + (f.wealth > 60 ? 1 : 0), 5, 100);
    f.internal = clamp(f.internal + r.int(-2, 3), 0, 100);
    for (const o of f.conflicts.slice()) if (r.chance(0.15)) f.conflicts = f.conflicts.filter((x) => x !== o);
  }
  // conflicts and territory
  for (const f of fs) {
    for (const rid of f.rivals) {
      const o = S.factions[rid];
      if (!o || f.conflicts.includes(rid)) continue;
      if (f.military > o.military + 10 && r.chance(0.12)) {
        f.conflicts.push(rid); o.conflicts.push(f.id);
        const msg = `${f.name} declares war on ${o.name}.`;
        out.push(msg); timeline(S, msg, "faction");
        f.known = f.known || r.chance(0.6);
      }
    }
    for (const rid of f.conflicts) {
      const o = S.factions[rid];
      if (!o || f.military <= o.military + 6 || !r.chance(0.2)) continue;
      const reg = o.territory.find((t) => S.world[t] && S.world[t].stability < 55) ?? null;
      if (reg) {
        o.territory = o.territory.filter((t) => t !== reg);
        f.territory.push(reg);
        S.world[reg].controller = f.id; S.world[reg].stability = clamp(S.world[reg].stability - 10, 0, 100);
        const msg = `${f.name} seizes control of ${D.regionMap[reg]?.name} from ${o.name}.`;
        out.push(msg); timeline(S, msg, "faction"); S.world[reg].changes.push(msg);
        f.military = clamp(f.military - 6, 5, 100); o.military = clamp(o.military - 8, 5, 100);
      }
    }
  }
  // shifting alliances / betrayals
  if (r.chance(0.12)) {
    const a = r.pick(fs), b = r.pick(fs);
    if (a !== b && !a.rivals.includes(b.id) && !a.allies.includes(b.id) && r.chance(0.6)) {
      a.allies.push(b.id); b.allies.push(a.id);
      const msg = `${a.name} allies with ${b.name}.`;
      out.push(msg); timeline(S, msg, "faction");
    } else if (a.allies.length && r.chance(0.4)) {
      const x = a.allies[0]; const bb = S.factions[x];
      if (bb) {
        a.allies = a.allies.filter((q) => q !== x); bb.allies = bb.allies.filter((q) => q !== a.id); bb.rivals.push(a.id);
        const msg = `${a.name} betrays ${bb.name}!`;
        out.push(msg); timeline(S, msg, "faction");
      }
    }
  }
  return out;
}
