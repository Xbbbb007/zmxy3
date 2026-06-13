/**
 * 敌人管理器（EnemyManager）
 *
 * 统一管理所有敌人（小怪 + BOSS）的生成和调度。
 *
 * 职责分工：
 * - 小怪（NORMAL/CHARGER/THROWER）→ 委托给 minions/ 模块
 *   - 参数配置：minions/MinionConfig.ts
 *   - 共享行为：minions/MinionBehavior.ts
 *   - 各类型 AI：minions/NormalAI.ts / ChargerAI.ts / ThrowerAI.ts
 * - BOSS（赤焰魔君）→ 本文件直接处理
 *   - 参数在文件顶部
 *   - AI 状态机在本文件
 *
 * BattleScene 只需：
 * 1. new EnemyManager(scene, player, projectilesGroup, damagePlayerCallback)
 * 2. manager.spawnEnemy(x, y, hp, type)
 * 3. manager.update()
 * 4. manager.damageEnemy(enemy, damage, knockback)
 * 5. manager.enemies  // 获取敌人组
 * 6. manager.bossRef  // 获取 BOSS 引用
 */

import { Enemy, EnemyState, EnemyType } from "../types/EnemyTypes";
import * as Minions from "./minions";

export class EnemyManager {
  // ========== BOSS 参数（赤焰魔君） ==========

  readonly BOSS_PATROL_SPEED = 40;
  readonly BOSS_CHARGE_SPEED = 500;
  readonly BOSS_CHARGE_WINDUP = 800;
  readonly BOSS_CHARGE_DURATION = 600;
  readonly BOSS_CHARGE_DAMAGE = 20;
  readonly BOSS_CHARGE_KNOCKBACK = 300;
  readonly BOSS_JUMP_WINDUP = 600;
  readonly BOSS_JUMP_HEIGHT = 200;
  readonly BOSS_JUMP_DAMAGE = 25;
  readonly BOSS_JUMP_KNOCKBACK = 350;
  readonly BOSS_JUMP_SHOCKWAVE_SPEED = 250;
  readonly BOSS_BARRAGE_WINDUP = 1000;
  readonly BOSS_BARRAGE_COUNT = 5;
  readonly BOSS_BARRAGE_DAMAGE = 10;
  readonly BOSS_BARRAGE_SPEED = 300;
  readonly BOSS_COOLDOWN = 1500;
  readonly BOSS_HIT_STAGGER = 150;

  // ========== 公共属性 ==========

  /** 敌人物理组 */
  readonly enemies: Phaser.Physics.Arcade.Group;

  /** BOSS 引用（用于 BOSS 血条），生成 BOSS 后才有值 */
  bossRef: Enemy | null = null;

  // ========== 私有属性 ==========

  private scene: Phaser.Scene;
  private player: Phaser.GameObjects.Container;
  private projectiles: Phaser.Physics.Arcade.Group;
  private damagePlayer: (damage: number, knockbackX: number) => void;

  constructor(
    scene: Phaser.Scene,
    player: Phaser.GameObjects.Container,
    projectiles: Phaser.Physics.Arcade.Group,
    damagePlayer: (damage: number, knockbackX: number) => void,
  ) {
    this.scene = scene;
    this.player = player;
    this.projectiles = projectiles;
    this.damagePlayer = damagePlayer;

    this.enemies = scene.physics.add.group({
      collideWorldBounds: true,
    });
  }

  // ======================== 敌人生成 ========================

