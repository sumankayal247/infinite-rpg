// @ts-nocheck
/* eslint-disable */
// Phaser 4 scenes: Backdrop (menu/town), Map (dungeon node graph), Combat (juicy turn-based arena).
import Phaser from "phaser";
import { ensureSprite, classSpec } from "./sprites";
import { D } from "./data";
import { ui, stage, getS, hasS } from "./state";
import { chooseNode, setTarget } from "./controller";
import { reachable } from "./dungeon";
import { sfx } from "./audio";

const W = 960, H = 540;
const BGS = ["title", "forest", "cave", "crypt", "frost", "ember"];
const FONT = '"Courier New", ui-monospace, monospace';
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ui.fast ? ms * 0.55 : ms));
const col = (h: string) => { h = h.length === 4 ? "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h; return parseInt(h.slice(1, 7), 16); };
const ts = (size: number, color = "#fff", extra: any = {}) => ({ fontFamily: FONT, fontSize: size + "px", color, fontStyle: "bold", stroke: "#0a0412", strokeThickness: Math.max(2, size / 6), resolution: 2, ...extra });
const DT: Record<string, string> = { fire: "#ff7b00", cold: "#7fdcff", lightning: "#ffe066", poison: "#7bd34a", necrotic: "#b04adf", holy: "#fff3a0", arcane: "#c77dff", slash: "#ffffff", pierce: "#ffffff", blunt: "#ffffff", physical: "#ffffff" };

class Particles {
  items: any[] = [];
  constructor(scene: any, n = 140) {
    for (let i = 0; i < n; i++) {
      const o = scene.add.rectangle(0, 0, 3, 3, 0xffffff).setVisible(false).setDepth(60);
      this.items.push({ o, vx: 0, vy: 0, life: 0, max: 1, g: 0, on: false });
    }
  }
  burst(x: number, y: number, color: number, n = 10, speed = 160, opt: any = {}) {
    let k = 0;
    for (const p of this.items) {
      if (p.on) continue;
      const a = opt.up ? -Math.PI / 2 + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.g = opt.g ?? 380; p.life = p.max = (opt.life ?? 0.55) * (0.6 + Math.random() * 0.6); p.on = true;
      const sz = opt.size ?? (2 + Math.floor(Math.random() * 3));
      p.o.setPosition(x, y).setSize(sz, sz).setDisplaySize(sz, sz).setFillStyle(color).setAlpha(1).setVisible(true);
      if (++k >= n) break;
    }
  }
  update(dt: number) {
    const s = dt / 1000;
    for (const p of this.items) {
      if (!p.on) continue;
      p.life -= s;
      if (p.life <= 0) { p.on = false; p.o.setVisible(false); continue; }
      p.vy += p.g * s;
      p.o.x += p.vx * s; p.o.y += p.vy * s; p.o.setAlpha(Math.min(1, p.life / p.max * 1.6));
    }
  }
}
function addBg(scene: any, key: string, dim = 0.35) {
  const k = "bg_" + key;
  if (scene.textures.exists(k)) scene.add.image(W / 2, H / 2, k).setDisplaySize(W, H).setDepth(0);
  else scene.cameras.main.setBackgroundColor("#120a22");
  const g = scene.add.graphics().setDepth(1);
  g.fillStyle(0x07030f, dim); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 8; i++) { g.fillStyle(0x000000, 0.08); g.fillRect(0, H - 200 + i * 25, W, 200 - i * 25); }
}

class Boot extends Phaser.Scene {
  constructor() { super("boot"); }
  preload() {
    const t = this.add.text(W / 2, H / 2, "LOADING…", ts(20, "#ffd166")).setOrigin(0.5);
    for (const k of BGS) this.load.image("bg_" + k, `/assets/backgrounds/${k}.avif`);
    this.load.on("loaderror", () => {});
    this.load.on("progress", (p: number) => t.setText("LOADING " + Math.round(p * 100) + "%"));
  }
  create() { stage.ready = true; (this.game as any).__booted?.(); }
}

