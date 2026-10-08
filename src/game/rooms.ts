/* eslint-disable @typescript-eslint/no-explicit-any */
// Room/event resolution: social encounters, obstacles, camps, treasure, lore. Applies validated effects to world state.
import { D } from "./data";
import { getS, ui, notify, pushLog, toast, stage, type EventOpt } from "./state";
import { seeded, stream } from "./rng";
import { node as dNode, revealSecrets, regionDungeons, maybeGenerateProcedural } from "./dungeon";
import { npcFor, adjust, remember, killNpc } from "./npc";
import { chestLoot } from "./encounter";
import { addItem } from "./economy";
import { resolveFreeform, resolveBribe, interpretLocal, type FreeCtx, type Effect } from "./skills";
import { interpretAction } from "./ai";
import { deriveStats, clamp, makeRoll, rollDice } from "./engine";
import { record, legend, addFact, timeline, checkTitles, today } from "./campaign";
import { bump } from "./reputation";
import { reactToAction, campScene } from "./party";
import { addWanted, lawResponse, payFine, jail, fineAmount } from "./crime";
import { addWound } from "./death";
import { progress as questProgress } from "./quest";
import { preventByClear } from "./events";
import { onDungeonCleared, noteSignature, signature } from "./director";
import { sfx } from "./audio";
import { sanitizeInput } from "./security";
import { checkInvariants } from "./engine";
import {
  startFight, rollModal, passTime, giveXp, rewardAchievements, narrateAsync, codex, autosave, goTown, updateMapHint, sceneName, handleNews,
} from "./controller";
import { openShop } from "./town";
import type { DNode, Dungeon, GameState } from "./types";
import { narrate } from "./ai";

interface Room { d: Dungeon; n: DNode }
let room: Room | null = null;
let handlers: Record<string, () => Promise<void> | void> = {};
let evCtx: FreeCtx & { level: number; lootMult: number; npcId?: string } | null = null;
let pendingCombat = false;
let onEventDone: (() => void) | null = null;
let hpChange = 0;

export const afterRoom = () => completeNode();

// ---------- event modal plumbing ----------
interface OptDef extends EventOpt { run: () => Promise<void> | void }
function openEvent(o: { title: string; desc: string; icon: string; options: OptDef[]; freeform?: boolean; npc?: string; onDone?: () => void }) {
  handlers = {};
  for (const op of o.options) handlers[op.id] = op.run;
  onEventDone = o.onDone ?? null;
  ui.event = { title: o.title, desc: o.desc, icon: o.icon, options: o.options.map(({ run, ...rest }) => { void run; return rest; }), stage: "choose", result: [], narrative: "", freeform: !!o.freeform, thinking: false, npc: o.npc };
  ui.modal = "event";
  notify();
}
export async function eventOption(id: string) {
  if (ui.busy && ui.event?.stage !== "choose") return;
  if (!ui.event || ui.event.stage !== "choose") return;
  const h = handlers[id];
  if (!h) return;
  sfx("click");
  ui.busy = true; notify();
  try { await h(); } catch (e) { toast("Something went wrong."); console.error(e); }
  ui.busy = false; notify();
}
export async function eventContinue() {
  if (!ui.event || ui.event.stage !== "result") return;
  sfx("click");
  const cb = onEventDone;
  ui.event = null; ui.modal = null; onEventDone = null; handlers = {};
  notify();
  if (pendingCombat) {
    pendingCombat = false;
    ui.busy = true;
    const inTown = getS().loc.kind === "town";
    const res = await startFight(room?.d ?? regionDungeons(getS(), getS().loc.region)[0], room?.n ?? null, inTown ? "guards" : "combat", inTown ? "Town Guard" : "Ambush");
    ui.busy = false;
    if (res === "victory") { if (evCtx?.npcId) { const n = getS().npcs[evCtx.npcId]; if (n && !n.alive) { /* already dead */ } else if (n && room) { killNpc(getS(), n.id); addFact(getS(), { type: "death", subject: n.id, object: n.id, text: `${n.name} was killed by the player.`, priority: "MAJOR" }); legend(getS(), `Killed ${n.name}.`); } } cb?.(); completeNode(); }
    return;
  }
  cb?.();
  if (room && !ui.modal && ui.screen === "dungeon") completeNode();
}
function showResult(lines: string[], success?: boolean) {
  if (!ui.event) return;
  ui.event.stage = "result"; ui.event.result = lines; ui.event.success = success; ui.event.options = []; ui.event.freeform = false;
  notify();
}
async function narrateResult(kind: string, engine: string, vars: Record<string, string>, fb: string, intent?: string) {
  if (!ui.event) return;
  ui.event.thinking = true; notify();
  const S = getS();
  const t = await narrate(S, kind, { engine, scene: { kind, location: sceneName(), npcId: evCtx?.npcId, participants: evCtx?.npcId ? [S.npcs[evCtx.npcId]?.name] : [] }, vars, fallbackKind: fb, intent });
  if (ui.event) { ui.event.narrative = t; ui.event.thinking = false; }
  pushLog(t, "gm", true);
  notify();
}

