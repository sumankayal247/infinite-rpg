/* eslint-disable @typescript-eslint/no-explicit-any */
// Puter.js integration: the Game Master brain. Narrates only; never an authoritative state owner.
import { D } from "./data";
import { stream } from "./rng";
import { buildContext, noteSession, sessionLines, type SceneInfo } from "./narrative-memory";
import { sanitizeInput } from "./security";
import { validateFlavor, validateNarration } from "./validator";
import { logError, markovPredict } from "./telemetry";
import type { GameState } from "./types";

declare global { interface Window { puter?: any } }
export const THEME_HUE: Record<string, number> = { fire: 0, ice: 195, poison: 105, shadow: 270, holy: 48, storm: 225, blood: 345, neutral: -1 };

let failures = 0;
let enabled = true;
let connected = false;
export function setAiEnabled(v: boolean) { enabled = v; }
export function aiStatus(): "off" | "offline" | "ready" | "disconnected" {
  if (!enabled) return "off";
  if (typeof window === "undefined" || !window.puter?.ai?.chat) return "offline";
  if (failures >= 3) return "offline";
  return connected ? "ready" : "disconnected";
}
export async function refreshAiAuth() {
  try { connected = !!(window.puter?.auth?.isSignedIn?.()); } catch { connected = false; }
  return connected;
}
export async function connectAI(): Promise<boolean> {
  try {
    await window.puter.auth.signIn();
    connected = true; failures = 0;
  } catch (e) { logError("puter signIn: " + String(e)); connected = false; }
  return connected;
}
const ready = () => aiStatus() === "ready";

