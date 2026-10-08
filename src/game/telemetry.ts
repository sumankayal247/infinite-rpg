/* eslint-disable @typescript-eslint/no-explicit-any */
// Cross-run meta progression, behavior analytics (Markov chain), repetition detection, error log.
import { D } from "./data";
import type { GameState, Meta } from "./types";

const KEY = "infinite_rpg_meta_v1";
const defaults = (): Meta => ({
  runs: 0, bestLevel: 0, bestDays: 0, totalKills: 0, shards: 0, unlockedClasses: ["warrior", "rogue", "mage", "cleric"], achievements: [], markov: {}, classPicks: {}, errors: [], borders: ["classic"],
  totals: { combats: 0, crits: 0, social: 0, steals: 0, cleared: 0, revives: 0, days: 0 }, behavior: {},
});
let meta: Meta = defaults();
let loaded = false;
export function getMeta(): Meta {
  if (!loaded && typeof localStorage !== "undefined") {
    loaded = true;
    try { const raw = localStorage.getItem(KEY); if (raw) meta = { ...defaults(), ...JSON.parse(raw) }; } catch { /* ignore */ }
  }
  return meta;
}
export function saveMeta() {
  try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch { /* quota */ }
}
export function recordChoice(prev: string, next: string) {
  const m = getMeta();
  m.markov[prev] = m.markov[prev] ?? {};
  m.markov[prev][next] = (m.markov[prev][next] ?? 0) + 1;
  m.behavior[next] = (m.behavior[next] ?? 0) + 1;
  const keys = Object.keys(m.markov);
  if (keys.length > 40) delete m.markov[keys[0]];
}
export function markovPredict(prev: string): { choice: string; p: number } | null {
  const row = getMeta().markov[prev];
  if (!row) return null;
  const total = Object.values(row).reduce((a, b) => a + b, 0);
  if (total < 3) return null;
  const [choice, n] = Object.entries(row).sort((a, b) => b[1] - a[1])[0];
  return { choice, p: n / total };
}
export function logError(msg: string) {
  const m = getMeta();
  m.errors.push(`${new Date().toISOString().slice(11, 19)} ${String(msg).slice(0, 120)}`);
  if (m.errors.length > 20) m.errors.shift();
  saveMeta();
}
export function unlockAchievement(id: string): { name: string; shards: number } | null {
  const m = getMeta();
  if (m.achievements.includes(id)) return null;
  const a = D.rules.achievements.find((x: any) => x.id === id);
  if (!a) return null;
  m.achievements.push(id);
  m.shards += a.shards;
  saveMeta();
  return { name: a.name, shards: a.shards };
}
export function checkAchievements(S: GameState): { name: string; shards: number }[] {
  const out: { name: string; shards: number }[] = [];
  const t = (id: string, cond: boolean) => { if (cond) { const r = unlockAchievement(id); if (r) out.push(r); } };
  t("first_blood", S.stats.combats >= 1);
  t("crit_master", S.stats.crits >= 1);
  t("delver", S.stats.cleared >= 1);
  t("silver_tongue", S.stats.socialWins >= 5);
  t("sticky_fingers", S.stats.steals >= 1);
  t("survivor", S.stats.revives >= 1);
  t("veteran", S.player.level >= 5);
  t("legend", S.player.level >= 10);
  t("centurion", Math.floor(S.hours / 24) >= 100);
  t("slayer", getMeta().totalKills + S.stats.kills >= 50);
  return out;
}
export function endRun(S: GameState) {
  const m = getMeta();
  m.runs++;
  m.bestLevel = Math.max(m.bestLevel, S.player.level);
  m.bestDays = Math.max(m.bestDays, Math.floor(S.hours / 24) + 1);
  m.totalKills += S.stats.kills;
  m.totals.combats += S.stats.combats; m.totals.crits += S.stats.crits; m.totals.social += S.stats.socialWins; m.totals.steals += S.stats.steals;
  m.totals.cleared += S.stats.cleared; m.totals.revives += S.stats.revives; m.totals.days += Math.floor(S.hours / 24);
  m.classPicks[S.player.classId] = (m.classPicks[S.player.classId] ?? 0) + 1;
  m.shards += Math.floor(S.player.level / 2) + S.stats.bossKills * 2;
  saveMeta();
}
export function repetitionReport(S: GameState) {
  const rec = S.director.recent;
  const uniq = new Set(rec).size;
  return { window: rec.length, unique: uniq, ratio: rec.length ? uniq / rec.length : 1 };
}
export function stateSize(S: GameState) {
  try { return JSON.stringify(S).length; } catch { return -1; }
}
