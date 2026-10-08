"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useSyncExternalStore, useState } from "react";
import { D } from "@/game/data";
import { getRev, subscribe, ui, hasS, getS, notify, stage } from "@/game/state";
import * as C from "@/game/controller";
import { eventOption, eventContinue } from "@/game/rooms";
import { unit } from "@/game/combat";
import { calendar } from "@/game/calendar";
import { deriveStats, xpToNext } from "@/game/engine";
import { Overlays, Typed, FreeformBox } from "./Overlays";
import { Bar, SidePanel } from "./Panels";
import { combatActions } from "./actions";
import { wantedIn } from "@/game/crime";

export default function GameShell() {
  useSyncExternalStore(subscribe, getRev, getRev);
  const ref = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let game: any = null;
    let dead = false;
    (async () => {
      const { createGame } = await import("@/game/scenes");
      if (dead || !ref.current) return;
      game = createGame(ref.current);
      await C.boot();
      for (let i = 0; i < 8 && !dead; i++) { await new Promise((r) => setTimeout(r, 1500)); await C.refreshAI(); }
    })();
    const first = () => C.userGesture();
    window.addEventListener("pointerdown", first, { once: true });
    window.addEventListener("keydown", first, { once: true });
    return () => { dead = true; window.removeEventListener("pointerdown", first); window.removeEventListener("keydown", first); try { game?.destroy(true); } catch { /* ignore */ } };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
      if (e.key === "Escape") {
        e.preventDefault();
        if (typing) { el.blur(); return; }
        if (ui.dice) { C.diceContinue(); return; }
        const closable = ["settings", "legacy", "tavern", "worldmap", "levelup"];
        if (ui.modal && closable.includes(ui.modal)) { ui.modal = ui.paused ? "pause" : null; if (!ui.paused) { /* resume */ } notify(); if (ui.modal === null) stage.refresh(); return; }
        if (ui.modal === "shop" || ui.modal === "smith") { import("@/game/town").then((t) => t.closeShop()); return; }
        C.pauseToggle(); return;
      }
      if (typing) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (ui.dice) { if (k === "Enter" || k === " ") { e.preventDefault(); C.diceContinue(); } return; }
      if (ui.screen === "gameover") { if (k === "r" || k === "Enter") { e.preventDefault(); C.restartRun(); } return; }
      if (ui.screen === "menu" || ui.screen === "select" || ui.screen === "loading") { if (k === "Enter" && ui.screen === "menu") { e.preventDefault(); } return; }
      if (ui.modal === "victory") { if (k === "Enter" || k === " ") { e.preventDefault(); C.victoryContinue(); } return; }
      if (ui.modal === "event" && ui.event) {
        if (ui.event.stage === "result") { if (k === "Enter" || k === " ") { e.preventDefault(); eventContinue(); } return; }
        const n = parseInt(k, 10);
        if (n >= 1 && ui.event.options[n - 1] && !ui.event.options[n - 1].disabled) { e.preventDefault(); eventOption(ui.event.options[n - 1].id); }
        return;
      }
      if (ui.modal) return;
      if (ui.screen === "dungeon") {
        if (k === "ArrowUp" || k === "ArrowLeft" || k === "w") { e.preventDefault(); stage.mapMove(-1); }
        else if (k === "ArrowDown" || k === "ArrowRight" || k === "s") { e.preventDefault(); stage.mapMove(1); }
        else if (k === "Enter" || k === " ") { e.preventDefault(); stage.mapConfirm(); }
        return;
      }
      if (ui.screen === "combat" && ui.combat) {
        if (ui.busy) return;
        if (k === "ArrowLeft") { e.preventDefault(); C.act({ type: "move", dx: -1 }); return; }
        if (k === "ArrowRight") { e.preventDefault(); C.act({ type: "move", dx: 1 }); return; }
        if (k === "Tab" || k === "ArrowDown") { e.preventDefault(); C.cycleTarget(e.shiftKey ? -1 : 1); return; }
        if (k === "ArrowUp") { e.preventDefault(); C.cycleTarget(-1); return; }
        if (k === " " || k === "Enter") { e.preventDefault(); C.endTurn(); return; }
        if (ui.combat.menu === "item") {
          const n = parseInt(k, 10);
          const pots = getS().player.inventory.filter((i) => D.items[i.id]?.type === "potion");
          if (n >= 1 && pots[n - 1]) { e.preventDefault(); C.act({ type: "item", uid: pots[n - 1].uid }); }
          return;
        }
        const a = combatActions().find((x) => x.key === k);
        if (a && a.enabled) { e.preventDefault(); a.run(); notify(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [box, setBox] = useState({ w: "100%", h: "100%" });
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 980 : false));
  useEffect(() => {
    const update = () => {
      const mobile = window.innerWidth <= 980;
      setIsMobile(mobile);
      if (mobile && ui.drawer) { ui.drawer = false; notify(); }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update); };
  }, []);
  useEffect(() => {
    if (!ref.current?.parentElement) return;
    const p = ref.current.parentElement;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      const mobileLandscape = window.innerWidth <= 980 && window.innerWidth > window.innerHeight;
      let w = r.width;
      let h = r.height;
      if (!mobileLandscape) {
        h = w * 9 / 16;
        if (h > r.height) { h = r.height; w = h * 16 / 9; }
      }
      const next = { w: w + "px", h: h + "px" };
      setBox(next);
      const canvas = ref.current?.querySelector("canvas");
      if (canvas) {
        canvas.style.width = next.w;
        canvas.style.height = next.h;
        canvas.style.margin = "0";
        canvas.style.marginLeft = "0";
        canvas.style.marginTop = "0";
        canvas.style.position = "relative";
        canvas.style.left = "0";
        canvas.style.top = "0";
        canvas.style.display = "block";
      }
    });
    ro.observe(p);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; });
  useEffect(() => { document.documentElement.style.setProperty("--ts", String(ui.settings.textScale)); }, [ui.settings.textScale]);

  const game = hasS() && !["menu", "select", "loading", "gameover"].includes(ui.screen);
  const S: any = game ? getS() : null;
  const lastId = ui.log.length ? ui.log[ui.log.length - 1].id : 0;
  return (
    <div className={`shell ${ui.settings.crt ? "crt" : ""}`} data-border={ui.settings.border}>
      {game ? <Hud S={S} isMobile={isMobile} /> : <div style={{ height: 4, background: "var(--bd)" }} />}
      <div className="main" style={game ? undefined : { gridTemplateColumns: "minmax(0,1fr)" }}>
        <div className="stage">
          <div className="cwrap">
            <div className="cv fff" ref={ref} style={{ width: box.w, height: box.h }} />
            <div className="ui-layer" style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div className="ui-box" style={{ position: "relative", width: box.w, height: box.h, pointerEvents: "auto" }}>
                {ui.screen === "loading" && <div className="overlay"><div className="gold">{ui.loadingMsg}</div></div>}
                <Overlays />
              </div>
            </div>
          </div>
          {ui.screen === "combat" && ui.combat && <ActionBar />}
        </div>
        {game && <aside className={`side ${ui.drawer ? "open" : ""} ${isMobile ? "mobile" : ""}`}><div style={{ display: "flex", justifyContent: "flex-end", padding: 4 }} className="hamb"><button className="btn sm" onClick={() => { ui.drawer = false; notify(); }}>✕ Close</button></div><SidePanel /></aside>}
      </div>
      <div className="log" ref={logRef} aria-live="polite">
        {ui.log.map((l) => <p key={l.id} className={l.cls}>{l.gm ? <>🎙 <Typed text={l.text} on={ui.settings.typing && l.id === lastId} /></> : l.text}</p>)}
      </div>
    </div>
  );
}

