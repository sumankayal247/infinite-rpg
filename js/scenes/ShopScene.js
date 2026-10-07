import * as Engine from "../engine.js";

export default class ShopScene extends Phaser.Scene {
  constructor() {
    super("ShopScene");
  }
  create() {
    Engine.gameState.phaserScene = this;
  }
  renderShop(type) {
    // type can be 'shop' or 'blacksmith'
    this.children.removeAll();
    if (this.textures && this.textures.exists(type)) {
      this.add.image(400, 300, type).setScale(4);
    } else {
      // Game Boy fallback interior — never a black screen
      this.add.rectangle(400, 300, 800, 600, 0x0f380f).setOrigin(0.5);
      this.add.rectangle(400, 300, 560, 420, 0x9bbc0f).setOrigin(0.5);
      this.add.rectangle(400, 380, 400, 120, 0x8bac0f).setOrigin(0.5);
      this.add
        .text(400, 140, type === "blacksmith" ? "FORGE" : "SHOP", {
          fontFamily: "Courier",
          fontSize: "40px",
          color: "#0f380f",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
    }
  }
}
