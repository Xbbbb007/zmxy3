/**
 * 启动场景（BootScene）
 *
 * 游戏最先启动的场景，职责是：
 * - 预加载资源（图片、音频等）
 * - 加载完毕后跳转到主菜单
 */

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    // 法阵图片（天降神踏技能用）
    this.load.image("magic_circle", "assets/skills/magic_circle.png");
  }

  create() {
    this.scene.start("MenuScene");
  }
}
