/* eslint-disable @typescript-eslint/no-explicit-any */
export type Attr = "STR" | "VIT" | "AGI" | "CHA" | "INT";
export const ATTRS: Attr[] = ["STR", "VIT", "AGI", "CHA", "INT"];
export type Attrs = Record<Attr, number>;
export type Mode = "normal" | "advantage" | "disadvantage";

export interface ItemInst { uid: string; id: string; qty: number; up: number; dur: number }
export interface Character {
  name: string; classId: string; subclass: string | null; level: number; xp: number;
  attrs: Attrs; points: number; hp: number; res: number; feats: string[]; featPicks: number;
  abilities: string[]; noncombat: string[]; wounds: string[]; gold: number;
  inventory: ItemInst[]; equip: { weapon?: string; armor?: string; trinket?: string };
  respecs: number; heir: number;
}
export interface Companion {
  id: string; name: string; classId: string; race: string; level: number; hp: number;
  trust: number; loyalty: number; morale: number; traits: string[]; goal: string; likes: string[]; dislikes: string[];
  fears: string[]; secret: string; secretKnown: boolean; quest: string; questState: string;
  status: "active" | "left" | "rival"; concern: string; relations: Record<string, number>; joinedDay: number;
}
export interface NpcRel { trust: number; respect: number; fear: number; affection: number; hostility: number; debt: number }
export interface Npc {
  id: string; name: string; race: string; occupation: string; traits: string[]; goals: string[]; fears: string[]; values: string[];
  region: string; faction: string; rel: NpcRel; greed: number; loyalty: number; fear: number; corruption: number;
  memories: string[]; secrets: string[]; quest: string; circumstance: string; alive: boolean; relations: Record<string, number>;
  template: string; lastEval: number; known: boolean;
}
export interface DNode {
  id: string; layer: number; row: number; type: string; x: number; y: number; next: string[];
  done: boolean; hidden?: boolean; seed: number; data: any;
}
export interface Dungeon {
  id: string; name: string; region: string; template: string; seed: number; biome: string; theme: string;
  faction: string; boss: string; level: number; nodes: DNode[]; pos: string; knowledge: { text: string; effect: string; found: boolean }[];
  cleared: boolean; clearedDay: number; visits: number; reoccupied: number; discovered: boolean; destroyed: boolean; procedural: boolean;
}
export interface RegionState {
  id: string; population: number; prosperity: number; danger: number; crime: number; stability: number;
  controller: string; dominant: string; conflicts: string[]; trade: string; resources: string[];
  discovered: string[]; destroyed: string[]; abandoned: string[]; changes: string[]; events: string[]; priceMod: number; unlocked: boolean;
  settlement: { name: string; wealth: number; safety: number; services: string[]; rumors: string[]; problems: string[]; merchants: number };
}
export interface WorldEvent {
  event_id: string; type: string; template: string; region_id: string; scheduled_day: number; participants: string[];
  conditions: string[]; consequences: { after: number; done: boolean; [k: string]: any }[];
  status: "scheduled" | "delayed" | "triggered" | "prevented" | "completed" | "failed" | "mutated";
  triggeredDay: number; name: string;
}
export interface FactionState {
  id: string; name: string; wealth: number; military: number; territory: string[]; allies: string[]; rivals: string[];
  objective: string; internal: number; opinion: number; player: number; leader: string; known: boolean; conflicts: string[];
}
export type QState = "OFFERED" | "ACCEPTED" | "IN_PROGRESS" | "BRANCHING" | "SUCCEEDED" | "FAILED" | "ABANDONED" | "EXPIRED";
export interface Quest {
  id: string; tid: string; title: string; desc: string; state: QState; kind: string; giver: string; region: string;
  dungeon?: string; faction: string; obj: { type: string; target: string; count: number; progress: number; room?: string; item?: string };
  reward: { gold: number; xp: number; rep: number }; deadline: number; accepted: number; resolved: number; outcome: string; thread?: string;
}
export interface Thread {
  id: string; title: string; region: string; factions: string[]; pressure: number; importance: number; scale: string;
  known: string[]; unknown: string[]; next: string[]; state: string; involvement: number; link_dungeon?: string; deadline: number; resolved: boolean;
}
export interface LedgerEntry {
  event_id: string; day: number; actor: string; action: string; location: string; targets: string[];
  tags: string[]; direct_consequences: string[]; possible_future_consequences: string[];
}
export interface Fact {
  fact_id: string; type: string; subject: string; object: string; value: number | string; source_event: string;
  confidence: number; priority: "CRITICAL" | "MAJOR" | "IMPORTANT" | "MINOR" | "FLAVOR"; text: string; day: number;
}
export interface Rumor { id: string; source: string; text: string; truth: "correct" | "exaggerated" | "incorrect" | "propaganda"; region: string; day: number; spread: string[] }
export interface Nemesis {
  id: string; name: string; enemyId: string; faction: string; level: number; hatred: number; respect: number; injuries: string[];
  history: string[]; defeats: number; escapes: number; weakness: string; objective: string; alive: boolean; region: string; lastSeen: number;
}
export interface DiceRec { day: number; label: string; d20: number[]; mode: Mode; mod: number; total: number; dc: number; success: boolean; crit?: boolean; fumble?: boolean }

export interface GameState {
  version: number; seed: number; mode: "normal" | "hardcore" | "legacy"; created: number;
  player: Character; party: Companion[]; hours: number;
  loc: { kind: "town" | "dungeon"; region: string; dungeon?: string };
  world: Record<string, RegionState>; dungeons: Record<string, Dungeon>;
  events: WorldEvent[]; factions: Record<string, FactionState>; npcs: Record<string, Npc>; quests: Quest[]; threads: Thread[];
  ledger: LedgerEntry[]; facts: Fact[]; rumors: Rumor[]; nemeses: Nemesis[];
  rep: { heroic: number; military: number; criminal: number; religious: number; political: number; merchant: number; adventurer: number; region: Record<string, number>; faction: Record<string, number> };
  wanted: Record<string, number>; codex: Record<string, string>; timeline: { day: number; text: string; kind: string }[];
  legend: { day: number; text: string }[]; titles: string[]; dice: DiceRec[]; clues: string[]; decisions: string[];
  flags: { hallucination: number; charm: boolean; reveal: boolean; translate: boolean; open: boolean; [k: string]: any };
  director: { recent: string[]; counts: Record<string, number>; sinceQuiet: number; sinceCombat: number; scale: number };
  stats: { kills: number; crits: number; socialWins: number; steals: number; combats: number; rooms: number; cleared: number; bossKills: number; deaths: number; revives: number };
  counters: Record<string, number>; summary: string; settings: { death: string };
}

export interface Meta {
  runs: number; bestLevel: number; bestDays: number; totalKills: number; shards: number; unlockedClasses: string[]; achievements: string[];
  markov: Record<string, Record<string, number>>; classPicks: Record<string, number>; errors: string[]; borders: string[];
  totals: { combats: number; crits: number; social: number; steals: number; cleared: number; revives: number; days: number };
  behavior: Record<string, number>;
}

export interface Settings { crt: boolean; textScale: number; typing: boolean; sound: boolean; music: boolean; ai: boolean; shake: boolean; border: string }
