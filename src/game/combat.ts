/* eslint-disable @typescript-eslint/no-explicit-any */
// Turn order, action economy, reactions, conditions, positioning and D20 combat resolution.
import { D } from "./data";
import { stream } from "./rng";
import {
  applyResist, clamp, combineMode, deriveStats, describeRoll, diceAvg, makeRoll, mod, parseDice, rollDice, scaleEnemy, condDef, equipped,
  type RollInfo,
} from "./engine";
import { companionChar } from "./party";
import type { Attr, Attrs, GameState, Mode } from "./types";

export interface Cond { id: string; dur: number; src?: string }
export interface Combatant {
  id: string; name: string; team: "player" | "enemy"; control: "player" | "ai"; kind: "player" | "companion" | "enemy" | "summon";
  level: number; defId?: string; classId?: string; body: string; pal?: string[]; size: number; hat?: string; wep?: string; theme?: string; desc?: string;
  hp: number; maxHp: number; res: number; maxRes: number; resType: string; ac: number; atk: number; prof: number;
  mods: Attrs; castMod: number; speed: number; init: number;
  wpn: { name: string; dice: string; attr: Attr; dtype: string; range: number; bonus: number; two: boolean };
  onhit: { dice: string; dtype: string }[]; bleedOnHit: boolean; burnOnHit: boolean; lifesteal: number; thorns: number; regen: number; save: number; critRange: number; tags: string[];
  resist: string[]; vuln: string[]; immune: string[]; flying: boolean; boss: boolean; elite: boolean; perTurn: number;
  abilities: string[]; ai: { id: string; w: number }[]; cd: Record<string, number>;
  conds: Cond[]; x: number; moveLeft: number; actions: number; bonus: boolean; reaction: boolean; defending: boolean; disengaged: boolean; readied: boolean; helped: boolean;
  conc: string | null; downed: boolean; stable: boolean; dead: boolean; ds: { s: number; f: number }; luckyUsed: boolean; windUsed: boolean;
  xp: number; loot: string; drop?: string; summons: number; skip: boolean; nemesisId?: string; fled?: boolean;
}
export interface Hazard { from: number; to: number; type: string; dtype: string; dice: string; color: string; ttl?: number }
export interface CombatState {
  round: number; order: string[]; idx: number; cur: string; units: Combatant[];
  arena: { len: number; biome: string; hazards: Hazard[]; surface: { type: string; from: number; to: number } | null; props: string[]; brazier: boolean };
  over: null | "victory" | "defeat" | "fled"; boss: boolean; canFlee: boolean; know: string[]; label: string; uid: number;
}
export interface EnemySpec { id: string; level: number; elite?: boolean; name?: string; theme?: string; desc?: string; nemesisId?: string }
export type CEvent = { t: string; [k: string]: any };
export interface Action { type: string; target?: string; ability?: string; uid?: string; dx?: number; proposal?: any }

const rng = () => stream("combat");
export const dist = (a: Combatant, b: Combatant) => Math.abs(a.x - b.x);
export const unit = (cs: CombatState, id: string) => cs.units.find((u) => u.id === id)!;
export const living = (cs: CombatState, team?: string) => cs.units.filter((u) => !u.dead && (!team || u.team === team));
export const opponents = (cs: CombatState, c: Combatant) => cs.units.filter((u) => !u.dead && u.team !== c.team);
export const allies = (cs: CombatState, c: Combatant) => cs.units.filter((u) => !u.dead && u.team === c.team);
export const hasCond = (c: Combatant, id: string) => c.conds.some((x) => x.id === id);
const condSum = (c: Combatant, k: string) => c.conds.reduce((s, x) => s + (condDef(x.id)[k] ?? 0), 0);
const condAny = (c: Combatant, k: string) => c.conds.some((x) => !!condDef(x.id)[k]);
const tagsOf = (c: Combatant) => [...c.tags, ...c.conds.map((x) => condDef(x.id).tag).filter(Boolean)];
export const acOf = (c: Combatant) => c.ac + condSum(c, "ac") + (c.defending ? 2 + (c.tags.includes("shield_master") ? 3 : 0) : 0);
const log = (ev: CEvent[], msg: string, cls = "") => ev.push({ t: "log", msg, cls });
const hpPct = (c: Combatant) => c.hp / c.maxHp;
const ELEM_IMMUNE: Record<string, string> = { burning: "fire", poisoned: "poison", frozen: "cold" };

// ---------- Build ----------
function blank(): Combatant {
  return {
    id: "", name: "", team: "enemy", control: "ai", kind: "enemy", level: 1, body: "humanoid", size: 1, hp: 1, maxHp: 1, res: 0, maxRes: 0, resType: "", ac: 10, atk: 0, prof: 2,
    mods: { STR: 0, VIT: 0, AGI: 0, CHA: 0, INT: 0 }, castMod: 0, speed: 5, init: 0,
    wpn: { name: "", dice: "1d4", attr: "STR", dtype: "slash", range: 1, bonus: 0, two: false }, onhit: [], bleedOnHit: false, burnOnHit: false, lifesteal: 0, thorns: 0, regen: 0, save: 0, critRange: 20, tags: [],
    resist: [], vuln: [], immune: [], flying: false, boss: false, elite: false, perTurn: 1, abilities: [], ai: [], cd: {}, conds: [], x: 0, moveLeft: 0, actions: 1, bonus: true, reaction: true,
    defending: false, disengaged: false, readied: false, helped: false, conc: null, downed: false, stable: false, dead: false, ds: { s: 0, f: 0 }, luckyUsed: false, windUsed: false, xp: 0, loot: "none", summons: 0, skip: false,
  };
}
function fromChar(S: GameState | null, ch: any, id: string, kind: "player" | "companion", x: number, hp: number, res: number): Combatant {
  const d = deriveStats(ch);
  const cls = D.classMap[ch.classId];
  const c = blank();
  Object.assign(c, {
    id, name: ch.name, team: "player", control: kind === "player" ? "player" : "ai", kind, level: ch.level, classId: ch.classId, body: cls.plan, size: 1, pal: [cls.color],
    hp: Math.min(hp, d.maxHp), maxHp: d.maxHp, resType: cls.resource.type, maxRes: d.maxRes, res: clamp(res, 0, d.maxRes), ac: d.ac, atk: d.atk, prof: d.prof, mods: d.mods, castMod: d.castMod,
    speed: d.speed, init: d.init, wpn: { ...d.weapon }, onhit: d.onhit, bleedOnHit: d.bleedOnHit, burnOnHit: d.burnOnHit, lifesteal: d.lifesteal, thorns: d.thorns, regen: d.regen, save: d.save,
    critRange: d.critRange, tags: d.tags, resist: d.resist, abilities: ch.abilities.slice(), x,
  });
  if (cls.resource.type === "rage") c.res = 0;
  if (S && kind === "player") { c.downed = ch.hp <= 0; }
  return c;
}
export function buildCombat(S: GameState, specs: EnemySpec[], opts: { biome: string; boss?: boolean; ambush?: boolean; know?: string[]; label?: string; canFlee?: boolean }): CombatState {
  const r = rng();
  const units: Combatant[] = [];
  const hero = fromChar(S, S.player, "hero", "player", 1, S.player.hp, S.player.res);
  units.push(hero);
  S.party.filter((p) => p.status === "active").slice(0, 2).forEach((p, i) => {
    const ch = companionChar(p);
    units.push(fromChar(null, ch, "comp_" + p.id, "companion", 0, p.hp > 0 ? p.hp : 1, 99));
    units[units.length - 1].name = p.name;
    units[units.length - 1].x = i === 0 ? 0 : 1;
  });
  const know = opts.know ?? [];
  specs.forEach((sp, i) => {
    const def = D.enemies[sp.id];
    const st = scaleEnemy(def, sp.level, !!sp.elite);
    const c = blank();
    const abil = (def.abilities ?? []).map((a: any) => ({ ...a }));
    Object.assign(c, {
      id: "e" + i, name: (sp.elite ? "Elite " : "") + (sp.name ?? def.name), team: "enemy", control: "ai", kind: "enemy", level: st.level, defId: def.id, body: def.body, pal: def.pal, size: def.size ?? 1,
      hat: def.hat, wep: def.wep, theme: sp.theme, desc: sp.desc ?? def.desc, hp: st.hp, maxHp: st.hp, ac: st.ac, atk: st.atk, prof: 0, speed: def.speed ?? 5,
      init: mod(def.attrs[2]), mods: { STR: mod(def.attrs[0]), VIT: mod(def.attrs[1]), AGI: mod(def.attrs[2]), CHA: mod(def.attrs[3]), INT: mod(def.attrs[4]) }, castMod: st.db,
      wpn: { name: def.name, dice: def.dmg, attr: "STR", dtype: def.dtype, range: def.range, bonus: st.db, two: false }, resist: (def.resist ?? []).slice(), vuln: (def.vuln ?? []).slice(), immune: (def.immune ?? []).slice(),
      flying: !!def.flying, boss: !!def.boss, elite: !!sp.elite, perTurn: def.actions ?? 1, ai: abil, xp: st.xp, loot: def.loot, drop: def.drop, nemesisId: sp.nemesisId,
      x: Math.min(8, 4 + i + (def.range > 1 ? 1 : 0)),
    });
    for (const k of know) {
      if (k.startsWith("weak_")) { const t = k.slice(5); if (!c.immune.includes(t) && !c.vuln.includes(t)) c.vuln.push(t); }
      if (k === "boss_wounded" && c.boss) { c.hp = Math.round(c.hp * 0.8); }
    }
    units.push(c);
  });
  const biome = D.biomes[opts.biome] ?? D.biomes.forest;
  const hz = biome.hazard;
  const hx = r.int(3, 6);
  const arena: CombatState["arena"] = {
    len: 9, biome: opts.biome, props: biome.props ?? [], brazier: false, surface: null,
    hazards: [{ from: hx, to: hx + (r.chance(0.5) ? 1 : 0), type: hz.type, dtype: hz.dtype, dice: hz.dice, color: hz.color }],
  };
  if (biome.surface && r.chance(0.7)) {
    const f = r.int(2, 5);
    arena.surface = { type: biome.surface, from: f, to: f + r.int(1, 2) };
  }
  const cs: CombatState = { round: 0, order: [], idx: -1, cur: "", units, arena, over: null, boss: !!opts.boss, canFlee: opts.canFlee ?? !opts.boss, know, label: opts.label ?? "Battle", uid: 0 };
  // initiative
  const rolled = units.map((u) => ({ u, v: r.d(20) + u.init + (u.kind === "enemy" ? 0 : 0) }));
  rolled.sort((a, b) => b.v - a.v || b.u.init - a.u.init);
  cs.order = rolled.map((x) => x.u.id);
  if (opts.ambush || know.includes("ambush")) {
    cs.order = ["hero", ...cs.order.filter((i) => i !== "hero")];
    for (const e of units.filter((u) => u.team === "enemy")) e.conds.push({ id: "exposed", dur: 2 });
    hero.conds.push({ id: "hidden", dur: 2 });
  }
  return cs;
}

