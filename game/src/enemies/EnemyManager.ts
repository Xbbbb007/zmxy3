/**
 * 敌人管理器（EnemyManager）
 *
 * 把所有敌人相关的逻辑从 BattleScene 中抽出来：
 * - 敌人参数配置（巡逻怪/冲锋怪/投掷怪/BOSS）
 * - 敌人生成（spawnEnemy）
 * - 敌人 AI 状态机（updateEnemies）
 * - 受伤/死亡处理（damageEnemy / killEnemy）
 * - BOSS 专属攻击（冲锋/跳砸/弹幕）
 * - 投掷物发射
 *
 * BattleScene 只需：
 * 1. new EnemyManager(scene, player, projectilesGroup, damagePlayerCallback)
 * 2. manager.spawnEnemy(x, y, hp, type)
 * 3. manager.update() // 每帧调用
 * 4. manager.damageEnemy(enemy, damage, knockback) // 玩家攻击时调用
 * 5. manager.enemies // 获取敌人组（用于碰撞检测）
 * 6. manager.bossRef // 获取 BOSS 引用（用于 BOSS 血条）
 *
 * 好处：
 * - BattleScene 减少 700+ 行代码
 * - 想加新敌人类型？只改这个文件
 * - 参数全在文件顶部，改数字就能调难度
 */

import { Enemy, EnemyState, EnemyType } from "../types/EnemyTypes";

export class EnemyManager {
  // ========== 所有可调参数（改数字调难度！） ==========

  // 普通怪巡逻参数
  readonly PATROL_SPEED = 60;       // 巡逻移动速度（很慢，像散步）
  readonly PATROL_RANGE = 120;      // 巡逻范围（像素，出生点左右各走这么远）

  // 普通怪攻击参数
  readonly DETECT_RANGE = 80;       // 发现玩家的距离（像素，进入此范围就准备攻击）
  readonly ATTACK_WINDUP = 500;     // 攻击前摇（毫秒，期间可被打断）
  readonly ATTACK_DURATION = 200;   // 攻击判定持续时间（毫秒）
  readonly ATTACK_COOLDOWN = 800;   // 攻击后冷却（毫秒）
  readonly ATTACK_DAMAGE = 10;      // 攻击伤害
  readonly ATTACK_RANGE = 45;       // 攻击距离（像素）
  readonly ATTACK_KNOCKBACK = 180;  // 攻击击退力度

  // 冲锋怪参数
  readonly CHARGER_DETECT_RANGE = 250;   // 发现玩家距离（比近战怪远很多）
  readonly CHARGER_CHARGE_SPEED = 450;   // 冲锋速度（很快！）
  readonly CHARGER_CHARGE_WINDUP = 600;  // 冲锋前摇（蓄力时间，可打断）
  readonly CHARGER_CHARGE_DURATION = 500; // 冲锋持续时间
  readonly CHARGER_CHARGE_DAMAGE = 15;   // 冲撞伤害
  readonly CHARGER_CHARGE_KNOCKBACK = 250; // 冲撞击退
  readonly CHARGER_COOLDOWN = 1200;      // 冲锋后冷却（比较久）

  // 远程投掷怪参数
  readonly THROWER_DETECT_RANGE = 200;    // 发现玩家距离
  readonly THROWER_PREFERRED_DIST = 150;  // 偏好距离（保持这个距离扔东西）
  readonly THROWER_AIM_TIME = 400;        // 瞄准时间（毫秒，可打断）
  readonly THROWER_COOLDOWN = 1500;       // 投掷后冷却
  readonly THROWER_PROJECTILE_SPEED = 350; // 投掷物飞行速度
  readonly THROWER_PROJECTILE_DAMAGE = 8;  // 投掷物伤害
  readonly THROWER_RETREAT_SPEED = 80;    // 后退速度（玩家靠近时往后跑）

