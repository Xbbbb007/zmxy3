/**
 * 天降神踏（DivineStamp）
 *
 * 技能3（I 键）：大范围 AOE + 毒池持续伤害
 *
 * 施放流程：
 * 1. 蓄力阶段（CHARGE_TIME）：脚下法阵浮现（代码绘制的六芒星法阵）
 * 2. 踩踏阶段（STOMP_DURATION）：金色巨脚从天而降，砸向法阵中心
 * 3. 冲击瞬间：屏幕震动 + 冲击波扩散 + AOE 伤害
 * 4. 毒池阶段（POISON_DURATION）：绿色毒气笼罩法阵区域，
 *    范围内的敌人每 POISON_TICK 受到一次毒伤
 */

import { Enemy } from "../types/EnemyTypes";
import { MagicCircle } from "./MagicCircle";

/** 和 FlameDash / GiantSword 共用的上下文接口 */
export interface SkillContext {
  scene: Phaser.Scene;
  player: Phaser.GameObjects.Container;
  facingRight: boolean;
  enemies: Phaser.Physics.Arcade.Group;
  damageEnemy: (enemy: Enemy, damage: number, knockbackX: number) => void;
  setDash: (isDashing: boolean, endTime: number) => void;
}

export class DivineStamp {
  // ========== 可调参数 ==========
  readonly mpCost = 40;              // MP 消耗
  readonly cooldownMs = 0;           // 冷却时间（无CD）
  readonly chargeTime = 800;         // 法阵蓄力时间(ms)
  readonly stompDuration = 400;      // 巨脚下落时间(ms)
  readonly damage = 50;              // 踩踏瞬间 AOE 伤害
  readonly poisonDot = 8;            // 毒池每次伤害
  readonly poisonTickMs = 500;       // 毒伤间隔(ms)
  readonly poisonDuration = 5000;    // 毒池持续时间(ms)
  readonly aoeRadius = 130;          // AOE 判定半径(像素)
  readonly circleDisplayScale = 0.28;  // 法阵图片显示缩放

  // 运行时状态
  isCasting = false;

  /**
   * 尝试释放天降神踏
   * @returns true = 成功进入蓄力（BattleScene 扣 MP）
   */
  execute(ctx: SkillContext): boolean {
    if (this.isCasting) return false;
    this.isCasting = true;

    const scene = ctx.scene;
    const targetX = ctx.player.x;
    const targetY = ctx.player.y;

    // ===== 阶段1：法阵浮现 =====
    const circle = this.showMagicCircle(scene, targetX, targetY);

    // ===== 阶段2：蓄力结束 → 巨脚从天而降 =====
    scene.time.delayedCall(this.chargeTime, () => {
      circle.destroy();
      this.doStomp(ctx, targetX, targetY);
    });

    return true;
  }

  // ======================== 法阵特效 ========================

  /**
   * 代码绘制的六芒星法阵（三层差速旋转 + 光晕）
   * 出现在玩家脚下，从地面浮现
   */
  private showMagicCircle(
    scene: Phaser.Scene, cx: number, cy: number,
  ): { destroy: () => void } {
    // 用代码绘制的动态法阵（火色方案）
    const mc = new MagicCircle(scene, cx, cy, 0.35, "fire");
    const sprite = mc.getSprite();
    sprite.setAlpha(0);

    // 从地面浮现
    scene.tweens.add({
      targets: sprite,
      alpha: 1,
      duration: this.chargeTime * 0.6,
      ease: "Power2",
    });

    // 每帧驱动法阵动画
    const updateListener = (_time: number, delta: number) => {
      mc.update(delta);
    };
    scene.events.on("update", updateListener);

    // 返回可销毁对象，同时清理 update 监听
    return {
      destroy: () => {
        scene.events.off("update", updateListener);
        mc.destroy();
      },
    };
  }

  // ======================== 巨脚踩踏 ========================

