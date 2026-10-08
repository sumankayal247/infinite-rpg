/* eslint-disable @typescript-eslint/no-explicit-any */
// Skill checks, freeform action validation/resolution, bribery, haggling. All dice come from rng.ts.
import { D } from "./data";
import { stream } from "./rng";
import { clamp, deriveStats, makeRoll, type RollInfo } from "./engine";
import { sanitizeInput } from "./security";
import { calendar } from "./calendar";
import type { Attr, GameState, Mode, Npc } from "./types";
import { ATTRS } from "./types";

export type Cls = "LEGAL" | "DIFFICULT" | "HIGH_RISK" | "CONTESTED" | "IMPOSSIBLE";
export interface Proposal { intent: string; target_id?: string; approach: string; suggested_skill: Attr; risk_level: string; narrative_context: string; modifiers?: string[] }
export interface FreeCtx { inCombat: boolean; npc?: Npc | null; allowed: string[]; obstacle?: boolean; hasEnemy?: boolean; dcBonus?: number }
export type Effect = { k: string; [x: string]: any };
export interface Resolution { cls: Cls; proposal: Proposal; roll?: RollInfo; dc: number; success: boolean; reason: string; mods: string[]; effects: Effect[]; mode: Mode }

export const INTENTS = ["persuade", "intimidate", "deceive", "steal", "lockpick", "climb", "force", "sneak", "distract", "search", "arcane", "riddle", "attack", "other"];
const DEFAULT_SKILL: Record<string, Attr> = { persuade: "CHA", intimidate: "CHA", deceive: "CHA", steal: "AGI", lockpick: "AGI", climb: "AGI", force: "STR", sneak: "AGI", distract: "AGI", search: "INT", arcane: "INT", riddle: "INT", attack: "STR", other: "INT" };
const SOCIAL = ["persuade", "intimidate", "deceive", "steal"];
const rng = () => stream("social");

/** Core check used by every non-combat dice throw. Records dice history. */
export function playerCheck(S: GameState, label: string, attr: Attr, dc: number, o: { adv?: boolean; dis?: boolean; bonus?: number; tag?: string } = {}): RollInfo {
  const d = deriveStats(S.player);
  let bonus = d.mods[attr] + d.prof + (o.bonus ?? 0) + d.check;
  const tags = d.tags;
  if (o.tag === "social" && tags.includes("silver_tongue")) bonus += 3;
  if (o.tag === "theft" && tags.includes("light_fingers")) bonus += 3;
  let adv = !!o.adv, dis = !!o.dis;
  if (o.tag === "social" && S.flags.charm) { adv = true; S.flags.charm = false; }
  if (o.tag === "lore" && S.flags.translate) { adv = true; S.flags.translate = false; }
  if (S.player.wounds.includes("scarred") && label.toLowerCase().includes("intimidat")) bonus += 2;
  const mode: Mode = adv && !dis ? "advantage" : dis && !adv ? "disadvantage" : "normal";
  const r = makeRoll(rng(), label, bonus, dc, mode, "DC", { critRange: 20, auto: true });
  S.dice.push({ day: calendar(S.hours).dayAbs, label, d20: r.d20, mode, mod: bonus, total: r.total, dc, success: r.success, crit: r.crit, fumble: r.fumble });
  if (S.dice.length > 40) S.dice.shift();
  return r;
}

