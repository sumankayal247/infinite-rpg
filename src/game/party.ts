/* eslint-disable @typescript-eslint/no-explicit-any */
// Companions: loyalty, trust, morale, reactions, camp scenes. Owns party state.
import { D } from "./data";
import { deriveStats } from "./engine";
import { newCharacter, refreshAbilities, mkItem } from "./progression";
import { stream } from "./rng";
import type { Character, Companion, GameState } from "./types";

export function companionChar(p: Companion): Character {
  const ch = newCharacter(p.classId, p.name);
  const cls = D.classMap[p.classId];
  ch.level = p.level;
  const pts = (p.level - 1) * 2;
  const main = cls.cast_attr;
  ch.attrs[main as "STR"] += Math.ceil(pts / 2);
  ch.attrs.VIT += Math.floor(pts / 2);
  ch.inventory.forEach((i) => { if (D.items[i.id].slot) i.up = Math.floor(p.level / 3); });
  refreshAbilities(ch);
  return ch;
}
export function companionMaxHp(p: Companion) { return deriveStats(companionChar(p)).maxHp; }
export function availableCompanions(S: GameState) {
  return D.npcT.companions.filter((c: any) => !S.party.some((p) => p.id === c.id));
}
export function recruit(S: GameState, id: string): { ok: boolean; msg: string } {
  const t = D.npcT.companions.find((c: any) => c.id === id);
  if (!t) return { ok: false, msg: "Unknown companion." };
  if (S.party.filter((p) => p.status === "active").length >= 2) return { ok: false, msg: "Your party is full (2 companions)." };
  const ex = S.party.find((p) => p.id === id);
  if (ex && ex.status === "rival") return { ok: false, msg: `${ex.name} has become your rival and refuses.` };
  if (ex && ex.trust < 25) return { ok: false, msg: `${ex.name} does not trust you enough to return.` };
  if (ex) { ex.status = "active"; ex.concern = "Back with the party."; return { ok: true, msg: `${ex.name} rejoins the party.` }; }
  const level = Math.max(1, S.player.level - 1);
  const p: Companion = {
    id, name: t.name, classId: t.class, race: t.race, level, hp: 1, trust: 45, loyalty: 50, morale: 60, traits: t.traits, goal: t.goal, likes: t.likes, dislikes: t.dislikes,
    fears: t.fears, secret: t.secret, secretKnown: false, quest: t.quest, questState: "available", status: "active", concern: "Eager to prove themself.", relations: {}, joinedDay: Math.floor(S.hours / 24) + 1,
  };
  p.hp = companionMaxHp(p);
  S.party.push(p);
  return { ok: true, msg: `${p.name} joins your party!` };
}
export function syncParty(S: GameState) {
  for (const p of S.party) {
    p.level = Math.max(p.level, Math.max(1, S.player.level - 1));
    p.hp = Math.min(p.hp, companionMaxHp(p));
  }
}
/** Companions react to player behavior tags (theft, mercy, violence, bribery, lie, honor...). */
export function reactToAction(S: GameState, tag: string): string[] {
  const msgs: string[] = [];
  for (const p of S.party.filter((q) => q.status === "active")) {
    const dis = p.dislikes.some((d) => d.includes(tag) || tag.includes(d));
    const lik = p.likes.some((d) => d.includes(tag) || tag.includes(d));
    if (dis) { p.trust = Math.max(0, p.trust - 5); p.morale = Math.max(0, p.morale - 4); p.concern = `Disapproves of your ${tag}.`; msgs.push(`${p.name} frowns. (−trust)`); }
    else if (lik) { p.trust = Math.min(100, p.trust + 4); p.morale = Math.min(100, p.morale + 3); msgs.push(`${p.name} approves. (+trust)`); }
    if (p.trust < 15 && p.status === "active") {
      p.status = p.trust < 5 ? "rival" : "left";
      msgs.push(`${p.name} confronts you and ${p.status === "rival" ? "walks away, now your rival" : "leaves the party"}.`);
    }
  }
  return msgs;
}
export function campScene(S: GameState): string[] {
  const r = stream("camp");
  const out: string[] = [];
  for (const p of S.party.filter((q) => q.status === "active")) {
    p.trust = Math.min(100, p.trust + 3); p.morale = Math.min(100, p.morale + 6); p.loyalty = Math.min(100, p.loyalty + 1);
    if (!p.secretKnown && p.trust >= 60 && r.chance(0.6)) {
      p.secretKnown = true;
      out.push(`${p.name} confides: "${p.secret}"`);
      p.questState = "active";
    } else if (r.chance(0.5)) {
      out.push(`${p.name} talks about ${p.goal.toLowerCase()}. Trust grows.`);
    }
  }
  if (S.party.filter((q) => q.status === "active").length === 2) {
    const [a, b] = S.party;
    const clash = a.dislikes.some((d) => b.likes.includes(d)) || b.dislikes.some((d) => a.likes.includes(d));
    if (clash && r.chance(0.5)) { a.morale -= 5; b.morale -= 5; out.push(`${a.name} and ${b.name} argue about values. You mediate; tensions linger.`); }
  }
  return out;
}
export { mkItem };
