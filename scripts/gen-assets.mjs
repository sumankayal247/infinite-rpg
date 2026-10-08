// Asset pipeline: JPG/PNG -> AVIF (images), synthesized chiptune -> Opus (audio).
// Usage: node scripts/gen-assets.mjs <path-to-ffmpeg>
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { execFileSync } from "child_process";

const FF = process.argv[2] || "ffmpeg";
const root = process.cwd();

// ---------- Images -> AVIF ----------
const bgDir = path.join(root, "public/assets/backgrounds");
for (const f of fs.readdirSync(bgDir)) {
  if (!/\.(jpg|jpeg|png)$/i.test(f)) continue;
  const out = path.join(bgDir, f.replace(/\.(jpg|jpeg|png)$/i, ".avif"));
  await sharp(path.join(bgDir, f)).resize(960, 540, { fit: "cover" }).avif({ quality: 52, effort: 4 }).toFile(out);
  fs.unlinkSync(path.join(bgDir, f));
  console.log("avif", out);
}

// ---------- Audio -> Opus ----------
const SR = 22050;
const audDir = path.join(root, "public/assets/audio");
fs.mkdirSync(audDir, { recursive: true });
const tmp = fs.mkdtempSync("/tmp/aud-");
let seed = 1234;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

function render(seconds) { return new Float32Array(Math.floor(seconds * SR)); }
function osc(type, ph) {
  const p = ph % 1;
  if (type === "square") return p < 0.5 ? 1 : -1;
  if (type === "pulse") return p < 0.25 ? 1 : -1;
  if (type === "tri") return 4 * Math.abs(p - 0.5) - 1;
  if (type === "saw") return 2 * p - 1;
  if (type === "noise") return rnd() * 2 - 1;
  return Math.sin(p * Math.PI * 2);
}
function note(buf, t0, dur, f0, f1, type, vol, decay = 3) {
  const s = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  let ph = 0;
  for (let i = 0; i < n && s + i < buf.length; i++) {
    const k = i / n;
    const f = f0 + (f1 - f0) * k;
    ph += f / SR;
    const env = Math.min(1, i / (SR * 0.004)) * Math.exp(-decay * k);
    buf[s + i] += osc(type, ph) * vol * env;
  }
}
function writeWav(name, buf) {
  const data = Buffer.alloc(44 + buf.length * 2);
  data.write("RIFF", 0); data.writeUInt32LE(36 + buf.length * 2, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(buf.length * 2, 40);
  let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0.95 ? 0.95 / peak : 1;
  for (let i = 0; i < buf.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * g)) * 32767), 44 + i * 2);
  const wav = path.join(tmp, name + ".wav");
  fs.writeFileSync(wav, data);
  const out = path.join(audDir, name + ".opus");
  execFileSync(FF, ["-y", "-loglevel", "error", "-i", wav, "-c:a", "libopus", "-b:a", "28k", "-ac", "1", out]);
  console.log("opus", out);
}

// SFX
const sfx = {
  hit: (b) => { note(b, 0, 0.12, 220, 70, "square", 0.5, 5); note(b, 0, 0.1, 0, 0, "noise", 0.4, 8); },
  crit: (b) => { note(b, 0, 0.25, 300, 60, "saw", 0.5, 4); note(b, 0, 0.18, 0, 0, "noise", 0.5, 6); note(b, 0.08, 0.3, 880, 1320, "square", 0.3, 4); },
  miss: (b) => { note(b, 0, 0.18, 600, 200, "noise", 0.25, 4); note(b, 0, 0.18, 500, 250, "tri", 0.2, 4); },
  heal: (b) => { [72, 76, 79, 84].forEach((n, i) => note(b, i * 0.07, 0.2, hz(n), hz(n), "tri", 0.4, 3)); },
  spell: (b) => { note(b, 0, 0.4, 300, 1200, "sine", 0.4, 2); note(b, 0.05, 0.35, 450, 1800, "square", 0.15, 3); },
  fire: (b) => { note(b, 0, 0.4, 0, 0, "noise", 0.45, 3); note(b, 0, 0.3, 160, 60, "saw", 0.3, 3); },
  click: (b) => { note(b, 0, 0.05, 900, 700, "square", 0.3, 6); },
  dice: (b) => { for (let i = 0; i < 7; i++) note(b, i * 0.07, 0.04, 500 + rnd() * 500, 300, "square", 0.25, 6); },
  levelup: (b) => { [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => note(b, i * 0.09, 0.3, hz(n), hz(n), "square", 0.3, 2.5)); },
  coin: (b) => { note(b, 0, 0.08, hz(83), hz(83), "square", 0.3, 4); note(b, 0.07, 0.25, hz(88), hz(88), "square", 0.3, 3); },
  hurt: (b) => { note(b, 0, 0.25, 260, 90, "saw", 0.45, 3); },
  death: (b) => { note(b, 0, 0.8, 300, 40, "saw", 0.5, 2.5); note(b, 0, 0.5, 0, 0, "noise", 0.3, 4); },
  win: (b) => { [67, 67, 67, 72, 76, 79].forEach((n, i) => note(b, i * 0.13, 0.25, hz(n), hz(n), "square", 0.3, 2)); },
  lose: (b) => { [60, 58, 56, 53].forEach((n, i) => note(b, i * 0.3, 0.5, hz(n), hz(n), "tri", 0.5, 2)); },
};
for (const [k, fn] of Object.entries(sfx)) { const b = render(1.2); fn(b); writeWav("sfx_" + k, b); }

// Music loops
function music(name, { bpm, chords, lead, bassType = "tri", leadType = "square", arp = true, hats = false, bars = 8 }) {
  const beat = 60 / bpm, secs = bars * 4 * beat;
  const b = render(secs);
  for (let bar = 0; bar < bars; bar++) {
    const ch = chords[bar % chords.length];
    const t = bar * 4 * beat;
    for (let i = 0; i < 4; i++) note(b, t + i * beat, beat * 0.9, hz(ch[0] - 12), hz(ch[0] - 12), bassType, 0.32, 1.6);
    if (arp) for (let i = 0; i < 16; i++) { const n = ch[i % 3] + (i % 6 > 2 ? 12 : 0); note(b, t + i * beat / 4, beat / 4, hz(n), hz(n), "pulse", 0.07, 3); }
    if (hats) for (let i = 0; i < 8; i++) note(b, t + i * beat / 2, 0.05, 0, 0, "noise", 0.09, 8);
    // lead: scale-based melody
    const scale = lead;
    for (let i = 0; i < 8; i++) {
      if (rnd() < 0.25) continue;
      const n = scale[Math.floor(rnd() * scale.length)] + (rnd() < 0.3 ? 12 : 0);
      note(b, t + i * beat / 2, beat * 0.45, hz(n), hz(n), leadType, 0.13, 2);
    }
  }
  writeWav("bgm_" + name, b);
}
music("explore", { bpm: 88, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], lead: [69, 72, 74, 76, 79] });
music("combat", { bpm: 150, chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]], lead: [64, 67, 69, 71, 74], hats: true, bassType: "saw", leadType: "pulse" });
music("boss", { bpm: 132, chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]], lead: [62, 65, 67, 69, 72], hats: true, bassType: "saw", leadType: "saw" });
music("title", { bpm: 76, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], lead: [62, 65, 69, 72, 74] });