// ---------- effects ----------
async function applyFx(fx: Effect[], ctx: { level: number; lootMult: number; npcId?: string }): Promise<string[]> {
  const S = getS();
  const out: string[] = [];
  const r = stream("loot");
  const npc = ctx.npcId ? S.npcs[ctx.npcId] : undefined;
  for (const e of fx) {
    switch (e.k) {
      case "xp": giveXp(e.n * Math.max(1, Math.round(ctx.level / 2))); out.push(`+${e.n * Math.max(1, Math.round(ctx.level / 2))} XP`); break;
      case "counter": (S.stats as any)[e.key]++; break;
      case "npc": {
        const n = e.id ? S.npcs[e.id] : npc;
        if (n) { adjust(n, e.rel ?? {}); if (e.mem) remember(n, e.mem); out.push(`${n.name}: ${Object.entries(e.rel ?? {}).map(([k, v]) => `${k} ${(v as number) > 0 ? "+" : ""}${v}`).join(", ") || "remembers this"}`); }
        break;
      }
      case "loot": {
        const m = (e.mult ?? 1) * ctx.lootMult;
        const loot = chestLoot(S, ctx.level, r);
        const gold = Math.round(loot.gold * m);
        S.player.gold += gold;
        if (gold) out.push(`+${gold} gold`);
        for (const it of loot.items) if (r.chance(Math.min(1, m))) { addItem(S, it.id, it.qty); out.push(`+${D.items[it.id].name}${it.qty > 1 ? " ×" + it.qty : ""}`); }
        if (gold) sfx("coin");
        break;
      }
      case "rep": bump(S, { axis: e.axis, n: e.n, region: S.loc.region, regionN: e.axis === "criminal" ? -Math.abs(e.n) : e.n }); break;
      case "tag": for (const m of reactToAction(S, e.tag)) out.push(m); break;
      case "reveal": if (room && stream("social").chance(e.chance ?? 1) && revealSecrets(room.d)) { out.push("You notice a hidden passage!"); stage.refresh(); } break;
      case "alert": if (room) { room.n.data.alert = true; out.push("The area is now alert."); } break;
      case "trapdmg": {
        const dmg = Math.max(1, Math.round(rollDice(stream("combat"), `1d6+${ctx.level}`).total * (e.mult ?? 1)));
        const mx = deriveStats(S.player).maxHp;
        const was = S.player.hp;
        S.player.hp = Math.max(1, S.player.hp - dmg);
        hpChange = was - S.player.hp;
        out.push(`−${was - S.player.hp} HP`); sfx("hurt"); stage.shake(3);
        if (was - S.player.hp >= mx * 0.4) { const w = addWound(S); if (w) out.push("Wound: " + w); }
        break;
      }
      case "heal": { const mx = deriveStats(S.player).maxHp; const h = Math.min(mx - S.player.hp, Math.round(mx * e.frac)); S.player.hp += h; out.push(`+${h} HP`); sfx("heal"); break; }
      case "wound": { const w = addWound(S); if (w) out.push("Cursed — " + w); break; }
      case "clue": { S.clues.push(e.text); if (S.clues.length > 30) S.clues.shift(); out.push("Clue: " + e.text); break; }
      case "knowledge": if (room) { const k = room.d.knowledge.find((x) => !x.found); if (k) { k.found = true; out.push("Knowledge: " + k.text); S.clues.push(k.text); } } break;
      case "quest": for (const m of questProgress(S, e.type, { dungeon: room?.d.id, room: e.room })) out.push(m); break;
      case "time": if (e.hours) passTime(e.hours); break;
      case "combat": pendingCombat = true; out.push("A fight breaks out!"); break;
      case "caught": {
        if (S.loc.kind !== "town") { pendingCombat = true; out.push("You're caught! The inhabitants attack!"); break; }
        addWanted(S, S.loc.region, e.severe ? 2 : 1, "was caught stealing");
        const resp = lawResponse(S, S.loc.region);
        if (resp === "fine") { const f = fineAmount(S, S.loc.region); const p = payFine(S, S.loc.region); out.push(`The guards fine you ${f}g (paid ${p.paid}g).`); }
        else if (resp === "combat") { pendingCombat = true; out.push("Guards rush you! Combat!"); }
        else { const j = jail(S, S.loc.region); passTime(j.days * 24); out.push(`Jailed for ${j.days} days; ${j.lost}g confiscated.`); }
        break;
      }
    }
  }
  checkInvariants(S);
  return out;
}

