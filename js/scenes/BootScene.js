import * as UI from "../ui.js";
import * as AudioSys from "../audio.js";
import * as AI from "../ai.js";
import * as Engine from "../engine.js";
import * as SaveSys from "../save.js";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }
  preload() {
    AI.loadFallbackData();
    UI.preloadAssets(this);
    AudioSys.preloadAudio(this);

    this.load.image("shop", "./assets/sprites/shop.avif");
    this.load.image("blacksmith", "./assets/sprites/blacksmith.avif");
    this.load.image("d20", "./assets/sprites/d20.avif");
  }
  async create() {
    this.scene.start("MainMenuScene");
  }
}