// ---------- Condition helpers ----------
function addCond(cs: CombatState, ev: CEvent[], tgt: Combatant, id: string, dur: number, src?: string) {
  if (tgt.dead) return false;
  if (ELEM_IMMUNE[id] && tgt.immune.includes(ELEM_IMMUNE[id])) return false;
  const ex = tgt.conds.find((c) => c.id === id);
  if (ex) { ex.dur = Math.max(ex.dur, dur); if (src) ex.src = src; }
  else tgt.conds.push({ id, dur, src });
  ev.push({ t: "status", id: tgt.id, cond: id, on: true });
  return true;
}
function removeCond(ev: CEvent[], tgt: Combatant, id: string) {
  if (!hasCond(tgt, id)) return;
  tgt.conds = tgt.conds.filter((c) => c.id !== id);
  ev.push({ t: "status", id: tgt.id, cond: id, on: false });
}
function dropConc(cs: CombatState, ev: CEvent[], c: Combatant) {
  if (!c.conc) return;
  const name = D.abilities[c.conc]?.name ?? "spell";
  for (const u of cs.units) for (const k of u.conds.filter((x) => x.src === "conc:" + c.id)) removeCond(ev, u, k.id);
  c.conc = null;
  log(ev, `${c.name} loses concentration on ${name}.`, "sys");
}
const gainRes = (c: Combatant, n: number) => { c.res = clamp(c.res + n, 0, c.maxRes); };

// ---------- Damage ----------
interface Part { amount: number; dtype: string }
function hazardsAt(cs: CombatState, x: number) { return cs.arena.hazards.filter((h) => x >= h.from && x <= h.to); }
function surfaceAt(cs: CombatState, x: number) { const s = cs.arena.surface; return s && x >= s.from && x <= s.to ? s : null; }

export function dealDamage(S: GameState, cs: CombatState, ev: CEvent[], src: Combatant | null, tgt: Combatant, parts: Part[], o: { crit?: boolean; melee?: boolean; noEnv?: boolean; label?: string } = {}): number {
  if (tgt.dead) return 0;
  let total = 0;
  const notes: string[] = [];
  let allImmune = true;
  let mainType = parts[0]?.dtype ?? "physical";
  for (const p of parts) {
    const r = applyResist(Math.max(0, p.amount), p.dtype, tgt);
    if (r.note !== "immune") allImmune = false;
    if (r.note) notes.push(`${p.dtype} ${r.note}`);
    total += r.amount;
  }
  if (!allImmune) total = Math.max(D.rules.min_damage_on_hit, total);
  // Protector reaction
  if (total > 0 && src) {
    const prot = cs.units.find((a) => a !== tgt && !a.dead && !a.downed && a.team === tgt.team && a.reaction && a.tags.includes("protector") && Math.abs(a.x - tgt.x) <= 2);
    if (prot) {
      const red = rollDice(rng(), "1d6").total;
      prot.reaction = false;
      total = Math.max(0, total - red);
      log(ev, `${prot.name} shields ${tgt.name} (reaction): -${red} damage.`, "sys");
    }
  }
  if (notes.length) log(ev, `  (${notes.join(", ")})`, "sys");
  if (tgt.downed) {
    tgt.ds.f += o.crit ? 2 : 1;
    ev.push({ t: "dmg", id: tgt.id, amount: total, dtype: mainType, crit: !!o.crit, src: src?.id });
    log(ev, `${tgt.name} is struck while downed! Death save failures: ${Math.min(3, tgt.ds.f)}/3`, "bad");
    if (tgt.ds.f >= 3) kill(S, cs, ev, tgt, src);
    return total;
  }
  const before = tgt.hp;
  tgt.hp = Math.max(0, tgt.hp - total);
  ev.push({ t: "dmg", id: tgt.id, amount: total, dtype: mainType, crit: !!o.crit, src: src?.id });
  if (tgt.hasOwnProperty("id")) { /* noop */ }
  if (hasCond(tgt, "hidden")) removeCond(ev, tgt, "hidden");
  if (total > 0 && tgt.resType === "rage") gainRes(tgt, tgt.tags.includes("berserker") ? 2 : 1);
  if (src && total > 0 && src.resType === "rage") gainRes(src, src.tags.includes("berserker") ? 2 : 1);
  if (src && total > 0 && src.lifesteal > 0) {
    const h = Math.max(1, Math.floor((total * src.lifesteal) / 100));
    heal(cs, ev, src, h, true);
  }
  if (src && o.melee && tgt.thorns > 0 && total > 0 && !src.dead) {
    log(ev, `${tgt.name}'s thorns lash ${src.name} for ${tgt.thorns}.`, "sys");
    dealDamage(S, cs, ev, null, src, [{ amount: tgt.thorns, dtype: "physical" }], { noEnv: true });
  }
  if (tgt.conc && total > 0 && tgt.hp > 0) {
    const dc = Math.max(10, Math.floor(total / 2));
    const rr = makeRoll(rng(), "Concentration", tgt.mods.VIT + tgt.prof + tgt.save, dc, "normal", "DC", { auto: false });
    if (!rr.success) dropConc(cs, ev, tgt);
  }
  if (tgt.hp <= 0) {
    const over = total - before;
    if (tgt.team === "enemy" || tgt.kind === "summon" || over >= tgt.maxHp) kill(S, cs, ev, tgt, src);
    else {
      tgt.downed = true; tgt.stable = false; tgt.ds = { s: 0, f: 0 };
      for (const c of tgt.conds.slice()) if (condDef(c.id).bad || c.id === "hidden") removeCond(ev, tgt, c.id);
      dropConc(cs, ev, tgt);
      ev.push({ t: "down", id: tgt.id });
      log(ev, `${tgt.name} is DOWNED! Death saves begin.`, "bad");
    }
  }
  // environmental magic
  if (!o.noEnv && !tgt.dead) envInteract(S, cs, ev, src, tgt, mainType);
  return total;
}
function kill(S: GameState, cs: CombatState, ev: CEvent[], tgt: Combatant, src: Combatant | null) {
  tgt.dead = true; tgt.hp = 0; tgt.downed = false;
  dropConc(cs, ev, tgt);
  ev.push({ t: "dead", id: tgt.id, by: src?.id });
  log(ev, `${tgt.name} ${tgt.team === "enemy" ? "is slain" : "has died"}!`, tgt.team === "enemy" ? "good" : "bad");
}
function heal(cs: CombatState, ev: CEvent[], tgt: Combatant, amt: number, quiet = false) {
  if (tgt.dead || amt <= 0) return 0;
  const was = tgt.downed;
  const h = Math.min(amt, tgt.maxHp - tgt.hp);
  tgt.hp += was ? amt > tgt.maxHp ? tgt.maxHp : amt : h;
  if (was) { tgt.downed = false; tgt.stable = false; tgt.ds = { s: 0, f: 0 }; ev.push({ t: "revive", id: tgt.id }); }
  tgt.hp = Math.min(tgt.hp, tgt.maxHp);
  ev.push({ t: "heal", id: tgt.id, amount: was ? amt : h });
  if (!quiet) log(ev, `${tgt.name} recovers ${was ? amt : h} HP.`, "good");
  return h;
}
function envInteract(S: GameState, cs: CombatState, ev: CEvent[], src: Combatant | null, tgt: Combatant, dtype: string) {
  const sf = surfaceAt(cs, tgt.x);
  if (!sf) return;
  if (dtype === "fire" && sf.type === "oil") {
    const s = cs.arena.surface!;
    cs.arena.surface = null;
    cs.arena.hazards.push({ from: s.from, to: s.to, type: "burning oil", dtype: "fire", dice: "1d6", color: "#ff7b00", ttl: 3 });
    log(ev, `The oil ignites! Flames roar across the battlefield!`, "good");
    ev.push({ t: "hazard" });
    for (const u of cs.units.filter((q) => !q.dead && q.x >= s.from && q.x <= s.to && q !== tgt)) {
      dealDamage(S, cs, ev, src, u, [{ amount: rollDice(rng(), "1d6").total, dtype: "fire" }], { noEnv: true });
      if (!u.dead) addCond(cs, ev, u, "burning", 2);
    }
    if (!tgt.dead) addCond(cs, ev, tgt, "burning", 3);
  } else if (dtype === "cold" && sf.type === "water") {
    cs.arena.surface = { ...sf, type: "ice" };
    ev.push({ t: "hazard" });
    log(ev, `The water freezes solid around ${tgt.name}!`, "good");
    addCond(cs, ev, tgt, "frozen", 1);
  } else if (dtype === "lightning" && sf.type === "water") {
    log(ev, `Lightning arcs through the water!`, "good");
    for (const u of cs.units.filter((q) => !q.dead && q !== tgt && q !== src && q.x >= sf.from && q.x <= sf.to)) {
      dealDamage(S, cs, ev, src, u, [{ amount: rollDice(rng(), "2d4").total, dtype: "lightning" }], { noEnv: true });
    }
  }
}

