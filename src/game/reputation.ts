/* eslint-disable @typescript-eslint/no-explicit-any */
// Multi-axis reputation, regional recognition and rumor propagation.
import { D } from "./data";
import { clamp } from "./engine";
import { stream } from "./rng";
import { addFact, nextId, today } from "./campaign";
import type { GameState } from "./types";

type Axis = "heroic" | "military" | "criminal" | "religious" | "political" | "merchant" | "adventurer";
export function bump(S: GameState, o: { axis?: Axis; n?: number; region?: string; regionN?: number; faction?: string; factionN?: number }) {
  const lo = D.rules.rep_min, hi = D.rules.rep_max;
  if (o.axis) S.rep[o.axis] = clamp(S.rep[o.axis] + (o.n ?? 0), lo, hi);
  if (o.region) S.rep.region[o.region] = clamp((S.rep.region[o.region] ?? 0) + (o.regionN ?? o.n ?? 0), lo, hi);
  if (o.faction) {
    S.rep.faction[o.faction] = clamp((S.rep.faction[o.faction] ?? 0) + (o.factionN ?? o.n ?? 0), lo, hi);
    const f = S.factions[o.faction];
    if (f) f.player = S.rep.faction[o.faction];
    // rivals of a faction dislike its friends
    const fd = D.factionMap[o.faction];
    if (fd && (o.factionN ?? o.n ?? 0) >= 8) for (const r of fd.rivals) if (S.factions[r]) { S.rep.faction[r] = clamp((S.rep.faction[r] ?? 0) - 2, lo, hi); S.factions[r].player = S.rep.faction[r]; }
  }
}
export function repLabel(n: number): string {
  return n >= 60 ? "Revered" : n >= 30 ? "Admired" : n >= 10 ? "Friendly" : n > -10 ? "Neutral" : n > -30 ? "Disliked" : n > -60 ? "Hated" : "Despised";
}
export function addRumor(S: GameState, o: { text: string; region: string; truth?: "correct" | "exaggerated" | "incorrect" | "propaganda"; source?: string }) {
  const r = stream("rumor");
  const truth = o.truth ?? (r.chance(0.65) ? "correct" : r.chance(0.5) ? "exaggerated" : "incorrect");
  S.rumors.push({ id: nextId(S, "rumor"), source: o.source ?? "witness", text: o.text, truth, region: o.region, day: today(S), spread: [o.region] });
  if (S.rumors.length > 40) S.rumors.splice(0, S.rumors.length - 40);
}
/** Rumors hop between neighboring regions through travelers; heard rumors shape regional reputation. */
export function spreadRumors(S: GameState) {
  const r = stream("rumor");
  for (const ru of S.rumors) {
    if (today(S) - ru.day < 2 || ru.spread.length >= 4 || !r.chance(0.3)) continue;
    const from = ru.spread[ru.spread.length - 1];
    const nb = (D.regionMap[from]?.neighbors ?? []).filter((n: string) => !ru.spread.includes(n));
    if (!nb.length) continue;
    ru.spread.push(r.pick(nb));
    if (ru.truth === "correct" && /hero|slain|defeat|saved|cleared/i.test(ru.text)) bump(S, { region: ru.spread[ru.spread.length - 1], regionN: 2 });
    if (ru.truth === "correct" && /stole|thief|robbed/i.test(ru.text)) bump(S, { region: ru.spread[ru.spread.length - 1], regionN: -2 });
  }
  if (S.rumors.length > 24) S.rumors = S.rumors.filter((x) => today(S) - x.day < 80 || x.spread.length > 2);
}
export function rumorsHere(S: GameState, region: string) {
  return S.rumors.filter((r) => r.spread.includes(region)).slice(-5);
}
export function noteRep(S: GameState, text: string) {
  addFact(S, { type: "reputation", subject: "player", object: text.slice(0, 24), text, priority: "MINOR" });
}