  /**
   * 巨脚从天空坠落 → 砸中地面 → 冲击波 + AOE 伤害
   */
  private doStomp(ctx: SkillContext, targetX: number, targetY: number) {
    const scene = ctx.scene;

    // ---- 画巨脚（金色大脚掌） ----
    const foot = scene.add.container(targetX, targetY - 500);
    const g = scene.add.graphics();

    // 脚掌主体
    g.fillStyle(0xd4af37, 1);
    g.fillRoundedRect(-30, 0, 60, 90, 10);

    // 脚趾（5个）
    for (let i = 0; i < 5; i++) {
      const tx = -24 + i * 12;
      g.fillCircle(tx, -4, 8);
    }

    // 脚底纹路
    g.lineStyle(2, 0x8b6914, 0.6);
    g.lineBetween(-20, 40, 20, 40);
    g.lineBetween(-15, 55, 15, 55);

    // 发光外圈
    g.lineStyle(3, 0xffd700, 0.4);
    g.strokeRoundedRect(-32, -12, 64, 104, 12);

    foot.add(g);
    foot.setScale(0.8);
    foot.setAlpha(0.8);

    // ---- 下落动画 ----
    scene.tweens.add({
      targets: foot,
      y: targetY - 20,
      duration: this.stompDuration,
      ease: "Power3",
      onComplete: () => {
        // 冲击瞬间
        this.doImpact(ctx, targetX, targetY);

        // 巨脚短暂停留后淡出
        scene.tweens.add({
          targets: foot,
          alpha: 0,
          scaleX: 1.2,
          scaleY: 0.4,
          duration: 250,
          onComplete: () => foot.destroy(),
        });

        // 进入毒池阶段
        this.createPoisonZone(ctx, targetX, targetY);

        this.isCasting = false;
      },
    });
  }

  // ======================== 冲击效果 ========================

  /**
   * 踩踏落地瞬间：屏幕震动 + AOE 伤害 + 冲击波 + 碎石
   */
  private doImpact(ctx: SkillContext, cx: number, cy: number) {
    const scene = ctx.scene;

    // ---- 屏幕震动 ----
    scene.cameras.main.shake(300, 0.02);

    // ---- AOE 伤害（以法阵为中心向外击退） ----
    ctx.enemies.getChildren().forEach((obj) => {
      const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
      if (!enemy?.alive) return;

      const dx = enemy.container.x - cx;
      const dy = enemy.container.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < this.aoeRadius) {
        const kDir = dx > 0 ? 1 : -1;
        ctx.damageEnemy(enemy, this.damage, kDir * 300);
      }
    });

    // ---- 冲击波（左右两个半圆扩散） ----
    [-1, 1].forEach((d) => {
      const wave = scene.add.rectangle(cx, cy - 10, 10, 40, 0xd4af37, 0.7);
      scene.tweens.add({
        targets: wave,
        x: cx + d * this.aoeRadius * 1.3,
        width: 180,
        alpha: 0,
        duration: 350,
        ease: "Power2",
        onComplete: () => wave.destroy(),
      });
    });

