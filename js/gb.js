/**
 * gb.js
 * Game Boy 4-shade renderer for the deterministic world layout.
 * Layout math stays engine-owned (ascii.js / map.js).
 * This file is pure presentation: tile colors + pixel details.
 */

export const GB = {
  LIGHTEST: 0x9bbc0f, // screen background
  LIGHT: 0x8bac0f,
  DARK: 0x306230,
  DARKEST: 0x0f380f,
  CSS: {
    LIGHTEST: "#9bbc0f",
    LIGHT: "#8bac0f",
    DARK: "#306230",
    DARKEST: "#0f380f",
  },
};

// Terrain -> base tile color
export function tileColor(ch) {
  switch (ch) {
    case "T": return GB.DARK;      // forest
    case "~": return GB.DARKEST;   // water
    case "^": return GB.LIGHT;     // peaks
    case ":": return GB.LIGHT;     // dunes
    case "x": return GB.DARK;      // abyss
    case "#": return GB.LIGHT;     // path
    case "+": return GB.LIGHT;     // campfire
    case "$": return GB.LIGHT;     // shop
    case "?": return GB.LIGHT;     // mystery
    case "X": return GB.LIGHT;     // combat
    case "E": return GB.LIGHT;     // elite
    case "@": return GB.LIGHTEST;  // player
    case "B": return GB.LIGHT;     // boss
    case "-":
    case "|":
    case "+": // border chars share campfire "+" — disambiguated by position
      return GB.DARKEST;
    default: return GB.LIGHTEST;   // plains "."
  }
}

// Deterministic 2-bit dither detail per tile (no RNG in renderer)
export function drawTileDetail(scene, ch, px, py, s, isBorder) {
  const d = Math.max(2, Math.floor(s / 5));
  if (isBorder) {
    // rivets on the bezel edge
    scene.add.rectangle(px + s / 2, py + s / 2, d, d, GB.LIGHTEST).setOrigin(0.5);
    return;
  }
  if (ch === "T") {
    // tree canopy: two light pixels
    scene.add.rectangle(px + s * 0.3, py + s * 0.35, d, d, GB.LIGHTEST).setOrigin(0.5);
    scene.add.rectangle(px + s * 0.65, py + s * 0.6, d, d, GB.LIGHT).setOrigin(0.5);
  } else if (ch === "~") {
    // wave dash
    scene.add.rectangle(px + s / 2, py + s / 2, s * 0.5, d, GB.LIGHT).setOrigin(0.5);
  } else if (ch === "^") {
    // peak cap
    scene.add.rectangle(px + s / 2, py + s * 0.35, s * 0.4, d, GB.DARKEST).setOrigin(0.5);
  } else if (ch === ":") {
    scene.add.rectangle(px + s * 0.35, py + s * 0.6, d, d, GB.DARK).setOrigin(0.5);
  } else if (ch === "x") {
    scene.add.rectangle(px + s / 2, py + s / 2, d * 1.4, d * 1.4, GB.DARKEST).setOrigin(0.5);
  } else if (ch === "#") {
    // cobble dots
    scene.add.rectangle(px + s * 0.3, py + s * 0.5, d, d, GB.DARK).setOrigin(0.5);
    scene.add.rectangle(px + s * 0.7, py + s * 0.5, d, d, GB.DARK).setOrigin(0.5);
  }
}

// Short screen-reader description of the world (no ASCII dump)
export function describeWorld(world) {
  const names = (world.nodes || []).map((n) => n.type).join(", ");
  return `Game Boy map. Region ${world.region}, seed ${world.seed}. Paths: ${names}. You are at the south gate, boss at the north gate.`;
}
