"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, type ReactNode } from "react";
import { D } from "@/game/data";
import { getS, hasS, ui, notify } from "@/game/state";
import * as C from "@/game/controller";
import * as T from "@/game/town";
import { eventOption, eventContinue, freeformSubmit } from "@/game/rooms";
import { priceOf, itemName, repairCost, upgradeCost, shopStock } from "@/game/economy";
import { featOptions } from "@/game/progression";
import { availableCompanions } from "@/game/party";
import { hasSave, savePreview } from "@/game/save";
import { getMeta, saveMeta } from "@/game/telemetry";
import { surfaceThread, pressureLabel, activeThreads } from "@/game/director";
import { activeEvents } from "@/game/events";
import { wantedIn } from "@/game/crime";
import { calendar } from "@/game/calendar";
import { deriveStats } from "@/game/engine";
import { ATTRS } from "@/game/types";
import { resurrectCost } from "@/game/death";
import { regionPath } from "@/game/map";
import { Bar } from "./Panels";

const Btn = ({ onClick, children, cls = "", disabled, title }: { onClick: () => void; children: ReactNode; cls?: string; disabled?: boolean; title?: string }) => (
  <button className={`btn ${cls}`} disabled={disabled} title={title} onClick={onClick}>{children}</button>
);
function Modal({ title, children, onClose, wide }: { title?: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="overlay" style={{ zIndex: 20 }}>
      {/* <div className="scrim" /> */}
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-label={title}>
        {title && <h2>{title}</h2>}
        {children}
        {onClose && <div style={{ marginTop: 10, textAlign: "right" }}><Btn cls="alt" onClick={onClose}>Close (Esc)</Btn></div>}
      </div>
    </div>
  );
}
const closeModal = () => { ui.modal = null; ui.paused = false; notify(); };
export function Typed({ text, on }: { text: string; on: boolean }) {
  const [n, setN] = useState(on ? 0 : text.length);
  useEffect(() => {
    if (!on) { setN(text.length); return; }
    setN(0);
    const step = Math.max(1, Math.ceil(text.length / 90));
    const id = setInterval(() => setN((v) => { if (v >= text.length) { clearInterval(id); return v; } return v + step; }), 16);
    return () => clearInterval(id);
  }, [text, on]);
  return <>{text.slice(0, n)}</>;
}

