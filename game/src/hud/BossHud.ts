/**
 * BOSS HUD 模块（BossHud）
 *
 * 专门负责屏幕顶部的 BOSS 血条：
 * - 400px 宽的红色大血条，居中显示
 * - BOSS 名字标签
 * - 低血量变色（< 30% 变暗红）
 * - BOSS 死亡后自动隐藏
 *
 * 和 PlayerHud 类似，把"显示信息"的代码从战斗逻辑里拆出来。
 */

import { Enemy } from "../types/EnemyTypes";

export class BossHud {
  // 血条组件
  private barBg: Phaser.GameObjects.Rectangle;    // 灰色背景
  private barFill: Phaser.GameObjects.Rectangle;  // 红色填充
  private label: Phaser.GameObjects.Text;         // BOSS 名字

  /**
   * @param scene     场景引用
   * @param bossName  BOSS 名字（显示在血条上方）
   */
  constructor(scene: Phaser.Scene, bossName: string) {
    const barW = 400;   // 血条宽度（像素）
    const barH = 18;    // 血条高度
    const cx = 480;     // 屏幕中心 X（960/2）

    // 灰色底框（比填充稍大一点，做出"边框"效果）
    this.barBg = scene.add.rectangle(cx, 18, barW + 4, barH + 4, 0x222222)
      .setScrollFactor(0).setDepth(10);

    // 红色填充条（从左到右缩短表示掉血）
    this.barFill = scene.add.rectangle(cx - barW / 2, 18, barW, barH, 0xcc0000)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(11);

    // BOSS 名字（血条正上方）
    this.label = scene.add.text(cx, 6, bossName, {
      fontSize: "14px", color: "#ff4444", fontFamily: "SimHei", fontStyle: "bold",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(11);
  }

  /**
   * 每帧更新 BOSS 血条
   *
   * @param boss BOSS 的 Enemy 数据，如果为 null 或已死亡则隐藏血条
   */
  update(boss: Enemy | null) {
    // BOSS 不存在或已死亡 → 隐藏整个血条
    if (!boss || !boss.alive) {
      this.barBg.setVisible(false);
      this.barFill.setVisible(false);
      this.label.setVisible(false);
      return;
    }

    // 计算血量比例
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    this.barFill.width = 400 * ratio;

    // 低血量变色：> 30% 亮红，≤ 30% 暗红（提示 BOSS 快死了）
    this.barFill.setFillStyle(ratio > 0.3 ? 0xcc0000 : 0x660000);
  }
}
