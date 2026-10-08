/* eslint-disable @typescript-eslint/no-explicit-any */
// Three-layer GM memory: immediate scene, session summary, campaign facts. Compact canonical context for the AI.
import { D } from "./data";
import { calendar } from "./calendar";
import { deriveStats } from "./engine";
import { activeEvents } from "./events";
import type { GameState } from "./types";

const session: string[] = [];
export function noteSession(text: string) {
  session.push(text);
  if (session.length > 14) compressSession(null);
}
export function compressSession(S: GameState | null) {
  if (session.length <= 8) return;
  const old = session.splice(0, session.length - 6);
  if (S) S.summary = (S.summary + " " + old.join("; ")).slice(-700);
  else if (typeof window !== "undefined") (window as any).__sumPending = ((window as any).__sumPending ?? "") + " " + old.join("; ");
}
export function resetSession() { session.length = 0; }
export function sessionLines() { return session.slice(-8); }

const PR = { CRITICAL: 0, MAJOR: 1, IMPORTANT: 2, MINOR: 3, FLAVOR: 4 } as const;
export interface SceneInfo { kind: string; npcId?: string; location: string; participants?: string[]; objective?: string; recent?: string[]; intent?: string; engine?: string }
/** Compact canonical context contract. The AI must not receive unnecessary history. */
export function buildContext(S: GameState, sc: SceneInfo): any {
  const cal = calendar(S.hours);
  const d = deriveStats(S.player);
  const reg = S.world[S.loc.region];
  if ((window as any).__sumPending) { S.summary = (S.summary + (window as any).__sumPending).slice(-700); (window as any).__sumPending = ""; }
  const npc = sc.npcId ? S.npcs[sc.npcId] : undefined;
  const facts = [...S.facts].sort((a, b) => PR[a.priority] - PR[b.priority] || b.day - a.day);
  const relevant = facts.filter((f) => (npc && (f.object === npc.id || f.subject === npc.id)) || f.type === "death" || f.type === "destroyed").slice(0, 3);
  const important = facts.filter((f) => f.priority === "CRITICAL" || f.priority === "MAJOR").slice(0, 5);
  const dead = Object.values(S.npcs).filter((n) => !n.alive && n.known).slice(0, 5).map((n) => n.name);
  return {
    WORLD_STATE: reg ? { region: D.regionMap[S.loc.region]?.name, prosperity: Math.round(reg.prosperity), danger: Math.round(reg.danger), stability: Math.round(reg.stability), controller: reg.controller, events: activeEvents(S, S.loc.region).slice(0, 2).map((e) => e.name) } : {},
    CURRENT_TIME: cal.label,
    CURRENT_LOCATION: sc.location,
    PLAYER_STATE: { name: S.player.name, class: S.player.classId, level: S.player.level, hp: `${S.player.hp}/${d.maxHp}`, titles: S.titles.slice(-2), wounds: S.player.wounds },
    PARTY_STATE: S.party.filter((p) => p.status === "active").map((p) => ({ name: p.name, class: p.classId, trust: p.trust })),
    ACTIVE_QUESTS: S.quests.filter((q) => ["ACCEPTED", "IN_PROGRESS"].includes(q.state)).slice(0, 3).map((q) => q.title),
    RELEVANT_NPCS: npc ? [{ id: npc.id, name: npc.name, occupation: npc.occupation, traits: npc.traits, alive: npc.alive, memories: npc.memories.slice(-3), stance: npc.rel.trust }] : [],
    RELEVANT_FACTIONS: reg ? [reg.controller] : [],
    RECENT_EVENTS: S.ledger.slice(-4).map((l) => l.action),
    IMPORTANT_CAMPAIGN_FACTS: [...important, ...relevant].map((f) => f.text).slice(0, 7),
    DEAD_NPCS_DO_NOT_REVIVE: dead,
    SESSION_SUMMARY: S.summary.slice(-300),
    KNOWN_SECRETS: S.clues.slice(-3),
    CURRENT_SCENE: { kind: sc.kind, participants: sc.participants ?? [], objective: sc.objective ?? "", recent: (sc.recent ?? []).slice(-3) },
    PLAYER_INTENT: sc.intent ?? "",
    ENGINE_RESULT: sc.engine ?? "",
    HALLUCINATING: S.flags.hallucination > 0,
  };
}
