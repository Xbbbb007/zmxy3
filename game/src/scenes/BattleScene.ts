/**
 * 战斗场景（BattleScene）— 纯调度中心
 *
 * 职责：
 * 1. 创建所有模块实例（玩家、敌人、HUD、技能）
 * 2. 每帧调用各模块 update()
 * 3. 管理玩家 HP/MP 和受击逻辑
 * 4. 胜利/死亡画面
 *
 * 已拆出的模块：
 * - player/PlayerController.ts  → 移动、跳跃、冲刺、朝向
 * - player/PlayerCombat.ts      → 攻击连招
 * - enemies/EnemyManager.ts     → 敌人 AI、生成、受伤
 * - hud/PlayerHud.ts            → 血条、蓝条、技能 CD 图标
 * - hud/BossHud.ts              → BOSS 屏幕顶部血条
 * - skills/FlameDash.ts         → 技能1：烈焰闪
 * - skills/GiantSword.ts        → 技能2：巨剑术
 */

import { drawPlayer } from "../entities/PlayerGraphics";
import { Enemy, EnemyType } from "../types/EnemyTypes";
import { PlayerHud } from "../hud/PlayerHud";
import { BossHud } from "../hud/BossHud";
import { FlameDash } from "../skills/FlameDash";
import { GiantSword } from "../skills/GiantSword";
import { EnemyManager } from "../enemies/EnemyManager";
import { PlayerController } from "../player/PlayerController";
import { PlayerCombat } from "../player/PlayerCombat";

export class BattleScene extends Phaser.Scene {
  // ========== 核心对象 ==========
  private player!: Phaser.GameObjects.Container;
  private projectiles!: Phaser.Physics.Arcade.Group;

  // ========== 模块实例 ==========
  private controller!: PlayerController;   // 移动/跳跃/冲刺
  private combat!: PlayerCombat;           // 攻击连招
  private enemyManager!: EnemyManager;     // 敌人系统
  private hud!: PlayerHud;                 // 玩家 HUD
  private bossHud!: BossHud;              // BOSS HUD

  // ========== 地图参数 ==========
  private readonly MAP_WIDTH = 3000;
  private readonly MAP_HEIGHT = 540;

  // ========== 技能 ==========
  private keyK!: Phaser.Input.Keyboard.Key;
  private keyL!: Phaser.Input.Keyboard.Key;
  private skill1 = new FlameDash();
  private skill2 = new GiantSword();

  // ========== 玩家状态 ==========
  private playerHp = 100;
  private playerMaxHp = 100;
  private playerMp = 100;
  private readonly PLAYER_MAX_MP = 100;
  private readonly MP_REGEN = 5;
  private readonly PLAYER_HIT_INVINCIBLE = 500;
  private playerHitTimer = 0;
  private isPlayerDead = false;
  private isVictory = false;

  constructor() {
    super({ key: "BattleScene" });
  }

  create() {
    // ===== 0. 重置运行时状态 =====
    this.isPlayerDead = false;
    this.isVictory = false;
    this.playerHp = this.playerMaxHp;
    this.playerMp = this.PLAYER_MAX_MP;
    this.playerHitTimer = 0;
    this.skill1 = new FlameDash();
    this.skill2 = new GiantSword();

    // ===== 1. 背景 =====
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x4a90d9, 0x4a90d9, 0x87ceeb, 0x87ceeb, 1);
    sky.fillRect(0, 0, this.MAP_WIDTH, this.MAP_HEIGHT);
    sky.setScrollFactor(0.3);

    [
      [200, 60, 120, 30], [600, 90, 80, 20], [1100, 50, 100, 25],
      [1700, 80, 90, 22], [2300, 65, 110, 28],
    ].forEach(([x, y, w, h]) => {
      this.add.ellipse(x, y, w, h, 0xffffff, 0.6).setScrollFactor(0.2);
    });

    // ===== 2. 地面 + 平台 =====
    const groundGroup = this.physics.add.staticGroup();

    const ground = this.add.rectangle(this.MAP_WIDTH / 2, 480, this.MAP_WIDTH, 40, 0x5c4033);
    ground.setStrokeStyle(2, 0x3d2b1f);
    groundGroup.add(ground);

    [
      { x: 500, y: 380, w: 150 }, { x: 900, y: 320, w: 120 },
      { x: 1400, y: 360, w: 180 }, { x: 1900, y: 300, w: 130 },
      { x: 2500, y: 350, w: 160 },
    ].forEach(({ x, y, w }) => {
      const p = this.add.rectangle(x, y, w, 20, 0x6b8e23);
      p.setStrokeStyle(2, 0x4a6b15);
      groundGroup.add(p);
    });

