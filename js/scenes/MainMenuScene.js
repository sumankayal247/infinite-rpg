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
    this.add.image(400, 300, "default_bg").setTint(0x111133);

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
      if (saved && saved.state) {
        Object.assign(Engine.gameState, saved.state);
        Engine.recalculateDerivedStats();
        UI.updateChatLog("Game loaded from previous save!");
      }
    }

    Engine.setMode("MAP");
    window.dispatchEvent(new Event("gameLoaded"));
    this.scene.start("MapScene");
  }
}
