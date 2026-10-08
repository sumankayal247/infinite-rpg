// @ts-nocheck
import fs from "fs";
import { initData, D } from "../src/game/data";
const F = ["rules","classes","items","abilities","enemies","conditions","loot","locations","dungeon_templates","factions","npc_templates","quest_templates","encounter_templates","fallback"];
const j: any = {}; for (const f of F) j[f] = JSON.parse(fs.readFileSync(`public/assets/data/${f}.json`, "utf8"));
initData(j);
const store: any = {}; (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] };
process.on("unhandledRejection", (e) => { console.log("UNHANDLED", e); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const C = await import("../src/game/controller");
  const R = await import("../src/game/rooms");
  const T = await import("../src/game/town");
  const { ui, getS } = await import("../src/game/state");
  const { combatActions } = await import("../src/components/actions");
  const { unit } = await import("../src/game/combat");
  const { auditState } = await import("../src/game/validator");
  const { saveGame, loadGame } = await import("../src/game/save");
  for (const cls of ["warrior", "mage", "rogue", "cleric", "ranger", "paladin"]) {
    C.startNewGame(cls, "Bot", "normal");
    let S = getS();
    let steps = 0, clears = 0, deaths = 0;
    const seen: any = {};
    while (steps++ < 3500 && ui.screen !== "gameover" && clears < 3) {
      S = getS();
      if (ui.dice) { C.diceContinue(); await sleep(1); continue; }
      if (ui.modal === "victory") { C.victoryContinue(); await sleep(1); continue; }
      if (ui.modal === "resurrect") { await C.doResurrect(); continue; }
      if (ui.modal === "levelup") { const p = S.player; while (p.points > 0) { C.allocate(["STR","VIT","AGI","CHA","INT"][p.points % 5]); } if (p.level >= 3 && !p.subclass) C.pickSub(D.classMap[p.classId].subclasses[0].id); if (p.featPicks > 0) { const { featOptions } = await import("../src/game/progression"); C.takeFeat(featOptions(p)[0].id); } C.closeLevelUp(); continue; }
      if (ui.modal === "event" && ui.event) {
        if (ui.event.stage === "result") { await R.eventContinue(); }
        else if (!ui.busy) { const o = ui.event.options.find((x) => !x.disabled); seen[ui.event.title] = 1; if (Math.random() < 0.3 && ui.event.freeform) await R.freeformSubmit("I try to convince them I am a royal messenger"); else if (o) await R.eventOption(o.id); }
        await sleep(2); continue;
      }
      if (ui.modal === "shop" || ui.modal === "smith") { if (ui.shop.kind === "shop") { T.doHaggle?.("my good sir, a fair price for a loyal customer"); } T.closeShop(); continue; }
      if (ui.modal) { ui.modal = null; continue; }
      if (ui.screen === "town") { if (S.player.hp < 15 || S.player.wounds.length) { T.inn(); } const ds = Object.values<any>(S.dungeons).filter((d) => d.region === S.loc.region && !d.cleared); if (!ds.length) { console.log("no dungeons in", S.loc.region); break; } C.enterDungeon(ds[0].id); await sleep(2); continue; }
      if (ui.screen === "dungeon" && !ui.busy) {
        const { reachable } = await import("../src/game/dungeon"); const d = S.dungeons[S.loc.dungeon];
        const wasCleared = d.cleared; const r = reachable(d);
        if (S.player.hp < S.player.hp * 0 + 8) { C.retreat(); continue; }
        if (!r.length) { C.retreat(); continue; }
        C.chooseNode(r[0].id); await sleep(3); if (d.cleared && !wasCleared) clears++; continue;
      }
      if (ui.screen === "combat" && ui.combat && !ui.busy) {
        const cs = ui.combat.cs; const h = unit(cs, "hero");
        if (cs.cur === "hero" && !cs.over) {
          const acts = combatActions().filter((a) => a.enabled && a.group === "main");
          const pick = acts.filter((a) => a.label !== "Item" && a.label !== "Defend");
          const hp = h.hp / h.maxHp;
          if (hp < 0.35) { const it = acts.find((a) => a.label === "Item"); if (it) { S.player.inventory.filter((i) => D.items[i.id].type === "potion" && D.items[i.id].effect.heal).slice(0, 1).forEach((i) => C.act({ type: "item", uid: i.uid })); await sleep(1); continue; } }
          const a = h.actions > 0 ? (pick[pick.length - 1] ?? acts[0]) : null;
          if (a) { a.run(); } else await C.endTurn();
          await sleep(1); continue;
        }
      }
      await sleep(2);
    }
    S = getS();
    const bad = auditState(S);
    saveGame(S); const L = loadGame();
    console.log(cls.padEnd(8), "steps", steps, "screen", ui.screen, "lvl", S.player.level, "day", Math.floor(S.hours / 24) + 1, "gold", S.player.gold, "rooms", S.stats.rooms, "kills", S.stats.kills, "cleared", S.stats.cleared, "quests", S.quests.length, "audit", bad.join(",") || "ok", "reload", L ? "ok" : "FAIL", "events seen", Object.keys(seen).length);
    if (ui.screen === "gameover") { ui.screen = "menu"; }
  }
  process.exit(0);
})();
