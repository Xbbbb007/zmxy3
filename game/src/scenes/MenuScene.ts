/**
 * 主菜单场景（MenuScene）
 *
 * 游戏的第一个画面，显示标题和"开始游戏"按钮。
 * 点击按钮后跳转到战斗场景（BattleScene）。
 *
 * 目前用纯文字 + 矩形做按钮，后期可以换成美术素材。
 */

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: "MenuScene" });
  }

  create() {
    const { centerX, centerY } = this.cameras.main;

    // ===== 标题 =====
    this.add
      .text(centerX, centerY - 80, "造梦西游3", {
        fontSize: "56px",
        color: "#f5c842", // 金黄色
        fontFamily: "Arial",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // ===== "开始游戏" 按钮 =====
    // 用矩形 + 文字组合做一个简易按钮
    const btnBg = this.add
      .rectangle(centerX, centerY + 40, 200, 60, 0xe63946) // 红色矩形
      .setInteractive({ useHandCursor: true }); // 鼠标移上去变手型

    const btnText = this.add.text(centerX, centerY + 40, "开始游戏", {
      fontSize: "24px",
      color: "#ffffff",
      fontFamily: "Arial",
    }).setOrigin(0.5);

    // 鼠标悬停效果：变亮
    btnBg.on("pointerover", () => btnBg.setFillStyle(0xff6b6b));
    btnBg.on("pointerout", () => btnBg.setFillStyle(0xe63946));

    // 点击后跳转到战斗场景
    btnBg.on("pointerdown", () => {
      this.scene.start("BattleScene");
    });
  }
}
