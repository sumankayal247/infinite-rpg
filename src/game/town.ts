/* eslint-disable @typescript-eslint/no-explicit-any */
// Settlement services: shop (haggle/steal), blacksmith, inn, healer, shrine, tavern (quests/rumors/recruits), world travel.
import { D } from "./data";
import { getS, ui, notify, pushLog, toast, stage } from "./state";
import { buyItem, sellItem, shopStock, repairItem, upgradeItem, equipItem, unequipSlot, addItem, tierCap } from "./economy";
import { haggle, playerCheck, shopTheftDc } from "./skills";
import { npcFor } from "./npc";
import { addWanted, lawResponse, jail, payFine, fineAmount } from "./crime";
import { deriveStats, clamp } from "./engine";
import { campScene, recruit } from "./party";
import { healWounds, woundCost } from "./death";
import { respec, respecCost } from "./progression";
import { accept, abandon, turnIn, gatherCheck, offerQuests } from "./quest";
import { rumorsHere, bump } from "./reputation";
import { record, today } from "./campaign";
import { stream } from "./rng";
import { regionPath, travelDays, regionUnlocked } from "./map";
import { sfx } from "./audio";
import { rollModal, passTime, giveXp, goTown, autosave, narrateAsync, startFight, enterDungeon } from "./controller";
import { shopClosed } from "./rooms";
import { regionDungeons } from "./dungeon";
import { composeEncounter } from "./encounter";
import { reactToAction } from "./party";

