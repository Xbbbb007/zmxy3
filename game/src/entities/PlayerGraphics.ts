/**
 * 玩家绘制模块（PlayerGraphics）
 *
 * 专门负责画玩家外观。把绘制逻辑从 BattleScene 里抽出来，
 * 以后换精灵图只需要改这一个文件。
 *
 * 目前还是色块占位：
 * - 红色方块 = 身体
 * - 亮色区域 = 面朝方向
 */

export function drawPlayer(
  container: Phaser.GameObjects.Container,
  facingRight: boolean
) {
  container.removeAll();

  const g = container.scene.add.graphics();

  // 身体
  g.fillStyle(0xe63946, 1);
  g.fillRect(-16, -24, 32, 48);
  g.lineStyle(2, 0xffffff);
  g.strokeRect(-16, -24, 32, 48);

  // 朝向指示（亮色侧 = 面朝方向）
  g.fillStyle(0xff8fa3, 1);
  if (facingRight) {
    g.fillRect(4, -20, 10, 12);
  } else {
    g.fillRect(-14, -20, 10, 12);
  }

  container.add(g);
}