// ---------- Movement ----------
function hazardTick(S: GameState, cs: CombatState, ev: CEvent[], c: Combatant) {
  for (const h of hazardsAt(cs, c.x)) {
    if (c.flying && h.type !== "burning oil") continue;
    if (c.immune.includes(h.dtype)) continue;
    const amt = rollDice(rng(), h.dice).total;
    log(ev, `${c.name} is hurt by the ${h.type}: ${amt} ${h.dtype}.`, "bad");
    dealDamage(S, cs, ev, null, c, [{ amount: amt, dtype: h.dtype }], { noEnv: true });
    if (c.dead || c.downed) return;
  }
}
function moveActor(S: GameState, cs: CombatState, ev: CEvent[], c: Combatant, nx: number, cost: number) {
  const from = c.x;
  nx = clamp(nx, 0, cs.arena.len - 1);
  const opps = opponents(cs, c);
  if (!c.disengaged) {
    for (const e of opps) {
      if (e.downed || e.dead || !e.reaction || hasCond(e, "stunned") || hasCond(e, "frozen") || e.wpn.range > 1) continue;
      if (Math.abs(e.x - from) <= 1 && Math.abs(e.x - nx) > 1) {
        e.reaction = false;
        log(ev, `${e.name} makes an opportunity attack on ${c.name}!`, "sys");
        strike(S, cs, ev, e, c, null, { ranged: false });
        if (c.dead || c.downed) return;
      }
    }
  }
  c.x = nx; c.moveLeft = Math.max(0, c.moveLeft - cost);
  ev.push({ t: "move", id: c.id, from, to: nx });
  for (const e of opps) {
    if (e.readied && e.reaction && !e.dead && !e.downed && Math.abs(e.x - from) > 1 && Math.abs(e.x - nx) <= 1) {
      e.readied = false; e.reaction = false;
      log(ev, `${e.name} strikes with a readied attack!`, "sys");
      strike(S, cs, ev, e, c, null, { ranged: false });
      if (c.dead || c.downed) return;
    }
  }
  hazardTick(S, cs, ev, c);
}
function approach(S: GameState, cs: CombatState, ev: CEvent[], c: Combatant, t: Combatant, reach: number): boolean {
  const d = dist(c, t);
  if (d <= reach) return true;
  if (condAny(c, "nomove")) return false;
  const need = d - reach;
  if (c.moveLeft < need) return false;
  const dir = Math.sign(t.x - c.x);
  moveActor(S, cs, ev, c, c.x + dir * need, need);
  return !c.dead && !c.downed && dist(c, t) <= reach;
}

// ---------- Attack resolution ----------
function attackMode(cs: CombatState, atk: Combatant, def: Combatant, ranged: boolean, spell: boolean): Mode {
  const adv = condAny(atk, "adv_attack") || condAny(def, "adv_against") || atk.helped;
  const dis = condAny(atk, "disadv_attack") || (ranged && !spell && opponents(cs, atk).some((o) => dist(o, atk) <= 1 && !o.downed)) || (hasCond(def, "hidden") && def.team !== atk.team);
  return combineMode(adv, dis);
}
function rollAttack(cs: CombatState, ev: CEvent[], atk: Combatant, def: Combatant, bonus: number, o: { ranged: boolean; spell?: boolean; critRange?: number; label: string }): RollInfo {
  const mode = attackMode(cs, atk, def, o.ranged, !!o.spell);
  let ac = acOf(def);
  if (!o.ranged && !o.spell && def.reaction && !def.downed && tagsOf(def).includes("parry")) {
    ac += 3; def.reaction = false;
    log(ev, `${def.name} parries (+3 AC, reaction).`, "sys");
  }
  let roll = makeRoll(rng(), o.label, bonus + condSum(atk, "atk"), ac, mode, "AC", { critRange: o.critRange ?? atk.critRange, auto: true });
  if (!roll.success && !roll.fumble && atk.tags.includes("lucky") && !atk.luckyUsed && roll.total >= ac - 3) {
    atk.luckyUsed = true;
    log(ev, `${atk.name} uses Lucky and rerolls!`, "sys");
    roll = makeRoll(rng(), o.label, bonus + condSum(atk, "atk"), ac, mode, "AC", { critRange: o.critRange ?? atk.critRange, auto: true });
  }
  atk.helped = false;
  ev.push({ t: "roll", id: atk.id, roll, kind: "attack" });
  return roll;
}
function diceStr(r: { total: number; rolls: number[]; flat: number; expr: string }) {
  return `${r.expr}[${r.rolls.join("+")}]${r.flat ? (r.flat > 0 ? "+" : "") + r.flat : ""}`;
}
function wearWeapon(S: GameState, c: Combatant, n: number, ev: CEvent[]) {
  if (c.kind !== "player") return;
  const w = equipped(S.player, "weapon");
  if (!w) return;
  const was = w.dur;
  w.dur = Math.max(0, w.dur - n);
  if (was > 0 && w.dur === 0) { log(ev, `Your ${D.items[w.id].name} BREAKS! Visit a blacksmith.`, "bad"); ev.push({ t: "shake", amt: 2 }); }
}

