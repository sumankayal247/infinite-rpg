// Dynamic BGM + SFX (Opus files, with synthesized WebAudio fallback). Crossfades by scene / hostility / theme.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
const buffers: Record<string, AudioBuffer | null> = {};
const loading: Record<string, Promise<AudioBuffer | null>> = {};
let sfxOn = true, musicOn = true;
let cur: { name: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let wantTrack = "";

export function initAudio() {
  if (ctx || typeof window === "undefined") return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
  } catch { ctx = null; }
}
export function unlockAudio() {
  initAudio();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  if (wantTrack && !cur) music(wantTrack);
}
export function setAudioPrefs(sfx: boolean, mus: boolean) {
  sfxOn = sfx; musicOn = mus;
  if (!musicOn && cur) fadeOut(cur, 0.3), (cur = null);
  if (musicOn && wantTrack && !cur) music(wantTrack);
}
function load(name: string): Promise<AudioBuffer | null> {
  if (!ctx) return Promise.resolve(null);
  if (name in buffers) return Promise.resolve(buffers[name]);
  if (!loading[name]) {
    loading[name] = fetch(`/assets/audio/${name}.opus`).then((r) => r.arrayBuffer()).then((b) => ctx!.decodeAudioData(b)).then((b) => (buffers[name] = b)).catch(() => (buffers[name] = null));
  }
  return loading[name];
}
export function preload() { initAudio(); ["sfx_hit", "sfx_crit", "sfx_miss", "sfx_click", "sfx_dice", "sfx_heal", "sfx_spell"].forEach((n) => load(n)); }
function synth(kind: string) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  const f: Record<string, [number, number, OscillatorType]> = { hit: [220, 70, "square"], crit: [300, 60, "sawtooth"], miss: [500, 200, "triangle"], heal: [520, 900, "triangle"], spell: [300, 1200, "sine"], click: [900, 700, "square"], dice: [600, 300, "square"], coin: [1200, 1600, "square"], levelup: [500, 1000, "square"], hurt: [260, 90, "sawtooth"], death: [300, 40, "sawtooth"], fire: [160, 60, "sawtooth"], win: [600, 900, "square"], lose: [300, 150, "triangle"] };
  const [a, b, type] = f[kind] ?? f.click;
  o.type = type; o.frequency.setValueAtTime(a, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, b), t + 0.18);
  g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.22);
}
export function sfx(kind: string, rate = 1) {
  if (!sfxOn) return;
  initAudio();
  if (!ctx || !master) return;
  const name = "sfx_" + kind;
  const b = buffers[name];
  if (b) {
    const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    s.connect(master); s.start();
  } else {
    if (!(name in buffers)) load(name);
    synth(kind);
  }
}
function fadeOut(c: { src: AudioBufferSourceNode; gain: GainNode }, secs: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  c.gain.gain.cancelScheduledValues(t); c.gain.gain.setValueAtTime(c.gain.gain.value, t); c.gain.gain.linearRampToValueAtTime(0, t + secs);
  try { c.src.stop(t + secs + 0.05); } catch { /* ended */ }
}
/** Crossfade to a track name: explore | combat | boss | title */
export async function music(name: string) {
  wantTrack = name;
  if (!musicOn) return;
  initAudio();
  if (!ctx || !musicGain || ctx.state === "suspended") return;
  if (cur?.name === name) return;
  const b = await load("bgm_" + name);
  if (!b || wantTrack !== name || !ctx || !musicGain) return;
  if (cur?.name === name) return;
  const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
  const gain = ctx.createGain(); gain.gain.value = 0;
  src.connect(gain); gain.connect(musicGain); src.start();
  gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
  if (cur) fadeOut(cur, 1.2);
  cur = { name, src, gain };
}
/** Map AI JSON (is_hostile / visual_theme) to a track. */
export function trackFor(opts: { hostile?: boolean; boss?: boolean; scene?: string }): string {
  if (opts.boss) return "boss";
  if (opts.hostile) return "combat";
  if (opts.scene === "title") return "title";
  return "explore";
}
export function pauseMusic(p: boolean) { if (!ctx) return; if (p) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); }
