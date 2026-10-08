/* eslint-disable @typescript-eslint/no-explicit-any */
// Persistent world simulation hub: regions, settlements, daily/weekly ticks.
import { D } from "./data";
import { clamp } from "./engine";
import { calendar } from "./calendar";
import { stream } from "./rng";
import { timeline, today } from "./campaign";
import { processEvents, scheduleEvent, activeEvents } from "./events";
import { factionTick } from "./factions";
import { npcTick } from "./npc";
import { threadTick, ensureThreads } from "./director";
import { expireQuests } from "./quest";
import { marketTick } from "./economy";
import { spreadRumors } from "./reputation";
import { crimeDecay } from "./crime";
import { reoccupy } from "./dungeon";
import { checkInvariants } from "./engine";
import type { GameState, RegionState } from "./types";

export function initWorld(S: GameState) {
  for (const reg of D.regions) {
    const st = reg.settlement;
    const base: RegionState = {
      id: reg.id, population: st.pop, prosperity: st.wealth, danger: 20 + reg.level_min * 2, crime: 100 - st.safety > 0 ? Math.round((100 - st.safety) / 2) : 10, stability: st.safety,
      controller: reg.faction, dominant: reg.faction, conflicts: [], trade: "open", resources: ["timber", "ore", "herbs"].slice(0, 2), discovered: [], destroyed: [], abandoned: [], changes: [], events: [],
      priceMod: 1, unlocked: reg.id === "greenwood",
      settlement: { name: st.name, wealth: st.wealth, safety: st.safety, services: [...st.services], rumors: [], problems: [], merchants: 1 },
    };
    S.world[reg.id] = base;
  }
}
export function regionName(id: string) { return D.regionMap[id]?.name ?? id; }
export function unlockRegions(S: GameState): string[] {
  const out: string[] = [];
  for (const reg of D.regions) {
    const r = S.world[reg.id];
    if (!r.unlocked && S.player.level >= reg.level_min) { r.unlocked = true; out.push(`${reg.name} is now open to you (level ${reg.level_min}+).`); timeline(S, `Region unlocked: ${reg.name}`, "world"); }
  }
  return out;
}
function settlementTick(S: GameState) {
  for (const r of Object.values(S.world)) {
    const s = r.settlement;
    const growth = (r.prosperity - 45) / 80 + (r.stability - 45) / 120 - (r.danger - 40) / 150;
    r.population = Math.max(50, Math.round(r.population * (1 + growth / 25)));
    s.wealth = clamp(Math.round(s.wealth * 0.8 + r.prosperity * 0.2), 0, 100);
    s.safety = clamp(Math.round(s.safety * 0.8 + r.stability * 0.2 - r.crime * 0.05), 0, 100);
    const base = D.regionMap[r.id].settlement.services as string[];
    s.services = base.filter((sv: string) => !(sv === "shop" && r.prosperity < 12) && !(sv === "smith" && r.prosperity < 18) && !(sv === "healer" && r.stability < 8));
    s.problems = [];
    if (r.crime > 55) s.problems.push("Lawless streets");
    if (r.prosperity < 30) s.problems.push("Poverty and shortages");
    if (r.danger > 60) s.problems.push("Monsters at the gates");
    if (r.stability < 30) s.problems.push("Political unrest");
    s.merchants = clamp(Math.round(r.prosperity / 25), 1, 5);
    r.danger = clamp(r.danger + (r.danger > 30 + D.regionMap[r.id].level_min ? -1 : 1) * 0.5, 0, 100);
    r.prosperity = clamp(r.prosperity + (50 - r.prosperity) * 0.02, 0, 100);
    r.stability = clamp(r.stability + (50 - r.stability) * 0.03, 0, 100);
    r.crime = clamp(r.crime + (30 - r.crime) * 0.03, 0, 100);
    if (r.prosperity < 8 && r.stability < 20 && !r.abandoned.length && stream("world").chance(0.1)) { r.abandoned.push(s.name); timeline(S, `${s.name} is being abandoned.`, "world"); }
  }
}
/** Spawns an emergent world event when too few exist (anti-entropy: the world always has unresolved problems). */
function ensureEvents(S: GameState) {
  const r = stream("world");
  if (activeEvents(S).filter((e) => e.status !== "triggered").length >= 2) return;
  const regs = D.regions.filter((q: any) => S.world[q.id].unlocked);
  const reg = r.pick(regs) as any;
  const ids = Object.keys(D.worldEvents).filter((id) => {
    const t = D.worldEvents[id];
    return t.faction === "wildlife" || t.faction === reg.faction || S.factions[t.faction]?.military > 30;
  });
  const bad = ids.filter((id) => !["festival", "trade_boom"].includes(id));
  const pick = r.chance(0.2) ? r.pick(ids) : r.pick(bad.length ? bad : ids);
  scheduleEvent(S, pick as string, reg.id, r.int(D.worldEvents[pick as string].delay[0], D.worldEvents[pick as string].delay[1]));
}
export interface Tick { news: { text: string; region: string }[] }
/** Master time advance: world progresses day-by-day whether or not the player is involved. */
export function advance(S: GameState, hours: number): Tick {
  const news: { text: string; region: string }[] = [];
  const startDay = calendar(S.hours).dayAbs;
  S.hours += hours;
  const endDay = calendar(S.hours).dayAbs;
  for (let d = startDay + 1; d <= Math.min(endDay, startDay + 40); d++) {
    const fakeS = S;
    void fakeS;
    news.push(...processEvents(S));
    crimeDecay(S); marketTick(S); spreadRumors(S); npcTick(S);
    for (const m of threadTick(S)) news.push({ text: m, region: S.loc.region });
    for (const m of expireQuests(S)) news.push({ text: m, region: S.loc.region });
    if (d % 7 === 0) {
      for (const m of factionTick(S)) news.push({ text: m, region: S.loc.region });
      settlementTick(S);
      ensureEvents(S); ensureThreads(S);
    }
    for (const dg of Object.values(S.dungeons)) {
      if (dg.cleared && d - dg.clearedDay >= 12 && stream("world").chance(0.07)) news.push({ text: reoccupy(S, dg), region: dg.region });
    }
    for (const c of S.party) if (c.status === "left" && c.trust < 25) c.trust = Math.min(30, c.trust + 0.2);
  }
  if (endDay > startDay) { if (endDay - startDay > 40) S.hours = (endDay - 1) * 24 + (S.hours % 24); S.stats.rooms += 0; checkInvariants(S); }
  void today;
  return { news };
}