class Backdrop extends Phaser.Scene {
  bg = "title"; motes: any; heroes: any[] = [];
  constructor() { super("backdrop"); }
  init(d: any) { this.bg = d?.bg ?? "title"; }
  create() {
    this.heroes = [];
    addBg(this, this.bg, this.bg === "title" ? 0.12 : 0.35);
    this.motes = new Particles(this, 60);
    const ground = 430;
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(0x0a0614, 0.6); g.fillRect(0, ground, W, H - ground); g.lineStyle(2, 0xffd166, 0.35); g.lineBetween(0, ground, W, ground);
    const menu = ui.screen === "menu" || !hasS();
    const specs: any[] = [];
    if (menu) D.classes.slice(0, 6).forEach((c: any, i: number) => specs.push({ s: classSpec(c.plan, c.color), x: 170 + i * 124 }));
    else {
      const S = getS();
      const cls = D.classMap[S.player.classId];
      specs.push({ s: classSpec(cls.plan, cls.color), x: 300 });
      S.party.filter((p) => p.status === "active").forEach((p, i) => { const c = D.classMap[p.classId]; specs.push({ s: classSpec(c.plan, c.color), x: 200 - i * 90 }); });
    }
    specs.forEach((e, i) => {
      const key = ensureSprite(this.textures, e.s);
      const sh = this.add.ellipse(e.x, ground + 2, 70, 14, 0x000000, 0.45).setDepth(3);
      const im = this.add.image(e.x, ground, key).setOrigin(0.5, 1).setScale(menu ? 3.6 : 4.2).setDepth(4);
      this.tweens.add({ targets: im, scaleY: (menu ? 3.6 : 4.2) * 1.04, y: ground - 3, duration: 900 + i * 90, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.heroes.push(im, sh);
    });
    this.input.keyboard?.removeAllKeys?.();
  }
  update(t: number, dt: number) {
    if (Math.random() < 0.25) this.motes.burst(Math.random() * W, H + 4, this.bg === "ember" || this.bg === "title" ? 0xffa94d : 0xcfe8ff, 1, 40, { up: true, g: -20, life: 3.5, size: 2 });
    this.motes.update(dt);
  }
}

class MapS extends Phaser.Scene {
  d: any; nodes: any[] = []; sel = 0; reach: any[] = []; layer: any; token: any; sig = ""; hint: any; title: any; motes: any;
  constructor() { super("map"); }
  private resolveDungeon(dungeonId?: string) {
    const S = getS();
    const id = dungeonId ?? S?.loc?.dungeon ?? this.d?.id ?? "";
    return S?.dungeons?.[id] ?? null;
  }
  init(d: any) {
    this.d = this.resolveDungeon(d?.dungeonId);
    this.sel = 0;
  }
  create() {
    const currentDungeon = this.resolveDungeon();
    if (!currentDungeon) {
      const fallbackBg = D.biomes[D.regionMap[getS()?.loc?.region ?? "greenwood"]?.biome ?? "forest"].bg;
      addBg(this, fallbackBg, 0.5);
      this.hint = this.add.text(W / 2, H / 2, "Loading map…", ts(18, "#e8e1ff")).setOrigin(0.5).setDepth(10);
      this.time.delayedCall(160, () => {
        const retry = this.resolveDungeon();
        if (this.sys?.isActive() && retry) {
          this.d = retry;
          this.scene.restart({ dungeonId: retry.id });
        }
      });
      return;
    }
    this.d = currentDungeon;
    const biome = D.biomes[this.d.biome];
    addBg(this, biome.bg, 0.5);
    this.motes = new Particles(this, 40);
    this.title = this.add.text(24, 16, `${this.d.name}  ·  Lv ${this.d.level}  ·  ${D.factionMap[this.d.faction]?.name ?? ""}`, ts(18, "#ffd166")).setDepth(10);
    this.hint = this.add.text(W / 2, H - 26, "", ts(15, "#e8e1ff")).setOrigin(0.5).setDepth(10);
    stage.refresh = () => this.later();
    stage.mapMove = (dir: number) => { if (!this.reach.length) return; this.sel = (this.sel + dir + this.reach.length) % this.reach.length; sfx("click"); this.draw(); };
    stage.mapConfirm = () => { const n = this.reach[this.sel]; if (n) chooseNode(n.id); };
    this.draw();
  }
  later() { this.time.delayedCall(0, () => { if (this.sys && this.sys.isActive()) this.draw(); }); }
  clearLayer() {
    const kill = (o: any) => { this.tweens.killTweensOf(o); if (o.list) o.list.forEach(kill); };
    this.layer.list.forEach(kill);
    this.layer.removeAll(true);
  }
  draw() {
    const liveDungeon = this.resolveDungeon(this.d?.id ?? getS()?.loc?.dungeon ?? undefined);
    this.d = liveDungeon ?? this.d ?? null;
    if (!this.d) return;
    if (!this.layer) this.layer = this.add.container(0, 0).setDepth(5);
    this.clearLayer();
    const d = this.d;
    this.reach = reachable(d);
    if (this.sel >= this.reach.length) this.sel = 0;
    const pos = (n: any) => ({ x: 90 + n.x * 780, y: 80 + n.y * 370 });
    const g = this.add.graphics();
    this.layer.add(g);
    const byId: any = {}; d.nodes.forEach((n: any) => (byId[n.id] = n));
    for (const n of d.nodes) {
      if (n.hidden) continue;
      for (const id of n.next) {
        const m = byId[id]; if (!m || m.hidden) continue;
        const a = pos(n), b = pos(m);
        const lit = n.done || n.id === d.pos;
        g.lineStyle(lit ? 4 : 2, lit ? 0xffd166 : 0x8a7ab8, lit ? 0.9 : 0.45);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    const cur = byId[d.pos];
    d.nodes.forEach((n: any) => {
      if (n.hidden) return;
      const p = pos(n);
      const rt = D.roomTypes[n.type];
      const idx = this.reach.findIndex((r: any) => r.id === n.id);
      const canGo = idx >= 0;
      const color = col(rt.color);
      const c = this.add.container(p.x, p.y);
      const ring = this.add.circle(0, 0, 27, canGo ? 0xffffff : 0x000000, canGo ? 0.9 : 0.5);
      const body = this.add.circle(0, 0, 23, n.done ? 0x2a2438 : color, n.done ? 0.9 : 1);
      const ico = this.add.text(0, 0, n.done && n.type !== "entrance" ? "✔" : rt.icon, ts(22, n.done ? "#9a90b8" : "#fff")).setOrigin(0.5);
      c.add([ring, body, ico]);
      if (canGo) {
        body.setInteractive({ useHandCursor: true });
        body.on("pointerover", () => { if (this.sel !== idx) { this.sel = idx; this.later(); } });
        body.on("pointerdown", () => chooseNode(n.id));
        this.tweens.add({ targets: c, scale: 1.12, duration: 520, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        if (idx === this.sel) {
          const lab = this.add.text(0, 40, rt.label, ts(14, "#ffd166")).setOrigin(0.5);
          const arr = this.add.text(0, -44, "▼", ts(18, "#ffd166")).setOrigin(0.5);
          this.tweens.add({ targets: arr, y: -38, duration: 380, yoyo: true, repeat: -1 });
          c.add([lab, arr]);
          this.hint.setText(`${rt.label} — ↑/↓ choose · Enter go · tap a glowing room`);
        }
      }
      this.layer.add(c);
    });
    if (cur) {
      const p = pos(cur);
      const S = getS(); const cls = D.classMap[S.player.classId];
      const key = ensureSprite(this.textures, classSpec(cls.plan, cls.color));
      const t = this.add.image(p.x - 30, p.y - 6, key).setOrigin(0.5, 1).setScale(1.5);
      this.tweens.add({ targets: t, y: p.y - 12, duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.layer.add(t);
    }
    if (!this.reach.length) this.hint.setText("Nothing ahead — retreat to town to regroup.");
  }
  update(t: number, dt: number) { if (Math.random() < 0.1) this.motes.burst(Math.random() * W, H, 0xffd9a0, 1, 30, { up: true, g: -15, life: 3, size: 2 }); this.motes.update(dt); }
}

class Combat extends Phaser.Scene {
  views: any = {}; cs: any; particles: any; fl: any[] = []; fli = 0; arena: any; arrow: any; tmark: any; ground = 402; hallu: any; rollTxt: any; banner: any; biome = "forest";
  constructor() { super("combat"); }
  init(d: any) { this.biome = d?.biome ?? "forest"; this.views = {}; this.fl = []; }
  xFor(x: number) { return 120 + x * 90; }
  create() {
    const cs = ui.combat.cs; this.cs = cs;
    addBg(this, D.biomes[this.biome].bg, 0.28);
    this.arena = this.add.graphics().setDepth(2);
    this.particles = new Particles(this, 200);
    this.hallu = this.add.rectangle(W / 2, H / 2, W, H, 0xff00ff, 0).setDepth(55);
    for (let i = 0; i < 16; i++) this.fl.push(this.add.text(0, 0, "", ts(22)).setOrigin(0.5).setDepth(70).setVisible(false));
    this.arrow = this.add.text(0, 0, "▼", ts(22, "#ffd166")).setOrigin(0.5).setDepth(40).setVisible(false);
    this.tmark = this.add.text(0, 0, "◆", ts(18, "#ff5c5c")).setOrigin(0.5).setDepth(40).setVisible(false);
    this.rollTxt = this.add.text(W / 2, 40, "", ts(20, "#fff", { backgroundColor: "#1b1030cc", padding: { x: 10, y: 6 } })).setOrigin(0.5).setDepth(80).setVisible(false);
    this.banner = this.add.text(W / 2, 90, "", ts(28, "#ffd166")).setOrigin(0.5).setDepth(80).setVisible(false);
    this.drawArena();
    for (const u of cs.units) this.makeView(u, false);
    stage.refresh = () => this.drawArena();
    stage.selectTarget = (id: string | null) => this.setMark(id);
    stage.shake = (n = 1) => this.shake(n);
    stage.playEvent = (ev: any) => this.play(ev);
    this.setMark(ui.combat.target);
  }
  drawArena() {
    const g = this.arena; g.clear();
    const gy = this.ground;
    g.fillStyle(0x07030f, 0.7); g.fillRect(0, gy, W, H - gy);
    g.lineStyle(3, 0xffd166, 0.5); g.lineBetween(0, gy, W, gy);
    for (let x = 0; x < 9; x++) { g.lineStyle(1, 0xffffff, 0.12); g.lineBetween(this.xFor(x) - 45, gy, this.xFor(x) - 45, gy + 24); g.fillStyle(0xffffff, 0.2); g.fillRect(this.xFor(x) - 2, gy + 8, 4, 4); }
    const a = this.cs.arena;
    if (a.surface) {
      const c = a.surface.type === "oil" ? 0x1a0f24 : a.surface.type === "ice" ? 0xcff4ff : 0x3a86d5;
      g.fillStyle(c, 0.85); g.fillRect(this.xFor(a.surface.from) - 45, gy - 4, (a.surface.to - a.surface.from + 1) * 90, 10);
      g.fillStyle(0xffffff, 0.18); g.fillRect(this.xFor(a.surface.from) - 45, gy - 4, (a.surface.to - a.surface.from + 1) * 90, 2);
    }
    for (const h of a.hazards) {
      const c = col(h.color);
      const x0 = this.xFor(h.from) - 45, w = (h.to - h.from + 1) * 90;
      g.fillStyle(c, 0.28); g.fillRect(x0, gy - 34, w, 40);
      g.fillStyle(c, 0.85); g.fillRect(x0, gy - 4, w, 10);
      g.lineStyle(2, c, 1); g.strokeRect(x0, gy - 34, w, 40);
    }
  }
  makeView(u: any, pop: boolean) {
    const ally = u.team === "player";
    const spec = u.kind === "player" || u.kind === "companion" ? classSpec(D.classMap[u.classId].plan, D.classMap[u.classId].color) : { body: u.body, pal: u.pal, hat: u.hat, wep: u.wep, theme: u.theme };
    const key = ensureSprite(this.textures, spec);
    const sc = 3.2 * (u.size ?? 1);
    const c = this.add.container(this.xFor(u.x), this.ground).setDepth(10 + u.x);
    const shadow = this.add.ellipse(0, 2, 70 * (u.size ?? 1), 12, 0x000000, 0.45);
    const img = this.add.image(0, 0, key).setOrigin(0.5, 1).setScale(sc);
    if (!ally || u.kind === "summon") img.setFlipX(!ally);
    const fly = u.flying ? -30 : 0;
    img.y = fly;
    const bar = this.add.graphics();
    const name = this.add.text(0, -sc * 32 + fly - 28, u.name, ts(11, ally ? "#9be8ff" : "#ffc2c2")).setOrigin(0.5);
    const conds = this.add.text(0, -sc * 32 + fly - 44, "", ts(14)).setOrigin(0.5);
    c.add([shadow, img, bar, name, conds]);
    const v = { u, c, img, bar, name, conds, key, sc, fly, hp: u.hp, shown: u.hp, max: u.maxHp, set: new Set<string>(), dead: u.dead, downed: u.downed, x: u.x, top: -sc * 32 + fly };
    this.views[u.id] = v;
    if (u.flying) this.tweens.add({ targets: img, y: fly - 6, duration: 700 + Math.random() * 300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    else this.tweens.add({ targets: img, scaleY: sc * 1.03, duration: 800 + Math.random() * 300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    if (!ally) { img.setInteractive({ useHandCursor: true }); img.on("pointerdown", () => setTarget(u.id)); }
    this.bar(v);
    if (pop) { c.setScale(0.2); this.tweens.add({ targets: c, scale: 1, duration: 260, ease: "Back.easeOut" }); }
    for (const k of u.conds) v.set.add(k.id);
    this.condText(v);
    return v;
  }
  bar(v: any) {
    const g = v.bar; g.clear();
    if (v.dead) return;
    const w = 52, y = v.top - 10, r = Math.max(0, v.shown / v.max);
    g.fillStyle(0x000000, 0.8); g.fillRect(-w / 2 - 1, y - 1, w + 2, 8);
    g.fillStyle(r > 0.5 ? 0x4cd964 : r > 0.25 ? 0xffcc00 : 0xff3b30, 1); g.fillRect(-w / 2, y, w * r, 6);
    g.fillStyle(0xffffff, 0.25); g.fillRect(-w / 2, y, w * r, 2);
  }
  condText(v: any) { v.conds.setText([...v.set].map((id) => D.conditions[id]?.icon ?? "").join("")); }
  setMark(id: string | null) {
    const v = id && this.views[id];
    this.tmark.setVisible(!!v && !v.dead);
  }
  shake(n = 1) { if (ui.settings.shake) this.cameras.main.shake(130 + n * 40, Math.min(0.025, 0.004 + n * 0.004)); }
  float(x: number, y: number, str: string, color = "#fff", size = 22) {
    const t = this.fl[this.fli++ % this.fl.length];
    this.tweens.killTweensOf(t);
    t.setText(str).setStyle(ts(size, color)).setPosition(x + (Math.random() - 0.5) * 16, y).setAlpha(1).setScale(0.4).setVisible(true);
    this.tweens.add({ targets: t, scale: 1, duration: 120, ease: "Back.easeOut" });
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 900, delay: 160, ease: "Cubic.easeOut", onComplete: () => t.setVisible(false) });
  }
  flash(v: any) {
    if (!v) return;
    v.img.setTexture(v.key + "_w");
    this.time.delayedCall(70, () => v.img && v.img.setTexture(v.key));
    this.tweens.add({ targets: v.c, x: v.c.x + (v.u.team === "enemy" ? 8 : -8), duration: 50, yoyo: true });
  }
  async play(ev: any) {
    const cs = this.cs;
    if (!this.views) return;
    const V = (id: string) => this.views[id];
    switch (ev.t) {
      case "round": this.banner.setText(`ROUND ${ev.n}`).setVisible(true).setAlpha(1); this.tweens.add({ targets: this.banner, alpha: 0, y: 70, duration: 700, onComplete: () => { this.banner.y = 90; this.banner.setVisible(false); } }); break;
      case "turn": { const v = V(ev.id); if (v) { this.arrow.setVisible(true).setData("id", ev.id); } break; }
      case "roll": {
        const r = ev.roll; const v = V(ev.id);
        const txt = `${r.label}: ${r.nat}${r.mod >= 0 ? "+" : ""}${r.mod}=${r.total} vs ${r.dcLabel} ${r.dc}`;
        this.rollTxt.setText(`🎲 ${txt}`).setColor(r.crit ? "#ffd166" : r.success ? "#9dff9d" : "#ff9d9d").setVisible(true).setAlpha(1).setScale(0.7);
        this.tweens.killTweensOf(this.rollTxt);
        this.tweens.add({ targets: this.rollTxt, scale: 1, duration: 120, ease: "Back.easeOut" });
        this.tweens.add({ targets: this.rollTxt, alpha: 0, delay: 900, duration: 300 });
        if (v && (r.nat === 20 || r.fumble)) this.float(v.c.x, v.c.y + v.top - 20, r.nat === 20 ? "NAT 20!" : "NAT 1", r.nat === 20 ? "#ffd166" : "#ff6b6b", 20);
        if (ev.kind !== "save") sfx("dice");
        break;
      }
      case "act": break;
      case "fx": {
        const v = V(ev.src); if (!v) break;
        const c = col(ev.color ?? "#ffffff");
        const ring = this.add.circle(v.c.x, v.c.y + v.top / 2, 10, c, 0.0).setStrokeStyle(4, c, 1).setDepth(50);
        this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
        this.particles.burst(v.c.x, v.c.y + v.top / 2, c, 14, 150, { up: false, g: 0 });
        sfx(ev.kind === "defend" ? "click" : ["hit", "crit", "miss", "heal", "spell", "fire"].includes(ev.kind) ? ev.kind : "spell");
        if (ev.name && ev.name !== "Defend") this.float(v.c.x, v.c.y + v.top - 6, ev.name, ev.color ?? "#fff", 14);
        await delay(160);
        break;
      }
      case "attack": {
        const a = V(ev.src), d = V(ev.dst); if (!a || !d) break;
        const dir = d.c.x > a.c.x ? 1 : -1;
        const melee = !ev.ranged && !ev.spell;
        if (melee) {
          const ox = a.c.x;
          await new Promise<void>((res) => this.tweens.add({ targets: a.c, x: ox + dir * Math.min(48, Math.abs(d.c.x - ox) - 30 > 0 ? 48 : 18), duration: ui.fast ? 50 : 90, yoyo: true, ease: "Quad.easeOut", onComplete: () => res() }));
        } else {
          const c = col(ev.color ?? "#ffe9a0");
          const p = this.add.circle(a.c.x + dir * 26, a.c.y + a.top * 0.55, ev.spell ? 9 : 4, c, 1).setDepth(55);
          await new Promise<void>((res) => this.tweens.add({ targets: p, x: d.c.x, y: d.c.y + d.top * 0.5, duration: 200, ease: "Quad.easeIn", onUpdate: () => this.particles.burst(p.x, p.y, c, 1, 20, { g: 0, life: 0.25, size: 3 }), onComplete: () => { p.destroy(); res(); } }));
        }
        if (ev.hit) { sfx(ev.crit ? "crit" : ev.spell ? "spell" : "hit"); }
        break;
      }
      case "miss": { const v = V(ev.id); if (!v) break; this.float(v.c.x, v.c.y + v.top, ev.fumble ? "FUMBLE!" : "MISS", "#cfd8dc", 18); sfx("miss"); this.tweens.add({ targets: v.c, y: v.c.y - 12, duration: 90, yoyo: true }); await delay(120); break; }
      case "dmg": {
        const v = V(ev.id); if (!v) break;
        v.hp = Math.max(0, v.hp - ev.amount);
        const color = DT[ev.dtype] ?? "#fff";
        this.flash(v);
        this.float(v.c.x, v.c.y + v.top + 8, String(ev.amount), ev.crit ? "#ffd166" : v.u.team === "player" ? "#ff6b6b" : "#ffffff", ev.crit ? 34 : 24);
        this.particles.burst(v.c.x, v.c.y + v.top * 0.5, col(color), ev.crit ? 24 : 12, ev.crit ? 260 : 180);
        const frac = ev.amount / v.max;
        this.shake(ev.crit ? 4 : Math.ceil(frac * 8));
        if (ev.crit) { this.cameras.main.flash(110, 255, 240, 200); this.tweens.add({ targets: this.cameras.main, zoom: 1.05, duration: 90, yoyo: true }); }
        if (v.u.team === "player") sfx("hurt");
        this.tweens.add({ targets: v, shown: v.hp, duration: 260, onUpdate: () => this.bar(v) });
        await delay(ev.crit ? 190 : 90);
        break;
      }
      case "heal": { const v = V(ev.id); if (!v) break; v.hp = Math.min(v.max, v.hp + ev.amount); this.float(v.c.x, v.c.y + v.top + 8, "+" + ev.amount, "#69db7c", 24); this.particles.burst(v.c.x, v.c.y + v.top * 0.5, 0x69db7c, 12, 80, { up: true, g: -60 }); sfx("heal"); this.tweens.add({ targets: v, shown: v.hp, duration: 300, onUpdate: () => this.bar(v) }); await delay(140); break; }
      case "status": { const v = V(ev.id); if (!v) break; const d = D.conditions[ev.cond]; if (ev.on) { v.set.add(ev.cond); this.float(v.c.x, v.c.y + v.top - 10, `${d?.icon ?? ""} ${d?.name ?? ev.cond}`, d?.color ?? "#fff", 13); } else v.set.delete(ev.cond); this.condText(v); if (ev.on) await delay(60); break; }
      case "move": {
        const v = V(ev.id); if (!v) break;
        v.x = ev.to;
        await new Promise<void>((res) => this.tweens.add({ targets: v.c, x: this.xFor(ev.to), duration: ev.forced ? 150 : 170, ease: ev.forced ? "Back.easeOut" : "Quad.easeInOut", onComplete: () => res() }));
        v.c.setDepth(10 + ev.to);
        this.particles.burst(v.c.x, v.c.y, 0xb9a98a, 5, 60, { g: 100, life: 0.3, size: 2 });
        break;
      }
      case "dead": {
        const v = V(ev.id); if (!v) break;
        v.dead = true; v.set.clear(); this.condText(v); this.bar(v);
        this.particles.burst(v.c.x, v.c.y + v.top * 0.5, 0xffffff, 26, 260, { g: 200 });
        this.particles.burst(v.c.x, v.c.y + v.top * 0.5, col(v.u.pal?.[0] ?? "#ffffff"), 18, 200);
        sfx(v.u.team === "enemy" ? "death" : "death"); this.shake(3);
        this.tweens.add({ targets: v.c, alpha: 0, scaleY: 0.2, y: this.ground + 8, duration: 420, delay: 80 });
        v.name.setVisible(false);
        this.setMark(ui.combat?.target ?? null);
        await delay(260);
        break;
      }
      case "down": { const v = V(ev.id); if (!v) break; v.downed = true; this.tweens.add({ targets: v.img, angle: -90, duration: 260 }); this.float(v.c.x, v.c.y + v.top, "DOWNED", "#ff6b6b", 22); this.shake(4); await delay(200); break; }
      case "revive": { const v = V(ev.id); if (!v) break; v.downed = false; v.hp = Math.max(1, v.u.hp); v.shown = v.hp; this.tweens.add({ targets: v.img, angle: 0, duration: 240 }); this.bar(v); this.float(v.c.x, v.c.y + v.top, "UP!", "#69db7c", 24); this.particles.burst(v.c.x, v.c.y, 0xfff3a0, 20, 160, { up: true }); sfx("heal"); await delay(200); break; }
      case "dsave": { const v = V(ev.id); if (!v) break; this.float(v.c.x, v.c.y + v.top - 20, `Death save: ${ev.roll}`, ev.roll >= 10 ? "#69db7c" : "#ff6b6b", 16); await delay(300); break; }
      case "spawn": { const u = cs.units.find((x: any) => x.id === ev.id); if (u && !this.views[ev.id]) { this.makeView(u, true); sfx("spell"); } await delay(200); break; }
      case "hazard": this.drawArena(); break;
      case "crit": break;
      case "shake": this.shake(ev.amt ?? 2); break;
      case "over": await delay(200); break;
    }
  }
  update(t: number, dt: number) {
    this.particles.update(dt);
    const cs = this.cs;
    if (this.arrow.visible) {
      const id = this.arrow.getData("id"); const v = this.views[id];
      if (v && !v.dead) { this.arrow.setPosition(v.c.x, v.c.y + v.top - 54 + Math.sin(t / 160) * 4); } else this.arrow.setVisible(false);
    }
    const tid = ui.combat?.target; const tv = tid && this.views[tid];
    if (tv && !tv.dead) { this.tmark.setVisible(true).setPosition(tv.c.x, tv.c.y + 14 + Math.sin(t / 200) * 2); } else this.tmark.setVisible(false);
    this.hallu.setAlpha(ui.hallu ? 0.16 : 0);
    if (ui.hallu) this.hallu.setFillStyle(Phaser.Display.Color.GetColor((128 + 127 * Math.sin(t / 700)) | 0, (128 + 127 * Math.sin(t / 700 + 2.1)) | 0, (128 + 127 * Math.sin(t / 700 + 4.2)) | 0));
  }
}

export function createGame(parent: HTMLElement) {
  let pending: any = { name: "backdrop", data: { bg: "title" } };
  let booted = false;
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent, width: W, height: H, backgroundColor: "#0b0614", pixelArt: true, antialias: false, roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.NO_CENTER },
    render: { powerPreference: "high-performance", antialias: false, pixelArt: true },
    fps: { smoothStep: true }, input: { touch: true, mouse: true, keyboard: false },
    scene: [Boot, Backdrop, MapS, Combat],
  });
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => { try { game.scale.refresh(); } catch { /* ignore */ } });
    ro.observe(parent);
    game.events.once("destroy", () => ro.disconnect());
  }
  const apply = () => {
    const mgr = game.scene;
    for (const k of ["backdrop", "map", "combat"]) if (mgr.isActive(k) || mgr.isPaused(k) || mgr.isSleeping(k)) mgr.stop(k);
    mgr.start(pending.name, pending.data);
  };
  game.__booted = () => { booted = true; apply(); setTimeout(() => { try { game.scale.refresh(); } catch {} }, 50); };
  stage.scene = (name: any, data: any) => {
    pending = { name, data };
    stage.playEvent = async () => {};
    stage.refresh = () => {};
    if (!booted) return;
    const tryStart = (attempt = 0) => {
      try {
        const mgr = game.scene;
        const target = pending.data?.dungeonId ?? data?.dungeonId ?? null;
        if (name === "map" && target && !(getS()?.dungeons?.[target])) {
          if (attempt < 8) {
            setTimeout(() => tryStart(attempt + 1), 60);
            return;
          }
        }
        for (const k of ["backdrop", "map", "combat"]) if (mgr.isActive(k) || mgr.isPaused(k) || mgr.isSleeping(k)) mgr.stop(k);
        mgr.start(pending.name, pending.data);
      } catch {
        // ignore transient scene restarts during a run reset
      }
    };
    setTimeout(tryStart, 0);
  };
  return game;
}
