/* eslint-disable @typescript-eslint/no-explicit-any */
// Game flow orchestrator: boot, runs, dungeon navigation, combat loop, rewards, death. Rules live in the other modules.
import { D, loadData } from "./data";
import { getS, setS, ui, notify, pushLog, toast, stage } from "./state";
import { newCharacter, gainXp, pendingChoices, chooseSubclass, pickFeat, spendPoint, milestoneText } from "./progression";
import { advance as advanceWorld, initWorld, unlockRegions } from "./world";
import { initFactions } from "./factions";
import { initThreads, onDungeonCleared, pacingHint } from "./director";
import { initDungeons, node as dNode, reachable, maybeGenerateProcedural } from "./dungeon";
import { scheduleEvent, preventByClear } from "./events";
import { offerQuests, gatherCheck, progress as questProgress } from "./quest";
import { addFact, record, legend, timeline, checkTitles, today } from "./campaign";
import { seedAll, stream } from "./rng";
import { buildCombat, advance as combatAdvance, perform, endPlayerTurn, turnSpent, unit, improvise, type Action, type CEvent, type EnemySpec } from "./combat";
import { composeEncounter, combatRewards } from "./encounter";
import { addItem, itemName, removeItem } from "./economy";
import { deriveStats, rollDice, clamp } from "./engine";
import { saveGame, loadGame, wipeSave, loadSettings, saveSettings, hasSave } from "./save";
import { getMeta, saveMeta, recordChoice, endRun, checkAchievements, unlockAchievement, logError } from "./telemetry";
import { narrate, flavorEnemy, aiStatus, refreshAiAuth, connectAI, setAiEnabled, prefetchLikely, interpretAction } from "./ai";
import { unlockAudio, sfx, music, setAudioPrefs, preload, pauseMusic } from "./audio";
import { sanitizeInput } from "./security";
import { addRumor, bump } from "./reputation";
import { addWound, canResurrect, resurrect, makeHeir } from "./death";
import { reactToAction, syncParty } from "./party";
import { resetSession, noteSession } from "./narrative-memory";
import { addWanted } from "./crime";
import { resolveNode, afterRoom } from "./rooms";
import { resolveFreeform, type FreeCtx } from "./skills";
import { checkInvariants } from "./engine";
import type { GameState, Settings } from "./types";

let lastRun = { cls: "warrior", name: "Hero", mode: "normal" as GameState["mode"] };
let afterFight: ((r: "victory" | "fled" | "defeat") => void) | null = null;
export const setAfterFight = (f: typeof afterFight) => { afterFight = f; };
let lastChoice = "start";

// ---------- boot / settings ----------
export async function boot() {
  try {
    await loadData();
    ui.settings = loadSettings();
    applySettings();
    getMeta();
    await refreshAiAuth();
    ui.ai = aiStatus();
    ui.screen = "menu";
    stage.scene("backdrop", { bg: "title" });
  } catch (e) { logError("boot " + e); ui.loadingMsg = "Failed to load game data. Reload the page."; }
  notify();
}
export function applySettings() {
  setAudioPrefs(ui.settings.sound, ui.settings.music);
  setAiEnabled(ui.settings.ai);
  ui.ai = aiStatus();
}
export function updateSettings(p: Partial<Settings>) {
  ui.settings = { ...ui.settings, ...p };
  saveSettings(ui.settings); applySettings(); notify();
}
export async function connectGM() { await connectAI(); ui.ai = aiStatus(); notify(); toast(ui.ai === "ready" ? "AI Game Master connected" : "AI Game Master unavailable (offline narration)"); }
export async function refreshAI() { await refreshAiAuth(); ui.ai = aiStatus(); notify(); }
export function userGesture() { unlockAudio(); preload(); }

