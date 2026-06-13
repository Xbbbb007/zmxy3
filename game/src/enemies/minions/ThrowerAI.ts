/**
 * 投掷怪 AI（ThrowerAI）
 *
 * 远程骚扰敌人：
 * - 巡逻：和其他小怪一样左右走动
 * - 感知：200px 发现玩家
 * - 偏好距离：150px（太近就后退，太远就靠近）
 * - 攻击：瞄准（法杖闪光 400ms，可打断）→ 发射能量球 → 冷却 1500ms
 * - 特效：法杖闪光、紫色能量球 + 黄色内核
 *
 * 设计意图：
 * 远距离骚扰型敌人，玩家要顶着弹幕靠近才能打。
 * 血量低（80），但会跑，需要快速靠近秒杀。
 * 投掷物飞行速度慢（350），可以走位躲。
 */

import { Enemy, EnemyState } from "../../types/EnemyTypes";
import { THROWER } from "./MinionConfig";

/**
 * 投掷怪进入瞄准状态
 * 紫色星号闪烁 + 法杖闪光
 */
export function startThrowerWindup(scene: Phaser.Scene, enemy: Enemy, dxToPlayer: number) {
  enemy.state = EnemyState.WINDUP;
  enemy.stateTimer = scene.time.now + THROWER.AIM_TIME;
  enemy.facingRight = dxToPlayer > 0;

  enemy.windupIndicator = scene.add.text(
    enemy.container.x, enemy.container.y - 52,
    "\u2726", {
      fontSize: "24px",
      color: "#aa44ff",
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
 * 投掷怪瞄准完成 → 进入发射等待
 * 瞄准结束后有一小段延迟（200ms）再发射
 */
export function performThrowerAim(scene: Phaser.Scene, enemy: Enemy) {
  // 移除前摇指示器
  if (enemy.windupIndicator) {
    enemy.windupIndicator.destroy();
    enemy.windupIndicator = null;
  }

  // 进入瞄准状态（短暂延迟后发射）
  enemy.state = EnemyState.AIMING;
  enemy.stateTimer = scene.time.now + 200;

  // 法杖闪光
  const flash = scene.add.circle(
    enemy.container.x + (enemy.facingRight ? 14 : -14),
    enemy.container.y - 24, 8, 0xe8d44d, 0.7,
  );
  scene.tweens.add({
    targets: flash, scale: 2, alpha: 0, duration: 200,
    onComplete: () => flash.destroy(),
  });
}

/**
 * 投掷怪发射能量球（飞向玩家当前位置）
 * 带黄色内核高光跟随效果
 */
export function launchProjectile(
  scene: Phaser.Scene,
  enemy: Enemy,
  playerX: number,
  playerY: number,
  projectiles: Phaser.Physics.Arcade.Group,
) {
  const dir = enemy.facingRight ? 1 : -1;
  const startX = enemy.container.x + dir * 14;
  const startY = enemy.container.y - 24;

  const proj = scene.add.circle(startX, startY, 6, 0x9b59b6, 0.9);
  projectiles.add(proj);
  proj.setData("damage", THROWER.PROJECTILE_DAMAGE);

  const projBody = proj.body as Phaser.Physics.Arcade.Body;
  projBody.setAllowGravity(false);
  projBody.setSize(12, 12);

  // 朝向玩家当前位置
  const aimDx = playerX - startX;
  const aimDy = playerY - startY;
  const dist = Math.sqrt(aimDx * aimDx + aimDy * aimDy) || 1;
  projBody.setVelocity(
    (aimDx / dist) * THROWER.PROJECTILE_SPEED,
    (aimDy / dist) * THROWER.PROJECTILE_SPEED,
  );

  // 内圈高光跟随
  const inner = scene.add.circle(startX, startY, 3, 0xe8d44d, 0.7);
  scene.tweens.add({
    targets: inner, duration: 3000,
    onUpdate: () => {
      if (proj.active) inner.setPosition(proj.x, proj.y);
      else inner.destroy();
    },
  });

  // 3秒后自动销毁
  scene.time.delayedCall(3000, () => {
    if (proj.active) proj.destroy();
    if (inner.active) inner.destroy();
  });

  // 发射完毕 → 冷却
  enemy.state = EnemyState.COOLDOWN;
  enemy.stateTimer = scene.time.now + THROWER.COOLDOWN;
}

/**
 * 投掷怪巡逻时的特殊行为：太近就后退
 *
 * @returns true 表示玩家太近，正在后退，不应触发前摇
 */
export function throwerRetreatIfTooClose(
  enemy: Enemy,
  dxToPlayer: number,
  distToPlayer: number,
): boolean {
  if (distToPlayer >= THROWER.RETREAT_THRESHOLD) return false;

  const body = enemy.container.body as Phaser.Physics.Arcade.Body;
  const retreatDir = dxToPlayer > 0 ? -1 : 1;
  body.setVelocityX(retreatDir * THROWER.RETREAT_SPEED);
  return true;
}
