/* eslint-disable @typescript-eslint/no-explicit-any */
// AUTHORITATIVE GAME RULES: stats, dice, checks, damage math, derived stats. The AI never touches this.
import { D } from "./data";
import type { Rng } from "./rng";
import type { Attr, Attrs, Character, ItemInst, Mode } from "./types";

export const mod = (s: number) => Math.floor((s - 10) / 2);
export const prof = (lvl: number) => D.rules.proficiency_base ?? 2 + Math.floor((lvl - 1) / 4);
export const xpToNext = (lvl: number) => D.rules.xp_base * lvl * lvl;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------- Dice ----------
export interface DiceResult { total: number; rolls: number[]; flat: number; expr: string }
export function parseDice(expr: string): { n: number; s: number; flat: number } {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(expr.replace(/\s/g, ""));
  if (!m) return { n: 0, s: 0, flat: 0 };
  return { n: +m[1], s: +m[2], flat: m[3] ? +m[3] : 0 };
}
export function rollDice(rng: Rng, expr: string, opts: { crit?: boolean; rerollOnes?: boolean } = {}): DiceResult {
  const { n, s, flat } = parseDice(expr);
  const count = opts.crit ? n * 2 : n;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    let r = rng.d(s);
    if (opts.rerollOnes && r === 1) r = rng.d(s);
    rolls.push(r);
  }
  return { total: rolls.reduce((a, b) => a + b, 0) + flat, rolls, flat, expr };
}
export const diceAvg = (expr: string) => {
  const { n, s, flat } = parseDice(expr);
  return n * (s + 1) / 2 + flat;
};

export interface D20 { rolls: number[]; nat: number; mode: Mode }
export function rollD20(rng: Rng, mode: Mode = "normal"): D20 {
  const a = rng.d(20);
  if (mode === "normal") return { rolls: [a], nat: a, mode };
  const b = rng.d(20);
  return { rolls: [a, b], nat: mode === "advantage" ? Math.max(a, b) : Math.min(a, b), mode };
}
export const combineMode = (adv: boolean, dis: boolean): Mode => (adv && !dis ? "advantage" : dis && !adv ? "disadvantage" : "normal");

export interface RollInfo {
  label: string; d20: number[]; nat: number; mode: Mode; mod: number; total: number; dc: number; dcLabel: string;
  success: boolean; crit: boolean; fumble: boolean;
}
/** Standard d20 resolution. `auto`: natural 20 always succeeds, natural 1 always fails (attacks). */
export function makeRoll(rng: Rng, label: string, modifier: number, dc: number, mode: Mode = "normal", dcLabel = "DC", opts: { critRange?: number; auto?: boolean } = {}): RollInfo {
  const r = rollD20(rng, mode);
  const total = r.nat + modifier;
  const critRange = opts.critRange ?? D.rules.crit_range ?? 20;
  const crit = r.nat >= critRange;
  const fumble = r.nat === 1;
  let success = total >= dc;
  if (opts.auto !== false) {
    if (r.nat === 20) success = true;
    if (fumble) success = false;
  }
  return { label, d20: r.rolls, nat: r.nat, mode, mod: modifier, total, dc, dcLabel, success, crit: crit && success, fumble };
}
export function describeRoll(r: RollInfo): string {
  const d = r.mode === "normal" ? `${r.nat}` : `${r.d20.join(",")}→${r.nat} (${r.mode === "advantage" ? "ADV" : "DIS"})`;
  return `d20[${d}] ${r.mod >= 0 ? "+" : ""}${r.mod} = ${r.total} vs ${r.dcLabel} ${r.dc}`;
}

// ---------- Damage types ----------
export const PHYS = ["slash", "pierce", "blunt", "physical"];
export function applyResist(amount: number, dtype: string, t: { resist?: string[]; vuln?: string[]; immune?: string[] }): { amount: number; note: string } {
  const has = (arr?: string[]) => !!arr && (arr.includes(dtype) || (PHYS.includes(dtype) && arr.includes("physical")));
  if (has(t.immune)) return { amount: 0, note: "immune" };
  if (has(t.vuln)) return { amount: amount * 2, note: "vulnerable" };
  if (has(t.resist)) return { amount: Math.floor(amount / 2), note: "resisted" };
  return { amount, note: "" };
}