export function openShop(kind: "shop" | "smith" | "wander", region?: string) {
  const S = getS();
  const reg = region ?? S.loc.region;
  const npc = npcFor(S, kind === "smith" ? "smith" : "merchant", reg);
  npc.known = true;
  ui.shop = { kind, region: reg, discount: 0, surcharge: kind === "wander" ? 0.15 : 0, refuse: false, msg: `${npc.name} eyes you. "Looking to ${kind === "smith" ? "work metal" : "trade"}?"`, tab: kind === "smith" ? "repair" : "buy", haggled: false, npc: npc.id };
  ui.modal = kind === "smith" ? "smith" : "shop";
  passTime(0);
  notify();
}
export function closeShop() {
  ui.modal = null; ui.shop = null; notify();
  if (getS().loc.kind === "dungeon") shopClosed();
}
export const shopInfo = () => { const S = getS(); return ui.shop ? { stock: shopStock(S, ui.shop.region).slice(0, ui.shop.kind === "wander" ? 6 : 40) } : { stock: [] as string[] }; };
export function buy(id: string) {
  const S = getS(); const sh = ui.shop!;
  if (sh.refuse) { toast("The merchant refuses to trade with you."); return; }
  const disc = sh.discount - sh.surcharge;
  const r = buyItem(S, id, sh.region, disc);
  sh.msg = r.msg; if (r.ok) sfx("coin"); else sfx("miss"); notify();
}
export function sell(uid: string) {
  const S = getS(); const sh = ui.shop!;
  if (sh.refuse) { toast("The merchant refuses to trade with you."); return; }
  const r = sellItem(S, uid, sh.region, 1);
  sh.msg = r.msg; if (r.ok) sfx("coin"); notify();
}
export async function doHaggle(text: string) {
  const S = getS(); const sh = ui.shop!;
  if (sh.haggled) { toast("You've already haggled here."); return; }
  const npc = sh.npc ? S.npcs[sh.npc] : null;
  ui.busy = true; notify();
  const h = haggle(S, npc, text);
  await rollModal(h.roll);
  sh.haggled = true; sh.discount = h.discount; sh.surcharge += h.surcharge; sh.refuse = h.refuse;
  sh.msg = h.refuse ? "The merchant throws up their hands: no deal today!" : h.discount ? `Success! A ${Math.round(h.discount * 100)}% discount.` : "The merchant isn't impressed. Prices rise slightly.";
  S.stats.socialWins += h.discount ? 1 : 0;
  ui.busy = false; notify();
}
export async function stealFromShop(id: string) {
  const S = getS(); const sh = ui.shop!;
  const npc = sh.npc ? S.npcs[sh.npc] : null;
  const def = D.items[id];
  ui.busy = true; notify();
  const roll = playerCheck(S, "Steal (AGI)", "AGI", shopTheftDc(S, def.tier, npc), { tag: "theft" });
  await rollModal(roll);
  if (roll.success) {
    addItem(S, id, 1); S.stats.steals++; bump(S, { axis: "criminal", n: 3, region: sh.region, regionN: -2 });
    sh.msg = `You pocket ${def.name} unnoticed!`; sfx("coin");
    record(S, "stole_item", { targets: [id], tags: ["theft", "crime"], direct: [def.name] });
    for (const m of reactToAction(S, "theft")) pushLog(m, "sys");
    if (npc) { npc.memories.push("had an item stolen (unsolved)"); }
  } else {
    addWanted(S, sh.region, roll.fumble ? 2 : 1, "was caught stealing from a shopkeeper");
    if (npc) { npc.rel.trust = clamp(npc.rel.trust - 30, -100, 100); npc.rel.hostility = clamp(npc.rel.hostility + 25, -100, 100); npc.memories.push("caught the player stealing"); }
    const resp = S.loc.kind === "town" ? lawResponse(S, sh.region) : "fine";
    if (resp === "fine") { const f = fineAmount(S, sh.region); const p = payFine(S, sh.region); sh.msg = `Caught! The guards fine you ${f}g (paid ${p.paid}g).`; }
    else if (resp === "jail") { const j = jail(S, sh.region); passTime(j.days * 24); sh.msg = `Caught and jailed for ${j.days} days.`; }
    else {
      sh.msg = "Caught! Guards charge in!";
      ui.busy = false; closeShop();
      const d = regionDungeons(S, sh.region)[0];
      const res = await startFight(d, null, "guards", "Town Guard");
      void res; void composeEncounter;
      if (ui.screen === "town") goTown();
      return;
    }
    sfx("miss");
  }
  ui.busy = false; notify();
}
export function doRepair(uid: string) { const r = repairItem(getS(), uid); ui.shop!.msg = r.msg; if (r.ok) sfx("coin"); notify(); }
export function doUpgrade(uid: string) { const r = upgradeItem(getS(), uid); ui.shop!.msg = r.msg; if (r.ok) { sfx("levelup"); stage.shake(2); } notify(); }
export function doEquip(uid: string) { pushLog(equipItem(getS(), uid), "sys"); sfx("click"); notify(); }
export function doUnequip(slot: "weapon" | "armor" | "trinket") { unequipSlot(getS(), slot); notify(); }