// ---------- node completion ----------
export function completeNode() {
  const S = getS();
  if (!room) return;
  const { d, n } = room;
  n.done = true;
  S.stats.rooms++;
  noteSignature(S, signature({ room: n.type, biome: d.biome }));
  passTime(1);
  // passive perception for secrets
  const dm = deriveStats(S.player);
  const pr = makeRoll(stream("social"), "Passive", dm.mods.INT + dm.prof, 15, "normal", "DC", { auto: false });
  if (pr.success && d.nodes.some((x) => x.hidden) && revealSecrets(d)) pushLog("✦ Your keen eyes spot a hidden passage!", "good");
  const t = checkTitles(S); for (const x of t) { toast(`Title: ${x}`, "good"); pushLog(`★ You are now known as "${x}".`, "news"); }
  rewardAchievements();
  if (n.type === "boss") { clearDungeon(d); return; }
  ui.screen = "dungeon"; ui.modal = null; ui.event = null; ui.victory = null;
  stage.refresh(); updateMapHint(); autosave(); notify();
}
function clearDungeon(d: Dungeon) {
  const S = getS();
  d.cleared = true; d.clearedDay = today(S);
  S.stats.cleared++; S.stats.bossKills++;
  const lines: string[] = [`${d.name} falls silent.`];
  lines.push(...questProgress(S, "clear", { dungeon: d.id }));
  lines.push(...preventByClear(S, d.faction));
  lines.push(...onDungeonCleared(S, d.id, d.faction));
  bump(S, { axis: "heroic", n: 8, region: d.region, regionN: 12, faction: "wardens", factionN: ["bandits", "goblins", "cult"].includes(d.faction) ? 8 : 2 });
  bump(S, { faction: d.faction, factionN: -15 });
  const f = S.factions[d.faction]; if (f) { f.military = clamp(f.military - 12, 5, 100); f.known = true; }
  if (S.world[d.region]) { S.world[d.region].danger = clamp(S.world[d.region].danger - 10, 0, 100); S.world[d.region].prosperity = clamp(S.world[d.region].prosperity + 5, 0, 100); S.world[d.region].changes.push(`${d.name} was cleared by the player.`); }
  record(S, "cleared_dungeon", { location: d.id, targets: [d.boss], tags: ["dungeon", "boss_" + d.boss, "cleared"], direct: [`${d.name} cleared`], future: ["Another faction may move in", "Rumors spread"], fact: { text: `The player cleared ${d.name} (${d.faction}).`, priority: "MAJOR" } });
  legend(S, `Cleared ${d.name}.`);
  timeline(S, `${d.name} was cleared.`, "legend");
  stream("social");
  const nd = maybeGenerateProcedural(S, d.region);
  if (nd) lines.push(`Scouts speak of a new danger nearby: ${nd.name}.`);
  rewardAchievements();
  checkTitles(S);
  sfx("levelup");
  stage.refresh();
  ui.event = null;
  openEvent({ title: "Dungeon Cleared!", desc: lines.join(" "), icon: "👑", options: [], onDone: () => { room = null; goTown(); } });
  showResult(lines, true);
  autosave();
}

// ---------- room dispatcher ----------
const pick = (arr: any[], seed: number): any => seeded(seed).pick(arr);
export async function resolveNode(d: Dungeon, n: DNode) {
  const S = getS();
  room = { d, n };
  evCtx = null; pendingCombat = false;
  const lvl = d.level;
  pushLog(`➤ ${D.roomTypes[n.type].label}`, "sys");
  if (n.type !== "entrance") narrateAsync("room", `Entering a ${D.roomTypes[n.type].label} in ${d.name}`, {}, "room." + (n.type === "event" ? "event" : n.type));
  if (S.flags.hallucination > 0) pushLog("The walls breathe. A choir of color hums from the floor.", "gm", true);
  switch (n.type) {
    case "entrance": completeNode(); return;
    case "combat": case "elite": case "boss": {
      const res = await startFight(d, n, n.type as any);
      if (res === "victory") completeNode();
      return;
    }
    case "event": {
      const r = seeded(n.seed);
      const cat = n.data.cat ?? r.weighted(["social", "obstacle", "choice"], (c) => (c === "social" ? 4 : c === "obstacle" ? 3 : 2));
      n.data.cat = cat;
      const t = n.data.tpl ?? pick(D.encounters[cat], n.seed).id;
      n.data.tpl = t;
      return openTemplate(d, n, cat, D.encounters[cat].find((x: any) => x.id === t), lvl);
    }
    case "social": { n.data.tpl = n.data.tpl ?? pick(D.encounters.social, n.seed).id; return openTemplate(d, n, "social", D.encounters.social.find((x: any) => x.id === n.data.tpl), lvl); }
    case "treasure": return openObstacle(d, n, { id: "chest", title: "Treasure Cache", desc: "A heavy chest sits in an alcove, bound in iron.", skill: "lock" }, lvl, 1.6);
    case "trap": return openObstacle(d, n, pick(D.encounters.trap, n.seed), lvl, 0.15, "trap");
    case "puzzle": return openObstacle(d, n, pick(D.encounters.puzzle, n.seed), lvl, 1.1, "riddle");
    case "lore": return openLore(d, n, lvl);
    case "prisoner": return openPrisoner(d, n, lvl);
    case "secret": return openSecret(d, n, lvl);
    case "merchant": openShop("wander", d.region); ui.busy = false; return waitModalClose(() => completeNode());
    case "smith": openShop("smith", d.region); return waitModalClose(() => completeNode());
    case "rest": return openCamp(d, n);
  }
  completeNode();
}
function waitModalClose(cb: () => void) { onShopClose = cb; }
let onShopClose: (() => void) | null = null;
export function shopClosed() { const cb = onShopClose; onShopClose = null; if (cb && room && getS().loc.kind === "dungeon") cb(); }

