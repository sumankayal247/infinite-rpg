import * as Engine from "../engine.js";

export default class MapScene extends Phaser.Scene {
  constructor() {
    super("MapScene");
  }
  create() {
    Engine.gameState.phaserScene = this;
    this.add.image(400, 300, "default_bg").setTint(0x333333);
    this.add
      .text(400, 50, "WORLD MAP", {
        fontFamily: "Courier",
        fontSize: "32px",
        color: "#fff",
      })
      .setOrigin(0.5);
  }
  renderMap(nodes, onNodeClicked) {
    this.children.removeAll();
    this.add.image(400, 300, "default_bg").setTint(0x333333);
    this.add
      .text(400, 50, "CHOOSE YOUR PATH", {
        fontFamily: "Courier",
        fontSize: "32px",
        color: "#fff",
      })
      .setOrigin(0.5);

    const startX = 400;
    const startY = 500;

    // Player dot
    this.add.circle(startX, startY, 10, 0x00ff00);

    const spacingX = 200;
    const targetY = 300;

    const total = nodes.length;
    const offset = ((total - 1) * spacingX) / 2;

    nodes.forEach((node, i) => {
      const tx = startX - offset + i * spacingX;

      // Draw path line
      const line = this.add.graphics();
      line.lineStyle(4, 0x555555);
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
          color: "#fff",
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
    return 0x880000; // Dark red for normal combat
  }
}
