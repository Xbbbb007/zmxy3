/**
 * 战斗场景（BattleScene）— 纯调度中心
 *
 * 数据驱动：所有地图、敌人、BOSS 配置从 LevelConfig 读取。
 * 通过 scene.start("BattleScene", { levelId: "xxx" }) 传入关卡 ID。
 *
 * 职责：
 * 1. 根据关卡配置创建地图（背景、地面、平台）
 * 2. 根据关卡配置生成敌人
 * 3. 每帧调用各模块 update()
 * 4. 管理玩家 HP/MP 和受击逻辑
 * 5. 胜利/死亡画面 + 关卡流转
 *
 * 已拆出的模块：
 * - player/PlayerController.ts  → 移动、跳跃、冲刺、朝向
 * - player/PlayerCombat.ts      → 攻击连招
 * - enemies/EnemyManager.ts     → 敌人 AI、生成、受伤
 * - hud/PlayerHud.ts            → 血条、蓝条、技能 CD 图标
 * - hud/BossHud.ts              → BOSS 屏幕顶部血条
 * - skills/FlameDash.ts         → 技能1：烈焰闪
 * - skills/GiantSword.ts        → 技能2：巨剑术
 * - types/LevelConfig.ts        → 关卡数据定义
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
import { LevelConfig, LEVELS, getLevelById } from "../types/LevelConfig";

export class BattleScene extends Phaser.Scene {
  // ========== 核心对象 ==========
  private player!: Phaser.GameObjects.Container;
  private projectiles!: Phaser.Physics.Arcade.Group;

  // ========== 模块实例 ==========
  private controller!: PlayerController;
  private combat!: PlayerCombat;
  private enemyManager!: EnemyManager;
  private hud!: PlayerHud;
  private bossHud!: BossHud | null;

  // ========== 关卡配置 ==========
  private levelConfig!: LevelConfig;
  private levelIndex = 0;  // 当前关卡在 LEVELS 数组中的索引

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

  /**
   * 接收场景启动参数（关卡 ID）
   */
  init(data: { levelId?: string }) {
    const levelId = data.levelId || LEVELS[0].id;
    this.levelConfig = getLevelById(levelId) || LEVELS[0];
    this.levelIndex = LEVELS.indexOf(this.levelConfig);
  }

  create() {
    const cfg = this.levelConfig;

    // ===== 0. 重置运行时状态 =====
    this.isPlayerDead = false;
    this.isVictory = false;
    this.playerHp = this.playerMaxHp;
    this.playerMp = this.PLAYER_MAX_MP;
    this.playerHitTimer = 0;
    this.skill1 = new FlameDash();
    this.skill2 = new GiantSword();

    // ===== 1. 背景（颜色来自关卡配置） =====
    const sky = this.add.graphics();
    sky.fillGradientStyle(cfg.skyTopColor, cfg.skyTopColor, cfg.skyBottomColor, cfg.skyBottomColor, 1);
    sky.fillRect(0, 0, cfg.mapWidth, cfg.mapHeight);
    sky.setScrollFactor(0.3);

    // 装饰性云朵/椭圆
    [
      [200, 60, 120, 30], [600, 90, 80, 20], [1100, 50, 100, 25],
      [1700, 80, 90, 22], [2300, 65, 110, 28],
    ].forEach(([x, y, w, h]) => {
      if (x < cfg.mapWidth) {
        this.add.ellipse(x, y, w, h, cfg.cloudColor, 0.4).setScrollFactor(0.2);
      }
    });

    // ===== 2. 地面 + 平台（颜色和布局来自配置） =====
    const groundGroup = this.physics.add.staticGroup();

    const ground = this.add.rectangle(cfg.mapWidth / 2, 480, cfg.mapWidth, 40, cfg.groundColor);
    ground.setStrokeStyle(2, cfg.groundStroke);
    groundGroup.add(ground);

    cfg.platforms.forEach(({ x, y, w }) => {
      const p = this.add.rectangle(x, y, w, 20, cfg.platformColor);
      p.setStrokeStyle(2, cfg.platformStroke);
      groundGroup.add(p);
    });

    // ===== 3. 物理世界边界 =====
    this.physics.world.setBounds(0, 0, cfg.mapWidth, cfg.mapHeight);

    // ===== 4. 投掷物组 =====
    this.projectiles = this.physics.add.group({
      allowGravity: false,
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
    this.cameras.main.setBounds(0, 0, cfg.mapWidth, cfg.mapHeight);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ===== 9. 技能键位 =====
    this.keyK = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyL = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L);

    // ===== 10. 敌人（从配置生成，HP 乘以难度系数） =====
    cfg.enemies.forEach((spawn) => {
      const hp = Math.round(spawn.hp * cfg.enemyHpMultiplier);
      this.enemyManager.spawnEnemy(spawn.x, spawn.y, hp, spawn.type);
    });

    // ===== 11. HUD =====
    this.bossHud = cfg.bossName ? new BossHud(this, cfg.bossName) : null;
    this.hud = new PlayerHud(this, this.skill1.mpCost, this.skill2.mpCost);

    // ===== 12. 关卡名称提示（淡出） =====
    const levelTitle = this.add.text(480, 200, cfg.name, {
      fontSize: "40px", color: "#ffffff", fontFamily: "SimHei", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setAlpha(1).setDepth(20);

    const levelDesc = this.add.text(480, 250, cfg.description, {
      fontSize: "18px", color: "#cccccc", fontFamily: "SimHei",
    }).setOrigin(0.5).setScrollFactor(0).setAlpha(1).setDepth(20);

    this.tweens.add({
      targets: [levelTitle, levelDesc],
      alpha: 0,
      duration: 800,
      delay: 1500,
      onComplete: () => { levelTitle.destroy(); levelDesc.destroy(); },
    });
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
    if (this.bossHud) {
      this.bossHud.update(this.enemyManager.bossRef);
    }

    // ---- 技能 CD 显示（已移除CD，仅显示缺蓝提示） ----
    this.hud.updateSkillAvailability(this.playerMp);

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

  private handleSkillInput() {
    if (this.combat.isAttacking) return;

    if (Phaser.Input.Keyboard.JustDown(this.keyK)) {
      if (this.playerMp >= this.skill1.mpCost) {
        if (this.skill1.execute(this.buildSkillCtx())) {
          this.playerMp -= this.skill1.mpCost;
        }
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyL)) {
      if (this.playerMp >= this.skill2.mpCost) {
        if (this.skill2.execute(this.buildSkillCtx())) {
          this.playerMp -= this.skill2.mpCost;
        }
      }
    }
  }

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

  // ======================== 玩家受击 ========================

  private damagePlayer(damage: number, knockbackX: number) {
    if (this.time.now < this.playerHitTimer) return;

    this.playerHp -= damage;
    if (this.playerHp < 0) this.playerHp = 0;

    this.playerHitTimer = this.time.now + this.PLAYER_HIT_INVINCIBLE;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(knockbackX);

    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: 2,
    });

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

    this.hud.updateHp(this.playerHp, this.playerMaxHp);

    if (this.playerHp <= 0) {
      this.playerDeath();
    }
  }

  // ======================== 胜利画面 ========================

  /**
   * 胜利画面
   * - 如果还有下一关 → 显示"下一关"按钮
   * - 如果是最后一关 → 显示"全部通关"
   */
  private showVictory() {
    this.isVictory = true;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);

    this.add.rectangle(480, 270, 960, 540, 0x000000, 0.5).setScrollFactor(0);

    this.add.text(480, 180, "胜利！", {
      fontSize: "56px", color: "#f5c842", fontFamily: "Arial", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0);

    this.add.text(480, 240, `${this.levelConfig.name} — 通过`, {
      fontSize: "20px", color: "#ffffff", fontFamily: "SimHei",
    }).setOrigin(0.5).setScrollFactor(0);

    // 判断是否有下一关
    const nextLevel = LEVELS[this.levelIndex + 1];

    if (nextLevel) {
      // ---- 下一关按钮 ----
      const nextBtn = this.add.rectangle(480, 310, 200, 44, 0xe63946)
        .setInteractive({ useHandCursor: true }).setScrollFactor(0);
      const nextText = this.add.text(480, 310, `下一关：${nextLevel.name.split(" · ")[1]}`, {
        fontSize: "16px", color: "#ffffff", fontFamily: "SimHei",
      }).setOrigin(0.5).setScrollFactor(0);

      nextBtn.on("pointerover", () => nextBtn.setFillStyle(0xff6b6b));
      nextBtn.on("pointerout", () => nextBtn.setFillStyle(0xe63946));
      nextBtn.on("pointerdown", () => {
        this.scene.start("BattleScene", { levelId: nextLevel.id });
      });

      // 重玩当前关
      this.add.text(480, 365, "按 R 重玩本关", {
        fontSize: "14px", color: "#888888", fontFamily: "SimHei",
      }).setOrigin(0.5).setScrollFactor(0);

    } else {
      // ---- 全部通关 ----
      this.add.text(480, 310, "恭喜！所有关卡通关！", {
        fontSize: "22px", color: "#f5c842", fontFamily: "SimHei", fontStyle: "bold",
      }).setOrigin(0.5).setScrollFactor(0);

      this.add.text(480, 350, "取经之路，就此展开……", {
        fontSize: "16px", color: "#cccccc", fontFamily: "SimHei",
      }).setOrigin(0.5).setScrollFactor(0);
    }

    // 按 R 重玩当前关
    this.input.keyboard!.on("keydown-R", () => {
      this.scene.start("BattleScene", { levelId: this.levelConfig.id });
    });

    // 按 ESC 返回选关
    this.input.keyboard!.on("keydown-ESC", () => {
      this.scene.start("LevelSelectScene");
    });

    this.add.text(480, 400, "ESC 返回选关", {
      fontSize: "14px", color: "#666666", fontFamily: "SimHei",
    }).setOrigin(0.5).setScrollFactor(0);
  }

  // ======================== 死亡画面 ========================

  private playerDeath() {
    this.isPlayerDead = true;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);

    const overlay = this.add.rectangle(
      this.cameras.main.scrollX + 480,
      this.cameras.main.scrollY + 270,
      960, 540, 0x000000, 0.6
    ).setScrollFactor(0);

    this.add.text(480, 200, "你死了", {
      fontSize: "48px", color: "#ff4444", fontFamily: "Arial", fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0);

    // 重试按钮
    const retryBtn = this.add.rectangle(480, 280, 180, 44, 0xe63946)
      .setInteractive({ useHandCursor: true }).setScrollFactor(0);
    this.add.text(480, 280, "重新挑战", {
      fontSize: "18px", color: "#ffffff", fontFamily: "SimHei",
    }).setOrigin(0.5).setScrollFactor(0);

    retryBtn.on("pointerover", () => retryBtn.setFillStyle(0xff6b6b));
    retryBtn.on("pointerout", () => retryBtn.setFillStyle(0xe63946));
    retryBtn.on("pointerdown", () => {
      this.scene.start("BattleScene", { levelId: this.levelConfig.id });
    });

    // 按 R 重试
    this.input.keyboard!.on("keydown-R", () => {
      this.scene.start("BattleScene", { levelId: this.levelConfig.id });
    });

    // 按 ESC 返回选关
    this.input.keyboard!.on("keydown-ESC", () => {
      this.scene.start("LevelSelectScene");
    });

    this.add.text(480, 340, "R 重试 | ESC 返回选关", {
      fontSize: "14px", color: "#888888", fontFamily: "SimHei",
    }).setOrigin(0.5).setScrollFactor(0);
  }
}
