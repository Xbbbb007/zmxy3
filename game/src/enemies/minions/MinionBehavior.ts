/**
 * 小怪共享行为（MinionBehavior）
 *
 * 所有非 BOSS 类敌人共用的逻辑：
 * - 外观绘制（NORMAL/CHARGER/THROWER 各有不同造型）
 * - 物理体设置（碰撞框对齐）
 * - 巡逻（左右散步，遇边界翻转）
 * - 受击（打断前摇 + 硬直 + 闪烁 + 飘字）
 * - 死亡（旋转升天 + 淡出）
 * - 血条更新
 *
 * 设计思路：
 * 这些是小怪"底层通用"的东西，不管哪种小怪都要用。
 * 每种小怪的"攻击方式"不同，所以攻击相关逻辑放在各自的 AI 文件里。
 */

import { Enemy, EnemyState, EnemyType } from "../../types/EnemyTypes";
import { NORMAL, CHARGER, THROWER, MINION_HIT_STAGGER } from "./MinionConfig";

// ======================== 外观绘制 ========================

/**
 * 根据小怪类型画不同外观
 * 每种小怪有独特的颜色、形状和大小
 */
export function drawMinion(g: Phaser.GameObjects.Graphics, type: EnemyType) {
  switch (type) {
    case EnemyType.NORMAL: {
      // 普通怪：蓝灰色方块 + 小眼睛
      g.fillStyle(0x4a5568, 1);
      g.fillRect(-16, -24, 32, 48);
      g.lineStyle(2, 0x718096);
      g.strokeRect(-16, -24, 32, 48);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(-5, -12, 4);
      g.fillCircle(5, -12, 4);
      g.fillStyle(0x000000, 1);
      g.fillCircle(-4, -12, 2);
      g.fillCircle(6, -12, 2);
      break;
    }
    case EnemyType.CHARGER: {
      // 冲锋怪：绿色宽扁 + 两只角（像野牛）
      g.fillStyle(0x48bb78, 1);
      g.fillRect(-20, -20, 40, 40);
      g.lineStyle(2, 0x2f855a);
      g.strokeRect(-20, -20, 40, 40);
      g.fillStyle(0xe8d44d, 1);
      g.fillTriangle(-20, -20, -14, -20, -18, -32);
      g.fillTriangle(20, -20, 14, -20, 18, -32);
      g.fillStyle(0xff4444, 1);
      g.fillCircle(-7, -8, 4);
      g.fillCircle(7, -8, 4);
      break;
    }
    case EnemyType.THROWER: {
      // 投掷怪：紫色瘦高 + 法杖
      g.fillStyle(0x9b59b6, 1);
      g.fillRect(-12, -28, 24, 56);
      g.lineStyle(2, 0x7d3c98);
      g.strokeRect(-12, -28, 24, 56);
      g.lineStyle(2, 0xe8d44d, 1);
      g.lineBetween(14, -20, 14, 20);
      g.fillStyle(0xe8d44d, 1);
      g.fillCircle(14, -24, 5);
      g.fillStyle(0x00e5ff, 1);
      g.fillCircle(-4, -16, 3);
      g.fillCircle(4, -16, 3);
      break;
    }
  }
}

// ======================== 物理体设置 ========================

/**
 * 设置小怪物理体（碰撞框大小根据类型略有不同）
 *
 * 注意：所有小怪碰撞体底部对齐，这样站在同一条地面上。
 */
export function setupMinionBody(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  type: EnemyType,
) {
  scene.physics.add.existing(container);
  const body = container.body as Phaser.Physics.Arcade.Body;

  let bodyW: number, bodyH: number, bodyOffY: number;
  switch (type) {
    case EnemyType.CHARGER: bodyW = 40; bodyH = 40; bodyOffY = -20; break;
    case EnemyType.THROWER: bodyW = 24; bodyH = 56; bodyOffY = -28; break;
    default:                bodyW = 32; bodyH = 48; bodyOffY = -24; break;
  }

  body.setSize(bodyW, bodyH);
  body.setOffset(-bodyW / 2, bodyOffY);
  body.setDragX(400);
  body.setCollideWorldBounds(true);
}

// ======================== 巡逻 ========================

/**
 * 小怪巡逻逻辑：在出生点附近左右走动
 * 被击退时（速度较大）暂停巡逻，等停下来再继续
 *
 * @returns true 表示处于巡逻状态，false 表示正在被击退/速度还没衰减
 */
