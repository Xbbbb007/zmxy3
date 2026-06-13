/**
 * 冲锋怪 AI（ChargerAI）
 *
 * 高威胁近战敌人：
 * - 巡逻：和普通怪一样的散步方式
 * - 感知：250px 远距离发现玩家（比普通怪远 3 倍）
 * - 攻击：前摇（感叹号 600ms，可打断）→ 高速冲锋（450px/s）→ 冷却 1200ms
 * - 特效：冲锋起点尘土飞扬
 *
 * 设计意图：
 * 中距离威胁，发现玩家后会蓄力冲撞。
 * 玩家需要在冲锋前摇期间远离，或者用攻击打断。
 * 冲锋伤害和击退都很高，但冷却长，打时间差。
 */

import { Enemy, EnemyState } from "../../types/EnemyTypes";
import { CHARGER } from "./MinionConfig";

/**
 * 冲锋怪进入前摇状态
 * 橙色感叹号 + 站定蓄力
 */
export function startChargerWindup(scene: Phaser.Scene, enemy: Enemy, dxToPlayer: number) {
  enemy.state = EnemyState.WINDUP;
  enemy.stateTimer = scene.time.now + CHARGER.CHARGE_WINDUP;
  enemy.facingRight = dxToPlayer > 0;

  enemy.windupIndicator = scene.add.text(
    enemy.container.x, enemy.container.y - 52,
    "!!", {
      fontSize: "24px",
      color: "#ff8800",
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
 * 冲锋怪开始冲锋
 * 高速冲向面朝方向，沿途碰到玩家造成伤害
 */
export function performChargerAttack(scene: Phaser.Scene, enemy: Enemy) {
  // 移除前摇感叹号
  if (enemy.windupIndicator) {
    enemy.windupIndicator.destroy();
    enemy.windupIndicator = null;
  }

  // 进入冲锋状态
  enemy.state = EnemyState.CHARGING;
  enemy.stateTimer = scene.time.now + CHARGER.CHARGE_DURATION;

  // 尘土特效
  for (let i = 0; i < 3; i++) {
    const dust = scene.add.circle(
      enemy.container.x + (Math.random() - 0.5) * 20,
      enemy.container.y + 15,
      4 + Math.random() * 3, 0xcccccc, 0.5,
    );
    scene.tweens.add({
      targets: dust, alpha: 0, y: dust.y - 15, duration: 300,
      onComplete: () => dust.destroy(),
    });
  }
}

/**
 * 冲锋怪冲锋中每帧更新（移动 + 碰撞检测）
 *
 * @returns true 如果冲锋结束，需要进入冷却
 */
export function updateChargerCharge(
  enemy: Enemy,
  playerX: number,
  playerY: number,
  now: number,
  damagePlayer: (damage: number, knockbackX: number) => void,
): boolean {
  const body = enemy.container.body as Phaser.Physics.Arcade.Body;
  const dir = enemy.facingRight ? 1 : -1;

  body.setVelocityX(dir * CHARGER.CHARGE_SPEED);

  // 碰撞检测
  const hitDx = playerX - enemy.container.x;
  const hitDy = playerY - enemy.container.y;
  if (Math.abs(hitDx) < 36 && Math.abs(hitDy) < 48) {
    damagePlayer(CHARGER.CHARGE_DAMAGE, dir * CHARGER.CHARGE_KNOCKBACK);
  }

  // 冲锋时间到 → 结束
  if (now >= enemy.stateTimer) {
    body.setVelocityX(0);
    enemy.state = EnemyState.COOLDOWN;
    enemy.stateTimer = now + CHARGER.COOLDOWN;
    return true;
  }
  return false;
}