/** One weapon-style strike. Returns true on hit. */
function strike(S: GameState, cs: CombatState, ev: CEvent[], atk: Combatant, def: Combatant, ab: any | null, o: { ranged: boolean; critRange?: number; extra?: string }): boolean {
  const thrown = !!ab && ab.ranged && atk.wpn.range <= 1;
  const bonus = atk.atk;
  const wasHidden = hasCond(atk, "hidden");
  const mode0 = attackMode(cs, atk, def, o.ranged, false);
  const roll = rollAttack(cs, ev, atk, def, bonus, { ranged: o.ranged, critRange: ab?.critrange ?? o.critRange, label: ab?.name ?? "Attack" });
  ev.push({ t: "attack", src: atk.id, dst: def.id, hit: roll.success, crit: roll.crit, ranged: o.ranged, color: ab?.color, sfx: ab?.sfx });
  let line = `${atk.name} ${ab ? "uses " + ab.name + " on" : "attacks"} ${def.name}: ${describeRoll(roll)} → ${roll.success ? (roll.crit ? "CRITICAL HIT" : "HIT") : roll.fumble ? "FUMBLE" : "MISS"}`;
  if (!roll.success) {
    log(ev, line, atk.team === "player" ? "roll" : "roll-e");
    ev.push({ t: "miss", id: def.id, fumble: roll.fumble });
    if (roll.fumble) wearWeapon(S, atk, 1 + (D.rules.nat1?.extra_durability_loss ?? 1), ev); else wearWeapon(S, atk, 1, ev);
    if (wasHidden && condDef("hidden").break_on_attack) removeCond(ev, atk, "hidden");
    return false;
  }
  const crit = roll.crit;
  const parts: Part[] = [];
  const bits: string[] = [];
  const base = thrown ? ab.dice : atk.wpn.dice;
  const heavy = atk.tags.includes("heavy") && atk.wpn.two;
  const b = rollDice(rng(), base, { crit, rerollOnes: heavy });
  const flat = atk.wpn.bonus + condSum(atk, "dmg") + (ab?.name === "x" ? 0 : 0);
  const dtype = ab?.dtype ?? atk.wpn.dtype;
  parts.push({ amount: b.total + flat, dtype });
  bits.push(`${diceStr(b)}${flat ? (flat > 0 ? "+" : "") + flat : ""} ${dtype}`);
  if (ab && !thrown && ab.dice && parseDice(ab.dice).n > 0) {
    const e = rollDice(rng(), ab.dice, { crit });
    parts.push({ amount: e.total, dtype: ab.dtype ?? atk.wpn.dtype });
    bits.push(`+${diceStr(e)} ${ab.dtype ?? atk.wpn.dtype}`);
  }
  for (const oh of atk.onhit) {
    const e = rollDice(rng(), oh.dice, { crit });
    parts.push({ amount: e.total, dtype: oh.dtype });
    bits.push(`+${diceStr(e)} ${oh.dtype}`);
  }
  if (atk.classId === "rogue" && !ab?.sneak) {
    const e = rollDice(rng(), "1d4", { crit });
    parts.push({ amount: e.total, dtype: atk.wpn.dtype });
    bits.push(`+CUNNING ${diceStr(e)}`);
  }
  const sneaking = (wasHidden || mode0 === "advantage");
  if (ab?.sneak && sneaking) {
    const e = rollDice(rng(), ab.sneak, { crit });
    parts.push({ amount: e.total, dtype: atk.wpn.dtype });
    bits.push(`+SNEAK ${diceStr(e)}`);
  } else if (atk.tags.includes("assassin") && wasHidden) {
    const e = rollDice(rng(), "2d6", { crit });
    parts.push({ amount: e.total, dtype: atk.wpn.dtype });
    bits.push(`+AMBUSH ${diceStr(e)}`);
  }
  if (atk.tags.includes("sharpshooter") && o.ranged) {
    const e = rollDice(rng(), "1d4", { crit });
    parts.push({ amount: e.total, dtype: atk.wpn.dtype });
    bits.push(`+${diceStr(e)}`);
  }
  const mk = def.conds.find((k) => k.id === "marked" && k.src === atk.id);
  if (mk) {
    const e = rollDice(rng(), condDef("marked").marked, { crit });
    parts.push({ amount: e.total, dtype: atk.wpn.dtype });
    bits.push(`+MARK ${diceStr(e)}`);
  }
  line += ` | ${bits.join(" ")}`;
  log(ev, line, atk.team === "player" ? "roll" : "roll-e");
  const total = dealDamage(S, cs, ev, atk, def, parts, { crit, melee: !o.ranged, label: ab?.name });
  log(ev, `  → ${total} damage to ${def.name}${def.dead ? "" : ` (${def.hp}/${def.maxHp} HP)`}`, "dmg");
  if (!def.dead) {
    if (ab?.status) applyStatuses(S, cs, ev, atk, def, ab.status);
    if (atk.tags.includes("bleeder") && ["slash", "pierce"].includes(atk.wpn.dtype) && rng().chance(0.35)) addCond(cs, ev, def, "bleeding", 3, atk.id);
    if (atk.bleedOnHit && rng().chance(0.4)) addCond(cs, ev, def, "bleeding", 3, atk.id);
    if (atk.burnOnHit && rng().chance(0.3)) addCond(cs, ev, def, "burning", 2, atk.id);
    if (hasCond(def, "frozen") && dtype === "blunt") removeCond(ev, def, "frozen");
  }
  if (roll.crit && atk.team === "player") ev.push({ t: "crit", id: atk.id });
  wearWeapon(S, atk, 1, ev);
  if (wasHidden && condDef("hidden").break_on_attack) removeCond(ev, atk, "hidden");
  return true;
}

function saveFor(c: Combatant, attr: Attr, dc: number, label: string, mode: Mode = "normal"): RollInfo {
  const adv = c.tags.includes("iron_will") ? "advantage" : mode;
  const m = c.mods[attr] + c.prof + c.save + condSum(c, "save");
  return makeRoll(rng(), label, m, dc, mode === "normal" ? adv : mode, "DC", { auto: false });
}
function spellDC(c: Combatant) { return c.kind === "enemy" ? 8 + Math.floor(c.atk / 1) : 8 + c.prof + c.castMod; }
function applyStatuses(S: GameState, cs: CombatState, ev: CEvent[], src: Combatant, tgt: Combatant, list: any[], conc?: boolean) {
  for (const st of list) {
    if (st.chance && !rng().chance(st.chance)) continue;
    if (st.save) {
      const dc = spellDC(src);
      const rr = saveFor(tgt, st.save, dc, `${tgt.name} ${st.save} save`);
      ev.push({ t: "roll", id: tgt.id, roll: rr, kind: "save" });
      log(ev, `  ${tgt.name} ${st.save} save: ${describeRoll(rr)} → ${rr.success ? "RESISTS" : "FAILS"}`, "roll");
      if (rr.success) continue;
    }
    const srcTag = conc ? "conc:" + src.id : st.id === "marked" ? src.id : src.id;
    if (addCond(cs, ev, tgt, st.id, st.dur, srcTag)) log(ev, `  ${tgt.name} is ${condDef(st.id).name}.`, tgt.team === "enemy" ? "good" : "bad");
  }
}

// ---------- Abilities ----------
export function abilityStatus(cs: CombatState, c: Combatant, abId: string): { ok: boolean; why: string } {
  const ab = D.abilities[abId];
  if (!ab) return { ok: false, why: "Unknown" };
  const bonus = ab.action === "bonus";
  if (bonus ? !c.bonus : c.actions <= 0) return { ok: false, why: bonus ? "No bonus action" : "No action left" };
  if ((c.cd[abId] ?? 0) > 0) return { ok: false, why: `Cooldown ${c.cd[abId]}` };
  if (!c.kind.startsWith("enemy") && (ab.cost ?? 0) > c.res) return { ok: false, why: `Need ${ab.cost} ${c.resType}` };
  if ((ab.kind === "spell" || ab.school) && condAny(c, "nospell")) return { ok: false, why: "Silenced" };
  if (ab.kind === "summon" && c.summons >= 2) return { ok: false, why: "Too many summons" };
  return { ok: true, why: "" };
}
function pickEnemyTarget(cs: CombatState, c: Combatant, prefer?: string) {
  const o = opponents(cs, c).filter((u) => !u.downed || opponents(cs, c).every((q) => q.downed));
  if (prefer) { const t = o.find((u) => u.id === prefer); if (t) return t; }
  return o.sort((a, b) => dist(c, a) - dist(c, b))[0];
}
function bestHeal(cs: CombatState, c: Combatant) {
  const al = allies(cs, c).filter((u) => u.downed || u.hp < u.maxHp);
  return al.sort((a, b) => (a.downed ? -1 : 0) - (b.downed ? -1 : 0) || hpPct(a) - hpPct(b))[0] ?? c;
}

