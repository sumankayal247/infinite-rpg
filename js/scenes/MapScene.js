import * as Engine from "../engine.js";
import * as MapSys from "../map.js";
import * as UI from "../ui.js";
import { GB, tileColor, drawTileDetail, describeWorld } from "../gb.js";

// Game Boy presentation over the deterministic engine layout.
// Canvas 800x600. Screen rect centered, square-ish tiles.
const SCREEN = { x: 150, y: 80, w: 500, h: 380 };
const TITLE_Y = 28;
const HINT_Y = 560;

function gridToPixels(col, row, world) {
  const cellW = SCREEN.w / world.w;
  const cellH = SCREEN.h / world.h;
  return {
    x: SCREEN.x + (col + 0.5) * cellW,
    y: SCREEN.y + (row + 0.5) * cellH,
    cellW,
    cellH,
  };
}

export default class MapScene extends Phaser.Scene {
  constructor() {
    super("MapScene");
  }
  create() {
    Engine.gameState.phaserScene = this;
    this.showWorld();
  }

  resetMap() {
    this.showWorld();
  }

  currentWorld() {
    const seed = Engine.gameState.runSeed || 1234;
    const world =
      Engine.gameState.map.currentWorld ||
      MapSys.generateWorld(seed, Engine.gameState.player.level);
    Engine.gameState.map.currentWorld = world;
    return world;
  }

  drawBezel() {
    // GB body: dark frame around light screen
    this.add.rectangle(400, 300, 560, 460, GB.DARKEST).setOrigin(0.5);
    this.add
      .rectangle(
        SCREEN.x + SCREEN.w / 2,
        SCREEN.y + SCREEN.h / 2,
        SCREEN.w + 16,
        SCREEN.h + 16,
        GB.DARK,
      )
      .setOrigin(0.5);
    this.add
      .rectangle(
        SCREEN.x + SCREEN.w / 2,
        SCREEN.y + SCREEN.h / 2,
        SCREEN.w,
        SCREEN.h,
        GB.LIGHTEST,
      )
      .setOrigin(0.5);
  }

  drawTiles(world) {
    const cellW = SCREEN.w / world.w;
    const cellH = SCREEN.h / world.h;
    const s = Math.min(cellW, cellH);
    for (let row = 0; row < world.h; row++) {
      for (let col = 0; col < world.w; col++) {
        const ch = world.grid[row][col];
        const isBorder =
          row === 0 || row === world.h - 1 || col === 0 || col === world.w - 1;
        const px = SCREEN.x + col * cellW;
        const py = SCREEN.y + row * cellH;
        // base tile
        this.add
          .rectangle(
            px + cellW / 2,
            py + cellH / 2,
            cellW - 0.5,
            cellH - 0.5,
            tileColor(ch),
          )
          .setOrigin(0.5);
        drawTileDetail(this, ch, px, py, s, isBorder);
      }
    }
  }

  drawActor(col, row, world, kind) {
    const { x, y, cellW } = gridToPixels(col, row, world);
    const r = Math.max(7, cellW * 0.9);
    if (kind === "player") {
      // pixel hero: dark body, light face
      this.add.circle(x, y, r, GB.DARKEST);
      this.add.circle(x, y - 1, r * 0.45, GB.LIGHTEST);
    } else {
      // boss: dark skull block with light eyes
      this.add.rectangle(x, y, r * 1.7, r * 1.7, GB.DARKEST).setOrigin(0.5);
      this.add.rectangle(x - 3, y - 1, 3, 3, GB.LIGHTEST).setOrigin(0.5);
      this.add.rectangle(x + 3, y - 1, 3, 3, GB.LIGHTEST).setOrigin(0.5);
      this.add
        .text(x, y - r - 8, "BOSS", {
          fontFamily: "Courier",
          fontSize: "11px",
          color: GB.CSS.DARKEST,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
    }
  }

  drawChrome(world, footer) {
    this.add
      .text(400, TITLE_Y, "WORLD MAP", {
        fontFamily: "Courier",
        fontSize: "26px",
        color: "#33ff33",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    this.add
      .text(
        400,
        HINT_Y,
        `${world.region.toUpperCase()} | seed ${world.seed}\n${footer}`,
        {
          fontFamily: "Courier",
          fontSize: "13px",
          color: "#33ff33",
          align: "center",
          lineSpacing: 3,
        },
      )
      .setOrigin(0.5, 1);
  }

  drawBase(world, footer) {
    this.children.removeAll();
    this.drawBezel();
    this.drawTiles(world);
    // actors: boss top-center, player bottom-center
    const cx = Math.floor(world.w / 2);
    this.drawActor(cx, 1, world, "boss");
    this.drawActor(cx, world.h - 2, world, "player");
    this.drawChrome(world, footer);
    UI.renderAsciiMap(`World map. ${describeWorld(world)} ${footer}`);
  }

  showWorld() {
    const world = this.currentWorld();
    this.drawBase(world, "Press Explore Map");
  }

  renderMap(nodes, onNodeClicked) {
    const world = this.currentWorld();
    const list = (world && world.nodes) || nodes;
    this.drawBase(
      world,
      "Choose: " + list.map((n) => n.type).join(" | "),
    );

    list.forEach((node) => {
      const col = node.col ?? 24;
      const row = node.row ?? 9;
      const { x, y, cellW } = gridToPixels(col, row, world);
      const R = Math.max(16, cellW * 2.2);

      this.add.circle(x, y, R + 4, GB.DARKEST);
      const circle = this.add
        .circle(x, y, R, this.getColorHex(node.type))
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, y, this.getGlyph(node.type), {
          fontFamily: "Courier",
          fontSize: "18px",
          color: this.getGlyphColor(node.type),
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + R + 4, node.type, {
          fontFamily: "Courier",
          fontSize: "12px",
          color: "#33ff33",
          backgroundColor: "#000000",
          padding: 2,
        })
        .setOrigin(0.5, 0);

      circle.on("pointerdown", () => {
        this.input.enabled = false;
        onNodeClicked(node);
      });
      circle.on("pointerover", () => circle.setScale(1.12));
      circle.on("pointerout", () => circle.setScale(1));
    });
    this.input.enabled = true;
  }

  getGlyph(type) {
    if (type === "Shop") return "$";
    if (type === "Campfire") return "+";
    if (type === "Mystery") return "?";
    if (type === "Elite Combat") return "E";
    return "X";
  }

  getColorHex(type) {
    if (type === "Campfire") return 0xff8800;
    if (type === "Shop") return 0xffff00;
    if (type === "Mystery") return 0xaa00ff;
    if (type === "Elite Combat") return 0xff0000;
    return 0x33ff33;
  }

  getGlyphColor(type) {
    if (type === "Shop" || type === "Campfire") return "#000000";
    return "#000000";
  }
}
