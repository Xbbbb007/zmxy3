/**
 * 普通近战怪 AI（NormalAI）
 *
 * 最简单的敌人类型：
 * - 巡逻：在出生点附近左右走动
 * - 感知：玩家进入 80px 才注意到
 * - 攻击：前摇（感叹号 500ms，可打断）→ 近战挥砍 → 冷却 800ms
 * - 特效：红色弧线表示攻击范围
 *
 * 设计意图：
 * 给玩家练手的基础敌人，威胁低，容易预判。
 * 需要靠近才能攻击，玩家保持距离就安全。
 */

import { Enemy, EnemyState } from "../../types/EnemyTypes";
import { NORMAL } from "./MinionConfig";

/**
 * 普通怪进入前摇状态
 * 感叹号闪烁 + 站定不动，前摇结束由 update 驱动 performAttack
 */
export function startNormalWindup(scene: Phaser.Scene, enemy: Enemy, dxToPlayer: number) {
  enemy.state = EnemyState.WINDUP;
  enemy.stateTimer = scene.time.now + NORMAL.ATTACK_WINDUP;
  enemy.facingRight = dxToPlayer > 0;

  enemy.windupIndicator = scene.add.text(
    enemy.container.x, enemy.container.y - 52,
    "!", {
      fontSize: "24px",
      color: "#ff4444",
      fontFamily: "Arial", fontStyle: "bold",
      backgroundColor: "#00000088", padding: { x: 4, y: 2 },
    },
  ).setOrigin(0.5);

  scene.tweens.add({
    targets: enemy.windupIndicator,
    alpha: 0.3, duration: 150, yoyo: true, repeat: -1,
  });
}

/**
 * 普通怪执行近战攻击
 * 在面朝方向一定范围内造成伤害，显示红色弧线特效
 */
export function performNormalAttack(
  scene: Phaser.Scene,
  enemy: Enemy,
  playerX: number,
  playerY: number,
  damagePlayer: (damage: number, knockbackX: number) => void,
) {
  // 移除前摇感叹号
  if (enemy.windupIndicator) {
    enemy.windupIndicator.destroy();
    enemy.windupIndicator = null;
  }

  // 进入攻击状态
  enemy.state = EnemyState.ATTACKING;
  enemy.stateTimer = scene.time.now + NORMAL.ATTACK_DURATION;

  const dir = enemy.facingRight ? 1 : -1;
  const hitX = enemy.container.x + dir * NORMAL.ATTACK_RANGE;
  const dx = playerX - hitX;
  const dy = playerY - enemy.container.y;
  if (Math.abs(dx) < 34 && Math.abs(dy) < 48) {
    damagePlayer(NORMAL.ATTACK_DAMAGE, dir * NORMAL.ATTACK_KNOCKBACK);
  }

  // 红色弧线特效
  const g = scene.add.graphics();
  g.lineStyle(3, 0xff6644, 0.7);
  g.strokeEllipse(0, 0, 30, 40);
  g.setPosition(hitX, enemy.container.y);
  scene.tweens.add({
    targets: g, alpha: 0, scale: 1.3, duration: 150,
    onComplete: () => g.destroy(),
  });
}

/**
 * 普通怪攻击状态结束 → 进入冷却
 */
export function finishNormalAttack(enemy: Enemy, now: number) {
  enemy.state = EnemyState.COOLDOWN;
  enemy.stateTimer = now + NORMAL.ATTACK_COOLDOWN;
}
