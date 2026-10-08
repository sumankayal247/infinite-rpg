/* eslint-disable @typescript-eslint/no-explicit-any */
// Shops, durability, repair, upgrades, market prices. Hardcoded math: the AI never touches gold.
import { D } from "./data";
import { clamp } from "./engine";
import { hashStr, seeded } from "./rng";
import { mkItem } from "./progression";
import type { GameState, ItemInst } from "./types";

const STACKS = ["potion", "material", "key"];
export function addItem(S: GameState, id: string, qty = 1): ItemInst | null {
  const def = D.items[id];
  if (!def) return null;
  const inv = S.player.inventory;
  if (def.unique) { const ex = inv.find((i) => i.id === id); if (ex) return ex; qty = 1; }
  if (STACKS.includes(def.type)) {
    const ex = inv.find((i) => i.id === id);
    if (ex) { ex.qty += qty; return ex; }
    const n = mkItem(id, qty); inv.push(n); return n;
  }
  let last: ItemInst | null = null;
  for (let i = 0; i < qty; i++) { last = mkItem(id, 1); inv.push(last); }
  return last;
}
export function countItem(S: GameState, id: string) { return S.player.inventory.filter((i) => i.id === id).reduce((s, i) => s + i.qty, 0); }
export function removeItem(S: GameState, uid: string, qty = 1): boolean {
  const it = S.player.inventory.find((i) => i.uid === uid);
  if (!it || it.qty < qty) return false;
  it.qty -= qty;
  if (it.qty <= 0) {
    S.player.inventory = S.player.inventory.filter((i) => i !== it);
    for (const k of Object.keys(S.player.equip) as (keyof typeof S.player.equip)[]) if (S.player.equip[k] === uid) delete S.player.equip[k];
  }
  return true;
}
export function removeById(S: GameState, id: string, qty: number): boolean {
  if (countItem(S, id) < qty) return false;
  let need = qty;
  for (const it of S.player.inventory.filter((i) => i.id === id)) { const t = Math.min(need, it.qty); removeItem(S, it.uid, t); need -= t; if (!need) break; }
  return true;
}
export const itemName = (i: ItemInst) => `${D.items[i.id]?.name ?? i.id}${i.up ? ` +${i.up}` : ""}`;
export function equipItem(S: GameState, uid: string): string {
  const it = S.player.inventory.find((i) => i.uid === uid);
  const def = it && D.items[it.id];
  if (!it || !def?.slot) return "Cannot equip that.";
  S.player.equip[def.slot as "weapon"] = uid;
  return `Equipped ${itemName(it)}.`;
}
export function unequipSlot(S: GameState, slot: "weapon" | "armor" | "trinket") { delete S.player.equip[slot]; }

