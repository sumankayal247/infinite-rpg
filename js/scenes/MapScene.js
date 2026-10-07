import * as Engine from "../engine.js";
import * as MapSys from "../map.js";
import * as UI from "../ui.js";

// Single visual source: ASCII drawn INSIDE Phaser.
// DOM <pre> is screen-reader fallback only (visually hidden in CSS).
const MAP_PX = { x: 80, y: 70, w: 640, h: 380 };
const TITLE_Y = 30;
const HINT_Y = 560;

function gridToPixels(col, row, world) {
  return {
    x: MAP_PX.x + (col / (world.w - 1)) * MAP_PX.w,
    y: MAP_PX.y + (row / (world.h - 1)) * MAP_PX.h,
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

  drawAscii(world, footer) {
    this.children.removeAll();
    // Title (single, above map — no overlap)
    this.add
      .text(400, TITLE_Y, "WORLD MAP", {
        fontFamily: "Courier",
        fontSize: "28px",
        color: "#33ff33",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    // ASCII canvas text — scaled to fill viewport
    this.add
      .text(400, MAP_PX.y + MAP_PX.h / 2, world.ascii, {
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: "14px",
        color: "#33ff33",
        align: "left",
        lineSpacing: 1,
      })
      .setOrigin(0.5);

    // Footer: legend + region/seed + hint
    this.add
      .text(
        400,
        HINT_Y,
        `${world.legend}\n-- ${world.region} | seed ${world.seed} --\n${footer}`,
        {
          fontFamily: "Courier",
          fontSize: "13px",
          color: "#33ff33",
          align: "center",
          lineSpacing: 2,
        },
      )
      .setOrigin(0.5, 1);

    // Accessible mirror (hidden visually)
    UI.renderAsciiMap(
      `WORLD MAP\n${world.ascii}\n${world.legend}\n${world.region} seed ${world.seed}. ${footer}`,
    );
  }

  showWorld() {
    const world = this.currentWorld();
    this.drawAscii(world, "Press Explore Map");
  }

  renderMap(nodes, onNodeClicked) {
    const world = this.currentWorld();
    const list = (world && world.nodes) || nodes;
    this.drawAscii(world, "Choose: " + list.map((n) => n.type).join(" | "));

    list.forEach((node) => {
      // Pin circles to the fork cells from ascii.js (col/row),
      // fall back to even spacing if coords missing.
      const col = node.col ?? 24;
      const row = node.row ?? 9;
      const { x, y } = gridToPixels(col, row, world);

      // Glow ring + node
      this.add.circle(x, y, 34, 0x225522, 0.45);
      const circle = this.add
        .circle(x, y, 22, this.getColor(node.type))
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, y, this.getGlyph(node.type), {
          fontFamily: "Courier",
          fontSize: "20px",
          color: "#000000",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 30, node.type, {
          fontFamily: "Courier",
          fontSize: "13px",
          color: "#33ff33",
          backgroundColor: "#000000",
          padding: 2,
        })
        .setOrigin(0.5, 0);

      circle.on("pointerdown", () => {
        this.input.enabled = false;
        onNodeClicked(node);
      });
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

  getColor(type) {
    if (type === "Campfire") return 0xff8800; // Orange
    if (type === "Shop") return 0xffff00; // Yellow
    if (type === "Mystery") return 0xaa00ff; // Purple
    if (type === "Elite Combat") return 0xff0000; // Red
    return 0x33ff33; // Theme green for normal combat
  }
}
