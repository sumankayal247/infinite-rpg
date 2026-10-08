/* eslint-disable @typescript-eslint/no-explicit-any */
// Persistent NPC identities, memories, goals and relationships. Owns NPC state.
import { D } from "./data";
import { clamp } from "./engine";
import { stream } from "./rng";
import { nextId, timeline } from "./campaign";
import type { GameState, Npc, NpcRel } from "./types";

export function createNpc(S: GameState, templateId: string, region: string): Npc {
  const t = D.npcT.templates[templateId];
  const r = stream("npc");
  const rng = (a: [number, number]) => r.int(a[0], a[1]);
  const n: Npc = {
    id: nextId(S, "npc"), name: r.pick(D.npcT.names) as string, race: r.pick(D.npcT.races) as string, occupation: t.occupation, traits: [r.pick(t.traits) as string],
    goals: [...t.goals], fears: [...t.fears], values: [...t.values], region, faction: t.faction, rel: { trust: 0, respect: 0, fear: 0, affection: 0, hostility: 0, debt: 0 },
    greed: rng(t.greed), loyalty: rng(t.loyalty), fear: rng(t.fear), corruption: rng(t.corruption), memories: [], secrets: [], quest: "", circumstance: "Going about their business",
    alive: true, relations: {}, template: templateId, lastEval: 0, known: false,
  };
  if (r.chance(0.5)) n.secrets.push(r.pick(["Owes a debt to the Silver Ledger", "Saw the Gang's hideout", "Hides a stolen heirloom", "Is secretly a Choir sympathizer", "Knows a shortcut through the dungeon"]) as string);
  S.npcs[n.id] = n;
  return n;
}
/** Content familiarity: prefer a known, living NPC of the same type in the same region. */
export function npcFor(S: GameState, templateId: string, region: string): Npc {
  const pool = Object.values(S.npcs).filter((n) => n.alive && n.template === templateId && n.region === region);
  if (pool.length && stream("npc").chance(pool.some((n) => n.known) ? 0.6 : 0.35)) return stream("npc").pick(pool);
  const count = Object.keys(S.npcs).length;
  if (count > 160) {
    // anti-entropy: recycle an unremarkable NPC rather than growing without bound
    const dead = Object.values(S.npcs).filter((n) => !n.known && n.memories.length === 0)[0];
    if (dead) delete S.npcs[dead.id];
  }
  return createNpc(S, templateId, region);
}
export function adjust(npc: Npc, d: Partial<NpcRel>) {
  for (const k of Object.keys(d) as (keyof NpcRel)[]) npc.rel[k] = clamp(npc.rel[k] + (d[k] ?? 0), -100, 100);
}
export function remember(npc: Npc, text: string) {
  npc.known = true;
  npc.memories.push(text);
  if (npc.memories.length > 6) npc.memories.shift();
}
export function attitude(npc: Npc): string {
  const s = npc.rel.trust + npc.rel.affection + npc.rel.respect - npc.rel.hostility - npc.rel.fear / 2;
  return s > 40 ? "friendly" : s > 10 ? "warm" : s > -10 ? "neutral" : s > -40 ? "wary" : "hostile";
}
export function killNpc(S: GameState, id: string) {
  const n = S.npcs[id];
  if (n) { n.alive = false; n.circumstance = "dead"; }
}
/** NPCs pursue their own goals whether or not the player is present. */
export function npcTick(S: GameState) {
  const r = stream("npc");
  const pool = Object.values(S.npcs).filter((n) => n.alive);
  if (!pool.length) return;
  for (let k = 0; k < Math.min(3, pool.length); k++) {
    const n = r.pick(pool);
    const reg = S.world[n.region];
    if (!reg) continue;
    let msg = "";
    const g = n.goals[0] ?? "";
    if (/wealth/i.test(g)) { n.circumstance = reg.prosperity > 50 ? "Growing wealthy" : "Struggling to profit"; if (reg.prosperity > 60 && r.chance(0.2)) msg = `${n.name} has grown wealthy.`; }
    else if (/crime/i.test(g)) { n.circumstance = "Patrolling"; reg.crime = clamp(reg.crime - 1, 0, 100); }
    else if (/political/i.test(g)) { n.circumstance = "Scheming for influence"; if (r.chance(0.1)) msg = `${n.name} gains political ground.`; }
    else if (/trade route/i.test(g)) { const nb = D.regionMap[n.region]?.neighbors ?? []; if (nb.length && r.chance(0.2)) { n.region = r.pick(nb); n.circumstance = "Relocated to a new territory"; msg = `${n.name} has moved operations to ${D.regionMap[n.region]?.name}.`; } }
    else n.circumstance = r.pick(["Going about their business", "Worried about the news", "Hopeful"]) as string;
    if (reg.danger > 75 && r.chance(0.015)) { n.alive = false; n.circumstance = "dead"; msg = `${n.name} was killed amid the unrest.`; }
    n.lastEval = Math.floor(S.hours / 24);
    if (msg && n.known) timeline(S, msg, "npc");
  }
}
