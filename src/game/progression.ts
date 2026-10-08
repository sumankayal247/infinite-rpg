/* eslint-disable @typescript-eslint/no-explicit-any */
// Character creation, leveling, feats, subclasses, milestones, respec.
import { D } from "./data";
import { deriveStats, xpToNext } from "./engine";
import { seeded, hashStr } from "./rng";
import type { Attr, Character, GameState, ItemInst } from "./types";
import { ATTRS } from "./types";

let uidCounter = 0;
export const newUid = () => `i${Date.now().toString(36)}${(uidCounter++).toString(36)}`;
export function mkItem(id: string, qty = 1, up = 0): ItemInst {
  const d = D.items[id];
  return { uid: newUid(), id, qty, up, dur: d.durability ?? 0 };
}

export function newCharacter(classId: string, name: string): Character {
  const cls = D.classMap[classId];
  const w = mkItem(cls.starting.weapon);
  const a = mkItem(cls.starting.armor);
  const ch: Character = {
    name, classId, subclass: null, level: 1, xp: 0, attrs: { ...cls.base }, points: 0, hp: 1, res: 99,
    feats: [], featPicks: 0, abilities: [], noncombat: [], wounds: [], gold: 30, inventory: [w, a, mkItem("health_potion", 3)],
    equip: { weapon: w.uid, armor: a.uid }, respecs: 0, heir: 0,
  };
  refreshAbilities(ch);
  const d = deriveStats(ch);
  ch.hp = d.maxHp;
  ch.res = cls.resource.start >= 99 ? d.maxRes : Math.min(cls.resource.start, d.maxRes);
  return ch;
}
export function refreshAbilities(ch: Character) {
  const cls = D.classMap[ch.classId];
  ch.abilities = cls.abilities.filter((a: any) => a.lvl <= ch.level).map((a: any) => a.id);
  ch.noncombat = (cls.noncombat ?? []).filter((a: any) => a.lvl <= ch.level).map((a: any) => a.id);
  if (ch.subclass) {
    const sc = cls.subclasses.find((s: any) => s.id === ch.subclass);
    if (sc) ch.abilities.push(sc.ability);
  }
}
export interface LevelUp { level: number; text: string[] }
export function gainXp(ch: Character, amount: number): LevelUp[] {
  ch.xp += Math.max(0, Math.floor(amount));
  const ups: LevelUp[] = [];
  const cls = D.classMap[ch.classId];
  while (ch.level < D.rules.max_level && ch.xp >= xpToNext(ch.level)) {
    ch.xp -= xpToNext(ch.level);
    ch.level++;
    ch.points += D.rules.points_per_level;
    const text = [`+${D.rules.points_per_level} attribute points`];
    if (ch.level % 2 === 0) { ch.featPicks++; text.push("New feat available"); }
    if (ch.level === 3 && !ch.subclass) text.push("Choose a subclass");
    const before = ch.abilities.length + ch.noncombat.length;
    refreshAbilities(ch);
    if (ch.abilities.length + ch.noncombat.length > before) {
      const newOnes = cls.abilities.filter((a: any) => a.lvl === ch.level).map((a: any) => D.abilities[a.id].name);
      if (newOnes.length) text.push("New ability: " + newOnes.join(", "));
    }
    const d = deriveStats(ch);
    ch.hp = Math.min(d.maxHp, ch.hp + cls.hp_per_level + d.mods.VIT + 2);
    if (ch.level === 5) text.push("Exploration option unlocked: Frostpeak");
    ups.push({ level: ch.level, text });
  }
  return ups;
}
export function pendingChoices(ch: Character): string[] {
  const p: string[] = [];
  if (ch.points > 0) p.push("points");
  if (ch.featPicks > 0) p.push("feat");
  if (ch.level >= 3 && !ch.subclass) p.push("subclass");
  return p;
}
export function spendPoint(ch: Character, a: Attr): boolean {
  if (ch.points <= 0 || ch.attrs[a] >= D.rules.attr_cap) return false;
  ch.attrs[a]++; ch.points--;
  return true;
}
export function chooseSubclass(ch: Character, id: string): boolean {
  const sc = D.classMap[ch.classId].subclasses.find((s: any) => s.id === id);
  if (!sc || ch.subclass || ch.level < 3) return false;
  ch.subclass = id; refreshAbilities(ch);
  return true;
}
export function featOptions(ch: Character): any[] {
  const pool = D.feats.filter((f: any) => !ch.feats.includes(f.id));
  const r = seeded(hashStr(ch.name) + ch.level * 31 + ch.feats.length * 7);
  return r.shuffle(pool).slice(0, 4);
}
export function pickFeat(ch: Character, id: string): boolean {
  if (ch.featPicks <= 0 || ch.feats.includes(id) || !D.featMap[id]) return false;
  ch.feats.push(id); ch.featPicks--;
  const f = D.featMap[id];
  if (id === "iron_will") ch.hp += 2 * ch.level;
  if (f.ac) { /* derived */ }
  return true;
}
export function respecCost(S: GameState): number {
  return Math.round(D.rules.price.respec_base * S.player.level * (1 + S.player.respecs * 0.6));
}
/** Controlled respec: costs gold, scales with each use; resets attributes, feats and subclass. */
export function respec(S: GameState): { ok: boolean; msg: string } {
  const ch = S.player, cost = respecCost(S);
  if (ch.gold < cost) return { ok: false, msg: `Respec costs ${cost} gold.` };
  ch.gold -= cost;
  const cls = D.classMap[ch.classId];
  ch.attrs = { ...cls.base };
  ch.points = (ch.level - 1) * D.rules.points_per_level;
  ch.featPicks = Math.floor(ch.level / 2);
  ch.feats = []; ch.subclass = null; ch.respecs++;
  refreshAbilities(ch);
  const d = deriveStats(ch);
  ch.hp = Math.min(ch.hp, d.maxHp);
  return { ok: true, msg: "The shrine unmakes your path. Choose anew." };
}
export function milestoneText(level: number): string {
  const m: Record<number, string> = {
    2: "First feat. A build choice that changes how you play.", 3: "Subclass: a specialization with a new ability.",
    4: "Capstone ability for your class.", 5: "New exploration: Frostpeak Reach opens.", 8: "Ember Wastes open. Faction leaders will speak with you.", 11: "The Sunken Crypts open.", 15: "Starfall Reach opens.",
  };
  return m[level] ?? "";
}
export { ATTRS };