// ---------- state creation ----------
export function freshState(classId: string, name: string, mode: GameState["mode"]): GameState {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 12345;
  seedAll(seed);
  const S: GameState = {
    version: 1, seed, mode, created: Date.now(), player: newCharacter(classId, name), party: [], hours: 8, loc: { kind: "town", region: "greenwood" },
    world: {}, dungeons: {}, events: [], factions: {}, npcs: {}, quests: [], threads: [], ledger: [], facts: [], rumors: [], nemeses: [],
    rep: { heroic: 0, military: 0, criminal: 0, religious: 0, political: 0, merchant: 0, adventurer: 0, region: {}, faction: {} },
    wanted: {}, codex: {}, timeline: [], legend: [], titles: [], dice: [], clues: [], decisions: [],
    flags: { hallucination: 0, charm: false, reveal: false, translate: false, open: false },
    director: { recent: [], counts: {}, sinceQuiet: 0, sinceCombat: 0, scale: 0 },
    stats: { kills: 0, crits: 0, socialWins: 0, steals: 0, combats: 0, rooms: 0, cleared: 0, bossKills: 0, deaths: 0, revives: 0 },
    counters: {}, summary: "", settings: { death: mode },
  };
  initWorld(S); initFactions(S); initThreads(S); initDungeons(S);
  scheduleEvent(S, "bandit_raid", "greenwood", 9);
  scheduleEvent(S, "goblin_war", "greenwood", 15);
  offerQuests(S, "greenwood");
  addFact(S, { type: "start", subject: "player", object: "campaign", text: `${name} the ${classId} arrived in Redvale on day 1.`, priority: "CRITICAL" });
  timeline(S, `${name} arrives in Redvale.`, "start");
  return S;
}
export function startNewGame(classId: string, name: string, mode: GameState["mode"]) {
  userGesture();
  const m = getMeta();
  if (!m.unlockedClasses.includes(classId)) { toast("Class locked"); return; }
  if (hasSave()) { const old = loadGame(); if (old) endRun(old); }
  wipeSave();
  const nm = sanitizeInput(name, 18) || "Hero";
  lastRun = { cls: classId, name: nm, mode };
  const S = freshState(classId, nm, mode);
  setS(S);
  resetSession();
  ui.log = []; ui.combat = null; ui.event = null; ui.victory = null; ui.gameOver = null; ui.modal = null; ui.busy = false; ui.paused = false; ui.hallu = false;
  pushLog(`${nm} the ${D.classMap[classId].name} arrives in Redvale. The world is already moving…`, "gm", true);
  pushLog("Tip: ←/→ move, 1-9 actions, Space ends turn, Esc pauses. Tap enemies to target.", "sys");
  saveGame(S);
  goTown();
}
export function continueGame() {
  userGesture();
  const S = loadGame();
  if (!S) { toast("No save found"); return; }
  setS(S); resetSession();
  ui.log = []; ui.combat = null; ui.event = null; ui.gameOver = null; ui.modal = null; ui.busy = false; ui.paused = false;
  lastRun = { cls: S.player.classId, name: S.player.name, mode: S.mode };
  pushLog(`Welcome back, ${S.player.name}. Day ${today(S)}. The world did not wait.`, "gm", true);
  if (S.summary) pushLog("Last time: " + S.summary.slice(-160), "sys");
  goTown();
}
export function restartRun() {
  userGesture();
  startNewGame(lastRun.cls, lastRun.name, lastRun.mode);
}
export function toMenu() {
  const S = hasSaveState() ? getS() : null;
  if (S && ui.screen !== "gameover" && ui.screen !== "menu") saveGame(S);
  ui.screen = "menu"; ui.modal = null; ui.paused = false; ui.combat = null; ui.event = null; ui.busy = false;
  stage.scene("backdrop", { bg: "title" }); music("title"); notify();
}
const hasSaveState = () => { try { return !!getS(); } catch { return false; } };
export function autosave() { if (hasSaveState()) { checkInvariants(getS()); saveGame(getS()); } }
export function pauseToggle() {
  if (ui.screen === "menu" || ui.screen === "loading" || ui.screen === "gameover" || ui.screen === "select") return;
  if (ui.modal === "pause") { ui.modal = null; ui.paused = false; pauseMusic(false); }
  else if (!ui.modal) { ui.modal = "pause"; ui.paused = true; pauseMusic(true); }
  stage.pauseGame(ui.paused); notify();
}

