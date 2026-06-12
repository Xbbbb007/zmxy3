/**
 * 战斗场景（BattleScene）
 *
 * 新增：攻击系统 + 训练假人
 *
 * 攻击操作：
 * - J 键：普通攻击（三连招：J → J → J，需要连续按）
 * - 每段伤害递增（10 → 15 → 25）
 * - 第三段击飞效果更强
 *
 * 受击反馈：
 * - 击退（knockback）
 * - 闪白（短暂变白）
 * - 伤害飘字
 * - 头顶血条
 */

import { drawPlayer } from "../entities/PlayerGraphics";
import { Enemy, EnemyState, EnemyType } from "../types/EnemyTypes";
import { PlayerHud } from "../hud/PlayerHud";
import { BossHud } from "../hud/BossHud";
import { FlameDash } from "../skills/FlameDash";
import { GiantSword } from "../skills/GiantSword";

export class BattleScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyJ!: Phaser.Input.Keyboard.Key;
  private keyK!: Phaser.Input.Keyboard.Key; // 技能1：烈焰闪
  private keyL!: Phaser.Input.Keyboard.Key; // 技能2：巨剑术
  private enemies!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.Physics.Arcade.Group; // 投掷物组（远程怪的弹药）

  // ========== 可调参数（随便改，找手感） ==========
  private readonly MOVE_SPEED = 300;       // 移动速度（越大跑得越快）
  private readonly JUMP_SPEED = -400;      // 跳跃力度（负数=向上，绝对值越大跳越高）
  private readonly MAP_WIDTH = 3000;       // 地图宽度（像素，比画面宽才能滚动）
  private readonly MAP_HEIGHT = 540;       // 地图高度（和画面高度一致）

  // 冲刺参数
  private readonly DASH_SPEED = 700;       // 冲刺速度（应该比 MOVE_SPEED 快）
  private readonly DASH_DURATION = 200;    // 冲刺持续时间（毫秒，到期后自动减速停下）
  private readonly DOUBLE_TAP_WINDOW = 300; // 双击判定窗口（毫秒，两次按键间隔小于此值才算双击）

  // 攻击参数
  private readonly ATTACK_WINDOW = 400;   // 连招窗口(ms)：攻击后多长时间内再按 J 能接下一段，越大越好接
  private readonly ATTACK_DURATION = 250;  // 攻击锁定时间(ms)：出招后多久才能再次移动/攻击
  private readonly COMBO_DAMAGE = [10, 15, 25];      // 三段连招各自的伤害，逐段递增让第三段更有打击感
  private readonly COMBO_KNOCKBACK = [150, 200, 300]; // 三段连招各自的击退力度，第三段打飞最远
  private readonly COMBO_RANGE = [45, 50, 55];        // 三段连招的攻击距离(像素)，判定框离角色中心的水平距离

  // 敌人巡逻参数
  private readonly ENEMY_PATROL_SPEED = 60;  // 巡逻移动速度（很慢，像散步）
  private readonly ENEMY_PATROL_RANGE = 120; // 巡逻范围（像素，出生点左右各走这么远）

  // 敌人攻击参数
  private readonly ENEMY_DETECT_RANGE = 80;  // 发现玩家的距离（像素，进入此范围就准备攻击）
  private readonly ENEMY_ATTACK_WINDUP = 500; // 攻击前摇（毫秒，期间可被打断）
  private readonly ENEMY_ATTACK_DURATION = 200; // 攻击判定持续时间（毫秒）
  private readonly ENEMY_ATTACK_COOLDOWN = 800; // 攻击后冷却（毫秒，冷却完才能再次攻击）
  private readonly ENEMY_ATTACK_DAMAGE = 10;   // 敌人攻击伤害
  private readonly ENEMY_ATTACK_RANGE = 45;    // 敌人攻击距离（像素）
  private readonly ENEMY_ATTACK_KNOCKBACK = 180; // 敌人攻击击退力度

  // 冲锋怪参数
  private readonly CHARGER_DETECT_RANGE = 250;  // 发现玩家距离（比近战怪远很多）
  private readonly CHARGER_CHARGE_SPEED = 450;   // 冲锋速度（很快！）
  private readonly CHARGER_CHARGE_WINDUP = 600;  // 冲锋前摇（蓄力时间，可打断）
  private readonly CHARGER_CHARGE_DURATION = 500; // 冲锋持续时间（毫秒）
  private readonly CHARGER_CHARGE_DAMAGE = 15;   // 冲撞伤害
  private readonly CHARGER_CHARGE_KNOCKBACK = 250; // 冲撞击退
  private readonly CHARGER_COOLDOWN = 1200;      // 冲锋后冷却（比较久）

  // 远程投掷怪参数
  private readonly THROWER_DETECT_RANGE = 200;   // 发现玩家距离
  private readonly THROWER_PREFERRED_DIST = 150;  // 偏好距离（保持这个距离扔东西）
  private readonly THROWER_AIM_TIME = 400;        // 瞄准时间（毫秒，可打断）
  private readonly THROWER_COOLDOWN = 1500;       // 投掷后冷却
  private readonly THROWER_PROJECTILE_SPEED = 350; // 投掷物飞行速度
  private readonly THROWER_PROJECTILE_DAMAGE = 8;  // 投掷物伤害
  private readonly THROWER_RETREAT_SPEED = 80;    // 后退速度（玩家靠近时往后跑）

  // BOSS 参数（赤焰魔君）
  private readonly BOSS_HP = 500;                 // BOSS 血量（很厚）
  private readonly BOSS_PATROL_SPEED = 40;        // BOSS 慢步逼近速度（压迫感）
  private readonly BOSS_CHARGE_SPEED = 500;       // BOSS 冲锋速度
  private readonly BOSS_CHARGE_WINDUP = 800;      // BOSS 冲锋前摇（比冲锋怪长，给玩家反应时间）
  private readonly BOSS_CHARGE_DURATION = 600;    // BOSS 冲锋持续时间
  private readonly BOSS_CHARGE_DAMAGE = 20;       // BOSS 冲撞伤害
  private readonly BOSS_CHARGE_KNOCKBACK = 300;   // BOSS 冲撞击退
  private readonly BOSS_JUMP_WINDUP = 600;        // BOSS 跳砸前摇
  private readonly BOSS_JUMP_HEIGHT = 200;        // BOSS 跳起高度（像素）
  private readonly BOSS_JUMP_DAMAGE = 25;         // BOSS 跳砸伤害
  private readonly BOSS_JUMP_KNOCKBACK = 350;     // BOSS 跳砸击退
  private readonly BOSS_JUMP_SHOCKWAVE_SPEED = 250; // 跳砸冲击波扩散速度
  private readonly BOSS_BARRAGE_WINDUP = 1000;    // BOSS 弹幕前摇
  private readonly BOSS_BARRAGE_COUNT = 5;        // 弹幕数量（扇形发射）
  private readonly BOSS_BARRAGE_DAMAGE = 10;      // 每颗弹幕伤害
  private readonly BOSS_BARRAGE_SPEED = 300;      // 弹幕飞行速度
  private readonly BOSS_COOLDOWN = 1500;          // BOSS 每次攻击后冷却
  private readonly BOSS_HIT_STAGGER = 150;        // BOSS 受击硬直（很短，有霸体感）

  // 玩家受击参数
  private readonly PLAYER_HIT_INVINCIBLE = 500; // 受伤后无敌时间（毫秒，防止连续掉血）

  // ========== 技能参数 ==========
  private readonly PLAYER_MAX_MP = 100;        // 最大 MP
  private readonly MP_REGEN = 5;               // 每秒自然回蓝

  // 技能实例（参数和逻辑都在各自的类里，BattleScene 只管调用）
  private skill1 = new FlameDash();   // 技能1：烈焰闪
  private skill2 = new GiantSword();  // 技能2：巨剑术

  // ===== 运行时状态 =====
  private facingRight = true;
  private jumpCount = 0;
  private isDashing = false;
  private dashEndTime = 0;
  private isAttacking = false;
  private comboStep = 0;
  private comboTimer: number | null = null;

  // 玩家 HP
  private playerHp = 100;
  private playerMaxHp = 100;
  private playerHitTimer = 0;  // 无敌结束时间
  private isPlayerDead = false; // 死亡标记（死了就不能动了）
  private isVictory = false;    // 胜利标记

  // 玩家 MP
  private playerMp = 100;

  // HUD 模块（血条、蓝条、技能CD图标 —— 已拆到独立文件）
  private hud!: PlayerHud;

  // BOSS HUD（已拆到 BossHud 模块）
  private bossHud!: BossHud;
  private bossRef: Enemy | null = null; // BOSS 引用（用于更新 HUD）

  constructor() {
    super({ key: "BattleScene" });
  }

  create() {
    // ===== 0. 重置运行时状态（scene.restart() 时需要） =====
    // Phaser 的 scene.restart() 不会重新执行类的字段初始化，
    // 所以必须在 create() 开头手动重置所有运行时变量
    this.facingRight = true;
    this.jumpCount = 0;
    this.isDashing = false;
    this.dashEndTime = 0;
    this.isAttacking = false;
    this.comboStep = 0;
    this.comboTimer = null;
    this.isPlayerDead = false;
    this.isVictory = false;
    this.playerHp = this.playerMaxHp;
    this.playerMp = this.PLAYER_MAX_MP;
    this.playerHitTimer = 0;
    // 重置技能实例（scene.restart() 时清零 CD 和蓄力状态）
    this.skill1 = new FlameDash();
    this.skill2 = new GiantSword();
    this.bossRef = null;

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

    // ===== 4. 敌人组 =====
    this.enemies = this.physics.add.group({
      collideWorldBounds: true, // 组级别强制所有成员不能出界
    });

    // ===== 5. 投掷物组（远程怪的弹药） =====
    this.projectiles = this.physics.add.group({
      allowGravity: false, // 投掷物不受重力影响
    });

    // ===== 4. 玩家 =====
    this.player = this.add.container(100, 400);
    drawPlayer(this.player, this.facingRight);

    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 48);
    body.setOffset(-16, -24);
    body.setCollideWorldBounds(true);
    body.setBounce(0);    // 落地不弹跳（0=完全吸收，1=完全弹性）
    body.setDragX(600);   // 水平摩擦力（松手后减速停止，越大停得越快）

    this.physics.add.collider(this.player, groundGroup);
    this.physics.add.collider(this.enemies, groundGroup); // 敌人也要和地面碰撞

    // 投掷物碰到玩家 → 造成伤害（伤害值存在投掷物的 data 里）
    this.physics.add.overlap(this.player, this.projectiles, (_playerObj, projObj) => {
      const proj = projObj as Phaser.GameObjects.Arc;
      const knockDir = this.player.x < proj.x ? -1 : 1;
      const dmg = (proj.getData("damage") as number) || this.THROWER_PROJECTILE_DAMAGE;
      this.damagePlayer(dmg, knockDir * 150);
      proj.destroy();
    });

    // ===== 5. 相机 =====
    this.cameras.main.setBounds(0, 0, this.MAP_WIDTH, this.MAP_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ===== 6. 键盘 =====
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyJ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.keyK = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyL = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L);

    this.setupDoubleTap(this.keyA, () => this.startDash(false));
    this.setupDoubleTap(this.keyD, () => this.startDash(true));

    // ===== 7. 敌人（不同类型混搭 + BOSS） =====
    this.spawnEnemy(350, 432, 100, EnemyType.NORMAL);   // 普通近战怪
    this.spawnEnemy(700, 432, 120, EnemyType.CHARGER);  // 冲锋怪
    this.spawnEnemy(1100, 432, 80, EnemyType.THROWER);  // 远程投掷怪
    this.spawnEnemy(2000, 432, this.BOSS_HP, EnemyType.BOSS); // BOSS：赤焰魔君

    // ===== 8. HUD（已拆到 PlayerHud 模块，一行搞定） =====
    this.hud = new PlayerHud(this, this.skill1.mpCost, this.skill2.mpCost);
  }

  // ======================== 每帧更新 ========================

  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const { space } = this.cursors;

    // 死了就不响应任何输入
    if (this.isPlayerDead) return;

    // 胜利后也不响应输入
    if (this.isVictory) return;

    // ---- 冲刺结束 ----
    if (this.isDashing && this.time.now >= this.dashEndTime) {
      this.isDashing = false;
      body.setDragX(600);
    }

    // ---- 移动（攻击/冲刺/蓄力中不响应） ----
    if (!this.isDashing && !this.isAttacking && !this.skill2.isCasting) {
      if (this.keyA.isDown) body.setVelocityX(-this.MOVE_SPEED);
      else if (this.keyD.isDown) body.setVelocityX(this.MOVE_SPEED);
    }

    // ---- 跳跃 ----
    if (body.touching.down) this.jumpCount = 0;
    if (Phaser.Input.Keyboard.JustDown(space) && this.jumpCount < 2) {
      body.setVelocityY(this.JUMP_SPEED);
      this.jumpCount++;
    }

    // ---- 朝向 ----
    if (!this.isDashing && !this.isAttacking) {
      if (body.velocity.x !== 0) {
        const newFacing = body.velocity.x >= 0;
        if (newFacing !== this.facingRight) {
          this.facingRight = newFacing;
          drawPlayer(this.player, this.facingRight);
        }
      }
    }

    // ---- 连招超时重置 ----
    if (this.comboTimer !== null && this.time.now >= this.comboTimer) {
      this.comboStep = 0;
      this.comboTimer = null;
    }

    // ---- 攻击 ----
    this.handleAttackInput();

    // ---- 技能 ----
    this.handleSkillInput();

    // ---- MP 自然恢复（每秒 +5） ----
    // delta = 上一帧到这一帧的时间差(ms)
    this.playerMp = Math.min(this.PLAYER_MAX_MP, this.playerMp + this.MP_REGEN * (this.game.loop.delta / 1000));
    this.hud.updateMp(this.playerMp, this.PLAYER_MAX_MP);

    // ---- 更新敌人位置（血条跟随） ----
    this.updateEnemies();

    // ---- BOSS 血条刷新 ----
    this.bossHud.update(this.bossRef);

    // ---- 技能 CD 显示刷新 ----
    this.hud.updateSkillCd(this.time.now, this.playerMp, this.skill1.cooldownEnd, this.skill2.cooldownEnd);

    // ---- 胜利检测：所有敌人都死了 ----
    if (!this.isVictory) {
      const allDead = this.enemies.getChildren().every((obj) => {
        const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
        return !enemy?.alive;
      });
      if (allDead) {
        this.showVictory();
      }
    }
  }

  // ======================== 攻击系统 ========================

  /**
   * 检测 J 键输入，管理连招段数
   * 连招窗口内按 J → 下一段；超时或首次 → 从第一段开始
   */
  private handleAttackInput() {
    if (!Phaser.Input.Keyboard.JustDown(this.keyJ)) return;
    if (this.isAttacking) return;

    if (this.comboTimer === null || this.time.now >= this.comboTimer) {
      this.comboStep = 0;
    }
    this.comboStep++;
    if (this.comboStep > 3) this.comboStep = 1;

    this.performAttack(this.comboStep);
    this.comboTimer = this.time.now + this.ATTACK_WINDOW;
  }

  /**
   * 执行攻击：创建判定框 → 命中检测 → 特效 → 延时结束
   */
  private performAttack(step: number) {
    const i = step - 1;
    this.isAttacking = true;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);

    // 攻击判定框（面朝方向的半透明矩形）
    const range = this.COMBO_RANGE[i];
    const dir = this.facingRight ? 1 : -1;
    const hitX = this.player.x + dir * range;

    const hitbox = this.add.rectangle(hitX, this.player.y, 36, 48, 0xffff00, 0.25);
    hitbox.setStrokeStyle(1, 0xffff00, 0.4);
    this.physics.add.existing(hitbox);
    (hitbox.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    // 命中检测（用距离判定，比 physics.overlap 更可靠）
    // physics.overlap 在同一帧内创建物体并检测时可能不生效，
    // 因为物理引擎还没处理新创建的 hitbox。手动算距离就没这个问题。
    this.enemies.getChildren().forEach((obj) => {
      const enemyContainer = obj as Phaser.GameObjects.Container;
      const enemy = enemyContainer.getData("enemy") as Enemy;
      if (!enemy?.alive) return;

      const dx = enemyContainer.x - hitX;
      const dy = enemyContainer.y - this.player.y;
      // 水平距离 < 攻击判定框半宽 + 敌人体宽，垂直距离 < 两者半高之和
      if (Math.abs(dx) < 34 && Math.abs(dy) < 48) {
        this.damageEnemy(enemy, this.COMBO_DAMAGE[i], dir * this.COMBO_KNOCKBACK[i]);
      }
    });

    // 挥砍特效
    this.showSlashEffect(hitX, this.player.y, step);

    // 攻击结束后解除锁定
    this.time.delayedCall(this.ATTACK_DURATION, () => {
      this.isAttacking = false;
      hitbox.destroy();
    });
  }

  /**
   * 挥砍视觉特效（三段分别用不同颜色和大小）
   */
  private showSlashEffect(x: number, y: number, step: number) {
    const g = this.add.graphics();
    const colors = [0xffffff, 0xffdd44, 0xff4444];
    const sizes = [20, 26, 34];
    const size = sizes[step - 1];

    g.lineStyle(3, colors[step - 1], 0.8);
    g.strokeEllipse(0, 0, size * 2, size * 3);
    g.setPosition(x, y);

    this.tweens.add({
      targets: g,
      alpha: 0,
      scale: 1.4,
      duration: 150,
      onComplete: () => g.destroy(),
    });
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
    // 攻击/冲刺中不能放技能
    if (this.isAttacking || this.isDashing) return;

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
      facingRight: this.facingRight,
      enemies: this.enemies,
      damageEnemy: (enemy: Enemy, damage: number, knockbackX: number) =>
        this.damageEnemy(enemy, damage, knockbackX),
      setDash: (isDashing: boolean, endTime: number) => {
        this.isDashing = isDashing;
        this.dashEndTime = endTime;
      },
    };
  }



  // ======================== 敌人系统 ========================

  /**
   * 生成敌人（根据 type 画不同外观）
   * @param x     出生 X
   * @param y     出生 Y
   * @param maxHp 最大血量
   * @param type  敌人类型（默认 NORMAL）
   */
  private spawnEnemy(x: number, y: number, maxHp: number, type: EnemyType = EnemyType.NORMAL) {
    const container = this.add.container(x, y);
    const g = this.add.graphics();

    // ---- 根据类型画不同外观 ----
    switch (type) {
      case EnemyType.NORMAL: {
        // 普通怪：蓝灰色方块 + 小眼睛（原来的样子）
        g.fillStyle(0x4a5568, 1);
        g.fillRect(-16, -24, 32, 48);
        g.lineStyle(2, 0x718096);
        g.strokeRect(-16, -24, 32, 48);
        // 眼睛
        g.fillStyle(0xffffff, 1);
        g.fillCircle(-5, -12, 4);
        g.fillCircle(5, -12, 4);
        g.fillStyle(0x000000, 1);
        g.fillCircle(-4, -12, 2);
        g.fillCircle(6, -12, 2);
        break;
      }
      case EnemyType.CHARGER: {
        // 冲锋怪：绿色，宽扁，头上两个角（像野牛）
        g.fillStyle(0x48bb78, 1);
        g.fillRect(-20, -20, 40, 40);
        g.lineStyle(2, 0x2f855a);
        g.strokeRect(-20, -20, 40, 40);
        // 两只角（三角）
        g.fillStyle(0xe8d44d, 1);
        g.fillTriangle(-20, -20, -14, -20, -18, -32); // 左角
        g.fillTriangle(20, -20, 14, -20, 18, -32);   // 右角
        // 红色眼睛（凶狠）
        g.fillStyle(0xff4444, 1);
        g.fillCircle(-7, -8, 4);
        g.fillCircle(7, -8, 4);
        break;
      }
      case EnemyType.THROWER: {
        // 投掷怪：紫色，瘦高，手持法杖
        g.fillStyle(0x9b59b6, 1);
        g.fillRect(-12, -28, 24, 56);
        g.lineStyle(2, 0x7d3c98);
        g.strokeRect(-12, -28, 24, 56);
        // 法杖（一根竖线 + 顶部圆球）
        g.lineStyle(2, 0xe8d44d, 1);
        g.lineBetween(14, -20, 14, 20);
        g.fillStyle(0xe8d44d, 1);
        g.fillCircle(14, -24, 5);
        // 眼睛（蓝色，神秘）
        g.fillStyle(0x00e5ff, 1);
        g.fillCircle(-4, -16, 3);
        g.fillCircle(4, -16, 3);
        break;
      }
      case EnemyType.BOSS: {
        // BOSS（赤焰魔君）：暗红色大块 + 金色冠角 + 火焰眼睛
        // 身体（比其他怪大两倍）
        g.fillStyle(0xcc0000, 1);
        g.fillRect(-32, -40, 64, 80);
        g.lineStyle(3, 0x8b0000);
        g.strokeRect(-32, -40, 64, 80);
        // 金色肩甲
        g.fillStyle(0xe8d44d, 1);
        g.fillRect(-36, -30, 8, 20); // 左肩
        g.fillRect(28, -30, 8, 20);  // 右肩
        // 金色冠角（三只角，比冲锋怪更霸气）
        g.fillTriangle(-20, -40, -12, -40, -16, -58);  // 左角
        g.fillTriangle(0, -40, 0, -40, 0, -62);        // 中角（最高）
        g.fillTriangle(20, -40, 12, -40, 16, -58);     // 右角
        g.fillRect(-2, -62, 4, 22);                     // 中角柱体
        // 火焰眼睛（橙红发光）
        g.fillStyle(0xff6600, 1);
        g.fillCircle(-10, -20, 6);
        g.fillCircle(10, -20, 6);
        g.fillStyle(0xffff00, 1); // 瞳孔亮黄
        g.fillCircle(-10, -20, 3);
        g.fillCircle(10, -20, 3);
        // 胸口符文（X形）
        g.lineStyle(2, 0xe8d44d, 0.6);
        g.lineBetween(-15, -5, 15, 25);
        g.lineBetween(15, -5, -15, 25);
        break;
      }
    }
    container.add(g);

    // ---- 头顶血条 ----
    // BOSS 不需要头顶血条（用屏幕顶部的专用血条），但为了 damageEnemy 兼容还是创建
    const hpBarY = type === EnemyType.BOSS ? -50 : (type === EnemyType.THROWER ? -40 : -36);
    const hpBarW = type === EnemyType.BOSS ? 78 : 38; // BOSS 血条更宽
    const hpBarBg = this.add.rectangle(x, y + hpBarY, hpBarW + 2, 6, 0x333333);
    const hpBarFill = this.add.rectangle(x - hpBarW / 2, y + hpBarY, hpBarW, 4, 0x48bb78).setOrigin(0, 0.5);

    // BOSS 头顶血条默认隐藏（用屏幕顶部的）
    if (type === EnemyType.BOSS) {
      hpBarBg.setVisible(false);
      hpBarFill.setVisible(false);
    }

    // ---- 构建敌人数据 ----
    const enemy: Enemy = {
      container, hp: maxHp, maxHp, hpBarBg, hpBarFill, alive: true,
      type,
      patrolLeft: x - this.ENEMY_PATROL_RANGE,
      patrolRight: x + this.ENEMY_PATROL_RANGE,
      facingRight: true,
      state: EnemyState.PATROL,
      stateTimer: 0,
      windupIndicator: null,
      attackIndex: 0, // BOSS 攻击模式循环计数器
    };
    container.setData("enemy", enemy);

    // ---- 物理体 ----
    this.physics.add.existing(container);
    const body = container.body as Phaser.Physics.Arcade.Body;
    // 不同类型不同体型
    // BOSS 特殊处理：碰撞体和小怪一样高(48)，但视觉上大两倍
    // 这样 BOSS 和小怪站在同一地面上，不会出现高度差
    let bodyW: number, bodyH: number, bodyOffY: number;
    switch (type) {
      case EnemyType.BOSS:    bodyW = 64; bodyH = 48; bodyOffY = -24; break;
      case EnemyType.CHARGER: bodyW = 40; bodyH = 40; bodyOffY = -20; break;
      case EnemyType.THROWER: bodyW = 24; bodyH = 56; bodyOffY = -28; break;
      default:                bodyW = 32; bodyH = 48; bodyOffY = -24; break;
    }
    body.setSize(bodyW, bodyH);
    body.setOffset(-bodyW / 2, bodyOffY);
    body.setDragX(type === EnemyType.BOSS ? 200 : 400); // BOSS 击退后恢复更快
    body.setCollideWorldBounds(true);

    this.enemies.add(container);

    // ---- BOSS 特殊初始化 ----
    if (type === EnemyType.BOSS) {
      this.bossRef = enemy;
      this.bossHud = new BossHud(this, "赤焰魔君");
    }
  }

  private damageEnemy(enemy: Enemy, damage: number, knockbackX: number) {
    if (!enemy.alive) return;
    enemy.hp -= damage;

    const body = enemy.container.body as Phaser.Physics.Arcade.Body;

    if (enemy.type === EnemyType.BOSS) {
      // ---- BOSS 霸体：被打不中断攻击，只短暂硬直 + 少量击退 ----
      // 不打断前摇/攻击状态
      // 只在空闲（PATROL/COOLDOWN）时才进入短硬直
      if (enemy.state === EnemyState.PATROL || enemy.state === EnemyState.COOLDOWN) {
        enemy.state = EnemyState.HIT;
        enemy.stateTimer = this.time.now + this.BOSS_HIT_STAGGER; // 很短的硬直
        body.setVelocityX(knockbackX * 0.3); // 击退力度很小（BOSS很重）
      }
      // 攻击中完全不打断，也不击退
    } else {
      // ---- 普通怪：打断前摇 + 完整硬直 ----
      if (enemy.state === EnemyState.WINDUP && enemy.windupIndicator) {
        enemy.windupIndicator.destroy();
        enemy.windupIndicator = null;
      }
      enemy.state = EnemyState.HIT;
      enemy.stateTimer = this.time.now + 300;
      body.setVelocityX(knockbackX);
    }

    // 闪白（BOSS 闪红而不是变透明）
    this.tweens.add({
      targets: enemy.container,
      alpha: enemy.type === EnemyType.BOSS ? 0.6 : 0.3,
      duration: 60,
      yoyo: true,
      repeat: 1,
    });

    // 伤害飘字
    const dmgText = this.add.text(
      enemy.container.x, enemy.container.y - 40,
      `-${damage}`,
      { fontSize: "22px", color: "#ff4444", fontFamily: "Arial", fontStyle: "bold" }
    ).setOrigin(0.5);

    this.tweens.add({
      targets: dmgText,
      y: dmgText.y - 40,
      alpha: 0,
      duration: 600,
      onComplete: () => dmgText.destroy(),
    });

    this.updateEnemyHpBar(enemy);

    if (enemy.hp <= 0) {
      enemy.alive = false;
      this.killEnemy(enemy);
    }
  }

  private updateEnemyHpBar(enemy: Enemy) {
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    enemy.hpBarFill.width = 38 * ratio;
    enemy.hpBarFill.setFillStyle(ratio > 0.3 ? 0x48bb78 : 0xe53e3e);
  }

  /**
   * 每帧更新所有存活敌人：状态机 AI + 血条跟随
   *
   * 状态机：PATROL → WINDUP → ATTACKING/CHARGING/AIMING → COOLDOWN → PATROL
   *                        ↑ 被打断 → HIT → PATROL
   */
  private updateEnemies() {
    this.enemies.getChildren().forEach((obj) => {
      const enemy = (obj as Phaser.GameObjects.Container).getData("enemy") as Enemy;
      if (!enemy?.alive) return;

      const body = enemy.container.body as Phaser.Physics.Arcade.Body;
      const now = this.time.now;

      // 计算与玩家的水平距离和方向
      const dx = this.player.x - enemy.container.x;
      const distToPlayer = Math.abs(dx);

      switch (enemy.state) {
        // ---- 巡逻：散步/逼近，发现玩家就准备攻击 ----
        case EnemyState.PATROL: {
          if (enemy.type === EnemyType.BOSS) {
            // BOSS 不巡逻，始终慢步逼近玩家
            const dir = dx > 0 ? 1 : -1;
            enemy.facingRight = dir > 0;
            if (distToPlayer > 60) { // 距离太近就停下（准备攻击）
              body.setVelocityX(dir * this.BOSS_PATROL_SPEED);
            } else {
              body.setVelocityX(0);
            }
            // BOSS 感知范围很大
            if (distToPlayer < 400) {
              this.enemyStartWindup(enemy, dx);
            }
          } else {
            // 普通怪/冲锋怪/投掷怪：正常巡逻
            if (Math.abs(body.velocity.x) < 5) {
              if (enemy.facingRight) {
                body.setVelocityX(this.ENEMY_PATROL_SPEED);
                if (enemy.container.x >= enemy.patrolRight) enemy.facingRight = false;
              } else {
                body.setVelocityX(-this.ENEMY_PATROL_SPEED);
                if (enemy.container.x <= enemy.patrolLeft) enemy.facingRight = true;
              }
            }
            const detectRange = this.getDetectRange(enemy);
            if (distToPlayer < detectRange) {
              if (enemy.type === EnemyType.THROWER && distToPlayer < 80) {
                const retreatDir = dx > 0 ? -1 : 1;
                body.setVelocityX(retreatDir * this.THROWER_RETREAT_SPEED);
              } else {
                this.enemyStartWindup(enemy, dx);
              }
            }
          }
          break;
        }

        // ---- 前摇：站定不动，头顶提示，可被打断（BOSS不可打断） ----
        case EnemyState.WINDUP: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            this.enemyPerformAttack(enemy);
          }
          break;
        }

        // ---- 普通怪近战攻击 ----
        case EnemyState.ATTACKING: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.ENEMY_ATTACK_COOLDOWN;
          }
          break;
        }

        // ---- 冲锋（冲锋怪 / BOSS 通用） ----
        case EnemyState.CHARGING: {
          const chargeDir = enemy.facingRight ? 1 : -1;
          const chargeSpeed = enemy.type === EnemyType.BOSS
            ? this.BOSS_CHARGE_SPEED : this.CHARGER_CHARGE_SPEED;
          const chargeDmg = enemy.type === EnemyType.BOSS
            ? this.BOSS_CHARGE_DAMAGE : this.CHARGER_CHARGE_DAMAGE;
          const chargeKb = enemy.type === EnemyType.BOSS
            ? this.BOSS_CHARGE_KNOCKBACK : this.CHARGER_CHARGE_KNOCKBACK;
          const chargeCooldown = enemy.type === EnemyType.BOSS
            ? this.BOSS_COOLDOWN : this.CHARGER_COOLDOWN;

          body.setVelocityX(chargeDir * chargeSpeed);

          // 碰撞检测
          const hitDx = this.player.x - enemy.container.x;
          const hitDy = this.player.y - enemy.container.y;
          const hitRange = enemy.type === EnemyType.BOSS ? 50 : 36;
          if (Math.abs(hitDx) < hitRange && Math.abs(hitDy) < 48) {
            this.damagePlayer(chargeDmg, chargeDir * chargeKb);
          }

          if (now >= enemy.stateTimer) {
            body.setVelocityX(0);
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + chargeCooldown;
          }
          break;
        }

        // ---- 投掷怪瞄准中 ----
        case EnemyState.AIMING: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            this.throwerLaunchProjectile(enemy);
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.THROWER_COOLDOWN;
          }
          break;
        }

        // ---- BOSS 跳起中（在空中，不受地面物理影响） ----
        case EnemyState.BOSS_JUMP: {
          body.setVelocityX(0);
          // 跳砸逻辑由 bossJumpSlam 的 tween 控制
          // 这里只等状态结束
          if (now >= enemy.stateTimer) {
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.BOSS_COOLDOWN;
          }
          break;
        }

        // ---- BOSS 弹幕发射中 ----
        case EnemyState.BOSS_FIRE: {
          body.setVelocityX(0);
          if (now >= enemy.stateTimer) {
            enemy.state = EnemyState.COOLDOWN;
            enemy.stateTimer = now + this.BOSS_COOLDOWN;
          }
          break;
        }

        // ---- 冷却：等冷却完恢复巡逻 ----
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

      // ---- 血条跟随 ----
      const x = enemy.container.x;
      const y = enemy.container.y;
      const hpBarY = enemy.type === EnemyType.THROWER ? -40 : -36;
      enemy.hpBarBg.setPosition(x, y + hpBarY);
      enemy.hpBarFill.setPosition(x - 19, y + hpBarY);
      // 前摇感叹号跟随
      if (enemy.windupIndicator) {
        enemy.windupIndicator.setPosition(x, y - 52);
      }
    });
  }

  /** 根据敌人类型返回感知范围 */
  private getDetectRange(enemy: Enemy): number {
    switch (enemy.type) {
      case EnemyType.CHARGER: return this.CHARGER_DETECT_RANGE;
      case EnemyType.THROWER: return this.THROWER_DETECT_RANGE;
      default: return this.ENEMY_DETECT_RANGE;
    }
  }

  /**
   * 敌人进入前摇状态（感叹号 + 停顿）
   * BOSS 不可被打断（霸体），其他怪可打断
   */
  private enemyStartWindup(enemy: Enemy, dxToPlayer: number) {
    enemy.state = EnemyState.WINDUP;
    // 根据类型确定前摇时长
    let windupTime: number;
    if (enemy.type === EnemyType.BOSS) {
      // BOSS 根据当前攻击序号选择前摇时间
      const atk = enemy.attackIndex % 3;
      windupTime = atk === 0 ? this.BOSS_CHARGE_WINDUP
        : (atk === 1 ? this.BOSS_JUMP_WINDUP : this.BOSS_BARRAGE_WINDUP);
    } else if (enemy.type === EnemyType.CHARGER) {
      windupTime = this.CHARGER_CHARGE_WINDUP;
    } else if (enemy.type === EnemyType.THROWER) {
      windupTime = this.THROWER_AIM_TIME;
    } else {
      windupTime = this.ENEMY_ATTACK_WINDUP;
    }
    enemy.stateTimer = this.time.now + windupTime;
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

    enemy.windupIndicator = this.add.text(
      enemy.container.x, enemy.container.y - 52,
      indicatorText, {
        fontSize: enemy.type === EnemyType.BOSS ? "18px" : "24px",
        color: indicatorColor,
        fontFamily: "Arial", fontStyle: "bold",
        backgroundColor: "#00000088", padding: { x: 4, y: 2 },
      }
    ).setOrigin(0.5);

    this.tweens.add({
      targets: enemy.windupIndicator,
      alpha: 0.3,
      duration: 150,
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * 敌人执行攻击（根据类型走不同分支）
   */
  private enemyPerformAttack(enemy: Enemy) {
    // 移除前摇感叹号
    if (enemy.windupIndicator) {
      enemy.windupIndicator.destroy();
      enemy.windupIndicator = null;
    }

    switch (enemy.type) {
      case EnemyType.NORMAL: {
        // ---- 普通近战攻击 ----
        enemy.state = EnemyState.ATTACKING;
        enemy.stateTimer = this.time.now + this.ENEMY_ATTACK_DURATION;
        const dir = enemy.facingRight ? 1 : -1;
        const hitX = enemy.container.x + dir * this.ENEMY_ATTACK_RANGE;
        const dx = this.player.x - hitX;
        const dy = this.player.y - enemy.container.y;
        if (Math.abs(dx) < 34 && Math.abs(dy) < 48) {
          this.damagePlayer(this.ENEMY_ATTACK_DAMAGE, dir * this.ENEMY_ATTACK_KNOCKBACK);
        }
        // 红色弧线特效
        const g = this.add.graphics();
        g.lineStyle(3, 0xff6644, 0.7);
        g.strokeEllipse(0, 0, 30, 40);
        g.setPosition(hitX, enemy.container.y);
        this.tweens.add({
          targets: g, alpha: 0, scale: 1.3, duration: 150,
          onComplete: () => g.destroy(),
        });
        break;
      }

      case EnemyType.CHARGER: {
        // ---- 冲锋怪冲锋 ----
        enemy.state = EnemyState.CHARGING;
        enemy.stateTimer = this.time.now + this.CHARGER_CHARGE_DURATION;
        for (let i = 0; i < 3; i++) {
          const dust = this.add.circle(
            enemy.container.x + (Math.random() - 0.5) * 20,
            enemy.container.y + 15,
            4 + Math.random() * 3, 0xcccccc, 0.5
          );
          this.tweens.add({
            targets: dust, alpha: 0, y: dust.y - 15, duration: 300,
            onComplete: () => dust.destroy(),
          });
        }
        break;
      }

      case EnemyType.THROWER: {
        // ---- 投掷怪瞄准后投掷 ----
        enemy.state = EnemyState.AIMING;
        enemy.stateTimer = this.time.now + 200;
        const flash = this.add.circle(
          enemy.container.x + (enemy.facingRight ? 14 : -14),
          enemy.container.y - 24, 8, 0xe8d44d, 0.7
        );
        this.tweens.add({
          targets: flash, scale: 2, alpha: 0, duration: 200,
          onComplete: () => flash.destroy(),
        });
        break;
      }

      case EnemyType.BOSS: {
        // ---- BOSS 三种攻击循环 ----
        const atk = enemy.attackIndex % 3;
        enemy.attackIndex++; // 下次用下一种攻击

        switch (atk) {
          case 0: // 冲锋
            enemy.state = EnemyState.CHARGING;
            enemy.stateTimer = this.time.now + this.BOSS_CHARGE_DURATION;
            this.cameras.main.shake(100, 0.005); // 蓄力震屏
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

  /**
   * 投掷怪发射投掷物（法杖能量球飞向玩家）
   */
  private throwerLaunchProjectile(enemy: Enemy) {
    const dir = enemy.facingRight ? 1 : -1;
    const startX = enemy.container.x + dir * 14;
    const startY = enemy.container.y - 24;

    // 创建投掷物（紫色能量球）
    const proj = this.add.circle(startX, startY, 6, 0x9b59b6, 0.9);

    // 先加入物理组（组会自动创建物理体）
    this.projectiles.add(proj);
    proj.setData("damage", this.THROWER_PROJECTILE_DAMAGE); // 投掷怪伤害

    // 设置物理体属性
    const projBody = proj.body as Phaser.Physics.Arcade.Body;
    projBody.setAllowGravity(false);
    projBody.setSize(12, 12);

    // 计算飞行方向（朝向玩家当前位置）
    const aimDx = this.player.x - startX;
    const aimDy = this.player.y - startY;
    const dist = Math.sqrt(aimDx * aimDx + aimDy * aimDy) || 1;
    const speed = this.THROWER_PROJECTILE_SPEED;
    projBody.setVelocity((aimDx / dist) * speed, (aimDy / dist) * speed);

    // 内圈高光（跟随投掷物移动）
    const inner = this.add.circle(startX, startY, 3, 0xe8d44d, 0.7);
    this.tweens.add({
      targets: inner,
      duration: 3000,
      onUpdate: () => {
        if (proj.active) {
          inner.setPosition(proj.x, proj.y);
        } else {
          inner.destroy();
        }
      },
    });

    // 3秒后自动销毁（防止飞出地图卡住）
    this.time.delayedCall(3000, () => {
      if (proj.active) proj.destroy();
      if (inner.active) inner.destroy();
    });
  }

  // ======================== BOSS 专属攻击 ========================

  /**
   * BOSS 跳砸：跳起 → 滞空 → 砸落 → 左右冲击波
   * 跳起期间不受重力，用 Tween 控制 Y 坐标
   */
  private bossJumpSlam(enemy: Enemy) {
    enemy.state = EnemyState.BOSS_JUMP;
    const body = enemy.container.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false); // 跳起时关闭重力

    const origY = enemy.container.y;
    const dir = enemy.facingRight ? 1 : -1;
    // 跳跃目标：玩家附近（预判位置）
    const targetX = this.player.x;

    // 阶段1：跳起（300ms）
    this.tweens.add({
      targets: enemy.container,
      y: origY - this.BOSS_JUMP_HEIGHT,
      x: targetX, // 水平方向也移向玩家
      duration: 300,
      ease: "Power2",
      onComplete: () => {
        // 阶段2：滞空（200ms，给玩家反应时间）
        this.time.delayedCall(200, () => {
          // 阶段3：砸落（250ms）
          this.tweens.add({
            targets: enemy.container,
            y: origY, // 落回地面
            duration: 250,
            ease: "Bounce",
            onComplete: () => {
              // 恢复重力
              body.setAllowGravity(true);

              // 落点伤害判定
              const hitDx = Math.abs(this.player.x - enemy.container.x);
              const hitDy = Math.abs(this.player.y - enemy.container.y);
              if (hitDx < 60 && hitDy < 60) {
                this.damagePlayer(this.BOSS_JUMP_DAMAGE, dir * this.BOSS_JUMP_KNOCKBACK);
              }

              // 震屏
              this.cameras.main.shake(300, 0.015);

              // 左右冲击波（两个沿地面扩散的半透明矩形）
              this.bossShockwave(enemy.container.x, origY);

              // 冷却
              enemy.stateTimer = this.time.now + this.BOSS_COOLDOWN;
              enemy.state = EnemyState.COOLDOWN;
            },
          });
        });
      },
    });
  }

  /**
   * BOSS 跳砸落地的冲击波（左右各一个扩散矩形 + 粒子）
   */
  private bossShockwave(x: number, y: number) {
    // 左右冲击波
    [-1, 1].forEach((dir) => {
      const wave = this.add.rectangle(x, y - 10, 10, 30, 0xff4444, 0.7);
      this.tweens.add({
        targets: wave,
        x: x + dir * 200,
        width: 200,
        alpha: 0,
        duration: 400,
        ease: "Power2",
        onComplete: () => wave.destroy(),
      });

      // 冲击波也作为投掷物（能伤害玩家）
      const proj = this.add.circle(x, y - 10, 8, 0xff6644, 0.5);
      this.projectiles.add(proj);
      proj.setData("damage", this.BOSS_JUMP_DAMAGE); // 跳砸冲击波伤害
      const projBody = proj.body as Phaser.Physics.Arcade.Body;
      projBody.setAllowGravity(false);
      projBody.setVelocity(dir * this.BOSS_JUMP_SHOCKWAVE_SPEED, 0);
      this.time.delayedCall(500, () => { if (proj.active) proj.destroy(); });
    });

    // 落地碎石
    for (let i = 0; i < 6; i++) {
      const debris = this.add.rectangle(
        x + (Math.random() - 0.5) * 60, y,
        4 + Math.random() * 4, 4 + Math.random() * 4, 0x8b6914
      );
      this.tweens.add({
        targets: debris,
        y: y - 30 - Math.random() * 40,
        x: debris.x + (i % 2 === 0 ? 1 : -1) * (40 + Math.random() * 50),
        alpha: 0, angle: 360, duration: 500, ease: "Bounce",
        onComplete: () => debris.destroy(),
      });
    }
  }

  /**
   * BOSS 弹幕攻击：扇形发射多颗能量球
   */
  private bossBarrage(enemy: Enemy) {
    enemy.state = EnemyState.BOSS_FIRE;
    enemy.stateTimer = this.time.now + 800; // 发射持续时间

    const dir = enemy.facingRight ? 1 : -1;
    const startX = enemy.container.x + dir * 32;
    const startY = enemy.container.y - 20;

    // 扇形发射：5颗，角度从 -30° 到 +30°
    const count = this.BOSS_BARRAGE_COUNT;
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * 120, () => { // 每颗间隔120ms
        if (!enemy.alive) return; // BOSS 死了就不射了

        // 角度：以面朝方向为基准，扇形展开
        const spreadAngle = Phaser.Math.DegToRad(-30 + (60 * i / (count - 1)));
        const baseAngle = dir > 0 ? 0 : Math.PI; // 0=右, π=左
        const finalAngle = baseAngle + spreadAngle;

        const vx = Math.cos(finalAngle) * this.BOSS_BARRAGE_SPEED;
        const vy = Math.sin(finalAngle) * this.BOSS_BARRAGE_SPEED;

        // 创建弹幕（红色大能量球）
        const proj = this.add.circle(startX, startY, 8, 0xff4444, 0.9);
        this.projectiles.add(proj);
        proj.setData("damage", this.BOSS_BARRAGE_DAMAGE); // BOSS 弹幕伤害
        const projBody = proj.body as Phaser.Physics.Arcade.Body;
        projBody.setAllowGravity(false);
        projBody.setSize(16, 16);
        projBody.setVelocity(vx, vy);

        // 3秒后自动销毁
        this.time.delayedCall(3000, () => { if (proj.active) proj.destroy(); });
      });
    }
  }

  private killEnemy(enemy: Enemy) {
    this.tweens.add({
      targets: enemy.container,
      alpha: 0,
      angle: 360,
      y: enemy.container.y - 30,
      duration: 400,
      onComplete: () => {
        enemy.container.destroy();
        enemy.hpBarBg.destroy();
        enemy.hpBarFill.destroy();
      },
    });
  }

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

  // ======================== 冲刺 ========================

  private setupDoubleTap(key: Phaser.Input.Keyboard.Key, onDoubleTap: () => void) {
    let lastTapTime = 0;
    key.on("down", () => {
      const now = this.time.now;
      if (now - lastTapTime < this.DOUBLE_TAP_WINDOW) {
        onDoubleTap();
        lastTapTime = 0;
      } else {
        lastTapTime = now;
      }
    });
  }

  private startDash(toRight: boolean) {
    this.isDashing = true;
    this.facingRight = toRight;
    this.dashEndTime = this.time.now + this.DASH_DURATION;
    drawPlayer(this.player, this.facingRight);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(toRight ? this.DASH_SPEED : -this.DASH_SPEED);
    body.setDragX(0);
  }
}