export function regionMod(S: GameState, region: string) {
  const r = S.world[region];
  if (!r) return 1;
  return clamp(r.priceMod * (1 + (50 - r.prosperity) / 400) * (1 + r.crime / 600), 0.7, 2.2);
}
export function merchantDiscount(S: GameState, region: string) {
  return clamp((S.rep.merchant + (S.rep.region[region] ?? 0) / 2) / 500, -0.15, 0.15);
}
export function priceOf(S: GameState, itemId: string, mode: "buy" | "sell", region: string, discount = 0, inst?: ItemInst): number {
  const def = D.items[itemId];
  const base = def.base_value * (1 + 0.5 * (inst?.up ?? 0));
  if (mode === "buy") return Math.max(1, Math.round(base * regionMod(S, region) * (1 - merchantDiscount(S, region)) * (1 - discount)));
  let v = base * D.rules.price.sell_ratio * (1 + merchantDiscount(S, region));
  if (inst && def.durability) v *= 0.5 + 0.5 * (inst.dur / def.durability);
  return Math.max(inst && def.type === "key" ? 0 : 1, Math.floor(v));
}
export function tierCap(S: GameState, region: string) {
  const l = D.regionMap[region]?.level_min ?? 1;
  return l < 3 ? 1 : l < 5 ? 2 : l < 9 ? 3 : l < 13 ? 4 : 5;
}
export function shopStock(S: GameState, region: string): string[] {
  const cap = tierCap(S, region);
  const week = Math.floor(S.hours / (24 * 7));
  const r = seeded(hashStr(`${S.seed}:${region}:${week}`));
  const pool: string[] = [];
  for (let t = 1; t <= cap; t++) pool.push(...(D.loot.shop_stock[String(t)] ?? []));
  const consum = pool.filter((id) => D.items[id].type === "potion");
  const gear = r.shuffle(pool.filter((id) => D.items[id].type !== "potion"));
  const prosperity = S.world[region]?.prosperity ?? 50;
  const n = clamp(Math.round(4 + prosperity / 15), 4, 11);
  return [...new Set([...consum.filter((id) => D.items[id].tier <= cap).slice(0, 6), ...gear.slice(0, n)])];
}
export function buyItem(S: GameState, id: string, region: string, discount: number): { ok: boolean; msg: string } {
  const p = priceOf(S, id, "buy", region, discount);
  if (S.player.gold < p) return { ok: false, msg: "Not enough gold." };
  S.player.gold -= p;
  addItem(S, id, 1);
  return { ok: true, msg: `Bought ${D.items[id].name} for ${p}g.` };
}
export function sellItem(S: GameState, uid: string, region: string, qty = 1): { ok: boolean; msg: string } {
  const it = S.player.inventory.find((i) => i.uid === uid);
  if (!it) return { ok: false, msg: "Missing item." };
  const def = D.items[it.id];
  if (def.type === "key") return { ok: false, msg: "Key items cannot be sold." };
  if (Object.values(S.player.equip).includes(uid)) return { ok: false, msg: "Unequip it first." };
  const q = Math.min(qty, it.qty);
  const g = priceOf(S, it.id, "sell", region, 0, it) * q;
  removeItem(S, uid, q);
  S.player.gold = clamp(S.player.gold + g, 0, D.rules.gold_cap);
  return { ok: true, msg: `Sold ${def.name} ×${q} for ${g}g.` };
}
// ----- Durability / blacksmith -----
export const repairCost = (i: ItemInst) => { const d = D.items[i.id]; return d.durability ? Math.ceil((d.durability - i.dur) * D.rules.price.repair_per_dur * d.tier) : 0; };
export function repairItem(S: GameState, uid: string): { ok: boolean; msg: string } {
  const it = S.player.inventory.find((i) => i.uid === uid);
  if (!it) return { ok: false, msg: "Missing item." };
  const c = repairCost(it);
  if (c <= 0) return { ok: false, msg: "Already in perfect shape." };
  if (S.player.gold < c) return { ok: false, msg: `Repair costs ${c}g.` };
  S.player.gold -= c; it.dur = D.items[it.id].durability;
  return { ok: true, msg: `${itemName(it)} repaired for ${c}g.` };
}
export function upgradeCost(i: ItemInst) {
  const d = D.items[i.id], p = D.rules.price;
  return { gold: Math.round(p.upgrade_base * Math.pow(p.upgrade_mult, i.up) * d.tier), ore: i.up + 2, dust: i.up >= 2 ? i.up - 1 : 0 };
}
export function upgradeItem(S: GameState, uid: string): { ok: boolean; msg: string } {
  const it = S.player.inventory.find((i) => i.uid === uid);
  if (!it || !["weapon", "armor"].includes(D.items[it.id].type)) return { ok: false, msg: "Cannot upgrade that." };
  if (it.up >= D.rules.price.max_upgrade) return { ok: false, msg: "Already at maximum upgrade." };
  const c = upgradeCost(it);
  if (S.player.gold < c.gold || countItem(S, "iron_ore") < c.ore || countItem(S, "mystic_dust") < c.dust) return { ok: false, msg: `Needs ${c.gold}g, ${c.ore} Iron Ore${c.dust ? `, ${c.dust} Mystic Dust` : ""}.` };
  S.player.gold -= c.gold; removeById(S, "iron_ore", c.ore); if (c.dust) removeById(S, "mystic_dust", c.dust);
  it.up++; it.dur = D.items[it.id].durability;
  return { ok: true, msg: `Forged ${itemName(it)}! Permanent +1 modifier.` };
}
export function marketTick(S: GameState) {
  for (const r of Object.values(S.world)) {
    const target = 1 + (50 - r.prosperity) / 300;
    r.priceMod = clamp(r.priceMod + (1 - r.priceMod) * 0.04 + (target - r.priceMod) * 0.06, 0.75, 1.8);
  }
}