  // BOSS 参数（赤焰魔君）
  readonly BOSS_PATROL_SPEED = 40;        // 慢步逼近速度（压迫感）
  readonly BOSS_CHARGE_SPEED = 500;       // 冲锋速度
  readonly BOSS_CHARGE_WINDUP = 800;      // 冲锋前摇（给玩家反应时间）
  readonly BOSS_CHARGE_DURATION = 600;    // 冲锋持续时间
  readonly BOSS_CHARGE_DAMAGE = 20;       // 冲撞伤害
  readonly BOSS_CHARGE_KNOCKBACK = 300;   // 冲撞击退
  readonly BOSS_JUMP_WINDUP = 600;        // 跳砸前摇
  readonly BOSS_JUMP_HEIGHT = 200;        // 跳起高度（像素）
  readonly BOSS_JUMP_DAMAGE = 25;         // 跳砸伤害
  readonly BOSS_JUMP_KNOCKBACK = 350;     // 跳砸击退
  readonly BOSS_JUMP_SHOCKWAVE_SPEED = 250; // 跳砸冲击波扩散速度
  readonly BOSS_BARRAGE_WINDUP = 1000;    // 弹幕前摇
  readonly BOSS_BARRAGE_COUNT = 5;        // 弹幕数量（扇形发射）
  readonly BOSS_BARRAGE_DAMAGE = 10;      // 每颗弹幕伤害
  readonly BOSS_BARRAGE_SPEED = 300;      // 弹幕飞行速度
  readonly BOSS_COOLDOWN = 1500;          // 每次攻击后冷却
  readonly BOSS_HIT_STAGGER = 150;        // 受击硬直（很短，有霸体感）

  // ========== 公共属性（BattleScene 需要读取） ==========

  /** 敌人物理组（用于与玩家/地面的碰撞检测） */
  readonly enemies: Phaser.Physics.Arcade.Group;

  /** BOSS 引用（用于 BOSS 血条更新），生成 BOSS 后才有值 */
  bossRef: Enemy | null = null;

  // ========== 私有属性 ==========

  /** 场景引用 */
  private scene: Phaser.Scene;
  /** 玩家容器（用于距离计算） */
  private player: Phaser.GameObjects.Container;
  /** 投掷物物理组（BOSS/投掷怪的弹药加到这里） */
  private projectiles: Phaser.Physics.Arcade.Group;
  /** 玩家受伤回调（由 BattleScene 提供） */
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

