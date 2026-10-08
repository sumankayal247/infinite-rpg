/* eslint-disable @typescript-eslint/no-explicit-any */
// Quest lifecycle state machine: OFFERED → ACCEPTED → IN_PROGRESS → BRANCHING → resolved + consequences.
import { D } from "./data";
import { stream } from "./rng";
import { nextId, record, timeline, today, legend } from "./campaign";
import { npcFor, adjust, remember } from "./npc";
import { bump } from "./reputation";
import { applyRegionDelta, activeEvents, scheduleEvent } from "./events";
import { cooldown, noteSignature, signature, surfaceThread } from "./director";
import { countItem, removeById } from "./economy";
import { regionDungeons } from "./dungeon";
import type { GameState, Quest } from "./types";

const fmt = (s: string, o: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(o[k] ?? k));
function makeQuest(S: GameState, region: string): Quest | null {
  const r = stream("quest");
  const reg = D.regionMap[region];
  const lvl = Math.max(reg.level_min, S.player.level);
  const ds = regionDungeons(S, region).filter((d) => !d.cleared && !d.destroyed);
  const evs = activeEvents(S, region);
  const th = surfaceThread(S);
  type Cand = { tid: string; target: string; w: number; extra?: any };
  const c: Cand[] = [];
  for (const d of ds) {
    let w = 2;
    if (evs.some((e) => e.participants[0] === d.faction)) w += 4; // emergent: world problem -> contract
    if (th?.link_dungeon === d.id) w += 4;
    c.push({ tid: "clear", target: d.id, w });
    c.push({ tid: "scout", target: d.id, w: 1.5 });
    if (["bandits", "goblins", "cult"].includes(d.faction)) c.push({ tid: "rescue", target: d.id, w: 1.5 });
  }
  const fams = [...new Set(ds.flatMap((d) => D.templates[d.template].families as string[]))];
  for (const f of fams) c.push({ tid: "bounty", target: f, w: (S.world[region].crime > 45 ? 3 : 1.2) });
  c.push({ tid: "gather", target: "iron_ore", w: S.world[region].prosperity < 40 ? 3 : 0.8 });
  const live = c.filter((x) => !S.quests.some((q) => ["OFFERED", "ACCEPTED", "IN_PROGRESS", "BRANCHING"].includes(q.state) && q.tid === x.tid && q.obj.target === x.target));
  if (!live.length) return null;
  const pick = r.weighted(live, (x) => x.w * cooldown(S, signature({ q: x.tid, t: x.target })));
  const t = D.quests.find((q: any) => q.id === pick.tid);
  const giver = npcFor(S, r.pick(["villager", "guard", "merchant", "scout"]) as string, region);
  const count = t.count ? r.int(t.count[0], t.count[1]) : 1;
  const dName = S.dungeons[pick.target]?.name ?? "";
  const faction = S.dungeons[pick.target]?.faction ?? giver.faction;
  const tokens = { family: pick.tid === "bounty" ? pick.target : "", count, region: reg.name, dungeon: dName, giver: giver.name, faction: D.factionMap[faction]?.name ?? faction };
  const mult = 1 + 0.3 * (lvl - 1);
  const q: Quest = {
    id: nextId(S, "quest"), tid: t.id, title: fmt(t.title, tokens), desc: fmt(t.desc, tokens), state: "OFFERED", kind: t.kind, giver: giver.id, region, dungeon: S.dungeons[pick.target] ? pick.target : undefined,
    faction, obj: { type: t.kind, target: pick.target, count, progress: 0, room: t.room, item: t.item },
    reward: { gold: Math.round(r.int(t.reward.gold[0], t.reward.gold[1]) * mult), xp: Math.round(t.reward.xp * (1 + 0.4 * (lvl - 1))), rep: t.reward.rep },
    deadline: today(S) + t.deadline, accepted: -1, resolved: -1, outcome: "", thread: th?.id,
  };
  noteSignature(S, signature({ q: t.id, t: pick.target }));
  return q;
}
export function offerQuests(S: GameState, region: string): Quest[] {
  let offered = S.quests.filter((q) => q.state === "OFFERED" && q.region === region);
  for (let i = 0; i < 4 && offered.length < 3; i++) {
    const q = makeQuest(S, region);
    if (!q) break;
    S.quests.push(q); offered.push(q);
  }
  offered = S.quests.filter((q) => q.state === "OFFERED" && q.region === region);
  return offered;
}
export function accept(S: GameState, id: string): string {
  const q = S.quests.find((x) => x.id === id);
  if (!q || q.state !== "OFFERED") return "Unavailable.";
  if (S.quests.filter((x) => ["ACCEPTED", "IN_PROGRESS", "BRANCHING"].includes(x.state)).length >= 5) return "Your journal is full (5 active quests).";
  q.state = "ACCEPTED"; q.accepted = today(S);
  const g = S.npcs[q.giver]; if (g) { remember(g, `The player accepted my request: ${q.title}`); adjust(g, { trust: 3 }); }
  record(S, "accepted_quest", { targets: [q.id], tags: ["quest"], direct: [q.title] });
  timeline(S, `Accepted quest: ${q.title}`, "quest");
  return `Quest accepted: ${q.title}`;
}
export function abandon(S: GameState, id: string): string {
  const q = S.quests.find((x) => x.id === id);
  if (!q || !["ACCEPTED", "IN_PROGRESS", "BRANCHING"].includes(q.state)) return "";
  q.state = "ABANDONED"; q.resolved = today(S);
  const g = S.npcs[q.giver]; if (g) { remember(g, `The player abandoned my request: ${q.title}`); adjust(g, { trust: -8, respect: -5 }); }
  bump(S, { faction: q.faction, factionN: -2 });
  record(S, "abandoned_quest", { targets: [q.id], tags: ["quest", "failure"], direct: ["The giver remembers"] });
  return `You abandon "${q.title}". ${g?.name ?? "The client"} will remember.`;
}
export const isActive = (q: Quest) => ["ACCEPTED", "IN_PROGRESS", "BRANCHING"].includes(q.state);
export function progress(S: GameState, type: string, d: { family?: string; dungeon?: string; room?: string }): string[] {
  const out: string[] = [];
  for (const q of S.quests.filter(isActive)) {
    let hit = false;
    if (q.obj.type === "kill" && type === "kill" && d.family === q.obj.target) hit = true;
    if (q.obj.type === "clear" && type === "clear" && d.dungeon === q.obj.target) hit = true;
    if (q.obj.type === "visit" && type === "visit" && d.dungeon === q.obj.target && d.room === q.obj.room) hit = true;
    if (!hit) continue;
    q.obj.progress = Math.min(q.obj.count, q.obj.progress + 1);
    if (q.state === "ACCEPTED") q.state = "IN_PROGRESS";
    if (q.obj.progress >= q.obj.count && q.outcome !== "ready") {
      q.outcome = "ready";
      if (q.tid === "rescue") q.state = "BRANCHING";
      out.push(`Quest objective complete: ${q.title}. Return to the tavern board.`);
    } else out.push(`Quest progress: ${q.title} (${q.obj.progress}/${q.obj.count})`);
  }
  return out;
}
export function gatherCheck(S: GameState) {
  for (const q of S.quests.filter(isActive)) {
    if (q.obj.type !== "gather") continue;
    q.obj.progress = Math.min(q.obj.count, countItem(S, q.obj.item!));
    q.outcome = q.obj.progress >= q.obj.count ? "ready" : "";
    if (q.state === "ACCEPTED" && q.obj.progress > 0) q.state = "IN_PROGRESS";
  }
}
export function turnIn(S: GameState, id: string, choice: "honor" | "ransom" = "honor"): { msgs: string[]; xp: number } {
  const q = S.quests.find((x) => x.id === id);
  const msgs: string[] = [];
  if (!q || q.outcome !== "ready") return { msgs: ["Not ready."], xp: 0 };
  if (q.obj.type === "gather") removeById(S, q.obj.item!, q.obj.count);
  let gold = q.reward.gold;
  if (q.tid === "rescue" && choice === "ransom") { gold = Math.round(gold * 1.7); bump(S, { axis: "heroic", n: -6, faction: "wardens", factionN: -4 }); msgs.push("You took the ransom and left the prisoner to their fate."); }
  else { bump(S, { axis: "heroic", n: 4 + Math.round(q.reward.rep / 3), region: q.region, regionN: q.reward.rep, faction: q.faction === "bandits" || q.faction === "goblins" ? "wardens" : q.faction, factionN: q.reward.rep }); }
  S.player.gold += gold;
  q.state = "SUCCEEDED"; q.resolved = today(S);
  msgs.push(`Quest complete: ${q.title}. +${gold}g, +${q.reward.xp} XP.`);
  const g = S.npcs[q.giver];
  if (g) { adjust(g, { trust: 10, respect: 8, affection: 4 }); remember(g, `The player completed my quest: ${q.title}`); }
  applyRegionDelta(S, q.region, { prosperity: 4, stability: 3, danger: -4 });
  record(S, "completed_quest", { targets: [q.id], tags: ["quest", "success"], direct: msgs, future: ["Follow-up threads may appear"], fact: { text: `Completed quest "${q.title}"`, priority: "MAJOR" } });
  legend(S, `Completed: ${q.title}.`);
  // follow-up threads
  const r = stream("quest");
  if (r.chance(0.4)) {
    const f = makeQuest(S, q.region);
    if (f) { f.desc = `Because of your deed, ${g?.name ?? "someone"} asks again: ` + f.desc; S.quests.push(f); msgs.push("A follow-up request appears on the board."); }
  }
  if (r.chance(0.2)) scheduleEvent(S, "trade_boom", q.region, r.int(3, 8));
  const resolved = S.quests.filter((x) => !isActive(x) && x.state !== "OFFERED");
  if (resolved.length > 30) { const drop = resolved.slice(0, resolved.length - 30).map((x) => x.id); S.quests = S.quests.filter((x) => !drop.includes(x.id)); }
  return { msgs, xp: q.reward.xp };
}
/** Expiry: failure has consequences; fail-forward rather than 'nothing happens'. */
export function expireQuests(S: GameState): string[] {
  const out: string[] = [];
  const now = today(S);
  for (const q of S.quests) {
    if (q.state === "OFFERED" && now > q.deadline) { q.state = "EXPIRED"; q.resolved = now; }
    else if (isActive(q) && now > q.deadline) {
      q.state = "EXPIRED"; q.resolved = now; q.outcome = "expired";
      applyRegionDelta(S, q.region, { danger: 8, stability: -5, prosperity: -3 });
      bump(S, { faction: q.faction, factionN: -3, region: q.region, regionN: -3 });
      const g = S.npcs[q.giver]; if (g) { adjust(g, { trust: -10, hostility: 4 }); remember(g, `The player failed to fulfil: ${q.title}`); }
      if (stream("quest").chance(0.4)) scheduleEvent(S, "refugees", q.region, 2);
      const msg = `Quest expired: ${q.title}. The region suffers for it.`;
      out.push(msg); timeline(S, msg, "quest");
      record(S, "quest_expired", { targets: [q.id], tags: ["quest", "failure"], direct: [msg], future: ["Refugees", "Higher danger"] });
    }
  }
  return out;
}