// ---------- Derived stats ----------
export function itemDef(inst: ItemInst | undefined | null): any {
  return inst ? D.items[inst.id] : undefined;
}
export function equipped(ch: Character, slot: "weapon" | "armor" | "trinket"): ItemInst | undefined {
  const uid = ch.equip[slot];
  return uid ? ch.inventory.find((i) => i.uid === uid) : undefined;
}
export interface Derived {
  maxHp: number; ac: number; mods: Attrs; prof: number; atk: number; speed: number; init: number; maxRes: number;
  weapon: { name: string; dice: string; attr: Attr; dtype: string; range: number; two: boolean; bonus: number; broken: boolean; uid?: string };
  resist: string[]; vuln: string[]; tags: string[]; regen: number; thorns: number; lifesteal: number; save: number; critRange: number;
  onhit: { dice: string; dtype: string }[]; bleedOnHit: boolean; burnOnHit: boolean; check: number; castMod: number; castAttr: Attr;
}
export function attrMods(a: Attrs, wounds: string[] = []): Attrs {
  const m: any = {};
  for (const k of Object.keys(a)) m[k] = mod((a as any)[k]);
  for (const w of wounds) {
    const wd = D.rules.wounds.find((x: any) => x.id === w);
    if (wd?.cha) m.CHA += Math.round(wd.cha / 2);
  }
  return m;
}
export function deriveStats(ch: Character): Derived {
  const cls = D.classMap[ch.classId];
  const mods = attrMods(ch.attrs, ch.wounds);
  const p = prof(ch.level);
  const w = equipped(ch, "weapon");
  const a = equipped(ch, "armor");
  const t = equipped(ch, "trinket");
  const wd = itemDef(w);
  const tags: string[] = [];
  for (const f of ch.feats) if (D.featMap[f]) tags.push(D.featMap[f].tag);
  if (ch.subclass) {
    const sc = cls.subclasses.find((s: any) => s.id === ch.subclass);
    if (sc) tags.push(sc.tag);
  }
  let hpBonus = 0, regen = 0, thorns = 0, lifesteal = 0, save = 0, critRange = D.rules.crit_range ?? 20;
  const resist: string[] = [];
  const onhit: { dice: string; dtype: string }[] = [];
  let bleedOnHit = false, burnOnHit = false;
  const fx: string[] = [...(wd?.special_effects ?? []), ...(itemDef(a)?.special_effects ?? []), ...(itemDef(t)?.special_effects ?? [])];
  for (const e of fx) {
    const [k, v] = [e.replace(/_\d+$/, ""), +(e.match(/_(\d+)$/)?.[1] ?? 0)];
    if (e === "fire_damage") onhit.push({ dice: "1d4", dtype: "fire" });
    else if (e === "cold_damage") onhit.push({ dice: "1d4", dtype: "cold" });
    else if (e === "burn_on_hit") burnOnHit = true;
    else if (e === "bleed_on_hit") bleedOnHit = true;
    else if (k === "lifesteal") lifesteal += v;
    else if (k === "thorns") thorns += v;
    else if (k === "regen") regen += v;
    else if (k === "vigor") hpBonus += v;
    else if (k === "save") save += v;
    else if (k === "crit") critRange = Math.min(critRange, v);
    else if (k === "res") resist.push(e.slice(4));
  }
  if (tags.includes("lifesteal_10")) lifesteal += 10;
  if (tags.includes("crit_19")) critRange = Math.min(critRange, 19);
  if (tags.includes("arcane_surge")) critRange = Math.min(critRange, 19);
  let acBonus = (cls.ac_bonus ?? 0);
  for (const f of ch.feats) acBonus += D.featMap[f]?.ac ?? 0;
  let woundAtk = 0, woundAc = 0, woundHp = 0, woundInit = 0, woundSpeed = 0, check = 0;
  for (const wid of ch.wounds) {
    const x = D.rules.wounds.find((q: any) => q.id === wid);
    if (!x) continue;
    woundAtk += x.atk ?? 0; woundAc += x.ac ?? 0; woundHp += x.hp ?? 0; woundInit += x.init ?? 0; check += x.check ?? 0;
    if (wid === "exhausted") woundSpeed -= 1;
  }
  const broken = !!w && w.dur <= 0;
  const wbase = wd?.weapon ?? { dice: "1d2", attr: "STR", dtype: "blunt", range: 1 };
  const attr: Attr = wbase.attr;
  const up = w?.up ?? 0;
  const wpn = {
    name: wd?.name ?? "Fists", dice: broken ? "1d4" : wbase.dice, attr, dtype: wbase.dtype, range: wbase.range ?? 1,
    two: !!wbase.two_handed, bonus: mods[attr] + up + (tags.includes("heavy") && wbase.two_handed ? 3 : 0), broken, uid: w?.uid,
  };
  const maxHp = Math.max(1, cls.hp_base + ch.level * (cls.hp_per_level + mods.VIT) + hpBonus + woundHp + (tags.includes("iron_will") ? 2 * ch.level : 0));
  const ad = itemDef(a);
  const ac = D.rules.base_ac + mods.AGI + (ad ? ad.ac + (a?.up ?? 0) : 0) + acBonus + woundAc;
  const castAttr: Attr = cls.cast_attr;
  return {
    maxHp, ac, mods, prof: p, atk: p + mods[attr] + (wd?.atk ?? 0) + up + woundAtk - (broken ? 2 : 0),
    speed: D.rules.base_speed + woundSpeed, init: mods.AGI + woundInit,
    maxRes: Math.floor(cls.resource.max + ch.level * cls.resource.per_level),
    weapon: wpn, resist, vuln: [], tags, regen, thorns, lifesteal, save, critRange, onhit, bleedOnHit, burnOnHit, check,
    castMod: mods[castAttr], castAttr,
  };
}

