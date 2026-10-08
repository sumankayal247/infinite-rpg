"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { D } from "@/game/data";
import { getS, ui, notify } from "@/game/state";
import { deriveStats, xpToNext } from "@/game/engine";
import { calendar } from "@/game/calendar";
import { repLabel } from "@/game/reputation";
import { itemName } from "@/game/economy";
import { attitude } from "@/game/npc";
import { doEquip, doUnequip, abandonQuest } from "@/game/town";
import { useItemOutside } from "@/game/controller";
import { pressureLabel, activeThreads } from "@/game/director";
import { activeEvents } from "@/game/events";
import { wantedIn } from "@/game/crime";
import { ATTRS } from "@/game/types";

const TABS: [string, string][] = [["stats", "Stats"], ["inv", "Pack"], ["quest", "Journal"], ["world", "World"], ["party", "Party"], ["rel", "Bonds"], ["fac", "Factions"], ["time", "Timeline"], ["dice", "Dice"], ["codex", "Codex"]];
const Bar = ({ v, max, cls, label }: { v: number; max: number; cls: string; label?: string }) => (
  <div className={`bar ${cls}`} style={{ ["--w" as any]: `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%` }}><i /><span>{label ?? `${Math.round(v)}/${Math.round(max)}`}</span></div>
);
export { Bar };

