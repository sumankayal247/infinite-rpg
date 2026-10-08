// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import { initData, D } from "../src/game/data";
const F = ["rules","classes","items","abilities","enemies","conditions","loot","locations","dungeon_templates","factions","npc_templates","quest_templates","encounter_templates","fallback"];
const j: any = {};
for (const f of F) j[f] = JSON.parse(fs.readFileSync(`public/assets/data/${f}.json`, "utf8"));
initData(j);
(async () => {
const { freshState } = await import("../src/game/controller");
const { buildCombat, advance, perform, endPlayerTurn, turnSpent, abilityStatus, unit, opponents, dist } = await import("../src/game/combat");
const { composeEncounter } = await import("../src/game/encounter");
const { stream } = await import("../src/game/rng");
const { gainXp } = await import("../src/game/progression");
const { advance: adv } = await import("../src/game/world");
const { auditState } = await import("../src/game/validator");
const { deriveStats } = await import("../src/game/engine");
const { addItem } = await import("../src/game/economy");

function playFight(S: any, d: any, kind: any) {
  const comp = composeEncounter(S, d, kind, stream("encounter"), false);
  const cs = buildCombat(S, comp.specs, { biome: d.biome, boss: kind === "boss" });
  const ev: any[] = [];
  advance(S, cs, ev, true);
  let guard = 0;
  while (!cs.over && guard++ < 300) {
    const h = unit(cs, "hero");
    if (cs.cur !== "hero") { advance(S, cs, ev); continue; }
    const foes = opponents(cs, h).filter((u) => !u.downed);
    const t = foes.sort((a, b) => dist(h, a) - dist(h, b))[0];
    if (!t) break;
    // policy
    const pot = S.player.inventory.find((i: any) => D.items[i.id].type === "potion" && D.items[i.id].effect.heal);
    if (h.hp < h.maxHp * 0.35 && pot && h.bonus) perform(S, cs, h, { type: "item", uid: pot.uid });
    let acted = false;
    const abs = h.abilities.filter((id: string) => abilityStatus(cs, h, id).ok && ["weapon","spell"].includes(D.abilities[id].kind) && D.abilities[id].action !== "bonus");
    const heal = h.abilities.find((id: string) => D.abilities[id].kind === "heal" && abilityStatus(cs, h, id).ok);
    if (heal && h.hp < h.maxHp * 0.5) { perform(S, cs, h, { type: "ability", ability: heal, target: "hero" }); acted = true; }
    if (!acted && abs.length) { const ev2 = perform(S, cs, h, { type: "ability", ability: abs[abs.length - 1], target: t.id }); acted = !ev2.some((e: any) => e.t === "deny"); }
    if (!acted) { const ev2 = perform(S, cs, h, { type: "attack", target: t.id }); acted = !ev2.some((e: any) => e.t === "deny"); }
    if (!acted) perform(S, cs, h, { type: "dash" });
    if (!cs.over) { const e = endPlayerTurn(S, cs); void e; }
  }
  return { cs, over: cs.over, hero: unit(cs, "hero"), rounds: cs.round };
}
for (const cls of ["warrior","rogue","mage","cleric","ranger","paladin"]) {
  for (const lvl of [1, 3, 6]) {
    let wins = 0, hpLeft = 0, rounds = 0; const N = 60;
    for (let i = 0; i < N; i++) {
      const S = freshState(cls, "T", "normal");
      gainXp(S.player, 30 * ((lvl*(lvl-1)*(2*lvl-1))/6)*1 + 1); // approx
      while (S.player.level > lvl) S.player.level--;
      S.player.level = lvl; S.player.points = 0;
      // distribute stat points
      const main = D.classMap[cls].cast_attr; S.player.attrs[main] += lvl; S.player.attrs.VIT += lvl;
      for (let k=0;k<lvl;k++) S.player.hp = deriveStats(S.player).maxHp;
      S.player.hp = deriveStats(S.player).maxHp; S.player.res = deriveStats(S.player).maxRes;
      const d = Object.values<any>(S.dungeons).find((x: any) => x.level <= lvl + 1 && x.region === "greenwood") as any;
      d.level = lvl;
      const r = playFight(S, d, "combat");
      if (r.over === "victory") { wins++; hpLeft += r.hero.hp / r.hero.maxHp; }
      rounds += r.rounds;
    }
    console.log(cls.padEnd(8), "L" + lvl, "win", (wins / N * 100).toFixed(0) + "%", "hp left", wins ? (hpLeft / wins * 100).toFixed(0) + "%" : "-", "rounds", (rounds / N).toFixed(1));
  }
}
// long-run
const S = freshState("warrior", "Sim", "normal");
const sizes: number[] = [];
const t0 = Date.now();
for (const days of [100, 500, 1000, 5000, 10000]) {
  const target = days * 24; 
  while (S.hours < target) adv(S, 24 * 5);
  const bad = auditState(S);
  const size = JSON.stringify(S).length;
  console.log("day", days, "size", size, "events", S.events.length, "npcs", Object.keys(S.npcs).length, "threads", S.threads.filter((t: any) => !t.resolved).length, "bad", bad.length, bad.slice(0,3).join(","), "ledger", S.ledger.length, "facts", S.facts.length, "recent", new Set(S.director.recent).size);
  sizes.push(size);
}
console.log("ms", Date.now() - t0);
process.exit(0);
})();
