/* eslint-disable @typescript-eslint/no-explicit-any */
// Deterministic campaign pacing + story thread pressure. The Director never writes narrative.
import { D } from "./data";
import { clamp } from "./engine";
import { stream, type Rng } from "./rng";
import { timeline, today } from "./campaign";
import { applyRegionDelta, scheduleEvent, activeEvents } from "./events";
import type { GameState, Thread } from "./types";

const THREAD_EVENTS: Record<string, string> = { thr_goblin: "goblin_war", thr_missing: "bandit_raid", thr_guild: "caravan_ambush", thr_artifact: "cult_ritual", thr_succession: "crime_wave" };
export const pressureLabel = (p: number) => (p <= 0 ? "dormant" : p <= 25 ? "background" : p <= 50 ? "developing" : p <= 75 ? "active" : p <= 90 ? "dangerous" : "critical");

export function initThreads(S: GameState) {
  S.threads = D.threads.map((t: any) => ({
    id: t.id, title: t.title, region: t.region, factions: t.factions, pressure: t.pressure, importance: t.importance, scale: t.scale, known: [...t.known], unknown: [...t.unknown],
    next: [...t.next], state: pressureLabel(t.pressure), involvement: 0, link_dungeon: t.link_dungeon, deadline: 40 + t.importance * 10, resolved: false,
  }));
}
export const activeThreads = (S: GameState) => S.threads.filter((t) => !t.resolved);
export const currentScale = (S: GameState) => {
  const b = S.stats.bossKills;
  return clamp(b >= 12 ? 5 : b >= 9 ? 4 : b >= 6 ? 3 : b >= 4 ? 2 : b >= 2 ? 1 : 0, 0, 5);
};
export function bumpThread(S: GameState, id: string, n: number) {
  const t = S.threads.find((x) => x.id === id);
  if (t) { t.pressure = clamp(t.pressure + n, 0, 100); t.involvement += n < 0 ? 1 : 0; }
}
export function onDungeonCleared(S: GameState, dungeonId: string, faction: string): string[] {
  const out: string[] = [];
  for (const t of S.threads) {
    if (t.resolved) continue;
    if (t.link_dungeon === dungeonId || t.factions.includes(faction)) {
      t.pressure = clamp(t.pressure - (t.link_dungeon === dungeonId ? 45 : 15), 0, 100);
      t.involvement++;
      if (t.link_dungeon === dungeonId && t.pressure < 20) {
        t.resolved = true; t.state = "resolved";
        const msg = `Story thread resolved: ${t.title}.`;
        out.push(msg); timeline(S, msg, "thread");
      }
    }
  }
  return out;
}
/** Daily story pressure; surfaces consequences at thresholds without forcing the player's hand. */
export function threadTick(S: GameState): string[] {
  const out: string[] = [];
  const r = stream("director");
  for (const t of S.threads) {
    if (t.resolved) continue;
    const before = pressureLabel(t.pressure);
    t.pressure = clamp(t.pressure + t.importance * 0.18 + (t.involvement === 0 ? 0.1 : -0.05), 0, 100);
    const after = pressureLabel(t.pressure);
    t.state = after;
    if (after !== before) {
      const ev = THREAD_EVENTS[t.id];
      if (ev && ["active", "dangerous", "critical"].includes(after)) scheduleEvent(S, ev, t.region, r.int(2, 6));
      if (after === "dangerous" || after === "critical") applyRegionDelta(S, t.region, { danger: 8, stability: -4 });
      if (t.next.length && ["developing", "active", "dangerous"].includes(after)) {
        const n = t.next.shift()!;
        t.known.push(n);
        if (t.known.length > 8) t.known.shift();
        out.push(`${t.title}: ${n}`); timeline(S, `${t.title}: ${n}`, "thread");
      }
    }
  }
  return out;
}
/** Anti-entropy: keep several unresolved, interacting story threads alive; escalate in scale over time. */
export function ensureThreads(S: GameState) {
  const act = activeThreads(S);
  if (act.length >= 3) return;
  const r = stream("director");
  const scale = D.scales[currentScale(S)];
  const factions = Object.values(S.factions).filter((f) => f.id !== "wildlife" && f.known);
  const f = factions.length ? r.pick(factions) : S.factions.bandits;
  const rival = f.rivals.length ? S.factions[r.pick(f.rivals)] : S.factions.wardens;
  const regs = D.regions.filter((q: any) => S.player.level >= q.level_min);
  const reg = regs.length ? r.pick(regs) : D.regions[0];
  const n = S.threads.length + 1;
  const topics = ["Ascendancy", "Succession Crisis", "Smuggling Ring", "Lost Relic", "Border War", "Plague of Whispers", "Broken Oath"];
  const th: Thread = {
    id: `thr_gen_${n}`, title: `The ${f.name.split(" ").pop()} ${r.pick(topics)}`, region: reg.id, factions: [f.id, rival.id], pressure: 15 + r.int(0, 10), importance: 2 + Math.min(3, currentScale(S)), scale,
    known: [`Rumors say ${f.name} are moving against ${rival.name}.`], unknown: ["Who is really behind it?"], next: ["A new faction crisis erupts.", "An old betrayal comes to light."], state: "background", involvement: 0, deadline: today(S) + 60, resolved: false,
  };
  S.threads.push(th);
  if (S.threads.length > 14) S.threads = S.threads.filter((t) => !t.resolved).concat(S.threads.filter((t) => t.resolved).slice(-4));
  timeline(S, `A new ${scale.toLowerCase()} story thread emerges: ${th.title}.`, "thread");
}
export function surfaceThread(S: GameState): Thread | undefined {
  return activeThreads(S).sort((a, b) => b.pressure * b.importance - a.pressure * a.importance)[0];
}
export function pacingHint(S: GameState): "quiet" | "normal" | "intense" {
  const d = S.director;
  if (d.sinceCombat >= 4 || (S.player.hp / 1 < 0 )) return "normal";
  if (d.sinceQuiet >= 6) return "quiet";
  if (d.sinceQuiet >= 3) return "normal";
  return "intense";
}
export function signature(parts: Record<string, string>) { return Object.values(parts).join("|"); }
export function noteSignature(S: GameState, sig: string) {
  S.director.recent.push(sig);
  if (S.director.recent.length > 24) S.director.recent.shift();
  S.director.counts[sig] = (S.director.counts[sig] ?? 0) + 1;
  const keys = Object.keys(S.director.counts);
  if (keys.length > 120) for (const k of keys.slice(0, 40)) delete S.director.counts[k];
}
export function cooldown(S: GameState, sig: string): number {
  const idx = S.director.recent.lastIndexOf(sig);
  if (idx < 0) return 1;
  const age = S.director.recent.length - idx;
  return clamp(age / 8, 0.1, 1);
}
export function novelty(S: GameState, sig: string): number {
  return Math.round(100 / (1 + (S.director.counts[sig] ?? 0)));
}
/** Pick a room purpose with pacing rules; avoids same-type streaks. */
export function pickRoom(S: GameState, r: Rng, layer: number, used: string[], allow: { prisoner: boolean }): string {
  const W: Record<number, Record<string, number>> = {
    1: { combat: 4, event: 3, social: 2, treasure: 1, trap: 1 },
    2: { combat: 3, event: 2, puzzle: 1, treasure: 1, social: 1, trap: 1, lore: 2, prisoner: allow.prisoner ? 1 : 0 },
    3: { elite: 2, combat: 2, merchant: 2, smith: 1, lore: 1, event: 2, treasure: 1, social: 1 },
    4: { elite: 2, rest: 2, combat: 2, puzzle: 1, trap: 1, event: 1, treasure: 1 },
    5: { rest: 4, merchant: 1, smith: 1, event: 1 },
  };
  const w = W[layer] ?? W[2];
  const pace = pacingHint(S);
  const keys = Object.keys(w).filter((k) => !used.includes(k) || k === "combat");
  return r.weighted(keys.length ? keys : Object.keys(w), (k) => (w[k] ?? 1) * (pace === "quiet" && !["combat", "elite"].includes(k) ? 1.6 : pace === "intense" && k === "combat" ? 1.3 : 1));
}
export function surfaceHooks(S: GameState, region: string): string[] {
  const out: string[] = [];
  for (const e of activeEvents(S, region).slice(0, 2)) out.push(`${e.name}${e.status === "triggered" ? " (underway)" : ` (day ${e.scheduled_day})`}`);
  return out;
}