function Hud({ S, isMobile }: { S: any; isMobile: boolean }) {
  const p = S.player; const d = deriveStats(p); const cal = calendar(S.hours);
  const cls = D.classMap[p.classId];
  const comb = ui.combat ? unit(ui.combat.cs, "hero") : null;
  const hp = comb ? comb.hp : p.hp; const res = comb ? comb.res : p.res;
  return (
    <div className="hud">
      <span className="name">{cls.icon} {p.name} <span className="dim">Lv{p.level}</span></span>
      <Bar v={hp} max={d.maxHp} cls="hp" label={`HP ${hp}/${d.maxHp}`} />
      <Bar v={res} max={d.maxRes} cls="mp" label={`${cls.resource.type} ${Math.floor(res)}/${d.maxRes}`} />
      <Bar v={p.xp} max={xpToNext(p.level)} cls="xp" label={`XP`} />
      <span className="gold">🪙{p.gold}</span>
      <span className="dim" style={{ fontSize: ".8em" }}>{cal.label} · {D.regionMap[S.loc.region].name}{wantedIn(S, S.loc.region) ? ` · ⚠${wantedIn(S, S.loc.region)}` : ""}</span>
      {p.points > 0 || p.featPicks > 0 ? <button className="btn sm good" onClick={() => { ui.modal = "levelup"; notify(); }}>★ Level up!</button> : null}
      <span style={{ flex: 1 }} />
      <div className="hud-actions">
        {isMobile && (
          <button className="btn sm alt menu-btn" aria-label="Open menu" onClick={() => { ui.drawer = !ui.drawer; notify(); }}>☰</button>
        )}
        <button className="btn sm alt" aria-label="Pause" onClick={C.pauseToggle}>⏸</button>
      </div>
    </div>
  );
}