// ---------- templates ----------
const PRESET: Record<string, { intent: string; risk: string; skill: string; label: string }> = {
  persuade: { intent: "persuade", risk: "medium", skill: "CHA", label: "Persuade" },
  intimidate: { intent: "intimidate", risk: "medium", skill: "CHA", label: "Intimidate" },
  deceive: { intent: "deceive", risk: "high", skill: "CHA", label: "Lie convincingly" },
  steal: { intent: "steal", risk: "high", skill: "AGI", label: "Pickpocket" },
};
async function runPreset(label: string, intent: string, skill: string, risk: string, successText: string, failText: string, extraFx: Effect[] = []) {
  if (!evCtx) return;
  const S = getS();
  const ctx = evCtx;
  const raw = { intent, suggested_skill: skill, risk_level: risk, approach: label, narrative_context: label, modifiers: [] };
  const res = resolveFreeform(S, label, raw, ctx);
  if (res.cls === "IMPOSSIBLE" || !res.roll) { showResult([res.reason], false); return; }
  await rollModal(res.roll);
  const lines = [`${res.roll.label}: d20 [${res.roll.d20.join(",")}] ${res.roll.mod >= 0 ? "+" : ""}${res.roll.mod} = ${res.roll.total} vs DC ${res.dc} → ${res.success ? (res.roll.crit ? "CRITICAL SUCCESS" : "SUCCESS") : res.roll.fumble ? "FUMBLE" : "FAILURE"}`];
  const eff = [...res.effects, ...(res.success ? extraFx : [])];
  const fxLines = await applyFx(eff, ctx);
  lines.push(...fxLines);
  record(S, `${intent}${res.success ? "_success" : "_failure"}`, { targets: ctx.npcId ? [ctx.npcId] : [], tags: [intent, res.success ? "success" : "failure"], direct: fxLines.slice(0, 3) });
  pushLog(`${label}: ${res.success ? "success" : "failure"} (${res.roll.total} vs ${res.dc})`, "roll");
  showResult(lines, res.success);
  await narrateResult("skill_check", `${label}: rolled ${res.roll.total} vs DC ${res.dc}: ${res.success ? "SUCCESS" : "FAILURE"}. ${fxLines.join("; ")}`, { actor: ctx.npcId ? S.npcs[ctx.npcId]?.name ?? "someone" : "the scene" }, res.roll.crit ? "crit_success" : res.roll.fumble ? "crit_failure" : res.success ? "success" : "failure", label);
  void successText; void failText;
}
async function openTemplate(d: Dungeon, n: DNode, cat: string, t: any, lvl: number) {
  if (cat === "obstacle") return openObstacle(d, n, t, lvl, 1);
  if (cat === "choice") return openChoice(d, n, t, lvl);
  return openSocial(d, n, t, lvl);
}
function freeformCtx(extra: any = {}): FreeCtx & { level: number; lootMult: number; npcId?: string } {
  return { inCombat: false, allowed: ["clever"], level: room?.d.level ?? 1, lootMult: 1, ...extra };
}
async function openSocial(d: Dungeon, n: DNode, t: any, lvl: number) {
  const S = getS();
  const npc = npcFor(S, t.npc, d.region);
  npc.known = true; codex("npc_" + npc.id, npc.name);
  n.data.npc = npc.id;
  evCtx = freeformCtx({ npc, level: lvl, npcId: npc.id, dcBonus: Math.floor(lvl / 3) });
  const mem = npc.memories.length ? ` ${npc.name} remembers: "${npc.memories[npc.memories.length - 1]}".` : "";
  const sp = deriveStats(S.player);
  const intSkill = sp.mods.STR > sp.mods.CHA ? "STR" : "CHA";
  const thr = Math.round((15 + npc.greed * 0.5) * (1 + S.player.level * 0.35));
  const opts: OptDef[] = [
    { id: "persuade", label: "💬 Persuade", sub: "CHA check", run: () => runPreset("Persuade", "persuade", "CHA", "medium", "", "") },
    { id: "intimidate", label: "😠 Intimidate", sub: `${intSkill} check`, run: () => runPreset("Intimidate", "intimidate", intSkill, "medium", "", "") },
    { id: "deceive", label: "🎭 Lie", sub: "CHA check, risky", run: () => runPreset("Deceive", "deceive", "CHA", "high", "", "") },
    ...[0.7, 1.4].map((m, i) => ({
      id: "bribe" + i, label: `🪙 Bribe ${Math.round(thr * m)}g`, sub: `greed ${npc.greed > 70 ? "high" : npc.greed > 40 ? "moderate" : "low"}`, disabled: S.player.gold < Math.round(thr * m),
      run: async () => {
        const amt = Math.round(thr * m);
        const b = resolveBribe(S, npc, amt);
        if (b.roll) await rollModal(b.roll);
        const lines = [b.msg];
        if (b.ok) {
          S.player.gold -= amt;
          lines.push(`−${amt} gold`, ...(await applyFx([{ k: "loot", mult: 0.7 }, { k: "npc", id: npc.id, rel: { trust: 6, debt: -6 }, mem: "was bribed by the player" }, { k: "tag", tag: "bribery" }, { k: "rep", axis: "criminal", n: 1 }], evCtx!)));
          record(S, "bribed_npc", { targets: [npc.id], tags: ["bribery", "success"], direct: [`Paid ${amt}`] });
        } else await applyFx([{ k: "npc", id: npc.id, rel: b.insulted ? { hostility: 10, respect: -6 } : { trust: -2 }, mem: b.insulted ? "was insulted by a lowball bribe" : "refused the player's bribe" }], evCtx!);
        showResult(lines, b.ok);
        await narrateResult("bribe", `Bribe of ${amt} gold ${b.ok ? "accepted" : "refused"}`, { actor: npc.name }, b.ok ? "success" : "failure");
      },
    })),
    { id: "steal", label: "🤏 Pickpocket", sub: "AGI check, wanted risk", run: () => runPreset("Pickpocket", "steal", "AGI", "high", "", "") },
    ...(S.player.noncombat.includes("charm_person") && S.player.res >= 3 ? [{ id: "charm", label: "✨ Charm Person (3)", sub: "Advantage on next social check", run: () => { S.player.res -= 3; S.flags.charm = true; pushLog("Charm Person: your next social check has advantage.", "spell"); showResult(["Honeyed magic wraps your words. Your next social check has advantage."], true); } }] : []),
    { id: "attack", label: "⚔ Attack", sub: "Starts combat", run: async () => { await applyFx([{ k: "combat" }, { k: "tag", tag: "violence" }, { k: "rep", axis: "heroic", n: -3 }], evCtx!); showResult([`You draw steel on ${npc.name}!`], false); } },
    { id: "leave", label: "🚪 Leave", run: () => showResult(["You move on."], true) },
  ];
  openEvent({ title: t.title, desc: `${t.desc} ${npc.name}, a ${npc.race} ${npc.occupation.toLowerCase()}, seems ${npc.traits[0]}.${mem} Stakes: ${t.stake}.`, icon: "💬", options: opts, freeform: true, npc: npc.id });
}
const OBST: Record<string, { id: string; label: string; intent: string; skill: string; risk: string; sub: string }[]> = {
  lock: [{ id: "pick", label: "🔓 Pick the lock", intent: "lockpick", skill: "AGI", risk: "medium", sub: "AGI" }, { id: "force", label: "🔨 Break it open", intent: "force", skill: "STR", risk: "high", sub: "STR" }, { id: "search", label: "🔍 Search for a key", intent: "search", skill: "INT", risk: "low", sub: "INT" }],
  force: [{ id: "force", label: "💪 Heave the rubble", intent: "force", skill: "STR", risk: "medium", sub: "STR" }, { id: "search", label: "🔍 Find another way", intent: "search", skill: "INT", risk: "low", sub: "INT" }, { id: "arcane", label: "✨ Use magic", intent: "arcane", skill: "INT", risk: "high", sub: "INT" }],
  arcane: [{ id: "arcane", label: "✨ Study the runes", intent: "arcane", skill: "INT", risk: "medium", sub: "INT" }, { id: "force", label: "🔨 Smash the seal", intent: "force", skill: "STR", risk: "extreme", sub: "STR (very hard)" }, { id: "search", label: "🔍 Seek a mundane way", intent: "search", skill: "INT", risk: "medium", sub: "INT" }],
  agility: [{ id: "climb", label: "🧗 Cross carefully", intent: "climb", skill: "AGI", risk: "medium", sub: "AGI" }, { id: "force", label: "🪢 Cut and swing", intent: "force", skill: "STR", risk: "high", sub: "STR" }, { id: "search", label: "🔍 Look for a ford", intent: "search", skill: "INT", risk: "low", sub: "INT" }],
  trap: [{ id: "search", label: "🔍 Study the floor", intent: "search", skill: "INT", risk: "low", sub: "INT" }, { id: "pick", label: "🛠 Disarm it", intent: "lockpick", skill: "AGI", risk: "medium", sub: "AGI" }, { id: "climb", label: "💨 Dash through", intent: "climb", skill: "AGI", risk: "high", sub: "AGI, risky" }],
  riddle: [{ id: "riddle", label: "🧠 Solve it", intent: "riddle", skill: "INT", risk: "medium", sub: "INT" }, { id: "search", label: "🔍 Examine inscriptions", intent: "search", skill: "INT", risk: "low", sub: "INT" }, { id: "guess", label: "🎲 Wild guess", intent: "other", skill: "CHA", risk: "high", sub: "CHA, risky" }],
};
async function openObstacle(d: Dungeon, n: DNode, t: any, lvl: number, lootMult: number, forced?: string) {
  const S = getS();
  const skill = forced ?? t.skill;
  evCtx = freeformCtx({ obstacle: true, level: lvl, lootMult, dcBonus: Math.floor(lvl / 3) });
  const opts: OptDef[] = (OBST[skill] ?? OBST.lock).map((o) => ({
    id: o.id, label: o.label, sub: o.sub, run: () => runPreset(o.label.replace(/^\S+\s/, ""), o.intent, o.skill, o.risk, "", "", o.intent === "search" ? [{ k: "knowledge" }] : []),
  }));
  const known = S.player.noncombat;
  if (known.includes("knock") && S.player.res >= 4 && ["lock", "arcane"].includes(skill)) opts.unshift({ id: "knock", label: "🗝 Cast Knock (4)", sub: "No check", run: async () => { S.player.res -= 4; const fx = await applyFx([{ k: "loot", mult: lootMult }, { k: "xp", n: 4 }], evCtx!); showResult(["Knock: the way opens with a click.", ...fx], true); } });
  if (known.includes("detect_magic") && S.player.res >= 2) opts.push({ id: "detect", label: "🔮 Detect Magic (2)", sub: "Reveal secrets", run: async () => { S.player.res -= 2; const fx = await applyFx([{ k: "reveal", chance: 1 }, { k: "knowledge" }], evCtx!); showResult(["Detect Magic: hidden threads of power glow.", ...fx], true); } });
  opts.push({ id: "leave", label: "🚪 Leave it", run: () => showResult(["You leave it be."], true) });
  openEvent({ title: t.title, desc: `${t.desc}${t.stake ? " Stakes: " + t.stake + "." : ""}`, icon: "🧩", options: opts, freeform: true });
}
async function openChoice(d: Dungeon, n: DNode, t: any, lvl: number) {
  const S = getS();
  evCtx = freeformCtx({ obstacle: true, level: lvl, dcBonus: Math.floor(lvl / 3) });
  const opts: OptDef[] = [];
  if (t.id === "shrine_choice") {
    opts.push({ id: "pray", label: "🙏 Offer a prayer (20g)", sub: "CHA — boon", disabled: S.player.gold < 20, run: async () => { S.player.gold -= 20; await runPreset("Offer a prayer", "persuade2", "CHA", "low", "", "", [{ k: "heal", frac: 0.4 }, { k: "clue", text: "The shrine's blessing speaks of a hidden vault below." }]); } });
    opts.push({ id: "rob", label: "🤏 Take the offerings", sub: "AGI — curse risk", run: () => runPreset("Take the offerings", "force2", "AGI", "high", "", "", [{ k: "loot", mult: 1.5 }]) });
    opts.push({ id: "leave", label: "🚪 Leave", run: () => showResult(["You leave the shrine in peace."], true) });
  } else {
    opts.push({ id: "search", label: "🔍 Search the camp", sub: "INT", run: () => runPreset("Search the camp", "search", "INT", "low", "", "", [{ k: "clue", text: "A diary mentions a weakness the dungeon's master hides." }, { k: "knowledge" }]) });
    opts.push({ id: "rest", label: "🔥 Rest a while", sub: "Heal 25%", run: async () => { const fx = await applyFx([{ k: "heal", frac: 0.25 }, { k: "time", hours: 3 }], evCtx!); showResult(["You rest by the cold ashes.", ...fx], true); } });
    opts.push({ id: "leave", label: "🚪 Leave", run: () => showResult(["You move on."], true) });
  }
  openEvent({ title: t.title, desc: `${t.desc} Stakes: ${t.stake}.`, icon: "⛩", options: opts, freeform: true });
}
async function openLore(d: Dungeon, n: DNode, lvl: number) {
  const S = getS();
  const t = pick(D.encounters.lore, n.seed);
  evCtx = freeformCtx({ obstacle: true, level: lvl });
  for (const m of questProgress(S, "visit", { dungeon: d.id, room: "lore" })) pushLog(m, "good");
  codex("lore_" + t.id + d.id, t.title);
  openEvent({
    title: t.title, desc: t.desc, icon: "📜", freeform: true,
    options: [
      { id: "study", label: "🧠 Study carefully", sub: "INT — learn secrets", run: () => runPreset("Study the lore", "riddle", "INT", "low", "", "", [{ k: "knowledge" }, { k: "clue", text: `Lore of ${d.name}: the ${D.factionMap[d.faction]?.name} are not alone here.` }]) },
      { id: "copy", label: "✍ Copy what you can", sub: "No check — a small clue", run: async () => { const fx = await applyFx([{ k: "clue", text: `You sketch the markings found in ${d.name}.` }, { k: "xp", n: 2 }], evCtx!); showResult(["You copy the inscriptions hurriedly.", ...fx], true); } },
      { id: "leave", label: "🚪 Leave", run: () => showResult(["You leave the chamber."], true) },
    ],
  });
}
async function openPrisoner(d: Dungeon, n: DNode, lvl: number) {
  const S = getS();
  const npc = npcFor(S, "villager", d.region);
  npc.known = true; codex("npc_" + npc.id, npc.name);
  evCtx = freeformCtx({ obstacle: true, level: lvl, npcId: npc.id, dcBonus: Math.floor(lvl / 3) });
  const free = async (label: string, intent: string, skill: string, risk: string) => {
    await runPreset(label, intent, skill, risk, "", "", [
      { k: "npc", id: npc.id, rel: { trust: 25, affection: 10, debt: 30 }, mem: "was rescued by the player" }, { k: "rep", axis: "heroic", n: 5 }, { k: "tag", tag: "mercy" }, { k: "quest", type: "visit", room: "prisoner" }, { k: "clue", text: `${npc.name} tells you where the ${D.factionMap[d.faction]?.name} keep their loot.` }, { k: "knowledge" },
    ]);
  };
  openEvent({
    title: "Caged Prisoner", desc: `${npc.name}, a ${npc.race} ${npc.occupation.toLowerCase()}, rattles the cage: "Please. They'll be back."`, icon: "⛓", freeform: true, npc: npc.id,
    options: [
      { id: "pick", label: "🔓 Pick the lock", sub: "AGI", run: () => free("Pick the cage lock", "lockpick", "AGI", "medium") },
      { id: "force", label: "🔨 Break the bars", sub: "STR", run: () => free("Break the bars", "force", "STR", "medium") },
      { id: "search", label: "🔍 Find the key", sub: "INT", run: () => free("Search for the key", "search", "INT", "low") },
      { id: "leave", label: "🚪 Leave them", run: async () => { await applyFx([{ k: "npc", id: npc.id, rel: { trust: -20, hostility: 15 }, mem: "was abandoned in a cage by the player" }, { k: "tag", tag: "cruelty" }], evCtx!); S.decisions.push(`Abandoned ${npc.name} in ${d.name}.`); showResult([`You walk away. ${npc.name} watches you go.`], false); } },
    ],
  });
}
async function openSecret(d: Dungeon, n: DNode, lvl: number) {
  const S = getS();
  evCtx = freeformCtx({ level: lvl, lootMult: 1.8 });
  const fx = await applyFx([{ k: "loot", mult: 1.8 }, { k: "knowledge" }, { k: "clue", text: `A hidden vault in ${d.name} hid forgotten history.` }, { k: "xp", n: 8 }], evCtx);
  codex("sec_" + d.id, `Secret of ${d.name}`);
  record(S, "found_secret", { location: d.id, tags: ["secret", "discovery"], direct: fx.slice(0, 2) });
  openEvent({ title: "Secret Vault", desc: "Behind the false wall: a vault untouched by time.", icon: "✦", options: [] });
  showResult(["You found a secret chamber!", ...fx], true);
}
function openCamp(d: Dungeon, n: DNode) {
  const S = getS();
  const dm = () => deriveStats(S.player);
  const doRest = async () => {
    const m = dm();
    S.player.hp = m.maxHp; S.player.res = m.maxRes;
    for (const p of S.party) p.hp = 9999;
    S.player.wounds = S.player.wounds.filter((w) => w === "scarred");
    passTime(8);
    const lines = ["You rest by the fire. HP and resources restored. Some wounds mend."];
    lines.push(...campScene(S));
    if (S.world[d.region].danger > 50 && stream("encounter").chance(0.2)) { lines.push("Your rest is interrupted by an ambush!"); pendingCombat = true; }
    showResult(lines, true); sfx("heal");
  };
  openEvent({
    title: "Campfire", desc: "A sheltered nook. A rare moment of calm.", icon: "🔥",
    options: [
      { id: "rest", label: "🛏 Rest (8h)", sub: "Restore HP & resources, companions talk", run: doRest },
      { id: "cook", label: "🍲 Cook a meal (2h)", sub: "Heal 30%", run: async () => { const fx = await applyFx([{ k: "heal", frac: 0.3 }, { k: "time", hours: 2 }], freeformCtx()); showResult(["A hearty meal, shared.", ...fx], true); } },
      { id: "train", label: "🥋 Train (4h)", sub: "Small XP", run: async () => { passTime(4); const l = giveXp(Math.round(6 * S.player.level)); showResult(["You drill your technique until your muscles sing.", ...l], true); } },
      { id: "talk", label: "💬 Talk with companions", sub: "Build trust", disabled: !S.party.length, run: () => { const l = campScene(S); showResult(l.length ? l : ["Quiet company."], true); } },
      { id: "investigate", label: "🔍 Investigate the area (INT)", sub: "Find clues", run: async () => { evCtx = freeformCtx({ obstacle: true, level: d.level }); await runPreset("Investigate the surroundings", "search", "INT", "medium", "", "", [{ k: "knowledge" }]); } },
      { id: "leave", label: "🚶 Move on", run: () => showResult(["You douse the embers and continue."], true) },
    ],
  });
}

