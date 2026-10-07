/**
 * ascii.js
 * Deterministic ASCII world map generator.
 * Math-owned (engine-side). AI never touches layout, only narrates it.
 * Theme: primary CRT green #33ff33 on #0c0c0c.
 */

// Seeded RNG (mulberry32) - deterministic per run/level
export function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Terrain chars (plain ASCII only - reliable everywhere)
export const TILE = {
  BORDER_H: "-",
  BORDER_V: "|",
  CORNER: "+",
  PLAINS: ".",
  FOREST: "T",   // Whispering Woods
  WATER: "~",
  PEAK: "^",     // Crimson Peaks
  SAND: ":",     // Desolate Dunes
  ABYSS: "x",    // Abyssal Depths
  PATH: "#",
  PLAYER: "@",
  BOSS: "B",
  COMBAT: "X",
  ELITE: "E",
  SHOP: "$",
  CAMPFIRE: "+",
  MYSTERY: "?",
};

export function regionForLevel(level) {
  if (level >= 15) return "abyss";
  if (level >= 10) return "peaks";
  if (level >= 5) return "dunes";
  return "woods";
}

export function generateWorldMap(seed = 1234, level = 1, w = 48, h = 18) {
  const rand = seededRng(seed + level * 7919);
  const region = regionForLevel(level);
  const grid = [];

  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const isBorder = y === 0 || y === h - 1 || x === 0 || x === w - 1;
      if (isBorder) {
        row.push((y === 0 || y === h - 1) ? TILE.BORDER_H : TILE.BORDER_V);
        continue;
      }
      const r = rand();
      let t = TILE.PLAINS;
      if (region === "woods") {
        if (r < 0.22) t = TILE.FOREST;
        else if (r < 0.30) t = TILE.WATER;
      } else if (region === "dunes") {
        if (r < 0.25) t = TILE.SAND;
        else if (r < 0.30) t = TILE.PEAK;
      } else if (region === "peaks") {
        if (r < 0.25) t = TILE.PEAK;
        else if (r < 0.32) t = TILE.FOREST;
      } else {
        if (r < 0.20) t = TILE.ABYSS;
        else if (r < 0.28) t = TILE.WATER;
      }
      row.push(t);
    }
    grid.push(row);
  }

  // Corners
  grid[0][0] = TILE.CORNER; grid[0][w-1] = TILE.CORNER;
  grid[h-1][0] = TILE.CORNER; grid[h-1][w-1] = TILE.CORNER;

  // Vertical path: boss top-center -> middle fork -> player bottom-center
  const cx = Math.floor(w / 2);
  for (let y = 1; y < h - 1; y++) grid[y][cx] = TILE.PATH;
  // Fork arms in middle row
  const midY = Math.floor(h / 2);
  for (let x = cx - 10; x <= cx + 10; x++) grid[midY][x] = TILE.PATH;

  // Place nodes on the fork: left / center / right
  const nodes = [
    { col: cx - 10, row: midY, type: "Combat" },
    { col: cx, row: midY, type: "Mystery" },
    { col: cx + 10, row: midY, type: "Shop" },
  ];
  // Randomize types deterministically but keep 3 distinct paths
  const pool = ["Combat", "Elite Combat", "Shop", "Mystery", "Campfire"];
  nodes.forEach((n) => {
    n.type = pool[Math.floor(rand() * pool.length)];
    const ch =
      n.type === "Shop" ? TILE.SHOP :
      n.type === "Campfire" ? TILE.CAMPFIRE :
      n.type === "Mystery" ? TILE.MYSTERY :
      n.type === "Elite Combat" ? TILE.ELITE : TILE.COMBAT;
    grid[n.row][n.col] = ch;
    n.id = `node_${seed}_${n.col}_${n.row}`;
    n.tier = 1;
  });

  // Player + Boss markers
  grid[h - 2][cx] = TILE.PLAYER;
  grid[1][cx] = TILE.BOSS;

  return { grid, nodes, region, seed, level, w, h };
}

export function renderAscii(map) {
  return map.grid.map((row) => row.join("")).join("\n");
}

export const LEGEND = [
  "@ you  B boss  X combat  E elite",
  "$ shop  + campfire  ? mystery",
  "T woods  ^ peaks  : dunes  ~ water",
].join("\n");