  /**
   * 生成一个敌人（小怪或 BOSS 通用）
   */
  spawnEnemy(x: number, y: number, maxHp: number, type: EnemyType = EnemyType.NORMAL) {
    const scene = this.scene;
    const container = scene.add.container(x, y);
    const g = scene.add.graphics();

    // ---- 根据类型画不同外观 ----
    if (type === EnemyType.BOSS) {
      this.drawBoss(g);
    } else {
      Minions.MinionBehavior.drawMinion(g, type);
    }
    container.add(g);

    // ---- 头顶血条 ----
    const hpBarY = type === EnemyType.BOSS ? -50 : (type === EnemyType.THROWER ? -40 : -36);
    const hpBarW = type === EnemyType.BOSS ? 78 : 38;
    const hpBarBg = scene.add.rectangle(x, y + hpBarY, hpBarW + 2, 6, 0x333333);
    const hpBarFill = scene.add.rectangle(x - hpBarW / 2, y + hpBarY, hpBarW, 4, 0x48bb78)
      .setOrigin(0, 0.5);

    // BOSS 用屏幕顶部专用血条，头顶的隐藏
    if (type === EnemyType.BOSS) {
      hpBarBg.setVisible(false);
      hpBarFill.setVisible(false);
    }

    // ---- 构建敌人数据 ----
    const patrolRange = type === EnemyType.BOSS ? 0 : this.getPatrolRange(type);
    const enemy: Enemy = {
      container, hp: maxHp, maxHp, hpBarBg, hpBarFill, alive: true,
      type,
      patrolLeft: x - patrolRange,
      patrolRight: x + patrolRange,
      facingRight: true,
      state: EnemyState.PATROL,
      stateTimer: 0,
      windupIndicator: null,
      attackIndex: 0,
    };
    container.setData("enemy", enemy);

    // ---- 设置物理体 ----
    if (type === EnemyType.BOSS) {
      this.setupBossBody(container);
    } else {
      Minions.MinionBehavior.setupMinionBody(scene, container, type);
    }

    this.enemies.add(container);

    if (type === EnemyType.BOSS) {
      this.bossRef = enemy;
    }
  }

  /** 根据小怪类型返回巡逻范围 */
  private getPatrolRange(type: EnemyType): number {
    switch (type) {
      case EnemyType.CHARGER: return Minions.CHARGER.PATROL_RANGE;
      case EnemyType.THROWER: return Minions.THROWER.PATROL_RANGE;
      default: return Minions.NORMAL.PATROL_RANGE;
    }
  }

  // ======================== BOSS 外观 ========================

