/* eslint-disable @typescript-eslint/no-explicit-any */
// Downed state aftermath, wounds, recovery, resurrection and legacy heirs.
import { D } from "./data";
import { deriveStats } from "./engine";
import { stream } from "./rng";
import { countItem, removeById } from "./economy";
import { newCharacter, mkItem } from "./progression";
import { record } from "./campaign";
import type { GameState } from "./types";

export function addWound(S: GameState): string | null {
  const have = S.player.wounds;
  const pool = D.rules.wounds.filter((w: any) => !have.includes(w.id));
  if (!pool.length || have.length >= 3) return null;
  const w = stream("wound").pick(pool) as any;
  have.push(w.id);
  return `${w.name}: ${w.desc}`;
}
export function healWounds(S: GameState, all = false): number {
  const n = all ? S.player.wounds.length : Math.min(1, S.player.wounds.length);
  S.player.wounds.splice(0, n);
  return n;
}
export const woundCost = (S: GameState) => Math.round(D.rules.price.heal_wound * (1 + S.player.level * 0.2));
export function resurrectCost(S: GameState) {
  const base = Math.round(D.rules.price.resurrect_base * (1 + S.player.level * 0.5) * (1 + S.stats.deaths * 0.5));
  const feather = countItem(S, "phoenix_feather") > 0;
  return { gold: feather ? Math.round(base * 0.35) : base, feather };
}
export function canResurrect(S: GameState): boolean {
  return S.mode === "normal" && S.player.gold >= resurrectCost(S).gold;
}
/** Resurrection: costs gold (and a feather if owned), leaves permanent scars, burns days. */
export function resurrect(S: GameState): string[] {
  const c = resurrectCost(S);
  S.player.gold -= c.gold;
  if (c.feather) removeById(S, "phoenix_feather", 1);
  S.stats.deaths++;
  const d = deriveStats(S.player);
  S.player.hp = Math.max(1, Math.floor(d.maxHp * 0.5));
  const out = [`Resurrected for ${c.gold} gold${c.feather ? " and a Phoenix Feather" : ""}.`];
  if (!S.player.wounds.includes("scarred")) S.player.wounds.push("scarred");
  const w = addWound(S);
  if (w) out.push(`Permanent consequence — ${w}`);
  record(S, "resurrected", { tags: ["death", "resurrection"], direct: [`Cost ${c.gold} gold`], future: ["The Pale Court notes your return"] });
  return out;
}
/** Campaign Legacy: an heir continues with a fraction of the legend. */
export function makeHeir(S: GameState): void {
  const old = S.player;
  const heir = newCharacter(old.classId, old.name.split(" ")[0] + " II");
  heir.heir = old.heir + 1;
  const lvl = Math.max(1, Math.floor(old.level / 2));
  for (let l = 1; l < lvl; l++) { heir.level++; heir.points += 2; if (heir.level % 2 === 0) heir.featPicks++; }
  heir.gold = Math.floor(old.gold * 0.5);
  const best = old.inventory.filter((i) => D.items[i.id].slot).sort((a, b) => D.items[b.id].tier - D.items[a.id].tier)[0];
  if (best) { const k = mkItem(best.id, 1, Math.max(0, best.up - 1)); heir.inventory.push(k); heir.equip[D.items[best.id].slot as "weapon"] = k.uid; }
  S.player = heir;
  const d = deriveStats(heir);
  heir.hp = d.maxHp; heir.res = d.maxRes;
  S.stats.deaths++;
  record(S, "heir_inherits", { tags: ["death", "legacy"], direct: [`${old.name} fell; ${heir.name} inherits the legend`] });
}