function useAbility(S: GameState, cs: CombatState, ev: CEvent[], c: Combatant, abId: string, targetId?: string): boolean {
  const ab = D.abilities[abId];
  const st = abilityStatus(cs, c, abId);
  if (!st.ok) { ev.push({ t: "deny", msg: st.why }); return false; }
  const isEnemyTarget = ab.target === "enemy" || ab.target === "enemies";
  let targets: Combatant[] = [];
  if (ab.target === "enemy") {
    const t = pickEnemyTarget(cs, c, targetId);
    if (!t) { ev.push({ t: "deny", msg: "No target" }); return false; }
    targets = [t];
  } else if (ab.target === "enemies") targets = opponents(cs, c).filter((u) => !u.downed);
  else if (ab.target === "ally") targets = [targetId ? unit(cs, targetId) : bestHeal(cs, c)];
  else if (ab.target === "allies") targets = allies(cs, c);
  else targets = [c];
  // range / approach
  const range = ab.range ?? 1;
  if (isEnemyTarget && range <= 1) {
    const near = targets.slice().sort((a, b) => dist(c, a) - dist(c, b))[0];
    if (!near) { ev.push({ t: "deny", msg: "No target" }); return false; }
    if (!approach(S, cs, ev, c, near, 1)) { ev.push({ t: "deny", msg: "Too far to reach (Dash or move closer)" }); return false; }
    if (ab.target === "enemies") targets = targets.filter((u) => dist(c, u) <= 1);
    if (c.dead || c.downed) return false;
  } else if (isEnemyTarget) {
    targets = targets.filter((u) => dist(c, u) <= range);
    if (!targets.length) { ev.push({ t: "deny", msg: "Out of range" }); return false; }
  }
  // spend
  if (c.kind === "player" || c.kind === "companion") gainRes(c, -(ab.cost ?? 0));
  if (ab.gain) gainRes(c, ab.gain);
  if (ab.action === "bonus") c.bonus = false; else c.actions--;
  if (ab.cooldown) c.cd[abId] = ab.cooldown + 1;
  if (ab.conc) dropConc(cs, ev, c);
  ev.push({ t: "fx", kind: ab.sfx, src: c.id, dst: targets[0]?.id, color: ab.color, name: ab.name, school: ab.school });
  log(ev, `${c.name} casts ${ab.name}!`, c.team === "player" ? "spell" : "spell-e");
  const casting = ab.kind === "spell";
  if (ab.kind === "weapon") {
    const n = ab.multi ?? 1;
    for (const t of targets) for (let i = 0; i < n; i++) { if (!t.dead) strike(S, cs, ev, c, t, ab, { ranged: !!ab.ranged || c.wpn.range > 1 }); }
  } else if (casting) {
    let dmgBonus = 0;
    if (c.tags.includes("arcane_surge")) dmgBonus += 3;
    if (c.tags.includes("pyromancer") && ab.dtype === "fire") dmgBonus += 2;
    for (const t of targets) {
      if (t.dead) continue;
      const aoe = ab.target === "enemies";
      if (ab.save) {
        const dc = spellDC(c);
        const rr = saveFor(t, ab.save.attr, dc, `${t.name} ${ab.save.attr} save`);
        ev.push({ t: "roll", id: t.id, roll: rr, kind: "save" });
        log(ev, `${t.name} ${ab.save.attr} save: ${describeRoll(rr)} → ${rr.success ? "SAVES" : "FAILS"}`, "roll");
        const dr = rollDice(rng(), ab.dice);
        let amt = dr.total + (aoe ? 0 : c.castMod) + dmgBonus;
        if (rr.success) amt = ab.save.half ? Math.floor(amt / 2) : 0;
        ev.push({ t: "attack", src: c.id, dst: t.id, hit: amt > 0, crit: false, ranged: true, color: ab.color, spell: true });
        if (amt > 0) {
          log(ev, `  ${ab.name}: ${diceStr(dr)} ${ab.dtype} = ${amt}`, "roll");
          dealDamage(S, cs, ev, c, t, [{ amount: amt, dtype: ab.dtype }], {});
          if (!t.dead && !rr.success && ab.status) applyStatuses(S, cs, ev, c, t, ab.status);
        } else ev.push({ t: "miss", id: t.id });
      } else {
        const roll = rollAttack(cs, ev, c, t, c.kind === "enemy" ? c.atk : c.prof + c.castMod, { ranged: true, spell: true, critRange: ab.critrange, label: ab.name });
        ev.push({ t: "attack", src: c.id, dst: t.id, hit: roll.success, crit: roll.crit, ranged: true, color: ab.color, spell: true });
        log(ev, `${c.name}'s ${ab.name}: ${describeRoll(roll)} → ${roll.success ? (roll.crit ? "CRITICAL" : "HIT") : "MISS"}`, "roll");
        if (!roll.success) { ev.push({ t: "miss", id: t.id }); continue; }
        const dr = rollDice(rng(), ab.dice, { crit: roll.crit });
        let amt = dr.total + c.castMod + dmgBonus;
        log(ev, `  ${diceStr(dr)}${c.castMod ? (c.castMod > 0 ? "+" : "") + c.castMod : ""}${dmgBonus ? "+" + dmgBonus : ""} ${ab.dtype} = ${amt}`, "roll");
        if (ab.drain) amt = Math.max(1, amt);
        const dealt = dealDamage(S, cs, ev, c, t, [{ amount: amt, dtype: ab.dtype }], { crit: roll.crit });
        if (ab.drain && dealt > 0) heal(cs, ev, c, Math.floor(dealt / 2));
        if (roll.crit && c.team === "player") ev.push({ t: "crit", id: c.id });
        if (!t.dead && ab.status) {
          const stat = c.tags.includes("cryomancer") && ab.dtype === "cold" ? [...ab.status, { id: "frozen", dur: 1, chance: 0.3 }] : ab.status;
          applyStatuses(S, cs, ev, c, t, stat);
        }
        if (!t.dead && c.tags.includes("pyromancer") && ab.dtype === "fire") addCond(cs, ev, t, "burning", 2, c.id);
      }
    }
  } else if (ab.kind === "heal") {
    for (const t of targets) {
      const dr = rollDice(rng(), ab.dice);
      let amt = dr.total + (ab.attr ? c.mods[ab.attr as Attr] : 0) + (ab.target === "allies" ? 0 : c.level);
      if (c.tags.includes("lifeweaver")) amt = Math.floor(amt * 1.5);
      log(ev, `${ab.name}: ${diceStr(dr)}+mods = ${amt}`, "roll");
      heal(cs, ev, t, Math.max(1, amt));
      if (c.tags.includes("lifeweaver")) addCond(cs, ev, t, "regen", 2);
    }
  } else if (ab.kind === "buff") {
    const rec = ab.target === "allies" ? allies(cs, c) : [c];
    for (const t of rec) for (const s of ab.self_status ?? []) addCond(cs, ev, t, s.id, s.dur, ab.conc ? "conc:" + c.id : c.id);
    if (ab.conc) c.conc = abId;
    if (ab.status) for (const t of opponents(cs, c)) applyStatuses(S, cs, ev, c, t, ab.status.filter((s: any) => s.all));
    for (const s of ab.self_status ?? []) log(ev, `${c.name} gains ${condDef(s.id).name}.`, "good");
  } else if (ab.kind === "utility") {
    for (const t of targets) {
      if (ab.status) applyStatuses(S, cs, ev, c, t, ab.status, !!ab.conc);
    }
    if (ab.conc) c.conc = abId;
  } else if (ab.kind === "summon") {
    spawnSummon(cs, ev, c, ab.summon);
  }
  return true;
}
function spawnSummon(cs: CombatState, ev: CEvent[], owner: Combatant, defId: string) {
  const def = D.enemies[defId];
  const st = scaleEnemy(def, owner.level, false);
  const c = blank();
  const id = "s" + ++cs.uid + owner.id;
  Object.assign(c, {
    id, name: def.name, team: owner.team, control: "ai", kind: "summon", level: st.level, defId, body: def.body, pal: def.pal, size: def.size, hat: def.hat, wep: def.wep,
    hp: st.hp, maxHp: st.hp, ac: st.ac, atk: st.atk, speed: def.speed, init: 0, wpn: { name: def.name, dice: def.dmg, attr: "STR", dtype: def.dtype, range: def.range, bonus: st.db, two: false },
    resist: def.resist ?? [], vuln: def.vuln ?? [], immune: def.immune ?? [], flying: !!def.flying, x: owner.team === "player" ? Math.max(0, owner.x - 1) : Math.min(8, owner.x + 1),
  });
  cs.units.push(c); cs.order.push(id); owner.summons++;
  ev.push({ t: "spawn", id });
  log(ev, `${def.name} joins the fight!`, owner.team === "player" ? "good" : "bad");
}