// ---------- Freeform pipeline ----------
const IMPOSSIBLE_RE = /(teleport|fly (to|away|up)|become (a )?(god|king)|kill (everyone|them all|the whole)|instantly (kill|win)|wish for|time travel|stop time|resurrect everyone|delete|turn into a dragon)/i;
const KEYWORDS: [RegExp, string][] = [
  [/(intimidat|threat|scare|menac|terrif|severed head|growl|fear me)/i, "intimidate"],
  [/(lie|bluff|pretend|disguis|claim|fake|trick|royal messenger|cursed)/i, "deceive"],
  [/(steal|pickpocket|swipe|snatch|rob|pilfer)/i, "steal"],
  [/(lockpick|unlock|pick the lock|pick lock|\block\b)/i, "lockpick"],
  [/(climb|roof|chimney|jump|leap|vault|swing|rope|scale)/i, "climb"],
  [/(sand|distract|decoy|blind|toss|throw)/i, "distract"],
  [/(push|break|smash|bash|topple|knock over|bookshelf|force|shove|barricade)/i, "force"],
  [/(sneak|hide|shadow|creep|quietly)/i, "sneak"],
  [/(search|investigate|inspect|examine|look for|study)/i, "search"],
  [/(spell|magic|arcane|rune|enchant|incant)/i, "arcane"],
  [/(riddle|puzzle|decipher|solve)/i, "riddle"],
  [/(convinc|persuad|talk|plead|negotiat|reason|ask|charm|bargain|beg)/i, "persuade"],
  [/(attack|stab|slash|hit|punch|kick|shoot|strike)/i, "attack"],
];
/** Offline interpretation (used if the AI is unavailable or its proposal fails validation). */
export function interpretLocal(text: string, ctx: FreeCtx): Proposal {
  const t = sanitizeInput(text);
  let intent = "other";
  for (const [re, i] of KEYWORDS) if (re.test(t)) { intent = i; break; }
  const high = /(royal|king|queen|impossible|guards? captain|dragon|lord)/i.test(t);
  return { intent, target_id: ctx.npc?.id, approach: t.slice(0, 80), suggested_skill: DEFAULT_SKILL[intent], risk_level: high ? "high" : "medium", narrative_context: t, modifiers: t.length > 40 ? ["clever"] : [] };
}
export function validateProposal(p: any, ctx: FreeCtx, text: string): Proposal {
  const intent = INTENTS.includes(p?.intent) ? p.intent : interpretLocal(text, ctx).intent;
  const skill: Attr = ATTRS.includes(p?.suggested_skill) ? p.suggested_skill : DEFAULT_SKILL[intent];
  const risk = D.rules.risk_dc[p?.risk_level] ? p.risk_level : "medium";
  const mods = Array.isArray(p?.modifiers) ? p.modifiers.filter((m: any) => typeof m === "string").slice(0, 3) : [];
  return { intent, target_id: ctx.npc?.id, approach: sanitizeInput(String(p?.approach ?? text), 80), suggested_skill: skill, risk_level: risk, narrative_context: sanitizeInput(String(p?.narrative_context ?? text), 160), modifiers: mods };
}
export function classify(S: GameState, p: Proposal, ctx: FreeCtx, rawText: string): { cls: Cls; dc: number; mode: Mode; mods: string[]; reason: string } {
  let reason = "";
  const impossible = (why: string) => ({ cls: "IMPOSSIBLE" as Cls, dc: 99, mode: "normal" as Mode, mods: [], reason: why });
  if (IMPOSSIBLE_RE.test(rawText)) return impossible("That is beyond what any mortal gambit could achieve.");
  const social = SOCIAL.includes(p.intent);
  if (ctx.inCombat) {
    if (!ctx.hasEnemy) return impossible("There is nothing to act against.");
    if (["persuade", "lockpick", "riddle", "steal"].includes(p.intent)) return impossible("This is no time for that: swords are drawn.");
  } else {
    if (social && !ctx.npc) return impossible("There is no one here to act upon.");
    if (social && ctx.npc && !ctx.npc.alive) return impossible("They can no longer hear you.");
    if (!social && p.intent === "attack" && !ctx.npc) return impossible("Nothing here to strike.");
    if (!ctx.obstacle && !ctx.npc && !["search", "sneak", "arcane", "other"].includes(p.intent)) return impossible("Nothing here responds to that approach.");
  }
  let dc: number = D.rules.risk_dc[p.risk_level];
  const npc = ctx.npc;
  if (npc && social) {
    const a = p.intent === "persuade" ? Math.round((npc.loyalty - 50) / 20) - Math.round(npc.rel.trust / 30) + Math.round(npc.rel.hostility / 30)
      : p.intent === "intimidate" ? Math.round((50 - npc.fear) / 15)
      : p.intent === "deceive" ? Math.round((npc.loyalty - 50) / 20) + (npc.traits.some((t) => /suspicious|shrewd|wary/.test(t)) ? 2 : 0)
      : Math.round((npc.loyalty - 50) / 20) + 1;
    dc += a;
  }
  const fm = D.rules.freeform_modifiers;
  const mods: string[] = [];
  let bonus = 0, adv = false, dis = false;
  for (const m of p.modifiers ?? []) {
    if (!ctx.allowed.includes(m) && m !== "clever") continue;
    if (m === "clever" && rawText.length < 25) continue;
    if (m === "environment_advantage") { adv = true; mods.push("Advantage (environment)"); }
    else if (m === "hostile_environment") { dis = true; mods.push("Disadvantage (hostile terrain)"); }
    else if (typeof fm[m] === "number") { bonus += fm[m]; mods.push(`${m.replace(/_/g, " ")} ${fm[m]}`); }
  }
  bonus = Math.max(bonus, fm.max_total_bonus);
  dc = clamp(dc + bonus + (ctx.dcBonus ?? 0), 6, 24);
  const mode: Mode = adv && !dis ? "advantage" : dis && !adv ? "disadvantage" : "normal";
  reason = "";
  const cls: Cls = ctx.npc && social ? "CONTESTED" : ["high", "extreme"].includes(p.risk_level) ? "HIGH_RISK" : dc >= 15 ? "DIFFICULT" : "LEGAL";
  return { cls, dc, mode, mods, reason };
}
export function outcomeEffects(intent: string, success: boolean, crit: boolean, fumble: boolean, ctx: FreeCtx): Effect[] {
  const fx: Effect[] = [];
  const npc = ctx.npc?.id;
  if (success) {
    fx.push({ k: "xp", n: 6 });
    if (SOCIAL.includes(intent)) fx.push({ k: "counter", key: "socialWins" });
    switch (intent) {
      case "persuade": fx.push({ k: "npc", id: npc, rel: { trust: 10, respect: 4 }, mem: "was persuaded by the player" }, { k: "loot", mult: crit ? 0.9 : 0.6 }, { k: "tag", tag: "honesty" }); break;
      case "intimidate": fx.push({ k: "npc", id: npc, rel: { fear: 12, hostility: 6 }, mem: "was intimidated by the player" }, { k: "loot", mult: 0.5 }, { k: "rep", axis: "criminal", n: 1 }, { k: "tag", tag: "cruelty" }); break;
      case "deceive": fx.push({ k: "npc", id: npc, rel: { trust: 4 }, mem: "was deceived by the player" }, { k: "loot", mult: 0.7 }, { k: "tag", tag: "lie" }); break;
      case "steal": fx.push({ k: "loot", mult: crit ? 2 : 1.3 }, { k: "rep", axis: "criminal", n: 3 }, { k: "counter", key: "steals" }, { k: "tag", tag: "theft" }, { k: "npc", id: npc, rel: {}, mem: "was robbed by someone, but doesn't know who yet" }); break;
      case "attack": fx.push({ k: "combat" }); break;
      default: fx.push({ k: "loot", mult: crit ? 1 : 0.6 }); if (ctx.obstacle) fx.push({ k: "reveal", chance: 0.3 });
    }
  } else {
    // fail forward: every failure changes the world
    switch (intent) {
      case "persuade": fx.push({ k: "npc", id: npc, rel: { trust: -6, hostility: 4 }, mem: "was unconvinced by the player and grew suspicious" }); break;
      case "intimidate": fx.push({ k: "npc", id: npc, rel: { hostility: 12, fear: -6 }, mem: "was not cowed by the player's threats" }, fumble ? { k: "combat" } : { k: "alert" }); break;
      case "deceive": fx.push({ k: "npc", id: npc, rel: { trust: -14 }, mem: "caught the player in a lie" }, { k: "alert" }); break;
      case "steal": fx.push({ k: "caught", severe: fumble }, { k: "npc", id: npc, rel: { trust: -20, hostility: 15 }, mem: "caught the player stealing" }, { k: "tag", tag: "theft" }); break;
      case "attack": fx.push({ k: "combat" }); break;
      default: fx.push({ k: "trapdmg", mult: fumble ? 1.6 : 1 }, { k: "alert" });
    }
  }
  return fx;
}
export function resolveFreeform(S: GameState, text: string, rawProposal: any, ctx: FreeCtx): Resolution {
  const clean = sanitizeInput(text);
  const p = validateProposal(rawProposal ?? interpretLocal(clean, ctx), ctx, clean);
  const c = classify(S, p, ctx, clean);
  if (c.cls === "IMPOSSIBLE") return { cls: c.cls, proposal: p, dc: 0, success: false, reason: c.reason, mods: [], effects: [{ k: "time", hours: 0 }], mode: "normal" };
  const roll = playerCheck(S, `${p.intent[0].toUpperCase() + p.intent.slice(1)} (${p.suggested_skill})`, p.suggested_skill, c.dc, { adv: c.mode === "advantage", dis: c.mode === "disadvantage", tag: SOCIAL.includes(p.intent) ? (p.intent === "steal" ? "theft" : "social") : p.intent === "riddle" || p.intent === "search" ? "lore" : undefined });
  const fx = outcomeEffects(p.intent, roll.success, roll.crit, roll.fumble, ctx);
  fx.push({ k: "time", hours: D.rules.hours.freeform });
  return { cls: c.cls, proposal: p, roll, dc: c.dc, success: roll.success, reason: "", mods: c.mods, effects: fx, mode: c.mode };
}

