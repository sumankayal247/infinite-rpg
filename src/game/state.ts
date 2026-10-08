/* eslint-disable @typescript-eslint/no-explicit-any */
// Encapsulated game state holder + UI store (module-scoped, not exposed on window) + stage bridge.
import type { GameState, Settings } from "./types";
import type { CEvent, CombatState } from "./combat";
import type { RollInfo } from "./engine";
import { defaultSettings } from "./save";

let S: GameState | null = null;
export const getS = (): GameState => S as GameState;
export const setS = (s: GameState | null) => { S = s; };
export const hasS = () => !!S;

export interface LogLine { id: number; text: string; cls: string; gm?: boolean }
export interface EventOpt { id: string; label: string; sub?: string; disabled?: boolean }
export interface EventState {
  title: string; desc: string; icon: string; options: EventOpt[]; stage: "choose" | "result"; result: string[]; narrative: string;
  freeform: boolean; thinking: boolean; success?: boolean; onDone?: () => void; npc?: string;
}
export interface ShopState { kind: "shop" | "smith" | "wander"; region: string; discount: number; surcharge: number; refuse: boolean; msg: string; tab: string; haggled: boolean; npc?: string }
export interface Victory { xp: number; gold: number; items: string[]; levelUps: string[]; titles: string[]; text: string; novelty: number }
export interface UIState {
  screen: "loading" | "menu" | "select" | "town" | "dungeon" | "combat" | "gameover";
  modal: string | null; paused: boolean; busy: boolean; log: LogLine[]; settings: Settings;
  combat: { cs: CombatState; target: string | null; menu: null | "item" | "more" | "free" } | null;
  event: EventState | null; dice: { roll: RollInfo; done: boolean } | null; toasts: { id: number; text: string; kind: string }[];
  shop: ShopState | null; victory: Victory | null; panel: string; drawer: boolean; gameOver: { reason: string; heir: boolean; lines: string[] } | null;
  ai: string; mapHint: string; pendingLevel: boolean; classPick: string; hallu: boolean; fast: boolean; loadingMsg: string; tavernTab: string; worldRegion: string;
}
export const ui: UIState = {
  screen: "loading", modal: null, paused: false, busy: false, log: [], settings: defaultSettings(), combat: null, event: null, dice: null, toasts: [], shop: null, victory: null,
  panel: "stats", drawer: false, gameOver: null, ai: "offline", mapHint: "", pendingLevel: false, classPick: "warrior", hallu: false, fast: false, loadingMsg: "Loading data…", tavernTab: "quests", worldRegion: "greenwood",
};

let rev = 0;
const listeners = new Set<() => void>();
let pending = false;
export function notify() {
  if (pending) return;
  pending = true;
  const run = () => { pending = false; rev++; listeners.forEach((l) => l()); };
  if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(run); else setTimeout(run, 0);
}
export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getRev = () => rev;

let lid = 1;
export function pushLog(text: string, cls = "", gm = false) {
  ui.log.push({ id: lid++, text, cls, gm });
  if (ui.log.length > 90) ui.log.splice(0, ui.log.length - 90); // prune stale chat nodes
  notify();
}
let tid = 1;
export function toast(text: string, kind = "info") {
  const id = tid++;
  ui.toasts.push({ id, text, kind });
  if (ui.toasts.length > 4) ui.toasts.shift();
  notify();
  setTimeout(() => { ui.toasts = ui.toasts.filter((t) => t.id !== id); notify(); }, 2600);
}

/** Bridge to the Phaser stage (assigned by scenes when ready). */
export const stage: {
  ready: boolean;
  scene: (name: "backdrop" | "map" | "combat", data?: any) => void;
  playEvent: (ev: CEvent) => Promise<void>;
  refresh: () => void;
  selectTarget: (id: string | null) => void;
  mapMove: (d: number) => void;
  mapConfirm: () => void;
  shake: (n?: number) => void;
  pauseGame: (p: boolean) => void;
} = {
  ready: false, scene: () => {}, playEvent: async () => {}, refresh: () => {}, selectTarget: () => {}, mapMove: () => {}, mapConfirm: () => {}, shake: () => {}, pauseGame: () => {},
};