// ---------- Items ----------
function consume(S: GameState, uid: string) {
  const it = S.player.inventory.find((i) => i.uid === uid);
  if (!it) return;
  it.qty--;
  if (it.qty <= 0) S.player.inventory = S.player.inventory.filter((i) => i !== it);
}
function useItem(S: GameState, cs: CombatState, ev: CEvent[], c: Combatant, uid: string, targetId?: string): boolean {
  const inst = S.player.inventory.find((i) => i.uid === uid);
  const def = inst && D.items[inst.id];
  if (!inst || !def || def.type !== "potion") { ev.push({ t: "deny", msg: "Cannot use that" }); return false; }
  const free = c.tags.includes("alchemist") && !!def.effect.heal;
  if (!free && !c.bonus) { ev.push({ t: "deny", msg: "No bonus action" }); return false; }
  const e = def.effect;
  let target: Combatant | undefined;
  if (e.throw) {
    target = pickEnemyTarget(cs, c, targetId);
    if (!target || dist(c, target) > 6) { ev.push({ t: "deny", msg: "No target in range" }); return false; }
  }
  if (!free) c.bonus = false;
  consume(S, uid);
  ev.push({ t: "fx", kind: e.throw ? "fire" : "heal", src: c.id, dst: target?.id ?? c.id, color: e.throw ? "#ff7b00" : "#69db7c", name: def.name });
  log(ev, `${c.name} uses ${def.name}.`, "spell");
  if (e.heal) {
    const dr = rollDice(rng(), e.heal);
    const amt = Math.floor(dr.total * (c.tags.includes("alchemist") ? 1.5 : 1));
    log(ev, `  ${diceStr(dr)} = ${amt}`, "roll");
    heal(cs, ev, c, amt);
  }
  if (e.resource) { gainRes(c, e.resource); log(ev, `  +${e.resource} ${c.resType}.`, "good"); ev.push({ t: "res", id: c.id }); }
  if (e.cure) for (const k of e.cure) removeCond(ev, c, k);
  if (e.status) addCond(cs, ev, c, e.status.id, e.status.dur, c.id);
  if (e.flag) { S.flags[e.flag] = e.value; log(ev, `  Reality begins to bend...`, "sys"); }
  if (e.throw && target) {
    const roll = makeRoll(rng(), "Throw", c.prof + c.mods.AGI, acOf(target), attackMode(cs, c, target, true, true), "AC", { auto: true });
    ev.push({ t: "roll", id: c.id, roll, kind: "attack" });
    ev.push({ t: "attack", src: c.id, dst: target.id, hit: roll.success, ranged: true, color: "#ff7b00", spell: true });
    log(ev, `${c.name} hurls the flask: ${describeRoll(roll)} → ${roll.success ? "HIT" : "MISS"}`, "roll");
    if (roll.success) {
      const dr = rollDice(rng(), e.throw, { crit: roll.crit });
      log(ev, `  ${diceStr(dr)} fire`, "roll");
      dealDamage(S, cs, ev, c, target, [{ amount: dr.total, dtype: e.dtype }], { crit: roll.crit });
      if (!target.dead && e.status) addCond(cs, ev, target, e.status.id, e.status.dur, c.id);
    } else ev.push({ t: "miss", id: target.id });
  }
  return true;
}