  /** BOSS（赤焰魔君）：暗红大块 + 金色冠角 + 火焰眼睛 */
  private drawBoss(g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0xcc0000, 1);
    g.fillRect(-32, -40, 64, 80);
    g.lineStyle(3, 0x8b0000);
    g.strokeRect(-32, -40, 64, 80);
    g.fillStyle(0xe8d44d, 1);
    g.fillRect(-36, -30, 8, 20);
    g.fillRect(28, -30, 8, 20);
    g.fillTriangle(-20, -40, -12, -40, -16, -58);
    g.fillTriangle(0, -40, 0, -40, 0, -62);
    g.fillTriangle(20, -40, 12, -40, 16, -58);
    g.fillRect(-2, -62, 4, 22);
    g.fillStyle(0xff6600, 1);
    g.fillCircle(-10, -20, 6);
    g.fillCircle(10, -20, 6);
    g.fillStyle(0xffff00, 1);
    g.fillCircle(-10, -20, 3);
    g.fillCircle(10, -20, 3);
    g.lineStyle(2, 0xe8d44d, 0.6);
    g.lineBetween(-15, -5, 15, 25);
    g.lineBetween(15, -5, -15, 25);
  }

  /**
   * BOSS 物理体
   * 视觉大小 80px，但碰撞体和小怪一样高(48px)
   * 统一高度才能让所有敌人站在同一条线上
   */
  private setupBossBody(container: Phaser.GameObjects.Container) {
    this.scene.physics.add.existing(container);
    const body = container.body as Phaser.Physics.Arcade.Body;
    body.setSize(64, 48);
    body.setOffset(-32, -24);
    body.setDragX(200); // BOSS 更重，击退恢复更快
    body.setCollideWorldBounds(true);
  }

  // ======================== 受伤与死亡 ========================

  /**
   * 敌人受到伤害（统一入口）
   * - BOSS → 走霸体逻辑
   * - 小怪 → 委托给 minions/MinionBehavior
   */
  damageEnemy(enemy: Enemy, damage: number, knockbackX: number) {
    if (!enemy.alive) return;

    if (enemy.type === EnemyType.BOSS) {
      this.damageBoss(enemy, damage, knockbackX);
    } else {
      const died = Minions.MinionBehavior.damageMinion(this.scene, enemy, damage, knockbackX);
      if (died) {
        Minions.MinionBehavior.killMinion(this.scene, enemy);
      }
    }
  }

  /**
   * BOSS 受击（霸体机制）
   * - 攻击中/WINDUP 不会被打断
   * - PATROL/COOLDOWN 才短暂硬直（150ms），击退 0.3 倍
   */
  private damageBoss(enemy: Enemy, damage: number, knockbackX: number) {
    enemy.hp -= damage;
    const scene = this.scene;
    const body = enemy.container.body as Phaser.Physics.Arcade.Body;

    if (enemy.state === EnemyState.PATROL || enemy.state === EnemyState.COOLDOWN) {
      enemy.state = EnemyState.HIT;
      enemy.stateTimer = scene.time.now + this.BOSS_HIT_STAGGER;
      body.setVelocityX(knockbackX * 0.3);
    }

    // 受击闪烁（BOSS 闪红）
    scene.tweens.add({
      targets: enemy.container,
      alpha: 0.6,
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
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    enemy.hpBarFill.width = 38 * ratio;
    enemy.hpBarFill.setFillStyle(ratio > 0.3 ? 0x48bb78 : 0xe53e3e);

    if (enemy.hp <= 0) {
      enemy.alive = false;
      // BOSS 死亡也用小怪的旋转升天动画
      Minions.MinionBehavior.killMinion(scene, enemy);
    }
  }

  // ======================== 每帧更新（AI 状态机） ========================

  /**
   * 每帧更新所有敌人
   * - BOSS → 本文件处理
   * - 小怪 → 委托给 minions 各类型的 AI
   */
  update() {
    const scene = this.scene;
    const now = scene.time.now;

    this.enemies.getChildren().forEach((obj) => {
      const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
      if (!enemy?.alive) return;

      if (enemy.type === EnemyType.BOSS) {
        this.updateBoss(enemy, now);
      } else {
        this.updateMinion(enemy, now);
      }

      // 视觉跟随（血条 + 指示器位置）
      if (enemy.type === EnemyType.BOSS) {
        this.syncBossVisuals(enemy);
      } else {
        Minions.MinionBehavior.syncVisuals(enemy);
      }
    });
  }

  // ======================== 小怪 AI 调度 ========================

  /** 更新单个小怪的 AI 状态机 */
  private updateMinion(enemy: Enemy, now: number) {
    const body = enemy.container.body as Phaser.Physics.Arcade.Body;
    const dx = this.player.x - enemy.container.x;
    const distToPlayer = Math.abs(dx);

    switch (enemy.state) {
      case EnemyState.PATROL: {
        Minions.MinionBehavior.updatePatrol(enemy);
        const detectRange = Minions.MinionBehavior.getDetectRange(enemy);

        if (distToPlayer < detectRange) {
          // 投掷怪特殊：太近了后退
          if (enemy.type === EnemyType.THROWER) {
            if (Minions.ThrowerAI.throwerRetreatIfTooClose(enemy, dx, distToPlayer)) {
              break;
            }
          }
          this.startMinionWindup(enemy, dx);
        }
        break;
      }

      case EnemyState.WINDUP: {
        body.setVelocityX(0);
        if (now >= enemy.stateTimer) {
          this.performMinionAttack(enemy);
        }
        break;
      }

      case EnemyState.ATTACKING: {
        body.setVelocityX(0);
        if (now >= enemy.stateTimer) {
          Minions.NormalAI.finishNormalAttack(enemy, now);
        }
        break;
      }

      case EnemyState.CHARGING: {
        Minions.ChargerAI.updateChargerCharge(
          enemy, this.player.x, this.player.y, now, this.damagePlayer,
        );
        break;
      }

      case EnemyState.AIMING: {
        body.setVelocityX(0);
        if (now >= enemy.stateTimer) {
          Minions.ThrowerAI.launchProjectile(
            this.scene, enemy, this.player.x, this.player.y, this.projectiles,
          );
        }
        break;
      }

      case EnemyState.COOLDOWN: {
        if (now >= enemy.stateTimer) {
          enemy.state = EnemyState.PATROL;
        }
        break;
      }

      case EnemyState.HIT: {
        // 硬直期间冻结在原地，纯计时恢复
        body.setVelocityX(0);
        if (now >= enemy.stateTimer) {
          enemy.state = EnemyState.PATROL;
        }
        break;
      }
    }
  }

  /** 小怪进入前摇（根据类型委托给对应 AI） */
  private startMinionWindup(enemy: Enemy, dxToPlayer: number) {
    switch (enemy.type) {
      case EnemyType.NORMAL:
        Minions.NormalAI.startNormalWindup(this.scene, enemy, dxToPlayer);
        break;
      case EnemyType.CHARGER:
        Minions.ChargerAI.startChargerWindup(this.scene, enemy, dxToPlayer);
        break;
      case EnemyType.THROWER:
        Minions.ThrowerAI.startThrowerWindup(this.scene, enemy, dxToPlayer);
        break;
    }
  }

  /** 小怪执行攻击（根据类型委托给对应 AI） */
  private performMinionAttack(enemy: Enemy) {
    switch (enemy.type) {
      case EnemyType.NORMAL:
        Minions.NormalAI.performNormalAttack(
          this.scene, enemy, this.player.x, this.player.y, this.damagePlayer,
        );
        break;
      case EnemyType.CHARGER:
        Minions.ChargerAI.performChargerAttack(this.scene, enemy);
        break;
      case EnemyType.THROWER:
        Minions.ThrowerAI.performThrowerAim(this.scene, enemy);
        break;
    }
  }

  // ======================== BOSS AI ========================

  /** BOSS 每帧 AI 更新 */
  private updateBoss(enemy: Enemy, now: number) {
    const body = enemy.container.body as Phaser.Physics.Arcade.Body;
    const dx = this.player.x - enemy.container.x;
    const distToPlayer = Math.abs(dx);

    switch (enemy.state) {
      case EnemyState.PATROL: {
        // BOSS 不巡逻，慢步逼近玩家
        const dir = dx > 0 ? 1 : -1;
        enemy.facingRight = dir > 0;
        if (distToPlayer > 60) {
          body.setVelocityX(dir * this.BOSS_PATROL_SPEED);
        } else {
          body.setVelocityX(0);
        }
        if (distToPlayer < 400) {
          this.startBossWindup(enemy, dx);
        }
        break;
      }

      case EnemyState.WINDUP: {
        body.setVelocityX(0);
        if (now >= enemy.stateTimer) {
          this.performBossAttack(enemy);
        }
        break;
      }

      case EnemyState.CHARGING: {
        const dir = enemy.facingRight ? 1 : -1;
        body.setVelocityX(dir * this.BOSS_CHARGE_SPEED);

        const hitDx = this.player.x - enemy.container.x;
        const hitDy = this.player.y - enemy.container.y;
        if (Math.abs(hitDx) < 50 && Math.abs(hitDy) < 48) {
          this.damagePlayer(this.BOSS_CHARGE_DAMAGE, dir * this.BOSS_CHARGE_KNOCKBACK);
        }

        if (now >= enemy.stateTimer) {
          body.setVelocityX(0);
          enemy.state = EnemyState.COOLDOWN;
          enemy.stateTimer = now + this.BOSS_COOLDOWN;
        }
        break;
      }

      case EnemyState.BOSS_JUMP: {
        body.setVelocityX(0);
        if (now >= enemy.stateTimer) {
          enemy.state = EnemyState.COOLDOWN;
          enemy.stateTimer = now + this.BOSS_COOLDOWN;
        }
        break;
      }

      case EnemyState.BOSS_FIRE: {
        body.setVelocityX(0);
        if (now >= enemy.stateTimer) {
          enemy.state = EnemyState.COOLDOWN;
          enemy.stateTimer = now + this.BOSS_COOLDOWN;
        }
        break;
      }

      case EnemyState.COOLDOWN: {
        if (now >= enemy.stateTimer) {
          enemy.state = EnemyState.PATROL;
        }
        break;
      }

      case EnemyState.HIT: {
        // 硬直期间冻结，纯计时恢复
        body.setVelocityX(0);
        if (now >= enemy.stateTimer) {
          enemy.state = EnemyState.PATROL;
        }
        break;
      }
    }
  }

  /** BOSS 进入前摇（根据攻击序号显示攻击类型） */
  private startBossWindup(enemy: Enemy, dxToPlayer: number) {
    const scene = this.scene;
    enemy.state = EnemyState.WINDUP;

    const atk = enemy.attackIndex % 3;
    const windupTime = atk === 0 ? this.BOSS_CHARGE_WINDUP
      : (atk === 1 ? this.BOSS_JUMP_WINDUP : this.BOSS_BARRAGE_WINDUP);

    enemy.stateTimer = scene.time.now + windupTime;
    enemy.facingRight = dxToPlayer > 0;

    const indicatorText = atk === 0 ? "\u26A1\u51B2\u950B"
      : (atk === 1 ? "\uD83D\uDCA5\u8DF3\u7838" : "\uD83D\uDD25\u5F39\u5E55");

    enemy.windupIndicator = scene.add.text(
      enemy.container.x, enemy.container.y - 52,
      indicatorText, {
        fontSize: "18px",
        color: "#ff0000",
        fontFamily: "Arial", fontStyle: "bold",
        backgroundColor: "#00000088", padding: { x: 4, y: 2 },
      },
    ).setOrigin(0.5);

    scene.tweens.add({
      targets: enemy.windupIndicator,
      alpha: 0.3, duration: 150, yoyo: true, repeat: -1,
    });
  }

  /** BOSS 执行攻击（三种攻击循环：冲锋/跳砸/弹幕） */
  private performBossAttack(enemy: Enemy) {
    const scene = this.scene;

    if (enemy.windupIndicator) {
      enemy.windupIndicator.destroy();
      enemy.windupIndicator = null;
    }

    const atk = enemy.attackIndex % 3;
    enemy.attackIndex++;

    switch (atk) {
      case 0: // 冲锋
        enemy.state = EnemyState.CHARGING;
        enemy.stateTimer = scene.time.now + this.BOSS_CHARGE_DURATION;
        scene.cameras.main.shake(100, 0.005);
        break;
      case 1: // 跳砸
        this.bossJumpSlam(enemy);
        break;
      case 2: // 弹幕
        this.bossBarrage(enemy);
        break;
    }
  }

  // ======================== BOSS 跳砸 ========================

  /** BOSS 跳砸：跳起 → 滞空 → 砸落 → 冲击波 */
  private bossJumpSlam(enemy: Enemy) {
    const scene = this.scene;
    enemy.state = EnemyState.BOSS_JUMP;
    const body = enemy.container.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);

    const origY = enemy.container.y;
    const dir = enemy.facingRight ? 1 : -1;
    const targetX = this.player.x;

    // 阶段1：跳起
    scene.tweens.add({
      targets: enemy.container,
      y: origY - this.BOSS_JUMP_HEIGHT,
      x: targetX,
      duration: 300,
      ease: "Power2",
      onComplete: () => {
        // 阶段2：滞空
        scene.time.delayedCall(200, () => {
          // 阶段3：砸落
          scene.tweens.add({
            targets: enemy.container,
            y: origY,
            duration: 250,
            ease: "Bounce",
            onComplete: () => {
              body.setAllowGravity(true);

              const hitDx = Math.abs(this.player.x - enemy.container.x);
              const hitDy = Math.abs(this.player.y - enemy.container.y);
              if (hitDx < 60 && hitDy < 60) {
                this.damagePlayer(this.BOSS_JUMP_DAMAGE, dir * this.BOSS_JUMP_KNOCKBACK);
              }

              scene.cameras.main.shake(300, 0.015);
              this.bossShockwave(enemy.container.x, origY);

              enemy.stateTimer = scene.time.now + this.BOSS_COOLDOWN;
              enemy.state = EnemyState.COOLDOWN;
            },
          });
        });
      },
    });
  }

  /** BOSS 跳砸落地冲击波（左右扩散 + 碎石粒子） */
  private bossShockwave(x: number, y: number) {
    const scene = this.scene;

    [-1, 1].forEach((dir) => {
      const wave = scene.add.rectangle(x, y - 10, 10, 30, 0xff4444, 0.7);
      scene.tweens.add({
        targets: wave,
        x: x + dir * 200, width: 200, alpha: 0,
        duration: 400, ease: "Power2",
        onComplete: () => wave.destroy(),
      });

      const proj = scene.add.circle(x, y - 10, 8, 0xff6644, 0.5);
      this.projectiles.add(proj);
      proj.setData("damage", this.BOSS_JUMP_DAMAGE);
      const projBody = proj.body as Phaser.Physics.Arcade.Body;
      projBody.setAllowGravity(false);
      projBody.setVelocity(dir * this.BOSS_JUMP_SHOCKWAVE_SPEED, 0);
      scene.time.delayedCall(500, () => { if (proj.active) proj.destroy(); });
    });

    // 碎石
    for (let i = 0; i < 6; i++) {
      const debris = scene.add.rectangle(
        x + (Math.random() - 0.5) * 60, y,
        4 + Math.random() * 4, 4 + Math.random() * 4, 0x8b6914,
      );
      scene.tweens.add({
        targets: debris,
        y: y - 30 - Math.random() * 40,
        x: debris.x + (i % 2 === 0 ? 1 : -1) * (40 + Math.random() * 50),
        alpha: 0, angle: 360, duration: 500, ease: "Bounce",
        onComplete: () => debris.destroy(),
      });
    }
  }

  // ======================== BOSS 弹幕 ========================

  /** BOSS 弹幕攻击：扇形发射多颗能量球 */
  private bossBarrage(enemy: Enemy) {
    const scene = this.scene;
    enemy.state = EnemyState.BOSS_FIRE;
    enemy.stateTimer = scene.time.now + 800;

    const dir = enemy.facingRight ? 1 : -1;
    const startX = enemy.container.x + dir * 32;
    const startY = enemy.container.y - 20;
    const count = this.BOSS_BARRAGE_COUNT;

    for (let i = 0; i < count; i++) {
      scene.time.delayedCall(i * 120, () => {
        if (!enemy.alive) return;

        const spreadAngle = Phaser.Math.DegToRad(-30 + (60 * i / (count - 1)));
        const baseAngle = dir > 0 ? 0 : Math.PI;
        const finalAngle = baseAngle + spreadAngle;

        const vx = Math.cos(finalAngle) * this.BOSS_BARRAGE_SPEED;
        const vy = Math.sin(finalAngle) * this.BOSS_BARRAGE_SPEED;

        const proj = scene.add.circle(startX, startY, 8, 0xff4444, 0.9);
        this.projectiles.add(proj);
        proj.setData("damage", this.BOSS_BARRAGE_DAMAGE);
        const projBody = proj.body as Phaser.Physics.Arcade.Body;
        projBody.setAllowGravity(false);
        projBody.setSize(16, 16);
        projBody.setVelocity(vx, vy);

        scene.time.delayedCall(3000, () => { if (proj.active) proj.destroy(); });
      });
    }
  }

  // ======================== BOSS 视觉跟随 ========================

  /** BOSS 头顶血条/指示器位置跟随 */
  private syncBossVisuals(enemy: Enemy) {
    const x = enemy.container.x;
    const y = enemy.container.y;
    if (enemy.windupIndicator) {
      enemy.windupIndicator.setPosition(x, y - 52);
    }
  }
}