// ---------- Bribery, haggling ----------
export function resolveBribe(S: GameState, npc: Npc, amount: number) {
  const threshold = Math.round((15 + npc.greed * 0.5) * (1 + S.player.level * 0.35));
  if (amount > S.player.gold) return { ok: false, insulted: false, msg: "You don't have that much gold.", roll: null as RollInfo | null, threshold, dc: 0 };
  if (amount < threshold * 0.5) return { ok: false, insulted: true, msg: "Not nearly enough. They are insulted.", roll: null, threshold, dc: 0 };
  const ratio = amount / threshold;
  const dc = Math.round(clamp(18 - npc.corruption / 10 - (ratio - 0.5) * 4 + npc.loyalty / 12 - npc.fear / 40, 5, 22));
  const roll = playerCheck(S, "Bribe (CHA)", "CHA", dc, { tag: "social" });
  return { ok: roll.success, insulted: false, msg: roll.success ? "The coins vanish. The problem goes away." : "They push the coins back and eye you coldly.", roll, threshold, dc };
}
export function haggle(S: GameState, npc: Npc | null, argument: string) {
  const clean = sanitizeInput(argument, 140);
  const greed = npc?.greed ?? 60;
  const dc = 11 + Math.round(greed / 12);
  const clever = clean.length >= 20;
  const roll = playerCheck(S, "Bargain (CHA)", "CHA", dc, { tag: "social", bonus: clever ? 1 : 0 });
  let discount = 0, surcharge = 0, refuse = false;
  if (roll.success) discount = clamp(0.06 + (roll.total - dc) * 0.012 + (roll.crit ? 0.05 : 0), 0.06, 0.25);
  else if (roll.fumble) refuse = true; else surcharge = 0.05;
  return { roll, dc, discount, surcharge, refuse, text: clean };
}
export function shopTheftDc(S: GameState, tier: number, npc: Npc | null) { return 12 + Math.round((npc?.loyalty ?? 50) / 15) + tier * 2; }
