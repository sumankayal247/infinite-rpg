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
    this.add.image(400, 300, type).setScale(4);
  }
}
