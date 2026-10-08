/* eslint-disable @typescript-eslint/no-explicit-any */
// Consequence ledger, canonical facts, legend, titles and timeline. The ledger is the historical truth.
import type { Fact, GameState, LedgerEntry } from "./types";
import { calendar } from "./calendar";

export function nextId(S: GameState, prefix: string): string {
  S.counters[prefix] = (S.counters[prefix] ?? 0) + 1;
  return `${prefix}_${String(S.counters[prefix]).padStart(5, "0")}`;
}
export const today = (S: GameState) => calendar(S.hours).dayAbs;

export function timeline(S: GameState, text: string, kind = "world") {
  S.timeline.push({ day: today(S), text, kind });
  if (S.timeline.length > 160) S.timeline.splice(0, S.timeline.length - 160);
}
export function legend(S: GameState, text: string) {
  S.legend.push({ day: today(S), text });
  if (S.legend.length > 80) S.legend.splice(0, S.legend.length - 80);
  timeline(S, text, "legend");
}
export function addFact(S: GameState, f: Partial<Fact> & { type: string; subject: string; object: string; text: string }): Fact {
  // upsert by type+subject+object
  const ex = S.facts.find((x) => x.type === f.type && x.subject === f.subject && x.object === f.object);
  const fact: Fact = {
    fact_id: ex?.fact_id ?? nextId(S, "fact"), type: f.type, subject: f.subject, object: f.object, value: f.value ?? 1,
    source_event: f.source_event ?? "", confidence: f.confidence ?? 1, priority: f.priority ?? "IMPORTANT", text: f.text, day: today(S),
  };
  if (ex) Object.assign(ex, fact);
  else S.facts.push(fact);
  pruneFacts(S);
  return fact;
}
const PR = { CRITICAL: 0, MAJOR: 1, IMPORTANT: 2, MINOR: 3, FLAVOR: 4 } as const;
export function pruneFacts(S: GameState, cap = 160) {
  if (S.facts.length <= cap) return;
  S.facts.sort((a, b) => PR[a.priority] - PR[b.priority] || b.day - a.day);
  // CRITICAL and MAJOR persist indefinitely
  const keep = S.facts.filter((f) => f.priority === "CRITICAL" || f.priority === "MAJOR");
  const rest = S.facts.filter((f) => f.priority !== "CRITICAL" && f.priority !== "MAJOR").slice(0, Math.max(0, cap - keep.length));
  S.facts = [...keep, ...rest];
}
export function record(S: GameState, action: string, o: { location?: string; targets?: string[]; tags?: string[]; direct?: string[]; future?: string[]; actor?: string; fact?: Partial<Fact> & { text: string } } = {}): LedgerEntry {
  const e: LedgerEntry = {
    event_id: nextId(S, "evt"), day: today(S), actor: o.actor ?? "player", action, location: o.location ?? S.loc.dungeon ?? S.loc.region,
    targets: o.targets ?? [], tags: o.tags ?? [], direct_consequences: o.direct ?? [], possible_future_consequences: o.future ?? [],
  };
  S.ledger.push(e);
  if (o.fact) addFact(S, { type: "event", subject: "player", object: action + ":" + (o.targets?.[0] ?? e.event_id), priority: "IMPORTANT", source_event: e.event_id, ...o.fact });
  if (S.ledger.length > 260) {
    // compress oldest into campaign memory counters
    const old = S.ledger.splice(0, 60);
    const counts: Record<string, number> = {};
    for (const x of old) counts[x.action] = (counts[x.action] ?? 0) + 1;
    const txt = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}×${v}`).join(", ");
    addFact(S, { type: "history", subject: "player", object: "archive_" + old[0].day, text: `Days ${old[0].day}-${old[old.length - 1].day}: ${txt}`, priority: "MINOR" });
  }
  return e;
}
export const countTag = (S: GameState, tag: string) => S.ledger.filter((l) => l.tags.includes(tag)).length + (S.counters["arch_" + tag] ?? 0);

const TITLES: { id: string; text: string; test: (S: GameState) => boolean }[] = [
  { id: "Goblinbane", text: "Goblinbane", test: (S) => countTag(S, "kill_goblin") >= 8 || countTag(S, "boss_goblin_king") > 0 },
  { id: "Bandit Hunter", text: "Bandit Hunter", test: (S) => countTag(S, "kill_bandit") >= 8 },
  { id: "The Grave Walker", text: "The Grave Walker", test: (S) => countTag(S, "kill_undead") >= 10 },
  { id: "The Silver Tongue", text: "The Silver Tongue", test: (S) => S.stats.socialWins >= 5 },
  { id: "The Thief of Shadows", text: "The Thief", test: (S) => S.stats.steals >= 3 },
  { id: "Friend of Merchants", text: "Friend of Merchants", test: (S) => S.rep.merchant >= 35 },
  { id: "Dragonbane", text: "Dragonbane", test: (S) => countTag(S, "boss_dragon") > 0 },
  { id: "Delver", text: "the Delver", test: (S) => S.stats.cleared >= 3 },
  { id: "Infamous", text: "the Infamous", test: (S) => S.rep.criminal >= 40 },
  { id: "Champion of the Realm", text: "Champion of the Realm", test: (S) => S.stats.bossKills >= 4 && S.rep.heroic >= 30 },
];
export function checkTitles(S: GameState): string[] {
  const out: string[] = [];
  for (const t of TITLES) if (!S.titles.includes(t.text) && t.test(S)) { S.titles.push(t.text); out.push(t.text); legend(S, `Earned the title "${t.text}".`); }
  return out;
}
