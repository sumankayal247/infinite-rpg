// Wanted level, witnesses, law response and jail.
import { D } from "./data";
import { clamp } from "./engine";
import { stream } from "./rng";
import { addRumor, bump } from "./reputation";
import { record, today } from "./campaign";
import type { GameState } from "./types";

export const wantedIn = (S: GameState, region: string) => S.wanted[region] ?? 0;
export function addWanted(S: GameState, region: string, n: number, why: string) {
  const prev = wantedIn(S, region);
  S.wanted[region] = clamp(prev + n, 0, D.rules.max_wanted);
  bump(S, { axis: "criminal", n: n * 4, region, regionN: -n * 6, faction: "wardens", factionN: -n * 3 });
  record(S, "crime:" + why, { tags: ["crime", "wanted"], direct: [`Wanted level ${S.wanted[region]} in ${region}`], future: ["Guards may pursue the player"] });
  if (S.wanted[region] > prev) addRumor(S, { text: `a thief fitting your description ${why} in ${D.regionMap[region]?.name ?? region}`, region, source: "guard" });
}
export function fineAmount(S: GameState, region: string) {
  return Math.round(25 * wantedIn(S, region) * (1 + S.player.level * 0.4));
}
/** Law response when the player is caught: fine, guard combat or jail (decided by wanted level and RNG). */
export function lawResponse(S: GameState, region: string): "fine" | "combat" | "jail" {
  const w = wantedIn(S, region);
  const r = stream("crime");
  if (w <= 1) return "fine";
  if (w === 2) return r.chance(0.5) ? "fine" : "combat";
  if (w === 3) return r.chance(0.6) ? "combat" : "jail";
  return r.chance(0.5) ? "combat" : "jail";
}
export function payFine(S: GameState, region: string): { ok: boolean; paid: number } {
  const f = fineAmount(S, region);
  const paid = Math.min(S.player.gold, f);
  S.player.gold -= paid;
  if (paid >= f) { S.wanted[region] = Math.max(0, wantedIn(S, region) - 1); return { ok: true, paid }; }
  return { ok: false, paid };
}
export function jail(S: GameState, region: string): { days: number; lost: number } {
  const days = 2 + wantedIn(S, region);
  const lost = Math.floor(S.player.gold * 0.3);
  S.player.gold -= lost;
  S.wanted[region] = Math.max(0, wantedIn(S, region) - 2);
  record(S, "jailed", { tags: ["crime", "jail"], direct: [`${days} days lost`, `${lost} gold confiscated`] });
  return { days, lost };
}
export function crimeDecay(S: GameState) {
  if (today(S) % 7 !== 0) return;
  for (const k of Object.keys(S.wanted)) if (S.wanted[k] > 0) S.wanted[k]--;
}