export function updatePatrol(enemy: Enemy): boolean {
  const body = enemy.container.body as Phaser.Physics.Arcade.Body;
  if (Math.abs(body.velocity.x) >= 5) return false; // 被击退中，不巡逻

  const speed = getPatrolSpeed(enemy);
  if (enemy.facingRight) {
    body.setVelocityX(speed);
    if (enemy.container.x >= enemy.patrolRight) enemy.facingRight = false;
  } else {
    body.setVelocityX(-speed);
    if (enemy.container.x <= enemy.patrolLeft) enemy.facingRight = true;
  }
  return true;
}

/** 根据类型返回巡逻速度 */
function getPatrolSpeed(enemy: Enemy): number {
  switch (enemy.type) {
    case EnemyType.CHARGER: return CHARGER.PATROL_SPEED;
    case EnemyType.THROWER: return THROWER.PATROL_SPEED;
    default: return NORMAL.PATROL_SPEED;
  }
}

// ======================== 感知范围 ========================

/** 根据类型返回发现玩家的距离 */
export function getDetectRange(enemy: Enemy): number {
  switch (enemy.type) {
    case EnemyType.CHARGER: return CHARGER.DETECT_RANGE;
    case EnemyType.THROWER: return THROWER.DETECT_RANGE;
    default: return NORMAL.DETECT_RANGE;
  }
}

// ======================== 受击与死亡 ========================

/**
 * 小怪受到伤害
 * - 打断前摇（感叹号消失）
 * - 进入完整硬直（300ms）
 * - 全额击退
 * - 闪烁 + 伤害飘字
 *
 * @returns true 如果小怪死亡，需要后续处理
 */
export function damageMinion(
  scene: Phaser.Scene,
  enemy: Enemy,
  damage: number,
  knockbackX: number,
): boolean {
  if (!enemy.alive) return false;
  enemy.hp -= damage;

  const body = enemy.container.body as Phaser.Physics.Arcade.Body;

  // 打断前摇
  if (enemy.state === EnemyState.WINDUP && enemy.windupIndicator) {
    enemy.windupIndicator.destroy();
    enemy.windupIndicator = null;
  }

  // 进入硬直（冻结在原地，不接受巡逻/攻击指令）
  enemy.state = EnemyState.HIT;
  enemy.stateTimer = scene.time.now + MINION_HIT_STAGGER;
  body.setVelocityX(knockbackX * 0.3);  // 轻微位移，不是大幅击退

  // 受击闪烁
  scene.tweens.add({
    targets: enemy.container,
    alpha: 0.3,
    duration: 60, yoyo: true, repeat: 1,
  });

  // 伤害飘字
  const dmgText = scene.add.text(
    enemy.container.x, enemy.container.y - 40,
    `-${damage}`,
    { fontSize: "22px", color: "#ff4444", fontFamily: "Arial", fontStyle: "bold" },
  ).setOrigin(0.5);

  scene.tweens.add({
    targets: dmgText,
    y: dmgText.y - 40, alpha: 0, duration: 600,
    onComplete: () => dmgText.destroy(),
  });

  // 更新血条
  updateHpBar(enemy);

  // 死亡判定
  if (enemy.hp <= 0) {
    enemy.alive = false;
    return true;
  }
  return false;
}

/** 小怪死亡动画：旋转升天 + 淡出 */
export function killMinion(scene: Phaser.Scene, enemy: Enemy) {
  scene.tweens.add({
    targets: enemy.container,
    alpha: 0, angle: 360,
    y: enemy.container.y - 30,
    duration: 400,
    onComplete: () => {
      enemy.container.destroy();
      enemy.hpBarBg.destroy();
      enemy.hpBarFill.destroy();
    },
  });
}

// ======================== 血条 ========================

/** 更新小怪头顶血条 */
export function updateHpBar(enemy: Enemy) {
  const ratio = Math.max(0, enemy.hp / enemy.maxHp);
  enemy.hpBarFill.width = 38 * ratio;
  enemy.hpBarFill.setFillStyle(ratio > 0.3 ? 0x48bb78 : 0xe53e3e);
}

// ======================== 血条/指示器位置跟随 ========================

/** 更新小怪头顶血条和感叹号的位置（每帧调用） */
export function syncVisuals(enemy: Enemy) {
  const x = enemy.container.x;
  const y = enemy.container.y;
  const hpBarY = enemy.type === EnemyType.THROWER ? -40 : -36;
  enemy.hpBarBg.setPosition(x, y + hpBarY);
  enemy.hpBarFill.setPosition(x - 19, y + hpBarY);
  if (enemy.windupIndicator) {
    enemy.windupIndicator.setPosition(x, y - 52);
  }
}
