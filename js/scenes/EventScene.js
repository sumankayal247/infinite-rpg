import * as Engine from "../engine.js";

export default class EventScene extends Phaser.Scene {
  constructor() {
    super("EventScene");
  }
  create() {
    this.add.image(400, 300, "default_bg").setTint(0x550055);
    this.titleText = this.add
      .text(400, 100, "", {
        fontFamily: "Courier",
        fontSize: "24px",
        color: "#fff",
      })
      .setOrigin(0.5);
    this.descText = this.add
      .text(400, 200, "", {
        fontFamily: "Courier",
        fontSize: "16px",
        color: "#ccc",
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5);
  }

  renderEvent(eventData, onChoice) {
    this.children.removeAll();
    this.add.image(400, 300, "default_bg").setTint(0x550055);

    this.add
      .text(400, 50, eventData.title, {
        fontFamily: "Courier",
        fontSize: "28px",
        color: "#00ff00",
        backgroundColor: "#000",
      })
      .setOrigin(0.5);
    this.add
      .text(400, 150, eventData.desc, {
        fontFamily: "Courier",
        fontSize: "18px",
        color: "#fff",
        wordWrap: { width: 700 },
      })
      .setOrigin(0.5);

    let startY = 300;
    eventData.choices.forEach((choice, idx) => {
      const btnText =
        choice.text +
        (choice.stat_check !== "NONE" ? ` [${choice.stat_check}]` : "");
      const bg = this.add
        .rectangle(400, startY + idx * 60, 400, 40, 0x225522)
        .setInteractive({ useHandCursor: true });
      const txt = this.add
        .text(400, startY + idx * 60, btnText, {
          fontFamily: "Courier",
          fontSize: "18px",
          color: "#33ff33",
        })
        .setOrigin(0.5);

      bg.on("pointerdown", () => {
        this.input.enabled = false; // block double clicks
        bg.fillColor = 0x55aa55;
        onChoice(choice);
      });
      bg.on("pointerover", () => (bg.fillColor = 0x337733));
      bg.on("pointerout", () => (bg.fillColor = 0x225522));
    });

    this.input.enabled = true;
  }

  playD20(resultText, onComplete) {
    const dice = this.add.image(400, 300, "d20").setScale(2);
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
