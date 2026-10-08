/* eslint-disable @typescript-eslint/no-explicit-any */
// Encounter composition (difficulty budgets), novelty and loot/rewards.
import { D } from "./data";
import { stream, type Rng } from "./rng";
import { cooldown, signature, noteSignature, novelty } from "./director";
import type { CombatState, EnemySpec } from "./combat";
import type { Dungeon, GameState } from "./types";

export function composeEncounter(S: GameState, d: Dungeon, kind: "combat" | "elite" | "boss" | "guards" | "road", r: Rng, alert = false): { specs: EnemySpec[]; novelty: number } {
  const t = D.templates[d.template];
  const level = d.level + (kind === "elite" ? 1 : 0);
  const comp = S.party.filter((p) => p.status === "active").length;
  let pool: any[] = Object.values(D.enemies).filter((e: any) => !e.boss && !e.ally && e.cost > 0 && e.biomes.includes(d.biome) && e.lvl <= level + 1 && (t.families as string[]).includes(e.family));
  if (!pool.length) pool = Object.values(D.enemies).filter((e: any) => !e.boss && !e.ally && e.cost > 0 && e.biomes.includes(d.biome) && e.lvl <= level + 1);
  if (!pool.length) pool = [D.enemies.goblin];
  const specs: EnemySpec[] = [];
  if (kind === "guards") {
    const n = 2 + Math.min(2, Math.floor(S.player.level / 4));
    for (let i = 0; i < n; i++) specs.push({ id: "city_guard", level: Math.max(1, S.player.level) });
    return { specs, novelty: 10 };
  }
  if (kind === "boss") {
    specs.push({ id: d.boss, level: level + 1 });
    const cheap = pool.filter((e) => e.cost <= 3);
    const n = 1 + (level >= 6 ? 1 : 0);
    for (let i = 0; i < n && cheap.length; i++) specs.push({ id: r.pick(cheap).id, level });
  } else {
    let budget = 2 + Math.floor(level * 0.75) + comp * 2 + (kind === "elite" ? 3 : 0) + (alert ? 1 : 0);
    budget = Math.min(budget, 14);
    let first = true;
    while (budget > 0 && specs.length < Math.min(4, (kind === "elite" ? 3 : 2) + (level >= 4 ? 1 : 0) + (level >= 8 ? 1 : 0))) {
      const afford = pool.filter((e) => e.cost <= budget || (first && specs.length === 0));
      if (!afford.length) break;
      const e = r.weighted(afford, (x) => cooldown(S, signature({ e: x.id, b: d.biome })));
      specs.push({ id: e.id, level, elite: kind === "elite" && first });
      budget -= e.cost * (kind === "elite" && first ? 1.5 : 1);
      first = false;
    }
  }
  const sig = signature({ e: specs.map((s) => s.id).sort().join("+"), b: d.biome });
  const nov = novelty(S, sig);
  noteSignature(S, sig);
  for (const s of specs) noteSignature(S, signature({ e: s.id, b: d.biome }));
  return { specs, novelty: nov };
}
const RARITY: Record<string, number> = { common: 5, uncommon: 3, rare: 1.2, epic: 0.3 };
export function randomGear(tier: number, r: Rng): string | null {
  const items = Object.values<any>(D.items).filter((i) => i.slot && !i.unique && i.tier <= tier && i.tier >= Math.max(1, tier - 1));
  if (!items.length) return null;
  return r.weighted(items, (i: any) => RARITY[i.rarity] ?? 1).id;
}
export interface Rewards { xp: number; gold: number; items: { id: string; qty: number }[] }
const goldMult = (lvl: number) => 1 + 0.3 * (lvl - 1);
function rollTable(tb: any, lvl: number, r: Rng, out: Rewards, tierOverride?: number) {
  if (!tb) return;
  out.gold += Math.round(r.int(tb.gold[0], tb.gold[1]) * goldMult(lvl));
  for (const dr of tb.drops) if (r.chance(dr.chance)) out.items.push({ id: dr.id, qty: r.int(dr.qty?.[0] ?? 1, dr.qty?.[1] ?? 1) });
  const tier = Math.min(5, tb.gear_tier ?? tierOverride ?? Math.ceil(lvl / 3));
  if (tb.gear_chance && r.chance(tb.gear_chance)) { const g = randomGear(tier, r); if (g) out.items.push({ id: g, qty: 1 }); }
}
export function combatRewards(S: GameState, cs: CombatState): Rewards {
  const r = stream("loot");
  const out: Rewards = { xp: 0, gold: 0, items: [] };
  for (const u of cs.units.filter((x) => x.team === "enemy" && x.dead && x.kind === "enemy")) {
    out.xp += u.xp;
    rollTable(D.loot.tables[u.loot], u.level, r, out);
    if (u.drop && !S.player.inventory.some((i) => i.id === u.drop)) out.items.push({ id: u.drop, qty: 1 });
  }
  // merge duplicates
  const m: Record<string, number> = {};
  for (const i of out.items) m[i.id] = (m[i.id] ?? 0) + i.qty;
  out.items = Object.entries(m).map(([id, qty]) => ({ id, qty }));
  return out;
}
export function chestLoot(S: GameState, level: number, r: Rng): Rewards {
  const out: Rewards = { xp: Math.round(10 * level), gold: 0, items: [] };
  const tier = Math.min(5, Math.ceil(level / 3));
  rollTable(D.loot.tables["chest_" + tier], level, r, out, tier);
  return out;
}
