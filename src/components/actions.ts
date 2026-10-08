/* eslint-disable @typescript-eslint/no-explicit-any */
import { D } from "@/game/data";
import { getS, ui } from "@/game/state";
import { abilityStatus, unit, opponents } from "@/game/combat";
import { act } from "@/game/controller";

export interface Act { key: string; label: string; sub?: string; icon: string; enabled: boolean; why?: string; run: () => void; group: "main" | "more" }
const RES_ICON: Record<string, string> = { rage: "🔥", energy: "⚡", mana: "💧", charges: "✦", stamina: "🍃" };

export function combatActions(): Act[] {
  const c = ui.combat;
  if (!c) return [];
  const cs = c.cs;
  const S = getS();
  const hero = unit(cs, "hero");
  const turn = cs.cur === "hero" && !hero.downed && !hero.dead && !ui.busy && !cs.over;
  const foes = opponents(cs, hero).length > 0;
  const out: Act[] = [];
  let n = 1;
  const add = (a: Omit<Act, "key">, key?: string) => out.push({ ...a, key: key ?? String(n++) });
  add({ group: "main", icon: "⚔", label: "Attack", sub: hero.wpn.range > 1 ? "ranged" : "melee", enabled: turn && hero.actions > 0 && foes, run: () => act({ type: "attack" }) });
  for (const id of hero.abilities) {
    const ab = D.abilities[id];
    const st = abilityStatus(cs, hero, id);
    add({ group: "main", icon: ab.action === "bonus" ? "◆" : "✨", label: ab.name, sub: `${ab.cost || "free"}${ab.cost ? RES_ICON[hero.resType] ?? "" : ""}${ab.action === "bonus" ? " · bonus" : ""}`, enabled: turn && st.ok, why: st.why || ab.desc, run: () => act({ type: "ability", ability: id }) });
  }
  add({ group: "main", icon: "🛡", label: "Defend", sub: "+AC", enabled: turn && hero.actions > 0, run: () => act({ type: "defend" }) });
  const potions = S.player.inventory.filter((i) => D.items[i.id]?.type === "potion");
  add({ group: "main", icon: "🧪", label: "Item", sub: `${potions.reduce((s, i) => s + i.qty, 0)} potions`, enabled: turn && potions.length > 0, run: () => { c.menu = c.menu === "item" ? null : "item"; } });
  const more: [string, string, string, boolean, () => void, string][] = [
    ["z", "Dash", "🏃", hero.actions > 0, () => act({ type: "dash" }), "extra movement"],
    ["x", "Disengage", "↩", hero.actions > 0, () => act({ type: "disengage" }), "no opportunity attacks"],
    ["c", "Hide", "👁", hero.actions > 0, () => act({ type: "hide" }), "advantage on next attack"],
    ["v", "Shove", "💥", (hero.actions > 0 || (hero.tags.includes("shield_master") && hero.bonus)) && foes, () => act({ type: "shove" }), "push foe 2 squares (into hazards!)"],
    ["b", "Search", "🔍", hero.actions > 0 && foes, () => act({ type: "search" }), "find weakness"],
    ["g", "Grapple", "🤼", hero.actions > 0 && foes, () => act({ type: "grapple" }), "restrain a foe"],
    ["n", "Ready", "⏳", hero.actions > 0, () => act({ type: "ready" }), "reaction strike"],
    ["m", "Interact", "🔥", hero.actions > 0 && cs.arena.props.includes("brazier") && !cs.arena.brazier, () => act({ type: "interact" }), "kick over a brazier"],
    ["h", "Help", "🤝", hero.actions > 0 && cs.units.some((u) => u.team === "player" && u.id !== "hero" && !u.dead && !u.downed), () => act({ type: "help" }), "grant ally advantage"],
    ["f", "Flee", "🚪", hero.actions > 0 && cs.canFlee, () => act({ type: "flee" }), "escape the fight"],
    ["i", "Improvise", "✎", hero.actions > 0 && foes, () => { c.menu = c.menu === "free" ? null : "free"; }, "describe your own action"],
  ];
  if (hero.tags.includes("second_wind")) more.push(["w", "Second Wind", "💚", hero.bonus && !hero.windUsed, () => act({ type: "second_wind" }), "heal 1d10+lvl"]);
  for (const [k, label, icon, ok, run, sub] of more) add({ group: "more", icon, label, sub, enabled: turn && ok, run }, k);
  return out;
}