// ---------- Player/AI action entry ----------
export function perform(S: GameState, cs: CombatState, c: Combatant, a: Action): CEvent[] {
  const ev: CEvent[] = [];
  const deny = (msg: string) => ev.push({ t: "deny", msg });
  if (cs.over || c.dead) return ev;
  const hasAction = c.actions > 0;
  switch (a.type) {
    case "attack": {
      if (!hasAction) { deny("No action left"); break; }
      const t = pickEnemyTarget(cs, c, a.target);
      if (!t) { deny("No target"); break; }
      const melee = c.wpn.range <= 1;
      if (melee) { if (!approach(S, cs, ev, c, t, 1)) { deny("Too far — Dash or move closer"); break; } }
      else if (dist(c, t) > c.wpn.range) { deny("Out of range"); break; }
      if (c.dead || c.downed) break;
      c.actions--;
      ev.push({ t: "act", id: c.id, what: "attack" });
      strike(S, cs, ev, c, t, null, { ranged: !melee });
      break;
    }
    case "ability": useAbility(S, cs, ev, c, a.ability!, a.target); break;
    case "defend":
      if (!hasAction) { deny("No action left"); break; }
      c.actions--; c.defending = true;
      if (c.resType === "rage") gainRes(c, 1);
      ev.push({ t: "fx", kind: "defend", src: c.id, color: "#74c0fc", name: "Defend" });
      log(ev, `${c.name} braces behind their guard (+${2 + (c.tags.includes("shield_master") ? 3 : 0)} AC).`, "sys");
      break;
    case "dash":
      if (!hasAction) { deny("No action left"); break; }
      c.actions--; c.moveLeft += c.speed; log(ev, `${c.name} dashes (+${c.speed} movement).`, "sys"); break;
    case "disengage":
      if (!hasAction) { deny("No action left"); break; }
      c.actions--; c.disengaged = true; log(ev, `${c.name} disengages: no opportunity attacks this turn.`, "sys"); break;
    case "hide": {
      if (!hasAction) { deny("No action left"); break; }
      c.actions--;
      const dc = 10 + Math.max(0, ...opponents(cs, c).map((o) => o.mods.AGI)) + (opponents(cs, c).some((o) => dist(o, c) <= 1) ? 3 : 0);
      const roll = makeRoll(rng(), "Stealth", c.mods.AGI + c.prof + (c.classId === "rogue" ? 2 : 0), dc, "normal", "DC", { auto: false });
      ev.push({ t: "roll", id: c.id, roll, kind: "check" });
      log(ev, `${c.name} tries to hide: ${describeRoll(roll)} → ${roll.success ? "HIDDEN" : "SPOTTED"}`, "roll");
      if (roll.success) addCond(cs, ev, c, "hidden", 3);
      break;
    }
    case "shove": case "grapple": {
      const shove = a.type === "shove";
      if (shove && c.tags.includes("shield_master") ? !c.bonus : !hasAction) { deny("No action left"); break; }
      const t = pickEnemyTarget(cs, c, a.target);
      if (!t) { deny("No target"); break; }
      if (!approach(S, cs, ev, c, t, 1)) { deny("Too far — move closer"); break; }
      if (shove && c.tags.includes("shield_master")) c.bonus = false; else c.actions--;
      const mode = attackMode(cs, c, t, false, true);
      const ra = makeRoll(rng(), shove ? "Shove" : "Grapple", c.mods.STR + c.prof, 10 + Math.max(t.mods.STR, t.mods.AGI) + t.prof, mode, "DC", { auto: false });
      ev.push({ t: "roll", id: c.id, roll: ra, kind: "check" });
      log(ev, `${c.name} ${shove ? "shoves" : "grapples"} ${t.name}: ${describeRoll(ra)} → ${ra.success ? "SUCCESS" : "FAIL"}`, "roll");
      ev.push({ t: "fx", kind: "hit", src: c.id, dst: t.id, color: "#ffffff", name: shove ? "Shove" : "Grapple" });
      if (ra.success) {
        if (shove) {
          const dir = Math.sign(t.x - c.x) || 1;
          const from = t.x;
          t.x = clamp(t.x + dir * 2, 0, cs.arena.len - 1);
          ev.push({ t: "move", id: t.id, from, to: t.x, forced: true });
          log(ev, `${t.name} is hurled back ${Math.abs(t.x - from)} squares!`, "good");
          hazardTick(S, cs, ev, t);
        } else addCond(cs, ev, t, "restrained", 2, c.id);
      }
      break;
    }
    case "help": {
      if (!hasAction) { deny("No action left"); break; }
      const al = allies(cs, c).filter((u) => u !== c && !u.downed);
      if (!al.length) { deny("No ally to help"); break; }
      c.actions--; al[0].helped = true; log(ev, `${c.name} helps ${al[0].name}: their next attack has advantage.`, "sys"); break;
    }
    case "search": {
      if (!hasAction) { deny("No action left"); break; }
      const t = pickEnemyTarget(cs, c, a.target);
      if (!t) { deny("No target"); break; }
      c.actions--;
      const roll = makeRoll(rng(), "Search", c.mods.INT + c.prof, 12, "normal", "DC", { auto: false });
      ev.push({ t: "roll", id: c.id, roll, kind: "check" });
      log(ev, `${c.name} studies ${t.name}: ${describeRoll(roll)} → ${roll.success ? "WEAKNESS FOUND" : "nothing"}`, "roll");
      if (roll.success) {
        addCond(cs, ev, t, "exposed", 2, c.id);
        const w = t.vuln.length ? `Weak to ${t.vuln.join(", ")}.` : "No special weakness, but its guard is open.";
        log(ev, `  ${w}`, "good");
      }
      break;
    }
    case "ready":
      if (!hasAction) { deny("No action left"); break; }
      c.actions--; c.readied = true; log(ev, `${c.name} readies an attack for the first enemy that comes close.`, "sys"); break;
    case "interact": {
      if (!hasAction) { deny("No action left"); break; }
      if (!cs.arena.props.includes("brazier") || cs.arena.brazier) { deny("Nothing to interact with"); break; }
      c.actions--; cs.arena.brazier = true;
      const t = pickEnemyTarget(cs, c, a.target) ?? c;
      cs.arena.hazards.push({ from: Math.max(0, t.x - 1), to: Math.min(8, t.x), type: "spilled coals", dtype: "fire", dice: "1d6", color: "#ff7b00", ttl: 4 });
      ev.push({ t: "hazard" });
      log(ev, `${c.name} kicks over a brazier: burning coals scatter near ${t.name}!`, "good");
      hazardTick(S, cs, ev, t);
      break;
    }
    case "item": useItem(S, cs, ev, c, a.uid!, a.target); break;
    case "move": {
      const dx = Math.sign(a.dx ?? 1);
      if (condAny(c, "nomove")) { deny("Restrained!"); break; }
      if (c.moveLeft < 1) { deny("No movement left"); break; }
      const nx = clamp(c.x + dx, 0, cs.arena.len - 1);
      if (nx === c.x) { deny("Edge of the battlefield"); break; }
      moveActor(S, cs, ev, c, nx, 1);
      break;
    }
    case "flee": {
      if (!cs.canFlee) { deny("There is no escaping this fight!"); break; }
      if (!hasAction) { deny("No action left"); break; }
      c.actions--;
      const foes = opponents(cs, c).length;
      const roll = makeRoll(rng(), "Flee", c.mods.AGI + c.prof, 10 + foes, "normal", "DC", { auto: false });
      ev.push({ t: "roll", id: c.id, roll, kind: "check" });
      log(ev, `${c.name} tries to flee: ${describeRoll(roll)} → ${roll.success ? "ESCAPED" : "BLOCKED"}`, "roll");
      if (roll.success) { cs.over = "fled"; ev.push({ t: "over", result: "fled" }); }
      break;
    }
    case "second_wind": {
      if (!c.tags.includes("second_wind") || c.windUsed || !c.bonus) { deny("Unavailable"); break; }
      c.bonus = false; c.windUsed = true;
      const dr = rollDice(rng(), "1d10");
      heal(cs, ev, c, dr.total + c.level);
      ev.push({ t: "fx", kind: "heal", src: c.id, color: "#69db7c", name: "Second Wind" });
      break;
    }
    case "improvise": {
      // resolved by skills.ts via controller; engine only applies validated mechanical effect
      const p = a.proposal;
      if (!hasAction) { deny("No action left"); break; }
      c.actions--;
      ev.push(...(p?.events ?? []));
      break;
    }
    case "end": break;
    default: deny("Unknown action");
  }
  return ev;
}

// ---------- Turn flow ----------
export function beginTurn(S: GameState, cs: CombatState, ev: CEvent[], c: Combatant) {
  c.actions = c.perTurn; c.bonus = true; c.reaction = true; c.defending = false; c.disengaged = false; c.readied = false; c.skip = false;
  c.moveLeft = condAny(c, "nomove") ? 0 : Math.max(1, c.speed + condSum(c, "speed"));
  for (const k of Object.keys(c.cd)) if (c.cd[k] > 0) c.cd[k]--;
  ev.push({ t: "turn", id: c.id });
  // regen
  if (!c.downed) {
    if (c.resType === "mana") gainRes(c, 1);
    else if (c.resType === "energy") gainRes(c, 3);
    else if (c.resType === "stamina") gainRes(c, 2);
    else if (c.resType === "charges") { if (cs.round % 2 === 0) gainRes(c, 1); }
    else if (c.resType === "rage") gainRes(c, -1);
    if (c.regen > 0) heal(cs, ev, c, c.regen, true);
  }
  // DoT / HoT
  for (const k of c.conds.slice()) {
    const d = condDef(k.id);
    if (d.dot && !c.dead) {
      const dr = rollDice(rng(), d.dot);
      log(ev, `${c.name} suffers ${d.name}: ${dr.total} ${d.dtype}.`, "bad");
      dealDamage(S, cs, ev, null, c, [{ amount: dr.total, dtype: d.dtype }], { noEnv: true });
    }
    if (d.hot && !c.dead && !c.downed) heal(cs, ev, c, rollDice(rng(), d.hot).total, true);
    if (d.skip) c.skip = true;
  }
  if (c.dead) return;
  if (!c.downed) hazardTick(S, cs, ev, c);
  if (c.downed && !c.stable && !c.dead) {
    const r = rng().d(20);
    ev.push({ t: "dsave", id: c.id, roll: r });
    if (r === 20) { c.downed = false; c.hp = 1; c.ds = { s: 0, f: 0 }; ev.push({ t: "revive", id: c.id }); log(ev, `${c.name} rolls a natural 20 and surges back to their feet with 1 HP!`, "good"); S.stats.revives += c.kind === "player" ? 1 : 0; }
    else {
      if (r === 1) c.ds.f += 2; else if (r >= D.rules.death_save_dc) c.ds.s++; else c.ds.f++;
      log(ev, `${c.name} death save: ${r} → successes ${c.ds.s}/3, failures ${Math.min(3, c.ds.f)}/3`, r >= 10 ? "good" : "bad");
      if (c.ds.f >= 3) kill(S, cs, ev, c, null);
      else if (c.ds.s >= 3) { c.stable = true; log(ev, `${c.name} stabilizes (unconscious).`, "sys"); }
    }
  }
  if (c.downed || c.dead) c.skip = true;
  if (c.skip && !c.dead && !c.downed) log(ev, `${c.name} loses their turn!`, "bad");
}
export function endTurn(cs: CombatState, ev: CEvent[], c: Combatant) {
  for (const k of c.conds.slice()) {
    k.dur--;
    if (k.dur <= 0) removeCond(ev, c, k.id);
  }
  if (c.dead) return;
  ev.push({ t: "res", id: c.id });
}
export function checkOver(cs: CombatState): "victory" | "defeat" | null {
  if (!cs.units.some((u) => u.team === "enemy" && !u.dead)) return "victory";
  const hero = cs.units.find((u) => u.kind === "player")!;
  if (hero.dead) return "defeat";
  if (!cs.units.some((u) => u.team === "player" && !u.dead && !u.downed && !u.stable)) {
    if (cs.units.some((u) => u.team === "player" && u.downed && !u.stable && !u.dead)) {
      // still rolling death saves; enemies keep acting
      return null;
    }
    return "defeat";
  }
  return null;
}
/** Advance to the next player-controlled turn (or combat end), running all AI turns. Returns events. */
export function advance(S: GameState, cs: CombatState, ev: CEvent[] = [], startFresh = false): CEvent[] {
  let guard = 0;
  if (startFresh) { cs.idx = -1; cs.round = 0; }
  while (guard++ < 200) {
    const ov = checkOver(cs);
    if (ov) { cs.over = ov; ev.push({ t: "over", result: ov }); return ev; }
    if (cs.over) return ev;
    cs.idx++;
    if (cs.idx >= cs.order.length) { cs.idx = 0; }
    if (cs.idx === 0) {
      cs.round++;
      ev.push({ t: "round", n: cs.round });
      for (const h of cs.arena.hazards) if (h.ttl !== undefined) h.ttl--;
      const had = cs.arena.hazards.length;
      cs.arena.hazards = cs.arena.hazards.filter((h) => h.ttl === undefined || h.ttl > 0);
      if (cs.arena.hazards.length !== had) ev.push({ t: "hazard" });
    }
    const c = unit(cs, cs.order[cs.idx]);
    if (!c || c.dead) continue;
    cs.cur = c.id;
    beginTurn(S, cs, ev, c);
    const ov2 = checkOver(cs);
    if (ov2) { cs.over = ov2; ev.push({ t: "over", result: ov2 }); return ev; }
    if (c.dead || c.skip || c.downed) { endTurn(cs, ev, c); continue; }
    if (c.control === "player") return ev;
    aiTurn(S, cs, ev, c);
    endTurn(cs, ev, c);
  }
  return ev;
}
export function endPlayerTurn(S: GameState, cs: CombatState): CEvent[] {
  const ev: CEvent[] = [];
  const c = unit(cs, cs.cur);
  if (c) endTurn(cs, ev, c);
  advance(S, cs, ev);
  return ev;
}
/** True when player has nothing meaningful left to do this turn. */
export function turnSpent(S: GameState, cs: CombatState, c: Combatant): boolean {
  if (c.actions > 0) return false;
  if (c.bonus) {
    if (c.abilities.some((id) => D.abilities[id]?.action === "bonus" && abilityStatus(cs, c, id).ok && !c.conds.some((q) => q.id === D.abilities[id].self_status?.[0]?.id))) return false;
    if (c.hp < c.maxHp * 0.5 && S.player.inventory.some((i) => D.items[i.id]?.type === "potion" && D.items[i.id].effect.heal)) return false;
    if (c.tags.includes("second_wind") && !c.windUsed && c.hp < c.maxHp * 0.6) return false;
  }
  return true;
}