// ---------- helpers ----------
export function handleNews(news: { text: string; region: string }[]) {
  for (const n of news.slice(0, 4)) pushLog("📜 " + n.text, "news");
  const S = getS();
  for (const m of unlockRegions(S)) { pushLog("🗺 " + m, "news"); toast(m, "good"); }
}
export function passTime(hours: number) {
  const S = getS();
  const t = advanceWorld(S, hours);
  handleNews(t.news);
  S.director.sinceQuiet++;
}
export function narrateAsync(kind: string, engine: string, vars: Record<string, string> = {}, fallbackKind?: string, intent?: string) {
  const S = getS();
  narrate(S, kind, { engine, scene: { kind, location: sceneName(), participants: [] }, vars, fallbackKind, intent }).then((t) => pushLog(t, "gm", true)).catch(() => {});
}
export const sceneName = () => {
  const S = getS();
  return S.loc.kind === "dungeon" ? S.dungeons[S.loc.dungeon!]?.name ?? "a dungeon" : `${D.regionMap[S.loc.region]?.name} (${S.world[S.loc.region]?.settlement.name})`;
};
export function codex(id: string, name: string) { getS().codex[id] = name; }
export function showLevelUps(ups: { level: number; text: string[] }[]): string[] {
  const out: string[] = [];
  for (const u of ups) {
    sfx("levelup"); toast(`LEVEL ${u.level}!`, "good");
    out.push(`Level ${u.level}! ${u.text.join(" · ")}`);
    const m = milestoneText(u.level); if (m) out.push("Milestone: " + m);
    legend(getS(), `Reached level ${u.level}.`);
  }
  if (ups.length) { syncParty(getS()); ui.pendingLevel = true; }
  return out;
}
export function giveXp(n: number): string[] {
  const out = showLevelUps(gainXp(getS().player, n));
  return out;
}
export function rewardAchievements() {
  for (const a of checkAchievements(getS())) { toast(`🏆 ${a.name} (+${a.shards} shards)`, "good"); pushLog(`🏆 Achievement: ${a.name} (+${a.shards} Legacy Shards)`, "news"); }
}

// ---------- level-up UI ops ----------
export function allocate(a: any) { if (spendPoint(getS().player, a)) { sfx("click"); notify(); } }
export function pickSub(id: string) { if (chooseSubclass(getS().player, id)) { sfx("levelup"); pushLog(`Subclass chosen: ${id}.`, "good"); notify(); } }
export function takeFeat(id: string) { if (pickFeat(getS().player, id)) { sfx("levelup"); pushLog(`Feat learned: ${D.featMap[id].name}.`, "good"); notify(); } }
export function closeLevelUp() { ui.pendingLevel = false; if (ui.modal === "levelup") ui.modal = null; autosave(); notify(); }
export const pendingNow = () => pendingChoices(getS().player);

// ---------- dungeon ----------
export function enterDungeon(id: string) {
  const S = getS();
  const d = S.dungeons[id];
  if (!d || d.region !== S.loc.region) return;
  d.visits++; d.discovered = true;
  S.loc = { kind: "dungeon", region: d.region, dungeon: id };
  ui.screen = "dungeon"; ui.modal = null; ui.event = null; ui.victory = null;
  stage.scene("map", { dungeonId: id });
  music("explore");
  codex("loc_" + id, d.name);
  pushLog(`You enter ${d.name}${d.reoccupied ? " — now held by " + D.factionMap[d.faction].name : ""}.`, "sys");
  for (const k of d.knowledge.filter((x) => x.found)) pushLog("💡 You recall: " + k.text, "good");
  narrateAsync("entrance", `Player enters ${d.name} (${d.theme})`, {}, "room.entrance");
  passTime(1);
  updateMapHint();
  notify();
  saveMeta();
}
export function updateMapHint() {
  const S = getS();
  const d = S.dungeons[S.loc.dungeon ?? ""];
  if (!d) return;
  const r = reachable(d);
  ui.mapHint = r.map((n) => D.roomTypes[n.type]?.label).join(" / ");
  const cands = r.filter((n) => ["combat", "elite"].includes(n.type)).map((n) => {
    const t = D.templates[d.template];
    const e = Object.values<any>(D.enemies).find((x) => !x.boss && !x.ally && x.biomes.includes(d.biome) && (t.families as string[]).includes(x.family));
    return { type: n.type, defId: e?.id, region: d.region, level: d.level, biome: d.biome };
  });
  prefetchLikely(S, lastChoice, cands);
}
export async function chooseNode(id: string) {
  const S = getS();
  if (ui.busy || ui.screen !== "dungeon" || ui.modal) return;
  const d = S.dungeons[S.loc.dungeon ?? ""];
  if (!d) return;
  const n = reachable(d).find((x) => x.id === id);
  if (!n) { toast("You can't reach that room yet."); return; }
  sfx("click");
  recordChoice(lastChoice, n.type); lastChoice = n.type;
  d.pos = n.id;
  S.director.sinceQuiet = ["combat", "elite", "boss"].includes(n.type) ? 0 : S.director.sinceQuiet + 1;
  ui.busy = true; stage.refresh(); notify();
  try { await resolveNode(d, n); } catch (e) { logError("node " + e); ui.busy = false; }
  ui.busy = false; notify();
}
export function retreat() {
  const S = getS();
  if (ui.busy || ui.screen !== "dungeon") return;
  pushLog("You retreat from the dungeon. Your progress is remembered.", "sys");
  passTime(6);
  goTown();
}
export function goTown() {
  const S = getS();
  S.loc = { kind: "town", region: S.loc.region };
  offerQuests(S, S.loc.region); gatherCheck(S);
  ui.screen = "town"; ui.combat = null; ui.event = null; ui.modal = null; ui.busy = false; ui.victory = null; ui.worldRegion = S.loc.region;
  const biome = D.biomes[D.regionMap[S.loc.region].biome];
  stage.scene("backdrop", { bg: biome.bg });
  music("explore");
  maybeGenerateProcedural(S, S.loc.region);
  rewardAchievements();
  autosave(); notify();
  if (ui.pendingLevel || pendingChoices(S.player).length) { ui.modal = "levelup"; notify(); }
}

