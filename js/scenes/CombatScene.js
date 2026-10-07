import * as Engine from "../engine.js";
import * as UI from "../ui.js";
import * as AudioSys from "../audio.js";

export default class CombatScene extends Phaser.Scene {
  constructor() {
    super("CombatScene");
  }
  create() {
    Engine.gameState.phaserScene = this;
  }

  renderEncounter(encounter) {
    UI.renderEnemyEncounter(this, encounter); // Retain existing tinting logic from UI.js
    AudioSys.playDynamicAudio(this, encounter);
  }

  playD20(resultText, onComplete) {
    let dice;
    try {
      dice =
        this.textures && this.textures.exists("d20")
          ? this.add.image(400, 300, "d20").setScale(2)
          : this.add.rectangle(400, 300, 90, 90, 0x0f380f).setOrigin(0.5);
    } catch (e) {
      console.warn("[combat-dice] skipped:", e);
      if (onComplete) onComplete();
      return;
    }
    this.tweens.add({
      targets: dice,
      angle: 720,
      scale: 4,
      duration: 1000,
      ease: "Cubic.easeOut",
      onComplete: () => {
        const text = this.add
          .text(400, 300, resultText, {
            fontFamily: "Courier",
            fontSize: "32px",
            color: "#00ff00",
            backgroundColor: "#000",
          })
          .setOrigin(0.5);
        this.time.delayedCall(1500, () => {
          dice.destroy();
          text.destroy();
          if (onComplete) onComplete();
        });
      },
    });
  }
}
