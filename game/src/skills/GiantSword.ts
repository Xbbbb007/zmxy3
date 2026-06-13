/**
 * 巨剑术技能（GiantSword）
 *
 * 技能2（L 键）：蓄力 → 法阵出现 → 巨剑从法阵中冲出 → AOE伤害
 *
 * 整个技能分两个阶段：
 * 1. 蓄力阶段（CHARGE_TIME 毫秒）：玩家不能动，法阵旋转浮现
 * 2. 发射阶段：巨剑从法阵位置飞出，飞行过程中持续检测碰撞
 *
 * 蓄力期间 isCasting=true，BattleScene 读取这个标志来禁止移动和攻击。
 */

import { Enemy } from "../types/EnemyTypes";

/** 和 FlameDash 共用的上下文接口（同一个接口，保持一致） */
export interface SkillContext {
  scene: Phaser.Scene;
  player: Phaser.GameObjects.Container;
  facingRight: boolean;
  enemies: Phaser.Physics.Arcade.Group;
  damageEnemy: (enemy: Enemy, damage: number, knockbackX: number) => void;
  setDash: (isDashing: boolean, endTime: number) => void;
}

export class GiantSword {
  // ========== 可调参数 ==========
  readonly mpCost = 30;              // MP 消耗
  readonly cooldownMs = 8000;        // 冷却时间(ms)
  readonly chargeTime = 2500;        // 蓄力时间(ms)
  readonly damage = 60;              // 伤害（大招，很痛）
  readonly swordSpeed = 800;         // 巨剑飞行速度
  readonly swordRange = 350;         // 巨剑飞行距离(像素)
  readonly aoeWidth = 80;            // AOE 判定宽度(像素)
  readonly angle = 15;               // 向下射击角度(度)

  // 运行时状态
  cooldownEnd = 0;
  isCasting = false;  // 蓄力中 = true（BattleScene 用来禁止移动）

  // 已命中敌人集合（防止同一个敌人在飞行过程中被重复扣血）
  private hitEnemies = new Set<Enemy>();

  /**
   * 尝试释放巨剑术
   * @returns true = 成功进入蓄力（BattleScene 扣 MP）
   */
  execute(ctx: SkillContext): boolean {
    const now = ctx.scene.time.now;

    if (now < this.cooldownEnd) return false; // CD 中
    if (this.isCasting) return false;         // 正在蓄力中

    // 进入 CD + 蓄力状态
    this.cooldownEnd = now + this.cooldownMs;
    this.isCasting = true;

    const body = ctx.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0); // 蓄力时完全定住（X + Y）

    // ===== 阶段1：法阵出现（蓄力 CHARGE_TIME 毫秒） =====
    const magicCircle = this.createMagicCircle(ctx);
    magicCircle.setAlpha(0);

    // 法阵淡入 + 放大
    ctx.scene.tweens.add({
      targets: magicCircle,
      alpha: 1,
      scale: { from: 0.3, to: 1 },
      duration: this.chargeTime * 0.8,
      ease: "Power2",
    });

    // 法阵旋转
    ctx.scene.tweens.add({
      targets: magicCircle,
      angle: magicCircle.angle + 360,
      duration: this.chargeTime,
      ease: "Linear",
    });

    // ===== 阶段2：蓄力结束 → 巨剑冲出 =====
    ctx.scene.time.delayedCall(this.chargeTime, () => {
      this.isCasting = false;
      magicCircle.destroy();
      this.launchGiantSword(ctx);
    });