    // 创建敌人物理组
    this.enemies = scene.physics.add.group({
      collideWorldBounds: true,
    });
  }

  // ======================== 敌人生成 ========================

  /**
   * 生成一个敌人
   * @param x     出生 X 坐标
   * @param y     出生 Y 坐标
   * @param maxHp 最大血量
   * @param type  敌人类型（默认 NORMAL）
   */
  spawnEnemy(x: number, y: number, maxHp: number, type: EnemyType = EnemyType.NORMAL) {
    const scene = this.scene;
    const container = scene.add.container(x, y);
    const g = scene.add.graphics();

    // ---- 根据类型画不同外观 ----
    this.drawEnemyByType(g, type);
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
    const enemy: Enemy = {
      container, hp: maxHp, maxHp, hpBarBg, hpBarFill, alive: true,
      type,
      patrolLeft: x - this.PATROL_RANGE,
      patrolRight: x + this.PATROL_RANGE,
      facingRight: true,
      state: EnemyState.PATROL,
      stateTimer: 0,
      windupIndicator: null,
      attackIndex: 0,
    };
    container.setData("enemy", enemy);

    // ---- 设置物理体 ----
    this.setupEnemyBody(container, type);

    // 加入敌人组
    this.enemies.add(container);

    // BOSS 特殊处理：记录引用
    if (type === EnemyType.BOSS) {
      this.bossRef = enemy;
    }
  }

  /**
   * 根据敌人类型画不同外观
   * 每种敌人有独特的颜色、形状和大小
   */
  private drawEnemyByType(g: Phaser.GameObjects.Graphics, type: EnemyType) {
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
      case EnemyType.BOSS: {
        // BOSS（赤焰魔君）：暗红大块 + 金色冠角 + 火焰眼睛
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
        break;
      }
    }
  }

  /**
   * 设置敌人物理体（不同体型不同碰撞框）
   *
   * 关键：BOSS 视觉大小 80px，但碰撞体和小怪一样高(48px)
   * 原因：不同高度的碰撞体会站在不同的"地面"上，
   * 统一高度才能让所有敌人站在同一条线上。
   */
  private setupEnemyBody(container: Phaser.GameObjects.Container, type: EnemyType) {
    this.scene.physics.add.existing(container);
    const body = container.body as Phaser.Physics.Arcade.Body;

    let bodyW: number, bodyH: number, bodyOffY: number;
    switch (type) {
      case EnemyType.BOSS:    bodyW = 64; bodyH = 48; bodyOffY = -24; break;
      case EnemyType.CHARGER: bodyW = 40; bodyH = 40; bodyOffY = -20; break;
      case EnemyType.THROWER: bodyW = 24; bodyH = 56; bodyOffY = -28; break;
      default:                bodyW = 32; bodyH = 48; bodyOffY = -24; break;
    }

    body.setSize(bodyW, bodyH);
    body.setOffset(-bodyW / 2, bodyOffY);
    body.setDragX(type === EnemyType.BOSS ? 200 : 400); // BOSS 更重，击退恢复更快
    body.setCollideWorldBounds(true);
  }

  // ======================== 受伤与死亡 ========================

  /**
   * 敌人受到伤害
   *
   * BOSS 霸体机制：
   * - 攻击中/PATROL/COOLDOWN 状态下不会被中断
   * - 只有 PATROL/COOLDOWN 状态会进入短硬直（150ms）
   * - 击退只有 0.3 倍（BOSS 很重）
   *
   * 普通怪：
   * - 前摇会被打断（感叹号消失）
   * - 进入完整硬直（300ms）
   * - 全额击退
   */
  damageEnemy(enemy: Enemy, damage: number, knockbackX: number) {
    if (!enemy.alive) return;
    enemy.hp -= damage;

    const scene = this.scene;
    const body = enemy.container.body as Phaser.Physics.Arcade.Body;

    if (enemy.type === EnemyType.BOSS) {
      // BOSS 霸体：只有空闲状态才短暂硬直
      if (enemy.state === EnemyState.PATROL || enemy.state === EnemyState.COOLDOWN) {
        enemy.state = EnemyState.HIT;
        enemy.stateTimer = scene.time.now + this.BOSS_HIT_STAGGER;
        body.setVelocityX(knockbackX * 0.3);
      }
    } else {
      // 普通怪：打断前摇 + 完整硬直
      if (enemy.state === EnemyState.WINDUP && enemy.windupIndicator) {
        enemy.windupIndicator.destroy();
        enemy.windupIndicator = null;
      }
      enemy.state = EnemyState.HIT;
      enemy.stateTimer = scene.time.now + 300;
      body.setVelocityX(knockbackX);
    }

    // 受击闪烁（BOSS 闪红，普通怪变透明）
    scene.tweens.add({
      targets: enemy.container,
      alpha: enemy.type === EnemyType.BOSS ? 0.6 : 0.3,
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
    this.updateEnemyHpBar(enemy);

    // 死亡判定
    if (enemy.hp <= 0) {
      enemy.alive = false;
      this.killEnemy(enemy);
    }
  }

  /** 更新敌人头顶血条 */
  private updateEnemyHpBar(enemy: Enemy) {
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    enemy.hpBarFill.width = 38 * ratio;
    enemy.hpBarFill.setFillStyle(ratio > 0.3 ? 0x48bb78 : 0xe53e3e);
  }

  /** 敌人死亡动画：旋转升天 + 淡出 */
  private killEnemy(enemy: Enemy) {
    this.scene.tweens.add({
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

  // ======================== 每帧更新（AI 状态机） ========================

  /**
   * 每帧更新所有敌人
   *
   * 状态机循环：
   * PATROL → WINDUP → 攻击(ATTACKING/CHARGING/AIMING/BOSS_JUMP/BOSS_FIRE) → COOLDOWN → PATROL
   *                    ↑ 被打断 → HIT → PATROL
   */
  update() {
    const scene = this.scene;
    const now = scene.time.now;

    this.enemies.getChildren().forEach((obj) => {
      const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
      if (!enemy?.alive) return;

      const body = enemy.container.body as Phaser.Physics.Arcade.Body;
      const dx = this.player.x - enemy.container.x;
      const distToPlayer = Math.abs(dx);

      switch (enemy.state) {
        // ---- 巡逻 ----
        case EnemyState.PATROL: {
          if (enemy.type === EnemyType.BOSS) {
            // BOSS 不巡逻，慢步逼近玩家
            const dir = dx > 0 ? 1 : -1;
            enemy.facingRight = dir > 0;
            if (distToPlayer > 60) {
              body.setVelocityX(dir * this.BOSS_PATROL_SPEED);
            } else {
              body.setVelocityX(0);
            }
            if (distToPlayer < 400) {
              this.startWindup(enemy, dx);
            }
          } else {
            // 普通怪正常巡逻
            if (Math.abs(body.velocity.x) < 5) {
              if (enemy.facingRight) {
                body.setVelocityX(this.PATROL_SPEED);
                if (enemy.container.x >= enemy.patrolRight) enemy.facingRight = false;
              } else {
                body.setVelocityX(-this.PATROL_SPEED);
                if (enemy.container.x <= enemy.patrolLeft) enemy.facingRight = true;
              }
            }
            // 发现玩家
            const detectRange = this.getDetectRange(enemy);
            if (distToPlayer < detectRange) {
              if (enemy.type === EnemyType.THROWER && distToPlayer < 80) {
                // 投掷怪：太近了后退
                const retreatDir = dx > 0 ? -1 : 1;
                body.setVelocityX(retreatDir * this.THROWER_RETREAT_SPEED);
              } else {
                this.startWindup(enemy, dx);
              }
            }
          }
          break;
        }

        // ---- 前摇 ----
        case EnemyState.WINDUP: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            this.performAttack(enemy);
          }
          break;
        }

        // ---- 普通怪近战 ----
        case EnemyState.ATTACKING: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.ATTACK_COOLDOWN;
          }
          break;
        }

        // ---- 冲锋 ----
        case EnemyState.CHARGING: {
          const dir = enemy.facingRight ? 1 : -1;
          const speed = enemy.type === EnemyType.BOSS
            ? this.BOSS_CHARGE_SPEED : this.CHARGER_CHARGE_SPEED;
          const dmg = enemy.type === EnemyType.BOSS
            ? this.BOSS_CHARGE_DAMAGE : this.CHARGER_CHARGE_DAMAGE;
          const kb = enemy.type === EnemyType.BOSS
            ? this.BOSS_CHARGE_KNOCKBACK : this.CHARGER_CHARGE_KNOCKBACK;
          const cd = enemy.type === EnemyType.BOSS
            ? this.BOSS_COOLDOWN : this.CHARGER_COOLDOWN;

          body.setVelocityX(dir * speed);

          // 碰撞检测
          const hitDx = this.player.x - enemy.container.x;
          const hitDy = this.player.y - enemy.container.y;
          const hitRange = enemy.type === EnemyType.BOSS ? 50 : 36;
          if (Math.abs(hitDx) < hitRange && Math.abs(hitDy) < 48) {
            this.damagePlayer(dmg, dir * kb);
          }

          if (now >= enemy.stateTimer) {
            body.setVelocityX(0);
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + cd;
          }
          break;
        }

        // ---- 投掷怪瞄准 ----
        case EnemyState.AIMING: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            this.throwerLaunchProjectile(enemy);
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.THROWER_COOLDOWN;
          }
          break;
        }

        // ---- BOSS 跳起 ----
        case EnemyState.BOSS_JUMP: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.BOSS_COOLDOWN;
          }
          break;
        }

        // ---- BOSS 弹幕发射 ----
        case EnemyState.BOSS_FIRE: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.BOSS_COOLDOWN;
          }
          break;
        }

        // ---- 冷却 ----
        case EnemyState.COOLDOWN: {
          if (now >= enemy.stateTimer) {
            enemy.state = EnemyState.PATROL;
          }
          break;
        }

        // ---- 受击硬直 ----
        case EnemyState.HIT: {
          if (Math.abs(body.velocity.x) < 5 && now >= enemy.stateTimer) {
            enemy.state = EnemyState.PATROL;
          }
          break;
        }
      }

      // ---- 血条/指示器跟随 ----
      const x = enemy.container.x;
      const y = enemy.container.y;
      const hpBarY = enemy.type === EnemyType.THROWER ? -40 : -36;
      enemy.hpBarBg.setPosition(x, y + hpBarY);
      enemy.hpBarFill.setPosition(x - 19, y + hpBarY);
      if (enemy.windupIndicator) {
        enemy.windupIndicator.setPosition(x, y - 52);
      }
    });
  }

  // ======================== AI 辅助方法 ========================

  /** 根据敌人类型返回感知范围 */
  private getDetectRange(enemy: Enemy): number {
    switch (enemy.type) {
      case EnemyType.CHARGER: return this.CHARGER_DETECT_RANGE;
      case EnemyType.THROWER: return this.THROWER_DETECT_RANGE;
      default: return this.DETECT_RANGE;
    }
  }

  /**
   * 敌人进入前摇状态
   * 感叹号闪烁 + 站定不动
   * BOSS 的前摇更长，且显示攻击类型（冲锋/跳砸/弹幕）
   */
  private startWindup(enemy: Enemy, dxToPlayer: number) {
    const scene = this.scene;
    enemy.state = EnemyState.WINDUP;

    // 根据类型确定前摇时长
    let windupTime: number;
    if (enemy.type === EnemyType.BOSS) {
      const atk = enemy.attackIndex % 3;
      windupTime = atk === 0 ? this.BOSS_CHARGE_WINDUP
        : (atk === 1 ? this.BOSS_JUMP_WINDUP : this.BOSS_BARRAGE_WINDUP);
    } else if (enemy.type === EnemyType.CHARGER) {
      windupTime = this.CHARGER_CHARGE_WINDUP;
    } else if (enemy.type === EnemyType.THROWER) {
      windupTime = this.THROWER_AIM_TIME;
    } else {
      windupTime = this.ATTACK_WINDUP;
    }

    enemy.stateTimer = scene.time.now + windupTime;
    enemy.facingRight = dxToPlayer > 0;

    // 指示器颜色和文字随类型变化
    let indicatorColor: string, indicatorText: string;
    if (enemy.type === EnemyType.BOSS) {
      indicatorColor = "#ff0000";
      const atk = enemy.attackIndex % 3;
      indicatorText = atk === 0 ? "⚡冲锋" : (atk === 1 ? "💥跳砸" : "🔥弹幕");
    } else if (enemy.type === EnemyType.CHARGER) {
      indicatorColor = "#ff8800";
      indicatorText = "!!";
    } else if (enemy.type === EnemyType.THROWER) {
      indicatorColor = "#aa44ff";
      indicatorText = "✦";
    } else {
      indicatorColor = "#ff4444";
      indicatorText = "!";
    }

    enemy.windupIndicator = scene.add.text(
      enemy.container.x, enemy.container.y - 52,
      indicatorText, {
        fontSize: enemy.type === EnemyType.BOSS ? "18px" : "24px",
        color: indicatorColor,
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
   * 敌人执行攻击（根据类型走不同分支）
   */
  private performAttack(enemy: Enemy) {
    const scene = this.scene;

    // 移除前摇感叹号
    if (enemy.windupIndicator) {
      enemy.windupIndicator.destroy();
      enemy.windupIndicator = null;
    }

    switch (enemy.type) {
      case EnemyType.NORMAL: {
        // 普通近战攻击
        enemy.state = EnemyState.ATTACKING;
        enemy.stateTimer = scene.time.now + this.ATTACK_DURATION;
        const dir = enemy.facingRight ? 1 : -1;
        const hitX = enemy.container.x + dir * this.ATTACK_RANGE;
        const dx = this.player.x - hitX;
        const dy = this.player.y - enemy.container.y;
        if (Math.abs(dx) < 34 && Math.abs(dy) < 48) {
          this.damagePlayer(this.ATTACK_DAMAGE, dir * this.ATTACK_KNOCKBACK);
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
        break;
      }

      case EnemyType.CHARGER: {
        // 冲锋怪开始冲锋
        enemy.state = EnemyState.CHARGING;
        enemy.stateTimer = scene.time.now + this.CHARGER_CHARGE_DURATION;
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
        break;
      }

      case EnemyType.THROWER: {
        // 投掷怪进入瞄准
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
        break;
      }

      case EnemyType.BOSS: {
        // BOSS 三种攻击循环
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
        break;
      }
    }
  }

  // ======================== 投掷怪 ========================

  /** 投掷怪发射能量球（飞向玩家当前位置） */
  private throwerLaunchProjectile(enemy: Enemy) {
    const scene = this.scene;
    const dir = enemy.facingRight ? 1 : -1;
    const startX = enemy.container.x + dir * 14;
    const startY = enemy.container.y - 24;

    const proj = scene.add.circle(startX, startY, 6, 0x9b59b6, 0.9);
    this.projectiles.add(proj);
    proj.setData("damage", this.THROWER_PROJECTILE_DAMAGE);

    const projBody = proj.body as Phaser.Physics.Arcade.Body;
    projBody.setAllowGravity(false);
    projBody.setSize(12, 12);

    // 朝向玩家当前位置
    const aimDx = this.player.x - startX;
    const aimDy = this.player.y - startY;
    const dist = Math.sqrt(aimDx * aimDx + aimDy * aimDy) || 1;
    projBody.setVelocity(
      (aimDx / dist) * this.THROWER_PROJECTILE_SPEED,
      (aimDy / dist) * this.THROWER_PROJECTILE_SPEED,
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
  }

  // ======================== BOSS 专属攻击 ========================

  /**
   * BOSS 跳砸：跳起 → 滞空 → 砸落 → 冲击波
   * 跳起期间关闭重力，用 Tween 控制 Y 坐标
   */
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

              // 落点伤害
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
      // 冲击波矩形
      const wave = scene.add.rectangle(x, y - 10, 10, 30, 0xff4444, 0.7);
      scene.tweens.add({
        targets: wave,
        x: x + dir * 200, width: 200, alpha: 0,
        duration: 400, ease: "Power2",
        onComplete: () => wave.destroy(),
      });

      // 冲击波也能伤人
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
}
