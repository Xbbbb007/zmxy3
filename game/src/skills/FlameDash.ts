/**
 * 烈焰闪技能（FlameDash）
 *
 * 技能1（K 键）：向前冲刺并对路径上的敌人造成火焰伤害。
 *
 * 设计思路：
 * - 每个技能是独立的类，包含自己的参数、CD 计时和执行逻辑
 * - 通过 SkillContext 接口获取外部依赖（场景、玩家、敌人等）
 * - BattleScene 只需 new FlameDash() 然后调用 execute()
 * - 想调参数？直接改这个文件顶部的数字就行
 */

import { Enemy } from "../types/EnemyTypes";

/**
 * 技能执行时需要的"外部信息"
 *
 * 技能类自己不管"场景里有什么"，它通过 Context 来拿需要的东西。
 * 这是一种常见的解耦手法——类 A 不直接依赖类 B，而是依赖一个接口。
 */
export interface SkillContext {
  scene: Phaser.Scene;                          // 场景（用来创建游戏对象、Tween、计时器）
  player: Phaser.GameObjects.Container;          // 玩家容器（用来获取位置和物理体）
  facingRight: boolean;                          // 玩家面朝方向
  enemies: Phaser.Physics.Arcade.Group;          // 敌人组（用来检测伤害）
  damageEnemy: (enemy: Enemy, damage: number, knockbackX: number) => void; // 伤害回调
  setDash: (isDashing: boolean, endTime: number) => void; // 冲刺状态回调
}

export class FlameDash {
  // ========== 可调参数（改这里的数字调手感） ==========
  readonly mpCost = 20;          // MP 消耗
  readonly damage = 30;          // 技能伤害
  readonly dashSpeed = 600;      // 冲刺速度（比普通移动快一倍）
  readonly dashDuration = 300;   // 冲刺持续时间(ms)
  readonly range = 200;          // 伤害判定距离(像素)

  /**
   * 尝试释放烈焰闪
   *
   * @returns true = 成功释放（BattleScene 应该扣 MP），false = 条件不满足
   *
   * 返回 boolean 让 BattleScene 自己管理 MP，
   * 技能只管"我能不能放"和"放的时候做什么"。
   */
  execute(ctx: SkillContext): boolean {
    const now = ctx.scene.time.now;

    const body = ctx.player.body as Phaser.Physics.Arcade.Body;
    const dir = ctx.facingRight ? 1 : -1;

    // ---- 冲刺移动 ----
    // 通过回调通知 BattleScene 设置冲刺状态
    ctx.setDash(true, now + this.dashDuration);
    body.setVelocityX(dir * this.dashSpeed);
    body.setDragX(0); // 冲刺期间不减速

    // 冲刺结束后恢复状态
    ctx.scene.time.delayedCall(this.dashDuration, () => {
      ctx.setDash(false, 0);
      body.setDragX(600); // 恢复摩擦力
    });

    // ---- 伤害路径上的敌人 ----
    const startX = ctx.player.x;
    const endX = startX + dir * this.range;

    ctx.enemies.getChildren().forEach((obj) => {
      const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
      if (!enemy?.alive) return;

      const ex = enemy.container.x;
      // 判断敌人是否在冲刺路径上（方向 + 距离 + 高度）
      const inRange = dir > 0
        ? (ex >= startX && ex <= endX)
        : (ex <= startX && ex >= endX);
      const closeY = Math.abs(enemy.container.y - ctx.player.y) < 48;

      if (inRange && closeY) {
        ctx.damageEnemy(enemy, this.damage, dir * 250);
      }
    });

    // ---- 火焰拖尾特效 ----
    this.showFlameTrail(ctx.scene, startX, ctx.player.y, endX);

    return true; // 告诉 BattleScene 扣 MP
  }

  /**
   * 火焰拖尾视觉特效
   * 沿冲刺路径生成多个火焰圆，延迟出现形成拖尾感
   */
  private showFlameTrail(
    scene: Phaser.Scene,
    startX: number, y: number, endX: number,
  ) {
    const steps = 8; // 火焰数量
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = startX + (endX - startX) * t;

      // 每个火焰是一个小圆形，随机大小
      const flame = scene.add.circle(x, y, 12 + Math.random() * 8, 0xff6600, 0.7);

      scene.tweens.add({
        targets: flame,
        alpha: 0,
        scale: 1.5 + Math.random() * 0.5,
        y: y - 20 - Math.random() * 15, // 火焰往上飘
        duration: 400,
        delay: i * 30, // 逐个延迟出现
        onComplete: () => flame.destroy(),
      });
    }
  }
}