// ---------- combat ----------
export async function startFight(d: any, n: any, kind: "combat" | "elite" | "boss" | "guards", label?: string): Promise<"victory" | "fled" | "defeat"> {
  const S = getS();
  const r = stream("encounter");
  const comp = composeEncounter(S, d, kind, r, !!n?.data?.alert);
  let specs: EnemySpec[] = comp.specs;
  // recurring nemesis: previously escaped enemies return stronger, legitimately
  const nem = S.nemeses.find((x) => x.alive && x.region === d.region);
  if (nem && kind !== "guards" && kind !== "boss" && stream("encounter").chance(0.25)) {
    specs = [{ id: nem.enemyId, level: nem.level + 1, name: nem.name, elite: true, nemesisId: nem.id }, ...specs.slice(0, 2)];
    pushLog(`${nem.name} has returned, hunting you. (${nem.history[nem.history.length - 1] ?? "Old grudge"})`, "bad");
  }
  const flavors = await Promise.all(specs.map((s) => (s.nemesisId || kind === "guards" ? Promise.resolve(null) : flavorEnemy(S, s.id, d.region, s.level, d.biome))));
  specs.forEach((s, i) => { const f = flavors[i]; if (f) { s.theme = f.theme; s.desc = f.desc; if (f.name && !D.enemies[s.id].boss) s.name = f.name; } });
  const know = d.knowledge?.filter((k: any) => k.found).map((k: any) => k.effect) ?? [];
  const cs = buildCombat(S, specs, { biome: d.biome, boss: kind === "boss", know, label: label ?? (kind === "boss" ? "Boss Battle" : "Battle"), canFlee: kind !== "boss" });
  for (const u of cs.units) if (u.kind === "enemy") codex("mon_" + u.defId, D.enemies[u.defId!].name);
  ui.combat = { cs, target: cs.units.find((u) => u.team === "enemy")?.id ?? null, menu: null };
  ui.screen = "combat"; ui.modal = null; ui.event = null; ui.busy = true;
  ui.hallu = S.flags.hallucination > 0;
  stage.scene("combat", { biome: d.biome });
  music(kind === "boss" ? "boss" : "combat");
  const hostile = cs.units.filter((u) => u.team === "enemy").map((u) => u.name).join(", ");
  pushLog(`⚔ ${cs.label}: ${hostile}${cs.know.length ? " — your knowledge gives you an edge!" : ""}`, "bad");
  for (const u of cs.units.filter((q) => q.team === "enemy" && q.desc).slice(0, 2)) pushLog(`${u.name}: ${u.desc}`, "sys");
  narrateAsync("combat_start", `Combat begins against ${hostile}`, {}, "combat_start");
  notify();
  await new Promise((res) => setTimeout(res, 350));
  const evs = combatAdvance(S, cs, [], true);
  await playEvents(evs);
  return new Promise((resolve) => {
    afterFight = (res) => resolve(res);
    if (cs.over) void finishCombat();
    else { ui.busy = false; notify(); }
  });
}
export async function playEvents(evs: CEvent[]) {
  const S = getS();
  for (const ev of evs) {
    switch (ev.t) {
      case "log": pushLog(ev.msg, ev.cls); break;
      case "deny": toast(ev.msg, "bad"); break;
      case "crit": if (ev.id === "hero") S.stats.crits++; await stage.playEvent(ev); break;
      case "revive": if (ev.id === "hero") { S.stats.revives++; rewardAchievements(); } await stage.playEvent(ev); break;
      default: await stage.playEvent(ev);
    }
  }
  const c = ui.combat;
  if (c) {
    const t = c.cs.units.find((u) => u.id === c.target);
    if (!t || t.dead) c.target = c.cs.units.find((u) => u.team === "enemy" && !u.dead)?.id ?? null;
    stage.selectTarget(c.target);
  }
  notify();
}
export function setTarget(id: string) {
  if (!ui.combat) return;
  const u = ui.combat.cs.units.find((x) => x.id === id);
  if (!u || u.dead || u.team !== "enemy") return;
  ui.combat.target = id; stage.selectTarget(id); sfx("click"); notify();
}
export function cycleTarget(dir = 1) {
  const c = ui.combat; if (!c) return;
  const es = c.cs.units.filter((u) => u.team === "enemy" && !u.dead);
  if (!es.length) return;
  const i = es.findIndex((u) => u.id === c.target);
  setTarget(es[(i + dir + es.length) % es.length].id);
}
export async function act(a: Action) {
  const S = getS();
  const c = ui.combat;
  if (!c || ui.busy || ui.paused || ui.modal) return;
  const cs = c.cs;
  if (cs.over) return;
  const hero = unit(cs, "hero");
  if (cs.cur !== "hero" || hero.downed || hero.dead) return;
  if (!a.target && ["attack", "ability", "shove", "grapple", "search", "item", "interact"].includes(a.type)) a.target = c.target ?? undefined;
  ui.busy = true; c.menu = null; notify();
  try {
    const evs = perform(S, cs, hero, a);
    const onlyDeny = evs.length > 0 && evs.every((e) => e.t === "deny");
    await playEvents(evs);
    if (onlyDeny) { ui.busy = false; notify(); return; }
    if (cs.over) { await finishCombat(); return; }
    if (a.type === "end" || (a.type !== "move" && turnSpent(S, cs, hero))) {
      await playEvents(endPlayerTurn(S, cs));
      if (cs.over) { await finishCombat(); return; }
    }
  } catch (e) { logError("act " + e); }
  ui.busy = false; notify();
}
export async function endTurn() { await act({ type: "end" }); }
/** Freeform improvisation in combat or exploration: AI proposes, engine decides. */
export async function improviseInCombat(text: string) {
  const S = getS();
  const c = ui.combat; if (!c || ui.busy) return;
  const cs = c.cs; const hero = unit(cs, "hero");
  if (cs.cur !== "hero" || hero.actions <= 0) { toast("You need an action to improvise."); return; }
  ui.busy = true; notify();
  const t = unit(cs, c.target ?? "");
  const ctx: FreeCtx = { inCombat: true, hasEnemy: true, allowed: ["clever", ...(cs.arena.hazards.length || cs.arena.surface ? ["environment_advantage"] : []), ...(t && (t.vuln.length || t.conds.some((k) => k.id === "exposed")) ? ["discovered_weakness"] : [])] };
  const raw = await interpretAction(S, text, { kind: "combat", location: sceneName(), participants: cs.units.filter((u) => !u.dead).map((u) => u.name), intent: text });
  const res = resolveFreeform(S, text, raw, ctx);
  if (res.cls === "IMPOSSIBLE" || !res.roll) { pushLog(`✖ ${res.reason}`, "bad"); toast("Impossible action — no roll consumed", "bad"); ui.busy = false; notify(); return; }
  await rollModal(res.roll);
  pushLog(`✎ "${sanitizeInput(text, 80)}" → ${res.cls}: ${res.proposal.intent} (${res.proposal.suggested_skill}) d20[${res.roll.d20.join(",")}]${res.roll.mod >= 0 ? "+" : ""}${res.roll.mod}=${res.roll.total} vs DC ${res.dc}${res.mods.length ? " [" + res.mods.join(", ") + "]" : ""} → ${res.success ? "SUCCESS" : "FAIL"}`, "roll");
  const evs = perform(S, cs, hero, { type: "improvise", proposal: { events: improvise(S, cs, hero, res.proposal.intent, res.success, res.roll.crit, c.target ?? undefined) } });
  narrateAsync("improvise", `Improvised ${res.proposal.intent}: ${res.success ? "success" : "failure"}`, { actor: hero.name }, res.success ? "success" : "failure", text);
  await playEvents(evs);
  if (cs.over) { await finishCombat(); return; }
  if (turnSpent(S, cs, hero)) { await playEvents(endPlayerTurn(S, cs)); if (cs.over) { await finishCombat(); return; } }
  ui.busy = false; notify();
}
export function rollModal(roll: any): Promise<void> {
  sfx("dice");
  ui.dice = { roll, done: false }; notify();
  return new Promise((resolve) => {
    let fin = false;
    const done = () => { if (fin) return; fin = true; ui.dice = null; notify(); resolve(); };
    diceResolve = done;
    setTimeout(() => { if (ui.dice) { ui.dice.done = true; sfx(roll.success ? "coin" : "miss"); notify(); } }, 850);
    setTimeout(done, 2400);
  });
}
let diceResolve: (() => void) | null = null;
export function diceContinue() { if (ui.dice && !ui.dice.done) { ui.dice.done = true; notify(); return; } diceResolve?.(); }