export function SidePanel() {
  const S: any = getS();
  const tab = ui.panel;
  return (
    <>
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className="tab" data-on={tab === k ? 1 : 0} onClick={() => { ui.panel = k; notify(); }}>{l}</button>)}</div>
      <div className="pbody">
        {tab === "stats" && <Stats S={S} />}
        {tab === "inv" && <Inv S={S} />}
        {tab === "quest" && <Journal S={S} />}
        {tab === "world" && <World S={S} />}
        {tab === "party" && <Party S={S} />}
        {tab === "rel" && <Bonds S={S} />}
        {tab === "fac" && <Factions S={S} />}
        {tab === "time" && <div>{[...S.timeline].reverse().slice(0, 50).map((t: any, i: number) => <div key={i} className="row"><span className="gold">Day {t.day}</span><span style={{ flex: 1, marginLeft: 8 }}>{t.text}</span></div>)}{!S.timeline.length && <div className="dim">Nothing yet.</div>}</div>}
        {tab === "dice" && <div>{[...S.dice].reverse().map((d: any, i: number) => <div key={i} className="row"><span>{d.label}</span><span className={d.success ? "good" : "bad"}>[{d.d20.join(",")}]{d.mod >= 0 ? "+" : ""}{d.mod}={d.total} vs {d.dc} {d.crit ? "CRIT" : d.fumble ? "FUMBLE" : d.success ? "✔" : "✘"}</span></div>)}{!S.dice.length && <div className="dim">No checks rolled yet. Every roll is logged here.</div>}</div>}
        {tab === "codex" && <Codex S={S} />}
      </div>
    </>
  );
}
function Stats({ S }: { S: any }) {
  const p = S.player; const d = deriveStats(p); const cls = D.classMap[p.classId];
  const sc = p.subclass && cls.subclasses.find((s: any) => s.id === p.subclass);
  const need = xpToNext(p.level);
  return (
    <div>
      <div className="gold">{p.name} — Lv {p.level} {cls.name}{sc ? ` (${sc.name})` : ""}</div>
      {S.titles.length > 0 && <div className="dim">“{S.titles.slice(-2).join("”, “")}”</div>}
      <div style={{ margin: "6px 0" }}><Bar v={p.xp} max={need} cls="xp" label={`XP ${p.xp}/${need}`} /></div>
      <h4>Attributes</h4>
      {ATTRS.map((a) => <div className="row" key={a}><span>{a}</span><span>{p.attrs[a]} <span className="dim">({d.mods[a] >= 0 ? "+" : ""}{d.mods[a]})</span></span></div>)}
      {p.points > 0 && <div className="good">★ {p.points} unspent points</div>}
      <h4>Derived</h4>
      <div className="row"><span>Max HP</span><span>{d.maxHp}</span></div><div className="row"><span>Armor Class</span><span>{d.ac}</span></div>
      <div className="row"><span>Attack bonus</span><span>+{d.atk}</span></div><div className="row"><span>Weapon</span><span>{d.weapon.dice}{d.weapon.bonus >= 0 ? "+" : ""}{d.weapon.bonus} {d.weapon.dtype}</span></div>
      <div className="row"><span>Speed / Init</span><span>{d.speed} / {d.init >= 0 ? "+" : ""}{d.init}</span></div><div className="row"><span>Crit range</span><span>{d.critRange}-20</span></div>
      <h4>Gear</h4>
      {(["weapon", "armor", "trinket"] as const).map((s) => { const it = p.inventory.find((i: any) => i.uid === p.equip[s]); const def = it && D.items[it.id]; return <div className="row" key={s}><span>{s}: {it ? itemName(it) : "—"}{def?.durability ? <span className={it.dur <= 0 ? "bad" : "dim"}> ({it.dur}/{def.durability})</span> : null}</span>{it && <button className="btn sm" onClick={() => doUnequip(s)}>×</button>}</div>; })}
      {p.wounds.length > 0 && <><h4>Wounds</h4>{p.wounds.map((w: string) => { const x = D.rules.wounds.find((q: any) => q.id === w); return <div key={w} className="bad">{x?.name}: {x?.desc}</div>; })}</>}
      {p.feats.length > 0 && <><h4>Feats</h4>{p.feats.map((f: string) => <div key={f}><span className="gold">{D.featMap[f].name}</span> <span className="dim">{D.featMap[f].desc}</span></div>)}</>}
      <h4>Resource</h4><div>{cls.resource.type}: {p.res}/{d.maxRes}</div>
      <button className="btn sm alt" style={{ marginTop: 8 }} onClick={() => { ui.modal = "levelup"; notify(); }}>Build / Level-up</button>
    </div>
  );
}
function Inv({ S }: { S: any }) {
  const inCombat = ui.screen === "combat";
  const items = [...S.player.inventory].sort((a: any, b: any) => (D.items[a.id].type > D.items[b.id].type ? 1 : -1));
  return (
    <div>
      <div className="gold">Gold: {S.player.gold}g</div>
      {items.map((it: any) => { const def = D.items[it.id]; const eq = Object.values(S.player.equip).includes(it.uid); return (
        <div key={it.uid} className="row" style={{ alignItems: "flex-start" }}>
          <span><span className={def.rarity === "rare" || def.rarity === "epic" ? "gold" : ""}>{itemName(it)}</span>{it.qty > 1 ? ` ×${it.qty}` : ""}{eq ? <span className="pill good">E</span> : null}<br /><span className="dim">{def.desc}{def.durability ? ` · ${it.dur}/${def.durability}` : ""}</span></span>
          <span>{def.slot && !eq && <button className="btn sm" onClick={() => doEquip(it.uid)}>Equip</button>}{def.type === "potion" && !inCombat && <button className="btn sm good" onClick={() => useItemOutside(it.uid)}>Use</button>}</span>
        </div>); })}
    </div>
  );
}
function Journal({ S }: { S: any }) {
  const act = S.quests.filter((q: any) => ["ACCEPTED", "IN_PROGRESS", "BRANCHING"].includes(q.state));
  const done = S.quests.filter((q: any) => ["SUCCEEDED", "FAILED", "ABANDONED", "EXPIRED"].includes(q.state)).slice(-10).reverse();
  const day = calendar(S.hours).dayAbs;
  return (
    <div>
      <h4>Active quests</h4>
      {!act.length && <div className="dim">None. Visit the tavern board.</div>}
      {act.map((q: any) => <div key={q.id} style={{ marginBottom: 6 }}><div className="gold">{q.title} <span className="pill">{q.state}</span></div><div className="dim">{q.desc}</div><div>{q.obj.type === "gather" || q.obj.count > 1 ? `Progress ${q.obj.progress}/${q.obj.count}` : q.outcome === "ready" ? "Objective complete" : "In progress"} · due day {q.deadline} ({q.deadline - day}d){q.outcome === "ready" && <span className="good"> · turn in at tavern</span>}</div>{ui.screen === "town" && <button className="btn sm danger" onClick={() => abandonQuest(q.id)}>Abandon</button>}</div>)}
      <h4>Story threads</h4>
      {activeThreads(S).map((t: any) => <div key={t.id} style={{ marginBottom: 4 }}><span className="gold">{t.title}</span> <span className="pill">{D.scales.indexOf(t.scale) >= 0 ? t.scale : "LOCAL"}</span> <span className="pill">{pressureLabel(t.pressure)} {Math.round(t.pressure)}</span><div className="dim">{t.known[t.known.length - 1]}</div></div>)}
      <h4>Clues</h4>{S.clues.slice(-6).reverse().map((c: string, i: number) => <div key={i} className="dim">• {c}</div>)}{!S.clues.length && <div className="dim">None yet.</div>}
      <h4>Decisions</h4>{S.decisions.slice(-5).reverse().map((c: string, i: number) => <div key={i} className="dim">• {c}</div>)}
      <h4>History</h4>{done.map((q: any) => <div key={q.id} className={q.state === "SUCCEEDED" ? "good" : "bad"}>{q.state}: {q.title}</div>)}
    </div>
  );
}
function World({ S }: { S: any }) {
  return (
    <div>
      {D.regions.filter((r: any) => S.world[r.id].unlocked || S.player.level + 3 >= r.level_min).map((r: any) => { const w = S.world[r.id]; const ev = activeEvents(S, r.id); return (
        <div key={r.id} style={{ marginBottom: 8, borderBottom: "1px dotted #3a2a66", paddingBottom: 4 }}>
          <div className="gold">{r.name} {S.loc.region === r.id && <span className="pill">here</span>} {!w.unlocked && <span className="pill bad">Lv {r.level_min}</span>}</div>
          {w.unlocked ? <>
            <div className="dim">Controlled by {D.factionMap[w.controller]?.name} · pop {w.population.toLocaleString()}</div>
            <div>Prosperity {Math.round(w.prosperity)} · Danger {Math.round(w.danger)} · Crime {Math.round(w.crime)} · Stability {Math.round(w.stability)}</div>
            {wantedIn(S, r.id) > 0 && <div className="bad">Wanted level {wantedIn(S, r.id)}</div>}
            {ev.map((e: any) => <div key={e.event_id} className="bad">⚑ {e.name} {e.status === "triggered" ? "(underway)" : `(day ${e.scheduled_day})`}</div>)}
            {w.changes.slice(-2).map((c: string, i: number) => <div key={i} className="dim">• {c}</div>)}
          </> : <div className="dim">Unexplored. {r.desc}</div>}
        </div>); })}
    </div>
  );
}
function Party({ S }: { S: any }) {
  return (
    <div>
      {!S.party.length && <div className="dim">No companions. Recruit allies at the tavern.</div>}
      {S.party.map((p: any) => <div key={p.id} style={{ marginBottom: 10 }}>
        <div className="gold">{p.name} — Lv {p.level} {D.classMap[p.classId].name} <span className="pill">{p.status}</span></div>
        <div className="dim">{p.traits.join(", ")} · goal: {p.goal}</div>
        <div className="row"><span>Trust</span><Bar v={p.trust} max={100} cls="gn" /></div><div className="row"><span>Loyalty</span><Bar v={p.loyalty} max={100} cls="mp" /></div><div className="row"><span>Morale</span><Bar v={p.morale} max={100} cls="xp" /></div>
        <div>Likes: {p.likes.join(", ")}<br />Dislikes: {p.dislikes.join(", ")}</div>
        <div className="dim">Concern: {p.concern}</div>
        <div>Personal quest: {p.quest} ({p.questState}){p.secretKnown ? <span className="good"> · secret shared</span> : ""}</div>
      </div>)}
    </div>
  );
}
function Bonds({ S }: { S: any }) {
  const ns = Object.values<any>(S.npcs).filter((n) => n.known);
  return (
    <div>
      {!ns.length && <div className="dim">You haven't met anyone memorable yet.</div>}
      {ns.map((n) => <div key={n.id} style={{ marginBottom: 8 }}>
        <div className={n.alive ? "gold" : "bad"}>{n.name} <span className="dim">({n.occupation}, {n.race}) {n.alive ? "" : "† dead"}</span></div>
        <div>Attitude: {attitude(n)} · {n.circumstance} · {D.regionMap[n.region]?.name}</div>
        <div className="dim">Trust {n.rel.trust} · Respect {n.rel.respect} · Fear {n.rel.fear} · Affection {n.rel.affection} · Hostility {n.rel.hostility} · Debt {n.rel.debt}</div>
        {n.memories.slice(-2).map((m: string, i: number) => <div key={i} className="dim">“…{m}”</div>)}
      </div>)}
    </div>
  );
}
function Factions({ S }: { S: any }) {
  const fs = Object.values<any>(S.factions).filter((f) => f.known && f.id !== "wildlife");
  return (
    <div>
      <h4>Reputation (no single morality score)</h4>
      {(["heroic", "military", "criminal", "religious", "political", "merchant", "adventurer"] as const).map((k) => <div className="row" key={k}><span>{k}</span><span>{S.rep[k]} <span className="dim">{repLabel(S.rep[k])}</span></span></div>)}
      <h4>Titles</h4><div>{S.titles.length ? S.titles.join(", ") : <span className="dim">None earned.</span>}</div>
      <h4>Regions</h4>{Object.entries<number>(S.rep.region).map(([k, v]) => <div className="row" key={k}><span>{D.regionMap[k]?.name}</span><span>{v} {repLabel(v)}</span></div>)}
      <h4>Known factions</h4>
      {fs.map((f) => <div key={f.id} style={{ marginBottom: 6 }}>
        <div className="gold">{f.name} <span className="pill">{repLabel(S.rep.faction[f.id] ?? 0)}</span></div>
        <div className="dim">Leader: {f.leader} · Wealth {f.wealth} · Military {f.military}</div>
        <div>Allies: {f.allies.map((a: string) => S.factions[a]?.name).filter(Boolean).join(", ") || "none"} · Rivals: {f.rivals.map((a: string) => S.factions[a]?.name).filter(Boolean).join(", ") || "none"}</div>
        <div>Territory: {f.territory.map((t: string) => D.regionMap[t]?.name).join(", ") || "none"}</div>
        {f.conflicts.length > 0 && <div className="bad">At war with {f.conflicts.map((a: string) => S.factions[a]?.name).join(", ")}</div>}
      </div>)}
    </div>
  );
}
function Codex({ S }: { S: any }) {
  const groups: Record<string, string> = { mon_: "Creatures", npc_: "People", loc_: "Locations", lore_: "Lore", sec_: "Secrets" };
  const entries = Object.entries<string>(S.codex);
  return (
    <div>
      {Object.entries(groups).map(([pre, name]) => { const e = entries.filter(([k]) => k.startsWith(pre)); return e.length ? <div key={pre}><h4>{name}</h4>{e.map(([k, v]) => <div key={k}>• {v}</div>)}</div> : null; })}
      <h4>Rumors</h4>{S.rumors.slice(-5).reverse().map((r: any) => <div key={r.id} className="dim">• “{r.text}” ({r.truth})</div>)}
      <h4>Legend</h4>{S.legend.slice(-8).reverse().map((l: any, i: number) => <div key={i}><span className="gold">Day {l.day}</span> {l.text}</div>)}
      {!entries.length && <div className="dim">The codex fills as you discover the world.</div>}
    </div>
  );
}