// ---------- freeform from event modal ----------
export async function freeformSubmit(text: string) {
  const S = getS();
  if (!ui.event || ui.event.stage !== "choose" || !evCtx || ui.busy) return;
  const clean = sanitizeInput(text);
  if (clean.length < 3) { toast("Describe what you do."); return; }
  ui.busy = true; ui.event.thinking = true; notify();
  const raw = await interpretAction(S, clean, { kind: "freeform", location: sceneName(), npcId: evCtx.npcId, participants: [] }).catch(() => null);
  ui.event && (ui.event.thinking = false);
  const ctx = evCtx;
  const prop = raw ?? interpretLocal(clean, ctx);
  const res = resolveFreeform(S, clean, prop, ctx);
  if (res.cls === "IMPOSSIBLE" || !res.roll) {
    pushLog(`✖ ${res.reason}`, "bad");
    narrateAsync("impossible", `The attempt is impossible: ${res.reason}`, { actor: "the player" }, "failure", clean);
    showResult([`IMPOSSIBLE: ${res.reason}`, "No dice were rolled."], false);
    ui.busy = false; notify(); return;
  }
  await rollModal(res.roll);
  const lines = [`Interpreted: ${res.proposal.intent} (${res.proposal.suggested_skill}) — ${res.cls}`, `d20 [${res.roll.d20.join(",")}] ${res.roll.mod >= 0 ? "+" : ""}${res.roll.mod} = ${res.roll.total} vs DC ${res.dc}${res.mods.length ? " [" + res.mods.join(", ") + "]" : ""} → ${res.success ? "SUCCESS" : "FAILURE"}`];
  const fx = await applyFx(res.effects, ctx);
  lines.push(...fx);
  record(S, `freeform_${res.proposal.intent}`, { targets: ctx.npcId ? [ctx.npcId] : [], tags: ["freeform", res.proposal.intent, res.success ? "success" : "failure"], direct: fx.slice(0, 3) });
  S.decisions.push(`Day ${today(S)}: ${clean.slice(0, 60)} (${res.success ? "worked" : "failed"})`);
  if (S.decisions.length > 20) S.decisions.shift();
  showResult(lines, res.success);
  await narrateResult("freeform", `Player tried: ${res.proposal.intent}. Roll ${res.roll.total} vs DC ${res.dc}: ${res.success ? "SUCCESS" : "FAILURE"}. ${fx.join("; ")}`, { actor: "you" }, res.success ? "success" : "failure", clean);
  ui.busy = false; notify();
}
export { handleNews, hpChange };
