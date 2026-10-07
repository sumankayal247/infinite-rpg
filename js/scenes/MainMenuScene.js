import * as Engine from "../engine.js";
import * as UI from "../ui.js";
import * as SaveSys from "../save.js";
import * as AudioSys from "../audio.js";

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super("MainMenuScene");
  }

  create() {
    Engine.gameState.phaserScene = this;
    UI.clearAsciiMap();
    if (this.textures && this.textures.exists("default_bg")) {
      this.add.image(400, 300, "default_bg").setTint(0x111133);
    } else {
      this.add.rectangle(400, 300, 800, 600, 0x0f380f).setOrigin(0.5);
      this.add.rectangle(400, 300, 640, 480, 0x9bbc0f).setOrigin(0.5);
    }

    this.add
      .text(400, 150, "INFINITE RPG", {
        fontFamily: "Courier",
        fontSize: "64px",
        color: "#00ff00",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    const hasSave = SaveSys.loadGameState() !== null;

    this.createButton(400, 300, "NEW GAME", () => {
      if (hasSave) {
        if (SaveSys.startNewGame()) {
          this.startGame(true);
        }
      } else {
        this.startGame(true);
      }
    });

    if (hasSave) {
      this.createButton(400, 380, "CONTINUE", () => {
        this.startGame(false);
      });
    }
  }

  createButton(x, y, text, onClick) {
    const bg = this.add
      .rectangle(x, y, 300, 50, 0x225522)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y, text, {
        fontFamily: "Courier",
        fontSize: "24px",
        color: "#33ff33",
      })
      .setOrigin(0.5);

    bg.on("pointerdown", () => {
      bg.fillColor = 0x55aa55;
      onClick();
    });
    bg.on("pointerover", () => (bg.fillColor = 0x337733));
    bg.on("pointerout", () => (bg.fillColor = 0x225522));
  }

  async startGame(isNewGame) {
    if (isNewGame) {
      const pData = await Engine.fetchGameData("player_base.json");
      Engine.initPlayer(pData.base_stats);
      UI.updateChatLog("Welcome to Infinite RPG. A new journey begins.");
    } else {
      const saved = SaveSys.loadGameState();
      const sp = saved?.state?.player;
      if (saved && saved.state && sp && sp.baseStats) {
        // Restore plain data only — never whole gameState (it holds
        // live Phaser objects with circular Window refs).
        Engine.gameState.player = sp;
        if (saved.state.runSeed) Engine.gameState.runSeed = saved.state.runSeed;
        if (typeof saved.state.shopDiscount === "number")
          Engine.gameState.shopDiscount = saved.state.shopDiscount;
        if (saved.state.quests) Engine.gameState.quests = saved.state.quests;
        Engine.gameState.enemy = null;
        Engine.recalculateDerivedStats();
        UI.updateChatLog("Game loaded from previous save!");
      } else {
        // No usable save — start fresh instead of crashing
        const pData = await Engine.fetchGameData("player_base.json");
        Engine.initPlayer(pData.base_stats);
        UI.updateChatLog("Welcome to Infinite RPG. A new journey begins.");
      }
    }

    Engine.setMode("MAP");
    window.dispatchEvent(new Event("gameLoaded"));
    this.scene.start("MapScene");
  }
}
