/* eslint-disable @typescript-eslint/no-explicit-any */
// Persistence: versioned campaign saves, migration, settings. Owns persistence only.
import { exportRng, importRng } from "./rng";
import type { GameState, Settings } from "./types";

export const SAVE_VERSION = 1;
const KEY = "infinite_rpg_save";
const SKEY = "infinite_rpg_settings";

export const defaultSettings = (): Settings => ({ crt: true, textScale: 1, typing: true, sound: true, music: true, ai: true, shake: true, border: "classic" });
export function loadSettings(): Settings {
  try { const r = localStorage.getItem(SKEY); if (r) return { ...defaultSettings(), ...JSON.parse(r) }; } catch { /* ignore */ }
  return defaultSettings();
}
export function saveSettings(s: Settings) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch { /* ignore */ } }

function prune(S: GameState) {
  S.dice = S.dice.slice(-40);
  S.timeline = S.timeline.slice(-160);
  S.ledger = S.ledger.slice(-260);
  S.rumors = S.rumors.slice(-40);
  S.legend = S.legend.slice(-80);
  S.events = S.events.filter((e) => ["scheduled", "delayed", "triggered"].includes(e.status)).concat(S.events.filter((e) => !["scheduled", "delayed", "triggered"].includes(e.status)).slice(-24));
}
export function saveGame(S: GameState): boolean {
  try {
    prune(S);
    localStorage.setItem(KEY, JSON.stringify({ save_version: SAVE_VERSION, rng: exportRng(), savedAt: Date.now(), state: S }));
    return true;
  } catch { return false; }
}
export function hasSave(): boolean {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}
export function savePreview(): { name: string; level: number; day: number; cls: string } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw).state;
    return { name: s.player.name, level: s.player.level, day: Math.floor(s.hours / 24) + 1, cls: s.player.classId };
  } catch { return null; }
}
export function migrate(raw: any): GameState | null {
  if (!raw?.state) return null;
  const S = raw.state;
  const v = raw.save_version ?? 0;
  // forward-compat defaults for fields added in later versions
  S.flags = { hallucination: 0, charm: false, reveal: false, translate: false, open: false, ...(S.flags ?? {}) };
  S.director = { recent: [], counts: {}, sinceQuiet: 0, sinceCombat: 0, scale: 0, ...(S.director ?? {}) };
  S.stats = { kills: 0, crits: 0, socialWins: 0, steals: 0, combats: 0, rooms: 0, cleared: 0, bossKills: 0, deaths: 0, revives: 0, ...(S.stats ?? {}) };
  S.counters = S.counters ?? {};
  S.clues = S.clues ?? []; S.decisions = S.decisions ?? []; S.nemeses = S.nemeses ?? []; S.titles = S.titles ?? [];
  S.settings = S.settings ?? { death: "normal" };
  void v;
  return S as GameState;
}
export function loadGame(): GameState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw) return null;
    const S = migrate(raw);
    if (!S) return null;
    importRng(S.seed, raw.rng);
    return S;
  } catch { return null; }
}
export function wipeSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