    // ---- 地面裂缝 ----
    const crack = scene.add.graphics();
    crack.lineStyle(3, 0x8b4513, 0.6);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const len = 40 + Math.random() * 60;
      crack.lineBetween(
        cx, cy,
        cx + Math.cos(angle) * len,
        cy + Math.sin(angle) * len * 0.3, // 纵向压缩（地面透视）
      );
    }
    scene.tweens.add({
      targets: crack,
      alpha: 0,
      duration: 600,
      onComplete: () => crack.destroy(),
    });

    // ---- 碎石粒子 ----
    for (let i = 0; i < 10; i++) {
      const debris = scene.add.rectangle(
        cx + (Math.random() - 0.5) * 80,
        cy,
        4 + Math.random() * 6,
        4 + Math.random() * 6,
        0x8b6914,
      );
      scene.tweens.add({
        targets: debris,
        y: cy - 40 - Math.random() * 60,
        x: debris.x + (Math.random() - 0.5) * 120,
        alpha: 0,
        angle: Math.random() * 720,
        duration: 400 + Math.random() * 300,
        ease: "Bounce",
        onComplete: () => debris.destroy(),
      });
    }
  }

  // ======================== 毒池 ========================

  /**
   * 踩踏后在目标位置创建持续 5 秒的毒气区域
   * - 绿色法阵残影铺在地面
   * - 毒气粒子往上飘
   * - 范围内敌人每 500ms 受到毒伤
   */
  private createPoisonZone(ctx: SkillContext, cx: number, cy: number) {
    const scene = ctx.scene;

    // ---- 毒池底图（绿色代码绘制法阵残影） ----
    const poisonMc = new MagicCircle(scene, cx, cy, 0.35, "poison");
    const poisonSprite = poisonMc.getSprite();
    poisonSprite.setAlpha(0.35);

    // 每帧驱动毒池法阵动画
    const poisonUpdateListener = (_time: number, delta: number) => {
      poisonMc.update(delta);
    };
    scene.events.on("update", poisonUpdateListener);

    // 绿色椭圆光环
    const glow = scene.add.ellipse(cx, cy, this.aoeRadius * 1.6, 30, 0x00ff00, 0.2);

    // ---- 毒气粒子（持续生成） ----
    let poisonActive = true;
    const particleTimer = scene.time.addEvent({
      delay: 180,
      loop: true,
      callback: () => {
        if (!poisonActive) return;
        const px = cx + (Math.random() - 0.5) * this.aoeRadius * 1.4;
        const py = cy;
        const particle = scene.add.circle(
          px, py, 4 + Math.random() * 6, 0x44ff44, 0.45,
        );
        scene.tweens.add({
          targets: particle,
          y: py - 30 - Math.random() * 40,
          x: px + (Math.random() - 0.5) * 20,
          alpha: 0,
          scale: 0.4,
          duration: 600 + Math.random() * 400,
          onComplete: () => particle.destroy(),
        });
      },
    });

    // ---- DOT 伤害（每 500ms 检测一次） ----
    const dotTimer = scene.time.addEvent({
      delay: this.poisonTickMs,
      loop: true,
      callback: () => {
        ctx.enemies.getChildren().forEach((obj) => {
          const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
          if (!enemy?.alive) return;

          const dx = enemy.container.x - cx;
          const dy = enemy.container.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < this.aoeRadius) {
            // 毒伤：不击退（避免硬直期间抖动），仅扣血 + 飘字
            enemy.hp -= this.poisonDot;

            // 绿色受击闪烁
            scene.tweens.add({
              targets: enemy.container,
              alpha: 0.5,
              duration: 50,
              yoyo: true,
            });

            // 毒伤飘字
            const dmgText = scene.add.text(
              enemy.container.x + (Math.random() - 0.5) * 20,
              enemy.container.y - 35,
              `-${this.poisonDot}`,
              {
                fontSize: "16px",
                color: "#44ff44",
                fontFamily: "Arial",
                fontStyle: "bold",
              },
            ).setOrigin(0.5);

            scene.tweens.add({
              targets: dmgText,
              y: dmgText.y - 25,
              alpha: 0,
              duration: 500,
              onComplete: () => dmgText.destroy(),
            });

            // 更新血条
            const ratio = Math.max(0, enemy.hp / enemy.maxHp);
            enemy.hpBarFill.width = 38 * ratio;
            enemy.hpBarFill.setFillStyle(ratio > 0.3 ? 0x48bb78 : 0xe53e3e);

            // 毒杀判定
            if (enemy.hp <= 0 && enemy.alive) {
              enemy.alive = false;
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
          }
        });
      },
    });

    // ---- 5 秒后消散 ----
    scene.time.delayedCall(this.poisonDuration, () => {
      poisonActive = false;
      particleTimer.remove();
      dotTimer.remove();
      scene.events.off("update", poisonUpdateListener);

      // 淡出动画
      scene.tweens.add({
        targets: [poisonSprite, glow],
        alpha: 0,
        duration: 500,
        onComplete: () => {
          poisonMc.destroy();
          glow.destroy();
        },
      });
    });
  }
}
