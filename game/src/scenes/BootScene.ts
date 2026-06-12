/**
 * 启动场景（BootScene）
 *
 * 游戏最先启动的场景，职责是：
 * - 预加载资源（图片、音频等）
 * - 加载完毕后跳转到主菜单
 *
 * 目前还没有美术资源，所以直接跳到菜单。
 * 以后有素材了，这里会加 preload() 方法来加载它们。
 */

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create() {
    // 资源加载完毕（目前为空），直接跳转到主菜单
    this.scene.start("MenuScene");
  }
}
