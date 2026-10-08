/* eslint-disable @typescript-eslint/no-explicit-any */
// Persistent dungeon generation and state. Dungeons never silently regenerate; they can be re-occupied.
import { D } from "./data";
import { hashStr, seeded, stream } from "./rng";
import { pickRoom } from "./director";
import { record, timeline, today } from "./campaign";
import type { DNode, Dungeon, GameState } from "./types";

const HUMAN_FACTIONS = ["bandits", "goblins", "cult"];
export function createDungeon(S: GameState, o: { id: string; name: string; region: string; template: string; level: number; procedural?: boolean }): Dungeon {
  const t = D.templates[o.template];
  const seed = hashStr(`${S.seed}:${o.id}`);
  const r = seeded(seed);
  const layers = 7;
  const rows: number[] = [1];
  for (let l = 1; l < layers - 1; l++) rows.push(r.chance(0.5) ? 2 : 3);
  rows.push(1);
  const nodes: DNode[] = [];
  const idOf = (l: number, i: number) => `${o.id}:${l}:${i}`;
  const placed: string[] = [];
  for (let l = 0; l < layers; l++) {
    const used: string[] = [];
    for (let i = 0; i < rows[l]; i++) {
      let type = l === 0 ? "entrance" : l === layers - 1 ? "boss" : pickRoom(S, r, l, used, { prisoner: HUMAN_FACTIONS.includes(t.faction) });
      if (type === "merchant" && placed.includes("merchant")) type = "combat";
      used.push(type); placed.push(type);
      nodes.push({ id: idOf(l, i), layer: l, row: i, type, x: l / (layers - 1), y: (i + 1) / (rows[l] + 1), next: [], done: l === 0, seed: r.int(1, 1e9), data: {} });
    }
  }
  const need = (type: string, l: number) => { if (!nodes.some((n) => n.type === type)) { const c = nodes.find((n) => n.layer === l && !["boss", "entrance", "rest"].includes(n.type)); if (c) c.type = type; } };
  need("rest", 5); need("treasure", 3); need("lore", 2);
  if (HUMAN_FACTIONS.includes(t.faction)) need("prisoner", 4);
  // edges
  for (let l = 0; l < layers - 1; l++) {
    const a = nodes.filter((n) => n.layer === l), b = nodes.filter((n) => n.layer === l + 1);
    a.forEach((n, i) => {
      const j = Math.round((i * (b.length - 1)) / Math.max(1, a.length - 1));
      n.next.push(b[Math.min(b.length - 1, j)].id);
      if (b.length > 1 && r.chance(0.5)) { const k = Math.max(0, Math.min(b.length - 1, j + (r.chance(0.5) ? 1 : -1))); if (!n.next.includes(b[k].id)) n.next.push(b[k].id); }
    });
    for (const nb of b) if (!a.some((n) => n.next.includes(nb.id))) a.reduce((best, n) => (Math.abs(n.row / a.length - nb.row / b.length) < Math.abs(best.row / a.length - nb.row / b.length) ? n : best), a[0]).next.push(nb.id);
  }
  // secret room (hidden until discovered)
  const sl = r.int(2, 4);
  const from = nodes.filter((n) => n.layer === sl - 1)[0], to = nodes.filter((n) => n.layer === sl + 1)[0];
  if (from && to) {
    const sec: DNode = { id: idOf(sl, 9), layer: sl, row: 9, type: "secret", x: sl / (layers - 1), y: 0.92, next: [to.id], done: false, hidden: true, seed: r.int(1, 1e9), data: {} };
    nodes.push(sec); from.next.push(sec.id);
  }
  const know = t.knowledge.map((k: any) => ({ text: k.text, effect: k.effect, found: false }));
  const d: Dungeon = {
    id: o.id, name: o.name, region: o.region, template: o.template, seed, biome: t.biome, theme: t.theme, faction: t.faction, boss: t.boss, level: o.level, nodes, pos: nodes[0].id,
    knowledge: know, cleared: false, clearedDay: -1, visits: 0, reoccupied: 0, discovered: false, destroyed: false, procedural: !!o.procedural,
  };
  S.dungeons[o.id] = d;
  return d;
}
export function initDungeons(S: GameState) {
  for (const reg of D.regions) reg.dungeons.forEach((dg: any, i: number) => createDungeon(S, { id: dg.id, name: dg.name, region: reg.id, template: dg.template, level: reg.level_min + i }));
}
export const regionDungeons = (S: GameState, region: string) => Object.values(S.dungeons).filter((d) => d.region === region);
export const node = (d: Dungeon, id: string) => d.nodes.find((n) => n.id === id)!;
export function reachable(d: Dungeon): DNode[] {
  const cur = node(d, d.pos);
  const out: DNode[] = [];
  if (!cur.done) out.push(cur);
  else for (const id of cur.next) { const n = node(d, id); if (!n.hidden) out.push(n); }
  return out;
}
export function revealSecrets(d: Dungeon): boolean {
  const s = d.nodes.find((n) => n.hidden);
  if (s) { s.hidden = false; return true; }
  return false;
}
export function reoccupy(S: GameState, d: Dungeon) {
  const r = stream("world");
  const facs = ["bandits", "goblins", "cult", "wildlife"].filter((f) => f !== d.faction);
  const nf = r.pick(facs);
  const tmplFor: Record<string, string[]> = { bandits: ["bandit_hideout"], goblins: ["goblin_warren"], cult: ["cult_sanctum"], wildlife: ["spider_den"] };
  const tm = D.templates[r.pick(tmplFor[nf])];
  d.faction = nf; d.boss = tm.boss; d.theme = tm.theme; d.cleared = false; d.clearedDay = -1; d.reoccupied++;
  d.pos = d.nodes[0].id;
  for (const n of d.nodes) {
    if (["combat", "elite", "boss"].includes(n.type)) { n.done = false; n.data = { ...n.data, enemies: undefined, alert: false }; }
    if (n.type === "boss") n.type = "elite";
  }
  d.nodes[d.nodes.length - 1 < 0 ? 0 : 0].done = true;
  const msg = `${D.factionMap[nf].name} have moved into ${d.name}. The layout is familiar, the inhabitants are not.`;
  timeline(S, msg, "world"); record(S, "dungeon_reoccupied", { location: d.id, actor: nf, tags: ["world", "reoccupation"], direct: [msg] });
  if (S.world[d.region]) S.world[d.region].changes.push(msg);
  return msg;
}
/** When a region's dungeons are all cleared, new ones are generated (infinite content, persistent once created). */
export function maybeGenerateProcedural(S: GameState, region: string): Dungeon | null {
  const ds = regionDungeons(S, region);
  if (ds.some((d) => !d.cleared)) return null;
  const reg = D.regionMap[region];
  const r = stream("world");
  const p = D.procedural;
  const n = ds.filter((d) => d.procedural).length + 1;
  const name = `The ${r.pick(p.adj)} ${r.pick(p.noun)}`;
  const level = Math.max(reg.level_min, S.player.level) + 1 + Math.floor(n / 3);
  const tm = r.pick(p.templates) as string;
  const id = `px_${region}_${n}`;
  if (S.dungeons[id]) return null;
  const d = createDungeon(S, { id, name, region, template: tm, level, procedural: true });
  timeline(S, `Scouts report a new danger in ${reg.name}: ${name}.`, "world");
  void today;
  return d;
}