async function finishCombat() {
  const S = getS();
  const cs = ui.combat!.cs;
  const res = cs.over!;
  const hero = unit(cs, "hero");
  ui.busy = true; notify();
  S.stats.combats++;
  S.director.sinceCombat = 0;
  // sync persistent state
  S.player.hp = hero.dead ? 0 : Math.max(hero.hp, hero.downed ? 0 : 1);
  S.player.res = hero.resType === "rage" ? 0 : hero.res;
  for (const p of S.party.filter((q) => q.status === "active")) {
    const u = cs.units.find((x) => x.id === "comp_" + p.id);
    if (!u) continue;
    if (u.dead) { p.status = "left"; p.concern = "Fell in battle."; legend(S, `${p.name} fell in battle.`); pushLog(`${p.name} has fallen. Their story ends here.`, "bad"); S.party = S.party.filter((q) => q !== p); }
    else p.hp = Math.max(1, u.hp);
  }
  if (S.flags.hallucination > 0) S.flags.hallucination--;
  ui.hallu = S.flags.hallucination > 0;
  const heroWasDowned = hero.ds.s > 0 || hero.ds.f > 0 || hero.downed;
  if (res === "victory") {
    sfx("win");
    const rw = combatRewards(S, cs);
    S.player.gold = clamp(S.player.gold + rw.gold, 0, D.rules.gold_cap);
    const itemNames: string[] = [];
    for (const it of rw.items) { const inst = addItem(S, it.id, it.qty); if (inst) itemNames.push(`${D.items[it.id].name}${it.qty > 1 ? " ×" + it.qty : ""}`); }
    const lines = giveXp(rw.xp);
    const dead = cs.units.filter((u) => u.team === "enemy" && u.dead && u.kind === "enemy");
    S.stats.kills += dead.length;
    const d = S.dungeons[S.loc.dungeon ?? ""];
    for (const u of dead) {
      const def = D.enemies[u.defId!];
      for (const m of questProgress(S, "kill", { family: def.family })) pushLog(m, "good");
      if (def.boss) { S.stats.bossKills += 0; }
      const tags = ["violence", "kill_" + def.family, def.boss ? "boss_" + def.id : ""].filter(Boolean);
      record(S, "killed_" + def.id, { targets: [u.id], tags, direct: [`${u.name} slain`], future: def.family === "bandit" ? ["Gang may seek revenge"] : [] });
      if (def.boss) { legend(S, `Defeated ${u.name}.`); addFact(S, { type: "boss", subject: "player", object: def.id, text: `The player defeated ${u.name}.`, priority: "MAJOR" }); }
      if (u.nemesisId) { const n = S.nemeses.find((q) => q.id === u.nemesisId); if (n) { n.alive = false; n.defeats++; legend(S, `Finally slew the nemesis ${n.name}.`); } }
    }
    const fam = [...new Set(dead.map((u) => D.enemies[u.defId!].family))];
    bump(S, { axis: "adventurer", n: dead.length, region: S.loc.region, regionN: 1, ...(d ? { faction: "wardens", factionN: fam.some((f) => ["bandit", "goblin"].includes(f)) ? 1 : 0 } : {}) });
    if (dead.length >= 3) addRumor(S, { text: `a hero defeated ${dead.length} ${fam.join("/")} foes`, region: S.loc.region });
    // wounds from near-death
    if (heroWasDowned && stream("wound").chance(0.5)) { const w = addWound(S); if (w) { pushLog(`Wound sustained — ${w}`, "bad"); lines.push("Wound: " + w); } }
    S.stats.rooms += 0;
    const titles = checkTitles(S);
    S.stats.combats += 0;
    passTime(2);
    rewardAchievements();
    narrateAsync("victory", `Victory. Rewards: ${rw.gold} gold, ${rw.xp} XP`, {}, "victory");
    ui.victory = { xp: rw.xp, gold: rw.gold, items: itemNames, levelUps: lines, titles, text: "", novelty: 0 };
    ui.modal = "victory";
    restoreAfterCombat();
    ui.busy = false; notify();
    return;
  }
  if (res === "fled") {
    pushLog("You escape! The enemy remains, and it will remember you.", "bad");
    const d = S.dungeons[S.loc.dungeon ?? ""];
    const strongest = cs.units.filter((u) => u.team === "enemy" && !u.dead).sort((a, b) => b.maxHp - a.maxHp)[0];
    if (strongest && (strongest.elite || strongest.boss) && !S.nemeses.some((n) => n.enemyId === strongest.defId && n.alive)) {
      S.nemeses.push({ id: "nem_" + (S.nemeses.length + 1), name: strongest.name.replace("Elite ", ""), enemyId: strongest.defId!, faction: d?.faction ?? "wildlife", level: strongest.level, hatred: 40, respect: 20, injuries: [], history: [`You fled from ${strongest.name} on day ${today(S)}`], defeats: 0, escapes: 1, weakness: D.enemies[strongest.defId!].vuln?.[0] ?? "", objective: "Hunt the player", alive: true, region: S.loc.region, lastSeen: today(S) });
      pushLog(`${strongest.name} has become your nemesis.`, "bad");
    }
    record(S, "fled_battle", { tags: ["failure", "flee"], direct: ["The enemy holds the room and is alerted"], future: ["Nemesis may return"] });
    if (d) { const n = dNode(d, d.pos); n.data = { ...n.data, alert: true }; }
    restoreAfterCombat();
    const cb = afterFight; afterFight = null; ui.busy = false; ui.screen = S.loc.kind === "dungeon" ? "dungeon" : "town";
    stage.scene(S.loc.kind === "dungeon" ? "map" : "backdrop", { dungeonId: S.loc.dungeon, bg: D.biomes[D.regionMap[S.loc.region].biome].bg });
    music("explore"); cb?.("fled"); notify();
    return;
  }
  // defeat
  sfx("lose");
  S.stats.combats += 0;
  void handleDefeat(hero.dead);
}
function restoreAfterCombat() {
  const S = getS();
  // partial resource recovery between fights
  const d = deriveStats(S.player);
  const cls = D.classMap[S.player.classId];
  if (cls.resource.type !== "rage") S.player.res = Math.min(d.maxRes, S.player.res + Math.ceil(d.maxRes * 0.3));
  if (cls.resource.type === "energy") S.player.res = d.maxRes;
}
export function victoryContinue() {
  const S = getS();
  ui.victory = null; ui.modal = null;
  const cb = afterFight; afterFight = null;
  ui.screen = S.loc.kind === "dungeon" ? "dungeon" : "town";
  if (S.loc.kind === "dungeon" && S.dungeons[S.loc.dungeon ?? ""]?.nodes?.length) {
    stage.scene("map", { dungeonId: S.loc.dungeon, bg: D.biomes[D.regionMap[S.loc.region].biome].bg });
  } else {
    stage.scene("backdrop", { bg: D.biomes[D.regionMap[S.loc.region].biome].bg });
  }
  music("explore");
  ui.combat = null;
  if (pendingChoices(S.player).length) { ui.modal = "levelup"; }
  cb?.("victory");
  notify();
}
async function handleDefeat(dead: boolean) {
  const S = getS();
  if (dead) {
    S.stats.deaths += 0;
    if (S.mode === "normal" && canResurrect(S)) { ui.modal = "resurrect"; ui.busy = false; notify(); return; }
    gameOver("Your hero has fallen.");
    return;
  }
  // left for dead: fail forward
  const lost = Math.floor(S.player.gold * 0.25);
  S.player.gold -= lost;
  const w = addWound(S);
  S.player.hp = Math.max(1, Math.floor(deriveStats(S.player).maxHp * 0.4));
  S.player.res = 0;
  const reg = S.world[S.loc.region];
  if (reg) { reg.danger = clamp(reg.danger + 5, 0, 100); }
  const d = S.dungeons[S.loc.dungeon ?? ""];
  if (d) { const n = dNode(d, d.pos); n.data = { ...n.data, alert: true }; d.pos = d.nodes[0].id; }
  record(S, "defeated_in_battle", { tags: ["failure", "defeat"], direct: [`Left for dead; lost ${lost} gold`, w ?? ""], future: ["Enemies hold the room", "Survivors remember"] });
  legend(S, "Was left for dead, but survived.");
  pushLog(`You are left for dead. Scavengers take ${lost} gold. You wake days later in Redvale.${w ? " Wound: " + w : ""}`, "bad");
  addRumor(S, { text: "the adventurer was beaten and left for dead", region: S.loc.region, truth: "correct" });
  passTime(48);
  const cb = afterFight; afterFight = null; cb?.("defeat");
  ui.combat = null; ui.busy = false;
  goTown();
}
export async function doResurrect() {
  const S = getS();
  const lines = resurrect(S);
  for (const l of lines) pushLog(l, "good");
  S.player.res = 0;
  passTime(72);
  narrateAsync("resurrection", "The hero is resurrected at a heavy price.", {}, "success");
  ui.modal = null; ui.combat = null;
  const cb = afterFight; afterFight = null; cb?.("defeat");
  goTown();
}
export function declineResurrect() { ui.modal = null; gameOver("Your hero has fallen."); }
export function gameOver(reason: string) {
  const S = getS();
  const lines = [`Level ${S.player.level} ${D.classMap[S.player.classId].name}`, `Survived ${today(S)} days`, `${S.stats.kills} foes slain · ${S.stats.bossKills} bosses`, `${S.stats.cleared} dungeons cleared`];
  const legacy = S.mode === "legacy";
  endRun(S);
  if (legacy) { makeHeir(S); lines.push(`${S.player.name} will inherit part of your legend.`); saveGame(S); }
  else wipeSave();
  ui.gameOver = { reason, heir: legacy, lines };
  ui.screen = "gameover"; ui.modal = null; ui.combat = null; ui.busy = false;
  music("title"); notify();
}
export function continueAsHeir() {
  const S = getS();
  ui.gameOver = null;
  S.loc = { kind: "town", region: "greenwood" };
  pushLog(`${S.player.name} takes up the mantle. The world remembers the one before.`, "gm", true);
  lastRun = { cls: S.player.classId, name: S.player.name, mode: S.mode };
  goTown();
}

// ---------- inventory outside combat ----------
export function useItemOutside(uid: string) {
  const S = getS();
  const inst = S.player.inventory.find((i) => i.uid === uid);
  const def = inst && D.items[inst.id];
  if (!inst || def?.type !== "potion") return;
  const e = def.effect;
  const d = deriveStats(S.player);
  if (e.heal) { const h = rollDice(stream("combat"), e.heal).total; S.player.hp = Math.min(d.maxHp, S.player.hp + h); pushLog(`You drink ${def.name}: +${h} HP.`, "good"); sfx("heal"); }
  else if (e.resource) { S.player.res = Math.min(d.maxRes, S.player.res + e.resource); pushLog(`You drink ${def.name}.`, "good"); }
  else if (e.flag) { S.flags[e.flag] = e.value; pushLog("The world begins to swim and shimmer…", "sys"); }
  else if (e.cure) pushLog(`You drink ${def.name}.`, "good");
  else { toast("Best used in battle."); return; }
  removeItem(S, uid, 1);
  notify();
}
export { itemName, reactToAction, noteSession, addWanted, unlockAchievement, pacingHint, preventByClear, onDungeonCleared };