// ---------- town services ----------
export function inn() {
  const S = getS();
  const cost = Math.round(D.rules.price.rest_inn * (1 + S.player.level * 0.3) * (S.world[S.loc.region].priceMod));
  if (S.player.gold < cost) { toast(`A bed costs ${cost}g.`, "bad"); return; }
  S.player.gold -= cost;
  const m = deriveStats(S.player);
  S.player.hp = m.maxHp; S.player.res = m.maxRes;
  for (const p of S.party) p.hp = 9999;
  S.player.wounds = S.player.wounds.filter((w) => w === "scarred");
  passTime(10);
  pushLog(`You sleep at the inn (${cost}g). HP and resources restored.`, "good");
  for (const l of campScene(S)) pushLog(l, "gm", true);
  sfx("heal"); autosave(); notify();
}
export function healer() {
  const S = getS();
  if (!S.world[S.loc.region].settlement.services.includes("healer")) { toast("No healer here."); return; }
  const c = woundCost(S);
  if (!S.player.wounds.length) { toast("You have no wounds."); return; }
  if (S.player.gold < c) { toast(`Treatment costs ${c}g.`, "bad"); return; }
  S.player.gold -= c; healWounds(S); pushLog(`The healer treats a wound (${c}g).`, "good"); sfx("heal"); passTime(4); notify();
}
export function shrineRespec() {
  const S = getS();
  const r = respec(S);
  pushLog(r.msg, r.ok ? "good" : "bad");
  if (r.ok) { ui.modal = "levelup"; sfx("levelup"); }
  notify();
}
export const respecPrice = () => respecCost(getS());
export function tavernRecruit(id: string) {
  const r = recruit(getS(), id); pushLog(r.msg, r.ok ? "good" : "bad"); toast(r.msg, r.ok ? "good" : "bad"); notify();
}
export function acceptQuest(id: string) { const m = accept(getS(), id); toast(m); pushLog(m, "sys"); sfx("click"); notify(); }
export function abandonQuest(id: string) { const m = abandon(getS(), id); if (m) pushLog(m, "bad"); notify(); }
export function completeQuest(id: string, choice: "honor" | "ransom" = "honor") {
  const S = getS();
  const r = turnIn(S, id, choice);
  for (const m of r.msgs) pushLog(m, "good");
  if (r.xp) for (const l of giveXp(r.xp)) pushLog(l, "good");
  sfx("coin"); autosave(); notify();
}
export function openTavern() { const S = getS(); offerQuests(S, S.loc.region); gatherCheck(S); ui.modal = "tavern"; ui.tavernTab = "quests"; notify(); }
export function rumorList(): string[] {
  const S = getS();
  const r = rumorsHere(S, S.loc.region).map((x) => `${x.text}${x.truth === "correct" ? "" : x.truth === "exaggerated" ? " (they say it was far worse)" : " (hard to believe)"}`);
  const fb = stream("cosmetic").pick(D.fallback.rumors as string[]);
  return [...r, fb];
}
// ---------- world travel ----------
export function regionInfo(id: string) {
  const S = getS();
  const reg = D.regionMap[id];
  return { reg, st: S.world[id], unlocked: regionUnlocked(S, id), days: travelDays(S.loc.region, id), here: S.loc.region === id };
}
export async function travelTo(id: string) {
  const S = getS();
  if (id === S.loc.region) { toast("You are already here."); return; }
  if (!regionUnlocked(S, id)) { toast(`Requires level ${D.regionMap[id].level_min}.`, "bad"); return; }
  const path = regionPath(S.loc.region, id);
  const days = path.length - 1;
  ui.modal = null; ui.busy = true; notify();
  pushLog(`You set out for ${D.regionMap[id].name} (${days} day${days > 1 ? "s" : ""}).`, "sys");
  narrateAsync("travel", `Travel from ${D.regionMap[S.loc.region].name} to ${D.regionMap[id].name}`, {}, "travel");
  const r = stream("travel");
  const ambush = r.chance(0.3);
  passTime(days * D.rules.hours.travel_per_region);
  S.loc = { kind: "town", region: id };
  S.world[id].unlocked = true;
  S.world[id].discovered.push(S.world[id].settlement.name);
  record(S, "travelled", { location: id, tags: ["travel"], direct: [`Arrived in ${D.regionMap[id].name}`] });
  if (ambush) {
    pushLog("⚠ Ambush on the road!", "bad");
    const d = regionDungeons(S, id)[0] ?? regionDungeons(S, S.loc.region)[0];
    await startFight(d, null, "combat", "Road Ambush");
    if (ui.screen === "gameover") return;
  } else if (r.chance(0.4)) {
    const found = r.int(4, 14) + S.player.level * 2;
    S.player.gold += found;
    pushLog(`On the road you find a lost purse (${found}g) and a quiet campfire. A peaceful journey.`, "good");
  }
  ui.busy = false;
  goTown();
}
export { enterDungeon, tierCap, today, healWounds };
