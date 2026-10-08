/* eslint-disable @typescript-eslint/no-explicit-any */
// Data-driven content loader. All rules/items/enemies live in /assets/data/*.json
export const D: any = {
  loaded: false,
  rules: {},
  classes: [],
  classMap: {},
  feats: [],
  featMap: {},
  items: {},
  abilities: {},
  enemies: {},
  conditions: {},
  loot: {},
  biomes: {},
  regions: [],
  regionMap: {},
  templates: {},
  procedural: {},
  roomTypes: {},
  factions: [],
  factionMap: {},
  npcT: {},
  quests: [],
  worldEvents: {},
  threads: [],
  encounters: {},
  fallback: {},
};

const FILES = [
  "rules", "classes", "items", "abilities", "enemies", "conditions", "loot", "locations",
  "dungeon_templates", "factions", "npc_templates", "quest_templates", "encounter_templates", "fallback",
];

export async function loadData(): Promise<void> {
  if (D.loaded) return;
  const res = await Promise.all(FILES.map((f) => fetch(`/assets/data/${f}.json`).then((r) => r.json())));
  const j: Record<string, any> = {};
  FILES.forEach((f, i) => (j[f] = res[i]));
  initData(j);
}

export function initData(j: Record<string, any>) {
  D.rules = j.rules;
  D.classes = j.classes.classes;
  D.feats = j.classes.feats;
  D.classMap = Object.fromEntries(D.classes.map((c: any) => [c.id, c]));
  D.featMap = Object.fromEntries(D.feats.map((c: any) => [c.id, c]));
  D.items = Object.fromEntries(j.items.map((i: any) => [i.id, i]));
  D.abilities = Object.fromEntries(j.abilities.map((a: any) => [a.id, a]));
  D.enemies = Object.fromEntries(j.enemies.map((e: any) => [e.id, e]));
  D.conditions = j.conditions;
  D.loot = j.loot;
  D.biomes = j.locations.biomes;
  D.regions = j.locations.regions;
  D.regionMap = Object.fromEntries(D.regions.map((r: any) => [r.id, r]));
  D.templates = j.dungeon_templates.templates;
  D.procedural = j.dungeon_templates.procedural;
  D.roomTypes = j.dungeon_templates.room_types;
  D.factions = j.factions;
  D.factionMap = Object.fromEntries(j.factions.map((f: any) => [f.id, f]));
  D.npcT = j.npc_templates;
  D.quests = j.quest_templates.quests;
  D.worldEvents = Object.fromEntries(j.quest_templates.world_events.map((e: any) => [e.id, e]));
  D.threads = j.quest_templates.threads;
  D.scales = j.quest_templates.scales;
  D.rumorTemplates = j.quest_templates.rumor_templates;
  D.encounters = j.encounter_templates;
  D.fallback = j.fallback;
  D.loaded = true;
}