function ActionBar() {
  const c = ui.combat!;
  const cs = c.cs;
  const S: any = getS();
  const hero = unit(cs, "hero");
  const acts = combatActions();
  const main = acts.filter((a) => a.group === "main");
  const more = acts.filter((a) => a.group === "more");
  const myTurn = cs.cur === "hero" && !ui.busy;
  const pots = S.player.inventory.filter((i: any) => D.items[i.id]?.type === "potion");
  const tgt = c.target ? unit(cs, c.target) : null;
  return (
    <div className="actionbar">
      <div className="abrow" style={{ alignItems: "center", fontSize: ".8em" }}>
        <span className="gold">Round {cs.round}</span>
        <span className={myTurn ? "good" : "dim"}>{myTurn ? "● YOUR TURN" : cs.over ? "…" : "enemy turn…"}</span>
        <span title="Action">{hero.actions > 0 ? "●" : "○"} action</span><span title="Bonus">{hero.bonus ? "◆" : "◇"} bonus</span><span title="Reaction">{hero.reaction ? "↺" : "·"} react</span><span>👣 {hero.moveLeft}</span>
        {tgt && !tgt.dead && <span className="bad">🎯 {tgt.name} {tgt.hp}/{tgt.maxHp} AC{tgt.ac} d{Math.abs(tgt.x - hero.x)}{tgt.vuln.length ? ` weak:${tgt.vuln.join("/")}` : ""}{tgt.resist.length ? ` res:${tgt.resist.join("/")}` : ""}</span>}
        {hero.downed && <span className="bad">DOWNED — saves {hero.ds.s}✔ {hero.ds.f}✘</span>}
      </div>
      {c.menu === "item" && <div className="abrow">{pots.map((i: any, n: number) => <button key={i.uid} className="btn sm good" onClick={() => C.act({ type: "item", uid: i.uid })}><span className="kbd">{n + 1}</span>{D.items[i.id].name} ×{i.qty}</button>)}</div>}
      {c.menu === "free" && <FreeformBox onSubmit={(t) => { c.menu = null; C.improviseInCombat(t); }} />}
      <div className="abrow">
        <button className="btn alt" disabled={!myTurn} aria-label="Move left" onClick={() => C.act({ type: "move", dx: -1 })}>◀</button>
        <button className="btn alt" disabled={!myTurn} aria-label="Move right" onClick={() => C.act({ type: "move", dx: 1 })}>▶</button>
        {main.map((a) => <button key={a.key + a.label} className="btn" disabled={!a.enabled} title={a.why} onClick={() => { a.run(); notify(); }}><span className="kbd">{a.key}</span>{a.icon} {a.label}{a.sub && <small>{a.sub}</small>}</button>)}
        <button className="btn good" disabled={!myTurn} onClick={C.endTurn}><span className="kbd">␣</span>End turn</button>
        <button className="btn alt" onClick={() => { c.menu = c.menu === "more" ? null : "more"; notify(); }}>⋯ More</button>
      </div>
      {c.menu === "more" && <div className="abrow">{more.map((a) => <button key={a.key} className="btn sm alt" disabled={!a.enabled} title={a.sub} onClick={() => { a.run(); c.menu = c.menu === "more" ? null : c.menu; notify(); }}><span className="kbd">{a.key.toUpperCase()}</span>{a.icon} {a.label}</button>)}</div>}
      <div className="dim" style={{ fontSize: ".7em" }}>←/→ move · Tab target (or tap an enemy) · Space end turn · Esc pause · Typed text above uses Typed: <Typed text="" on={false} /></div>
    </div>
  );
}