function extractText(res: any): string {
  if (typeof res === "string") return res;
  const c = res?.message?.content ?? res?.content ?? res?.text;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x: any) => x?.text ?? "").join("");
  return "";
}
export function extractJSON(text: string): any | null {
  const s = text.indexOf("{");
  if (s < 0) return null;
  let depth = 0;
  for (let i = s; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) { try { return JSON.parse(text.slice(s, i + 1)); } catch { return null; } }
  }
  return null;
}
async function chatJSON(prompt: string, ms: number): Promise<any | null> {
  if (!ready()) return null;
  try {
    const res = await Promise.race([
      window.puter.ai.chat(prompt, { model: "gpt-4o-mini" }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
    ]);
    const j = extractJSON(extractText(res));
    if (!j) throw new Error("bad json");
    failures = 0;
    return j;
  } catch (e) {
    failures++;
    logError("ai: " + String((e as Error)?.message ?? e));
    return null;
  }
}
const SYSTEM = `You are the Game Master of a dark fantasy RPG. You ONLY narrate. You NEVER decide dice, damage, gold, XP, items, stats, or whether anything succeeds: the ENGINE_RESULT is final truth. Use only facts from CONTEXT. Never revive anyone in DEAD_NPCS_DO_NOT_REVIVE. Never invent past player actions. Do not state numbers for gold, XP or damage unless they appear in ENGINE_RESULT. Respond ONLY with strict JSON.`;

// ---------- Fallback narration (offline cache) ----------
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
export function fallbackNarration(kind: string, v: Record<string, string> = {}): string {
  const n = D.fallback.narration;
  const r = stream("cosmetic");
  const found: string[] | undefined = kind.startsWith("room.") ? n.room[kind.slice(5)] : n[kind];
  const pool: string[] = found?.length ? found : n.success;
  return fill(r.pick(pool), { actor: v.actor ?? "they", target: v.target ?? "the foe", action: v.action ?? "the move" });
}
export async function narrate(S: GameState, kind: string, o: { engine: string; scene: SceneInfo; vars?: Record<string, string>; fallbackKind?: string; intent?: string }): Promise<string> {
  const fb = () => (S.flags.hallucination > 0 ? fallbackNarration("hallucination") + " " : "") + fallbackNarration(o.fallbackKind ?? kind, o.vars);
  if (!ready()) { const t = fb(); noteSession(o.engine.slice(0, 80)); return t; }
  const ctx = buildContext(S, { ...o.scene, engine: o.engine, intent: o.intent ? sanitizeInput(o.intent) : undefined, recent: sessionLines() });
  const prompt = `${SYSTEM}\nCONTEXT: ${JSON.stringify(ctx)}\nTASK: Narrate this ${kind} in 1-2 vivid sentences. ${S.flags.hallucination > 0 ? "The player is hallucinating: describe it bizarrely. " : ""}Return {"text":"..."}`;
  const j = await chatJSON(prompt, 3500);
  if (j) {
    const v = validateNarration(S, j, o.engine);
    if (v.ok) { noteSession(v.text.slice(0, 80)); return v.text; }
    logError("narration rejected: " + v.reason);
  }
  return fb();
}
// ---------- Enemy flavor + speculative prefetch ----------
const cache = new Map<string, { t: number; v: any }>();
function gc() {
  const now = Date.now();
  for (const [k, e] of cache) if (now - e.t > 180000) cache.delete(k);
  while (cache.size > 8) cache.delete(cache.keys().next().value as string);
}
export interface Flavor { name?: string; desc: string; theme: string }
export function localFlavor(S: GameState, defId: string, biomeTheme: string): Flavor {
  const def = D.enemies[defId];
  const pool: string[] = D.fallback.enemy_flavor[def.family] ?? D.fallback.enemy_flavor.default;
  const themeByFamily: Record<string, string> = { undead: "shadow", cult: "shadow", elemental: biomeTheme === "frost" ? "ice" : "fire", spider: "poison", ooze: "poison", rift: "shadow", dragon: "fire", construct: "fire" };
  const th = themeByFamily[def.family] ?? (biomeTheme === "frost" ? "ice" : biomeTheme === "ember" ? "fire" : "neutral");
  return { desc: stream("cosmetic").pick(pool), theme: def.boss ? th : th };
}
export async function flavorEnemy(S: GameState, defId: string, region: string, level: number, biome: string): Promise<Flavor> {
  const key = `fl:${defId}:${region}`;
  const hit = cache.get(key);
  if (hit) { cache.delete(key); return hit.v; }
  const base = localFlavor(S, defId, biome);
  if (!ready()) return base;
  const def = D.enemies[defId];
  const prompt = `${SYSTEM}\nCONTEXT: ${JSON.stringify({ region: D.regionMap[region]?.name, level, creature_kind: def.name, family: def.family, themes: D.fallback.themes })}\nTASK: Give a short evocative flavor for this ${def.name}. Respond ONLY JSON: {"name":"string (<=30 chars, include the kind)","desc":"string (<=120 chars)","visual_theme":"one of ${D.fallback.themes.join("|")}","is_hostile":true}`;
  const j = await Promise.race([chatJSON(prompt, 1800), new Promise<null>((r) => setTimeout(() => r(null), 1900))]);
  const v = validateFlavor(j);
  if (v) return { name: def.boss ? undefined : v.name, desc: v.desc, theme: v.theme };
  return base;
}
let inflight = 0;
/** Speculative prefetch: a local Markov chain over past choices decides *which* node outcome to warm up. */
export function prefetchLikely(S: GameState, prevChoice: string, candidates: { type: string; defId?: string; region: string; level: number; biome: string }[]) {
  if (!ready() || inflight >= 1) return;
  const pred = markovPredict(prevChoice);
  if (!pred || pred.p < 0.5) return;
  const c = candidates.find((x) => x.type === pred.choice && x.defId);
  if (!c) return;
  const key = `fl:${c.defId}:${c.region}`;
  if (cache.has(key)) return;
  inflight++;
  flavorEnemyRaw(S, c.defId!, c.region, c.level).then((v) => { if (v) { cache.set(key, { t: Date.now(), v }); gc(); } }).finally(() => { inflight--; });
}
async function flavorEnemyRaw(S: GameState, defId: string, region: string, level: number): Promise<Flavor | null> {
  const def = D.enemies[defId];
  const prompt = `${SYSTEM}\nCONTEXT: ${JSON.stringify({ region: D.regionMap[region]?.name, level, creature_kind: def.name, themes: D.fallback.themes })}\nTASK: Respond ONLY JSON: {"name":"string","desc":"string","visual_theme":"string","is_hostile":true}`;
  const j = await chatJSON(prompt, 4000);
  const v = validateFlavor(j);
  return v ? { name: v.name, desc: v.desc, theme: v.theme } : null;
}
export function clearAiCache() { cache.clear(); }
// ---------- Freeform interpretation ----------
export async function interpretAction(S: GameState, text: string, scene: SceneInfo): Promise<any | null> {
  const clean = sanitizeInput(text);
  const prompt = `${SYSTEM}\nCONTEXT: ${JSON.stringify(buildContext(S, { ...scene, intent: clean }))}\nTASK: Interpret PLAYER_INTENT into a structured proposal. You do NOT decide success. Respond ONLY JSON: {"intent":"persuade|intimidate|deceive|steal|lockpick|climb|force|sneak|distract|search|arcane|riddle|attack|other","target_id":"string|null","approach":"short","suggested_skill":"STR|VIT|AGI|CHA|INT","risk_level":"low|medium|high|extreme","narrative_context":"short","modifiers":[]}`;
  return chatJSON(prompt, 3500);
}