    // ===== 3. 物理世界边界（必须在创建任何物理体之前设置） =====
    this.physics.world.setBounds(0, 0, this.MAP_WIDTH, this.MAP_HEIGHT);

    // ===== 4. 投掷物组（远程怪的弹药） =====
    this.projectiles = this.physics.add.group({
      allowGravity: false, // 投掷物不受重力影响
    });

    // ===== 5. 玩家 =====
    this.player = this.add.container(100, 400);
    drawPlayer(this.player, true);

    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 48);
    body.setOffset(-16, -24);
    body.setCollideWorldBounds(true);
    body.setBounce(0);
    body.setDragX(600);

    this.physics.add.collider(this.player, groundGroup);

    // ===== 6. 玩家控制器 + 战斗模块 =====
    this.controller = new PlayerController(this, this.player);
    this.combat = new PlayerCombat(this, this.player);

    // ===== 7. 敌人管理器 =====
    this.enemyManager = new EnemyManager(
      this,
      this.player,
      this.projectiles,
      (damage, knockbackX) => this.damagePlayer(damage, knockbackX),
    );
    this.physics.add.collider(this.enemyManager.enemies, groundGroup);

    // 投掷物碰到玩家 → 造成伤害
    this.physics.add.overlap(this.player, this.projectiles, (_playerObj, projObj) => {
      const proj = projObj as Phaser.GameObjects.Arc;
      const knockDir = this.player.x < proj.x ? -1 : 1;
      const dmg = (proj.getData("damage") as number) || 10;
      this.damagePlayer(dmg, knockDir * 150);
      proj.destroy();
    });

    // ===== 8. 相机 =====
    this.cameras.main.setBounds(0, 0, this.MAP_WIDTH, this.MAP_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ===== 9. 技能键位 =====
    this.keyK = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyL = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L);

    // ===== 10. 敌人 =====
    this.enemyManager.spawnEnemy(350, 432, 100, EnemyType.NORMAL);
    this.enemyManager.spawnEnemy(700, 432, 120, EnemyType.CHARGER);
    this.enemyManager.spawnEnemy(1100, 432, 80, EnemyType.THROWER);
    this.enemyManager.spawnEnemy(2000, 432, 500, EnemyType.BOSS);

    // ===== 11. HUD =====
    this.bossHud = new BossHud(this, "赤焰魔君");
    this.hud = new PlayerHud(this, this.skill1.mpCost, this.skill2.mpCost);
  }

  // ======================== 每帧更新（调度中心） ========================

  update() {
    if (this.isPlayerDead || this.isVictory) return;

    // ---- 模块更新 ----
    this.controller.update(this.time.now, this.combat.isAttacking, this.skill2.isCasting);
    this.combat.update(
      this.time.now,
      this.controller.isRunning,
      this.skill2.isCasting,
      this.enemyManager.enemies,
      (enemy, damage, knockbackX) => this.enemyManager.damageEnemy(enemy, damage, knockbackX),
      this.controller.facingRight,
    );

    // ---- 技能 ----
    this.handleSkillInput();

    // ---- MP 自然恢复 ----
    this.playerMp = Math.min(this.PLAYER_MAX_MP, this.playerMp + this.MP_REGEN * (this.game.loop.delta / 1000));
    this.hud.updateMp(this.playerMp, this.PLAYER_MAX_MP);

    // ---- 敌人 AI + BOSS 血条 ----
    this.enemyManager.update();
    this.bossHud.update(this.enemyManager.bossRef);

    // ---- 技能 CD 显示 ----
    this.hud.updateSkillCd(this.time.now, this.playerMp, this.skill1.cooldownEnd, this.skill2.cooldownEnd);

    // ---- 胜利检测 ----
    const allDead = this.enemyManager.enemies.getChildren().every((obj) => {
      const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
      return !enemy?.alive;
    });
    if (allDead) {
      this.showVictory();
    }
  }

  // ======================== 技能系统 ========================

  /**
   * 技能输入处理（每帧调用）
   *
   * BattleScene 只负责：
   * 1. 检测按键
   * 2. 检查 MP 够不够
   * 3. 检查攻击/冲刺中能不能用
   * 4. 调用 skill.execute() 执行技能
   * 5. execute 返回 true 就扣 MP
   *
   * 技能的具体逻辑（伤害、特效、CD）都在各自的类里。
   */
  private handleSkillInput() {
    if (this.combat.isAttacking) return;

    // 技能1：烈焰闪（K 键）
    if (Phaser.Input.Keyboard.JustDown(this.keyK)) {
      if (this.playerMp >= this.skill1.mpCost) {
        if (this.skill1.execute(this.buildSkillCtx())) {
          this.playerMp -= this.skill1.mpCost;
        }
      }
    }
    // 技能2：巨剑术（L 键）
    if (Phaser.Input.Keyboard.JustDown(this.keyL)) {
      if (this.playerMp >= this.skill2.mpCost) {
        if (this.skill2.execute(this.buildSkillCtx())) {
          this.playerMp -= this.skill2.mpCost;
        }
      }
    }
  }

  /**
   * 构建技能执行上下文
   * 把 BattleScene 里技能需要的东西打包成一个对象传进去
   */
  private buildSkillCtx() {
    return {
      scene: this,
      player: this.player,
      facingRight: this.controller.facingRight,
      enemies: this.enemyManager.enemies,
      damageEnemy: (enemy: Enemy, damage: number, knockbackX: number) =>
        this.enemyManager.damageEnemy(enemy, damage, knockbackX),
      setDash: (isDashing: boolean, _endTime: number) => {
        this.controller.setDash(isDashing);
      },
    };
  }



  // 敌人系统已全部移到 enemies/EnemyManager.ts

  // ======================== 玩家受击 ========================

  /**
   * 玩家受到伤害
   * 有无敌时间防止连续掉血
   */
  private damagePlayer(damage: number, knockbackX: number) {
    // 无敌期间不受伤害
    if (this.time.now < this.playerHitTimer) return;

    this.playerHp -= damage;
    if (this.playerHp < 0) this.playerHp = 0;

    // 设置无敌时间
    this.playerHitTimer = this.time.now + this.PLAYER_HIT_INVINCIBLE;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(knockbackX);

    // 受伤闪烁
    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: 2,
    });

    // 伤害飘字
    const dmgText = this.add.text(
      this.player.x, this.player.y - 40,
      `-${damage}`,
      { fontSize: "22px", color: "#ff8888", fontFamily: "Arial", fontStyle: "bold" }
    ).setOrigin(0.5);

    this.tweens.add({
      targets: dmgText,
      y: dmgText.y - 30,
      alpha: 0,
      duration: 500,
      onComplete: () => dmgText.destroy(),
    });

    // 更新 HUD 血条
    this.hud.updateHp(this.playerHp, this.playerMaxHp);

    // 死亡判定
    if (this.playerHp <= 0) {
      this.playerDeath();
    }
  }

  /**
   * 胜利画面：显示"胜利"，按 R 重新开始
   */
  private showVictory() {
    this.isVictory = true;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);

    // 半透明遮罩
    this.add.rectangle(480, 270, 960, 540, 0x000000, 0.5).setScrollFactor(0);

    // "胜利！"
    this.add.text(480, 210, "胜利！", {
      fontSize: "56px", color: "#f5c842", fontFamily: "Arial", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0);

    this.add.text(480, 280, "所有敌人已被消灭", {
      fontSize: "20px", color: "#ffffff", fontFamily: "Arial",
    }).setOrigin(0.5).setScrollFactor(0);

    this.add.text(480, 320, "按 R 重新开始", {
      fontSize: "18px", color: "#aaaaaa", fontFamily: "Arial",
    }).setOrigin(0.5).setScrollFactor(0);

    this.input.keyboard!.once("keydown-R", () => {
      this.scene.restart();
    });
  }

  /**
   * 玩家死亡：显示"你死了"，按 R 重新开始
   */
  private playerDeath() {
    this.isPlayerDead = true;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);

    // 半透明遮罩
    const overlay = this.add.rectangle(
      this.cameras.main.scrollX + 480,
      this.cameras.main.scrollY + 270,
      960, 540, 0x000000, 0.6
    ).setScrollFactor(0);

    // "你死了"
    const deathText = this.add.text(480, 220, "你死了", {
      fontSize: "48px", color: "#ff4444", fontFamily: "Arial", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0);

    const restartText = this.add.text(480, 290, "按 R 重新开始", {
      fontSize: "20px", color: "#ffffff", fontFamily: "Arial",
    }).setOrigin(0.5).setScrollFactor(0);

    // 按 R 重新开始
    this.input.keyboard!.once("keydown-R", () => {
      this.scene.restart(); // 重启当前场景，所有状态重置
    });
  }
}
