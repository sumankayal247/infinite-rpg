/* eslint-disable @typescript-eslint/no-explicit-any */
// AI response schema validation + contradiction detection against canonical state.
import { D } from "./data";
import { sanitizeAiText } from "./security";
import type { GameState } from "./types";

export interface Verdict { ok: boolean; text: string; reason?: string }
const ALIVE_VERBS = /\b(says?|said|smiles?|grins?|laughs?|replies|nods?|shouts?|whispers?|greets?|walks?|stands?|waves?)\b/i;
const FORBIDDEN = /(automatically succeed|you (now )?(have|gain|receive|find) \d|level(s|ed)? up|your stats (increase|rise)|\+\d+ (str|vit|agi|cha|int)|permanently)/i;

export function findContradictions(S: GameState, text: string): string | null {
  const t = text.toLowerCase();
  for (const n of Object.values(S.npcs)) {
    if (n.alive) continue;
    const first = n.name.toLowerCase();
    const i = t.indexOf(first);
    if (i >= 0) {
      const near = text.slice(Math.max(0, i - 40), i + first.length + 60);
      if (ALIVE_VERBS.test(near) && !/(dead|corpse|body|late|memory|ghost|grave|remember|died|slain|killed)/i.test(near)) return `${n.name} is dead`;
    }
  }
  for (const d of Object.values(S.dungeons)) if (d.destroyed && t.includes(d.name.toLowerCase()) && /(intact|bustling|stands proud)/.test(t)) return `${d.name} is destroyed`;
  for (const r of Object.values(S.world)) if (r.destroyed.length && r.destroyed.some((x) => t.includes(x.toLowerCase())) && /(intact|bustling|thriving)/.test(t)) return "destroyed place described as intact";
  for (const q of S.quests) if (q.state === "SUCCEEDED" && t.includes(q.title.toLowerCase()) && /(still|remains) (active|unfinished|pending)/.test(t)) return "quest already completed";
  return null;
}
/** Numbers attached to gold/xp/damage must come from the engine result. */
export function findNumberHallucination(text: string, engine: string): string | null {
  const allowed = new Set((engine.match(/\d+/g) ?? []));
  const re = /(\d+)\s*(gold|coins?|gp|xp|experience|damage|hp|hit points?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (!allowed.has(m[1])) return `invented number ${m[1]} ${m[2]}`;
  return null;
}
export function validateNarration(S: GameState, raw: any, engine: string): Verdict {
  const text = sanitizeAiText(typeof raw === "string" ? raw : raw?.text, 360);
  if (text.length < 8) return { ok: false, text, reason: "too short" };
  if (FORBIDDEN.test(text)) return { ok: false, text, reason: "attempts to grant state" };
  const c = findContradictions(S, text); if (c) return { ok: false, text, reason: c };
  const n = findNumberHallucination(text, engine); if (n) return { ok: false, text, reason: n };
  return { ok: true, text };
}
export function validateFlavor(raw: any): { name: string; desc: string; theme: string; hostile: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const name = sanitizeAiText(raw.name, 36);
  const desc = sanitizeAiText(raw.desc, 160);
  const theme = D.fallback.themes.includes(raw.visual_theme ?? raw.theme) ? (raw.visual_theme ?? raw.theme) : "neutral";
  if (!name || !desc) return null;
  return { name, desc, theme, hostile: raw.is_hostile !== false };
}
/** Invariant sweep used by the long-run simulator and save/load tests. */
export function auditState(S: GameState): string[] {
  const bad: string[] = [];
  if (S.player.gold < 0) bad.push("gold<0");
  if (S.player.inventory.some((i) => i.qty <= 0)) bad.push("qty<=0");
  for (const q of S.quests) if (q.state === "SUCCEEDED" && q.obj.progress < q.obj.count && q.obj.type !== "gather") bad.push("quest-success-without-progress");
  for (const n of Object.values(S.npcs)) if (!n.alive && n.circumstance !== "dead") bad.push("dead-npc-alive-circumstance");
  for (const f of Object.values(S.factions)) if (f.wealth < 0 || f.wealth > 100 || f.military < 0 || f.military > 100) bad.push("faction-bounds");
  for (const r of Object.values(S.world)) if (r.prosperity < 0 || r.prosperity > 100) bad.push("region-bounds");
  return bad;
}
