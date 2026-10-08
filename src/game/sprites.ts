// Procedural 64-bit style sprites: low-res canvas templates, auto-outlined, hue-shifted by AI visual_theme.
import { THEME_HUE } from "./ai";

export interface SpriteSpec { body: string; pal: string[]; hat?: string; wep?: string; theme?: string; flying?: boolean }
const W = 32;
const OUT = "#150b1f";

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}
function norm(c: string) { return c.length === 4 ? "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c; }

function draw(spec: SpriteSpec, ctx: CanvasRenderingContext2D) {
  const [a, b, c] = spec.pal.map(norm);
  const p = (x: number, y: number, w: number, h: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  switch (spec.body) {
    case "beast": {
      p(3, 12, 4, 3, shade(b, 1.1)); p(2, 10, 3, 3, shade(b, 1.1));
      p(6, 13, 18, 9, a); p(6, 19, 18, 3, shade(a, 0.8)); p(8, 13, 14, 2, shade(a, 1.2));
      for (const x of [7, 11, 18, 21]) p(x, 22, 3, 7, shade(a, 0.85));
      p(22, 9, 8, 8, a); p(28, 12, 3, 4, shade(a, 0.7)); p(22, 6, 3, 4, b); p(27, 6, 3, 4, b);
      p(25, 11, 2, 2, c); p(30, 13, 1, 1, "#111");
      p(23, 16, 6, 1, "#fff");
      break;
    }
    case "spider": {
      p(11, 13, 11, 9, a); p(12, 14, 6, 3, shade(a, 1.3)); p(13, 9, 7, 5, b);
      p(14, 10, 2, 2, c); p(17, 10, 2, 2, c); p(15, 12, 1, 1, c); p(18, 12, 1, 1, c);
      for (let i = 0; i < 4; i++) {
        p(9 - i, 14 + i * 3, 3, 1, b); p(6 - i, 15 + i * 3, 3, 2, b);
        p(22, 14 + i * 3, 3, 1, b); p(25 + i, 15 + i * 3, 3, 2, b);
      }
      p(18, 20, 3, 3, shade(a, 0.7));
      break;
    }
    case "bat": {
      p(13, 12, 6, 8, a); p(14, 8, 4, 5, a); p(14, 6, 1, 3, b); p(17, 6, 1, 3, b);
      p(14, 10, 1, 1, c); p(17, 10, 1, 1, c);
      for (let i = 0; i < 8; i++) { p(12 - i, 12 + (i >> 1) - (i < 3 ? 2 : 0), 1, 5 - (i >> 2), b); p(19 + i, 12 + (i >> 1) - (i < 3 ? 2 : 0), 1, 5 - (i >> 2), b); }
      p(5, 11, 8, 2, shade(b, 1.2)); p(19, 11, 8, 2, shade(b, 1.2));
      break;
    }
    case "ghost": {
      ctx.globalAlpha = 0.9;
      p(10, 6, 12, 18, a); p(9, 9, 14, 12, a); p(11, 4, 10, 4, shade(a, 1.15));
      for (let i = 0; i < 6; i++) p(9 + i * 2.4, 24 + (i % 2) * 2, 3, 3, a);
      p(8, 14, 3, 7, shade(a, 0.8)); p(21, 14, 3, 7, shade(a, 0.8));
      ctx.globalAlpha = 1;
      p(12, 10, 3, 4, c); p(17, 10, 3, 4, c); p(14, 17, 4, 3, b);
      break;
    }
    case "golem": {
      p(10, 3, 12, 8, a); p(12, 5, 3, 2, c); p(17, 5, 3, 2, c);
      p(6, 11, 20, 13, shade(a, 0.9)); p(8, 12, 16, 3, shade(a, 1.2));
      p(2, 12, 5, 13, a); p(25, 12, 5, 13, a); p(2, 24, 5, 4, shade(a, 0.7)); p(25, 24, 5, 4, shade(a, 0.7));
      p(8, 24, 6, 6, shade(a, 0.8)); p(18, 24, 6, 6, shade(a, 0.8));
      p(14, 15, 5, 5, c); p(15, 16, 3, 3, "#fff2a8");
      p(8, 18, 3, 1, b); p(21, 20, 3, 1, b);
      break;
    }
    case "dragon": {
      p(8, 14, 16, 9, a); p(8, 20, 16, 3, shade(a, 0.75)); p(9, 14, 14, 2, shade(a, 1.2));
      p(2, 18, 7, 3, a); p(0, 20, 4, 2, a);
      p(22, 8, 7, 8, a); p(28, 11, 4, 4, shade(a, 0.8)); p(23, 5, 2, 4, b); p(27, 5, 2, 4, b); p(25, 10, 2, 2, c);
      p(9, 23, 4, 7, shade(a, 0.8)); p(19, 23, 4, 7, shade(a, 0.8));
      for (let i = 0; i < 9; i++) { p(8 + i, 3 + (i >> 1), 2, 11 - (i >> 1), b); }
      p(10, 6, 7, 2, shade(b, 1.2));
      p(30, 14, 2, 1, c);
      break;
    }
    case "blob": {
      const rows = [[12, 8], [9, 14], [7, 18], [6, 20], [5, 22], [5, 22], [5, 22], [6, 20]];
      rows.forEach(([x, w], i) => p(x, 12 + i * 2 - 1, w, 3, i < 2 ? shade(a, 1.15) : i > 5 ? shade(a, 0.8) : a));
      p(10, 14, 3, 3, "#fff"); p(18, 14, 3, 3, "#fff"); p(11, 15, 2, 2, "#111"); p(19, 15, 2, 2, "#111");
      p(13, 21, 6, 1, b); p(9, 12, 3, 2, "#ffffffaa");
      break;
    }
    default: { // humanoid
      const skin = a, cloth = b, acc = c;
      p(11, 22, 4, 8, shade(cloth, 0.7)); p(17, 22, 4, 8, shade(cloth, 0.7)); p(10, 28, 5, 2, "#2a1a10"); p(17, 28, 5, 2, "#2a1a10");
      p(10, 13, 12, 10, cloth); p(10, 13, 12, 2, shade(cloth, 1.25)); p(10, 20, 12, 2, acc);
      p(7, 14, 3, 8, skin); p(22, 14, 3, 8, skin);
      p(11, 5, 10, 9, skin); p(11, 5, 10, 2, shade(skin, 0.85));
      p(13, 9, 2, 2, "#111"); p(17, 9, 2, 2, "#111"); p(14, 12, 4, 1, shade(skin, 0.6));
      if (spec.hat === "hood") { p(10, 3, 12, 5, cloth); p(9, 6, 3, 9, cloth); p(20, 6, 3, 9, cloth); p(11, 8, 10, 1, shade(cloth, 0.5)); }
      if (spec.hat === "helm") { p(10, 3, 12, 6, "#b8bcc8"); p(15, 2, 2, 3, acc); p(10, 8, 3, 6, "#9aa0ae"); p(19, 8, 3, 6, "#9aa0ae"); p(13, 9, 6, 1, "#222"); }
      if (spec.hat === "horns") { p(10, 2, 2, 4, acc); p(20, 2, 2, 4, acc); p(9, 1, 2, 2, acc); p(21, 1, 2, 2, acc); }
      if (spec.hat === "crown") { p(11, 2, 10, 3, "#ffd23f"); p(11, 0, 2, 3, "#ffd23f"); p(15, 0, 2, 3, "#ffd23f"); p(19, 0, 2, 3, "#ffd23f"); }
      if (spec.hat === "pointy") { p(9, 4, 14, 2, cloth); p(12, 1, 8, 4, cloth); p(14, 0, 4, 2, cloth); p(12, 4, 8, 1, acc); }
      if (spec.hat === "mitre") { p(11, 2, 10, 4, "#fff4cf"); p(15, 0, 2, 4, acc); }
      if (spec.wep === "sword") { p(25, 6, 2, 14, "#e4e9f2"); p(25, 6, 1, 14, "#fff"); p(23, 20, 6, 2, acc); p(25, 22, 2, 3, "#6b3a1a"); }
      if (spec.wep === "dagger") { p(25, 12, 2, 8, "#e4e9f2"); p(24, 20, 4, 1, acc); p(25, 21, 2, 2, "#6b3a1a"); p(5, 13, 2, 7, "#e4e9f2"); }
      if (spec.wep === "bow") { p(26, 6, 2, 2, "#8b5a2b"); p(27, 8, 2, 12, "#8b5a2b"); p(26, 20, 2, 2, "#8b5a2b"); p(26, 8, 1, 12, "#ddd"); }
      if (spec.wep === "staff") { p(25, 5, 2, 24, "#8b5a2b"); p(23, 1, 6, 5, acc); p(24, 2, 4, 3, "#fff"); }
      if (spec.wep === "mace") { p(25, 10, 2, 16, "#8b5a2b"); p(23, 6, 6, 6, "#c0c4cc"); p(24, 7, 4, 4, acc); }
      if (spec.wep === "hammer") { p(25, 10, 2, 16, "#8b5a2b"); p(22, 5, 8, 6, "#c0c4cc"); p(23, 6, 6, 1, "#fff"); }
      if (spec.wep === "shield") { p(3, 14, 6, 9, acc); p(4, 15, 4, 7, shade(acc, 1.3)); }
    }
  }
}
function outline(cv: HTMLCanvasElement) {
  const ctx = cv.getContext("2d")!;
  const img = ctx.getImageData(0, 0, W, W);
  const d = img.data;
  const out = new Uint8ClampedArray(d);
  const al = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= W ? 0 : d[(y * W + x) * 4 + 3]);
  const rgb = parseInt(OUT.slice(1), 16);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (al(x, y) > 40) continue;
    if (al(x - 1, y) > 40 || al(x + 1, y) > 40 || al(x, y - 1) > 40 || al(x, y + 1) > 40) {
      const i = (y * W + x) * 4; out[i] = (rgb >> 16) & 255; out[i + 1] = (rgb >> 8) & 255; out[i + 2] = rgb & 255; out[i + 3] = 255;
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
}
function recolor(cv: HTMLCanvasElement, hue: number) {
  const ctx = cv.getContext("2d")!;
  const img = ctx.getImageData(0, 0, W, W);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) continue;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn;
    const s = dl === 0 ? 0 : dl / (1 - Math.abs(2 * l - 1));
    if (s < 0.22 || l < 0.12 || l > 0.93) continue;
    // hslToRgb with target hue
    const c2 = (1 - Math.abs(2 * l - 1)) * s, hp = hue / 60, x = c2 * (1 - Math.abs((hp % 2) - 1)), m = l - c2 / 2;
    let rr = 0, gg = 0, bb = 0;
    if (hp < 1) [rr, gg, bb] = [c2, x, 0]; else if (hp < 2) [rr, gg, bb] = [x, c2, 0]; else if (hp < 3) [rr, gg, bb] = [0, c2, x];
    else if (hp < 4) [rr, gg, bb] = [0, x, c2]; else if (hp < 5) [rr, gg, bb] = [x, 0, c2]; else [rr, gg, bb] = [c2, 0, x];
    d[i] = (rr + m) * 255; d[i + 1] = (gg + m) * 255; d[i + 2] = (bb + m) * 255;
  }
  ctx.putImageData(img, 0, 0);
}
function whiten(src: HTMLCanvasElement): HTMLCanvasElement {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = W;
  const ctx = cv.getContext("2d")!; ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, W, W);
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] > 10) { img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; }
  ctx.putImageData(img, 0, 0);
  return cv;
}
export function spriteKey(s: SpriteSpec) { return `spr_${s.body}_${s.hat ?? ""}_${s.wep ?? ""}_${s.pal.join("").replace(/#/g, "")}_${s.theme ?? "n"}`; }
/** Creates (once) a texture + a white 'flash' texture for the spec; returns key. */
export function ensureSprite(textures: { exists(k: string): boolean; addCanvas(k: string, c: HTMLCanvasElement): unknown }, s: SpriteSpec): string {
  const key = spriteKey(s);
  if (textures.exists(key)) return key;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = W;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  draw(s, ctx);
  const hue = s.theme ? THEME_HUE[s.theme] ?? -1 : -1;
  if (hue >= 0) recolor(cv, hue);
  outline(cv);
  textures.addCanvas(key, cv);
  textures.addCanvas(key + "_w", whiten(cv));
  return key;
}
const CLS_LOOK: Record<string, { hat: string; wep: string; extra?: string }> = {
  knight: { hat: "helm", wep: "sword" }, rogue: { hat: "hood", wep: "dagger" }, mage: { hat: "pointy", wep: "staff" }, cleric: { hat: "mitre", wep: "mace" },
  ranger: { hat: "hood", wep: "bow" }, paladin: { hat: "helm", wep: "hammer" },
};
export function classSpec(plan: string, color: string): SpriteSpec {
  const l = CLS_LOOK[plan] ?? CLS_LOOK.knight;
  return { body: "humanoid", pal: ["#e8b890", color, "#ffd23f"], hat: l.hat, wep: l.wep };
}
