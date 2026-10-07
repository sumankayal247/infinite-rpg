import * as Engine from "../engine.js";
import * as MapSys from "../map.js";
import * as UI from "../ui.js";

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

  showWorld() {
    this.children.removeAll();
    const seed = Engine.gameState.runSeed || 1234;
    const world = MapSys.generateWorld(seed, Engine.gameState.player.level);
    Engine.gameState.map.currentWorld = world;
    // DOM ASCII mirror (reliable, no WebGL dependency) in theme green
    UI.renderAsciiMap(world.ascii + "\n\n" + world.legend + `\n-- ${world.region} | seed ${world.seed} --`);
    this.add
      .text(400, 50, "WORLD MAP", {
        fontFamily: "Courier",
        fontSize: "32px",
        color: "#33ff33",
      })
      .setOrigin(0.5);
    this.add
      .text(400, 560, "Choose a glowing path node", {
        fontFamily: "Courier",
        fontSize: "16px",
        color: "#33ff33",
      })
      .setOrigin(0.5);
  }

  renderMap(nodes, onNodeClicked) {
    // nodes come from the current ASCII world fork
    const world = Engine.gameState.map.currentWorld;
    const list = (world && world.nodes) || nodes;
    UI.renderAsciiMap(
      (world ? world.ascii : "") + "\n\n" + MapSysNameLegend() + "\nChoose: " +
        list.map((n) => n.type).join(" | "),
    );
    this.children.removeAll();

    this.add
      .text(400, 50, "CHOOSE YOUR PATH", {
        fontFamily: "Courier",
        fontSize: "32px",
        color: "#33ff33",
      })
      .setOrigin(0.5);

    const startX = 400;
    const startY = 500;

    // Player dot (theme green)
    this.add.circle(startX, startY, 10, 0x33ff33);

    const spacingX = 200;
    const targetY = 300;

    const total = list.length;
    const offset = ((total - 1) * spacingX) / 2;

    list.forEach((node, i) => {
      const tx = startX - offset + i * spacingX;

      // Draw path line
      const line = this.add.graphics();
      line.lineStyle(4, 0x225522);
      line.beginPath();
      line.moveTo(startX, startY);
      line.lineTo(tx, targetY);
      line.strokePath();

      // Draw node circle
      const color = this.getColor(node.type);
      const circle = this.add
        .circle(tx, targetY, 30, color)
        .setInteractive({ useHandCursor: true });

      // Text shadow for 64-bit readability
      this.add
        .text(tx + 2, targetY + 47, node.type, {
          fontFamily: "Courier",
          fontSize: "16px",
          color: "#000",
        })
        .setOrigin(0.5);
      this.add
        .text(tx, targetY + 45, node.type, {
          fontFamily: "Courier",
          fontSize: "16px",
          color: "#33ff33",
        })
        .setOrigin(0.5);

      circle.on("pointerdown", () => {
        // Disable other clicks
        this.input.enabled = false;
        onNodeClicked(node);
      });
    });
    this.input.enabled = true;
  }

  getColor(type) {
    if (type === "Campfire") return 0xff8800; // Orange
    if (type === "Shop") return 0xffff00; // Yellow
    if (type === "Mystery") return 0xaa00ff; // Purple
    if (type === "Elite Combat") return 0xff0000; // Red
    return 0x228822; // Theme green for normal combat
  }
}

function MapSysNameLegend() {
  return "@ you  B boss  X combat  E elite  $ shop  + campfire  ? mystery";
}