    return true; // 扣 MP
  }

  // ======================== 法阵特效 ========================

  /**
   * 创建法阵视觉特效（同心圆 + 放射线 + 符文）
   * 出现在玩家头顶偏前方
   */
  private createMagicCircle(ctx: SkillContext): Phaser.GameObjects.Container {
    const scene = ctx.scene;
    const dir = ctx.facingRight ? 1 : -1;
    const cx = ctx.player.x + dir * 30;
    const cy = ctx.player.y - 70;

    const container = scene.add.container(cx, cy);
    const g = scene.add.graphics();

    // 外圈（紫色）
    g.lineStyle(3, 0x9b59b6, 0.9);
    g.strokeCircle(0, 0, 40);
    // 内圈（金色）
    g.lineStyle(2, 0xe8d44d, 0.8);
    g.strokeCircle(0, 0, 25);
    // 中心点
    g.fillStyle(0xe8d44d, 0.6);
    g.fillCircle(0, 0, 8);

    // 六条放射线
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      g.lineStyle(2, 0x9b59b6, 0.7);
      g.lineBetween(
        Math.cos(angle) * 12, Math.sin(angle) * 12,
        Math.cos(angle) * 38, Math.sin(angle) * 38,
      );
    }

    // 三个小三角符文
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const tcx = Math.cos(angle) * 32;
      const tcy = Math.sin(angle) * 32;
      g.fillStyle(0xe8d44d, 0.5);
      g.fillTriangle(tcx - 5, tcy - 4, tcx + 5, tcy - 4, tcx, tcy + 5);
    }

    container.add(g);
    container.setScale(1, 0.5);            // 压扁成椭圆（透视效果）
    container.setAngle(dir > 0 ? -15 : 15); // 微微倾斜

    // 光晕
    container.addAt(scene.add.circle(0, 0, 55, 0x9b59b6, 0.15), 0);

    return container;
  }

  // ======================== 巨剑发射 ========================

  /**
   * 巨剑从法阵位置飞出
   * 用 Tween 做飞行动画，onUpdate 中持续检测伤害
   */
  private launchGiantSword(ctx: SkillContext) {
    this.hitEnemies.clear();
    const scene = ctx.scene;
    const dir = ctx.facingRight ? 1 : -1;
    const startX = ctx.player.x + dir * 30;
    const startY = ctx.player.y - 70;

    // 用三角函数算终点（向下 angle° 飞行）
    const angleRad = Phaser.Math.DegToRad(this.angle);
    const endX = startX + dir * Math.cos(angleRad) * this.swordRange;
    const endY = startY + Math.sin(angleRad) * this.swordRange;

    // ---- 画巨剑 ----
    const sword = scene.add.container(startX, startY);
    const g = scene.add.graphics();

    // 剑身（金色菱形）
    g.fillStyle(0xd4af37, 1);
    g.fillPoints([
      new Phaser.Geom.Point(0, -60),
      new Phaser.Geom.Point(12, -10),
      new Phaser.Geom.Point(6, 20),
      new Phaser.Geom.Point(-6, 20),
      new Phaser.Geom.Point(-12, -10),
    ], true);

    // 剑身中线发光
    g.lineStyle(2, 0xffffff, 0.6);
    g.lineBetween(0, -55, 0, 15);
    // 剑柄
    g.fillStyle(0x8b4513, 1);
    g.fillRect(-4, 20, 8, 15);
    // 护手
    g.fillStyle(0xd4af37, 1);
    g.fillRect(-14, 18, 28, 5);

    sword.add(g);
    sword.setAngle(dir > 0 ? 90 + this.angle : -(90 + this.angle));
    sword.setScale(0.5);

    // ---- 飞行动画 ----
    scene.tweens.add({
      targets: sword,
      x: endX, y: endY,
      scale: 1.2,
      duration: (this.swordRange / this.swordSpeed) * 1000,
      ease: "Power1",
      // 飞行中持续检测碰撞
      onUpdate: () => this.swordHitCheck(ctx, sword.x, sword.y, dir),
      onComplete: () => {
        // 到终点后淡出消失
        scene.tweens.add({
          targets: sword, alpha: 0, scale: 0.3, duration: 200,
          onComplete: () => sword.destroy(),
        });
      },
    });

    // 拖尾光效
    this.swordTrail(scene, startX, startY, endX, endY);
  }

  /**
   * 巨剑飞行中的伤害检测
   * hitEnemies 记录已命中的敌人，保证每个敌人只受一次伤
   */
  private swordHitCheck(ctx: SkillContext, swordX: number, swordY: number, dir: number) {
    ctx.enemies.getChildren().forEach((obj) => {
      const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
      if (!enemy?.alive) return;
      if (this.hitEnemies.has(enemy)) return;

      const dx = enemy.container.x - swordX;
      const dy = enemy.container.y - swordY;

      // AOE 判定
      if (Math.abs(dy) < this.aoeWidth / 2 && Math.abs(dx) < 50) {
        ctx.damageEnemy(enemy, this.damage, dir * 350);
        this.hitEnemies.add(enemy);
      }
    });
  }

  /** 巨剑飞行的金色拖尾粒子 */
  private swordTrail(
    scene: Phaser.Scene,
    startX: number, startY: number, endX: number, endY: number,
  ) {
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;

      const particle = scene.add.circle(x, y, 6 + Math.random() * 6, 0xd4af37, 0.5);
      scene.tweens.add({
        targets: particle,
        alpha: 0, scale: 2,
        y: y - 10 - Math.random() * 10,
        duration: 300 + Math.random() * 200,
        delay: i * 40,
        onComplete: () => particle.destroy(),
      });
    }
  }
}
