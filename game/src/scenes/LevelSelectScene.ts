/**
 * 关卡选择场景（LevelSelectScene）
 *
 * 显示所有关卡卡片，玩家点击卡片进入对应关卡。
 * 每张卡片展示关卡名称、简介和难度提示。
 *
 * 后期可以扩展：
 * - 锁定/解锁机制（通关上一关才能选下一关）
 * - 星级评价显示
 * - 最佳通关时间
 */

import { LEVELS, LevelConfig } from "../types/LevelConfig";

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: "LevelSelectScene" });
  }

  create() {
    const { centerX, width } = this.cameras.main;

    // ===== 背景 =====
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x16213e, 0x16213e, 1);
    bg.fillRect(0, 0, width, 540);

    // ===== 标题 =====
    this.add.text(centerX, 40, "选择关卡", {
      fontSize: "36px", color: "#f5c842", fontFamily: "SimHei", fontStyle: "bold",
    }).setOrigin(0.5);

    // ===== 返回按钮 =====
    const backBtn = this.add.text(30, 30, "\u2190 返回", {
      fontSize: "18px", color: "#aaaaaa", fontFamily: "Arial",
    }).setInteractive({ useHandCursor: true });

    backBtn.on("pointerover", () => backBtn.setColor("#ffffff"));
    backBtn.on("pointerout", () => backBtn.setColor("#aaaaaa"));
    backBtn.on("pointerdown", () => this.scene.start("MenuScene"));

    // ===== 关卡卡片 =====
    const cardW = 200;
    const cardH = 280;
    const gap = 20;
    const totalW = LEVELS.length * cardW + (LEVELS.length - 1) * gap;
    const startX = (width - totalW) / 2 + cardW / 2;

    LEVELS.forEach((level, i) => {
      const cx = startX + i * (cardW + gap);
      const cy = 290;
      this.createCard(cx, cy, cardW, cardH, level);
    });
  }

  /**
   * 创建一张关卡卡片
   */
  private createCard(
    cx: number, cy: number, w: number, h: number,
    level: LevelConfig,
  ) {
    // ---- 卡片背景（用关卡的天空色做顶栏） ----
    const card = this.add.container(cx, cy);

    // 底板
    const bg = this.add.rectangle(0, 0, w, h, 0x2a2a3e, 0.9);
    bg.setStrokeStyle(2, 0x444466);
    card.add(bg);

    // 顶部色带（用关卡天空色，视觉关联）
    const banner = this.add.rectangle(0, -h / 2 + 30, w, 60, level.skyBottomColor);
    card.add(banner);

    // ---- 关卡序号 ----
    const index = LEVELS.indexOf(level) + 1;
    const indexText = this.add.text(0, -h / 2 + 18, `${index}`, {
      fontSize: "32px", color: "#ffffff", fontFamily: "Arial", fontStyle: "bold",
    }).setOrigin(0.5);
    card.add(indexText);

    // ---- 关卡名称 ----
    const nameText = this.add.text(0, -h / 2 + 70, level.name.split(" · ")[1] || level.name, {
      fontSize: "20px", color: "#f5c842", fontFamily: "SimHei", fontStyle: "bold",
    }).setOrigin(0.5);
    card.add(nameText);

    // ---- 简介（自动换行） ----
    const descText = this.add.text(0, -20, level.description, {
      fontSize: "13px", color: "#cccccc", fontFamily: "SimHei",
      wordWrap: { width: w - 24 }, align: "center",
    }).setOrigin(0.5);
    card.add(descText);

    // ---- 敌人预览 ----
    const normalCount = level.enemies.filter(e => e.type === 0).length;
    const chargerCount = level.enemies.filter(e => e.type === 1).length;
    const throwerCount = level.enemies.filter(e => e.type === 2).length;
    const bossCount = level.enemies.filter(e => e.type === 3).length;

    let preview = "";
    if (normalCount) preview += `\u25A0\u00D7${normalCount} `;
    if (chargerCount) preview += `\u25B2\u00D7${chargerCount} `;
    if (throwerCount) preview += `\u25C6\u00D7${throwerCount} `;
    if (bossCount) preview += `BOSS `;

    const previewText = this.add.text(0, 50, preview, {
      fontSize: "12px", color: "#888888", fontFamily: "Arial",
    }).setOrigin(0.5);
    card.add(previewText);

    // ---- 难度星级 ----
    const stars = "\u2605".repeat(index) + "\u2606".repeat(4 - index);
    const starText = this.add.text(0, 80, stars, {
      fontSize: "18px", color: "#f5c842", fontFamily: "Arial",
    }).setOrigin(0.5);
    card.add(starText);

    // ---- "开始" 按钮 ----
    const btnBg = this.add.rectangle(0, h / 2 - 35, w - 40, 36, 0xe63946)
      .setInteractive({ useHandCursor: true });
    const btnText = this.add.text(0, h / 2 - 35, "开始挑战", {
      fontSize: "16px", color: "#ffffff", fontFamily: "SimHei",
    }).setOrigin(0.5);
    card.add(btnBg);
    card.add(btnText);

    btnBg.on("pointerover", () => btnBg.setFillStyle(0xff6b6b));
    btnBg.on("pointerout", () => btnBg.setFillStyle(0xe63946));
    btnBg.on("pointerdown", () => {
      this.scene.start("BattleScene", { levelId: level.id });
    });

    // ---- 整卡悬停效果 ----
    card.setSize(w, h);
    card.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    card.on("pointerover", () => {
      this.tweens.add({ targets: card, scaleX: 1.04, scaleY: 1.04, duration: 100 });
    });
    card.on("pointerout", () => {
      this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, duration: 100 });
    });
  }
}
