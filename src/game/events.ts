/* eslint-disable @typescript-eslint/no-explicit-any */
// Persistent world event scheduler. The world progresses with or without the player.
import { D } from "./data";
import { clamp } from "./engine";
import { stream } from "./rng";
import { nextId, timeline, today } from "./campaign";
import { addRumor } from "./reputation";
import type { GameState, WorldEvent } from "./types";

export function applyRegionDelta(S: GameState, region: string, d: Record<string, number>) {
  const r = S.world[region];
  if (!r) return;
  for (const k of Object.keys(d)) {
    if (k === "population") { r.population = Math.max(10, r.population + d[k] * 10); r.settlement.merchants = Math.max(1, r.settlement.merchants); }
    else if (k in r) (r as any)[k] = clamp((r as any)[k] + d[k], 0, 100);
  }
}
export function scheduleEvent(S: GameState, tid: string, region: string, inDays: number): WorldEvent | null {
  const t = D.worldEvents[tid];
  if (!t) return null;
  if (S.events.some((e) => e.template === tid && e.region_id === region && ["scheduled", "delayed", "triggered"].includes(e.status))) return null;
  const e: WorldEvent = {
    event_id: nextId(S, "wevt"), type: t.type, template: tid, region_id: region, scheduled_day: today(S) + Math.max(1, inDays), participants: [t.faction, t.target],
    conditions: [], consequences: t.chain.map((c: any) => ({ ...c, done: false })), status: "scheduled", triggeredDay: -1, name: t.name,
  };
  S.events.push(e);
  if (S.events.length > 70) S.events = S.events.filter((x) => ["scheduled", "delayed", "triggered"].includes(x.status) || today(S) - x.scheduled_day < 60);
  return e;
}
export const activeEvents = (S: GameState, region?: string) => S.events.filter((e) => ["scheduled", "delayed", "triggered"].includes(e.status) && (!region || e.region_id === region));
export function delayEvent(S: GameState, id: string, days: number) {
  const e = S.events.find((x) => x.event_id === id);
  if (e && e.status === "scheduled") { e.scheduled_day += days; e.status = "delayed"; }
}
export function accelerate(S: GameState, id: string) {
  const e = S.events.find((x) => x.event_id === id);
  if (e && (e.status === "scheduled" || e.status === "delayed")) e.scheduled_day = today(S);
}
/** Player action prevents matching events (e.g. clearing a faction's dungeon). */
export function preventByClear(S: GameState, faction: string): string[] {
  const out: string[] = [];
  for (const e of S.events) {
    const t = D.worldEvents[e.template];
    if (t?.prevent === "clear:" + faction && ["scheduled", "delayed", "triggered"].includes(e.status)) {
      const wasTriggered = e.status === "triggered";
      e.status = "prevented";
      out.push(`${e.name} in ${D.regionMap[e.region_id]?.name} ${wasTriggered ? "is cut short" : "is averted"} thanks to your actions.`);
      timeline(S, `${e.name} was ${wasTriggered ? "stopped" : "prevented"} (${D.regionMap[e.region_id]?.name}).`, "world");
    }
  }
  return out;
}
/** Run once per elapsed day. Returns newsworthy messages. */
export function processEvents(S: GameState): { text: string; region: string }[] {
  const news: { text: string; region: string }[] = [];
  const now = today(S);
  const r = stream("world");
  for (const e of S.events) {
    if ((e.status === "scheduled" || e.status === "delayed") && e.scheduled_day <= now) {
      e.status = "triggered"; e.triggeredDay = now;
      const msg = `${e.name} begins in ${D.regionMap[e.region_id]?.name}.`;
      news.push({ text: msg, region: e.region_id });
      timeline(S, msg, "world");
      const reg = S.world[e.region_id];
      if (reg && !reg.events.includes(e.name)) reg.events.push(e.name);
      const f = S.factions[e.participants[0]]; if (f) f.known = true;
      addRumor(S, { text: `${e.name} has broken out in ${D.regionMap[e.region_id]?.name}`, region: e.region_id, source: "faction agent", truth: r.chance(0.8) ? "correct" : "exaggerated" });
    }
    if (e.status === "triggered") {
      for (const c of e.consequences) {
        if (c.done || now < e.triggeredDay + c.after) continue;
        c.done = true;
        if (c.region) applyRegionDelta(S, e.region_id, c.region);
        if (c.price && S.world[e.region_id]) S.world[e.region_id].priceMod = clamp(S.world[e.region_id].priceMod + c.price, 0.7, 1.8);
        if (c.faction) for (const fid of Object.keys(c.faction)) { const f = S.factions[fid]; if (f) for (const k of Object.keys(c.faction[fid])) (f as any)[k] = clamp((f as any)[k] + c.faction[fid][k], 0, 100); }
        if (c.spawn) scheduleEvent(S, c.spawn, e.region_id, r.int(1, 4));
        if (c.msg) { news.push({ text: c.msg, region: e.region_id }); timeline(S, c.msg, "world"); const reg = S.world[e.region_id]; if (reg) { reg.changes.push(c.msg); if (reg.changes.length > 8) reg.changes.shift(); } }
      }
      if (e.consequences.every((c) => c.done)) { e.status = "completed"; const reg = S.world[e.region_id]; if (reg) reg.events = reg.events.filter((n) => n !== e.name); }
    }
  }
  return news;
}
