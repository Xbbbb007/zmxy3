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
    // 资源预加载（法阵已改为代码绘制，无需加载图片）
  }

  create() {
    this.scene.start("MenuScene");
  }
}