// ---------- AI ----------
function aiTurn(S: GameState, cs: CombatState, ev: CEvent[], c: Combatant) {
  for (let k = 0; k < c.perTurn; k++) {
    if (cs.over || c.dead || c.downed) return;
    if (checkOver(cs)) return;
    if (c.actions <= 0) break;
    const foes = opponents(cs, c);
    if (!foes.length) return;
    const r = rng();
    const active = foes.filter((f) => !f.downed);
    const pool = active.length ? active : foes;
    let target = pool.slice().sort((a, b) => hpPct(a) * 3 + dist(c, a) * 0.2 - (hasCond(a, "hidden") ? -2 : 0) - (hpPct(b) * 3 + dist(c, b) * 0.2))[0];
    if (r.chance(0.3)) target = r.pick(pool);
    if (hasCond(c, "frightened") && dist(c, target) <= 1 && c.wpn.range > 1 === false && r.chance(0.3)) { log(ev, `${c.name} cowers in fear.`, "sys"); c.actions--; continue; }
    // ability selection
    let chosen: string | null = null;
    if (c.kind === "enemy" || c.kind === "summon") {
      for (const a of c.ai) {
        const ab = D.abilities[a.id];
        if (!ab || !abilityStatus(cs, c, a.id).ok) continue;
        if (ab.kind === "heal" && !allies(cs, c).some((u) => hpPct(u) < 0.6)) continue;
        if (ab.kind === "summon" && c.summons >= 2) continue;
        if (ab.target === "enemies" && ab.range <= 1 && !foes.some((f) => dist(c, f) <= 1)) continue;
        if (ab.kind === "buff" && allies(cs, c).some((u) => hasCond(u, "buffed"))) continue;
        if (r.chance(a.w)) { chosen = a.id; break; }
      }
    } else {
      const ready = c.abilities.filter((id) => abilityStatus(cs, c, id).ok && D.abilities[id].action !== "bonus");
      const heals = ready.filter((id) => D.abilities[id].kind === "heal");
      const dmg = ready.filter((id) => ["weapon", "spell"].includes(D.abilities[id].kind));
      if (heals.length && allies(cs, c).some((u) => hpPct(u) < 0.5 || u.downed)) chosen = heals[0];
      else if (dmg.length && r.chance(0.65)) chosen = r.pick(dmg);
      // bonus buffs
      const bb = c.abilities.find((id) => D.abilities[id].action === "bonus" && D.abilities[id].kind === "buff" && abilityStatus(cs, c, id).ok && !c.conds.some((q) => q.id === D.abilities[id].self_status?.[0]?.id));
      if (bb && r.chance(0.5)) useAbility(S, cs, ev, c, bb);
    }
    if (chosen) {
      const ab = D.abilities[chosen];
      const tid = ab.target === "ally" ? bestHeal(cs, c).id : target.id;
      if (useAbility(S, cs, ev, c, chosen, tid)) continue;
      // illegal (range etc): fall through to basic attack
      for (let q = ev.length - 1; q >= 0; q--) if (ev[q].t === "deny") ev.splice(q, 1);
    }
    // basic attack with movement
    const melee = c.wpn.range <= 1;
    if (melee) {
      if (!approach(S, cs, ev, c, target, 1) && dist(c, target) > 1) {
        // move as close as possible
        const step = Math.min(c.moveLeft, dist(c, target) - 1);
        if (step > 0) moveActor(S, cs, ev, c, c.x + Math.sign(target.x - c.x) * step, step);
        c.actions--;
        continue;
      }
    } else if (dist(c, target) > c.wpn.range) {
      const step = Math.min(c.moveLeft, dist(c, target) - c.wpn.range);
      if (step > 0) moveActor(S, cs, ev, c, c.x + Math.sign(target.x - c.x) * step, step);
    }
    if (c.dead || c.downed) return;
    c.actions--;
    ev.push({ t: "act", id: c.id, what: "attack" });
    strike(S, cs, ev, c, target, null, { ranged: !melee });
  }
}

/** Applies the validated mechanical result of a freeform (improvised) action in combat. */
export function improvise(S: GameState, cs: CombatState, c: Combatant, intent: string, success: boolean, crit: boolean, targetId?: string): CEvent[] {
  const ev: CEvent[] = [];
  const t = pickEnemyTarget(cs, c, targetId);
  if (!t) return ev;
  ev.push({ t: "fx", kind: "spell", src: c.id, dst: t.id, color: "#ffd166", name: "Improvise" });
  if (success) {
    switch (intent) {
      case "intimidate": addCond(cs, ev, t, "frightened", crit ? 3 : 2, c.id); break;
      case "distract": addCond(cs, ev, t, "blinded", crit ? 3 : 2, c.id); break;
      case "deceive": addCond(cs, ev, t, "exposed", 2, c.id); break;
      case "search": addCond(cs, ev, t, "exposed", 2, c.id); break;
      case "climb": c.helped = true; addCond(cs, ev, c, "buffed", 2, c.id); log(ev, `${c.name} seizes the high ground!`, "good"); break;
      case "sneak": addCond(cs, ev, c, "hidden", 3); break;
      case "arcane": addCond(cs, ev, t, "debuffed", 3, c.id); break;
      case "force": {
        const dr = rollDice(rng(), crit ? "2d8" : "1d8");
        log(ev, `Improvised hazard crashes into ${t.name}: ${diceStr(dr)} blunt`, "roll");
        dealDamage(S, cs, ev, c, t, [{ amount: dr.total, dtype: "blunt" }], {});
        if (!t.dead) addCond(cs, ev, t, "restrained", 1, c.id);
        break;
      }
      default: addCond(cs, ev, t, "exposed", 1, c.id);
    }
  } else {
    log(ev, `The improvisation backfires! ${c.name} is thrown off balance.`, "bad");
    addCond(cs, ev, c, "debuffed", 1, t.id);
  }
  return ev;
}
export { diceAvg };