export function Overlays() {
  const m = ui.modal;
  return (
    <>
      {ui.screen === "menu" && <Menu />}
      {ui.screen === "select" && <Select />}
      {ui.screen === "town" && !m && hasS() && <Town />}
      {ui.screen === "dungeon" && !m && hasS() && <DungeonBar />}
      {ui.screen === "gameover" && <GameOver />}
      {m === "newgame" && <NewGameWarn />}
      {m === "pause" && <Pause />}
      {m === "settings" && <Settings />}
      {m === "legacy" && <Legacy />}
      {m === "event" && ui.event && <EventModal />}
      {(m === "shop" || m === "smith") && ui.shop && <Shop />}
      {m === "tavern" && hasS() && <Tavern />}
      {m === "worldmap" && hasS() && <WorldMap />}
      {m === "levelup" && hasS() && <LevelUp />}
      {m === "victory" && ui.victory && <Victory />}
      {m === "resurrect" && hasS() && <Resurrect />}
      {ui.dice && <DiceModal />}
      <div className="toasts">{ui.toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
    </>
  );
}

function Menu() {
  const meta = getMeta();
  const prev = hasSave() ? savePreview() : null;
  const ai = ui.ai;
  return (
    <div className="overlay" style={{ flexDirection: "column", gap: 10, background: "linear-gradient(#0006, #000b)", padding: 8, overflow: "auto" }}>
      <div className="title">INFINITE<br />RPG</div>
      <div className="dim" style={{ textAlign: "center" }}>The AI tells the story. The dice decide the fate.</div>
      <div className="grid" style={{ width: "min(92%, 360px)" }}>
        {prev && <Btn onClick={C.continueGame}>▶ Continue<small>{prev.name} · Lv {prev.level} {prev.cls} · Day {prev.day}</small></Btn>}
        <Btn cls={prev ? "alt" : ""} onClick={() => { C.userGesture(); if (hasSave()) ui.modal = "newgame"; else ui.screen = "select"; notify(); }}>✦ New Game</Btn>
        <Btn cls="alt" onClick={() => { ui.modal = "legacy"; notify(); }}>🏆 Legacy · {meta.shards} shards</Btn>
        <Btn cls="alt" onClick={() => { ui.modal = "settings"; notify(); }}>⚙ Settings</Btn>
        <Btn cls={ai === "ready" ? "good" : "alt"} onClick={() => C.connectGM()} disabled={ai === "ready" || ai === "off"}>{ai === "ready" ? "🧠 AI Game Master: connected" : ai === "off" ? "🧠 AI GM disabled" : ai === "offline" ? "🧠 AI GM offline (cached narration)" : "🧠 Connect AI Game Master (Puter)"}</Btn>
      </div>
      <div className="dim" style={{ fontSize: ".75em", textAlign: "center", maxWidth: 440 }}>Engine rolls all dice and math. Puter.js only narrates. ←/→ move · 1-9 actions · Space end turn · Esc pause · tap to target</div>
    </div>
  );
}
function NewGameWarn() {
  return (
    <Modal title="⚠ The Loom of Fate">
      <p>Starting anew will <span className="bad">unravel your current hero, world and campaign</span> — every NPC, quest and scar.</p>
      <p className="dim">Your Legacy Shards, achievements and the Loom's memory of how you play will endure across runs.</p>
      <div className="grid g2"><Btn cls="danger" onClick={() => { ui.modal = null; ui.screen = "select"; notify(); }}>Unravel it</Btn><Btn cls="alt" onClick={closeModal}>Keep my hero</Btn></div>
    </Modal>
  );
}
function Select() {
  const meta = getMeta();
  const [name, setName] = useState("Aria");
  const [mode, setMode] = useState<"normal" | "hardcore" | "legacy">("normal");
  const pick = ui.classPick;
  const cls = D.classMap[pick];
  const unlocked = meta.unlockedClasses.includes(pick);
  return (
    <div className="overlay" style={{ background: "#000b", alignItems: "flex-start", overflow: "auto", padding: 8 }}>
      <div className="modal wide" style={{ margin: "auto" }}>
        <h2>Choose your hero</h2>
        <div className="grid g6">
          {D.classes.map((c: any) => { const un = meta.unlockedClasses.includes(c.id); return (
            <button key={c.id} className="card" data-on={pick === c.id ? 1 : 0} data-lock={un ? 0 : 1} onClick={() => { ui.classPick = c.id; notify(); }}>
              <div style={{ fontSize: "1.6em" }}>{c.icon}</div><div style={{ color: c.color }}>{c.name}</div><div className="dim" style={{ fontSize: ".75em" }}>{un ? c.role : `🔒 ${c.unlock_cost} shards`}</div>
            </button>); })}
        </div>
        <div style={{ margin: "8px 0" }}>
          <div className="gold">{cls.name} — {cls.role}</div><div>{cls.desc}</div>
          <div className="dim">Resource: {cls.resource.type} · Abilities: {cls.abilities.map((a: any) => D.abilities[a.id].name).join(", ")}</div>
          <div className="dim">Subclasses (Lv 3): {cls.subclasses.map((s: any) => s.name).join(" / ")}</div>
        </div>
        {!unlocked && <Btn cls="good" disabled={meta.shards < cls.unlock_cost} onClick={() => { meta.shards -= cls.unlock_cost; meta.unlockedClasses.push(pick); saveMeta(); notify(); }}>Unlock for {cls.unlock_cost} shards (you have {meta.shards})</Btn>}
        <div className="grid g2" style={{ margin: "8px 0" }}>
          <input className="in" value={name} maxLength={18} onChange={(e) => setName(e.target.value)} aria-label="Hero name" />
          <div className="dim" style={{ fontSize: ".75em" }}>Death rules: {D.rules.death_modes[mode]}</div>
        </div>
        <div className="grid g3">{(["normal", "hardcore", "legacy"] as const).map((k) => <Btn key={k} cls={mode === k ? "" : "alt"} onClick={() => setMode(k)}>{k}</Btn>)}</div>
        <div className="grid g2" style={{ marginTop: 10 }}>
          <Btn disabled={!unlocked} onClick={() => C.startNewGame(pick, name, mode)}>⚔ Begin the campaign</Btn>
          <Btn cls="alt" onClick={() => { ui.screen = "menu"; notify(); }}>Back</Btn>
        </div>
      </div>
    </div>
  );
}
function Pause() {
  return (
    <Modal title="⏸ Paused">
      <div className="grid">
        <Btn onClick={C.pauseToggle}>▶ Resume</Btn>
        <Btn cls="alt" onClick={() => { C.autosave(); C.pauseToggle(); }} disabled={ui.screen === "combat"}>💾 Save (safe points)</Btn>
        <Btn cls="alt" onClick={() => { ui.modal = "settings"; notify(); }}>⚙ Settings</Btn>
        <Btn cls="danger" onClick={() => { ui.paused = false; C.restartRun(); }}>↻ Restart run (same class)</Btn>
        <Btn cls="danger" onClick={() => { C.toMenu(); }}>⌂ Quit to menu</Btn>
      </div>
    </Modal>
  );
}
function Settings() {
  const s = ui.settings;
  const T2 = ({ k, label }: { k: keyof typeof s; label: string }) => <Btn cls={s[k] ? "good" : "alt"} onClick={() => C.updateSettings({ [k]: !s[k] } as any)}>{label}: {s[k] ? "ON" : "OFF"}</Btn>;
  const meta = getMeta();
  return (
    <Modal title="⚙ Settings" onClose={() => { ui.modal = ui.paused ? "pause" : null; notify(); }}>
      <div className="grid g2">
        <T2 k="crt" label="CRT scanlines" /><T2 k="typing" label="Slow typing" /><T2 k="sound" label="Sound FX" /><T2 k="music" label="Music" /><T2 k="shake" label="Screen shake" /><T2 k="ai" label="AI Game Master" />
        <Btn cls={ui.fast ? "good" : "alt"} onClick={() => { ui.fast = !ui.fast; notify(); }}>Fast combat: {ui.fast ? "ON" : "OFF"}</Btn>
        <Btn cls="alt" onClick={() => C.connectGM()} disabled={ui.ai === "ready"}>{ui.ai === "ready" ? "AI connected" : "Connect AI GM"}</Btn>
      </div>
      <div style={{ margin: "10px 0" }}>UI text size: {Math.round(s.textScale * 100)}%<input type="range" min={0.9} max={1.5} step={0.05} value={s.textScale} onChange={(e) => C.updateSettings({ textScale: +e.target.value })} style={{ width: "100%", minHeight: 36 }} /></div>
      <div>UI border:</div>
      <div className="grid g3">{[["classic", 0], ["gold", 10], ["neon", 20], ["blood", 30]].map(([b, cost]) => { const un = meta.borders.includes(b as string); return <Btn key={b as string} cls={s.border === b ? "good" : "alt"} onClick={() => { if (un) C.updateSettings({ border: b as string }); else if (meta.shards >= (cost as number)) { meta.shards -= cost as number; meta.borders.push(b as string); saveMeta(); C.updateSettings({ border: b as string }); } }}>{b as string}{un ? "" : ` 🔒${cost}`}</Btn>; })}</div>
    </Modal>
  );
}
function Legacy() {
  const m = getMeta();
  return (
    <Modal title="🏆 Legacy" onClose={closeModal}>
      <div className="gold">Legacy Shards: {m.shards}</div>
      <div className="dim">Runs {m.runs} · Best level {m.bestLevel} · Longest {m.bestDays} days · Kills {m.totalKills}</div>
      <div className="grid" style={{ marginTop: 8 }}>{D.rules.achievements.map((a: any) => { const on = m.achievements.includes(a.id); return <div key={a.id} className="row"><span className={on ? "good" : "dim"}>{on ? "🏆" : "🔒"} {a.name} — {a.desc}</span><span>+{a.shards}</span></div>; })}</div>
      <h4 className="gold">Play style (used for cross-run AI hints)</h4>
      <div className="dim">{Object.entries(m.behavior).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(" · ") || "No data yet."}</div>
    </Modal>
  );
}
function GameOver() {
  const g = ui.gameOver;
  return (
    <div className="overlay" style={{ flexDirection: "column", gap: 10, background: "radial-gradient(#3a0a14cc, #000e)", padding: 8 }}>
      <div className="title" style={{ color: "#ff6b6b" }}>YOU DIED</div>
      <div style={{ textAlign: "center" }}>{g?.reason}{g?.lines.map((l, i) => <div key={i} className="dim">{l}</div>)}</div>
      <div className="grid" style={{ width: "min(92%, 360px)" }}>
        <Btn onClick={C.restartRun}><span className="kbd">R</span> Restart instantly</Btn>
        {g?.heir && <Btn cls="good" onClick={C.continueAsHeir}>Continue as your heir</Btn>}
        <Btn cls="alt" onClick={C.toMenu}>Main menu</Btn>
      </div>
    </div>
  );
}
function Bars({ r }: { r: any }) {
  return <div className="grid g2" style={{ fontSize: ".8em" }}>{[["Prosperity", r.prosperity, "gn"], ["Danger", r.danger, "hp"], ["Crime", r.crime, "xp"], ["Stability", r.stability, "mp"]].map(([l, v, c]: any) => <div key={l} className="row"><span>{l}</span><Bar v={v} max={100} cls={c} label={String(Math.round(v))} /></div>)}</div>;
}
function Town() {
  const S: any = getS();
  const reg = D.regionMap[S.loc.region]; const w = S.world[S.loc.region];
  const sv = w.settlement.services as string[];
  const ds = Object.values<any>(S.dungeons).filter((d) => d.region === S.loc.region);
  const th = surfaceThread(S);
  const wanted = wantedIn(S, S.loc.region);
  const readyQ = S.quests.filter((q: any) => q.outcome === "ready" && ["IN_PROGRESS", "BRANCHING"].includes(q.state)).length;
  return (
    <div className="overlay" style={{ alignItems: "flex-end", justifyContent: "center", padding: 4 }}>
      <div className="modal" style={{ width: "min(100%, 760px)", maxHeight: "96%" }}>
        <h2>{w.settlement.name} <span className="dim" style={{ fontSize: ".6em" }}>{reg.name} · {calendar(S.hours).label}</span></h2>
        <Bars r={w} />
        {w.settlement.problems.length > 0 && <div className="bad">Problems: {w.settlement.problems.join(", ")}</div>}
        {activeEvents(S, S.loc.region).map((e: any) => <div key={e.event_id} className="bad">⚑ {e.name} {e.status === "triggered" ? "is underway" : `looms (day ${e.scheduled_day})`}</div>)}
        {wanted > 0 && <div className="bad">⚠ Wanted level {wanted} here</div>}
        {th && <div className="dim">Thread: {th.title} — {pressureLabel(th.pressure)}</div>}
        <div className="grid g3" style={{ margin: "8px 0" }}>
          {sv.includes("shop") && <Btn onClick={() => T.openShop("shop")}>🛒 Shop</Btn>}
          {sv.includes("smith") && <Btn onClick={() => T.openShop("smith")}>🔨 Blacksmith</Btn>}
          {sv.includes("tavern") && <Btn onClick={T.openTavern}>🍺 Tavern{readyQ ? ` (${readyQ}✔)` : ""}</Btn>}
          {sv.includes("inn") && <Btn onClick={T.inn}>🛏 Inn<small>{Math.round(D.rules.price.rest_inn * (1 + S.player.level * 0.3) * w.priceMod)}g</small></Btn>}
          {sv.includes("healer") && <Btn onClick={T.healer} disabled={!S.player.wounds.length}>✚ Healer</Btn>}
          {sv.includes("shrine") && <Btn cls="alt" onClick={T.shrineRespec}>⛩ Shrine (respec)<small>{T.respecPrice()}g</small></Btn>}
          <Btn cls="alt" onClick={() => { ui.modal = "worldmap"; notify(); }}>🗺 World map</Btn>
          <Btn cls="alt" onClick={() => { C.autosave(); C.pauseToggle(); }}>⏸ Menu</Btn>
        </div>
        <h4 className="gold" style={{ margin: "4px 0" }}>Venture out</h4>
        <div className="grid g2">{ds.map((d) => <Btn key={d.id} cls={d.cleared ? "alt" : ""} onClick={() => C.enterDungeon(d.id)}>{d.cleared ? "✔ " : "⚔ "}{d.name}<small>Lv {d.level} · {D.factionMap[d.faction]?.name}{d.reoccupied ? " (re-occupied)" : ""}{d.pos !== d.nodes[0].id && !d.cleared ? " · in progress" : ""}</small></Btn>)}</div>
      </div>
    </div>
  );
}
function DungeonBar() {
  const S: any = getS();
  const d = S.dungeons[S.loc.dungeon];
  return (
    <div className="overlay" style={{ alignItems: "flex-end", justifyContent: "flex-end", padding: 6, gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <Btn cls="alt sm" onClick={C.retreat} disabled={ui.busy}>🚪 Retreat</Btn>
        <Btn cls="alt sm" onClick={() => { ui.drawer = !ui.drawer; notify(); }}>🎒 Pack</Btn>
      </div>
      {d?.knowledge.filter((k: any) => k.found).length > 0 && <div style={{ position: "absolute", left: 8, top: 40, maxWidth: 300, fontSize: ".75em", background: "#000a", padding: 4 }}>{d.knowledge.filter((k: any) => k.found).map((k: any) => <div key={k.text} className="good">💡 {k.text}</div>)}</div>}
    </div>
  );
}
function DiceModal() {
  const [tick, setTick] = useState(0);
  const dice = ui.dice!;
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 60); return () => clearInterval(id); }, []);
  const r = dice.roll;
  const shown = dice.done ? r.nat : ((tick * 7 + 3) % 20) + 1;
  return (
    <div className="overlay" style={{ zIndex: 40, background: "#0008" }} onClick={C.diceContinue}>
      <div className="modal" style={{ width: "min(92%, 420px)", textAlign: "center" }}>
        <div className="gold">{r.label}</div>
        <div className={`dice ${dice.done ? (r.crit ? "crit" : r.success ? "" : "fail") : "roll"}`}>{shown}</div>
        {dice.done ? <>
          <div>d20 [{r.d20.join(", ")}]{r.mode !== "normal" ? ` (${r.mode})` : ""} {r.mod >= 0 ? "+" : ""}{r.mod} = <b>{r.total}</b> vs {r.dcLabel} {r.dc}</div>
          <div className={r.success ? "good" : "bad"} style={{ fontSize: "1.3em" }}>{r.crit ? "CRITICAL SUCCESS!" : r.fumble ? "FUMBLE!" : r.success ? "SUCCESS" : "FAILURE"}</div>
          <div className="dim" style={{ fontSize: ".75em" }}>Tap / Enter to continue</div>
        </> : <div className="dim">Rolling…</div>}
      </div>
    </div>
  );
}
function Freeform({ disabled, onSubmit }: { disabled?: boolean; onSubmit: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
      <input className="in" value={t} maxLength={160} disabled={disabled} placeholder="…or describe your own action. The AI interprets, the engine decides." onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && t.trim()) { onSubmit(t); setT(""); } }} />
      <Btn cls="alt" disabled={disabled || t.trim().length < 3} onClick={() => { onSubmit(t); setT(""); }}>Do it</Btn>
    </div>
  );
}
export function FreeformBox({ onSubmit }: { onSubmit: (t: string) => void }) { return <Freeform onSubmit={onSubmit} />; }
function EventModal() {
  const e = ui.event!;
  const S: any = getS();
  const npc = e.npc ? S.npcs[e.npc] : null;
  return (
    <div className="overlay" style={{ zIndex: 20, alignItems: "flex-end" }}>
      {/* <div className="scrim" style={{ background: "rgba(5,2,12,.45)" }} /> */}
      <div className="modal" style={{ width: "min(100%, 800px)", maxHeight: "96%", marginBottom: 4 }}>
        <h2>{e.icon} {e.title}</h2>
        <div>{e.desc}</div>
        {npc && <div className="dim">{npc.name} · attitude: {npc.rel.trust + npc.rel.affection > 20 ? "warm" : npc.rel.hostility > 20 ? "hostile" : "neutral"} · greed {npc.greed > 70 ? "high" : npc.greed > 40 ? "mid" : "low"}</div>}
        {e.stage === "choose" ? (
          <>
            <div className="grid g2" style={{ marginTop: 8 }}>{e.options.map((o, i) => <Btn key={o.id} disabled={o.disabled || ui.busy} onClick={() => eventOption(o.id)}><span className="kbd">{i + 1}</span>{o.label}{o.sub && <small>{o.sub}</small>}</Btn>)}</div>
            {e.freeform && <Freeform disabled={ui.busy} onSubmit={freeformSubmit} />}
            {e.thinking && <div className="dim">The Game Master considers your words…</div>}
          </>
        ) : (
          <>
            <div style={{ margin: "8px 0" }}>{e.result.map((l, i) => <div key={i} className={i === 0 && e.success !== undefined ? (e.success ? "good" : "bad") : ""}>{l}</div>)}</div>
            <div className="gold" style={{ minHeight: 24, fontStyle: "italic" }}>{e.thinking ? "The Game Master ponders…" : <Typed text={e.narrative} on={ui.settings.typing} />}</div>
            <div style={{ marginTop: 8, textAlign: "right" }}><Btn onClick={eventContinue}><span className="kbd">↵</span>Continue</Btn></div>
          </>
        )}
      </div>
    </div>
  );
}
function Shop() {
  const S: any = getS(); const sh = ui.shop!;
  const smith = sh.kind === "smith";
  const stock = smith ? [] : shopStock(S, sh.region).slice(0, sh.kind === "wander" ? 6 : 40);
  const gear = S.player.inventory.filter((i: any) => ["weapon", "armor"].includes(D.items[i.id].type));
  const disc = sh.discount - sh.surcharge;
  const [hag, setHag] = useState("");
  return (
    <Modal title={smith ? "🔨 Blacksmith" : sh.kind === "wander" ? "🛒 Wandering Merchant" : "🛒 Shop"} wide onClose={T.closeShop}>
      <div className="row"><span className="dim">{sh.msg}</span><span className="gold">{S.player.gold}g</span></div>
      <div className="grid g3" style={{ margin: "6px 0" }}>
        {(smith ? ["repair", "upgrade"] : ["buy", "sell"]).map((t) => <Btn key={t} cls={sh.tab === t ? "" : "alt"} onClick={() => { sh.tab = t; notify(); }}>{t}</Btn>)}
      </div>
      {!smith && sh.tab === "buy" && (
        <>
          {!sh.haggled && <div style={{ display: "flex", gap: 6, marginBottom: 6 }}><input className="in" value={hag} maxLength={140} placeholder="Haggle: type a persuasive argument (CHA check)" onChange={(e) => setHag(e.target.value)} /><Btn cls="alt" disabled={ui.busy} onClick={() => { T.doHaggle(hag); setHag(""); }}>Haggle</Btn></div>}
          {disc !== 0 && <div className={disc > 0 ? "good" : "bad"}>{disc > 0 ? `Discount ${Math.round(disc * 100)}%` : `Surcharge ${Math.round(-disc * 100)}%`}</div>}
          {stock.map((id) => { const d = D.items[id]; const p = priceOf(S, id, "buy", sh.region, disc); return (
            <div className="row" key={id}><span><span className={d.rarity === "rare" || d.rarity === "epic" ? "gold" : ""}>{d.name}</span> <span className="dim">{d.desc}{d.weapon ? ` ${d.weapon.dice} ${d.weapon.dtype}` : ""}{d.ac ? ` AC+${d.ac}` : ""}</span></span>
              <span style={{ display: "flex", gap: 4 }}><Btn cls="sm" disabled={S.player.gold < p || sh.refuse} onClick={() => T.buy(id)}>{p}g</Btn><Btn cls="sm danger" disabled={ui.busy} title="Steal (AGI check, risk wanted level)" onClick={() => T.stealFromShop(id)}>🤏</Btn></span></div>); })}
        </>
      )}
      {!smith && sh.tab === "sell" && S.player.inventory.filter((i: any) => D.items[i.id].type !== "key").map((i: any) => (
        <div className="row" key={i.uid}><span>{itemName(i)}{i.qty > 1 ? ` ×${i.qty}` : ""}</span><Btn cls="sm" disabled={Object.values(S.player.equip).includes(i.uid)} onClick={() => T.sell(i.uid)}>Sell {priceOf(S, i.id, "sell", sh.region, 0, i)}g</Btn></div>))}
      {smith && sh.tab === "repair" && gear.map((i: any) => { const c = repairCost(i); return <div className="row" key={i.uid}><span>{itemName(i)} <span className={i.dur <= 0 ? "bad" : "dim"}>{i.dur}/{D.items[i.id].durability}</span></span><Btn cls="sm" disabled={c <= 0 || S.player.gold < c} onClick={() => T.doRepair(i.uid)}>{c > 0 ? `Repair ${c}g` : "OK"}</Btn></div>; })}
      {smith && sh.tab === "upgrade" && gear.map((i: any) => { const c = upgradeCost(i); const max = i.up >= D.rules.price.max_upgrade; return <div className="row" key={i.uid}><span>{itemName(i)} <span className="dim">→ +{i.up + 1}</span></span><Btn cls="sm good" disabled={max} onClick={() => T.doUpgrade(i.uid)}>{max ? "MAX" : `${c.gold}g + ${c.ore} ore${c.dust ? ` + ${c.dust} dust` : ""}`}</Btn></div>; })}
    </Modal>
  );
}
function Tavern() {
  const S: any = getS();
  const tab = ui.tavernTab;
  const offered = S.quests.filter((q: any) => q.state === "OFFERED" && q.region === S.loc.region);
  const active = S.quests.filter((q: any) => ["ACCEPTED", "IN_PROGRESS", "BRANCHING"].includes(q.state));
  const comps = availableCompanions(S).concat(S.party.filter((p: any) => p.status !== "active").map((p: any) => ({ id: p.id, name: p.name, class: p.classId, goal: p.goal, traits: p.traits })));
  return (
    <Modal title="🍺 Tavern" wide onClose={closeModal}>
      <div className="grid g3">{[["quests", "Board"], ["rumors", "Rumors"], ["recruit", "Companions"]].map(([k, l]) => <Btn key={k} cls={tab === k ? "" : "alt"} onClick={() => { ui.tavernTab = k; notify(); }}>{l}</Btn>)}</div>
      {tab === "quests" && (
        <div style={{ marginTop: 8 }}>
          <h4 className="gold">Your quests</h4>
          {!active.length && <div className="dim">None active.</div>}
          {active.map((q: any) => <div key={q.id} className="row" style={{ alignItems: "flex-start" }}><span><span className="gold">{q.title}</span> <span className="pill">{q.state}</span><br /><span className="dim">{q.desc} ({q.obj.progress}/{q.obj.count})</span></span>
            <span style={{ display: "flex", gap: 4 }}>{q.outcome === "ready" && (q.tid === "rescue" ? <><Btn cls="sm good" onClick={() => T.completeQuest(q.id, "honor")}>Return them</Btn><Btn cls="sm danger" onClick={() => T.completeQuest(q.id, "ransom")}>Ransom</Btn></> : <Btn cls="sm good" onClick={() => T.completeQuest(q.id)}>Turn in {q.reward.gold}g</Btn>)}</span></div>)}
          <h4 className="gold">Posted contracts</h4>
          {!offered.length && <div className="dim">The board is bare. Come back after the world moves.</div>}
          {offered.map((q: any) => <div key={q.id} className="row" style={{ alignItems: "flex-start" }}><span><span className="gold">{q.title}</span><br /><span className="dim">{q.desc} Reward {q.reward.gold}g + {q.reward.xp}xp · due day {q.deadline}</span></span><Btn cls="sm" onClick={() => T.acceptQuest(q.id)}>Accept</Btn></div>)}
        </div>
      )}
      {tab === "rumors" && <div style={{ marginTop: 8 }}>{T.rumorList().map((r, i) => <div key={i} className="row">“{r}”</div>)}<h4 className="gold">Whispers of the wider world</h4>{activeThreads(S).slice(0, 3).map((t: any) => <div key={t.id} className="dim">• {t.known[t.known.length - 1]} ({pressureLabel(t.pressure)})</div>)}</div>}
      {tab === "recruit" && <div style={{ marginTop: 8 }}>{!comps.length && <div className="dim">Everyone worth knowing is already at your side.</div>}{comps.map((c: any) => <div key={c.id} className="row" style={{ alignItems: "flex-start" }}><span><span className="gold">{c.name}</span> <span className="dim">{c.class ?? ""} · {c.traits?.join(", ")}<br />Goal: {c.goal}</span></span><Btn cls="sm good" onClick={() => T.tavernRecruit(c.id)}>Recruit</Btn></div>)}</div>}
    </Modal>
  );
}
const FC: Record<string, string> = { wardens: "#4dabf7", merchants: "#ffd43b", goblins: "#69db7c", bandits: "#ff6b6b", cult: "#da77f2", rimeguard: "#a5d8ff", paleCourt: "#b197fc", wildlife: "#adb5bd", rift: "#ffffff" };
function WorldMap() {
  const S: any = getS();
  const sel = ui.worldRegion;
  const info = T.regionInfo(sel);
  const ds = Object.values<any>(S.dungeons).filter((d) => d.region === sel);
  return (
    <Modal title="🗺 World Map" wide onClose={closeModal}>
      <svg viewBox="0 0 960 540" style={{ width: "100%", maxHeight: 250, background: "#0b0620", border: "3px solid #4a3a7a" }}>
        {D.regions.flatMap((r: any) => r.neighbors.filter((n: string) => n > r.id).map((n: string) => { const o = D.regionMap[n]; return <line key={r.id + n} x1={r.pos[0]} y1={r.pos[1]} x2={o.pos[0]} y2={o.pos[1]} stroke="#6b5aa0" strokeWidth={3} strokeDasharray="8 6" />; }))}
        {D.regions.map((r: any) => { const w = S.world[r.id]; const here = S.loc.region === r.id; const open = w.unlocked || S.player.level >= r.level_min; return (
          <g key={r.id} onClick={() => { ui.worldRegion = r.id; notify(); }} style={{ cursor: "pointer" }}>
            <circle cx={r.pos[0]} cy={r.pos[1]} r={here ? 30 : 24} fill={FC[w.controller] ?? "#888"} opacity={open ? 1 : 0.35} stroke={sel === r.id ? "#fff" : "#000"} strokeWidth={sel === r.id ? 5 : 3} />
            <text x={r.pos[0]} y={r.pos[1] + 6} textAnchor="middle" fontSize="20" fill="#000">{here ? "★" : open ? "" : "🔒"}</text>
            <text x={r.pos[0]} y={r.pos[1] + 48} textAnchor="middle" fontSize="18" fill="#ffd166" stroke="#000" strokeWidth="3" paintOrder="stroke">{r.name}</text>
            {activeEvents(S, r.id).length > 0 && <text x={r.pos[0] + 22} y={r.pos[1] - 18} fontSize="26">⚑</text>}
          </g>); })}
      </svg>
      <div className="gold" style={{ marginTop: 6 }}>{info.reg.name} {info.here ? "(you are here)" : ""} <span className="dim">Lv {info.reg.level_min}+ · {info.reg.desc}</span></div>
      {info.unlocked ? <>
        <Bars r={info.st} />
        <div className="dim">Ruled by {D.factionMap[info.st.controller]?.name}. Travel: {info.here ? "—" : `${info.days} day${info.days > 1 ? "s" : ""} via ${regionPath(S.loc.region, sel).map((x: string) => D.regionMap[x].name).join(" → ")}`}</div>
        <div className="grid g2" style={{ marginTop: 6 }}>
          {!info.here && <Btn onClick={() => T.travelTo(sel)}>🧭 Travel to {info.st.settlement.name}</Btn>}
          {info.here && ds.map((d) => <Btn key={d.id} cls={d.cleared ? "alt" : ""} onClick={() => C.enterDungeon(d.id)}>{d.cleared ? "✔ " : "⚔ "}{d.name} (Lv {d.level})</Btn>)}
        </div>
        {!info.here && <div className="dim" style={{ marginTop: 4 }}>Known dungeons: {ds.filter((d) => d.discovered).map((d) => d.name).join(", ") || "unscouted"}</div>}
      </> : <div className="bad">Locked: reach level {info.reg.level_min}. The dangers there would crush you.</div>}
    </Modal>
  );
}
function LevelUp() {
  const S: any = getS(); const p = S.player; const cls = D.classMap[p.classId]; const d = deriveStats(p);
  return (
    <Modal title="⭐ Build your hero" wide onClose={C.closeLevelUp}>
      <div className="dim">Level {p.level} {cls.name}. Attribute points make you stronger; feats and subclasses change how you play.</div>
      <h4 className="gold">Attributes {p.points > 0 && <span className="good">({p.points} points)</span>}</h4>
      <div className="grid g3">{ATTRS.map((a) => <div key={a} className="row"><span>{a} {p.attrs[a]} ({d.mods[a] >= 0 ? "+" : ""}{d.mods[a]})</span><Btn cls="sm" disabled={p.points <= 0 || p.attrs[a] >= D.rules.attr_cap} onClick={() => C.allocate(a)}>+</Btn></div>)}</div>
      {p.level >= 3 && !p.subclass && <><h4 className="gold">Choose a subclass</h4><div className="grid g2">{cls.subclasses.map((s: any) => <button key={s.id} className="card" onClick={() => C.pickSub(s.id)}><div className="gold">{s.name}</div><div>{s.desc}</div><div className="dim">Grants: {D.abilities[s.ability].name}</div></button>)}</div></>}
      {p.featPicks > 0 && <><h4 className="gold">Choose a feat ({p.featPicks})</h4><div className="grid g2">{featOptions(p).map((f: any) => <button key={f.id} className="card" onClick={() => C.takeFeat(f.id)}><div className="gold">{f.name}</div><div>{f.desc}</div></button>)}</div></>}
      {p.points <= 0 && p.featPicks <= 0 && (p.level < 3 || p.subclass) && <div className="good" style={{ marginTop: 8 }}>All choices made.</div>}
    </Modal>
  );
}
function Victory() {
  const v = ui.victory!;
  useEffect(() => {
    const id = setTimeout(() => {
      if (ui.modal === "victory") C.victoryContinue();
    }, 2200);
    return () => clearTimeout(id);
  }, []);
  return (
    <Modal title="🏆 Victory!">
      <div className="grid g2"><div className="good">+{v.xp} XP</div><div className="gold">+{v.gold} gold</div></div>
      {v.items.length > 0 && <div>Loot: {v.items.join(", ")}</div>}
      {v.levelUps.map((l, i) => <div key={i} className="gold">{l}</div>)}
      {v.titles.map((t) => <div key={t} className="gold">★ New title: {t}</div>)}
      <div style={{ marginTop: 8, textAlign: "right" }}><Btn onClick={C.victoryContinue}><span className="kbd">↵</span>Continue</Btn></div>
    </Modal>
  );
}
function Resurrect() {
  const S: any = getS(); const c = resurrectCost(S);
  return (
    <Modal title="💀 Fallen">
      <p>Your hero has died. In this campaign, death is not always the end — but it is never free.</p>
      <p>Resurrection costs <span className="gold">{c.gold} gold</span>{c.feather ? " (reduced by your Phoenix Feather)" : ""}, leaves a permanent scar, and costs days.</p>
      <div className="grid g2"><Btn cls="good" disabled={S.player.gold < c.gold} onClick={C.doResurrect}>Resurrect ({c.gold}g)</Btn><Btn cls="danger" onClick={C.declineResurrect}>Accept fate</Btn></div>
    </Modal>
  );
}