// ---------- Enemy scaling ----------
export interface EnemyStats { hp: number; ac: number; atk: number; db: number; xp: number; level: number }
export function scaleEnemy(def: any, level: number, elite = false): EnemyStats {
  const s = D.rules.enemy_scale;
  const dl = Math.max(0, level - def.lvl);
  const em = elite ? 1.5 : 1;
  return {
    hp: Math.round(def.hp * (1 + s.hp * dl) * em),
    ac: def.ac + Math.floor(s.ac * dl) + (elite ? 1 : 0),
    atk: def.atk + Math.floor(s.atk * dl) + (elite ? 1 : 0),
    db: def.db + Math.floor(s.dmg * dl),
    xp: Math.round(def.xp * (1 + s.xp * dl) * (elite ? 1.6 : 1)),
    level: Math.max(level, def.lvl),
  };
}

export function condDef(id: string): any {
  return D.conditions[id] ?? {};
}

// ---------- State invariants ----------
export function checkInvariants(S: any): string[] {
  const fixed: string[] = [];
  const p: Character = S.player;
  const d = deriveStats(p);
  if (p.hp > d.maxHp) { p.hp = d.maxHp; fixed.push("hp>max"); }
  if (p.hp < 0) { p.hp = 0; fixed.push("hp<0"); }
  if (p.gold < 0) { p.gold = 0; fixed.push("gold<0"); }
  if (p.gold > D.rules.gold_cap) p.gold = D.rules.gold_cap;
  p.inventory = p.inventory.filter((i) => i.qty > 0);
  const seen = new Set<string>();
  p.inventory = p.inventory.filter((i) => {
    if (D.items[i.id]?.unique) { if (seen.has(i.id)) { fixed.push("dup-unique"); return false; } seen.add(i.id); }
    return true;
  });
  for (const k of Object.keys(p.attrs) as Attr[]) p.attrs[k] = clamp(p.attrs[k], 1, D.rules.attr_cap + 4);
  for (const f of Object.keys(S.rep.faction)) S.rep.faction[f] = clamp(S.rep.faction[f], D.rules.rep_min, D.rules.rep_max);
  for (const f of Object.keys(S.rep.region)) S.rep.region[f] = clamp(S.rep.region[f], D.rules.rep_min, D.rules.rep_max);
  for (const k of ["heroic", "military", "criminal", "religious", "political", "merchant", "adventurer"]) S.rep[k] = clamp(S.rep[k], D.rules.rep_min, D.rules.rep_max);
  for (const r of Object.values<any>(S.world)) for (const k of ["prosperity", "danger", "crime", "stability"]) r[k] = clamp(r[k], 0, 100);
  for (const q of S.quests) if ((q.state === "SUCCEEDED" || q.state === "FAILED") && q.accepted < 0) q.accepted = q.resolved;
  for (const n of Object.values<any>(S.npcs)) if (!n.alive && n.circumstance !== "dead") n.circumstance = "dead";
  return fixed;
}
